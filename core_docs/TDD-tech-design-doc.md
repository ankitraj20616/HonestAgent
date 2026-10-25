# Technical Design Document (TDD)
## fastauthz - authorization for FastAPI and SQLAlchemy

**Version:** 1.0 (draft)
**Date:** 2026-10-25
**Scope:** v1.0 (milestones M0-M5 in `TASKS.md`)
**What it does:** `FUNCTIONAL_SPECIFICATIONS.md` (FSD). **With what:** `TECH_STACK.md`.

> This file says HOW fastauthz is built. It is detailed on purpose. Code must match it.
> If the code needs to change the design, change this file in the same PR.
> Section numbers are stable. Tests and PRs can point at them ("TDD 6.3").

---

## 1. Overview

### 1.1 The problem in one paragraph
Every FastAPI app answers the question "can this user do this action on this thing?".
Today people answer it by hand: `if user.role != "admin": raise HTTPException(403)` in every
route, and `WHERE org_id = :org` added by hand to every list query. When one route or one query
forgets the check, data leaks. Django has `django-rules`, `django-guardian` and DRF permissions.
FastAPI has nothing in-process and maintained:
- `oso` (the open-source library that did exactly this, including SQLAlchemy filtering) is
  archived. Its README says "no longer maintained... there won't be new releases or bug fixes".
- `fastapi-permissions` (652 stars) has had no release since 2020-10-05.
- `casbin` uses string policy files and does not filter SQLAlchemy queries.
- Cerbos, OpenFGA and Permify need a separate server. Permit.io and Oso Cloud are paid.

Full evidence: `decisions/ADR-001-build-fastauthz.md`.

### 1.2 What fastauthz is
A Python library. You write your permission rules once, in plain Python, next to your models.
fastauthz then uses the same rules in three places:

1. **Check one object** - "can Alice edit post 7?" (in Python, in memory).
2. **Filter a list** - "give me only the posts Alice can read" (as a SQL `WHERE` clause).
3. **Guard a route** - a FastAPI dependency that loads the object and checks it in one query,
   or returns 404.

### 1.3 The central idea: one rule, two engines
A rule is not a Python function (a function cannot be turned into SQL). A rule is a small
**expression tree** built from `R` (the resource) and `A` (the actor):

```python
policy.allow(["edit", "delete"], Post, when=R.author_id == A.id)
```

`R.author_id == A.id` builds a tree: `Compare(op="eq", ResourceAttr("author_id"), ActorAttr("id"))`.
Two engines read the same tree:

| Engine | Input | Output | Used for |
|---|---|---|---|
| Python evaluator (`evaluate.py`) | actor + one object | `TRUE` / `FALSE` / `UNKNOWN` | `can()`, `check()`, objects not in a DB |
| SQL compiler (`sql.py`) | actor + model class | SQLAlchemy `ColumnElement[bool]` | `filter()`, `query()`, `load()` |

Both engines follow the **same truth rules** (SQL three-valued logic, section 6). A property-based
test (section 14.3) proves they agree on random rules and random rows. This agreement is the
main promise of the library.

### 1.4 What fastauthz is not (v1)
- Not authentication. It does not log users in or check passwords or tokens. You give it the
  current user (any Python object) through a FastAPI dependency you already have.
- Not a server, not a database, not a UI. A library imported by your app.
- Not a graph engine (Google Zanzibar style). Relationships are supported up to a fixed depth
  (section 5.6). Unlimited-depth trees are Later.

---

## 2. Design principles

1. **Default deny.** No matching allow rule means "no". A missing value means "no".
2. **Deny wins.** If any deny rule matches, the answer is "no", whatever the allow rules say.
3. **Fail closed.** Every unclear case ends in "no": missing actor attribute, `NULL` column,
   unknown truth value, error inside a custom check.
4. **Fail early.** Mistakes are found when the app starts, not when a user hits a route:
   unknown action names, unknown columns, cycles in roles, rules that cannot become SQL.
5. **One rule, two engines, same answer.** Python and SQL evaluation must agree. Tested.
6. **Plain Python.** No YAML, no DSL in strings, no policy files. Rules are Python objects, so
   editors autocomplete them and pyright checks them.
7. **Small core, optional extras.** The core (`policy`, `expr`, `evaluate`) has zero runtime
   dependencies. SQLAlchemy and FastAPI support are extras.
8. **No surprises with upgrades.** FastAPI and SQLAlchemy internals are touched only in
   `_compat.py`, and CI tests a version matrix (section 15). In June 2026 FastAPI 0.137 changed
   `router.routes` into a tree and silently broke slowapi, fastapi-utils and others. That must
   not happen to us.
9. **Immutable after start.** A policy is frozen when validated. A frozen policy is safe to share
   across threads, async tasks and free-threaded Python.
10. **Fast enough to forget about.** Rules are compiled once. Per request we only bind actor
    values. Targets are in section 16.

---

## 3. Package layout

```
src/fastauthz/
  __init__.py        # public API re-exports: Policy, R, A, ANYONE, AUTHENTICATED, errors
  _version.py        # __version__
  py.typed           # PEP 561 marker
  config.py          # all constants and defaults (no magic numbers elsewhere)
  errors.py          # exception classes (section 11)
  expr.py            # expression tree: R, A, nodes, operators (section 5)
  truth.py           # Truth enum and Kleene logic (section 6)
  evaluate.py        # Python evaluator (section 7)
  roles.py           # role hierarchy (section 8.3)
  policy.py          # Policy, Resource, Rule, validate(), freeze() (section 8)
  decision.py        # Decision, Explanation, explain() (section 10)
  sql.py             # SQLAlchemy compiler and partial evaluation (section 9)   [extra: sqlalchemy]
  fastapi.py         # FastAuthz, dependencies, error handlers (section 12)   [extra: fastapi]
  openapi.py         # adds permissions to the OpenAPI schema (section 12.6)   [extra: fastapi]
  _compat.py         # the only place that touches FastAPI / SQLAlchemy internals
  testing.py         # test helpers for users (section 13)
  cli.py             # `fastauthz` command: check, matrix, explain, version (section 13.4)
  __main__.py        # `python -m fastauthz` -> cli.main()

tests/
  unit/              # one file per module
  property/          # Hypothesis differential tests (section 14.3)
  integration/       # FastAPI apps with SQLite and PostgreSQL
  compat/            # version-matrix contract tests for _compat.py
  typing/            # pyright `assert_type` checks for the public API
  examples/          # runs every example app in examples/
examples/
  blog/              # owner-based rules (author can edit own posts)
  saas_multitenant/  # tenant scope + roles per organisation
  hospital/          # relationships (doctor -> ward -> patient), deny rules
docs/                # user docs site (MkDocs)
benchmarks/          # pytest-benchmark suites (section 16)
```

**Import rule:** `expr`, `truth`, `evaluate`, `roles`, `policy`, `decision`, `errors`,
`config` must never import `sqlalchemy` or `fastapi`. A test (`tests/unit/test_imports.py`)
imports the core in a subprocess with both packages blocked and checks it works.

---

## 4. Public API at a glance

```python
from fastauthz import Policy, R, A, ANYONE
from fastauthz.fastapi import FastAuthz

policy = Policy(scope=R.org_id == A.org_id)          # tenant isolation for every resource

policy.roles({"admin": ["editor"], "editor": ["viewer"]})

policy.resource(Post, actions=["read", "create", "edit", "delete", "publish"])
policy.resource(Org, actions=["read", "manage"], scope=R.id == A.org_id)

policy.allow("read", Post, who=ANYONE, when=R.published.is_(True), bypass_scope=True)   # public posts
policy.allow("read", Post, roles=["viewer"])
policy.allow(["edit", "delete"], Post, when=R.author_id == A.id)
policy.allow("*", Post, roles=["admin"])
policy.deny("delete", Post, when=R.locked.is_(True))

authz = FastAuthz(policy, actor=get_current_user, session=get_session)
authz.install(app)                                    # error handlers + OpenAPI docs


@app.get("/posts")
async def list_posts(stmt: Annotated[Select[tuple[Post]], Depends(authz.query(Post, "read"))],
                     session: SessionDep):
    return (await session.scalars(stmt.limit(50))).all()


@app.patch("/posts/{post_id}")
async def edit_post(post: Annotated[Post, Depends(authz.load(Post, "edit"))], body: PostUpdate):
    ...


@app.post("/posts")
async def create_post(_: Annotated[None, Depends(authz.require("create", Post))], body: PostCreate):
    ...
```

Plain Python use (no FastAPI):

```python
policy.freeze()
policy.can(alice, "edit", post)              # -> bool
policy.check(alice, "edit", post)            # -> None, or raises Denied
policy.filter(alice, "read", Post)           # -> ColumnElement[bool]   (needs [sqlalchemy])
policy.explain(alice, "edit", post)          # -> Explanation (why yes / why no)
```

---

## 5. Expression tree (`expr.py`)

### 5.1 Node types
All nodes are frozen `@dataclass(frozen=True, slots=True)` classes. They are hashable, so the
compiler can cache by node.

| Node | Fields | Built by |
|---|---|---|
| `ResourceAttr` | `path: tuple[str, ...]` | `R.author_id`, `R.project.org_id` |
| `ActorAttr` | `path: tuple[str, ...]` | `A.id`, `A.org.id` |
| `Literal` | `value: LiteralValue` | any plain value on the other side of an operator |
| `Compare` | `op: CompareOp, left: Operand, right: Operand` | `==`, `!=`, `<`, `<=`, `>`, `>=` |
| `In` | `item: Operand, options: Operand, negate: bool` | `.in_(x)`, `.not_in(x)` |
| `Is` | `item: Operand, value: None \| bool, negate: bool` | `.is_(None)`, `.is_not(True)` |
| `And` | `items: tuple[Expr, ...]` | `a & b` |
| `Or` | `items: tuple[Expr, ...]` | `a \| b` |
| `Not` | `item: Expr` | `~a` |
| `Related` | `path: tuple[str, ...], kind: "any" \| "has", where: Expr` | `R.members.any(...)`, `R.project.has(...)` |
| `Const` | `value: Truth` | `TRUE_`, `FALSE_` (and results of folding) |

`Operand = ResourceAttr | ActorAttr | Literal`. `Expr = Compare | In | Is | And | Or | Not | Related | Const`.

`CompareOp` is a `StrEnum`: `eq, ne, lt, le, gt, ge`.

`LiteralValue` is one of: `None, bool, int, float, str, bytes, Decimal, UUID, date, datetime,
time, Enum`, or a `tuple` / `frozenset` of these (only inside `In`). Lists passed by users are
turned into tuples. Any other type raises `ExpressionError` at build time.

### 5.2 The `R` and `A` builders
`R` and `A` are singletons of a small `_Ref` class:

- `__getattr__(name)` returns a new ref with `path + (name,)`. Names starting with `_` raise
  `ExpressionError` (protects dunder lookups and private columns from typos).
- Operators (`__eq__`, `__ne__`, `__lt__`, ...) return `Compare` nodes.
- `.in_()`, `.not_in()`, `.is_()`, `.is_not()` return `In` / `Is` nodes.
- `.any(where=None, **eq)` and `.has(where=None, **eq)` return `Related`.
  - `R.members.any(user_id=A.id, role="editor")` is short for
    `R.members.any((R.user_id == A.id) & (R.role == "editor"))`.
  - Inside `.any()` / `.has()`, `R` means **the related row**, not the outer resource.
- `__bool__` raises `ExpressionError("use & | ~ instead of and/or/not")`. This catches
  `when=R.a == 1 and R.b == 2`, which would silently drop the first part.
- `__hash__` is defined (needed because `__eq__` is overloaded).

### 5.3 Combining
- `a & b` -> `And((a, b))`, flattened: `And((a, And((b, c))))` becomes `And((a, b, c))`.
- `a | b` -> `Or(...)`, flattened the same way.
- `~a` -> `Not(a)`; `~~a` simplifies to `a`.
- Python operator precedence: `&` binds tighter than `==`. So users must write
  `(R.a == 1) & (R.b == 2)`. Docs say this loudly. `__bool__` raising catches most mistakes.
  `fastauthz check` also warns about `Compare` nodes whose operand is an `And`/`Or` node.

### 5.4 Allowed shapes
- Each `Compare` / `In` / `Is` must have **at least one** `ResourceAttr` or `ActorAttr`.
  `Literal == Literal` raises at build time (it is always constant and is probably a mistake).
- `ActorAttr op ActorAttr` is allowed (e.g. `A.is_staff.is_(True)`). It is folded before SQL.
- `In.options` must be a `Literal` tuple or an `ActorAttr` (an actor list such as
  `R.org_id.in_(A.org_ids)`). `ResourceAttr` in `options` raises (`ExpressionError`) - it has no
  clean SQL form in v1.

### 5.5 Paths
- `ResourceAttr.path` of length 1 is a column on the resource model.
- Length 2+ walks **many-to-one** relationships: `R.project.org_id` means
  "the `org_id` of this post's project". SQL uses `has()` (section 9.4).
- One-to-many and many-to-many relationships cannot be walked with dots. They need
  `.any()` (there can be many rows). `validate()` checks this (section 8.5).
- `ActorAttr.path` is read with `getattr` step by step, or `dict[key]` if the value is a
  `Mapping`. Any missing step gives `MISSING` (section 6.2).

### 5.6 Depth limit
- The number of relationship hops in one path, plus the nesting of `Related` nodes, must be
  `<= config.MAX_RELATION_DEPTH` (default `3`).
- Reason: each hop is one SQL `EXISTS` subquery. Deep chains get slow. A limit keeps queries
  predictable.

### 5.7 Escape hatch: custom checks
Some rules cannot be expressed as a tree (for example "the post's text passes a spam check").

```python
policy.allow("publish", Post, check=lambda actor, post: spam_score(post.body) < 0.5)
policy.allow("read", Doc, check=is_shared_with, sql=shared_with_sql)
```

- `check: Callable[[Actor, Resource], bool]` runs in Python only.
- `sql: Callable[[Actor, type[Resource]], ColumnElement[bool]]` is an optional SQL twin.
- A rule with `check` and no `sql` is **not filterable**. Using `filter()`, `query()` or
  `load()` on an action that has a non-filterable rule raises `NotFilterableError` **when the
  dependency is created** (app start), not per request.
- If `check` raises any exception, the result is `UNKNOWN` (fail closed) and the exception is
  logged at WARNING with the rule name. It is never swallowed silently.
- If both `check` and `sql` are given, users should prove they agree with
  `fastauthz.testing.assert_filter_consistent` (section 13.2).

---

## 6. Truth values and logic (`truth.py`)

### 6.1 Why three values
SQL uses three-valued logic: a comparison with `NULL` is `NULL` ("unknown"), not `FALSE`.
`WHERE` keeps a row only if the condition is `TRUE`. If the Python engine used two values, the
engines would disagree on `NULL` columns and on negation. Worse, `~(R.owner_id == A.id)` with a
missing `A.id` would become `TRUE` in Python and open access. So the Python engine uses the
same three values as SQL.

```python
class Truth(Enum):
    TRUE = 1
    FALSE = 0
    UNKNOWN = -1
```

### 6.2 MISSING
`MISSING` is a sentinel for "this value does not exist". It is produced when:
- the actor is `None` (anonymous user) and the rule reads `A.<anything>`;
- an actor attribute does not exist (`getattr` raises `AttributeError`, or the key is not in a dict);
- a resource relationship is not loaded (lazy-load guard, section 7).

A Python `None` value (attribute exists, value is `None`) is treated like SQL `NULL`. For
comparisons, `MISSING` and `None` behave the same: they give `UNKNOWN`. The difference matters
only for `Is` (6.3).

**NO_ROW.** When a dotted resource path goes through a many-to-one relationship that is `None`
(`post.project is None` while reading `R.project.org_id`), the value is `NO_ROW`. SQL turns this
path into `Post.project.has(...)`, and `has()` is `FALSE` when there is no related row. So any
`Compare` / `In` / `Is` that reads a `NO_ROW` path is `FALSE` (not `UNKNOWN`). This keeps the
two engines equal, also under `NOT`.

**Order of checks** for one `Compare` / `In` / `Is` (Python engine; `fold` gives the same result):
1. A non-resource operand (actor value or literal) is `None` or `MISSING` -> `UNKNOWN`
   (for `Is` on an actor value, use the `Is` table).
2. The resource path is `NO_ROW` -> `FALSE`.
3. The resource value is `MISSING` -> `UNKNOWN`.
4. The resource value is `None` -> `UNKNOWN` (for `Is`, use the `Is` table).
5. Otherwise compare the values.

### 6.3 Truth tables
Comparisons (`Compare`, `In`):

| Case | Result |
|---|---|
| `In` with **empty** options | `FALSE` (`not_in`: `TRUE`), whatever the item is. Same as SQLAlchemy's empty-IN rendering. Checked before the rows below. |
| either side is `None` or `MISSING` | `UNKNOWN` (see the order of checks in 6.2) |
| `In` with options containing `None`, item not found among the non-`None` options | `UNKNOWN` (SQL behavior) |
| `not_in` | `NOT` of `in_` with the same options (Kleene), except the empty case above |
| values of types that cannot be compared (`TypeError`) | `UNKNOWN`, logged at DEBUG |
| otherwise | `TRUE` or `FALSE` |

`Is`:

| Expression | Value is `None` | Value is `MISSING` | Value is `True` | Value is `False` | Other |
|---|---|---|---|---|---|
| `x.is_(None)` | `TRUE` | `UNKNOWN` | `FALSE` | `FALSE` | `FALSE` |
| `x.is_(True)` | `FALSE` | `UNKNOWN` | `TRUE` | `FALSE` | `FALSE` |
| `x.is_(False)` | `FALSE` | `UNKNOWN` | `FALSE` | `TRUE` | `FALSE` |

`is_not` is `Not(is_(...))` with the same table. `MISSING` gives `UNKNOWN`, never `TRUE`. So a
rule like `A.banned_at.is_(None)` does not let in an anonymous user.

`And`, `Or`, `Not` use Kleene logic (same as SQL):

| a | b | a AND b | a OR b | NOT a |
|---|---|---|---|---|
| T | T | T | T | F |
| T | F | F | T | F |
| T | U | U | T | F |
| F | F | F | F | T |
| F | U | F | U | T |
| U | U | U | U | U |

### 6.4 Final decision
`final = allow_expr AND NOT deny_expr`. Access is granted **only if `final` is `TRUE`**.
`FALSE` and `UNKNOWN` both mean "no".

Check of the fail-closed cases:
- Allow rule `UNKNOWN` -> `final` is `UNKNOWN` or `FALSE` -> no.
- Deny rule `UNKNOWN` -> `NOT UNKNOWN = UNKNOWN` -> `final` is not `TRUE` -> no.
  (An unclear deny blocks access. This is on purpose.)
- SQL behaves the same: `WHERE allow AND NOT deny` drops rows where the result is `NULL`.

---

## 7. Python evaluator (`evaluate.py`)

```python
def evaluate(expr: Expr, actor: object | None, resource: object | None) -> Truth: ...
```

- A plain recursive function with one `match` statement over node types. No classes with
  `evaluate()` methods: the logic stays in one place and is easy to compare with `sql.py`.
- `ResourceAttr` reads `resource` with the same `getattr`/`Mapping` walk as actors (5.5).
- `Related(kind="any")`: reads the collection (`post.members`). For each item, evaluates
  `where` with the item as the resource. Result: `TRUE` if any item gives `TRUE`; else
  `UNKNOWN` if any gives `UNKNOWN`; else `FALSE`. An empty collection gives `FALSE`. A
  `MISSING` collection gives `UNKNOWN`.
- `Related(kind="has")`: reads the single related object and evaluates `where` on it. A `None`
  object gives `FALSE` (SQL `has()` on a `NULL` foreign key matches no row). `MISSING` gives
  `UNKNOWN`.
- `And` / `Or` short-circuit: `And` stops at the first `FALSE`, `Or` at the first `TRUE`.
  The result is the same as the full Kleene table, only faster.
- **Lazy loading guard:** on an SQLAlchemy object, reading an unloaded relationship can start
  a lazy load (and in async code it raises `MissingGreenlet`). `evaluate()` does not load
  anything. Before reading a relationship attribute it calls `_compat.is_loaded(obj, name)`.
  If the relationship is not loaded, the value is `MISSING` (-> `UNKNOWN` -> deny), and a
  WARNING suggests using `load()` / `filter()` (SQL) or eager loading.
  This is why the FastAPI `load()` dependency always uses SQL, never Python, for DB objects.

---

## 8. Policy (`policy.py`)

### 8.1 Objects

```python
@dataclass(frozen=True, slots=True)
class Rule:
    name: str                         # e.g. "Post.edit#2" or the user's name=...
    effect: Literal["allow", "deny"]
    actions: frozenset[str]           # {"edit", "delete"} or {"*"}
    resource: type
    who: Who                          # AUTHENTICATED (default) or ANYONE
    roles: frozenset[str] | None      # None = any role
    when: Expr | None                 # None = always TRUE
    check: Callable | None
    sql: Callable | None
    bypass_scope: bool                # allow rules only
    source: str                       # "file.py:42" where the rule was defined (for errors and explain)


@dataclass(frozen=True, slots=True)
class ResourceSpec:
    model: type
    actions: frozenset[str]
    scope: Expr | None                # None = no scope for this resource (explicit)
    id_column: str                    # default "id"
```

`Policy` holds `resources: dict[type, ResourceSpec]`, `rules: list[Rule]`, a `RoleGraph`, the
default scope, and config hooks:

```python
Policy(
    scope: Expr | None = None,                       # default scope for every resource
    actor_roles: Callable[[Actor], Iterable[str]] = default_actor_roles,   # getattr(actor, "roles", ())
    actor_id: Callable[[Actor], object] = default_actor_id,                # getattr(actor, "id", None)
)
```

### 8.2 Methods (all return `self` where it makes sense, so calls can chain)
- `resource(model, *, actions, scope=INHERIT, id_column="id")`
  - `scope=INHERIT` (default) uses the policy's default scope.
  - `scope=None` means "no scope". Allowed, but `fastauthz check` lists it as a notice so a
    reviewer sees which resources are not tenant-scoped.
- `allow(actions, resource, *, who=AUTHENTICATED, roles=None, when=None, check=None, sql=None, bypass_scope=False, name=None)`
- `deny(actions, resource, *, who=ANYONE, roles=None, when=None, check=None, sql=None, name=None)`
  - Deny defaults to `who=ANYONE` so a deny also covers anonymous users.
  - Deny rules have no `bypass_scope` and are **not** combined with the scope (a deny applies
    everywhere).
- `roles(mapping)`: role -> list of roles it includes (8.3).
- `validate() -> list[PolicyProblem]`: finds all problems, does not raise.
- `freeze()`: runs `validate()`, raises `PolicyError` listing **every** error if any, then makes
  the policy read-only. Further `allow()` calls raise `PolicyFrozenError`. Calling `freeze()`
  twice is fine (no-op).
- `can / check / filter / explain`: need a frozen policy. If not frozen they call `freeze()`
  first (first-use freeze), so small scripts just work.

### 8.3 Roles (`roles.py`)
- `policy.roles({"admin": ["editor"], "editor": ["viewer"]})` means admin includes editor,
  editor includes viewer.
- `RoleGraph.expand(roles) -> frozenset[str]` returns the roles plus everything they include
  (transitive). Computed once per role set and cached (`functools.lru_cache` on a frozenset key;
  `maxsize=config.ROLE_CACHE_SIZE`).
- Cycles (`a -> b -> a`) are an error in `validate()`.
- A role used in a rule but not defined anywhere is an error (catches typos like `"admn"`).
  Roles that appear only on actors are not checked (we cannot know them at start time).
- A rule with `roles=["viewer"]` matches if `expand(actor_roles(actor))` contains `"viewer"`.
- Roles are global in v1 (one set per actor). Per-organisation roles are written with
  relationships: `R.org.members.any(user_id=A.id, role="editor")` (example in `examples/saas_multitenant`).

### 8.4 Building the condition for (action, resource)
For a resource type and an action, `policy._condition(action, model)` returns one tree:

```
allow_part = OR over allow rules matching (action or "*") on model:
                 who_part AND roles_part AND when AND (scope unless bypass_scope)
deny_part  = OR over deny rules matching (action or "*") on model:
                 who_part AND roles_part AND when
condition  = allow_part AND NOT deny_part
```

- `who_part`: `AUTHENTICATED` -> `ActorPresent()` (a tiny internal node: `TRUE` if actor is not
  `None`, else `FALSE`). `ANYONE` -> `TRUE_`.
- `roles_part`: `RolesMatch(frozenset)`, an internal actor-only node.
- No allow rules -> `allow_part = FALSE_`. No deny rules -> `deny_part = FALSE_`.
- Custom `check` rules become an internal `CustomCheck(rule)` node (Python only).
- The result is cached per `(model, action)` after `freeze()`. The tree does not depend on the
  actor, so one tree serves every request.
- **Scope and anonymous users.** A scope that reads the actor (`R.org_id == A.org_id`) is
  `UNKNOWN` for an anonymous actor, so it blocks every scoped allow rule for them. This is
  correct for tenant data. A truly public rule (`who=ANYONE`) on a scoped resource therefore
  needs `bypass_scope=True`. `validate()` warns about this case (FA016).
- `require()` (12.4) builds the same tree **without** the scope, because there is no row yet.
  Tenant checks for a new object are done on the built object (`guard.check`).

### 8.5 `validate()` checks
Each problem has a code, a message, and the rule's `source` location.

| Code | Level | Problem |
|---|---|---|
| FA001 | error | Rule uses an action not declared on the resource. |
| FA002 | error | Rule targets a resource not declared with `resource()`. |
| FA003 | error | `R.<path>` does not exist on the model (column or relationship). (Needs SQLAlchemy; skipped for plain classes.) |
| FA004 | error | A dotted path walks a one-to-many / many-to-many relationship (use `.any()`). |
| FA005 | error | Relationship depth over `MAX_RELATION_DEPTH`. |
| FA006 | error | Role cycle. |
| FA007 | error | Rule uses an undefined role. |
| FA008 | error | Scope references a column that the resource does not have. Fix: set `scope=None` or a custom scope on that resource. |
| FA009 | warning | Allow rule with `who=ANYONE` and no `when` (everyone, even anonymous, can do this). |
| FA010 | warning | Action declared but no allow rule (nobody can ever do it). |
| FA011 | warning | Rule can never match (for example `when` folds to `FALSE`). |
| FA012 | notice | Resource has `scope=None`. |
| FA013 | notice | Action has a non-filterable rule (`check` without `sql`). |
| FA014 | warning | `Compare` with an `And`/`Or` operand (probably missing parentheses, 5.3). |
| FA015 | warning | `== None` or `!= None` (always `UNKNOWN`, so never matches). Use `.is_(None)` / `.is_not(None)`. |
| FA016 | warning | Allow rule with `who=ANYONE` on a resource whose scope reads `A`, without `bypass_scope=True`. Anonymous users can never match it (8.4). |

Warnings and notices never stop `freeze()`. `fastauthz check --strict` turns warnings into errors.

---

## 9. SQL compiler (`sql.py`)

### 9.1 Entry point
```python
def compile_filter(policy: Policy, actor: object | None, action: str, model: type) -> ColumnElement[bool]:
    tree = policy._condition(action, model)            # cached, actor-free
    folded = fold(tree, actor)                         # 9.2: bind actor values, simplify
    return to_sql(folded, model)                       # 9.3
```

### 9.2 Partial evaluation (`fold`)
Everything that depends only on the actor is evaluated **in Python, before SQL**:
- `ActorAttr` -> `Literal(value)` (or `Literal(MISSING)`).
- `ActorPresent`, `RolesMatch` -> `Const(TRUE / FALSE)`.
- `Compare` / `In` / `Is` with no `ResourceAttr` left -> evaluated to `Const` with the rules of
  section 6.
- `Compare` with a `MISSING` or `None` literal on one side -> `Const(UNKNOWN)` (same as SQL,
  but without sending `= NULL` to the database).
- `And` / `Or` / `Not` simplified with Kleene rules: `TRUE AND x -> x`, `FALSE AND x -> FALSE`,
  `FALSE OR x -> x`, `TRUE OR x -> TRUE`, `UNKNOWN AND FALSE -> FALSE`, `NOT TRUE -> FALSE`, and
  so on. Duplicates inside one `And`/`Or` are removed (nodes are hashable).

Result: an admin's filter is often just `TRUE`, and an anonymous user's is often `FALSE`, so
the database does no extra work. This is the same idea oso called "partial evaluation".

`CustomCheck` nodes: if the rule has `sql=`, it is replaced by `SqlFragment(rule.sql(actor, model))`.
Without `sql=`, `fold` raises `NotFilterableError` (but this is normally caught earlier, when the
dependency is created, 5.7).

### 9.3 Turning nodes into SQLAlchemy
| Node | SQLAlchemy |
|---|---|
| `Const(TRUE)` | `sa.true()` |
| `Const(FALSE)` | `sa.false()` |
| `Const(UNKNOWN)` | `sa.null()` cast to Boolean: `sa.cast(sa.null(), sa.Boolean)` |
| `ResourceAttr((col,))` | `getattr(model, col)` (an `InstrumentedAttribute`) |
| `Literal(v)` | `sa.bindparam(None, v, unique=True)` (always a bound parameter, never inlined text) |
| `Compare(eq, a, b)` | `a == b` (and `!=`, `<`, ... the same way) |
| `In(item, options)` | `item.in_(options)` / `item.not_in(options)`; empty options -> `sa.false()` / `sa.true()` |
| `Is(item, None)` | `item.is_(None)`; `Is(item, True)` -> `item.is_(sa.true())` |
| `And(items)` | `sa.and_(*items)` |
| `Or(items)` | `sa.or_(*items)` |
| `Not(item)` | `sa.not_(item)` |
| `SqlFragment(el)` | `el` as given |

`Literal(v)` values are always bound parameters. User or actor data never becomes SQL text,
so SQL injection through policy values is impossible by construction.

### 9.4 Relationships
- `ResourceAttr(("project", "org_id"))` on `Post` ->
  `Post.project.has(Project.org_id == <rhs>)`. The comparison is pushed inside `has()`.
  For longer paths, `has()` calls are nested.
- `Related(("members",), "any", where)` -> `Post.members.any(to_sql(where, Member))`, where
  `Member` is the relationship's target class (`_compat.relationship_target(Post, "members")`).
- `Related(..., "has", where)` -> `Post.owner.has(to_sql(where, User))`.
- No related row means `has()` is `FALSE`. The Python engine matches this with `NO_ROW` (6.2).
- SQLAlchemy turns `has()` / `any()` into correlated `EXISTS` subqueries. They do not add
  rows to the outer query, so `LIMIT` / pagination stay correct (no duplicate rows, unlike
  joins).

### 9.5 Sync and async
The compiler only builds expressions. It does not run queries, so it is the same for `Session`
and `AsyncSession`. Running queries happens in `fastapi.py` (12.3).

### 9.6 What we verify about the SQL
- Every operator on SQLite and PostgreSQL (integration tests).
- The differential property test (14.3) runs the compiled filter on real tables and compares
  with the Python evaluator for every row.
- Snapshot tests of the compiled SQL text (with `literal_binds` off) for each example policy,
  so a change in the generated SQL is visible in review.

---

## 10. Decisions, logging and explain (`decision.py`)

### 10.1 Decision
```python
@dataclass(frozen=True, slots=True)
class Decision:
    allowed: bool
    action: str
    resource_type: str                 # model.__name__
    resource_id: object | None         # None for list filters and require()
    actor_id: object | None            # from policy.actor_id(actor); never the whole actor
    kind: Literal["check", "filter", "load", "require"]
    matched_rules: tuple[str, ...]     # names of allow rules that were TRUE (check only)
    denied_by: tuple[str, ...]         # names of deny rules that were TRUE or UNKNOWN (check only)
    duration_us: int
```

- `FastAuthz(on_decision=callback)` calls the callback for every decision. Errors inside the
  callback are logged and never change the decision.
- The logger `fastauthz.decisions` logs at DEBUG by default, INFO for denies if
  `config.LOG_DENIES_AT_INFO` is `True`.
- Decisions hold **ids only**, never actor or resource objects, so logs do not leak personal
  data. This helps with privacy laws (GDPR, India's DPDP) that ask for access logs.
- For `filter` and `load`, `matched_rules` is empty (the database decides per row; we cannot
  know which rule matched without extra queries).

### 10.2 Explain
`policy.explain(actor, action, obj) -> Explanation` evaluates every rule for that
(action, resource) separately and returns:

```
Explanation(allowed=False, rules=[
    RuleResult(name="Post.edit#1", effect="allow", result=FALSE,   because="R.author_id (7) == A.id (3) is FALSE", source="authz.py:21"),
    RuleResult(name="Post.*#3",    effect="allow", result=FALSE,   because="role 'admin' not in actor roles {'viewer'}",  source="authz.py:23"),
    RuleResult(name="Post.delete#4", effect="deny", result=UNKNOWN, because="R.locked is None (UNKNOWN)", source="authz.py:24"),
])
```

- `Explanation.__str__` prints this as a readable table. It is meant for debugging and tests,
  not for end users (it shows values).
- `explain` uses the Python engine only. For DB objects it needs the relationships it reads to
  be loaded (7, lazy loading guard); otherwise it shows `MISSING`.

---

## 11. Errors (`errors.py`)

```
FastAuthzError                    # base class
├── ExpressionError               # bad rule expression (built at import time)
├── PolicyError                   # freeze() found errors; .problems: list[PolicyProblem]
├── PolicyFrozenError             # changing a frozen policy
├── UnknownResourceError          # resource type not declared
├── UnknownActionError            # action not declared for the resource
├── NotFilterableError            # filter/query/load on a rule with check= but no sql=
└── Denied                        # access denied; .decision: Decision
```

- `Denied` is raised by `check()`. It carries the `Decision`, never the explanation (no values
  leak through error messages).
- The FastAPI layer turns `Denied` into HTTP 403 or 404 (12.5). All other errors are bugs in the
  app's policy and surface as 500 during development, or at start time.

---

## 12. FastAPI integration (`fastapi.py`, `openapi.py`)

### 12.1 FastAuthz object
```python
FastAuthz(
    policy: Policy,
    *,
    actor: Callable[..., Any],              # a FastAPI dependency that returns the current user (or None)
    session: Callable[..., Any] | None,     # a FastAPI dependency that returns Session or AsyncSession
    deny_status: Literal[403, 404] = 404,   # for load(); require()/check() always use 403
    on_decision: Callable[[Decision], None] | None = None,
)
```
- The constructor calls `policy.freeze()`. Policy errors stop the app at import / start.
- `actor` and `session` are normal FastAPI dependencies. fastauthz never creates sessions
  and never handles authentication. It reuses what the app has.

### 12.2 Dependency factories
Each factory is called when the route is defined (import time). It checks its arguments right
away (unknown resource, unknown action, non-filterable rule -> error at start), then returns a
dependency function with a proper signature so FastAPI can inject `actor` and `session`.

| Factory | Returns to the route | Runs |
|---|---|---|
| `authz.query(Model, action)` | `Select[tuple[Model]]` = `select(Model).where(filter)` | no query; route adds limit/order and runs it |
| `authz.filter(Model, action)` | `ColumnElement[bool]` | no query; for custom joins |
| `authz.load(Model, action, *, param=None, id_column=None)` | the `Model` instance | one `SELECT ... WHERE id = :id AND filter` |
| `authz.require(action, Model)` | `None` | no query; uses actor-only parts of the rules (12.4) |
| `authz.guard` | a `Guard` bound to the request's actor | nothing until used |

`Guard` (for service code that needs several checks):
```python
async def publish(post_id: int, guard: Annotated[Guard, Depends(authz.guard)], session: SessionDep):
    post = await session.get(Post, post_id)
    guard.check("publish", post)          # raises Denied -> 403
    if guard.can("feature", post): ...
    stmt = select(Comment).where(guard.filter("read", Comment))
```

### 12.3 `load()` in detail
1. Path parameter name: `param` if given, else `f"{model.__name__.lower()}_id"` (e.g. `post_id`),
   else `"id"` if the route has only `{id}`. Checked against the route path in `install()`
   (12.6); a mismatch is a startup error.
2. Converts the raw path value with the type of the id column (`int`, `UUID`, `str`), using
   the column's `python_type`. A bad value gives 422 (same as FastAPI's own validation).
3. Runs `select(Model).where(Model.<id_column> == :id, filter)` with `session.execute` or
   `await session.execute` (`_compat.is_async_session`).
4. Row found -> return it. Not found:
   - `deny_status=404` -> 404. The user cannot tell "does not exist" from "not allowed".
     This is the safe default and avoids leaking which ids exist.
   - `deny_status=403` -> one more query `select(exists().where(id == :id, scope))`. Exists -> 403,
     else 404. The extra query runs only on the deny path. The scope is kept in this query, so
     a user still gets 404 (never 403) for rows of another tenant. Ids of other tenants do not leak.
5. Emits a `Decision(kind="load")`.

One query in the happy path, the same as a plain `session.get()`. The check and the load
cannot get out of sync (no time-of-check / time-of-use gap between two queries).

### 12.4 `require()` in detail
For actions with no object yet (usually `create`):
- Evaluates the condition **without the scope** (8.4) and with `resource=None`. Actor-only parts
  (`who`, `roles`, `A.x` tests) work. Any `R.x` in a rule gives `MISSING` -> `UNKNOWN` -> deny.
  Deny rules are still applied.
- So `policy.allow("create", Post, roles=["editor"])` works with `require()`, but
  `policy.allow("create", Post, when=R.org_id == A.org_id)` does not. For payload-based
  checks, build the object and call `guard.check("create", Post(**body.model_dump()))`.
- `install()` warns at start if a route uses `require()` for an action whose every allow rule
  needs `R` (that route could never succeed).

### 12.5 Errors to HTTP
`authz.install(app)` adds one exception handler for `Denied`:
- Status 403 (or 404 from `load()`).
- Body in RFC 9457 "problem details" format, `Content-Type: application/problem+json`:
  `{"type": "about:blank", "title": "Forbidden", "status": 403, "detail": "You do not have permission to edit this Post."}`
- The detail text comes from `config.DENY_DETAIL_TEMPLATE` and never includes rule names,
  values or the explanation.
- If the app already has a handler for `Denied`, `install()` does not replace it.

### 12.6 OpenAPI
`install()` wraps `app.openapi` once:
1. Builds the normal schema (calls the original `app.openapi`).
2. Finds every route that uses a fastauthz dependency. Each dependency function carries an
   attribute `__fastauthz__ = PermissionInfo(model, action, kind)`. Route discovery goes through
   `_compat.iter_routes(app)` (12.7).
3. For each such operation:
   - adds `403` (and `404` for `load()`) to `responses`, with the problem-details schema;
   - adds `x-fastauthz: [{"resource": "Post", "action": "edit"}]`;
   - appends one line to the description: "**Permission:** `edit` on `Post`".
4. Caches the result, like FastAPI does.

So Swagger UI shows which permission every route needs, without extra work.

### 12.7 `_compat.py`
The only module allowed to touch internals. Functions:
- `iter_routes(app) -> Iterator[APIRoute]` - walks routes, including nested routers and the
  route tree introduced in FastAPI 0.137.
- `route_dependencies(route) -> Iterator[Callable]` - walks the route's dependency tree.
- `is_async_session(session) -> bool`
- `is_loaded(obj, attr) -> bool` - uses `sqlalchemy.inspect(obj).unloaded`.
- `relationship_target(model, name) -> type` and `relationship_direction(model, name)`.
- `column_python_type(model, name) -> type`.

Each function has contract tests in `tests/compat/` that run on every FastAPI and SQLAlchemy
version in the CI matrix (15.2). A new FastAPI release that changes internals fails our
**nightly** job before users see it.

### 12.8 Sync routes
Dependencies are `async def` when the session is async, and plain `def` when the session is
sync (FastAPI then runs them in its threadpool). The factory picks the right one at start by
checking whether the user's `session` dependency is a coroutine function or an async generator.

---

## 13. Tools for users

### 13.1 Test helpers (`testing.py`)
```python
from fastauthz.testing import assert_allowed, assert_denied, PolicyCase, check_cases

assert_allowed(policy, alice, "edit", post)          # on failure, prints the Explanation
assert_denied(policy, bob, "edit", post)

check_cases(policy, [
    PolicyCase(alice, "edit",   post,  True),
    PolicyCase(bob,   "edit",   post,  False),
    PolicyCase(None,  "read",   draft, False),
])                                                    # one report with all failures
```

### 13.2 Filter consistency check
```python
assert_filter_consistent(policy, session, Post, actors=[alice, bob, None], actions=["read", "edit"])
```
For each actor and action: loads all rows of `Post` (with needed relationships eager-loaded),
evaluates each row in Python, runs the SQL filter, and compares the two sets of ids. Any
difference fails with the row id and the explanation. Users run this in their own test suite,
mainly to prove that their `check=` and `sql=` twins agree. Max rows:
`config.CONSISTENCY_MAX_ROWS` (default 10,000); more rows raise an error asking for a smaller
test dataset.

### 13.3 Actor override in tests
```python
with override_actor(app, authz, alice):
    response = client.get("/posts")
```
Uses `app.dependency_overrides` for the `actor` dependency and restores it on exit.

### 13.4 CLI (`cli.py`, stdlib `argparse`, no extra dependency)
```
fastauthz check   app.authz:policy [--strict] [--format text|json]
fastauthz matrix  app.authz:policy [--format markdown|json|csv] [--output FILE]
fastauthz explain app.authz:policy --resource Post --action edit
fastauthz version
```
- `app.authz:policy` is `module:attribute`, imported with `importlib`. The current directory
  is added to `sys.path` (like uvicorn does).
- `check`: runs `validate()`, prints problems with codes and `file:line`. Exit codes:
  `0` no errors, `1` errors (or warnings with `--strict`), `2` bad usage / import failure.
- `matrix`: a table of resource x action -> the rules in plain words, e.g.
  `Post / edit: author (R.author_id == A.id) OR role admin; denied if R.locked is TRUE`.
  Good for security reviews, audits and docs. Deterministic order (sorted).
- `explain`: prints every rule for one (resource, action) with its source line.

---

## 14. Testing strategy

### 14.1 Rules
- Tests first for every feature (red -> green -> refactor).
- No network. No external services except a **local** PostgreSQL (Docker locally, a service
  container in CI). SQLite in-memory for the fast default run.
- `uv run pytest` runs the fast suite (unit + property on SQLite + FastAPI on SQLite) in under
  60 seconds. `uv run pytest -m postgres` adds PostgreSQL.

### 14.2 Unit tests
- `expr`: every builder, operator, flattening, `__bool__` error, private-name error, literal
  types, depth counting.
- `truth`: the full Kleene tables (all 9 pairs for And/Or, 3 for Not), `Is` table, `MISSING`.
- `evaluate`: every node; `None` vs `MISSING`; lazy-load guard; custom check exceptions.
- `roles`: expansion, cycles, cache.
- `policy`: every `FA0xx` problem has at least one test that triggers it and one that does not.
- `sql`: every node to SQL; `fold` simplification table; bound parameters only (assert no
  literal value appears in compiled SQL text).
- `fastapi`: each dependency, sync and async, 403/404 rules, problem-details body, OpenAPI
  additions, `install()` idempotent.
- `cli`: each command and exit code (run in-process with `main(argv)`).

### 14.3 Differential property tests (the most important tests)
Using Hypothesis:
1. **Strategy for policies:** random expression trees within the allowed grammar (section 5.4):
   random `Compare`/`In`/`Is` over a fixed test schema (`Item(id, owner_id, org_id, status,
   score, published, deleted_at, group -> Group(org_id), tags -> Tag(name))`), random actor
   attribute references, random `And`/`Or`/`Not` nesting up to depth 4, random allow/deny rules.
2. **Strategy for data:** random rows including `NULL`s in every nullable column, random
   actors including `None` and actors with missing attributes.
3. **Property:** for every actor, action:
   `{row.id for row in rows if policy.can(actor, action, row)}` ==
   `{id for id in session.scalars(select(Item.id).where(policy.filter(actor, action, Item)))}`.
4. Runs on SQLite in every CI run (`max_examples=500`) and PostgreSQL in CI
   (`max_examples=2000`). Nightly runs use `max_examples=20000`.
5. Every bug Hypothesis finds becomes a fixed example (`@example(...)`) so it stays covered.

### 14.4 Integration tests
- Three example apps (`examples/`) with full HTTP tests through `httpx.AsyncClient` +
  `ASGITransport`: list, load, create, deny paths, 403 vs 404, OpenAPI snapshot.
- SQLModel models tested once (they are SQLAlchemy models; we prove it works).

### 14.5 Quality gates (CI fails if any fails)
| Gate | Target |
|---|---|
| Branch coverage, core modules (`expr, truth, evaluate, roles, policy, sql, decision`) | 100% |
| Branch coverage, whole package | >= 95% |
| Mutation testing (`mutmut`) on `truth`, `evaluate`, `sql` | >= 90% mutants killed (run nightly + before release) |
| `pyright --strict` on `src/` and `tests/typing/` | 0 errors |
| `ruff check` and `ruff format --check` | clean |
| Import test without sqlalchemy/fastapi installed | passes |
| Docs examples (every code block in `docs/` is tested with `pytest --doctest-glob` or extracted) | pass |

---

## 15. Compatibility, versions and CI

### 15.1 Supported versions (at 1.0)
| Thing | Supported |
|---|---|
| Python | 3.11, 3.12, 3.13, 3.14, 3.15 (incl. free-threaded 3.14t in CI as non-blocking) |
| FastAPI | `>=0.115` (floor confirmed in M0 spike) up to latest |
| Starlette | whatever FastAPI pins |
| SQLAlchemy | `>=2.0` (2.0.x and 2.1.x) |
| SQLModel | latest (tested, not a dependency) |
| Databases | SQLite, PostgreSQL 14-18. MySQL/MariaDB: should work (standard SQL), tested from 1.1 (Later) |

### 15.2 CI matrix (GitHub Actions)
- **Every PR:** Python {3.11, 3.15} x FastAPI {floor, latest} x SQLAlchemy {2.0 latest, 2.1 latest}
  x DB {SQLite, PostgreSQL 18}, plus lint, type check, docs build.
- **Nightly:** full Python list, FastAPI pre-releases from PyPI (`--prerelease allow`),
  SQLAlchemy main branch, long Hypothesis run, mutation testing. Failures open an issue
  automatically.
- Dependencies are tested with `uv` resolution strategies `lowest-direct` and `highest` so both
  the floor and the newest versions really work.

### 15.3 Versioning and deprecation
- Semantic Versioning. `0.x` releases until 1.0 (API may change; each change is in the changelog).
- After 1.0: no breaking change without a major version. A deprecated feature warns
  (`FastAuthzDeprecationWarning`) for at least two minor releases before removal.
- Each release supports Python versions that are not end-of-life on the release day.

---

## 16. Performance

### 16.1 Targets (checked by `benchmarks/`, run in CI, tracked over time)
| Operation | Target (p50, policy with 50 rules, CPython 3.14, laptop-class CPU) |
|---|---|
| `policy.can()` in memory, no relationships | < 20 µs |
| `compile_filter()` (fold + to SQL) | < 100 µs |
| `load()` | 1 SQL query on success (same as `session.get`) |
| `query()` | 0 extra queries; only WHERE clauses / EXISTS subqueries added |
| `freeze()` for 500 rules | < 50 ms (runs once at start) |

### 16.2 How
- Condition trees are built and cached per `(model, action)` at freeze time.
- `fold` is a single pass. Role expansion is cached.
- No reflection at request time: model columns and relationship targets are looked up during
  `freeze()` and stored.
- A benchmark regression of more than 20% fails the nightly job (not the PR job, to avoid noise).

---

## 17. Security

### 17.1 Threat model (what can go wrong and what stops it)
| Risk | Defence |
|---|---|
| A list endpoint forgets to filter -> data leak | `query()` / `filter()` dependencies; docs show only filtered patterns; `fastauthz matrix` makes rules reviewable. (We cannot detect a raw `select()` the user writes by hand. Docs say so.) |
| Typo in action or role name silently denies or allows | Startup errors FA001, FA007; `load()`/`require()` check action names at import |
| `NULL` / missing values open access | Three-valued logic, fail closed (section 6) |
| `and`/`or` used instead of `&`/`\|` drops a condition | `__bool__` raises (5.2) |
| Missing parentheses (`R.a == 1 & ...`) | FA014 warning |
| SQL injection via actor or literal values | Values are always bound parameters (9.3); no string policies, no `eval` |
| Enumeration of ids through 403 vs 404 | `load()` defaults to 404 for both |
| Tenant leak through an admin rule | Scope is added to allow rules by default; bypass needs explicit `bypass_scope=True`, listed by `fastauthz check` |
| Custom check crashes and is treated as allow | Exceptions -> `UNKNOWN` -> deny, logged |
| Lazy load in Python check reads stale or missing data | Lazy-load guard (7); DB checks use SQL |
| Slow queries from deep relationships (DoS) | `MAX_RELATION_DEPTH`; `EXISTS` subqueries |
| Error messages leak policy details | `Denied` detail uses a fixed template (12.5) |
| Decision logs leak personal data | Decisions store ids only (10.1) |
| Policy changed at runtime by other code | `freeze()` makes it immutable |

### 17.2 Supply chain and releases
- Releases from GitHub Actions only, with PyPI Trusted Publishing (OIDC; no API tokens stored).
- Build provenance attestations (PEP 740) uploaded with each release.
- Zero runtime dependencies in the core; `fastapi` and `sqlalchemy` only as extras with lower
  bounds and no upper bounds (upper bounds break users; CI catches real breaks).
- Dependabot for GitHub Actions and dev dependencies; actions pinned by commit SHA.
- `SECURITY.md`: report privately through GitHub Security Advisories. Target: first reply in
  3 days, fix or plan in 14 days for high severity.
- OpenSSF Scorecard action runs weekly; the badge goes in the README.

---

## 18. Packaging

```toml
[project]
name = "fastauthz"
requires-python = ">=3.11"
dependencies = []                          # core: zero runtime dependencies

[project.optional-dependencies]
sqlalchemy = ["sqlalchemy>=2.0"]
fastapi    = ["fastapi>=0.115"]
standard   = ["fastauthz[sqlalchemy,fastapi]"]

[project.scripts]
fastauthz = "fastauthz.cli:main"
```

- Users install `pip install "fastauthz[standard]"` (same naming idea as `fastapi[standard]`).
- Build backend: `hatchling`. Version from `src/fastauthz/_version.py`.
- Wheel is pure Python (`py3-none-any`).
- License: MIT (same as FastAPI, Pydantic and SQLAlchemy).

---

## 19. Documentation (user-facing, `docs/`)

- Site built with MkDocs (Material theme), published to GitHub Pages from `main`.
- Pages: Get started (5-minute tutorial), Concepts (actor, resource, action, rule, scope),
  Rules reference (every operator, with SQL output), Roles, Relationships, FastAPI guide,
  Testing your policy, CLI, Security model (section 17 in user words), Recipes (owner-only,
  multi-tenant SaaS, per-org roles, soft delete, public + private), FAQ, API reference
  (generated from docstrings with mkdocstrings), Changelog.
- Every code sample in the docs runs in CI (14.5).
- Comparison page: fastauthz vs hand-written checks vs casbin vs Cerbos vs oso (archived),
  written fairly, with "when to use the other tool".

---

## 20. Later (not v1.0)

One line each. Not designed. Do not build early.
- Field-level permissions (hide `salary` unless the actor is HR).
- Recursive hierarchies of unlimited depth (folders in folders) with recursive CTEs.
- Zanzibar-style relationship graph and a "who can access X?" reverse query.
- Policies stored in the database or reloaded at runtime.
- Other ORMs and databases: Tortoise, Beanie/MongoDB, Piccolo.
- MySQL / MariaDB in the CI matrix (1.1).
- Decision caching per request.
- Litestar and Django Ninja adapters.
- Admin UI or policy editor.
- GraphQL (Strawberry) integration.

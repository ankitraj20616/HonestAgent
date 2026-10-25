# M2 - Technical Design (TDD)
## SQL compiler, tenant scope, relationships, custom checks, differential property tests

**Milestone:** M2 (30 h). **Main TDD:** 5.5, 5.6, 5.7, 6, 8.2, 8.4, 8.5, 9, 12.7, 14.3, 15, 16, 17.1.
**What:** `FSD.md` in this folder. **Steps:** `TASKS.md` in this folder.

> This file adds detail to the main TDD for M2 only. Section numbers here are local (`M2-TDD 4.3`).
> Where this file finds a gap or a conflict in the main TDD, it says so in section 10 and gives a
> recommended fix. The fix must go into the main TDD in the same PR (CLAUDE.md rule 13).

---

## 1. Scope

### 1.1 In scope
| Area | Main TDD | Delivered in M2 |
|---|---|---|
| Partial evaluation `fold()` | 9.2 | full simplification, actor binding, custom-check SQL twins |
| `to_sql()` and `compile_filter()` | 9.1, 9.3 | every node, bound parameters only, typed `NULL` |
| `policy.filter()` | 4, 8.2 | public method, lazy SQLAlchemy import |
| Relationships in SQL | 5.5, 9.4 | dotted paths -> nested `has()`, `Related` -> `any()` / `has()`, polarity-aware `EXISTS` (section 3.6) |
| SQLAlchemy metadata at freeze | 12.7, 16.2 | `_compat.model_info`, `relationship_target`, `relationship_direction`, `column_python_type` |
| Startup checks needing SQLAlchemy | 8.5 | FA003, FA004, FA005 (with metadata), FA008 |
| Scope | 8.2, 8.4 | `INHERIT`, per-resource scope, `scope=None`, `bypass_scope`, deny not scoped, FA012, FA016 |
| Custom checks | 5.7 | `check=`, `sql=`, `NotFilterableError`, FA013 |
| SQL snapshots, "no value in SQL text" | 9.6, 17.1 | snapshot files, AST and compile tests |
| Differential property test | 14.3 | schema, strategies, profiles, regressions |
| PostgreSQL in CI | 14.1, 15.2 | service container, `postgres` marker, drivers |

### 1.2 Pulled forward / already there from M1
- `_compat.is_loaded(obj, attr)` was **pulled forward into M1** (the lazy-load guard in
  `evaluate.py` needs it). M2 extends `_compat.py`; it does not re-create it.
- M1 owns `expr.py`, `truth.py`, `evaluate.py`, `roles.py`, `policy.py` (no SQL), `errors.py`.
  M2 only adds to them where this file says so.
- M1 defined the internal nodes `ActorPresent`, `RolesMatch`, `CustomCheck`.
  **`SqlFragment` is defined here, in `sql.py`** (it holds a SQLAlchemy object, so it cannot live
  in the core).

### 1.3 Out of scope
- FastAPI layer, `Decision` records, `on_decision` (M3).
- `fastauthz.testing.assert_filter_consistent` (M4; M2 builds the internal machinery it will reuse).
- `benchmarks/` and the nightly 20% regression gate (M4). M2 only respects the targets (section 8).
- Anything in main TDD 20 (Later).

---

## 2. Files and folders

### 2.1 Source
| Path | New / changed | Purpose |
|---|---|---|
| `src/fastauthz/sql.py` | new | `SqlFragment`, `fold()`, `to_sql()`, `compile_filter()`, polarity-aware `EXISTS` |
| `src/fastauthz/_compat.py` | changed | adds `ColumnInfo`, `RelationInfo`, `ModelInfo`, `is_mapped()`, `model_info()`, `relationship_target()`, `relationship_direction()`, `column_python_type()`, `configure_mappers()` |
| `src/fastauthz/policy.py` | changed | `INHERIT`, scope resolution, `bypass_scope`, `check=`/`sql=` args, `filter()`, metadata checks in `validate()`, filterability table, `_condition(..., with_scope=)` |
| `src/fastauthz/expr.py` | changed | `simplify()` (actor-free Kleene simplification, shared with `fold`), "at most one relationship path per atom" build check |
| `src/fastauthz/truth.py` | changed (only if Q3 in section 10 is accepted) | value-family rule for comparisons |
| `src/fastauthz/errors.py` | unchanged | `NotFilterableError` already exists from M1 |
| `src/fastauthz/config.py` | changed | constants in section 4 |

### 2.2 Tests
| Path | Purpose |
|---|---|
| `tests/conftest.py` | `db_url` param fixture (SQLite / PostgreSQL), engines, `postgres` marker skip logic, Hypothesis profiles |
| `tests/models.py` | shared SQLAlchemy models for unit and integration tests (Blog: `User`, `Org`, `Project`, `Post`, `Member`, `Country`, `Report`) |
| `tests/unit/test_sql_fold.py` | every row of the fold table (section 3.4) |
| `tests/unit/test_sql_to_sql.py` | every node to SQL, compiled on both dialects |
| `tests/unit/test_sql_relationships.py` | dotted paths, `any`, `has`, polarity |
| `tests/unit/test_sql_bound_params.py` | sentinel values never in SQL text; AST scan of `sql.py` |
| `tests/unit/test_sql_snapshots.py` + `tests/unit/sql_snapshots/*.sql` | SQL text snapshots |
| `tests/unit/test_compat_model_info.py` | metadata extraction |
| `tests/unit/test_policy_scope.py` | INHERIT, None, bypass, deny not scoped, FA008/FA012/FA016 |
| `tests/unit/test_policy_validate_sqla.py` | FA003, FA004, FA005 with real models |
| `tests/unit/test_policy_custom_checks.py` | `check=`, `sql=`, FA013, `NotFilterableError` |
| `tests/unit/test_policy_filter.py` | `policy.filter()` public behavior and errors |
| `tests/unit/test_imports.py` | extended: `policy.filter` without SQLAlchemy gives a clear error |
| `tests/integration/test_filter_db.py` | run filters on real DBs, sync and async |
| `tests/property/schema.py` | the property-test schema (section 6.6.1) |
| `tests/property/strategies.py` | expression, policy, row and actor strategies |
| `tests/property/test_engines_agree.py` | the differential property tests |
| `tests/property/regressions.py` | fixed cases found by Hypothesis, used as `@example` |

### 2.3 Tooling
| Path | Change |
|---|---|
| `pyproject.toml` | dev deps `psycopg[binary]>=3.2`, `asyncpg>=0.30`, `aiosqlite>=0.20`; pytest marker `postgres`; coverage config for `sql.py` |
| `.github/workflows/ci.yml` | PostgreSQL 18 service job (section 7) |
| `docker-compose.test.yml` | optional local PostgreSQL (same settings as CI) |

---

## 3. Design in detail

### 3.1 Types used across this section

```python
# src/fastauthz/sql.py
from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Literal as TLiteral

import sqlalchemy as sa
from sqlalchemy.orm import QueryableAttribute

from fastauthz.expr import (
    And, ActorAttr, Compare, Const, Expr, In, Is, Literal, Not, Or, Related, ResourceAttr,
    ActorPresent, RolesMatch, CustomCheck, simplify,
)
from fastauthz.truth import Truth, MISSING, NO_ROW

BoolClause = sa.ColumnElement[bool]
Polarity = TLiteral[1, -1]          # 1 = positive (not under NOT), -1 = under an odd number of NOTs


@dataclass(frozen=True, slots=True, eq=False)   # eq=False: identity hash, SQLAlchemy objects are not hashable by value
class SqlFragment:
    """A SQL condition given by a rule's `sql=` callable for one actor. Never built from values by us."""
    element: BoolClause
    rule_name: str
```

`SqlFragment` is an `Expr` only inside `sql.py`. The core `Expr` union does not include it; the
folded tree type is:

```python
FoldedExpr = Expr | SqlFragment
```

### 3.2 Metadata from SQLAlchemy (`_compat.py`)

Everything that inspects models lives here (CLAUDE.md rule 5). It is called **only at freeze
time**; results are stored in the frozen policy (main TDD 16.2).

```python
# src/fastauthz/_compat.py  (additions)
from dataclasses import dataclass
from typing import Literal

Direction = Literal["many_to_one", "one_to_many", "many_to_many"]


@dataclass(frozen=True, slots=True)
class ColumnInfo:
    key: str                     # mapper attribute key (the Python name), NOT the DB column name
    nullable: bool
    primary_key: bool
    python_type: type | None     # None when column.type.python_type raises NotImplementedError
    is_boolean: bool             # isinstance(column.type, sa.Boolean)


@dataclass(frozen=True, slots=True)
class RelationInfo:
    key: str
    target: type                 # related mapped class
    direction: Direction
    uselist: bool                # False -> scalar (dot-walkable, .has()); True -> collection (.any())


@dataclass(frozen=True, slots=True)
class ModelInfo:
    model: type
    columns: Mapping[str, ColumnInfo]        # MappingProxyType
    relations: Mapping[str, RelationInfo]    # MappingProxyType


def is_mapped(model: type) -> bool: ...
def configure_mappers() -> None: ...
def model_info(model: type) -> ModelInfo: ...
def relationship_target(model: type, name: str) -> type: ...
def relationship_direction(model: type, name: str) -> Direction: ...
def column_python_type(model: type, name: str) -> type | None: ...
```

Behavior:
- `is_mapped(model)`: `sqlalchemy.inspect(model, raiseerr=False) is not None` and it is a `Mapper`.
- `configure_mappers()`: calls `sqlalchemy.orm.configure_mappers()` once, so string relationship
  targets (`relationship("Project")`) are resolved. Raises SQLAlchemy's `InvalidRequestError`
  unchanged; `policy.freeze()` turns it into a `PolicyError` (section 3.9.4).
- `model_info(model)`:
  1. `mapper = sa.inspect(model)`.
  2. `columns`: for each `prop in mapper.column_attrs` with exactly one column
     (`len(prop.columns) == 1`): `ColumnInfo(key=prop.key, nullable=col.nullable,
     primary_key=col.primary_key, python_type=_safe_python_type(col.type),
     is_boolean=isinstance(col.type, sa.Boolean))`. Multi-column properties
     (`column_property` over expressions) are skipped -> using them gives FA003.
  3. `relations`: for each `rel in mapper.relationships`:
     `RelationInfo(key=rel.key, target=rel.mapper.class_, direction=_DIRECTIONS[rel.direction.name],
     uselist=bool(rel.uselist))`. `_DIRECTIONS = {"MANYTOONE": "many_to_one", "ONETOMANY":
     "one_to_many", "MANYTOMANY": "many_to_many"}`.
  4. Cached with `functools.cache` (models are hashable classes; the set is small and fixed).
- `relationship_target`, `relationship_direction`, `column_python_type`: thin readers over
  `model_info()`; raise `KeyError` for unknown names (callers in `policy.validate()` turn that
  into FA003).
- Hybrid properties, synonyms, association proxies: not columns, not relations -> FA003.
  The message says "not a mapped column or relationship".

### 3.3 Policy changes (`policy.py`)

#### 3.3.1 `INHERIT` and scope resolution
```python
@final
class _Inherit:
    __slots__ = ()
    def __repr__(self) -> str:
        return "INHERIT"

INHERIT: Final = _Inherit()          # not exported from fastauthz/__init__.py; default value only
ScopeArg = Expr | None | _Inherit


@dataclass(frozen=True, slots=True)
class ResourceSpec:
    model: type
    actions: frozenset[str]
    scope: Expr | None                          # resolved effective scope
    scope_origin: Literal["policy", "resource", "none"]
    id_column: str                              # default "id"
    source: str                                 # "file.py:12" of the resource() call (for FA008 / FA012)
```

`resource(model, *, actions, scope=INHERIT, id_column="id")`:
1. Frozen -> `PolicyFrozenError`.
2. `scope is INHERIT` -> `scope = self._default_scope`, `scope_origin = "policy"` if the default
   scope is not `None`, else `"none"`.
3. `scope is None` -> `scope_origin = "none"`, `explicit_none = True` (kept in a private set for FA012).
4. Otherwise must be an `Expr` (`ExpressionError` if not) -> `scope_origin = "resource"`.
5. `source = _caller_source()` (same helper M1 uses for rules).

The default scope is set only in `Policy(scope=...)`, so resolution at `resource()` time is final.

#### 3.3.2 Rule arguments added
```python
def allow(
    self,
    actions: str | Iterable[str],
    resource: type,
    *,
    who: Who = AUTHENTICATED,
    roles: Iterable[str] | None = None,
    when: Expr | None = None,
    check: Callable[[Any, Any], bool] | None = None,
    sql: Callable[[Any, type[Any]], "ColumnElement[bool]"] | None = None,
    bypass_scope: bool = False,
    name: str | None = None,
) -> Self: ...

def deny(
    self,
    actions: str | Iterable[str],
    resource: type,
    *,
    who: Who = ANYONE,
    roles: Iterable[str] | None = None,
    when: Expr | None = None,
    check: Callable[[Any, Any], bool] | None = None,
    sql: Callable[[Any, type[Any]], "ColumnElement[bool]"] | None = None,
    name: str | None = None,
) -> Self: ...
```
- `sql is not None and check is None` -> `TypeError("sql= needs check=: a rule must also work for one object")`
  at call time. Reason: a SQL-only rule could never be evaluated by `can()`, so the engines would
  disagree.
- `deny()` has no `bypass_scope` parameter (passing it is a normal Python `TypeError`).
- `ColumnElement` appears only in annotations, imported under `if TYPE_CHECKING:`. At runtime the
  core never imports SQLAlchemy (section 9.3, risk R7).

#### 3.3.3 Building the condition (main TDD 8.4) with scope
```python
def _condition(self, action: str, model: type, *, with_scope: bool = True) -> Expr:
    """Cached per (model, action, with_scope) after freeze. Actor-free."""
```
Pseudocode:
```
spec = self._resources[model]
allow_terms = []
for rule in rules matching (model, action or "*"), effect == "allow", in definition order:
    parts = [who_part(rule), roles_part(rule)]
    if rule.when is not None:  parts.append(rule.when)
    if rule.check is not None: parts.append(CustomCheck(rule))
    if with_scope and spec.scope is not None and not rule.bypass_scope:
        parts.append(spec.scope)
    allow_terms.append(simplify(And(tuple(parts))))
deny_terms = [simplify(And((who_part(r), roles_part(r), r.when?, CustomCheck(r)?))) for deny rules]
allow_part = simplify(Or(tuple(allow_terms))) if allow_terms else FALSE_
deny_part  = simplify(Or(tuple(deny_terms)))  if deny_terms  else FALSE_
return simplify(And((allow_part, Not(deny_part))))
```
- `who_part`: `AUTHENTICATED` -> `ActorPresent()`, `ANYONE` -> `TRUE_`.
- `roles_part`: `None` -> `TRUE_`, else `RolesMatch(frozenset(roles))`.
- Deny rules never get the scope (main TDD 8.2, FSD F8.5).
- `with_scope=False` is used by `require()` in M3. M2 builds and tests both variants.
- Cache: `dict[tuple[type, str, bool], Expr]`, filled lazily after freeze (the policy is frozen,
  so no lock is needed for correctness; two threads may compute the same value, last write wins,
  values are equal).

#### 3.3.4 Filterability table
At freeze, for every declared `(model, action)`:
```
non_filterable_rules[(model, action)] = tuple(
    rule for rule in rules matching (model, action or "*")      # allow AND deny
    if rule.check is not None and rule.sql is None
)
```
- Deny rules count. Dropping a non-filterable deny rule would fail open.
- Private helper used by `filter()` now and by M3 factories at route-definition time:
```python
def _require_filterable(self, model: type, action: str) -> None:
    """Raise NotFilterableError if (model, action) cannot become SQL. No values, no rule names in the message."""
```
Message: `"'{action}' on {Model} cannot be used as a SQL filter: a rule has check= without sql= (at {source})."`
It names the model, the action and the source location of the first offending rule. It never
names rule names or data values (CLAUDE.md rule 7).

#### 3.3.5 `policy.filter()`
```python
def filter(self, actor: object | None, action: str, model: type[Any]) -> ColumnElement[bool]:
    """SQL condition: rows of `model` that `actor` may `action`. Use only as a positive WHERE condition."""
```
Steps:
1. If not frozen: `self.freeze()` (first-use freeze, main TDD 8.2).
2. `model not in self._resources` -> `UnknownResourceError(f"{model.__name__} is not declared")`.
3. `action not in spec.actions` -> `UnknownActionError(f"'{action}' is not declared on {model.__name__}")`.
4. `model` not mapped (`self._model_info.get(model) is None`) -> `NotFilterableError(f"{model.__name__} is not a SQLAlchemy mapped class")`.
5. `self._require_filterable(model, action)`.
6. Lazy import:
   ```python
   try:
       from fastauthz import sql as _sql
   except ModuleNotFoundError as exc:          # sqlalchemy missing
       raise ModuleNotFoundError(
           "policy.filter() needs SQLAlchemy: pip install 'fastauthz[sqlalchemy]'"
       ) from exc
   ```
7. `return _sql.compile_filter(self, actor, action, model)`.

Note: step 4 can only be reached when SQLAlchemy is installed and the model is not mapped; when
SQLAlchemy is not installed, `_model_info` is empty and step 6 gives the clearer message. Order of
4 and 6 is therefore: check `"sqlalchemy" in sys.modules` first; if not loaded, go to 6.

### 3.4 `fold()` - partial evaluation (main TDD 9.2)

```python
def fold(tree: Expr, actor: object | None, policy: Policy, model: type) -> FoldedExpr:
    """Bind actor values and simplify. Single pass, bottom-up. Never reads a resource."""
```

**Rule zero: fold never re-implements a truth rule.** For any sub-tree that does not read the
resource (no `ResourceAttr`, no `Related`, no `CustomCheck`), fold returns
`Const(evaluate(sub, actor, resource=None, policy=policy))`, using the M1 evaluator. For atoms that
mix `R` and `A`, fold reads actor values with the evaluator's own path reader
(`evaluate.read_path`) and applies the step-1 rule with the same `truth.py` helpers. This makes
"fold agrees with evaluate" true by construction for the actor half.

Precomputed at freeze (per node, stored in a dict keyed by node): `reads_resource: bool`. So fold
does not rescan sub-trees.

#### 3.4.1 Per-node table
| Input node | Output |
|---|---|
| `Const(v)` | `Const(v)` |
| `ActorPresent()` | `Const(TRUE)` if `actor is not None` else `Const(FALSE)` |
| `RolesMatch(rs)` | `Const(TRUE)` if `rs & policy._roles.expand(policy.actor_roles(actor))` else `Const(FALSE)` (same helper as `evaluate`) |
| any sub-tree with `reads_resource == False` | `Const(evaluate(sub, actor, None))` |
| `Compare(op, a, b)` with a resource side | see 3.4.2 |
| `In(item, options, negate)` with a resource item | see 3.4.3 |
| `Is(item, value, negate)` with a resource item | unchanged (a resource `Is` has no actor operand) |
| `And(items)` | `simplify(And(tuple(fold(i) for i in items)))` |
| `Or(items)` | `simplify(Or(tuple(fold(i) for i in items)))` |
| `Not(item)` | `simplify(Not(fold(item)))` |
| `Related(path, kind, where)` | `Related(path, kind, fold(where))`, then: `where == Const(FALSE)` -> `Const(FALSE)`. (Kept otherwise, also for `Const(TRUE)` and `Const(UNKNOWN)`: those still depend on whether related rows exist.) |
| `CustomCheck(rule)` with `rule.sql` | `SqlFragment(_call_sql(rule, actor, model), rule.name)`, see 3.4.4 |
| `CustomCheck(rule)` without `rule.sql` | `NotFilterableError` (defensive; normally stopped by `_require_filterable`) |

#### 3.4.2 `Compare` with a resource side
```
def fold_compare(node):
    left, right = node.left, node.right
    # Normalize: resource operand on the left. Flip the operator when swapping.
    if not isinstance(left, ResourceAttr):
        left, right = right, left
        op = FLIP[node.op]            # lt<->gt, le<->ge, eq/ne unchanged
    if isinstance(right, ResourceAttr):
        return Compare(op, left, right)            # R op R: nothing to bind
    value = right.value if isinstance(right, Literal) else read_path(actor, right.path)   # may be MISSING
    if value is None or value is MISSING:
        return Const(UNKNOWN)                      # main TDD 6.2 step 1 (checked before NO_ROW)
    if not truth.is_literal_value(value):          # e.g. an arbitrary object on the actor
        return Const(UNKNOWN)
    if FAMILY_RULE and not truth.same_family(value, column_type(left)):   # Q3, section 10
        return Const(UNKNOWN)
    return Compare(op, left, Literal(value))
```
`FLIP = {eq: eq, ne: ne, lt: gt, le: ge, gt: lt, ge: le}`. `column_type(left)` is the
`python_type` of the leaf column of `left.path` (through relations), from `ModelInfo`.

#### 3.4.3 `In` with a resource item
```
def fold_in(node):
    opts = node.options.value if isinstance(node.options, Literal) else read_path(actor, node.options.path)
    if opts is None or opts is MISSING:
        return Const(UNKNOWN)
    opts = truth.as_options(opts)                  # list/tuple/set/frozenset -> tuple; str, bytes, Mapping, other -> MISSING
    if opts is MISSING:
        return Const(UNKNOWN)
    if len(opts) == 0:
        if len(node.item.path) == 1:                   # plain column: no NO_ROW possible
            return Const(TRUE if node.negate else FALSE)
        return In(node.item, Literal(()), node.negate) # dotted path: keep it, so to_sql puts it inside
                                                       # has() and NO_ROW stays FALSE (M1 D4b, Q2)
    if any(not truth.is_literal_value(o) for o in opts):
        opts = tuple(o if truth.is_literal_value(o) else None for o in opts)   # unknown element behaves like NULL
    if FAMILY_RULE:
        opts = tuple(o if o is None or truth.same_family(o, column_type(node.item)) else None for o in opts)
    return In(node.item, Literal(opts), node.negate)
```
Why "replace with `None`": SQL `x IN (1, NULL)` is `TRUE` if `x = 1`, else `NULL`. The Python
engine gives the same (main TDD 6.3, "options containing `None`"). An element that can never be
compared is, by the Kleene reading of `IN` as `OR` of equalities, an `UNKNOWN` term - exactly what a
`NULL` element gives in SQL. So the engines stay equal and the database never sees a value of the
wrong type.

#### 3.4.4 Calling a rule's `sql=`
```python
def _call_sql(rule: Rule, actor: object | None, model: type) -> BoolClause:
    try:
        element = rule.sql(actor, model)
    except Exception:
        _log.warning("fastauthz: sql= of rule %s raised; treating as UNKNOWN", rule.name, exc_info=True)
        return _typed_null()
    if not isinstance(element, sa.ColumnElement):
        _log.warning("fastauthz: sql= of rule %s did not return a SQL condition; treating as UNKNOWN", rule.name)
        return _typed_null()
    return element
```
- Mirrors main TDD 5.7 for `check=` (exception -> `UNKNOWN`, logged at WARNING with the rule name).
- Logs may name the rule; error messages and HTTP responses may not (rule 7).
- `BaseException` subclasses that are not `Exception` (`KeyboardInterrupt`, `CancelledError`) are
  not caught.

#### 3.4.5 `simplify()` - Kleene simplification (in `expr.py`, core, shared)
`simplify` works on actor-free trees too, so it lives in the core and is reused by M1 (FA011) and
by `fold`. It does one level; callers fold bottom-up, so one level is enough.

| Input | Output |
|---|---|
| `And(...)` containing `Const(FALSE)` | `Const(FALSE)` (also when `Const(UNKNOWN)` is present: `U AND F = F`) |
| `And(...)` with `Const(TRUE)` children | drop them |
| `And(...)` with nested `And` children | flatten |
| `And(...)` with duplicates | keep the first, drop later equal nodes (order kept, so SQL is stable) |
| `And(())` (all dropped) | `Const(TRUE)` |
| `And((x,))` | `x` |
| `And(...)` with `Const(UNKNOWN)` and others | keep one `Const(UNKNOWN)` (it changes `TRUE` into `UNKNOWN`) |
| `Or(...)` containing `Const(TRUE)` | `Const(TRUE)` (also with `UNKNOWN`: `U OR T = T`) |
| `Or(...)` with `Const(FALSE)` children | drop them |
| `Or(...)` nested / duplicates / single | flatten / keep first / unwrap |
| `Or(())` | `Const(FALSE)` |
| `Or(...)` with `Const(UNKNOWN)` and others | keep one `Const(UNKNOWN)` |
| `Not(Const(TRUE))` | `Const(FALSE)` |
| `Not(Const(FALSE))` | `Const(TRUE)` |
| `Not(Const(UNKNOWN))` | `Const(UNKNOWN)` |
| `Not(Not(x))` | `x` |
| anything else | unchanged |

Not done on purpose: De Morgan rewriting, absorption (`a OR (a AND b)`), complement
(`a AND NOT a` is not `FALSE` under three values). They are either wrong in Kleene logic or not
worth the risk.

`SqlFragment` uses identity equality, so duplicates of it are only removed if it is the same object.

### 3.5 `to_sql()` (main TDD 9.3)

```python
def to_sql(node: FoldedExpr, model: type, info: Mapping[type, ModelInfo], polarity: Polarity = 1) -> BoolClause: ...
```

| Node | SQLAlchemy |
|---|---|
| `Const(TRUE)` | `sa.true()` |
| `Const(FALSE)` | `sa.false()` |
| `Const(UNKNOWN)` | `_typed_null()` = `sa.cast(sa.null(), sa.Boolean)` |
| `Compare(op, R(col), Literal(v))` | `_OPS[op](col_attr, _bind(v, col_attr))` |
| `Compare(op, R(col1), R(col2))` | `_OPS[op](col_attr1, col_attr2)` |
| `In(R(col), Literal(opts), negate=False)` | `col_attr.in_(list(opts))` (one expanding bound parameter) |
| `In(..., negate=True)` | `col_attr.not_in(list(opts))` |
| `Is(R(col), None, negate)` | `col_attr.is_(None)` / `col_attr.is_not(None)` |
| `Is(R(col), True, negate)` | `col_attr.is_(sa.true())` / `col_attr.is_not(sa.true())` |
| `Is(R(col), False, negate)` | `col_attr.is_(sa.false())` / `col_attr.is_not(sa.false())` |
| `And(items)` | `sa.and_(*(to_sql(i, ..., polarity) for i in items))` |
| `Or(items)` | `sa.or_(*(...same polarity...))` |
| `Not(item)` | `sa.not_(to_sql(item, ..., -polarity))` |
| atom with a dotted path | section 3.6.2 |
| `Related(...)` | section 3.6.3 |
| `SqlFragment(el)` | `el` (SQLAlchemy groups it in parentheses as needed) |

Details:
- `col_attr = getattr(model, key)` - an `InstrumentedAttribute`. `key` is the mapper key from
  `ModelInfo` (same name the Python engine reads with `getattr`).
- `_OPS = {eq: operator.eq, ne: operator.ne, lt: operator.lt, le: operator.le, gt: operator.gt, ge: operator.ge}`.
- `_bind(v, col_attr) = sa.bindparam(None, v, type_=col_attr.type, unique=True)`. The type of the
  partner column is used, so `DateTime`, `Enum`, `Uuid`, `Boolean` values are processed exactly as
  SQLAlchemy processes them for that column (round-trip safe). Always a bound parameter.
- `In` uses SQLAlchemy's expanding parameter (`col.in_(list)`); the list never becomes SQL text.
  Empty options reach `to_sql` only on a dotted path (fold made plain-column cases `Const`). They
  render `sa.false()` / `sa.true()` inside the `has()` chain, so a missing link stays `FALSE`.
  Covered by unit tests for both cases.
- `ResourceAttr` / `ActorAttr` / `Literal` alone are not boolean; reaching them is a bug ->
  `AssertionError` in debug, covered by a test that the folded tree never has them at the top.
- `compile_filter` adds nothing else. No `text()`, no `literal_column()`, no `literal_binds`.

#### 3.5.1 `compile_filter()` (main TDD 9.1)
```python
def compile_filter(policy: Policy, actor: object | None, action: str, model: type) -> BoolClause:
    tree = policy._condition(action, model)                # cached, actor-free
    folded = fold(tree, actor, policy, model)
    return to_sql(folded, model, policy._model_info, polarity=1)
```
The root is positive. That is why the result is only valid as a positive `WHERE` condition
(`FSD M2-F7.9`; section 3.6.1).

### 3.6 Relationships in SQL (main TDD 5.5, 9.4)

#### 3.6.1 Why plain `has()` / `any()` is not enough: polarity-aware `EXISTS`
SQL `EXISTS` has only two values. The Python engine (main TDD 6.2 step 4 and 7) gives `UNKNOWN`
when the related row exists but the compared value is `NULL`, and for `.any()` when no item is
`TRUE` but one is `UNKNOWN`. Plain `EXISTS` gives `FALSE` there. Under `NOT` (for example every
**deny** rule, because `final = allow AND NOT deny`) this turns into `TRUE` in SQL but `UNKNOWN` in
Python: **the SQL filter would show a row that `can()` denies.** This is a fail-open disagreement.

Example: `policy.deny("read", Post, when=R.project.status == "banned")`, a post whose project has
`status = NULL`.
- Python: deny term = `UNKNOWN` -> `NOT UNKNOWN = UNKNOWN` -> no access.
- Plain SQL: `NOT EXISTS(project WHERE status = 'banned')` = `NOT FALSE` = `TRUE` -> row shown.

**Fix: render each `EXISTS` according to its polarity.**
- Positive polarity (under an even number of `NOT`s): `EXISTS(rel WHERE cond)`.
  It is `TRUE` exactly when Python says `TRUE`, and `FALSE` when Python says `FALSE` **or `UNKNOWN`**.
- Negative polarity (under an odd number of `NOT`s): `EXISTS(rel WHERE (cond) IS NOT FALSE)`.
  It is `FALSE` exactly when Python says `FALSE`, and `TRUE` when Python says `TRUE` **or `UNKNOWN`**.

Why the final answer is still exactly the same (proof sketch, kept in a docstring):
1. Let `f` be the root condition as a function of one atom `x`, with every other atom fixed.
   Kleene `AND`/`OR`/`NOT` are monotone in the **information order** (`UNKNOWN` below both `TRUE`
   and `FALSE`). So if `f(UNKNOWN) = TRUE`, then `f(TRUE) = f(FALSE) = TRUE`.
2. If `x` is in positive polarity, `f` is monotone in the **truth order** (`F < U < T`) in `x`.
   Replacing `U` by `F` gives `f(F) <= f(U)`. So `f(F) = TRUE` implies `f(U) = TRUE`, and by (1)
   `f(U) = TRUE` implies `f(F) = TRUE`. The TRUE-ness of the root does not change.
3. If `x` is in negative polarity, `f` is antitone in `x`. Replacing `U` by `T` gives
   `f(T) <= f(U)`; the same two steps show TRUE-ness does not change.
4. Apply this to each `EXISTS` atom one at a time (inner ones first; `EXISTS` is monotone in its
   inner condition, so the inner polarity equals the outer one).

So `{rows where SQL root is TRUE}` == `{rows where Python root is TRUE}`, which is the contract
(main TDD 6.4: access only if `final` is `TRUE`; SQL `WHERE` keeps only `TRUE`). It costs **one**
`EXISTS` per relationship hop, as in the main TDD. Only the inner condition changes.

```python
def _exists(rel_attr: QueryableAttribute[Any], kind: TLiteral["any", "has"], cond: BoolClause | None,
            polarity: Polarity) -> BoolClause:
    if cond is None:                                  # where folded to Const(TRUE): any related row
        return rel_attr.any() if kind == "any" else rel_attr.has()
    inner = cond if polarity == 1 else cond.is_not(sa.false())
    return rel_attr.any(inner) if kind == "any" else rel_attr.has(inner)
```
- `cond.is_not(sa.false())` renders `(...) IS NOT false` on PostgreSQL and `(...) IS NOT 0` on
  SQLite. Both are `TRUE` for `TRUE` and `NULL`, `FALSE` for `FALSE`. Snapshot and DB tests prove it
  on both. If a driver ever renders it badly, the fallback is `sa.or_(cond, cond.is_(None))`
  (same meaning, condition written twice).
- `Const(UNKNOWN)` as `where`: positive -> `EXISTS(rel WHERE NULL)` = `FALSE`; negative ->
  `EXISTS(rel WHERE NULL IS NOT FALSE)` = "any related row exists". Both match the proof.
- Consequence for users: `~policy.filter(...)` breaks the polarity assumption (the root becomes
  negative). Docs say: a filter is only a positive `WHERE` condition (FSD M2-F7.9).
- Consequence for `sql=` twins: a user fragment that uses `EXISTS` itself is the user's
  responsibility; docs for `sql=` mention it, M4's `assert_filter_consistent` catches it.

#### 3.6.2 Dotted paths -> nested `has()`
An atom (`Compare`, `In`, `Is`) may contain **at most one** `ResourceAttr` with `len(path) > 1`
(build-time `ExpressionError` in `expr.py`; see Q4). The other operand is a root column, a
`Literal`, or nothing (`Is`).

```
def atom_to_sql(node, model, polarity):
    dotted = the ResourceAttr operand with len(path) > 1, or None
    if dotted is None:
        return render_flat(node, column_of={op.path: getattr(model, op.path[0]) for op in resource operands})
    hops = dotted.path[:-1]                       # relationship keys, all uselist=False (FA004 checked)
    chain = []                                    # [(owner_model, rel_key)]
    m = model
    for key in hops:
        chain.append((m, key))
        m = info[m].relations[key].target
    leaf = getattr(m, dotted.path[-1])            # e.g. Project.org_id
    cond = render_flat(node, column_of={dotted.path: leaf, other_root_path: getattr(model, ...)})
    for owner, key in reversed(chain):
        cond = _exists(getattr(owner, key), "has", cond, polarity)
    return cond
```
- `R.project.org_id == A.org_id` on `Post` (positive) ->
  `Post.project.has(Project.org_id == :p1)` ->
  `EXISTS (SELECT 1 FROM project WHERE project.id = post.project_id AND project.org_id = :p1)`.
- `R.project.org.region == "eu"` -> `Post.project.has(Project.org.has(Org.region == :p1))`.
- `R.project.org_id == R.org_id` -> `Post.project.has(Project.org_id == Post.org_id)`; SQLAlchemy
  correlates `post.org_id` to the outer query automatically.
- `Is` on a dotted path: `R.project.deleted_at.is_(None)` -> `Post.project.has(Project.deleted_at IS NULL)`.
  `Is` on a column is never `NULL`, so polarity does not matter for the leaf; the `IS NOT FALSE`
  wrapper is harmless.
- No related row -> `has()` is `FALSE`. Python: `NO_ROW` -> `FALSE` (main TDD 6.2 step 2). Equal.
- The last path element must be a **column**. A path ending on a relationship
  (`R.project.is_(None)`) is FA003 with the hint "compare a column like `project_id`, or use
  `.has()`".

#### 3.6.3 `Related` -> `any()` / `has()`
`Related(path, kind, where)`:
```
def related_to_sql(node, model, polarity):
    *prefix, last = node.path                     # prefix hops are scalar relations (dot-walk)
    m = model; chain = []
    for key in prefix:
        chain.append((m, key)); m = info[m].relations[key].target
    rel = info[m].relations[last]
    target = rel.target
    if node.where == Const(TRUE): inner = None
    else: inner = to_sql(node.where, target, info, polarity)     # inside .any(), R = the related row
    cond = _exists(getattr(m, last), node.kind, inner, polarity)
    for owner, key in reversed(chain):
        cond = _exists(getattr(owner, key), "has", cond, polarity)
    return cond
```
- `kind == "any"` needs `rel.uselist is True`; `kind == "has"` needs `rel.uselist is False`
  (validated, section 3.7).
- `R.members.any(user_id=A.id)` (positive, actor id 3) ->
  `Post.members.any(Member.user_id == :p1)` with `p1 = 3`.
- Many-to-many (`secondary=`) works the same: SQLAlchemy builds the `EXISTS` over the association
  table.
- Python side (M1 evaluator) must match: a `Related` whose **prefix** goes through a `None`
  scalar relation is `FALSE` (like `NO_ROW`), see Q5.

#### 3.6.4 Depth
`depth(ResourceAttr(path)) = len(path) - 1`;
`depth(Related(path, _, where)) = len(path) + depth(where)`;
`depth(And/Or/Not) = max(children)`; atoms take the max of their operands.
Must be `<= config.MAX_RELATION_DEPTH` (3). M1 counts this at build time from path lengths; M2
re-checks it in `validate()` with real metadata as FA005 (also for scope expressions), because only
metadata can tell that, for example, `R.project.org_id` really is one hop.

### 3.7 Startup checks that need SQLAlchemy (`policy.validate()`, main TDD 8.5)

Run only when `"sqlalchemy" in sys.modules` and `_compat.is_mapped(model)`. Plain classes skip
FA003/FA004/FA005-metadata/FA008 (main TDD: "skipped for plain classes").

```
def _validate_paths(expr, model, where_from: Literal["rule", "scope"], source) -> list[PolicyProblem]:
    walk every ResourceAttr and Related in expr, with a current model:
      ResourceAttr(path):
        m = model
        for key in path[:-1]:
            rel = info[m].relations.get(key)
            if rel is None:            -> FA003 (or FA008 if where_from == "scope"): "{m}.{key} is not a relationship"
            elif rel.uselist:          -> FA004: "{m}.{key} has many rows; use R.{key}.any(...)"
            m = rel.target
        last = path[-1]
        if last in info[m].relations:  -> FA003: "R.{path} points at a relationship; compare a column or use .has()"
        elif last not in info[m].columns:
            -> FA003 / FA008: "{m} has no column {last}"
      Related(path, kind, where):
        walk prefix as above (scalar only)
        rel = info[m].relations.get(path[-1])
        if rel is None:                          -> FA003
        elif kind == "any" and not rel.uselist:  -> FA003: "{key} is a single row; use .has()"   (see Q6)
        elif kind == "has" and rel.uselist:      -> FA004: "{key} has many rows; use .any()"
        recurse into where with model = rel.target
      Is(item, True/False) where the leaf column is not Boolean:
        -> FA003: ".is_(True/False) needs a Boolean column"   (see Q7)
    depth > MAX_RELATION_DEPTH -> FA005
```
- FA008 is used instead of FA003 when the bad path comes from the **scope** (policy-wide or
  per-resource). Message (FSD M2-F8.3):
  `"{Model} has no column {col} used by the scope (from {scope_origin}). Set scope=None or a custom scope on resource({Model})."`
  Source: the `resource()` call (`ResourceSpec.source`).
- Every problem is collected; `freeze()` raises one `PolicyError` with all of them (main TDD 8.2).
- `configure_mappers()` failure -> one problem `FA003` per affected resource with the message
  "SQLAlchemy could not configure mappers; import all models before freezing the policy", and the
  original exception chained on the `PolicyError`.

### 3.8 Scope problems (main TDD 8.4, 8.5)
| Code | Trigger in M2 | Not triggered by |
|---|---|---|
| FA008 | scope path missing on the resource (3.7) | resource with `scope=None`; resource with its own valid scope |
| FA012 (notice) | policy has a default scope and the resource was declared with explicit `scope=None` | resource that inherits; policy without default scope (no spam of notices) |
| FA016 (warning) | allow rule with `who=ANYONE`, `bypass_scope=False`, on a resource whose effective scope contains an `ActorAttr` | same rule with `bypass_scope=True`; scope that reads only `R` and literals; `who=AUTHENTICATED` |
| FA013 (notice) | `(model, action)` with a rule that has `check=` and no `sql=` | rule with both |

`bypass_scope=True` on a resource without a scope: allowed, no problem (it changes nothing).

### 3.9 Custom checks (main TDD 5.7)
- 3.9.1 `check=` becomes `CustomCheck(rule)` inside the rule's `And` (3.3.3). `when=`, `roles=`,
  `who=` and the scope still apply around it.
- 3.9.2 Python engine (M1): calls `rule.check(actor, resource)`. `True` -> `TRUE`, `False` ->
  `FALSE`, an exception or any other return value -> `UNKNOWN` + WARNING.
- 3.9.3 SQL engine: `fold` calls `rule.sql(actor, model)` once per `filter()` call (3.4.4).
- 3.9.4 Filterability is decided at freeze (3.3.4). `filter()` raises before any SQL is built.

### 3.10 Errors raised in M2 (summary)
| Situation | Exception | When |
|---|---|---|
| `filter()` on undeclared model | `UnknownResourceError` | call time |
| `filter()` on undeclared action | `UnknownActionError` | call time |
| `filter()` on non-mapped class | `NotFilterableError` | call time |
| `filter()` with a `check=`-only rule | `NotFilterableError` | call time (M3: route definition) |
| `filter()` without SQLAlchemy | `ModuleNotFoundError` with install hint | call time |
| `sql=` without `check=` | `TypeError` | `allow()` / `deny()` call |
| two relationship paths in one atom | `ExpressionError` | expression build |
| bad paths, scope column missing | `PolicyError` (FA003/4/5/8) | `freeze()` |
| `sql=` callable raises / bad return | none; `UNKNOWN` + WARNING log | `filter()` call |

---

## 4. Config constants (`config.py`)

```python
# M2 additions
MAX_RELATION_DEPTH: Final[int] = 3            # already from M1; M2 re-checks with metadata (FA005)
SQL_EXISTS_NEGATIVE_FORM: Final[Literal["is_not_false", "or_is_null"]] = "is_not_false"
    # How a negative-polarity EXISTS writes its inner condition (3.6.1). Switch only if a dialect
    # renders IS NOT FALSE badly. Both forms are tested.
FAMILY_RULE: Final[bool] = True               # only if Q3 is accepted: cross-type comparisons are UNKNOWN in both engines
```

Test-only settings (Hypothesis example counts, PostgreSQL URL) are not library settings. They live
as named constants in `tests/conftest.py` (section 6.6.6), so rule 8 ("no magic numbers") holds
for `src/`.

---

## 5. Truth-rule impact (main TDD 6)

How each node keeps the two engines equal. "Py" = `evaluate()`, "SQL" = the database result of
`to_sql(fold(...))`.

| Case | Py | SQL | Same? |
|---|---|---|---|
| column `NULL`, `col == 5` | `UNKNOWN` (step 4) | `NULL = 5` -> `NULL` | yes, exact |
| actor attr missing, `col == A.x` | `UNKNOWN` (step 1) | fold -> `Const(UNKNOWN)` -> `CAST(NULL AS BOOLEAN)` | yes, exact |
| actor attr `None` | `UNKNOWN` | same as above | yes |
| `col == None` literal (FA015) | `UNKNOWN` | fold -> typed `NULL` (no `= NULL` sent) | yes |
| `col.in_([])` | `FALSE` | fold -> `false` | yes |
| `col.not_in([])` | `TRUE` | fold -> `true` | yes |
| `R.group.org_id.not_in([])`, no group | `FALSE` (`NO_ROW` first, M1 D4b) | `has(true)` -> no row -> `FALSE` | yes |
| `col.in_([1, None])`, col = 2 | `UNKNOWN` | `2 IN (1, NULL)` -> `NULL` | yes |
| `col.not_in([1, None])`, col = 1 | `FALSE` | `1 NOT IN (1, NULL)` -> `FALSE` | yes |
| `col.is_(None)`, col `NULL` | `TRUE` | `IS NULL` -> `TRUE` | yes |
| `col.is_(True)`, col `NULL` | `FALSE` | `NULL IS true` -> `FALSE` | yes |
| `~col.is_(True)`, col `NULL` | `TRUE` | `NOT (NULL IS true)` -> `TRUE` | yes |
| dotted, related row missing | `FALSE` (`NO_ROW`, step 2) | `has()` -> `FALSE` | yes, exact |
| dotted, related value `NULL`, positive | `UNKNOWN` | `has(cond)` -> `FALSE` | root TRUE-ness same (3.6.1) |
| dotted, related value `NULL`, under `NOT` | `UNKNOWN` | `has(cond IS NOT FALSE)` -> `TRUE`, so `NOT` -> `FALSE` | root TRUE-ness same |
| `.any()`, empty collection | `FALSE` | `EXISTS` -> `FALSE` | yes |
| `.any()`, one item `UNKNOWN`, none `TRUE`, positive | `UNKNOWN` | `FALSE` | root TRUE-ness same |
| same, under `NOT` | `UNKNOWN` | `TRUE` -> after `NOT`: `FALSE` | root TRUE-ness same |
| `Const(UNKNOWN)` at root | no access | `WHERE CAST(NULL AS BOOLEAN)` -> no rows | yes |
| `allow AND NOT deny`, deny `UNKNOWN` | no access | `x AND NOT NULL` -> not `TRUE` | yes |
| actor-only parts (`roles`, `who`, `A.x.is_(...)`) | `evaluate` | fold uses `evaluate` itself | yes, by construction |
| `sql=` twin | `check()` | user SQL | user's responsibility (M4 helper) |

The contract M2 guarantees and tests: for every row, `can(actor, action, row)` is `True` **iff**
the row is returned by `select(Model).where(filter(actor, action, Model))`. For trees without
`EXISTS` (no dotted paths, no `Related`), the stronger property holds: the SQL three-valued result
equals the Python `Truth` exactly; the property tests check both (6.6.4).

---

## 6. Test plan

### 6.1 Rules
- Tests first: every task in `TASKS.md` starts with a failing test.
- Default run `uv run pytest`: SQLite only (in-memory, `StaticPool`), < 60 s total suite.
- `uv run pytest -m postgres`: only the PostgreSQL-parametrized tests (the SQLite half already ran
  in the default run). CI runs both commands.
- No network. PostgreSQL is local Docker or the CI service container.

### 6.2 Fixtures (`tests/conftest.py`)
```python
PG_URL_ENV = "FASTAUTHZ_TEST_PG_URL"
PG_URL_DEFAULT = "postgresql+psycopg://fastauthz:fastauthz@localhost:5432/fastauthz_test"
PG_ASYNC_URL_DEFAULT = "postgresql+asyncpg://fastauthz:fastauthz@localhost:5432/fastauthz_test"

@pytest.fixture(params=["sqlite", pytest.param("postgresql", marks=pytest.mark.postgres)])
def engine(request) -> Iterator[sa.Engine]: ...      # creates all tables once per session per backend

@pytest.fixture(params=[...same two...])
async def async_engine(request) -> AsyncIterator[AsyncEngine]: ...   # aiosqlite / asyncpg
```
- `pytest_collection_modifyitems`: if the `-m` expression does not mention `postgres`, add
  `pytest.mark.skip(reason="run with -m postgres")` to `postgres` items. So the default run never
  tries to connect.
- SQLite: `sqlite+pysqlite:///:memory:` with `poolclass=StaticPool`; `PRAGMA foreign_keys=ON`.
- PostgreSQL: tables are created in a schema `fastauthz_test_<pid>` and dropped at session end.

### 6.3 Unit tests: `fold` (`test_sql_fold.py`)
Each numbered case: input tree, actor -> expected folded tree.
1. `ActorPresent()`, actor `None` -> `Const(FALSE)`; actor object -> `Const(TRUE)`.
2. `RolesMatch({"viewer"})`, actor roles `{"admin"}`, hierarchy admin -> editor -> viewer -> `Const(TRUE)`.
3. `RolesMatch({"admin"})`, actor `None` -> `Const(FALSE)`.
4. `R.author_id == A.id`, actor id 3 -> `Compare(eq, R.author_id, Literal(3))`.
5. `A.id == R.author_id` -> normalized `Compare(eq, R.author_id, Literal(3))`.
6. `A.level < R.min_level` -> `Compare(gt, R.min_level, Literal(level))` (flip).
7. `R.author_id == A.id`, actor without `id` -> `Const(UNKNOWN)`.
8. same, actor `None` -> `Const(UNKNOWN)`.
9. same, actor dict `{"id": 3}` -> `Compare(..., Literal(3))`.
10. `R.author_id == None` -> `Const(UNKNOWN)`.
11. `R.org_id.in_(A.org_ids)`, `org_ids = []` -> `Const(FALSE)`; `not_in` -> `Const(TRUE)`.
12. `R.org_id.in_(A.org_ids)`, `org_ids = "abc"` (a str) -> `Const(UNKNOWN)`.
13. `R.org_id.in_(A.org_ids)`, `org_ids = {1, 2}` -> `In(R.org_id, Literal((1, 2)) in some order)`.
14. `R.org_id.in_(A.org_ids)`, missing -> `Const(UNKNOWN)`.
15. `R.org_id.in_([1, object()])` via actor -> `In(..., Literal((1, None)))`.
16. `A.is_staff.is_(True)`, actor `None` -> `Const(UNKNOWN)` (Is table: MISSING).
17. `A.is_staff.is_(True) | (R.author_id == A.id)`, staff -> `Const(TRUE)`.
18. `(R.a == 1) & Const(FALSE)` -> `Const(FALSE)`.
19. `(R.a == 1) & Const(UNKNOWN)` -> `And((R.a == 1, Const(UNKNOWN)))`.
20. `(R.a == 1) | Const(UNKNOWN) | Const(UNKNOWN)` -> `Or((R.a == 1, Const(UNKNOWN)))` (dedupe).
21. `Not(Not(R.a == 1))` -> `R.a == 1`.
22. `Not(Const(UNKNOWN))` -> `Const(UNKNOWN)`.
23. `R.members.any(R.user_id == A.id)`, actor missing id -> where folds to `Const(UNKNOWN)` ->
    `Related(..., Const(UNKNOWN))` is kept (not `Const(FALSE)`: the answer depends on whether rows exist).
24. `R.members.any(R.user_id.in_([]))` -> where folds to `Const(FALSE)` -> `Const(FALSE)`.
25. `CustomCheck(rule with sql)` -> `SqlFragment(element)`; `sql` raises -> `SqlFragment(typed NULL)` + WARNING (caplog).
26. `CustomCheck(rule without sql)` -> `NotFilterableError`.
27. Full condition for an admin with `allow("*", Post, roles=["admin"])` and no deny -> `Const(TRUE)`.
28. Anonymous actor, only `AUTHENTICATED` rules -> `Const(FALSE)`.
29. Fold is a single pass: a tree of 10,000 nodes folds without `RecursionError` at depth 4 (wide, not deep).
30. Rule zero: for 200 random actor-only trees (Hypothesis), `fold` == `Const(evaluate(tree, actor, None))`.

### 6.4 Unit tests: `to_sql` and relationships
Compiled with `postgresql.dialect()` and `sqlite.dialect()`, `literal_binds` off.
1. `Const(TRUE)` -> PG `true`, SQLite `1`.
2. `Const(UNKNOWN)` -> `CAST(NULL AS BOOLEAN)` on both.
3. `Compare(eq, R.author_id, Literal(3))` -> `post.author_id = %(param_1)s` / `post.author_id = ?`, params `{param_1: 3}`.
4. All six operators render the right SQL operator.
5. `Compare(eq, R.a, R.b)` -> `post.a = post.b`, no params.
6. `In(R.org_id, (1, 2))` -> `post.org_id IN (__[POSTCOMPILE_param_1])`, params contain `[1, 2]`.
7. `In(..., negate=True)` -> `NOT IN`.
8. `Is(R.deleted_at, None)` -> `post.deleted_at IS NULL`; `negate` -> `IS NOT NULL`.
9. `Is(R.published, True)` -> PG `post.published IS true`, SQLite `post.published IS 1`.
10. `Not(And(...))` -> `NOT (... AND ...)`.
11. `_bind` uses the column type: `DateTime` literal on SQLite is processed to the stored string format (round trip test on DB).
12. Dotted, positive: `R.project.org_id == 5` -> `EXISTS (SELECT 1 FROM project WHERE project.id = post.project_id AND project.org_id = ?)`.
13. Dotted, negative: `~(R.project.org_id == 5)` -> `NOT (EXISTS (... AND (project.org_id = ?) IS NOT 0))` on SQLite.
14. Depth 3 dotted: three nested `EXISTS`.
15. `R.project.org_id == R.org_id` -> inner condition references `post.org_id` (correlated).
16. `R.members.any(user_id=A.id)` -> `EXISTS (SELECT 1 FROM member WHERE post.id = member.post_id AND member.user_id = ?)`.
17. Many-to-many `R.tags.any(R.name == "x")` -> `EXISTS` over the association table.
18. `R.owner.has(R.is_active.is_(True))` -> `EXISTS (SELECT 1 FROM user WHERE user.id = post.owner_id AND user.is_active IS 1)`.
19. `Related` with `Const(TRUE)` where -> `rel.any()` with no criterion.
20. `SqlFragment(Post.title.like("a%"))` -> rendered as given (inside `AND`).

DB-level checks for the same cases (`tests/integration/test_filter_db.py`, both backends): insert a
small fixed dataset (incl. `NULL`s and missing related rows) and assert the exact returned ids,
compared with `can()` on the same loaded objects. Sync `Session` and `AsyncSession` both.

### 6.5 Security, snapshots, scope, validate, custom checks
- `test_sql_bound_params.py`
  1. Sentinel values: `"zz_secret_9f3a"`, `987654321`, `"'; DROP TABLE post; --"`, a UUID, a
     datetime. Put each in literals and in actor attributes, for every operator. Compile on both
     dialects. Assert `str(value) not in sql_text` and the value is in `compiled.params` (or in the
     expanding list).
  2. Run the injection string against the DB: table still exists, correct rows returned.
  3. AST scan of `src/fastauthz/sql.py`: no call to `text`, `literal_column`, `literal`, `.compile(` with
     `literal_binds`, and no f-strings / `%` / `.format` building SQL. Fails the test if found.
- `test_sql_snapshots.py`: for the policies of `examples/blog`, `saas_multitenant`, `hospital` (as
  they will exist in M4; in M2 a copy lives in `tests/models.py`), for 3 fixed actors (admin,
  member, anonymous) x each action: compile on PG and SQLite and compare with
  `tests/unit/sql_snapshots/<policy>__<model>__<action>__<actor>__<dialect>.sql`. Set
  `FASTAUTHZ_UPDATE_SNAPSHOTS=1` to rewrite. No new dependency (TECH_STACK rule).
- `test_policy_scope.py`: INHERIT picks the policy scope; per-resource scope wins; `scope=None`
  has no scope; `bypass_scope=True` drops scope for that rule only; deny rules never get the scope;
  `with_scope=False` drops it everywhere; FA008 yes/no; FA012 yes/no; FA016 yes/no; anonymous user
  with scope -> `filter` is `false` / typed `NULL` and returns no rows.
- `test_policy_validate_sqla.py`: FA003 (unknown column, path ending on relationship, `.any` on
  scalar, `is_(True)` on non-bool), FA004 (dot through collection, `.has` on collection), FA005
  (depth 4) - each with one test that triggers it and one that does not; all problems reported in
  one `PolicyError`; plain class skips the checks; `configure_mappers` failure is reported.
- `test_policy_custom_checks.py`: `check=` only -> `can()` works, `filter()` raises
  `NotFilterableError`, FA013 notice; deny with `check=` only -> also non-filterable; `check=` +
  `sql=` -> filter uses the fragment; `sql=` alone -> `TypeError`; message has no rule name.
- `test_imports.py` (extended): subprocess with `sqlalchemy` blocked via a meta-path finder;
  `import fastauthz` works; `policy.filter(...)` raises `ModuleNotFoundError` with the install hint.

### 6.6 Differential property test (main TDD 14.3) - in full

#### 6.6.1 Schema (`tests/property/schema.py`)
```python
from datetime import datetime
import sqlalchemy as sa
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

C_STRING = sa.String(16).with_variant(sa.String(16, collation="C"), "postgresql")   # code-point order like Python


class Base(DeclarativeBase):
    pass


class Group(Base):
    __tablename__ = "pt_group"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    org_id: Mapped[int | None] = mapped_column(nullable=True)


class Item(Base):
    __tablename__ = "pt_item"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    owner_id: Mapped[int | None]
    org_id: Mapped[int | None]
    status: Mapped[str | None] = mapped_column(C_STRING)
    score: Mapped[int | None]
    published: Mapped[bool | None]
    deleted_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=False))
    group_id: Mapped[int | None] = mapped_column(sa.ForeignKey("pt_group.id"))
    group: Mapped[Group | None] = relationship(lazy="raise")
    tags: Mapped[list["Tag"]] = relationship(lazy="raise", order_by="Tag.id")


class Tag(Base):
    __tablename__ = "pt_tag"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    item_id: Mapped[int] = mapped_column(sa.ForeignKey("pt_item.id"))
    name: Mapped[str | None] = mapped_column(C_STRING)
```
- `lazy="raise"` makes any accidental lazy load an error, so the test proves the eager loading is
  complete (and the M1 lazy-load guard sees loaded attributes).
- `score` is `Integer`, not `Float`/`Numeric`: see 6.6.7.

#### 6.6.2 Value pools (small on purpose, so equal values and `NULL`s are common)
```python
INTS = st.integers(min_value=-2, max_value=3)
STRS = st.sampled_from(["", "a", "b", "B", "ab", "draft", "pub"])      # ASCII only; upper/lower case both
DATES = st.sampled_from([datetime(2026, 1, 1), datetime(2026, 1, 1, 0, 0, 1), datetime(2026, 6, 1, 12, 30)])
BOOLS = st.booleans()
def nullable(s): return st.none() | s     # about 1 in 2 NULL at the leaf; Hypothesis shrinks toward None
```

#### 6.6.3 Expression strategy (`tests/property/strategies.py`)
Grammar (Item context unless noted). Weights are relative; leaves only at depth 4.
```
expr(d)    := atom                                 w=6
            | And(expr(d+1), expr(d+1)[, expr(d+1)])   w=2   (only if d < 4)
            | Or(expr(d+1), expr(d+1)[, expr(d+1)])    w=2   (only if d < 4)
            | Not(expr(d+1))                       w=2   (only if d < 4)
atom       := cmp_int | cmp_str | cmp_bool | cmp_dt | cmp_rr | in_ | is_ | dotted | rel_any | rel_has | actor_only
cmp_int    := R.{owner_id|org_id|score} OP (Literal(nullable(INTS)) | A.{id|org_id|level})        OP in all 6
cmp_str    := R.status OP (Literal(nullable(STRS)) | A.name)                                      OP in all 6 (collation C)
cmp_bool   := R.published {==|!=} (Literal(nullable(BOOLS)) | A.is_staff)                        no ordering ops on bool
cmp_dt     := R.deleted_at OP Literal(nullable(DATES))
cmp_rr     := R.owner_id OP R.org_id | R.score OP R.owner_id
in_        := R.{owner_id|org_id|score}.{in_|not_in}(Literal(lists(nullable(INTS), max 3)) | A.org_ids)
            | R.status.{in_|not_in}(Literal(lists(nullable(STRS), max 3)))
is_        := R.{owner_id|status|deleted_at}.{is_|is_not}(None)
            | R.published.{is_|is_not}({None|True|False})
dotted     := R.group.org_id OP (Literal(nullable(INTS)) | A.org_id) | R.group.org_id.{is_|is_not}(None)
            | R.group.org_id.{in_|not_in}(Literal(...) | A.org_ids)
rel_any    := R.tags.any(tag_expr(d+1))  | R.tags.any(name=Literal(nullable(STRS)))   # R = Tag inside
rel_has    := R.group.has(group_expr(d+1))
tag_expr   := R.name OP (Literal|A.name) | R.name.{is_|is_not}(None) | R.name.{in_|not_in}(...) | And/Or/Not of these
group_expr := R.org_id OP (Literal|A.org_id) | R.org_id.is_(None) | And/Or/Not of these
actor_only := A.is_staff.{is_|is_not}({None|True|False}) | A.org_id OP Literal(INTS) | A.id.in_(Literal(...))
```
- Built with the real `R`/`A` builders (so builder bugs are found too), not by constructing nodes.
- Depth counted as in 3.6.4 is kept `<= 3` for relationship nesting; boolean nesting up to 4.
- Literal on the left sometimes (`Literal(2) < R.score` via `R.score > 2` flipped by the builder
  helper `flip_sides()`), to test normalization.
- Never generates `Literal == Literal` (build error by design) or two dotted paths in one atom.

Policy strategy:
```
policy_spec := PolicySpec(
    scope      = one_of(None, R.org_id == A.org_id),            # policy-wide
    allow      = lists(AllowSpec(actions ⊆ {"read","edit","*"} non-empty, who ∈ {ANYONE, AUTHENTICATED},
                                  roles ∈ {None, subset of {"admin","editor","viewer"}}, when ∈ {None, expr(0)},
                                  bypass_scope ∈ {False, True}), min 0, max 3),
    deny       = lists(DenySpec(actions, who, roles, when=expr(0)), min 0, max 2),
)
roles hierarchy fixed: {"admin": ["editor"], "editor": ["viewer"]}
build(spec) -> Policy (resources Item, Group, Tag declared; Item actions read, edit); freeze()
```
A `PolicyError` from `freeze()` fails the test (the strategy must only build valid policies);
warnings and notices are allowed.

#### 6.6.4 Row and actor strategies
```
groups   := lists(Group(id=1..4 unique, org_id=nullable(INTS)), max 4)
items    := lists(Item(id unique 1..12, owner_id, org_id, status, score, published, deleted_at all nullable,
                       group_id = nullable(sampled_from(existing group ids))), max 12)
tags     := for each item: lists(Tag(name=nullable(STRS)), max 3), ids assigned 1..n
actor    := none()
          | builds(SimpleNamespace, **subset_of({id: INTS|None, org_id: INTS|None, org_ids: lists(nullable(INTS)),
                                               level: INTS, name: nullable(STRS), is_staff: nullable(BOOLS),
                                               roles: frozensets(sampled_from(ROLE_NAMES))}))
          | same keys as a plain dict                                     # Mapping actor
actors   := lists(actor, min 1, max 4)
```
"subset_of" drops random keys, so attributes are missing (-> `MISSING`). Ids are explicit (no
sequences), so rollback fully resets the data.

#### 6.6.5 The tests (`tests/property/test_engines_agree.py`)
```python
@settings(deadline=None, suppress_health_check=[HealthCheck.too_slow, HealthCheck.data_too_large])
@given(case=cases())                   # cases() = policy_spec + rows + actors
@example(case=regressions.NULL_UNDER_NOT_DOTTED)          # seeded from day one (3.6.1)
@example(case=regressions.UNKNOWN_ITEM_UNDER_NOT_ANY)
@example(case=regressions.EMPTY_NOT_IN_THROUGH_NO_ROW)
def test_allowed_sets_equal(engine: sa.Engine, case: Case) -> None:
    policy = build(case.policy)
    with sa.orm.Session(engine) as session, session.begin():          # one transaction per example
        insert(session, case.rows)                                     # flush, no commit
        loaded = session.scalars(
            sa.select(Item).options(selectinload(Item.tags), selectinload(Item.group))
        ).all()
        for actor in case.actors:
            for action in ("read", "edit"):
                py_ids = {it.id for it in loaded if policy.can(actor, action, it)}
                sql_ids = set(session.scalars(sa.select(Item.id).where(policy.filter(actor, action, Item))))
                assert py_ids == sql_ids, explain_diff(policy, actor, action, loaded, py_ids, sql_ids)
        session.rollback()                                             # DB is empty again
```
- Python checks run on the **ORM-loaded** objects, not on the generated Python values. So values
  have made the round trip through the database (bool as int on SQLite, datetime string format),
  and type round-trip differences cannot cause false failures.
- `explain_diff` prints, for each differing id, `policy.explain(actor, action, row)` and the
  compiled SQL (with `literal_binds` **on**, only in this test-failure message).
- Exact-truth test (stronger, no `EXISTS`): `test_truth_values_equal` uses the same strategy with
  `dotted`, `rel_any`, `rel_has` weights set to 0, and selects
  `sa.case((cond, 1), (sa.not_(cond), 0), else_=-1)` per row; asserts it equals
  `evaluate(tree, actor, row).value` for every row and every rule's `when` tree on its own.
- Engine fixture is parametrized: SQLite in the default run; PostgreSQL under `-m postgres`.
- On SQLite with `StaticPool`, the single connection is reused; `session.begin()` + `rollback()`
  give isolation per example. On PostgreSQL the same; tables are created once per session.

#### 6.6.6 Profiles (`tests/conftest.py`)
```python
HYPOTHESIS_PROFILE_ENV = "HYPOTHESIS_PROFILE"
PROPERTY_EXAMPLES_DEV = 200        # local default; keeps `uv run pytest` under 60 s
PROPERTY_EXAMPLES_CI = 500         # main TDD 14.3: SQLite in every CI run
PROPERTY_EXAMPLES_CI_PG = 2000     # main TDD 14.3 / TASKS M2 done-when
PROPERTY_EXAMPLES_NIGHTLY = 20000

settings.register_profile("dev", max_examples=PROPERTY_EXAMPLES_DEV, deadline=None)
settings.register_profile("ci", max_examples=PROPERTY_EXAMPLES_CI, deadline=None, print_blob=True)
settings.register_profile("ci-postgres", max_examples=PROPERTY_EXAMPLES_CI_PG, deadline=None, print_blob=True)
settings.register_profile("nightly", max_examples=PROPERTY_EXAMPLES_NIGHTLY, deadline=None, print_blob=True)
settings.load_profile(os.environ.get(HYPOTHESIS_PROFILE_ENV, "dev"))
```
- `print_blob=True` prints a `@reproduce_failure` blob in CI logs.
- The `.hypothesis/` example database is git-ignored; it is not the place to keep regressions.

#### 6.6.7 Avoiding false failures from database differences
| Difference | Risk | What the strategy does | What users get (docs) |
|---|---|---|---|
| Boolean: PG real `boolean`, SQLite integer `0/1` | `IS true` vs `IS 1`; `1 == True` in Python | bool columns get only `==`, `!=`, `is_` with `None/True/False`; compare loaded objects (bools come back as `bool`); `.is_(True)` only on Boolean columns (FA003, Q7) | nothing special |
| Float vs Decimal / `numeric` vs `float8` | rounding and casting; NaN ordering on PG (NaN is greater than everything and equal to itself) | only `Integer` numbers in the property schema; separate PG unit tests with `Numeric` + `Decimal` and `Float` + exactly representable floats (0.5, 1.25) | "use the same type as the column; NaN in compared float columns is not supported" (Q8) |
| String order (`<`, `>`) | PG uses the DB collation (e.g. `en_US`: `"a" < "B"`); Python and SQLite `BINARY` use code-point order (`"B" < "a"`) | columns use `COLLATE "C"` on PG; ASCII-only pool with mixed case to keep the case covered | ordering comparisons on strings follow the database collation (Q9) |
| String equality with non-deterministic (case-insensitive ICU) collations | `=` may be true for `"a"` and `"A"` in PG | `C` collation | documented, not supported for rules |
| Datetime | SQLite stores text; time zones | naive datetimes only, fixed pool incl. one with seconds; `DateTime(timezone=False)` | use the same kind (naive / aware) as the column |
| Int range | PG `integer` overflows on big literals -> DB error | small ints | a literal outside the column range gives a DB error (fails closed, 500) |
| Cross-type compare (`int_col == "x"`) | PG raises, SQLite compares by affinity, Python says `False` | strategy keeps types matched | Q3: `UNKNOWN` in both engines |

### 6.7 Coverage
- `sql.py`: 100% branch coverage (core gate in main TDD 14.5 includes `sql`).
- New branches in `policy.py` and `expr.py`: 100%.
- `_compat.py` additions: covered by `test_compat_model_info.py`; not in the 100% core gate.

---

## 7. Tooling and CI changes

### 7.1 Dev dependencies (`pyproject.toml`, group `dev`)
```toml
"psycopg[binary]>=3.2",   # sync PostgreSQL driver (TECH_STACK)
"asyncpg>=0.30",          # async PostgreSQL driver (TECH_STACK)
"aiosqlite>=0.20",        # async SQLite driver (TECH_STACK)
```
No new runtime dependency. `sqlalchemy>=2.0` stays an extra.

### 7.2 Pytest config
```toml
[tool.pytest.ini_options]
markers = ["postgres: needs a local PostgreSQL (run with -m postgres)"]
anyio_backends = ["asyncio"]
```

### 7.3 CI job (`.github/workflows/ci.yml`)
```yaml
postgres:
  runs-on: ubuntu-latest
  strategy:
    matrix: { python: ["3.11", "3.15"] }
  services:
    postgres:
      image: postgres:18
      env: { POSTGRES_USER: fastauthz, POSTGRES_PASSWORD: fastauthz, POSTGRES_DB: fastauthz_test }
      ports: ["5432:5432"]
      options: >-
        --health-cmd "pg_isready -U fastauthz" --health-interval 5s --health-timeout 5s --health-retries 10
  env:
    FASTAUTHZ_TEST_PG_URL: postgresql+psycopg://fastauthz:fastauthz@localhost:5432/fastauthz_test
    HYPOTHESIS_PROFILE: ci-postgres
  steps:
    - uses: actions/checkout@<sha>
    - uses: astral-sh/setup-uv@<sha>
    - run: uv sync --all-extras --python ${{ matrix.python }}
    - run: uv run pytest -m postgres
```
The existing SQLite job sets `HYPOTHESIS_PROFILE=ci`. The SQLAlchemy {2.0, 2.1} axis of main TDD
15.2 applies to both jobs. Actions are pinned by SHA in M5; M2 may use tags.

### 7.4 Local PostgreSQL
```bash
docker run -d --name fastauthz-pg -p 5432:5432 \
  -e POSTGRES_USER=fastauthz -e POSTGRES_PASSWORD=fastauthz -e POSTGRES_DB=fastauthz_test postgres:18
uv run pytest -m postgres
```
`docker-compose.test.yml` holds the same settings.

---

## 8. Performance

- Target (main TDD 16.1): `compile_filter()` < 100 µs p50 for a 50-rule policy.
- `_condition` is cached per `(model, action, with_scope)`; built once.
- `reads_resource` flags are computed once at freeze; `fold` is one bottom-up pass, `O(nodes)`.
- Actor-only sub-trees are evaluated once each (no repeated `evaluate` of the same sub-tree:
  results are memoized in a per-call dict keyed by node, because the same scope node is shared by
  many rules).
- `ModelInfo` is computed at freeze; `to_sql` does dict lookups and `getattr(model, key)` only.
- Role expansion is cached (M1, `ROLE_CACHE_SIZE`).
- `to_sql` builds new SQLAlchemy objects per call (bound values differ per actor). If the M4
  benchmark misses the target, the planned optimization is caching the SQLAlchemy structure per
  `(model, action, folded shape)` and swapping values with `.params()`. Not built in M2.
- M2 measures once with `timeit` and writes the number in `core_docs/reports/M2_sql.md`.
- Query cost: one correlated `EXISTS` per hop (depth <= 3), no joins, so no duplicate rows and
  `LIMIT` stays correct (main TDD 9.4).

---

## 9. Security

- 9.1 **Bound parameters only.** Every value is `bindparam(..., unique=True)` or an expanding
  `IN` parameter. No `text()`, no `literal_column()`, no `literal_binds`. Enforced by
  `test_sql_bound_params.py` (sentinels + AST scan). Main TDD 17.1 row "SQL injection".
- 9.2 **Fail closed.** Missing / `None` actor values, bad option types, crashing `sql=` -> `UNKNOWN`.
  Root `UNKNOWN` -> typed `NULL` -> no rows. Main TDD 17.1 rows "`NULL` / missing values open access",
  "Custom check crashes".
- 9.3 **Core stays clean.** `policy.py` imports SQLAlchemy only under `TYPE_CHECKING` and lazily
  inside `filter()`; `test_imports.py` proves the runtime import rule.
- 9.4 **Tenant isolation.** Scope added to every allow rule by default; FA008 stops a missing
  scope column; `bypass_scope` is explicit and FA016 / FA012 make gaps visible. Main TDD 17.1 row
  "Tenant leak through an admin rule".
- 9.5 **No silent rule drop.** A non-filterable allow **or deny** rule makes the action
  non-filterable (`NotFilterableError`); it is never skipped.
- 9.6 **Polarity-aware `EXISTS`** (3.6.1) closes a fail-open gap in the main design under `NOT`
  (deny rules through relationships).
- 9.7 **Slow-query bound.** `MAX_RELATION_DEPTH` and one `EXISTS` per hop. Main TDD 17.1 row
  "Slow queries from deep relationships".
- 9.8 **Messages.** `NotFilterableError`, FA008 and others name models, actions, columns and
  source locations, never rule names or data values.

---

## 10. Risks, gaps in the main docs, open questions

Each item has a recommended answer. Accepted answers go into the main TDD/FSD in the same PR.

| # | Topic | Problem | Recommended answer |
|---|---|---|---|
| Q1 | `EXISTS` under `NOT` (main TDD 9.4 vs 6.2 / 7) | Plain `has()`/`any()` give `FALSE` where Python gives `UNKNOWN`; under `NOT` (all deny rules) SQL shows rows Python denies. | Polarity-aware `EXISTS` (3.6.1). Update main TDD 9.4 and add a row to TDD 17.1. |
| Q2 | Empty `IN` vs `NO_ROW` order (main TDD 6.2 vs 6.3) | `R.group.org_id.not_in([])` with no group: 6.3 says `TRUE` ("whatever the item"), 6.2 step 2 says `FALSE`. | **Resolved, same as M1 D4b:** `NO_ROW` is checked before empty options, so the result is `FALSE` (fail closed, and it is what SQL `has()` gives). fold turns an empty `In` into a `Const` only for a plain column; on a dotted path it keeps the `In` so it goes inside `has()`. Main TDD 6.3 ("whatever the item is") should be updated to say "except a `NO_ROW` path". |
| Q3 | Cross-type comparisons | `int_col == "x"`: Python `False`, `!=` gives `True` (fail open), PG raises, SQLite uses affinity. | Value-family rule in `truth.py` (number / str / bytes / bool / date / datetime / time / UUID / each Enum class): different families -> `UNKNOWN` in both engines; fold uses column `python_type`; unknown `python_type` skips the rule. Add to main TDD 6.3. |
| Q4 | Two relationship paths in one atom | `R.project.org_id == R.group.org_id` cannot be pushed into one `has()`. | Build-time `ExpressionError` in v1 ("at most one relationship path per comparison"). Add to main TDD 5.4. |
| Q5 | `Related` with a dotted prefix through `None` | Main TDD 7 does not say. | `FALSE` (like `NO_ROW`), matches `has()`. Add to main TDD 7. |
| Q6 | `.any()` on a scalar relationship | No main code for it. | Report as FA003 with a specific message (no new code). If a new code is preferred, add it to TDD 8.5, FSD F5 and `QUICK_REFERENCE.md` together. |
| Q7 | `.is_(True)` on a non-Boolean column | SQLite `1 IS 1` is `TRUE`; Python `1 is True` is `False`. | FA003 "`.is_(True/False)` needs a Boolean column". |
| Q8 | Float `NaN` | PG treats `NaN` as a normal, largest value; Python comparisons are `False`. | Literals: `ExpressionError` for `NaN`. Actor `NaN` -> `UNKNOWN`. Row `NaN` in compared float columns: documented as unsupported (cannot be fixed in SQL without extra conditions). |
| Q9 | String collation for `<`/`>` | Real apps use non-`C` collations; engines can disagree for ordering on strings. | Document clearly in the rules reference; property test uses `C`. Consider a warning in a later version (not a new code now). |
| Q10 | `~policy.filter(...)` | Breaks the polarity proof and the meaning. | Document "positive `WHERE` only". |
| Q11 | `aliased(Post)` / self-joins | Filter renders against the mapped class. | Not supported in v1; documented. |
| Q12 | Deferred / expired columns in the Python engine | M1's lazy-load guard covers relationships; a deferred or expired column also lazy-loads (and raises `MissingGreenlet` in async). | M1 guard should check any attribute in `inspect(obj).unloaded`, not only relationships. Note for M1 and main TDD 7. |
| Q13 | `uv run pytest -m postgres` "adds PostgreSQL" | With markers, `-m postgres` selects only PostgreSQL tests. | Keep the command; CI runs both commands. Fix the wording in CLAUDE.md / main TDD 14.1 ("runs the PostgreSQL tests"). |
| R1 | pyright strict with SQLAlchemy types | `has()`/`any()` and `bindparam` typing may need casts. | Wrap in small typed helpers in `sql.py`; no `# type: ignore` without a comment. |
| R2 | `IS NOT FALSE` rendering on SQLite | `IS NOT 0` relies on SQLite booleans being ints. | Tested on both DBs; `SQL_EXISTS_NEGATIVE_FORM` fallback. |
| R3 | Hypothesis runtime on PostgreSQL | 2,000 examples with DB round trips can be slow. | One transaction per example, small pools, `deadline=None`; separate CI job. |
| R4 | Schema drift (DB holds `NULL` in a `NOT NULL`-declared column) | — | Polarity-aware `EXISTS` does not rely on nullability, so no risk here. |
| R5 | SQLAlchemy 2.1 changes in `in_()` rendering | Snapshots differ by version. | Snapshots per SQLAlchemy minor version only if needed; the DB-level tests are the real check. |
| R6 | `configure_mappers()` at freeze | Fails if models are imported after the policy freezes. | Clear `PolicyError` (3.7); docs: define the policy after importing models. |
| R7 | Rule 4 and `TYPE_CHECKING` imports | Core annotations mention `ColumnElement`. | Allowed: no runtime import; `test_imports.py` is the gate. State it in main TDD 3. |

---

## 11. Exit criteria

- All tasks in `TASKS.md` ticked.
- `uv run pytest`, `uv run pytest -m postgres`, `uv run ruff check .`, `uv run ruff format --check .`,
  `uv run pyright` pass; output shown in the PR.
- `test_allowed_sets_equal` passes 500 examples on SQLite (`ci`) and 2,000 on PostgreSQL
  (`ci-postgres`); `test_truth_values_equal` passes the same counts.
- 100% branch coverage on `sql.py` and on new code in `expr.py` / `policy.py`.
- No value appears as SQL text (sentinel + AST tests green).
- Snapshot files committed for the three example policies on both dialects.
- Q1-Q13 decided; accepted answers written into the main TDD / FSD / `QUICK_REFERENCE.md`.
- `core_docs/reports/M2_sql.md` has the `compile_filter` timing and any Hypothesis bugs found.

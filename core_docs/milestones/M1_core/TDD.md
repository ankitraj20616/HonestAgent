# M1 - The core: Technical Design (TDD)

**Milestone:** M1 (about 25 hours)
**What:** `FSD.md` in this folder. **Steps:** `TASKS.md` in this folder.
**Main design:** `../../TDD-tech-design-doc.md`. This file adds detail for M1 only. It must not
contradict the main TDD. Where M1 has to choose something the main TDD does not say, the choice
is marked **Design decision** with its reason, and listed again in section 10.

---

## 1. Scope

### 1.1 In scope
| Area | Main TDD | Module |
|---|---|---|
| Expression tree, `R` / `A` builders, depth | 5.1-5.6 | `expr.py` |
| Custom check node (Python side only) | 5.7 | `expr.py`, `evaluate.py` |
| Truth values, Kleene logic, `MISSING`, `NO_ROW` | 6.1-6.4 | `truth.py` |
| Python evaluator, lazy-load guard | 7 | `evaluate.py` (+ `_compat.is_loaded`) |
| Policy objects, API, `_condition()`, `validate()`, `freeze()` | 8.1-8.5 | `policy.py` |
| Role hierarchy | 8.3 | `roles.py` |
| `Decision` dataclass (shape only), `Explanation` | 10.1 (shape), 10.2 | `decision.py` |
| Error classes | 11 | `errors.py` |
| Constants | 2 (principle 10), CLAUDE.md rule 8 | `config.py` |
| Public exports | 3, 4 | `__init__.py` |

### 1.2 Out of scope (later milestones)
- `sql.py`, `fold()`, `policy.filter()`, `SqlFragment` node: M2.
- FA003, FA004, FA008 (need SQLAlchemy model inspection): M2.
- `fastapi.py`, `openapi.py`, decision logging, `on_decision`, `require()` tree without scope: M3.
- `testing.py`, `cli.py`: M4.
- Everything in main TDD 20 ("Later").

### 1.3 Pulled forward from M3
- `_compat.is_loaded(obj, attr)` (main TDD 12.7). M1's evaluator needs it for the lazy-load guard
  (main TDD 7). See **Design decision D2** (3.4.6).

---

## 2. Files and folders

```
src/fastauthz/
  __init__.py      # CHANGED: public exports (3.9), NullHandler on the "fastauthz" logger
  config.py        # CHANGED: M1 constants (section 4)
  errors.py        # NEW: exception classes + PolicyProblem (3.8)
  truth.py         # NEW: Truth, and_/or_/not_, MISSING, NO_ROW (3.2)
  expr.py          # NEW: nodes, R, A, builders, helpers, depth() (3.1)
  evaluate.py      # NEW: evaluate(), EvalContext, value reading, lazy-load guard (3.4)
  roles.py         # NEW: RoleGraph (3.5)
  policy.py        # NEW: Who, Rule, ResourceSpec, Policy (3.6)
  decision.py      # NEW: Decision, RuleResult, Explanation, explain engine (3.7)
  _compat.py       # NEW (partial): is_loaded() only; no third-party import at module top (3.4.6)

tests/
  unit/
    test_expr.py
    test_truth.py
    test_evaluate.py
    test_evaluate_lazy.py        # needs sqlalchemy (dev extra); skipped if not installed
    test_roles.py
    test_policy_api.py
    test_policy_condition.py
    test_validate.py
    test_freeze.py
    test_can_check.py
    test_explain.py
    test_errors.py
    test_imports.py
  property/
    test_kleene_laws.py          # Hypothesis, Python engine only (M2 adds the SQL differential test)
  compat/
    test_compat_is_loaded.py
  typing/
    test_public_api_types.py     # pyright assert_type checks
  examples/
    test_m1_blog_script.py       # the "done when" script from FSD section 2
```

No new runtime dependency. Dev dependencies already added in M0 are enough (`sqlalchemy` comes in
through the `[sqlalchemy]` extra in `uv sync --all-extras`, used only by `test_evaluate_lazy.py`
and `tests/compat/`).

---

## 3. Module design

Common rules for every module in this section:
- `from __future__ import annotations` at the top.
- Only standard library imports (CLAUDE.md rule 4). `_compat.py` is the one exception, and even it
  imports SQLAlchemy only inside functions (3.4.6).
- Every public name has full type hints. pyright strict passes with 0 errors.
- No magic numbers or strings. They come from `config.py`.
- Logger: `_log = logging.getLogger(config.LOGGER_NAME)` (or a child: `config.LOGGER_NAME + ".evaluate"`).

### 3.1 `expr.py` - expression tree

#### 3.1.1 Type aliases

```python
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum, StrEnum
from typing import Any, Final, TypeAlias
from uuid import UUID

Scalar: TypeAlias = None | bool | int | float | str | bytes | Decimal | UUID | date | datetime | time | Enum
LiteralValue: TypeAlias = Scalar | tuple[Scalar, ...]          # tuple only inside In.options

class CompareOp(StrEnum):
    EQ = "eq"; NE = "ne"; LT = "lt"; LE = "le"; GT = "gt"; GE = "ge"

# Python symbol for each op, used by explain and error messages
OP_SYMBOLS: Final[Mapping[CompareOp, str]]   # {EQ: "==", NE: "!=", LT: "<", LE: "<=", GT: ">", GE: ">="}

Operand: TypeAlias = "ResourceAttr | ActorAttr | Literal"
Expr: TypeAlias = "Compare | In | Is | And | Or | Not | Related | Const | ActorPresent | RolesMatch | CustomCheck"
CheckFn: TypeAlias = Callable[[Any, Any], bool]          # (actor, resource) -> bool
SqlFn: TypeAlias = Callable[[Any, type], Any]            # (actor, model) -> ColumnElement[bool]; typed Any in core (no SQLAlchemy import)
```

- `Expr` includes the three internal nodes (D1, 3.1.4) so that `And.items` etc. are typed with one
  alias. Users still cannot build internal nodes (3.1.4).
- `SqlFn` returns `Any` in the core because the core cannot import SQLAlchemy types. `sql.py` (M2)
  narrows it.

#### 3.1.2 The operator mixin

Every condition node (not operands) gets `&`, `|`, `~` and a raising `__bool__` from one mixin:

```python
class _Condition:
    __slots__ = ()

    def __and__(self, other: object) -> Expr: ...      # all_of(self, _as_condition(other))
    def __rand__(self, other: object) -> Expr: ...     # all_of(_as_condition(other), self)
    def __or__(self, other: object) -> Expr: ...       # any_of(...)
    def __ror__(self, other: object) -> Expr: ...
    def __invert__(self) -> Expr: ...                  # negate(self)
    def __bool__(self) -> bool:                         # always raises
        raise ExpressionError(BOOL_MESSAGE)
```

- `BOOL_MESSAGE` text: `"A rule condition cannot be used as a Python bool. Use & | ~ instead of and / or / not, and put each comparison in parentheses: (R.a == 1) & (R.b == 2)."`
- `_as_condition(other)`:
  - `_Condition` instance -> itself.
  - `_Ref` -> `ExpressionError("R.<path> is a value, not a condition. Did you mean R.<path>.is_(True)?")`.
  - `bool` -> `ExpressionError("a Python bool is not a condition; use TRUE_ / FALSE_")`.
  - anything else -> `ExpressionError("cannot combine a condition with <type name>")`.
- `__bool__` raising is what catches `when=(R.a == 1) and (R.b == 2)`, `not R.a == 1`,
  `if node:` and chained comparisons like `1 < R.score < 5` (Python evaluates
  `(1 < R.score) and (R.score < 5)` and calls `__bool__` on the first part).
- Internal code must never test a node for truthiness. Use `is None` / `isinstance`.

#### 3.1.3 Public nodes

All nodes: `@dataclass(frozen=True, slots=True)`. They are hashable and compared by structure.
Validation runs in `__post_init__`, so a bad node cannot exist, even when built directly.

```python
@dataclass(frozen=True, slots=True)
class ResourceAttr:
    path: tuple[str, ...]            # len >= 1; ("author_id",) or ("project", "org_id")

@dataclass(frozen=True, slots=True)
class ActorAttr:
    path: tuple[str, ...]            # len >= 1

@dataclass(frozen=True, slots=True, eq=False)
class Literal:
    value: LiteralValue
    def __eq__(self, other: object) -> bool: ...      # compares _typed_key(self.value)
    def __hash__(self) -> int: ...                     # hash(_typed_key(self.value))

@dataclass(frozen=True, slots=True)
class Compare(_Condition):
    op: CompareOp
    left: Operand
    right: Operand

@dataclass(frozen=True, slots=True)
class In(_Condition):
    item: Operand                    # ResourceAttr or ActorAttr (Literal item only if options is ActorAttr)
    options: Literal | ActorAttr     # Literal(tuple) or an actor list
    negate: bool = False             # True for .not_in()

@dataclass(frozen=True, slots=True)
class Is(_Condition):
    item: ResourceAttr | ActorAttr
    value: None | bool
    negate: bool = False             # True for .is_not()

@dataclass(frozen=True, slots=True)
class And(_Condition):
    items: tuple[Expr, ...]          # len >= 2 after normalising (helpers below)

@dataclass(frozen=True, slots=True)
class Or(_Condition):
    items: tuple[Expr, ...]

@dataclass(frozen=True, slots=True)
class Not(_Condition):
    item: Expr

@dataclass(frozen=True, slots=True)
class Related(_Condition):
    path: tuple[str, ...]            # relationship names, len >= 1
    kind: Literal_["any", "has"]     # typing.Literal, imported as Literal_ to avoid the name clash
    where: Expr                      # Const(TRUE) when no condition was given

@dataclass(frozen=True, slots=True)
class Const(_Condition):
    value: Truth

TRUE_: Final = Const(Truth.TRUE)
FALSE_: Final = Const(Truth.FALSE)
UNKNOWN_: Final = Const(Truth.UNKNOWN)       # internal; produced by validation folding, not by users
```

`__post_init__` checks (all raise `ExpressionError`):

| Node | Check | Message idea |
|---|---|---|
| `ResourceAttr`, `ActorAttr` | `path` non-empty; every part is a `str`, non-empty, does not start with `_`, is a valid identifier (`str.isidentifier()`) | "attribute names must not start with '_' (got R._secret)" |
| `Literal` | value passes `_check_literal` (below) | "value of type X cannot be used in a rule" |
| `Compare` | at least one side is `ResourceAttr` or `ActorAttr` | "comparing two plain values is always the same; this is probably a mistake" |
| `Compare` | **D5:** not both sides `ResourceAttr` with `len(path) > 1` | "both sides follow a relationship; this has no clean SQL form in v1" |
| `Compare` | a side that is a condition node (`_Condition`) is rejected | "comparing with a condition: missing parentheses? write (R.a == 1) & (R.b == 2)" |
| `In` | `options` is a `Literal` whose value is a `tuple`, or an `ActorAttr`; never `ResourceAttr` (main TDD 5.4) | "R.<x> cannot be used as the list in in_()" |
| `In` | if `options` is a `Literal`, `item` must be `ResourceAttr` or `ActorAttr` | same as Compare |
| `Is` | `value` is `None`, `True` or `False` (checked with `is`, so `1` and `0` are rejected) | "is_() takes None, True or False" |
| `And`, `Or` | every item is an `Expr` node | "cannot combine ..." |
| `Related` | path non-empty, valid names | as attrs |

Note on the Compare-with-condition row: main TDD 5.3 says `fastauthz check` warns (FA014) about a
`Compare` whose operand is an `And` / `Or`. The builder already refuses to build such a node, so
the mistake is caught even earlier, on the line where it is written. FA014 stays in `validate()`
as a backstop (3.6.8). This is stricter than the main TDD, never weaker.

#### 3.1.3.1 Literal equality includes the type

**Design decision D3.** `Literal.__eq__` and `__hash__` use `_typed_key(value)`:

```python
def _typed_key(v: LiteralValue) -> object:
    if isinstance(v, tuple):
        return ("tuple", tuple(_typed_key(x) for x in v))
    return (type(v), v)
```

Reason: in Python `1 == True == 1.0` and `hash(1) == hash(True)`. With plain dataclass equality,
`Literal(1)` and `Literal(True)` would be "the same node". M2's `fold` removes duplicate items
from `And` / `Or` by hash, so `(R.x == 1) | (R.x == True)` could silently lose one branch, and
the two have different SQL meaning. Including the type makes node identity safe.

#### 3.1.3.2 Literal value checking and normalising

```python
def _check_literal(v: object, *, allow_tuple: bool) -> LiteralValue: ...
```

Steps:
1. `v is None` -> `None`.
2. `type(v) is bool` -> as is. (Checked before `int`, because `bool` is a subclass of `int`.)
3. `isinstance(v, Enum)` -> as is. (Before `str`/`int`, so `StrEnum` / `IntEnum` stay enums.)
4. `isinstance(v, (int, str, bytes, Decimal, UUID, date, time))` -> as is. (`datetime` is a
   subclass of `date`, so it is covered.)
5. `isinstance(v, float)` -> **D6:** `math.isnan(v)` raises `ExpressionError` ("NaN cannot be
   compared safely: Python says NaN != NaN, PostgreSQL says NaN = NaN"). Infinity is allowed.
   Same for `Decimal` NaN (`v.is_nan()`).
6. `allow_tuple` and `isinstance(v, (list, tuple))` -> `tuple(_check_literal(x, allow_tuple=False) for x in v)`
   (order kept).
7. `allow_tuple` and `isinstance(v, (set, frozenset))` -> same, but sorted with
   `key=lambda x: (type(x).__name__, repr(x))` so the order is the same on every run (M2 SQL
   snapshots must be stable; set order depends on hash randomisation).
8. Anything else (including `str` / `bytes` when a list is expected, `dict`, generators, model
   objects) -> `ExpressionError("value of type <name> cannot be used in a rule")`.

`str` passed to `.in_()` is rejected on purpose: `R.status.in_("open")` would otherwise become
`("o", "p", "e", "n")`.

#### 3.1.4 Internal nodes

**Design decision D1.** Main TDD 8.4 uses `ActorPresent()`, `RolesMatch(frozenset)` and a
`CustomCheck(rule)` node, but the node table in main TDD 5.1 does not list them. M1 defines them in
`expr.py`:

```python
@dataclass(frozen=True, slots=True)
class ActorPresent(_Condition):
    """TRUE if the actor is not None, else FALSE. Built only by Policy for who=AUTHENTICATED."""

@dataclass(frozen=True, slots=True)
class RolesMatch(_Condition):
    roles: frozenset[str]            # rule needs at least one of these (after expanding actor roles)

@dataclass(frozen=True, slots=True)
class CustomCheck(_Condition):
    rule_name: str                   # for logs and explain
    check: CheckFn
    sql: SqlFn | None                # M2 uses it; M1 only stores it
```

- `CustomCheck` holds the two callables and the rule name, not the `Rule` object. Reason: `Rule`
  lives in `policy.py`, which imports `expr.py`; holding the name avoids an import cycle. Functions
  are hashable by identity, so the node stays hashable.
- **Users cannot build them in rules.** They are not exported from `fastauthz` and are not
  documented. `Policy.allow()` / `deny()` / `Policy(scope=...)` / `resource(scope=...)` walk the
  given tree with `contains_internal(expr) -> bool` and raise `ExpressionError("internal node in
  a rule")` if one is found. They are only ever created inside `Policy._rule_term()` (3.6.6).
- Evaluate behaviour: 3.4.4.
- `SqlFragment(element)` (main TDD 9.2) is the fourth internal node. It belongs to `sql.py` and is
  created only by `fold` in M2. M1 does not define it.

#### 3.1.5 `_Ref`, `R` and `A`

```python
class _Ref:
    __slots__ = ("_side", "_path")

    def __init__(self, side: Literal_["R", "A"], path: tuple[str, ...] = ()) -> None: ...
    def __getattr__(self, name: str) -> _Ref: ...
    def __getitem__(self, name: str) -> _Ref: ...            # D8, see below
    def __eq__(self, other: object) -> Compare: ...          # pyright: ignore[reportIncompatibleMethodOverride]
    def __ne__(self, other: object) -> Compare: ...          # pyright: ignore[reportIncompatibleMethodOverride]
    def __lt__(self, other: object) -> Compare: ...
    def __le__(self, other: object) -> Compare: ...
    def __gt__(self, other: object) -> Compare: ...
    def __ge__(self, other: object) -> Compare: ...
    def __hash__(self) -> int: ...                           # hash((self._side, self._path))
    def __bool__(self) -> bool: ...                          # raises ExpressionError(BOOL_MESSAGE)
    def __repr__(self) -> str: ...                           # "R.project.org_id"
    def in_(self, options: object) -> In: ...
    def not_in(self, options: object) -> In: ...
    def is_(self, value: None | bool) -> Is: ...
    def is_not(self, value: None | bool) -> Is: ...
    def any(self, where: Expr | None = None, /, **eq: object) -> Related: ...
    def has(self, where: Expr | None = None, /, **eq: object) -> Related: ...

R: Final = _Ref("R")
A: Final = _Ref("A")
```

Behaviour:
- `__getattr__(name)`:
  - only called when normal lookup fails, so `_side` / `_path` (slots) and the methods are found
    normally;
  - `name.startswith("_")` -> `ExpressionError` (main TDD 5.2). This also makes dunder probes by
    other libraries (`__array__`, `_repr_html_`, ...) fail fast instead of building a path;
  - returns `_Ref(self._side, self._path + (name,))`.
- `__getitem__(name)` (**D8**): same as `__getattr__` but lets users reach a column whose name
  clashes with a builder method: `R["any"]`, `R["in_"]`, `R["has"]`. Same `_` and identifier
  checks. Cost: about 5 lines; without it such columns cannot be used at all.
- Operators: `_to_operand(self)` and `_to_operand(other)`, then `Compare(op, left, right)`.
  - `_to_operand(x)`: `_Ref` with empty path -> `ExpressionError("R needs an attribute: R.<name>")`;
    `_Ref` -> `ResourceAttr(path)` / `ActorAttr(path)`; condition node -> rejected (3.1.3 table);
    any other value -> `Literal(_check_literal(x, allow_tuple=False))`.
  - Reflected comparisons need no code: `3 < R.score` -> Python calls `R.score.__gt__(3)`.
  - `R.a == None` builds `Compare(EQ, R.a, Literal(None))`. It is legal but always UNKNOWN;
    `validate()` reports FA015.
- `in_(options)` / `not_in(options)`:
  - `options` is an `A` ref -> `ActorAttr` options;
  - `options` is an `R` ref -> `ExpressionError` (main TDD 5.4);
  - otherwise `Literal(_check_literal(options, allow_tuple=True))`, and the result must be a
    `tuple` (so a single scalar like `.in_(5)` is rejected).
- `is_(value)` / `is_not(value)`: `Is(item, value, negate=False/True)`.
- `any(where, **eq)` / `has(where, **eq)`:
  - only allowed on `R` refs with a non-empty path. `A.x.any()` -> `ExpressionError`
    ("relationships can only be followed on R");
  - `where` must be `None` or a condition node (`_Ref` -> the "value, not a condition" error);
  - each `key=value` becomes `Compare(EQ, ResourceAttr((key,)), _to_operand(value))`. Inside
    `.any()` / `.has()`, `R` means the related row (main TDD 5.2), so the key is a column of the
    related model. Keys are sorted so the tree is deterministic;
  - final `where = all_of(where?, *eq_parts)`; if nothing was given, `where = TRUE_`
    ("at least one related row exists" / "the related row exists");
  - returns `Related(self._path, kind, where)`.
- `__hash__` is required because `__eq__` is overridden (Python would set `__hash__ = None`).
  Main TDD 5.2. `_Ref` objects are not put in sets by the library itself; this keeps them usable
  as dict keys by users and tools.
- `__repr__` gives `R.project.org_id` (used in error messages).

#### 3.1.6 Combining helpers (normalising)

```python
def all_of(*items: Expr) -> Expr: ...     # And, flattened
def any_of(*items: Expr) -> Expr: ...     # Or, flattened
def negate(item: Expr) -> Expr: ...       # Not, with ~~a == a
```

`all_of`:
1. Flatten: an item that is an `And` contributes its `items`.
2. Zero items -> `TRUE_`. One item -> that item.
3. Otherwise `And(tuple(items))`. Order is kept (short-circuit order matters for custom checks,
   3.6.6). Duplicates are **not** removed here (that is M2 `fold`'s job, and D3 makes it safe).

`any_of`: the same with `Or`; zero items -> `FALSE_`.

`negate`: `Not(x)` -> returns `x.item` (main TDD 5.3: `~~a` is `a`). Otherwise `Not(item)`.
No other simplification in M1 (for example `~TRUE_` stays `Not(TRUE_)`); this keeps the tree the
user wrote, which makes `explain` and `matrix` (M4) output match the source.

`a & b` = `all_of(a, b)`, so `And((a, And((b, c))))` never exists: it is `And((a, b, c))`.

#### 3.1.7 Tree walking helpers

```python
def iter_nodes(expr: Expr) -> Iterator[Expr | Operand]: ...       # pre-order, includes operands
def contains_internal(expr: Expr) -> bool: ...                      # ActorPresent/RolesMatch/CustomCheck inside
def reads_actor(expr: Expr) -> bool: ...                            # any ActorAttr / ActorPresent / RolesMatch
def depth(expr: Expr | Operand) -> int: ...
```

`iter_nodes` is iterative (explicit stack), so very deep user trees do not hit the recursion limit
in validation. `evaluate` itself is recursive (main TDD 7); trees deep enough to hit the recursion
limit are not realistic for rules, and Python raises `RecursionError` at build time of such trees
anyway (flattening keeps `&` chains flat).

#### 3.1.8 Depth counting

Main TDD 5.6: hops in one path plus nesting of `Related` must be `<= config.MAX_RELATION_DEPTH`.

```
depth(node):
    ResourceAttr(path)        -> len(path) - 1          # every step before the last is a many-to-one hop
    ActorAttr / Literal       -> 0                       # actor paths are read in Python, never SQL
    Compare(l, r)             -> max(depth(l), depth(r))
    In(item, options)         -> max(depth(item), depth(options))
    Is(item)                  -> depth(item)
    And / Or (items)          -> max(depth(i) for i in items)
    Not(item)                 -> depth(item)
    Related(path, where)      -> len(path) + depth(where)  # each path step is one EXISTS
    Const / ActorPresent / RolesMatch / CustomCheck -> 0
```

Examples (all with `MAX_RELATION_DEPTH = 3`):

| Expression | Depth | OK? |
|---|---|---|
| `R.author_id == A.id` | 0 | yes |
| `R.project.org_id == A.org_id` | 1 | yes |
| `R.members.any(user_id=A.id)` | 1 | yes |
| `R.ward.doctors.any(id=A.id)` | 2 (`ward`, `doctors` in path) | yes |
| `R.project.members.any(R.user.org.id == A.org_id)` | 2 + 2 = 4 | no -> FA005 |
| `R.a.b.c.d == 1` | 3 | yes |
| `R.a.b.c.d.e == 1` | 4 | no -> FA005 |

The check is **not** done at build time. It is FA005 in `validate()` (3.6.8), so it is reported
together with all other problems, with the rule's file and line. Note: `.any()` on a one-to-many
path written with dots before it (`R.project.members.any(...)`) is legal: `project` is
many-to-one, `members` is the collection. Whether each hop really has the right direction is FA004
(M2, needs SQLAlchemy).

### 3.2 `truth.py` - truth values

```python
class Truth(Enum):
    TRUE = 1
    FALSE = 0
    UNKNOWN = -1

    def __bool__(self) -> bool: ...      # raises TypeError (D7)

def and_(*values: Truth) -> Truth: ...
def or_(*values: Truth) -> Truth: ...
def not_(value: Truth) -> Truth: ...

class Sentinel(Enum):
    MISSING = "MISSING"
    NO_ROW = "NO_ROW"
    def __repr__(self) -> str: ...       # "MISSING" / "NO_ROW"
    def __bool__(self) -> bool: ...      # raises TypeError

MISSING: Final = Sentinel.MISSING
NO_ROW: Final = Sentinel.NO_ROW
Value: TypeAlias = object                # a read value: anything, or a Sentinel
```

- The numbers `1, 0, -1` are from main TDD 6.1 and are part of the public enum. They are **not**
  used for ordering.
- **Design decision D7: `Truth.__bool__` raises `TypeError`** ("compare with Truth.TRUE; UNKNOWN
  must not be truthy"). Reason: Python enums are truthy by default, so `if evaluate(...):` would
  treat `UNKNOWN` and `FALSE` as "yes" and open access. Raising turns that bug into a crash in
  tests. All library code writes `result is Truth.TRUE`.
- `MISSING` / `NO_ROW` also refuse `__bool__` for the same reason.
- Kleene with an internal rank (FALSE < UNKNOWN < TRUE):

```python
_RANK: Final = {Truth.FALSE: 0, Truth.UNKNOWN: 1, Truth.TRUE: 2}

def and_(*values):           # min rank; and_() == TRUE
    result = Truth.TRUE
    for v in values:
        if v is Truth.FALSE: return Truth.FALSE
        if v is Truth.UNKNOWN: result = Truth.UNKNOWN
    return result

def or_(*values):            # max rank; or_() == FALSE
    result = Truth.FALSE
    for v in values:
        if v is Truth.TRUE: return Truth.TRUE
        if v is Truth.UNKNOWN: result = Truth.UNKNOWN
    return result

def not_(v):
    return {TRUE: FALSE, FALSE: TRUE, UNKNOWN: UNKNOWN}[v]
```

`_RANK` is only used by tests and by the Hypothesis reference model; the functions above do not
need it. `truth.py` imports nothing from the package (it raises a plain `TypeError`), so it sits
at the bottom of the import graph.

### 3.3 Truth rules used by the evaluator (main TDD 6)

This section is the exact contract. `evaluate.py` implements it; M2 `fold` + `to_sql` must give
the same result for every row.

#### 3.3.1 Reading values

A read gives one of: a normal Python value, `None`, `MISSING`, or `NO_ROW` (resource dotted paths
only). Algorithm in 3.4.2.

| Situation | Value |
|---|---|
| actor is `None`, rule reads `A.x` | `MISSING` |
| attribute does not exist (`AttributeError`), or key not in a `Mapping` | `MISSING` |
| attribute getter raises another exception | `MISSING` + WARNING (3.4.2) |
| SQLAlchemy relationship / column not loaded (lazy-load guard) | `MISSING` + WARNING |
| attribute exists and is `None` | `None` |
| resource path `R.a.b`, `resource.a` is `None` | `NO_ROW` |
| actor path `A.a.b`, `actor.a` is `None` | `MISSING` (no `NO_ROW` on the actor side; actor paths are not SQL) |
| `resource` itself is `None` (only `require()` in M3) | `MISSING` for every `R.x` |

#### 3.3.2 Order of checks for one `Compare`

Main TDD 6.2 order. `lv`, `rv` are the read values; "resource side" = operand is `ResourceAttr`.

1. Any **non-resource** side is `None` or `MISSING` -> `UNKNOWN`.
2. Any resource side is `NO_ROW` -> `FALSE`.
3. Any resource side is `MISSING` -> `UNKNOWN`.
4. Any resource side is `None` -> `UNKNOWN`.
5. **D6:** either value is a float or `Decimal` NaN -> `UNKNOWN` (fail closed; see 10).
6. Apply the operator (`operator.eq`, `ne`, `lt`, `le`, `gt`, `ge`). Result `True` -> `TRUE`,
   `False` -> `FALSE`. A `TypeError` (for example `3 < "a"`) -> `UNKNOWN`, logged at DEBUG.
   A result that is not a `bool` (rare, for example numpy) -> `bool(result)` inside `try`; on
   error -> `UNKNOWN`.

Why step 1 is before step 2: `R.project.org_id == A.org_id` with an anonymous actor must be
`UNKNOWN` even when the post has no project, because M2 folds the whole comparison to
`Const(UNKNOWN)` before it ever builds `has()`.

**NO_ROW and negation inside the leaf (D4).** `!=` is a plain operator, so
`R.project.org_id != 5` with no project is `FALSE` (step 2), not `TRUE`. SQL agrees:
`Post.project.has(Project.org_id != 5)` is `FALSE` when no related row exists. The same applies to
`not_in` and `is_not` (3.3.3, 3.3.4): the negation is compiled **inside** `has()`, so a `NO_ROW`
leaf is `FALSE` whatever its `negate` flag is. Only an outer `Not(...)` node turns it into `TRUE`
(SQL `NOT has(...)` is `TRUE` when no row exists). The main TDD says "any Compare / In / Is that
reads a NO_ROW path is FALSE"; D4 just spells out that this includes the negated forms.

#### 3.3.3 `In` (`in_` / `not_in`)

Order (**D4b**, see 10.3 for why it differs slightly from the wording of main TDD 6.3):

1. `options` is an `ActorAttr` and its value is `None`, `MISSING`, not iterable, or a `str` /
   `bytes` / `Mapping` -> `UNKNOWN` (bad shapes also log a WARNING once per rule).
2. `item` is a resource dotted path and its value is `NO_ROW` -> `FALSE` (also for `not_in`, D4).
3. options are empty -> `in_`: `FALSE`, `not_in`: `TRUE`, whatever the item is (even `None` or
   `MISSING`).
4. item value is `None` or `MISSING` -> `UNKNOWN`.
5. Let `known = [o for o in options if o is not None]`.
   - item equals some `o` in `known` (`==`, NaN never equal) -> `in_` result `TRUE`;
   - else, if `None` is in options -> `UNKNOWN`;
   - else -> `FALSE`.
6. `not_in` = `not_(in_ result)` from step 5.

Full table for `x.in_(opts)` / `x.not_in(opts)`:

| item `x` | options | `in_` | `not_in` |
|---|---|---|---|
| any (not NO_ROW) | `()` | FALSE | TRUE |
| NO_ROW | `()` | FALSE | FALSE |
| NO_ROW | `(1, 2)` | FALSE | FALSE |
| `None` | `(1, 2)` | UNKNOWN | UNKNOWN |
| MISSING | `(1, 2)` | UNKNOWN | UNKNOWN |
| `1` | `(1, 2)` | TRUE | FALSE |
| `3` | `(1, 2)` | FALSE | TRUE |
| `1` | `(1, None)` | TRUE | FALSE |
| `3` | `(1, None)` | UNKNOWN | UNKNOWN |
| `3` | `(None,)` | UNKNOWN | UNKNOWN |
| any | `A.ids` is MISSING / None | UNKNOWN | UNKNOWN |
| any | `A.ids` is `"abc"` (str) | UNKNOWN | UNKNOWN |

The empty-options row matches SQLAlchemy's "empty IN" rendering (`expanding` bind parameters):
`x IN ()` is false and `x NOT IN ()` is true even for `NULL` `x`.

#### 3.3.4 `Is`

Order: (1) actor item `MISSING` -> `UNKNOWN`; (2) resource item `NO_ROW` -> `FALSE` (also for
`is_not`, D4); (3) resource item `MISSING` -> `UNKNOWN`; (4) table; (5) `is_not` = `not_(table)`.

| Expression | value `None` | value `MISSING` | value `True` | value `False` | other value (`1`, `"x"`, `0`) | NO_ROW |
|---|---|---|---|---|---|---|
| `x.is_(None)` | TRUE | UNKNOWN | FALSE | FALSE | FALSE | FALSE |
| `x.is_(True)` | FALSE | UNKNOWN | TRUE | FALSE | FALSE | FALSE |
| `x.is_(False)` | FALSE | UNKNOWN | FALSE | TRUE | FALSE | FALSE |
| `x.is_not(None)` | FALSE | UNKNOWN | TRUE | TRUE | TRUE | FALSE |
| `x.is_not(True)` | TRUE | UNKNOWN | FALSE | TRUE | TRUE | FALSE |
| `x.is_not(False)` | TRUE | UNKNOWN | TRUE | FALSE | TRUE | FALSE |

- "value `True`" is checked with `value is True` (so `1` is "other"). The `numpy.bool_` case is
  "other". Rules for booleans should use Boolean columns; M2 FA003 checks the column type.
- `A.banned_at.is_(None)` for an anonymous actor is `UNKNOWN` (main TDD 6.3): it never lets an
  anonymous user in, and `~A.banned_at.is_(None)` does not either.

#### 3.3.5 `And`, `Or`, `Not` (Kleene)

| a | b | a AND b | a OR b | NOT a |
|---|---|---|---|---|
| T | T | T | T | F |
| T | F | F | T | F |
| T | U | U | T | F |
| F | T | F | T | T |
| F | F | F | F | T |
| F | U | F | U | T |
| U | T | U | T | U |
| U | F | F | U | U |
| U | U | U | U | U |

All 9 pairs are tested for `and_` / `or_`, and all 3 values for `not_`. `And` / `Or` nodes with
more than two items fold left with the same table (Kleene AND / OR are associative and
commutative).

#### 3.3.6 `Related`

| Case | `any` | `has` |
|---|---|---|
| a dotted step before the relationship is `None` (`R.project.members.any(...)`, no project) | FALSE | FALSE |
| relationship value is `MISSING` (not loaded, no attribute) | UNKNOWN | UNKNOWN |
| relationship value is `None` | UNKNOWN (D9: a collection is never `None`; treat as unclear) | FALSE (main TDD 7: `NULL` foreign key) |
| collection is empty | FALSE | - |
| value is not a collection (`str`, `bytes`, `Mapping`, not iterable) for `any` | UNKNOWN + WARNING | - |
| some item gives TRUE | TRUE (stop) | - |
| no TRUE, some UNKNOWN | UNKNOWN | - |
| all FALSE | FALSE | - |
| `has`: related object present | - | result of `where` on it |

Inside `where`, the related object is the resource, the actor is unchanged.

#### 3.3.7 Internal nodes

| Node | Result |
|---|---|
| `ActorPresent()` | actor `is not None` -> TRUE, else FALSE |
| `RolesMatch(roles)` | actor `None` -> FALSE (an anonymous actor has no roles). `ctx.actor_roles is None` (could not be read) -> UNKNOWN. `ctx.actor_roles & roles` non-empty -> TRUE, else FALSE. `roles` empty -> FALSE. |
| `CustomCheck(name, check, sql)` | `check(actor, resource)` returned exactly `True` -> TRUE; exactly `False` -> FALSE; any other return value -> UNKNOWN + WARNING ("custom check returned <type>, expected bool"); raised any `Exception` -> UNKNOWN + WARNING with `exc_info`, message includes the rule name, never the actor or resource |

`BaseException` subclasses that are not `Exception` (`KeyboardInterrupt`, `SystemExit`,
`asyncio.CancelledError`) are **not** caught. Catching them would break shutdown and cancellation.

`RolesMatch` gives FALSE (not UNKNOWN) for an anonymous actor so that a deny rule with
`roles=["intern"]` does not block every anonymous request through `NOT UNKNOWN`. That is safe:
anonymous actors are already stopped by `ActorPresent` on allow rules.

#### 3.3.8 Final decision

`condition = allow_part AND NOT deny_part` (built in 3.6.6). Access only if the result
`is Truth.TRUE`. Same as main TDD 6.4.

### 3.4 `evaluate.py` - Python evaluator

#### 3.4.1 API

```python
@dataclass(frozen=True, slots=True)
class EvalContext:
    actor_roles: frozenset[str] | None = frozenset()   # expanded roles; None = could not be read
    trace: list[TraceEntry] | None = None              # explain only (3.7.3); None = no tracing

@dataclass(frozen=True, slots=True)
class TraceEntry:
    node: Expr
    result: Truth
    values: tuple[object, ...]                          # read values of the operands, in order
    note: str = ""                                      # e.g. "3 rows checked", "raised ValueError"

def evaluate(expr: Expr, actor: object | None, resource: object | None,
             ctx: EvalContext | None = None) -> Truth: ...
```

- The first three parameters are exactly the main TDD 7 signature. `ctx` is an added keyword with
  a default, so the main signature still works.
- `ctx=None` means `EvalContext()` with no roles (so `RolesMatch` is FALSE). `Policy` always
  passes a real context.
- `EvalContext.trace` is a `list` inside a frozen dataclass; the list is owned by one `explain()`
  call and never shared.

#### 3.4.2 Reading a path

```python
def read_path(root: object | None, path: tuple[str, ...], *, side: Literal_["R", "A"]) -> object: ...
```

```
read_path(root, path, side):
    if root is None:
        return MISSING
    cur = root
    for i, name in enumerate(path):
        last = (i == len(path) - 1)
        if isinstance(cur, Mapping):
            if name not in cur: return MISSING
            cur = cur[name]
        else:
            if _is_unloaded(cur, name):            # lazy-load guard (3.4.6)
                _warn_unloaded(cur, name)
                return MISSING
            try:
                cur = getattr(cur, name)
            except AttributeError:
                return MISSING
            except Exception:                      # a @property that raises
                _log.warning("reading %s.%s raised; treated as missing", type(cur).__name__, name, exc_info=True)
                return MISSING
        if cur is None and not last:
            return NO_ROW if side == "R" else MISSING
    return cur
```

- `Mapping` check uses `collections.abc.Mapping`, so `dict`, `MappingProxyType` and custom
  mappings work. Keys are the path strings.
- A dict value that is `None` at an intermediate step on the `R` side is also `NO_ROW`.
- The warning never includes the value or the object's `repr` (it may contain personal data):
  only the type name and attribute name.
- The read for `Related` uses the same function for the path, then treats the last value as the
  collection / related object (3.3.6).

#### 3.4.3 The evaluator

One recursive function with one `match` (main TDD 7):

```python
def _eval(e: Expr, actor: object | None, res: object | None, ctx: EvalContext) -> Truth:
    match e:
        case Const(value=v):
            return v
        case ActorPresent():
            return TRUE if actor is not None else FALSE
        case RolesMatch(roles=need):
            ...                                                    # 3.3.7
        case Compare(op=op, left=l, right=r):
            return _compare(op, l, r, actor, res, ctx)             # 3.3.2
        case In(item=i, options=o, negate=n):
            return _in(i, o, n, actor, res, ctx)                   # 3.3.3
        case Is(item=i, value=v, negate=n):
            return _is(i, v, n, actor, res, ctx)                   # 3.3.4
        case And(items=items):
            out = TRUE
            for it in items:
                t = _eval(it, actor, res, ctx)
                if t is FALSE: return FALSE                        # short-circuit
                if t is UNKNOWN: out = UNKNOWN
            return out
        case Or(items=items):
            out = FALSE
            for it in items:
                t = _eval(it, actor, res, ctx)
                if t is TRUE: return TRUE                          # short-circuit
                if t is UNKNOWN: out = UNKNOWN
            return out
        case Not(item=it):
            return not_(_eval(it, actor, res, ctx))
        case Related(path=p, kind=k, where=w):
            return _related(p, k, w, actor, res, ctx)              # 3.3.6
        case CustomCheck():
            return _custom(e, actor, res, ctx)                     # 3.3.7
        case _:
            raise TypeError(f"unknown node {type(e).__name__}")   # bug guard; unreachable for valid trees
```

- Short-circuit gives the same result as the full Kleene table (`FALSE` absorbs `AND`, `TRUE`
  absorbs `OR`). A Hypothesis test proves it against a non-short-circuit reference (6.2).
- Short-circuit also means a custom check is not called when an earlier part of its `And` is
  `FALSE` (for example `ActorPresent` for an anonymous actor). Rule terms put `CustomCheck` last
  for this reason (3.6.6).
- When `ctx.trace` is not `None`, every leaf (`Compare`, `In`, `Is`, `Related`, `ActorPresent`,
  `RolesMatch`, `CustomCheck`) appends one `TraceEntry` after it is evaluated. Leaves inside a
  `Related.where` are **not** traced (the `Related` entry carries a note such as
  `"3 rows checked"`), to keep explain output short. The check is a single `if ctx.trace is not
  None`, so normal calls pay almost nothing.
- `evaluate()` is the public wrapper: it fills a default `ctx` and calls `_eval`.

#### 3.4.4 Leaf helpers

- `_value(operand, actor, res) -> object`: `Literal` -> `.value`; `ActorAttr` ->
  `read_path(actor, path, side="A")`; `ResourceAttr` -> `read_path(res, path, side="R")`.
- `_compare`: reads both sides once, then 3.3.2.
- `_in`: options read once; an actor list is turned into a `tuple` once per call.
- `_is`: 3.3.4.
- `_related(path, kind, where, ...)`:
  ```
  v = read_path(res, path, side="R")
  if v is NO_ROW: return FALSE
  if v is MISSING: return UNKNOWN
  if kind == "has":
      return FALSE if v is None else _eval(where, actor, v, ctx)
  # kind == "any"
  if v is None: return UNKNOWN                                    # D9
  if isinstance(v, (str, bytes, Mapping)) or not isinstance(v, Iterable):
      warn once; return UNKNOWN
  out = FALSE
  for item in v:
      t = _eval(where, actor, item, ctx)
      if t is TRUE: return TRUE
      if t is UNKNOWN: out = UNKNOWN
  return out
  ```
  Note the guard on the last path step: `read_path` already runs the lazy-load guard on the
  relationship attribute itself, so an unloaded `post.members` is `MISSING` -> `UNKNOWN`.
- `_custom(node, actor, res, ctx)`: 3.3.7. Logs with `_log.warning("custom check %r failed; treated as UNKNOWN (deny)", node.rule_name, exc_info=True)`.

#### 3.4.5 Warnings without flooding logs

The lazy-load warning and the "bad shape" warnings can fire on every request. They are logged at
WARNING the first time for each key (`(type name, attribute)` or rule name) and at DEBUG after
that. Keys are kept in a module-level `set` capped at `config.WARN_ONCE_MAX_KEYS`; when full,
everything is logged at DEBUG. `set.add` is atomic under the GIL and thread-safe in free-threaded
builds, so no lock is needed; a race can at worst log the same WARNING twice.

#### 3.4.6 Lazy-load guard (Design decision D2)

Problem: main TDD 7 says `evaluate()` calls `_compat.is_loaded(obj, name)` before reading an
attribute. But `evaluate.py` is a core module (must not import SQLAlchemy, CLAUDE.md rule 4), and
`_compat.py` is the module that touches SQLAlchemy.

Decision:

```python
# evaluate.py
_is_loaded_fn: Callable[[object, str], bool] | None = None

def _is_unloaded(obj: object, name: str) -> bool:
    if sys.modules.get("sqlalchemy") is None:       # not imported (or blocked with None) -> no SA objects can exist
        return False
    global _is_loaded_fn
    if _is_loaded_fn is None:
        from fastauthz._compat import is_loaded       # local import; SQLAlchemy is already in sys.modules
        _is_loaded_fn = is_loaded
    return not _is_loaded_fn(obj, name)
```

Why this is correct:
- An object can only be a SQLAlchemy-mapped instance if SQLAlchemy was imported first. If
  `sqlalchemy` is not in `sys.modules`, there is nothing to guard.
- The core never causes the import of SQLAlchemy itself. `_compat` is imported only when
  SQLAlchemy is already loaded by the user, so no new third-party import happens.
- `sys.modules.get(...) is None` (not `"sqlalchemy" in sys.modules`) because the import-block
  test (6.1, `test_imports.py`) blocks a package by setting `sys.modules["sqlalchemy"] = None`.
  With `in`, the guard would try to import `_compat`, which would fail.
- The cached function makes the guard one dict lookup plus one call per attribute read.

`_compat.py` in M1:

```python
# _compat.py  (no third-party import at module top; each function imports what it needs)
def is_loaded(obj: object, attr: str) -> bool:
    """True if reading obj.attr cannot start a database load."""
    from sqlalchemy import inspect as sa_inspect
    state = sa_inspect(obj, raiseerr=False)
    if state is None:                    # not a mapped instance (plain object, dict, ...)
        return True
    if state.transient or state.pending: # never flushed: reading never loads
        return True
    return attr not in state.unloaded    # persistent or detached: unloaded attrs would load or raise
```

- `state.unloaded` covers relationships **and** expired or deferred columns. Reading those can
  start a refresh query (sync) or raise `MissingGreenlet` (async) or `DetachedInstanceError`
  (detached). All three become `MISSING` -> `UNKNOWN` -> deny, with a WARNING that suggests
  eager loading or the SQL path (`filter()` / `load()`).
- Transient and pending objects (for example `Post(**body)` built for `guard.check("create", ...)`
  in M3) read normally: an unset column is `None`, which is the expected value.
- Rule for M3: `_compat.py` must keep "no third-party import at module top", because the core
  can import it whenever SQLAlchemy is loaded, even if FastAPI is not installed. A contract test
  checks this (6.1, `test_compat_is_loaded.py`, case C5).

Main TDD 5.1 and 7 should be updated to describe D1 and D2 (section 10).

### 3.5 `roles.py` - role hierarchy

```python
class RoleGraph:
    def __init__(self) -> None: ...
    def add(self, mapping: Mapping[str, Iterable[str]], *, source: str) -> None: ...
    def defined(self) -> frozenset[str]: ...                 # all keys and all included roles
    def includes(self, role: str) -> frozenset[str]: ...     # direct includes
    def find_cycles(self) -> list[tuple[str, ...]]: ...
    def freeze(self) -> None: ...
    def expand(self, roles: frozenset[str]) -> frozenset[str]: ...
```

- Storage: `dict[str, set[str]]` before freeze, then `dict[str, frozenset[str]]`. Also
  `dict[str, str]` role -> source of the `roles()` call that first mentioned it (for FA006 /
  FA007 messages).
- `add()` merges: calling `policy.roles()` twice unions the includes.
- Argument checks (raise `TypeError` / `ValueError` immediately, D10): mapping keys and values are
  non-empty `str`; a value that is a `str` (`{"admin": "editor"}`) is a `TypeError`, because
  iterating it would give `"e", "d", ...`; a role name `"*"` is a `ValueError`.
- `defined()` = keys plus every role in every value. So `{"admin": ["editor"]}` defines both
  `admin` and `editor`.

**Cycle detection** (iterative DFS, three colours, deterministic):

```
find_cycles():
    WHITE, GREY, BLACK = 0, 1, 2
    colour = {r: WHITE for r in defined()}
    cycles = []
    for start in sorted(colour):
        if colour[start] != WHITE: continue
        stack = [(start, iter(sorted(includes(start))))]
        path = [start]; colour[start] = GREY
        while stack:
            node, children = stack[-1]
            child = next(children, None)
            if child is None:
                colour[node] = BLACK; stack.pop(); path.pop(); continue
            if colour[child] == GREY:                     # back edge -> cycle
                i = path.index(child)
                cycles.append(tuple(path[i:]) + (child,)) # e.g. ("admin", "editor", "admin")
            elif colour[child] == WHITE:
                colour[child] = GREY; path.append(child)
                stack.append((child, iter(sorted(includes(child)))))
    return cycles
```

- A self loop `{"a": ["a"]}` gives `("a", "a")`.
- Each back edge is reported once; the same loop is not reported twice from different starts
  because nodes turn BLACK.
- Sorting makes the order of problems stable across runs.

**Expansion** (BFS):

```
_expand_uncached(roles):
    seen = set(roles); queue = deque(roles)
    while queue:
        r = queue.popleft()
        for inc in includes(r):          # roles not in the graph have no includes
            if inc not in seen: seen.add(inc); queue.append(inc)
    return frozenset(seen)
```

- Roles on the actor that are not in the graph are kept as they are (main TDD 8.3: actor-only
  roles are not checked).
- `freeze()` wraps it per instance:
  `self._expand = functools.lru_cache(maxsize=config.ROLE_CACHE_SIZE)(self._expand_uncached)`.
  Per instance (not a module-level cache) so two policies never share entries and the graph
  object is not kept alive by a global cache. The key is the `frozenset` of the actor's roles.
- Before `freeze()`, `expand()` calls the uncached function (used by `validate()` only).
- Expansion runs only on a graph without cycles (`freeze()` refuses to finish with FA006), but
  the BFS with `seen` is safe even with cycles.

### 3.6 `policy.py`

#### 3.6.1 Small types

```python
class Who(Enum):
    AUTHENTICATED = "authenticated"
    ANYONE = "anyone"

AUTHENTICATED: Final = Who.AUTHENTICATED
ANYONE: Final = Who.ANYONE

class _Inherit(Enum):
    INHERIT = "inherit"
INHERIT: Final = _Inherit.INHERIT                 # default for resource(scope=...)

Effect: TypeAlias = Literal_["allow", "deny"]
ActionsArg: TypeAlias = str | Iterable[str]

def default_actor_roles(actor: object) -> Iterable[str]:   # getattr(actor, "roles", ())
def default_actor_id(actor: object) -> object:             # getattr(actor, "id", None)
```

#### 3.6.2 Data objects (main TDD 8.1, with M1 additions)

```python
@dataclass(frozen=True, slots=True)
class Rule:
    name: str
    effect: Effect
    actions: frozenset[str]
    resource: type
    who: Who
    roles: frozenset[str] | None
    when: Expr | None
    check: CheckFn | None
    sql: SqlFn | None
    bypass_scope: bool
    source: str
    index: int                      # M1 addition: position among all rules of the policy (stable order)

@dataclass(frozen=True, slots=True)
class ResourceSpec:
    model: type
    actions: frozenset[str]
    scope: Expr | None | _Inherit   # as given; resolved by Policy.scope_for(model)
    id_column: str
    source: str                     # M1 addition: where resource() was called (for FA008, FA010, FA012)
```

The added fields (`index`, `source`) do not change the meaning of the main TDD objects; they are
needed for stable ordering and for file:line in problems.

#### 3.6.3 `Policy` constructor and state

```python
class Policy:
    def __init__(self, *, scope: Expr | None = None,
                 actor_roles: Callable[[Any], Iterable[str]] = default_actor_roles,
                 actor_id: Callable[[Any], object] = default_actor_id) -> None: ...
```

State:
- `_scope: Expr | None`, `_scope_source: str` (source of the `Policy(...)` call).
- `_resources: dict[type, ResourceSpec]` (insertion order kept).
- `_rules: list[Rule]`; after freeze a `tuple[Rule, ...]`.
- `_rules_by_model: dict[type, list[Rule]]`.
- `_names: set[str]` (for duplicate name checks).
- `_roles: RoleGraph`.
- `_actor_roles`, `_actor_id`.
- `_frozen: bool`, `_freeze_lock: threading.Lock`.
- after freeze: `_conditions: dict[tuple[type, str], Expr]`, `_type_cache: dict[type, type | None]`.

`scope` is checked like `when` (3.6.5, `_check_condition`).

#### 3.6.4 Source capture

```python
def _caller_source() -> str: ...
```

```
frame = inspect.currentframe()
if frame is None: return config.UNKNOWN_SOURCE                    # non-CPython without frames
f = frame.f_back
while f is not None and f.f_globals.get("__name__", "").split(".")[0] == "fastauthz":
    f = f.f_back                                                  # skip every frame inside the package
if f is None: return config.UNKNOWN_SOURCE
filename = f.f_code.co_filename
try:
    rel = os.path.relpath(filename)                               # relative to cwd
    shown = rel if not rel.startswith("..") else filename
except ValueError:                                                # Windows: different drive
    shown = filename
del frame, f                                                      # break reference cycles
return f"{shown}:{f.f_lineno}"
```

- The frame used is **the first frame outside the `fastauthz` package**, i.e. the user's line
  that called `policy.allow(...)`. Walking out by module name (not a fixed `sys._getframe(2)`)
  keeps it right when calls go through internal helpers (`allow` -> `_add_rule` ->
  `_caller_source`) or through future wrappers.
- Cost: only at definition time (import of the user's `authz.py`), never per request.
- Used by `Policy()`, `resource()`, `allow()`, `deny()`, `roles()`.
- The `fastauthz` package's own tests define rules from `tests/...` modules, whose `__name__` is
  not `fastauthz...`, so tests see real file:line values.

#### 3.6.5 Methods (main TDD 8.2)

All mutating methods start with `self._ensure_not_frozen()` (raises `PolicyFrozenError`) and
return `self` (chaining).

```python
def roles(self, mapping: Mapping[str, Iterable[str]]) -> Self: ...
def resource(self, model: type, *, actions: ActionsArg,
             scope: Expr | None | _Inherit = INHERIT, id_column: str = config.DEFAULT_ID_COLUMN) -> Self: ...
def allow(self, actions: ActionsArg, resource: type, *, who: Who = AUTHENTICATED,
          roles: Iterable[str] | None = None, when: Expr | None = None,
          check: CheckFn | None = None, sql: SqlFn | None = None,
          bypass_scope: bool = False, name: str | None = None) -> Self: ...
def deny(self, actions: ActionsArg, resource: type, *, who: Who = ANYONE,
         roles: Iterable[str] | None = None, when: Expr | None = None,
         check: CheckFn | None = None, sql: SqlFn | None = None,
         name: str | None = None) -> Self: ...
def validate(self) -> list[PolicyProblem]: ...
def freeze(self) -> Self: ...
@property
def frozen(self) -> bool: ...
def can(self, actor: object | None, action: str, obj: object) -> bool: ...
def check(self, actor: object | None, action: str, obj: object) -> None: ...
def explain(self, actor: object | None, action: str, obj: object) -> Explanation: ...
def scope_for(self, model: type) -> Expr | None: ...          # resolved scope (INHERIT -> policy scope)
def rules_for(self, model: type, action: str) -> tuple[Rule, ...]: ...   # matching action or "*", in order
def _condition(self, action: str, model: type) -> Expr: ...   # main TDD 8.4
```

Argument checks at call time (**D10**: Python usage errors raise `TypeError` / `ValueError` right
away; policy meaning problems are collected by `validate()` so they all show at once):

| Call | Check | Error |
|---|---|---|
| `resource` | `model` is a class (`isinstance(model, type)`) | `TypeError` |
| `resource` | model already declared | `ValueError("Post is declared twice")` |
| `resource` | `actions` is a `str` (one action) or an iterable of `str`; non-empty | `TypeError` / `ValueError` |
| `resource` | every action matches `config.ACTION_NAME_PATTERN`; `"*"` is not allowed here | `ValueError` |
| `resource` | `scope` is `INHERIT`, `None`, or a condition node (`_check_condition`) | `ExpressionError` |
| `resource` | `id_column` is a valid identifier | `ValueError` |
| `allow`/`deny` | `actions` as above, but `"*"` allowed; `["*", "read"]` is normalised to `{"*"}` | `TypeError` / `ValueError` |
| `allow`/`deny` | `resource` is a class (declared or not; FA002 handles undeclared) | `TypeError` |
| `allow`/`deny` | `who` is a `Who` | `TypeError` |
| `allow`/`deny` | `roles` is `None` or an iterable of `str` that is not itself a `str` | `TypeError` |
| `allow`/`deny` | `when` passes `_check_condition` | `ExpressionError` |
| `allow`/`deny` | `check` / `sql` are callables or `None`; `sql` without `check` | `TypeError` / `ValueError("sql= needs check=")` |
| `allow`/`deny` | `name` unique among rules of this policy | `ValueError` |
| `allow` | `bypass_scope` is a `bool` | `TypeError` |

`_check_condition(x)`:
- `None` -> ok (means "always TRUE").
- `_Ref` -> `ExpressionError("R.published is a value, not a condition. Did you mean R.published.is_(True)?")`.
- `bool` -> `ExpressionError("when= got a Python bool; build the condition with R and A")`.
- not a condition node -> `ExpressionError`.
- `contains_internal(x)` -> `ExpressionError` (D1).

`roles=[]` is accepted and stored as `frozenset()`. It can never match; `validate()` reports
FA011 for it.

#### 3.6.6 Building the condition (main TDD 8.4)

```
_rule_term(rule, spec_scope, *, with_scope=True) -> Expr:
    parts = []
    if rule.who is AUTHENTICATED: parts.append(ActorPresent())
    if rule.roles is not None:    parts.append(RolesMatch(rule.roles))
    if rule.effect == "allow" and with_scope and not rule.bypass_scope and spec_scope is not None:
        parts.append(spec_scope)
    if rule.when is not None:     parts.append(rule.when)
    if rule.check is not None:    parts.append(CustomCheck(rule.name, rule.check, rule.sql))
    return all_of(*parts)        # no parts -> TRUE_

_build_condition(action, model, *, with_scope=True) -> Expr:
    scope = self.scope_for(model)
    allow = [ _rule_term(r, scope, with_scope=with_scope) for r in rules_for(model, action) if r.effect == "allow" ]
    deny  = [ _rule_term(r, scope, with_scope=with_scope) for r in rules_for(model, action) if r.effect == "deny" ]
    return all_of(any_of(*allow), negate(any_of(*deny)))
```

- Part order: actor-only parts first (cheap, and they short-circuit for anonymous actors), then
  scope and `when`, then the custom check last (so it runs only when needed, 3.4.3). Kleene AND
  is commutative, so the order does not change any result; it only changes cost and which
  functions are called.
- No allow rules -> `any_of()` = `FALSE_` -> the condition is FALSE for everyone (default deny).
- No deny rules -> `negate(FALSE_)` = `Not(FALSE_)` -> TRUE. Kept as a node (no simplification,
  3.1.6); cost is one tiny step.
- Deny terms never get the scope (main TDD 8.2, 8.4).
- `_condition(action, model)` reads `self._conditions[(model, action)]`. The cache is filled in
  `freeze()` for **every** declared `(model, action)` pair, so there is no lock or race at request
  time, and the dict is never written after freeze.
- `with_scope=False` is the `require()` tree (main TDD 8.4, 12.4). M1 has the parameter; M3 adds
  the cache and the API.

#### 3.6.7 Auto names

```
auto_name(model, actions_in_given_order, n) = f"{model.__name__}.{','.join(actions)}#{n}"
```

- `n` = 1-based position of the rule among all rules (allow and deny) **on that model**, counted
  when the rule is added. Examples: `Post.edit#1`, `Post.*#3`, `Post.edit,delete#2`.
- Format string: `config.AUTO_RULE_NAME_FORMAT`.
- Duplicate actions in the input are removed, first occurrence kept.
- The duplicate-name check (3.6.5) also runs on auto names. If a user-given `name` equals an
  auto name (for example the user named a rule `Post.edit#2`), `ValueError` tells the user to
  rename it. No silent suffixes.

#### 3.6.8 `validate()` (main TDD 8.5)

Returns `list[PolicyProblem]`. Never raises (except for bugs). Order: by level (error, warning,
notice), then by the order the source objects were defined (rules by `index`, resources by
declaration order), then by code.

**FA codes in M1** (no SQLAlchemy needed):

| Code | Level | Exact check in M1 | Message (what + where + fix) |
|---|---|---|---|
| FA001 | error | rule's resource is declared, and some action in `rule.actions` (except `"*"`) is not in `spec.actions` | "Rule Post.eidt#2 uses action 'eidt', which Post does not declare (declared: delete, edit, read). Fix the name or add it to resource(Post, actions=...)." |
| FA002 | error | `rule.resource not in self._resources` | "Rule X targets Post, which is not declared. Add policy.resource(Post, actions=[...])." |
| FA005 | error | `depth(rule.when) > MAX_RELATION_DEPTH`, or `depth(scope) > MAX` for a resource scope or the policy scope | "Rule X follows 4 relationships; the limit is 3 (config.MAX_RELATION_DEPTH)." |
| FA006 | error | each cycle from `RoleGraph.find_cycles()` | "Role cycle: admin -> editor -> admin (defined at authz.py:5)." |
| FA007 | error | a role in `rule.roles` is not in `RoleGraph.defined()` | "Rule X needs role 'admn', which is not defined in policy.roles(...). Did you mean 'admin'?" (suggestion via `difflib.get_close_matches`, cutoff `config.SUGGEST_CUTOFF`) |
| FA009 | warning | allow rule with `who=ANYONE`, `when is None`, `check is None`, `roles is None`, and (resource scope is `None` or `bypass_scope`) | "Rule X lets anyone, even users who are not logged in, do 'read' on Post." |
| FA010 | warning | a declared action with no allow rule matching it (directly or via `"*"`) | "Nobody can ever do 'archive' on Post: there is no allow rule for it." |
| FA011 | warning | `_static(rule_term_without_who)` is FALSE or UNKNOWN (below) | allow: "Rule X can never match." / deny that is always UNKNOWN: "Deny rule X is always UNKNOWN, so it blocks every request for these actions." |
| FA012 | notice | declared resource whose resolved scope is `None` while the policy has a scope, **or** declared with explicit `scope=None` | "Post has no tenant scope (scope=None)." |
| FA013 | notice | rule with `check` and no `sql` | "Rule X uses check= without sql=, so filter()/query()/load() cannot be used for 'publish' on Post." |
| FA014 | warning | any `Compare` / `In` / `Is` whose operand is a condition node (only reachable if a node was built in an unusual way; the builder rejects it, 3.1.3) | "Rule X compares a value with a condition. Missing parentheses?" |
| FA015 | warning | `Compare` with op `EQ` / `NE` and a `Literal(None)` side, in `when` or a scope | "Rule X uses == None, which is never TRUE. Use .is_(None) / .is_not(None)." |
| FA016 | warning | allow rule, `who=ANYONE`, resolved scope is not `None`, `reads_actor(scope)`, `bypass_scope=False` | "Rule X is for anyone, but Post's scope reads A, so users who are not logged in can never match it. Add bypass_scope=True if it is public." |

**FA codes that wait for M2** (need SQLAlchemy model inspection): FA003 (path not on model), FA004
(dotted path through one-to-many / many-to-many), FA008 (scope column missing on the model).
In M1, `validate()` does not report them, and for plain Python classes they are skipped forever
(main TDD 8.5 FA003 note).

`_static(e) -> Truth | None` (used by FA011; `None` = "depends on data or actor"):

```
Const(v)                         -> v
RolesMatch(roles) if not roles   -> FALSE
In(_, Literal(()), negate=False) -> FALSE          # empty in_ is FALSE for every value, even NO_ROW
Compare with a Literal(None) side -> UNKNOWN
And(items)  -> FALSE if any FALSE; else UNKNOWN if any UNKNOWN and the rest TRUE; else TRUE if all TRUE; else None
Or(items)   -> TRUE if any TRUE; FALSE if all FALSE; UNKNOWN if all are FALSE/UNKNOWN with >= 1 UNKNOWN; else None
Not(x)      -> not_(_static(x)) if not None
anything else -> None
```

The rule term checked is the term from 3.6.6 **without** `ActorPresent` (that part depends on the
actor, not on a mistake). For an allow rule, FALSE or UNKNOWN means "never TRUE" -> FA011. For a
deny rule, FALSE -> FA011 "never matches"; UNKNOWN -> FA011 "blocks every request" (because
`NOT UNKNOWN` is UNKNOWN). This catches `deny(..., when=R.locked == None)` early, which would
otherwise deny every request.

#### 3.6.9 `freeze()`

```
freeze():
    with self._freeze_lock:
        if self._frozen: return self                        # second call is a no-op
        problems = self.validate()
        errors = [p for p in problems if p.level == "error"]
        if errors:
            raise PolicyError(problems)                    # all problems; message lists the errors
        for p in problems:                                  # warnings and notices do not stop freeze
            _log.log(WARNING if p.level == "warning" else INFO, "%s %s %s", p.code, p.source, p.message)
        self._roles.freeze()
        self._rules = tuple(self._rules)
        self._resources = MappingProxyType(dict(self._resources))
        self._conditions = { (m, a): self._build_condition(a, m)
                             for m, spec in self._resources.items() for a in sorted(spec.actions) }
        self._frozen = True
    return self
```

- A failed `freeze()` leaves the policy **unfrozen**, so a developer can fix it in a REPL. Every
  later call (`can()` etc.) tries `freeze()` again and raises again: an invalid policy can never
  answer a question.
- After freeze, all mutating methods raise `PolicyFrozenError`.
- The lock makes first-use freeze safe when two threads (or a threadpool route and an async
  route) call `can()` at the same time on an unfrozen policy. After freeze, reads take no lock:
  `_ensure_frozen()` checks the `_frozen` flag first.
- `_ensure_frozen()`: `if not self._frozen: self.freeze()` (first-use freeze, main TDD 8.2).

#### 3.6.10 `can()`, `check()`

```
_resolve_model(obj):
    if obj is None: raise TypeError("obj is None; pass the object to check")
    t = type(obj)
    cached = self._type_cache.get(t, _NOT_SET)
    if cached is _NOT_SET:
        cached = next((k for k in t.__mro__ if k in self._resources), None)   # subclasses map to the declared base
        self._type_cache[t] = cached                                         # cap: config.TYPE_CACHE_MAX
    if cached is None: raise UnknownResourceError(t.__name__)
    return cached

_context(actor) -> EvalContext:
    if actor is None: return EvalContext(actor_roles=frozenset())
    try:
        raw = self._actor_roles(actor)
        if isinstance(raw, (str, bytes)): raise TypeError("actor_roles returned a str")
        names = frozenset(raw)
        if not all(isinstance(r, str) for r in names): raise TypeError("roles must be str")
    except Exception:
        _log.warning("actor_roles failed; roles treated as UNKNOWN", exc_info=True)   # warn-once key
        return EvalContext(actor_roles=None)
    return EvalContext(actor_roles=self._roles.expand(names))

can(actor, action, obj):
    self._ensure_frozen()
    model = self._resolve_model(obj)
    if action not in self._resources[model].actions: raise UnknownActionError(model.__name__, action)
    tree = self._conditions[(model, action)]
    return evaluate(tree, actor, obj, self._context(actor)) is Truth.TRUE

check(actor, action, obj):
    start = perf_counter_ns()
    if self.can(actor, action, obj): return None
    raise Denied(self._decision(actor, action, obj, model, allowed=False, kind="check", start=start))
```

- Subclass lookup: SQLAlchemy single/joined table inheritance and plain subclasses map to the
  nearest declared base in the MRO. The cache dict is written at request time; dict writes are
  atomic, and a race only computes the same value twice. Its size is capped by
  `config.TYPE_CACHE_MAX` (new types are not cached once full).
- `can()` raises for an undeclared action or resource instead of returning `False`. Reason: a
  typo in code should be loud. It still never gives access.
- `actor_roles` failing gives `None` roles -> `RolesMatch` UNKNOWN -> fail closed.
- `_decision()` builds a `Decision` (3.7.1) with `resource_id = _safe_id(obj, spec.id_column)`
  (read with `read_path`; `MISSING` -> `None`; a value that is not a `Scalar` -> `None`, so no
  object is stored) and `actor_id = self._actor_id(actor)` inside `try` (error or non-scalar ->
  `None`). `matched_rules` and `denied_by` are empty in M1 (see 10.7).

### 3.7 `decision.py`

#### 3.7.1 Decision (shape from main TDD 10.1)

```python
DecisionKind: TypeAlias = Literal_["check", "filter", "load", "require"]

@dataclass(frozen=True, slots=True)
class Decision:
    allowed: bool
    action: str
    resource_type: str
    resource_id: object | None
    actor_id: object | None
    kind: DecisionKind
    matched_rules: tuple[str, ...]
    denied_by: tuple[str, ...]
    duration_us: int
```

M1 defines the class (because `Denied` carries it) and fills it in `check()`. Logging, the
`fastauthz.decisions` logger and `on_decision` are M3.

#### 3.7.2 Explanation objects

```python
@dataclass(frozen=True, slots=True)
class RuleResult:
    name: str
    effect: Literal_["allow", "deny"]
    result: Truth
    because: str
    source: str

@dataclass(frozen=True, slots=True)
class Explanation:
    allowed: bool
    action: str
    resource_type: str
    actor_id: object | None
    resource_id: object | None
    rules: tuple[RuleResult, ...]
    def __str__(self) -> str: ...
```

#### 3.7.3 `explain()` algorithm

```
Policy.explain(actor, action, obj):
    ensure_frozen; model = resolve_model(obj); check action declared (same errors as can)
    base_ctx = self._context(actor)
    results = []
    for rule in rules_for(model, action):                  # definition order
        trace = []
        ctx = EvalContext(actor_roles=base_ctx.actor_roles, trace=trace)
        term = self._rule_term(rule, self.scope_for(model))
        t = evaluate(term, actor, obj, ctx)
        results.append(RuleResult(rule.name, rule.effect, t, render_because(trace, t), rule.source))
    allowed = evaluate(self._condition(action, model), actor, obj, base_ctx) is Truth.TRUE
    return Explanation(allowed, action, model.__name__, safe_actor_id, safe_resource_id, tuple(results))
```

- `allowed` comes from the same cached tree that `can()` uses, so `explain().allowed == can()` is
  guaranteed by construction (and tested with Hypothesis, 6.2).
- Custom checks run again in `explain()` (once per rule term, once for `allowed`). Explain is a
  developer tool; that cost is fine. Docs say custom checks should have no side effects.
- `render_because(trace, t)`: the leaf entries joined with `"; "`, in evaluation order. Because
  of short-circuit, the last entry is the one that decided a FALSE result. If `trace` is empty
  (rule term is `TRUE_`), the text is `"no condition"`.

Leaf rendering (`render_entry(entry)`):

| Node | Text example |
|---|---|
| `Compare` | `R.author_id (7) == A.id (3) -> FALSE` |
| `In` | `R.status ('spam') in ('open', 'closed') -> FALSE`; actor list: `R.org_id (4) in A.org_ids ((1, 2)) -> FALSE` |
| `Is` | `R.locked (None) is True -> FALSE`; `R.deleted_at is_not None -> UNKNOWN (MISSING)` |
| `Related` | `R.members.any(...) -> FALSE (3 rows checked)`; `R.owner.has(...) -> FALSE (no row)` |
| `ActorPresent` | `actor is logged in -> TRUE` / `actor is None (not logged in) -> FALSE` |
| `RolesMatch` | `needs role in {'admin'}; actor roles {'editor', 'viewer'} -> FALSE` |
| `CustomCheck` | `check is_shared_with -> TRUE` / `check spam_ok raised ValueError -> UNKNOWN` |

- Values are shown with `repr()`, cut to `config.EXPLAIN_VALUE_MAX_CHARS` characters with `"..."`.
  `MISSING` and `NO_ROW` print as their names.
- Explanation output shows real values. It is for developers only (main TDD 10.2). `Denied`
  never carries it (main TDD 11).

#### 3.7.4 `Explanation.__str__`

```
Post.edit -> DENIED (actor_id=3, resource_id=7)
  RULE           EFFECT  RESULT   SOURCE        BECAUSE
  Post.edit#2    allow   FALSE    authz.py:21   actor is logged in -> TRUE; R.author_id (7) == A.id (3) -> FALSE
  Post.*#3       allow   FALSE    authz.py:22   actor is logged in -> TRUE; needs role in {'admin'}; actor roles {'viewer'} -> FALSE
```

- First line: `<Resource>.<action> -> ALLOWED|DENIED (actor_id=..., resource_id=...)`.
- Columns are padded to the widest cell; two spaces between columns. Plain ASCII (no box
  characters) so it reads well in pytest output and logs.
- Only rules that match the action (directly or by `"*"`) are listed. In the example,
  `Post.delete#4` (a deny for `delete`) is not printed for `edit`.
- If no rule matches the action: one line `  (no rules for this action: denied by default)`.
- Deterministic: definition order, no dict/set iteration without sorting (role sets are printed
  sorted).

### 3.8 `errors.py`

```python
class FastAuthzError(Exception): ...

class ExpressionError(FastAuthzError): ...

@dataclass(frozen=True, slots=True)
class PolicyProblem:
    code: str                                   # "FA001"
    level: Literal_["error", "warning", "notice"]
    message: str
    source: str                                 # "authz.py:21" or config.UNKNOWN_SOURCE

class PolicyError(FastAuthzError):
    problems: list[PolicyProblem]               # all problems (errors, warnings, notices)
    def __init__(self, problems: list[PolicyProblem]) -> None: ...
    @property
    def errors(self) -> list[PolicyProblem]: ...

class PolicyFrozenError(FastAuthzError): ...
class UnknownResourceError(FastAuthzError):
    def __init__(self, resource_type: str) -> None: ...
class UnknownActionError(FastAuthzError):
    def __init__(self, resource_type: str, action: str) -> None: ...
class NotFilterableError(FastAuthzError): ...   # defined in M1, raised from M2 on

class Denied(FastAuthzError):
    decision: Decision
    def __init__(self, decision: Decision) -> None: ...
```

- `errors.py` imports `Decision` only under `TYPE_CHECKING` (to avoid a cycle: `decision.py`
  imports `truth.py`, `errors.py` must stay at the bottom of the import graph). `Denied.decision`
  is annotated with a string.
- `str(PolicyError)`:
  ```
  Policy has 2 errors:
    FA001 authz.py:12  Rule Post.eidt#2 uses action 'eidt', which Post does not declare (declared: delete, edit, read). ...
    FA007 authz.py:15  Rule Post.delete#3 needs role 'admn', which is not defined. Did you mean 'admin'?
  (and 1 warning; see .problems)
  ```
  This is a startup error for developers. It shows codes, file:line and rule names, which is what
  F5.2 asks for. It contains no data values from users or rows (rules are written by developers,
  not data).
- `str(Denied)` = `config.DENIED_MESSAGE_TEMPLATE.format(action=..., resource=...)`, for example
  `"permission denied: edit on Post"`. No rule names, no values, no explanation (CLAUDE.md rule 7).
- `UnknownActionError` message lists the declared actions of that resource (developer error,
  never sent over HTTP in M3; M3 makes it a startup error anyway).

### 3.9 `__init__.py`

```python
from fastauthz._version import __version__
from fastauthz.decision import Decision, Explanation, RuleResult
from fastauthz.errors import (Denied, ExpressionError, FastAuthzError, NotFilterableError,
                              PolicyError, PolicyFrozenError, PolicyProblem,
                              UnknownActionError, UnknownResourceError)
from fastauthz.expr import A, R
from fastauthz.policy import ANYONE, AUTHENTICATED, Policy, Who
from fastauthz.truth import Truth

__all__ = [...]   # exactly the names above, sorted

logging.getLogger(config.LOGGER_NAME).addHandler(logging.NullHandler())
```

- `TRUE_`, `FALSE_`, node classes, `evaluate`, `EvalContext`, `RoleGraph` stay importable from
  their modules (`fastauthz.expr`, ...) for tests and tools, but are not top-level API in M1.
  Main TDD 3 lists "Policy, R, A, ANYONE, AUTHENTICATED, errors" as top-level; `Truth`, `Who`,
  `Decision`, `Explanation`, `RuleResult`, `PolicyProblem` are added because they appear in public
  return types and must be importable for type hints.
- Import order must not create cycles: `config` <- `truth` <- `errors` <- `expr` <- `evaluate`,
  `roles` <- `decision` <- `policy` <- `__init__`.

---

## 4. Config constants (`config.py`)

```python
from typing import Final

LOGGER_NAME: Final[str] = "fastauthz"
MAX_RELATION_DEPTH: Final[int] = 3
ROLE_CACHE_SIZE: Final[int] = 1024
TYPE_CACHE_MAX: Final[int] = 1024
WARN_ONCE_MAX_KEYS: Final[int] = 1024
EXPLAIN_VALUE_MAX_CHARS: Final[int] = 40
SUGGEST_CUTOFF: Final[float] = 0.6
ACTION_WILDCARD: Final[str] = "*"
ACTION_NAME_PATTERN: Final[str] = r"^[A-Za-z_][A-Za-z0-9_.:-]*$"
DEFAULT_ID_COLUMN: Final[str] = "id"
AUTO_RULE_NAME_FORMAT: Final[str] = "{model}.{actions}#{index}"
UNKNOWN_SOURCE: Final[str] = "<unknown>"
DENIED_MESSAGE_TEMPLATE: Final[str] = "permission denied: {action} on {resource}"
```

| Name | Why |
|---|---|
| `LOGGER_NAME` | One root logger for the library; children like `fastauthz.evaluate`. M3 adds `fastauthz.decisions`. |
| `MAX_RELATION_DEPTH` | Main TDD 5.6. Each hop is one `EXISTS` in SQL. |
| `ROLE_CACHE_SIZE` | Main TDD 8.3. Number of distinct actor role sets cached. Real apps have few. |
| `TYPE_CACHE_MAX` | Caps the object type -> model cache, so dynamic classes cannot grow memory forever. |
| `WARN_ONCE_MAX_KEYS` | Caps the warn-once set (3.4.5). |
| `EXPLAIN_VALUE_MAX_CHARS` | Keeps explain lines readable and avoids dumping large values. |
| `SUGGEST_CUTOFF` | `difflib` similarity for "did you mean" in FA001 / FA007. |
| `ACTION_WILDCARD` | The `"*"` action. |
| `ACTION_NAME_PATTERN` | Allowed action names. No spaces, no `*`, starts with a letter or `_`. `.`, `:`, `-` allowed for names like `invoice:approve`. |
| `DEFAULT_ID_COLUMN` | Main TDD 8.1 default `"id"`. |
| `AUTO_RULE_NAME_FORMAT` | Main TDD 8.1 names like `Post.edit#2`. |
| `UNKNOWN_SOURCE` | When no frame is available. |
| `DENIED_MESSAGE_TEMPLATE` | `str(Denied)`; fixed text, no rule details. M3 adds `DENY_DETAIL_TEMPLATE` for HTTP. |

Allowed literal types are part of the type system, not a setting, so they stay in `expr.py`
(`Scalar` alias and `_check_literal`).

---

## 5. Truth-rule impact (main TDD 6)

M1 **creates** the Python half of every truth rule. Full tables are in 3.3:
- 3.3.1 reading values (`None`, `MISSING`, `NO_ROW`);
- 3.3.2 `Compare` order of checks;
- 3.3.3 `In` order and full table;
- 3.3.4 `Is` table including `is_not` and `NO_ROW`;
- 3.3.5 Kleene table (all 9 pairs);
- 3.3.6 `Related`;
- 3.3.7 internal nodes;
- 3.3.8 final decision.

M1 adds four precisions that the main TDD does not spell out. None weakens a rule; all keep
fail-closed:
- D4: a `NO_ROW` leaf is FALSE also when negated in the leaf (`!=`, `not_in`, `is_not`).
- D4b: for `In`, the `NO_ROW` check comes before the empty-options check.
- D6: NaN is rejected in literals and gives UNKNOWN when read from data.
- D9: `any()` over a `None` collection is UNKNOWN.

M2's `fold` and `to_sql` must implement the same, and the M2 differential property test must be
able to generate each case (dotted paths with `None` links, empty option tuples, negated leaves).

---

## 6. Test plan

All tests are written before the code (TASKS.md order). Fast suite only (no PostgreSQL needed in
M1). Coverage: branch mode.

### 6.1 Unit tests (numbered cases: input -> expected)

`tests/unit/test_expr.py`
1. `R.author_id` -> `_Ref` with path `("author_id",)`; `R.project.org_id` -> `("project", "org_id")`.
2. `R._secret`, `A.__class__`-style lookups via `getattr(R, "_x")` -> `ExpressionError`.
3. `R["any"] == 1` -> `Compare(EQ, ResourceAttr(("any",)), Literal(1))`; `R["_x"]` -> error.
4. Each of `== != < <= > >=` -> `Compare` with the right `CompareOp`.
5. `3 < R.score` -> `Compare(GT, ResourceAttr(("score",)), Literal(3))`.
6. `R.a.in_([1, 2])` -> `In(item, Literal((1, 2)), negate=False)`; `.not_in` -> `negate=True`.
7. `R.a.in_({3, 1, 2})` twice in two processes (subprocess with different `PYTHONHASHSEED`) -> same tuple order.
8. `R.a.in_("abc")`, `R.a.in_(5)`, `R.a.in_(R.b)` -> `ExpressionError`.
9. `R.org_id.in_(A.org_ids)` -> options `ActorAttr(("org_ids",))`.
10. `R.a.is_(None)`, `.is_(True)`, `.is_(False)` ok; `.is_(1)`, `.is_(0)`, `.is_("x")` -> error.
11. `(a & b) & c` and `a & (b & c)` -> both `And((a, b, c))`; same for `|`.
12. `~~a` -> `a` (identity); `~a` -> `Not(a)`.
13. `(R.a == 1) and (R.b == 2)` -> `ExpressionError` with the `& | ~` hint; same for `or`, `not`, `if node:`.
14. `1 < R.score < 5` -> `ExpressionError` (chained comparison calls `__bool__`).
15. `bool(R.a)` -> `ExpressionError`.
16. `R.a == Literal`-unsupported value (`object()`, `{}`, `[1]` in `==`) -> `ExpressionError`.
17. `R.a == float("nan")`, `R.a == Decimal("NaN")` -> `ExpressionError`; `R.a == float("inf")` ok.
18. `Compare(EQ, Literal(1), Literal(2))` built directly -> `ExpressionError`.
19. `R.project.org_id == R.group.org_id` -> `ExpressionError` (D5); `R.a == R.b` ok; `R.project.org_id == R.org_id` ok.
20. `R.a == ((R.b == 1) & (R.c == 2))` -> `ExpressionError` (condition as operand).
21. `Literal(1) != Literal(True)`, `Literal(1) != Literal(1.0)`, `Literal(1) == Literal(1)`, and `{Literal(1), Literal(True)}` has 2 items (D3).
22. `R.members.any(user_id=A.id, role="editor")` -> `Related(("members",), "any", And((Compare(EQ, R.role...), Compare(EQ, R.user_id...))))` with keys sorted.
23. `R.members.any()` -> `where=TRUE_`; `R.owner.has(R.is_active.is_(True))` -> `Related(("owner",), "has", Is(...))`.
24. `A.groups.any()` -> `ExpressionError`; `R.members.any(R.x)` (a `_Ref` as where) -> `ExpressionError`.
25. `depth` table from 3.1.8 (7 cases) -> exact numbers.
26. `hash(R.a)` works; `{R.a: 1}` works.
27. `repr(R.project.org_id)` == `"R.project.org_id"`.
28. Nodes are immutable: setting a field raises `FrozenInstanceError`.
29. `contains_internal(all_of(R.a == 1, ActorPresent()))` -> True; on user trees -> False.
30. `R == 1` (root without attribute) -> `ExpressionError`.

`tests/unit/test_truth.py`
31. `and_`, `or_` for all 9 ordered pairs -> table 3.3.5.
32. `not_` for 3 values.
33. `and_()` -> TRUE, `or_()` -> FALSE; 3-argument cases (`and_(T, U, F)` -> F).
34. `bool(Truth.TRUE)`, `bool(Truth.UNKNOWN)` -> `TypeError`; `bool(MISSING)` -> `TypeError`.
35. `repr(MISSING)` == `"MISSING"`; `Truth.TRUE.value == 1`, `FALSE == 0`, `UNKNOWN == -1`.

`tests/unit/test_evaluate.py` (plain classes, dataclasses, dicts; no SQLAlchemy)
36. `R.author_id == A.id`: `(7, 7)` -> TRUE; `(7, 3)` -> FALSE.
37. actor `None` -> UNKNOWN; actor without `id` -> UNKNOWN; `A.id` is `None` -> UNKNOWN.
38. resource `author_id` is `None` -> UNKNOWN; missing attribute -> UNKNOWN.
39. `R.project.org_id == A.org_id`: project `None` -> FALSE; project present, `org_id` None -> UNKNOWN; actor anonymous and project `None` -> UNKNOWN (step 1 before step 2).
40. `R.project.org_id != 5` with project `None` -> FALSE (D4); `~(R.project.org_id == 5)` with project `None` -> TRUE.
41. Order of checks: one test per step of 3.3.2 (5 tests), each where a later step would give a different answer.
42. `R.score < "a"` with score `3` -> UNKNOWN (TypeError), DEBUG log recorded.
43. NaN in data: `R.score == 1.0` with score `nan` -> UNKNOWN (D6).
44. Every row of the `In` table 3.3.3 (12 parametrized cases).
45. Every cell of the `Is` table 3.3.4 (6 x 6 = 36 parametrized cases), on the `R` side; plus `A.banned_at.is_(None)` anonymous -> UNKNOWN, `~A.banned_at.is_(None)` anonymous -> UNKNOWN.
46. Dict resources and dict actors: `{"author_id": 7}`; missing key -> UNKNOWN; nested dicts with `None` -> NO_ROW on `R`, MISSING on `A`.
47. A `@property` that raises `ValueError` -> MISSING -> UNKNOWN, WARNING logged once, no value in the message.
48. `any`: empty list -> FALSE; one TRUE -> TRUE (and later items not evaluated: use an item whose attribute access raises to prove short-circuit); FALSE + UNKNOWN -> UNKNOWN; all FALSE -> FALSE; `None` collection -> UNKNOWN; `"abc"` -> UNKNOWN + WARNING; missing attribute -> UNKNOWN.
49. `has`: `None` -> FALSE; present -> inner result; missing -> UNKNOWN.
50. `R.project.members.any(...)` with project `None` -> FALSE.
51. `And` short-circuit: `FALSE_ & <node that would raise if evaluated>` -> FALSE without evaluating (use a `CustomCheck` that records calls).
52. `Or` short-circuit: `TRUE_ | <recording check>` -> TRUE, check not called.
53. `ActorPresent`: actor `None` -> FALSE; object -> TRUE.
54. `RolesMatch({"admin"})` with ctx roles `{"admin","viewer"}` -> TRUE; `{"viewer"}` -> FALSE; `None` roles -> UNKNOWN; actor `None` -> FALSE; `RolesMatch(frozenset())` -> FALSE.
55. `CustomCheck`: returns True -> TRUE; False -> FALSE; returns `1` -> UNKNOWN + WARNING; raises `ValueError` -> UNKNOWN + WARNING with rule name and `exc_info`; raises `KeyboardInterrupt` -> propagates.
56. `evaluate(expr, a, r)` without `ctx` works (main TDD signature).
57. Trace: with `ctx.trace=[]`, `(R.a == 1) & (R.b == 2)` with a=0 records exactly one entry (short-circuit).
58. `sys.modules["sqlalchemy"]` absent -> `_compat` is never imported (check `"fastauthz._compat" not in sys.modules` in a subprocess after evaluating).

`tests/unit/test_evaluate_lazy.py` (skipped if SQLAlchemy is not installed)
59. Persistent object from a SQLite session, relationship not loaded -> `R.project.org_id == 1` is UNKNOWN; WARNING says "not loaded"; no SQL is emitted (use an event listener on `before_cursor_execute` that fails the test).
60. Same object with `selectinload(Post.project)` -> normal result.
61. Expired column after `session.commit()` (`expire_on_commit=True`) -> UNKNOWN, no SQL emitted.
62. Detached object with unloaded relationship -> UNKNOWN, no `DetachedInstanceError` raised.
63. Transient `Post(author_id=7)` -> `R.author_id == A.id` TRUE; unset column -> `None` -> UNKNOWN for compare.
64. Unloaded `members` collection -> `R.members.any(...)` UNKNOWN.

`tests/compat/test_compat_is_loaded.py`
- C1 plain object -> True. C2 transient -> True. C3 persistent loaded -> True. C4 persistent unloaded relationship -> False.
- C5 importing `fastauthz._compat` in a subprocess with `fastapi` blocked works (no third-party import at module top).

`tests/unit/test_roles.py`
65. `expand({"admin"})` with admin->editor->viewer -> `{"admin","editor","viewer"}`.
66. Diamond (`a->b, a->c, b->d, c->d`) -> `{"a","b","c","d"}`.
67. Actor role not in graph -> kept as is.
68. Cycle `a->b->a` -> `[("a","b","a")]`; self loop -> `[("a","a")]`; two separate cycles -> both, sorted; no cycles -> `[]`.
69. `roles({"admin": "editor"})` -> `TypeError`; `roles({"": []})` -> `ValueError`; `"*"` -> `ValueError`.
70. Two `roles()` calls merge.
71. After freeze, `expand` is cached: second call returns the same object, `cache_info().hits == 1`.
72. `defined()` includes roles that appear only as values.

`tests/unit/test_policy_api.py`
73. Chaining: `Policy().resource(...).allow(...)` returns the same policy.
74. Each row of the argument table in 3.6.5 -> the listed error.
75. `allow` default `who` is AUTHENTICATED; `deny` default is ANYONE.
76. `actions="edit"` -> `{"edit"}`; `["edit","delete"]` -> both; `["*","read"]` -> `{"*"}`.
77. Source capture: a rule defined at a known line in the test file -> `rule.source == "tests/unit/test_policy_api.py:<line>"`; defined through a user helper function -> the helper's line (first non-fastauthz frame).
78. Auto names: three rules on Post -> `Post.read#1`, `Post.edit,delete#2`, `Post.*#3`; rules on another model start at `#1`.
79. Duplicate explicit name -> `ValueError`.
80. `when=R.published` -> `ExpressionError` with the `.is_(True)` hint; `when=True` -> `ExpressionError`; `when=ActorPresent()` -> `ExpressionError` (internal node).
81. `sql=` without `check=` -> `ValueError`.

`tests/unit/test_policy_condition.py`
82. One allow rule `when=R.a == 1` -> condition `And((Or-or-single(And((ActorPresent(), R.a==1))), Not(FALSE_)))` (exact tree).
83. Scope added to allow terms, in position after roles and before `when`; not added when `bypass_scope=True`; never added to deny terms.
84. `scope=None` on a resource -> no scope; `INHERIT` -> policy scope; explicit scope -> that scope.
85. `"*"` rules appear in the condition of every action.
86. No allow rules -> condition FALSE for every actor.
87. Custom check is the last part of its term.
88. After freeze, `_condition` returns the same object on every call (cached); every declared `(model, action)` pair is in the cache.

`tests/unit/test_validate.py` (one triggering and one non-triggering case per code)
89. FA001: `allow("eidt", Post)` -> error with "did you mean 'edit'"; `allow("edit", Post)` -> none.
90. FA002: rule on undeclared `Comment` -> error; declared -> none.
91. FA005: depth 4 in `when` -> error; depth 3 -> none; depth 4 in policy scope -> error.
92. FA006: cycle -> error with the cycle path; none -> no problem.
93. FA007: `roles=["admn"]` -> error with suggestion; defined -> none.
94. FA009: `allow("read", Post, who=ANYONE)` with `scope=None` resource -> warning; with `when` -> none; with `roles` -> none.
95. FA010: action `archive` with no allow -> warning; covered by `"*"` -> none.
96. FA011: `roles=[]` -> warning; `when=R.a.in_([])` -> warning; `when=R.a == None` in a deny -> "blocks every request" warning; normal rule -> none.
97. FA012: `resource(Country, scope=None)` -> notice; inherited non-None scope -> none.
98. FA013: `check=` without `sql=` -> notice; with `sql=` -> none.
99. FA014: a `Compare` built with `object.__new__` + `object.__setattr__` to bypass `__post_init__`, with an `And` operand -> warning; normal -> none.
100. FA015: `R.deleted_at == None` -> warning; `.is_(None)` -> none.
101. FA016: `who=ANYONE` on a resource with `R.org_id == A.org_id` scope, no bypass -> warning; with `bypass_scope=True` -> none; scope that does not read `A` -> none.
102. FA003, FA004, FA008 never appear in M1 (a policy that would trigger them in M2 gives no such codes).
103. `validate()` does not raise and does not freeze; order is errors, warnings, notices; every problem has a real `source`.

`tests/unit/test_freeze.py`
104. Two errors (FA001 + FA007) -> one `PolicyError` with both in `.errors`; message lists both with file:line.
105. Warnings only -> freeze succeeds; warnings logged at WARNING, notices at INFO.
106. After freeze: `allow`, `deny`, `resource`, `roles` -> `PolicyFrozenError`.
107. `freeze()` twice -> no-op, same object returned.
108. Failed freeze leaves the policy unfrozen; `can()` raises `PolicyError` again.
109. First-use freeze: `can()` on an unfrozen valid policy freezes it (`policy.frozen` is True after).
110. 8 threads call `can()` on an unfrozen policy at once -> `validate` runs once (spy), all results correct.

`tests/unit/test_can_check.py`
111. Blog policy from FSD section 2: Alice edits own post -> True; Bob's -> False; anonymous -> False; admin -> True for every action; locked post delete by admin -> False (deny wins).
112. Deny UNKNOWN blocks: `deny("delete", Post, when=R.locked.is_(True))` with `locked` missing on the object -> `is_(True)` is UNKNOWN -> denied even for admin.
113. `who=ANYONE` allow + anonymous -> True when `when` is TRUE.
114. Scope: same org -> True; other org -> False; anonymous with scope -> False; `bypass_scope=True` rule ignores scope.
115. Undeclared action -> `UnknownActionError`; undeclared type -> `UnknownResourceError`; `obj=None` -> `TypeError`.
116. Subclass of a declared model -> uses the base model's rules.
117. `actor_roles` raising -> role rules UNKNOWN -> False; returning `"admin"` (str) -> False + WARNING.
118. `check()` allowed -> returns `None`; denied -> `Denied` with `decision.allowed is False`, `action`, `resource_type == "Post"`, `resource_id == 7`, `actor_id == 3`, `kind == "check"`, `duration_us >= 0`.
119. `str(Denied)` contains no rule name and no value (assert rule names and `7` / `"secret"` not in it).
120. `Decision.resource_id` is `None` when the id is not a scalar (an object).

`tests/unit/test_explain.py`
121. Blog example: rows for `Post.edit#2`, `Post.*#3` only (not delete rule); results and `because` text exactly as 3.7.3 examples.
122. `explain().allowed == can()` for the blog cases.
123. Values longer than `EXPLAIN_VALUE_MAX_CHARS` are cut with `...`.
124. `MISSING` / `NO_ROW` shown by name.
125. No rules for action -> the "denied by default" line.
126. `str()` output snapshot (golden string) for one case; deterministic across two runs.
127. Custom check raising -> row says `raised ValueError -> UNKNOWN`.

`tests/unit/test_errors.py`
128. Every error class is a subclass of `FastAuthzError`.
129. `PolicyError.errors` filters level "error"; `str()` format; `.problems` keeps warnings.
130. `UnknownActionError` message lists declared actions.

`tests/unit/test_imports.py`
131. Subprocess: insert a `sys.meta_path` finder that raises `ImportError` for `sqlalchemy*` and `fastapi*`, then `import fastauthz` and run the blog policy `can()` / `explain()` -> works.
132. Subprocess: same with `sys.modules["sqlalchemy"] = None` and `sys.modules["fastapi"] = None` -> works (proves D2 uses `.get(...) is None`).
133. Static check: parse every core module with `ast`, collect imports; all must be stdlib (`sys.stdlib_module_names`) or `fastauthz.*`; `fastauthz._compat` is allowed only as a function-local import in `evaluate.py`.

### 6.2 Property tests (Hypothesis, Python engine only)

`tests/property/test_kleene_laws.py`
- P1 `and_` / `or_` are commutative and associative over all `Truth` triples (exhaustive, 27 cases, no Hypothesis needed).
- P2 De Morgan: `not_(and_(a, b)) == or_(not_(a), not_(b))` and the dual (exhaustive).
- P3 Random expression trees (strategy over a small schema: `id, owner_id, org_id, status, score, published, deleted_at, group -> Group(org_id), tags -> [Tag(name)]`, depth <= 4) and random objects/dicts with `None`s and missing attributes, random actors including `None`:
  - short-circuit `evaluate` == a reference evaluator that computes every child and folds with `and_` / `or_` (written separately in the test, about 40 lines);
  - `evaluate(negate(e)) == not_(evaluate(e))`;
  - `evaluate(all_of(a, b)) == and_(evaluate(a), evaluate(b))`.
- P4 Random policies (1-6 rules over the schema): `policy.explain(...).allowed == policy.can(...)`.
- P5 Anonymous fail-closed: for any random policy and resource, `can(None, action, obj)` is False unless some matching allow rule has `who=ANYONE`.
- P6 Missing never opens: for random trees (no custom checks), turning any read value into `MISSING` never changes a result from not-TRUE to TRUE. Reason it holds even with `Not`: a `MISSING` read only moves a leaf from TRUE/FALSE to UNKNOWN (or leaves it unchanged, e.g. empty `In`), and Kleene `AND` / `OR` / `NOT` are monotone in the "less known" order (T and F can only become U, never each other). This is the core fail-closed promise as a test.
- Settings: `max_examples=500` in the fast suite; the strategy module is placed in `tests/property/strategies.py` so M2 reuses it for the SQL differential test.

### 6.3 Typing tests

`tests/typing/test_public_api_types.py` (checked by pyright, also imported by pytest so it runs):
- `assert_type(policy.can(u, "edit", p), bool)`, `assert_type(policy.check(...), None)`,
  `assert_type(policy.explain(...), Explanation)`, `assert_type(R.a == 1, Compare)`,
  `assert_type(policy.allow("read", Post), Policy)`, `assert_type(policy.validate(), list[PolicyProblem])`.

### 6.4 Example script test

`tests/examples/test_m1_blog_script.py`: runs the FSD section 2 script in a subprocess and checks
the printed `can()` results and that the explain output contains `Post.edit#2` and `FALSE`.

### 6.5 Coverage targets

- 100% branch coverage on `expr.py`, `truth.py`, `evaluate.py`, `roles.py`, `policy.py`,
  `decision.py`, `errors.py`, `config.py`.
- `_compat.is_loaded` fully covered by `tests/compat/` (needs the `[sqlalchemy]` extra, which
  `uv sync --all-extras` installs).
- Lines that only guard against bugs (`case _: raise TypeError`) are covered by one direct test
  with a fake node, not excluded with `pragma: no cover`.

---

## 7. Tooling and CI changes

- `pyproject.toml`:
  - pytest: register markers `property` (fast-suite property tests) and keep `postgres` (from
    M0, unused in M1).
  - coverage: `branch = true`, `source = ["fastauthz"]`.
- CI (GitHub Actions job from M0), add one step after tests:
  ```
  uv run coverage report --include="src/fastauthz/expr.py,src/fastauthz/truth.py,src/fastauthz/evaluate.py,src/fastauthz/roles.py,src/fastauthz/policy.py,src/fastauthz/decision.py,src/fastauthz/errors.py,src/fastauthz/config.py" --fail-under=100
  ```
  (coverage.py has no per-module threshold, so the core gate is a separate report).
- CI job "core without extras": `uv sync` (no extras) then `uv run pytest tests/unit/test_imports.py tests/unit/test_expr.py tests/unit/test_evaluate.py` - proves the core runs with SQLAlchemy and FastAPI really not installed (in addition to the blocking test).
- pyright strict also covers `tests/typing/`.
- No new dev dependency.

---

## 8. Performance notes

Targets are measured in M4 (main TDD 16). M1 must not make them hard to reach:
- `can()` hot path: one `_frozen` check, one type-cache dict lookup, one action set lookup, one
  condition dict lookup, one `EvalContext` (one small frozen object), one cached role expansion,
  then the recursive `_eval`. No tree building, no reflection, no locks, no logging on the happy
  path.
- `_eval` uses `match` with class patterns; leaf helpers read each operand once.
- The lazy-load guard costs one `sys.modules.get` and (with SQLAlchemy loaded) one
  `inspect(obj, raiseerr=False)` per attribute read on a non-mapping object. If profiling in M4
  shows this is too slow, cache "type is not mapped" per type inside `_compat`.
- `freeze()` builds `len(resources) x len(actions)` trees once; for 500 rules this is far below
  50 ms.
- Informal check at the end of M1 (not a gate): `python -m timeit` on the blog policy `can()`
  should be well under 20 µs.

---

## 9. Security notes (main TDD 17.1 rows touched)

| Threat row | What M1 does |
|---|---|
| `NULL` / missing values open access | Three-valued logic, `MISSING`, `NO_ROW`, order of checks; `Truth.__bool__` raises so `if result:` cannot happen (D7). |
| `and` / `or` used instead of `&` / `|` | `__bool__` raises on every node and on `_Ref` (3.1.2). |
| Missing parentheses | Builder refuses a condition as an operand; FA014 backstop. |
| Typo in action or role | FA001, FA007 with suggestions; `can()` raises `UnknownActionError`. |
| Custom check crashes and is treated as allow | Any `Exception` -> UNKNOWN -> deny; logged with rule name; non-bool return -> UNKNOWN. |
| Lazy load reads stale or missing data | Lazy-load guard (D2): unloaded or expired -> MISSING -> deny, no query. |
| Tenant leak through an admin rule | Scope added to every allow rule unless `bypass_scope=True`; FA012 lists unscoped resources; FA016 flags public rules that cannot work. |
| Error messages leak policy details | `str(Denied)` uses a fixed template; `Denied` carries only a `Decision` (ids). |
| Decision logs leak personal data | `Decision` stores ids only; non-scalar ids become `None`. Warnings never print values or `repr` of user objects. |
| Policy changed at runtime | `freeze()`; mutating methods raise `PolicyFrozenError`; internal containers become tuple / `MappingProxyType`. |
| Slow queries from deep relationships | `depth()` + FA005 in M1 (SQL side in M2). |

An unclear deny blocks access (main TDD 6.4). FA011 warns when a deny rule is always UNKNOWN, so
this safe behaviour does not surprise users in production.

---

## 10. Risks, open questions and design decisions

### 10.1 D1 - internal nodes (resolved)
`ActorPresent`, `RolesMatch`, `CustomCheck` are defined in `expr.py` (3.1.4), are part of the
`Expr` alias, are not exported, and are rejected in user conditions. `SqlFragment` is M2.
**Action:** main TDD 5.1 should list these four internal nodes in the node table (marked
"internal"). Not edited by this milestone doc.

### 10.2 D2 - lazy-load guard without importing SQLAlchemy (resolved)
`evaluate.py` imports `fastauthz._compat.is_loaded` lazily, only when
`sys.modules.get("sqlalchemy") is not None` (3.4.6). `_compat.is_loaded` moves from M3 to M1, and
`_compat.py` must keep "no third-party import at module top".
**Action:** main TDD 7 (lazy loading guard paragraph) and 12.7 should describe this, and main
TASKS M3 should note that `is_loaded` already exists.

### 10.3 D4 / D4b - NO_ROW in negated leaves and before empty `In` (resolved)
Main TDD 6.3 says the empty-options row of `In` is "checked before the rows below", and 6.2 says
a NO_ROW path makes a leaf FALSE. For `R.project.org_id.not_in([])` with no project these two
disagree (TRUE vs FALSE). SQL decides: the leaf compiles to `Post.project.has(Project.org_id NOT
IN ())` = `has(TRUE)` = FALSE when no project exists. So NO_ROW is checked first (3.3.3). Also
`!=`, `not_in`, `is_not` on a NO_ROW path are FALSE (D4).
**Action:** main TDD 6.2/6.3 should say this. **M2 must not** fold an empty `In` on a dotted path
into a bare `Const` (that would drop the `has()`); it must fold only the inner comparison.

### 10.4 D3 - typed literal equality (resolved)
Needed so `Literal(1)` and `Literal(True)` are different nodes (3.1.3.1).

### 10.5 D5 - two dotted paths in one comparison (resolved, stricter)
`R.project.org_id == R.group.org_id` is rejected at build time: it needs two correlated
`EXISTS` with a cross-reference, which has no clean SQL form in v1 (same reason main TDD 5.4
gives for `ResourceAttr` in `In.options`). One dotted side is fine.
**Action:** main TDD 5.4 should list it.

### 10.6 D6 - NaN (resolved for M1, M2 must follow)
Literals reject NaN. NaN read from data gives UNKNOWN. PostgreSQL treats `NaN = NaN` as true and
sorts NaN above all numbers, so a row with NaN in a float column could pass a SQL filter that the
Python engine denies. That difference is in the safe direction for Python only. **Recommended for
M2:** the property-test strategy generates no NaN, and the docs say "do not store NaN in columns
used by rules". Revisit only if users ask.

### 10.7 `matched_rules` / `denied_by` in `check()` (open, for M3)
Filling them needs one extra evaluation per rule, on the deny path only. **Recommended:** M3
fills them for `kind="check"` only when an `on_decision` callback or the decisions logger at
DEBUG is active; otherwise leave them empty. M1 leaves them empty.

### 10.8 D10 - argument errors are `TypeError` / `ValueError` (resolved)
Main TDD 11 lists only domain errors. Wrong argument types or values in builder calls
(`resource(Post, actions="")`, duplicate rule names) raise built-in `TypeError` / `ValueError`
immediately, like any Python library. Policy meaning problems (FA codes) are collected by
`validate()`. **Open:** if users want one `except FastAuthzError`, a later minor version can add
`FastAuthzUsageError(FastAuthzError, ValueError)` without breaking anyone.

### 10.9 D8 - `R["name"]` (resolved)
Needed for columns named `any`, `has`, `in_`, `is_`, `not_in`, `is_not`. Tiny and safe.
**Action:** main TDD 5.2 and FSD F1.6 should mention it.

### 10.10 D9 - `any()` over `None` (resolved)
UNKNOWN, not FALSE, so `~R.members.any(...)` cannot become TRUE through a broken object.
SQLAlchemy collections are never `None`, so SQL never sees this case.

### 10.10b D7 - `Truth.__bool__` raises (resolved)
Stops `if evaluate(...):` from treating UNKNOWN as yes (3.2). **Action:** main TDD 6.1 should
mention it.

### 10.11 FA005 timing (minor)
Main TASKS lists FA005 under M2 ("startup errors FA003, FA004, FA005"). Depth is purely
structural and needs no SQLAlchemy, so M1 implements it. M2 only adds FA003 / FA004 / FA008.

### 10.12 Type coercion differences between Python and SQLite (risk for M2)
SQLite's type affinity can make `1 = '1'` true, and `col IS 1` true for `is_(True)` on integer
columns. Python says FALSE. **Recommended for M2:** FA003 also checks that a literal's Python type
matches the column's `python_type`, and that `is_(True/False)` is used only on Boolean columns.

### 10.13 Risk: users depend on node classes
Node classes are importable from `fastauthz.expr`. They are documented as "advanced, may change
before 1.0". M5 freezes the public API.

---

## 11. Exit criteria

- [ ] All modules in section 2 exist with the signatures in section 3; pyright strict: 0 errors.
- [ ] Every numbered test in 6.1 exists and passes; property tests P1-P6 pass at 500 examples.
- [ ] Every FA code listed for M1 in 3.6.8 has one triggering and one non-triggering test.
- [ ] 100% branch coverage on core modules (CI step from section 7).
- [ ] Import test passes with SQLAlchemy and FastAPI blocked, and the "core without extras" CI job is green.
- [ ] The FSD section 2 script works (test 6.4).
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run pyright` pass, with output shown in the PR.
- [ ] Design decisions D1-D10 are copied into the main TDD (5.1, 5.2, 5.4, 6.2, 6.3, 7, 12.7) and FSD F1.6 in the same PR as the code (CLAUDE.md rule 13).
- [ ] `core_docs/TASKS.md` M1 boxes ticked; `timeline/timeline.md` updated.

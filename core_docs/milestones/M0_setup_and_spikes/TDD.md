# M0 - Technical Design (TDD)
## Setup and quick tries (spikes)

**Milestone:** M0 (about 10 hours)
**What:** `FSD.md` in this folder. **Steps:** `TASKS.md` in this folder.
**Main design:** `../../TDD-tech-design-doc.md`. This file adds detail for M0 only. If this file
and the main TDD disagree, the main TDD wins, and this file must be fixed in the same PR.

---

## 1. Scope

### 1.1 In scope
| Part | Main TDD | Lives in |
|---|---|---|
| Packaging (`pyproject.toml`, hatchling, extras, dependency groups) | 18 | repo root |
| Package skeleton (`__init__`, `_version`, `py.typed`, `config`) | 3 | `src/fastauthz/` |
| Lint, format, types, test config | 14.5 | `pyproject.toml` |
| pre-commit | TECH_STACK 2 | `.pre-commit-config.yaml` |
| CI (lint + types + tests, Python 3.11 and 3.15, PostgreSQL service) | 15.2 (PR subset) | `.github/workflows/ci.yml` |
| Import smoke tests (incl. "core without extras") | 3 (import rule), 14.5 | `tests/unit/` |
| Spike 1: rule -> SQL (sync + async, SQLite + PostgreSQL, `has()` + `any()`) | 5, 9 | `spikes/` |
| Spike 2: same answer, Python vs SQL, 1,000 rows with `NULL`s | 6, 7, 14.3 | `spikes/` |
| Spike 3: FastAPI `load()` in one query + OpenAPI + route walking on old and new FastAPI | 12.2, 12.3, 12.6, 12.7 | `spikes/` |
| Spike report, FastAPI floor version | 15.1 | `core_docs/reports/M0_spikes.md`, `core_docs/TECH_STACK.md` |

### 1.2 Out of scope
- Any real implementation of `expr`, `truth`, `evaluate`, `roles`, `policy`, `decision`, `sql`,
  `fastapi`, `openapi`, `_compat`, `testing`, `cli` in `src/`. Spike code is throw-away.
- Release to PyPI, Trusted Publishing, attestations (M3, M5).
- Nightly job, full CI matrix (FastAPI floor x latest x SQLAlchemy 2.0 x 2.1), mutation tests,
  benchmarks, docs site (M3-M5).
- Pinning GitHub Actions by commit SHA and Dependabot (M5). Version tags are fine in M0.

### 1.3 Why spikes first
The three spikes test the three claims the whole design rests on:
1. A small expression tree can become an SQLAlchemy `ColumnElement[bool]` with only bound
   parameters, on both databases and both session kinds (TDD 1.3, 9.3, 9.4).
2. A Python Kleene evaluator and the database agree row by row, including `NULL`, missing actor,
   negation and empty "belongs to" links (TDD 6, 14.3).
3. A FastAPI dependency can read a path parameter, load and check in one query, and be found
   again when building OpenAPI, on FastAPI 0.115 and on the newest FastAPI with the 0.137 route
   tree (TDD 2.8, 12.3, 12.6, 12.7).

If any claim fails, the design changes **before** M1 (section 10.1).

---

## 2. Files and folders

### 2.1 Kept after M0
```
pyproject.toml                       # project metadata, extras, dev group, tool config
uv.lock                              # committed lock file
.python-version                      # "3.11" (dev default = oldest supported)
.pre-commit-config.yaml              # ruff + basic file hooks
.github/workflows/ci.yml             # lint, types, tests (3.11, 3.15), PostgreSQL service
src/fastauthz/__init__.py            # re-exports __version__ only (public API grows in M1)
src/fastauthz/_version.py            # __version__ = "0.0.0"
src/fastauthz/py.typed               # empty PEP 561 marker
src/fastauthz/config.py              # docstring only in M0; constants arrive with their features
tests/__init__.py                    # empty (makes "tests" a package for clean imports)
tests/conftest.py                    # markers, anyio backend, database URL fixtures
tests/unit/__init__.py
tests/unit/test_package.py           # import, version, py.typed
tests/unit/test_imports.py           # core imports with sqlalchemy/fastapi blocked
tests/integration/__init__.py
tests/integration/test_db_smoke.py   # SQLite (sync+async) always; PostgreSQL (sync+async) marked
core_docs/reports/M0_spikes.md       # spike results (template in section 3.9)
core_docs/TECH_STACK.md              # updated: FastAPI and SQLAlchemy floor versions
```

### 2.2 Deleted at the end of M0
```
spikes/
  README.md                  # "throw-away code, deleted at the end of M0"
  conftest.py                # engine/session fixtures for 4 backends
  schema.py                  # Item / Group / Tag test schema (TDD 14.3)
  mini_expr.py               # tiny tree + bind + to_sql + evaluate (throw-away)
  test_spike1_sql.py
  test_spike2_same_answer.py
  test_spike3_fastapi.py
  mini_authz.py              # tiny load() dependency + OpenAPI wrapper + iter_routes
```
- `spikes/` is excluded from pyright and ruff (section 7), and not in `testpaths`. It is run by
  hand: `uv run pytest spikes/` and `uv run pytest spikes/ -m postgres`.
- Everything we learn moves into `core_docs/reports/M0_spikes.md` (and into the main TDD if the
  design changes) **before** the folder is deleted. Git history keeps the code if needed.
- The test schema in `spikes/schema.py` is the same one the M2 property tests use
  (TDD 14.3), so M2 can copy it from git history.

---

## 3. Modules, functions and classes

### 3.1 `src/fastauthz/_version.py`
```python
__version__ = "0.0.0"
```
- Read by hatchling (`[tool.hatch.version] path = ...`, section 7.1).
- `0.0.0` means "nothing released". The first release is `0.1.0` in M3.

### 3.2 `src/fastauthz/__init__.py`
```python
"""fastauthz - authorization for FastAPI and SQLAlchemy."""

from fastauthz._version import __version__

__all__ = ["__version__"]
```
- Imports nothing outside the package. M1 adds `Policy, R, A, ANYONE, AUTHENTICATED` and errors.
- `__all__` is needed so pyright strict treats `__version__` as a public re-export.

### 3.3 `src/fastauthz/py.typed`
- Empty file. Must be inside the wheel. Checked by `test_package.py` (6.2, case U3).

### 3.4 `src/fastauthz/config.py`
```python
"""All fastauthz settings and constants.

Rule (CLAUDE.md rule 8): constants live only here. Each constant is added together with the
feature that uses it, with a comment saying why it has its value.
"""
```
- No constants in M0 (nothing uses them yet; "do not build early").
- Planned (from the main TDD), for reference only: `MAX_RELATION_DEPTH` (M1/M2),
  `ROLE_CACHE_SIZE` (M1), `DENY_DETAIL_TEMPLATE` (M3), `LOG_DENIES_AT_INFO` (M3),
  `CONSISTENCY_MAX_ROWS` (M4).

### 3.5 `tests/conftest.py`
```python
import os
from collections.abc import Iterator

import pytest

POSTGRES_URL_ENV = "FASTAUTHZ_TEST_POSTGRES_URL"   # test-only setting, not library config


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session")
def postgres_url() -> str:
    url = os.environ.get(POSTGRES_URL_ENV)
    if not url:
        pytest.fail(f"{POSTGRES_URL_ENV} is not set; start PostgreSQL and set it to run -m postgres")
    return url
```
Behavior:
- The `postgres` marker is registered in `pyproject.toml` (7.4), with `--strict-markers`.
- `postgres_url` **fails** (does not skip) when the variable is missing. Reason: a security
  library must not silently skip its database tests; a skipped PostgreSQL run must look red.
- The URL format is SQLAlchemy's: `postgresql+psycopg://user:pass@localhost:5432/fastauthz_test`.
  The async tests swap the driver to `postgresql+asyncpg://...` with
  `sqlalchemy.engine.make_url(url).set(drivername="postgresql+asyncpg")`.
- `POSTGRES_URL_ENV` is a test constant. CLAUDE.md rule 8 is about library settings; test
  helpers keep their own constants in `tests/conftest.py`.

### 3.6 `spikes/schema.py` (throw-away)
SQLAlchemy 2.0 declarative models, same shape as the TDD 14.3 schema:
```python
class Base(DeclarativeBase): ...

class Group(Base):
    __tablename__ = "groups"
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int | None]

class Item(Base):
    __tablename__ = "items"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int | None]
    org_id: Mapped[int | None]
    status: Mapped[str | None]                 # values from {"draft", "live", "gone"} or NULL
    score: Mapped[int | None]
    published: Mapped[bool | None]
    deleted_at: Mapped[datetime | None]
    group_id: Mapped[int | None] = mapped_column(ForeignKey("groups.id"))
    group: Mapped[Group | None] = relationship()                     # many-to-one
    tags: Mapped[list["Tag"]] = relationship(back_populates="item")   # one-to-many

class Tag(Base):
    __tablename__ = "tags"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    name: Mapped[str | None]
    item: Mapped[Item] = relationship(back_populates="tags")

class Post(Base):                               # only for spike 3
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int | None]
    title: Mapped[str]
```
Every non-key column is nullable on purpose (spike 2 needs `NULL` everywhere).

### 3.7 `spikes/mini_expr.py` (throw-away)
A tiny version of the M1/M2 design. Only what the spikes need. Not the final API.

```python
class Truth(Enum):
    TRUE = 1
    FALSE = 0
    UNKNOWN = -1

MISSING: Final = object()      # TDD 6.2
NO_ROW: Final = object()       # TDD 6.2

@dataclass(frozen=True, slots=True)
class ResourceAttr: path: tuple[str, ...]
@dataclass(frozen=True, slots=True)
class ActorAttr:    path: tuple[str, ...]
@dataclass(frozen=True, slots=True)
class Lit:          value: object                      # may be MISSING after bind()
@dataclass(frozen=True, slots=True)
class Compare:      op: Literal["eq", "ne", "lt", "le", "gt", "ge"]; left: Operand; right: Operand
@dataclass(frozen=True, slots=True)
class In:           item: Operand; options: tuple[object, ...]; negate: bool
@dataclass(frozen=True, slots=True)
class Is:           item: Operand; value: None | bool; negate: bool
@dataclass(frozen=True, slots=True)
class And:          items: tuple[Expr, ...]
@dataclass(frozen=True, slots=True)
class Or:           items: tuple[Expr, ...]
@dataclass(frozen=True, slots=True)
class Not:          item: Expr
@dataclass(frozen=True, slots=True)
class Related:      path: tuple[str, ...]; kind: Literal["any", "has"]; where: Expr
@dataclass(frozen=True, slots=True)
class Const:        value: Truth

Operand = ResourceAttr | ActorAttr | Lit
Expr = Compare | In | Is | And | Or | Not | Related | Const

def kleene_and(a: Truth, b: Truth) -> Truth: ...
def kleene_or(a: Truth, b: Truth) -> Truth: ...
def kleene_not(a: Truth) -> Truth: ...

def read_path(obj: object | None, path: tuple[str, ...], *, resource: bool) -> object: ...
def bind(expr: Expr, actor: object | None) -> Expr: ...
def evaluate(expr: Expr, actor: object | None, row: object) -> Truth: ...
def to_sql(expr: Expr, model: type[Base]) -> ColumnElement[bool]: ...
```
No `R` / `A` builder classes: spikes build nodes directly
(`Compare("eq", ResourceAttr(("owner_id",)), ActorAttr(("id",)))`). Operator overloading is
M1 work and carries no risk worth a spike.

#### 3.7.1 `read_path`
```
read_path(obj, path, resource):
    if obj is None: return MISSING                     # anonymous actor (TDD 6.2)
    cur = obj
    for i, name in enumerate(path):
        if resource and i > 0 and cur is None:
            return NO_ROW                               # walked through an empty many-to-one link
        if resource and is_sqlalchemy_object(cur) and name in sa_inspect(cur).unloaded:
            return MISSING                              # lazy-load guard (TDD 7); never trigger I/O
        if isinstance(cur, Mapping): cur = cur.get(name, MISSING)
        else:                        cur = getattr(cur, name, MISSING)
        if cur is MISSING: return MISSING
    return cur
```
- The `NO_ROW` check happens **before** reading the next step: `item.group is None` while
  reading `("group", "org_id")` gives `NO_ROW`.
- Spike 2 must record whether `sa_inspect(obj).unloaded` is reliable for both relationships and
  deferred columns, on sync and async sessions (input for `_compat.is_loaded`, TDD 12.7).

#### 3.7.2 `evaluate` (Python engine)
```
evaluate(expr, actor, row):
    match expr:
        case Const(v): return v
        case Compare(op, l, r):
            lv, rv = value(l), value(r)          # value(): ResourceAttr -> read_path(row, resource=True)
                                                 #          ActorAttr    -> read_path(actor, resource=False)
                                                 #          Lit          -> its value
            # order of checks, TDD 6.2
            if non-resource side is None or MISSING: return UNKNOWN
            if resource side is NO_ROW:              return FALSE
            if resource side is MISSING or None:     return UNKNOWN
            try: return TRUE if OPS[op](lv, rv) else FALSE
            except TypeError: return UNKNOWN
        case In(item, options, negate):
            if options == (): return TRUE if negate else FALSE        # empty IN, TDD 6.3
            v = value(item)
            (same order of checks: actor/literal None|MISSING -> UNKNOWN; NO_ROW -> FALSE;
             MISSING|None -> UNKNOWN)
            if v in [o for o in options if o is not None]: res = TRUE
            elif None in options:                          res = UNKNOWN
            else:                                          res = FALSE
            return kleene_not(res) if negate else res
        case Is(item, target, negate):
            v = value(item)
            if v is NO_ROW: res = FALSE
            elif v is MISSING: res = UNKNOWN
            elif target is None: res = TRUE if v is None else FALSE
            else: res = TRUE if (v is not None and bool(v) is target and isinstance(v, bool)) else FALSE
            return kleene_not(res) if negate else res
        case And(items): fold kleene_and, stop at first FALSE
        case Or(items):  fold kleene_or, stop at first TRUE
        case Not(x):     return kleene_not(evaluate(x, actor, row))
        case Related(path, "any", where):
            coll = read_path(row, path, resource=True)
            if coll is MISSING: return UNKNOWN
            results = [evaluate(where, actor, child) for child in coll]
            TRUE if TRUE in results else UNKNOWN if UNKNOWN in results else FALSE   # empty -> FALSE
        case Related(path, "has", where):
            obj = read_path(row, path, resource=True)
            if obj is MISSING: return UNKNOWN
            if obj is None or obj is NO_ROW: return FALSE
            return evaluate(where, actor, obj)
```
- Spike 2 must find out how SQLite stores and returns booleans (0/1 integers) and whether
  `Is(x, True)` on a non-bool value can occur. (The final rule is in TDD 6.3: "Other" -> `FALSE`.)

#### 3.7.3 `bind` (a tiny version of `fold`, TDD 9.2)
```
bind(expr, actor):
    replace every ActorAttr p with Lit(read_path(actor, p, resource=False))
    then, bottom-up:
        Compare/In/Is with no ResourceAttr left  -> Const(evaluate(node, None, None))
        Compare with Lit(None) or Lit(MISSING)   -> Const(UNKNOWN)       # never send "= NULL"
        And/Or/Not with Const children           -> Kleene simplification
```
The spike only needs enough folding to never send `MISSING` to SQL. Full simplification
tables are M2.

#### 3.7.4 `to_sql`
```
to_sql(expr, model):
    match expr:
        case Const(TRUE):    return sa.true()
        case Const(FALSE):   return sa.false()
        case Const(UNKNOWN): return sa.cast(sa.null(), sa.Boolean)
        case Compare(op, ResourceAttr(path), Lit(v)) if len(path) == 1:
            return SQL_OPS[op](getattr(model, path[0]), sa.bindparam(None, v, unique=True))
        case Compare(op, ResourceAttr(path), rhs) if len(path) > 1:          # TDD 9.4
            rel = getattr(model, path[0])
            target = rel.property.mapper.class_
            return rel.has(to_sql(Compare(op, ResourceAttr(path[1:]), rhs), target))
        case Compare(op, Lit(v), ResourceAttr(...)): mirror the operator and recurse
        case In(item, (), negate):    return sa.true() if negate else sa.false()
        case In(ResourceAttr(path), options, negate): col.in_(options) / col.not_in(options)
        case Is(ResourceAttr(path), None, negate): col.is_(None) / col.is_not(None)
        case Is(ResourceAttr(path), b, negate):    col.is_(sa.true()/sa.false()) / is_not(...)
        case And(items): sa.and_(*map(to_sql))
        case Or(items):  sa.or_(*map(to_sql))
        case Not(x):     sa.not_(to_sql(x))
        case Related(path, "any", where): rel.any(to_sql(where, target))
        case Related(path, "has", where): rel.has(to_sql(where, target))
```
- Literal values are **only** `sa.bindparam(None, v, unique=True)`. Never `sa.literal_column`,
  never `text()`, never f-strings (CLAUDE.md rule 6).
- `In` with a resource path longer than 1 and `Is` with a dotted path are pushed into `has()`
  the same way as `Compare`.

### 3.8 Spike 1 - rule to SQL (`spikes/test_spike1_sql.py`)

#### 3.8.1 Backends (fixture `backend`, parametrized)
| id | Engine URL | Session | Marker |
|---|---|---|---|
| `sqlite-sync` | `sqlite://` + `poolclass=StaticPool` | `Session` | - |
| `sqlite-async` | `sqlite+aiosqlite://` + `poolclass=StaticPool` | `AsyncSession` | - |
| `pg-sync` | `postgresql+psycopg://...` | `Session` | `postgres` |
| `pg-async` | `postgresql+asyncpg://...` | `AsyncSession` | `postgres` |
- `StaticPool` is needed so every connection sees the same in-memory SQLite database.
- Async engines create tables with `async with engine.begin() as c: await c.run_sync(Base.metadata.create_all)`.
- PostgreSQL tables are dropped and created per test module (`drop_all` then `create_all`).

#### 3.8.2 Cases
| # | Rule | Data | Expected ids |
|---|---|---|---|
| S1.1 | `R.owner_id == A.id`, actor `id=3` | owner_id = 3, 4, NULL | `{row with 3}` |
| S1.2 | same, actor `None` | same | `{}` (folds to `UNKNOWN` -> typed `NULL`) |
| S1.3 | `~(R.owner_id == A.id)`, actor `id=3` | same | `{row with 4}` (NULL row dropped) |
| S1.4 | `R.group.org_id == A.org_id` (dotted, has) | group org 1; group org 2; group_id NULL; group with org NULL | `{org 1 row}` |
| S1.5 | `~(R.group.org_id == A.org_id)` | same | `{org 2 row, group_id NULL row}` (NO_ROW -> FALSE -> NOT -> TRUE; group org NULL row: `NOT EXISTS(...)` is TRUE too - **record what each DB returns**) |
| S1.6 | `R.tags.any(R.name == "red")` | tags {red}, {blue}, {}, {NULL} | `{red row}` |
| S1.7 | `~R.tags.any(R.name == "red")` | same | SQL: `{blue row, no-tags row, NULL-tag row}`. Python per TDD 7 drops the NULL-tag row (`UNKNOWN`). **Record both; see 10.2.** |
| S1.8 | `R.status.in_(())` and `R.status.not_in(())` | status "live", NULL | `{}` and `{both}` |
| S1.9 | `R.published.is_(True)` | True, False, NULL | `{True row}` |

Note for S1.5: in SQL, `Item.group.has(Group.org_id == :p)` is `EXISTS (SELECT 1 FROM groups
WHERE groups.id = items.group_id AND groups.org_id = :p)`. For a group whose `org_id` is
`NULL`, the inner `WHERE` is not `TRUE`, so `EXISTS` is `FALSE` and `NOT EXISTS` is `TRUE`.
The Python engine reads `item.group.org_id = None` -> `UNKNOWN` -> `NOT` -> `UNKNOWN` -> not
returned. **This looks like a real disagreement.** Spike 1 must confirm it on both databases, and
spike 2 must hit it with random data. Section 10.2 gives the recommended fix.

#### 3.8.3 What spike 1 measures and records
1. For each backend and case: expected ids == returned ids (pass/fail).
2. The compiled SQL text for S1.1, S1.4, S1.6 on both dialects:
   `str(stmt.compile(dialect=sqlite.dialect()))` and `postgresql.dialect()`. Paste into the report.
3. **Bound parameters only:** for every case, the compiled text (with `literal_binds` off)
   contains none of the literal values (`"3"`, `"red"`, `"live"`) as text, and
   `stmt.compile().params` contains them.
4. How `sa.cast(sa.null(), sa.Boolean)` renders on each dialect, and that `WHERE CAST(NULL AS
   BOOLEAN)` and `WHERE NOT CAST(NULL AS BOOLEAN)` return no rows on both.
5. How empty `in_([])` renders on SQLAlchemy 2.0.x and 2.1.x (we map it to `sa.false()` anyway,
   TDD 9.3; record whether SQLAlchemy's own rendering also gives `FALSE` for a `NULL` item).
6. How `col.is_(sa.true())` renders on SQLite (`IS 1`) and PostgreSQL (`IS true`).
7. Whether `any()` / `has()` produce correlated `EXISTS` and no extra rows (count rows with
   two matching tags: must be 1, not 2).
8. That sync and async sessions give the same rows for the same statement.
9. A rough timing: `to_sql(bind(tree, actor), Item)` for S1.4 with `timeit` (1,000 runs, µs per
   run). Compare with the target "< 100 µs" (TDD 16.1). Only a sanity check.
10. Repeat cases S1.1-S1.9 on the **lowest** SQLAlchemy we plan to support
    (`uv run --isolated --with "sqlalchemy==2.0.0" pytest spikes/test_spike1_sql.py`) and the
    newest 2.1.x. If 2.0.0 fails, find the lowest 2.0.x that passes (section 3.11).

### 3.9 Spike 2 - same answer (`spikes/test_spike2_same_answer.py`)

#### 3.9.1 Data generation
```python
def make_rows(rng: random.Random, n: int = 1_000) -> tuple[list[Group], list[Item]]:
    groups = [Group(id=i, org_id=rng.choice([1, 2, None])) for i in range(1, 11)]
    items = []
    for i in range(1, n + 1):
        item = Item(
            id=i,
            owner_id=rng.choice([1, 2, 3, None]),
            org_id=rng.choice([1, 2, None]),
            status=rng.choice(["draft", "live", "gone", None]),
            score=rng.choice([0, 5, 10, None]),
            published=rng.choice([True, False, None]),
            deleted_at=rng.choice([None, datetime(2026, 1, 1)]),
            group_id=rng.choice([None, *range(1, 11)]),
        )
        item.tags = [Tag(name=rng.choice(["red", "blue", None])) for _ in range(rng.randint(0, 3))]
        items.append(item)
    return groups, items
```
- Fixed seeds (`SEEDS = (1, 2, 3)`) so failures are reproducible. Small value sets on purpose:
  they make equal values and `NULL`s common.

#### 3.9.2 Rules and actors
Rules (each also tested wrapped in `Not`):
1. `R.owner_id == A.id`
2. `(R.org_id == A.org_id) & (R.score > 5)`
3. `(R.owner_id == A.id) | R.published.is_(True)`
4. `R.status.in_(("draft", "live"))`
5. `R.status.not_in(("draft", None))`
6. `R.deleted_at.is_(None)`
7. `R.group.org_id == A.org_id`
8. `R.tags.any(R.name == "red")`
9. `R.group.has(R.org_id.is_(None))`
10. `A.is_staff.is_(True) | (R.owner_id == A.id)` (actor-only part folds)

Actors:
```python
ACTORS = [
    SimpleNamespace(id=1, org_id=1, is_staff=False),
    SimpleNamespace(id=2, org_id=None, is_staff=True),
    SimpleNamespace(id=3),                 # missing org_id and is_staff -> MISSING
    {"id": 1, "org_id": 2},                # Mapping actor
    None,                                  # anonymous
]
```

#### 3.9.3 The check
```
for backend in backends:
    insert groups + items + tags (one transaction, then commit)
    reload rows with selectinload(Item.group), selectinload(Item.tags)   # Python side needs them
    for rule in RULES + [Not(r) for r in RULES]:
        for actor in ACTORS:
            py_ids  = {i.id for i in rows if evaluate(rule, actor, i) is Truth.TRUE}
            sql_ids = set(session.scalars(select(Item.id).where(to_sql(bind(rule, actor), Item))))
            record (rule, actor, len(py_ids), len(sql_ids), py_ids ^ sql_ids)
assert every symmetric difference is empty
```
- On mismatch: print the first 5 differing rows with all column values, the Python truth value,
  and the compiled SQL. Copy each distinct mismatch cause into the report.

#### 3.9.4 Hypothesis try (small)
- One `@given` test with a strategy for rows only (rule fixed to rule 7), `max_examples=200`,
  using one engine and a SAVEPOINT per example (`session.begin_nested()` + rollback).
- Measure examples per second on SQLite and PostgreSQL. Use the numbers to estimate whether
  TDD 14.3 targets fit: `max_examples=500` on SQLite inside the 60-second fast suite
  (TDD 14.1), and `2000` on PostgreSQL in CI.
- Record whether Hypothesis complains about function-scoped fixtures
  (`HealthCheck.function_scoped_fixture`) and how we avoid it (session-scoped engine).

#### 3.9.5 What spike 2 measures and records
1. Mismatch count per (backend, rule, negated, actor). Target: 0. Any non-zero result needs a
   written cause and a design fix (section 10).
2. Whether `sa_inspect(obj).unloaded` correctly reports `group` / `tags` as unloaded without
   `selectinload`, on sync and async sessions, and that reading them on an `AsyncSession`
   object raises `MissingGreenlet` (proves why the lazy-load guard is needed, TDD 7).
3. Wall time for 1,000 rows x 20 rules x 5 actors on each backend.
4. Hypothesis examples per second (3.9.4).
5. Python `evaluate()` time per call for rule 2 (µs), compared with "< 20 µs" (TDD 16.1).

### 3.10 Spike 3 - FastAPI (`spikes/mini_authz.py`, `spikes/test_spike3_fastapi.py`)

#### 3.10.1 `PermissionInfo` and `MiniAuthz`
```python
@dataclass(frozen=True, slots=True)
class PermissionInfo:
    model: type
    action: str
    kind: Literal["load"]

class MiniAuthz:
    def __init__(
        self,
        rules: Mapping[tuple[type, str], Expr],
        *,
        actor: Callable[..., Any],
        session: Callable[..., Any],
    ) -> None: ...

    def load(self, model: type[Base], action: str, *, param: str | None = None) -> Callable[..., Any]: ...
    def install(self, app: FastAPI) -> None: ...
```

#### 3.10.2 `load()` - build a dependency with a real signature
```
load(model, action, param=None):
    if (model, action) not in rules: raise KeyError        # fail at route definition time
    pname = param or f"{model.__name__.lower()}_id"         # TDD 12.3 step 1
    id_type = model.__mapper__.columns["id"].type.python_type   # TDD 12.3 step 2
    tree = rules[(model, action)]

    async def dependency(**kwargs) -> model:
        raw_id = kwargs[pname]                              # already converted + validated by FastAPI
        actor = kwargs["actor"]
        session = kwargs["session"]
        cond = to_sql(bind(tree, actor), model)
        stmt = select(model).where(model.id == raw_id, cond)
        obj = (await session.execute(stmt)).scalar_one_or_none()
        if obj is None:
            raise HTTPException(status_code=404)            # same for "missing" and "denied"
        return obj

    dependency.__signature__ = inspect.Signature([
        inspect.Parameter(pname,     KEYWORD_ONLY, annotation=Annotated[id_type, Path()]),
        inspect.Parameter("actor",   KEYWORD_ONLY, default=Depends(self.actor_dep)),
        inspect.Parameter("session", KEYWORD_ONLY, default=Depends(self.session_dep)),
    ])
    dependency.__fastauthz__ = PermissionInfo(model, action, "load")
    return dependency
```
Why `__signature__`: the parameter name (`post_id`) is only known at runtime. FastAPI reads
dependency parameters with `inspect.signature`, which honors `__signature__`. This avoids
`exec`/`eval` (forbidden by our safety rules). Declaring the path parameter in the dependency
makes FastAPI validate it (bad id -> 422) and document it in OpenAPI.

A sync variant (`def dependency`, `session.execute(stmt)`) is tried once with a sync `Session`
dependency to confirm FastAPI runs it in its threadpool (TDD 12.8).

#### 3.10.3 OpenAPI wrapper
```
install(app):
    original = app.openapi
    def openapi() -> dict[str, Any]:
        if app.openapi_schema: return app.openapi_schema
        schema = original()
        for route in iter_routes(app):
            infos = [getattr(d, "__fastauthz__", None) for d in iter_dependency_calls(route)]
            infos = [i for i in infos if i is not None]
            if not infos: continue
            for method in route.methods:
                op = schema["paths"][route.path_format][method.lower()]
                op.setdefault("responses", {})["404"] = {"description": "Not found or not allowed"}
                op["x-fastauthz"] = [{"resource": i.model.__name__, "action": i.action} for i in infos]
                op["description"] = (op.get("description", "") +
                    "\n\n**Permission:** " + ", ".join(f"`{i.action}` on `{i.model.__name__}`" for i in infos)).strip()
        app.openapi_schema = schema
        return schema
    app.openapi = openapi
```
- Must use `route.path_format` (the key FastAPI uses in `paths`), not `route.path`. Record if
  this differs between versions.
- `HEAD`/`OPTIONS` methods that FastAPI adds or skips must be checked against `schema["paths"]`.

#### 3.10.4 Route walking (candidate for `_compat.iter_routes`, TDD 12.7)
```
iter_routes(node) -> Iterator[APIRoute]:
    for r in getattr(node, "routes", ()):
        if isinstance(r, APIRoute): yield r
        elif is a router / route-tree node (has .routes and is not a mounted ASGI app):
            yield from iter_routes(r)
        # Mount(app=FastAPI(...)) sub-apps: skip; they build their own OpenAPI

iter_dependency_calls(route) -> Iterator[Callable[..., Any]]:
    stack = list(route.dependant.dependencies)
    while stack:
        d = stack.pop()
        if d.call is not None: yield d.call
        stack.extend(d.dependencies)
```
The exact shape of the FastAPI >= 0.137 route tree is **not known yet**. Spike 3 must:
1. Install both versions side by side:
   `uv run --isolated --with "fastapi==0.115.*" pytest spikes/test_spike3_fastapi.py` and
   `uv run --isolated --with "fastapi" pytest spikes/test_spike3_fastapi.py` (newest).
2. Read FastAPI's `routing.py` for both versions and write down the node types found in
   `app.router.routes` (class names, attribute that holds children, how prefixes are stored).
3. Make `iter_routes` return the same `(path_format, sorted(methods), [PermissionInfo...])` list
   on both versions for the test app below.

#### 3.10.5 Test app
```
app = FastAPI()
GET    /posts/{post_id}                  -> load(Post, "read")         (on app)
PATCH  /posts/{post_id}                  -> load(Post, "edit"), route also declares post_id: int
router = APIRouter(prefix="/v1")
GET    /v1/posts/{post_id}               -> load(Post, "read")         (included router)
inner = APIRouter(prefix="/inner"); router.include_router(inner)
GET    /v1/inner/posts/{post_id}         -> load(Post, "read")         (router in router)
GET    /health                           -> no fastauthz dependency
app.mount("/sub", FastAPI())              -> skipped by iter_routes
```

#### 3.10.6 Cases
| # | Request | Actor | Expected |
|---|---|---|---|
| S3.1 | `GET /posts/1` (author 3) | id 3 | 200, body has id 1, **exactly 1 SQL statement** |
| S3.2 | `GET /posts/1` | id 4 | 404, exactly 1 SQL statement |
| S3.3 | `GET /posts/999` | id 3 | 404, same body as S3.2 |
| S3.4 | `GET /posts/abc` | id 3 | 422, 0 SQL statements |
| S3.5 | `GET /posts/1` | `None` | 404, 1 or 0 statements (record; `FALSE` filter may still run) |
| S3.6 | `PATCH /posts/1` with route-declared `post_id` | id 3 | 200; one `post_id` parameter in OpenAPI, not two |
| S3.7 | `GET /openapi.json` | - | 4 guarded operations have `x-fastauthz` and the "Permission:" line; `/health` has neither |
| S3.8 | same as S3.7 on FastAPI 0.115 and newest | - | identical `x-fastauthz` output |
| S3.9 | route session vs dependency session | id 3 | same `Session` object in route and dependency (FastAPI dependency cache) |

Counting SQL statements:
```python
count = 0
@event.listens_for(engine.sync_engine if is_async else engine, "before_cursor_execute")
def _count(*_: object) -> None:
    nonlocal count; count += 1
```
Requests go through `httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")`.

#### 3.10.7 What spike 3 measures and records
1. Pass/fail of S3.1-S3.9 on FastAPI 0.115.x and the newest release (write exact versions).
2. The route-tree node types in each version (3.10.4 step 2), with the attribute names.
3. Whether `__signature__` + `Annotated[int, Path()]` works on both versions.
4. Whether the dependency cache shares the session (S3.9) on both versions.
5. Whether `route.dependant` and `Dependant.dependencies` / `.call` exist with the same names on
   both versions (these are internals: list every one used, they go to `_compat.py`).
6. The OpenAPI diff between versions for the test app (anything else that changed).

### 3.11 Choosing floor versions
**FastAPI floor** (TECH_STACK 1, TDD 15.1 "floor confirmed in M0 spike"):
```
candidates = [0.115.0, 0.115.latest, 0.116.x, ..., newest]      # minor versions, oldest first
for v in candidates:
    ok = run(f'uv run --isolated --with "fastapi=={v}" pytest spikes/test_spike3_fastapi.py tests/')
    if ok: floor = v; break
also check: uv sync --resolution lowest-direct --all-extras resolves and spike 3 passes
```
- Start with `0.115.0`. If it passes, the floor is `0.115.0` (`fastapi>=0.115`).
- If not, the floor is the lowest minor that passes, and the reason goes in the report.
- Write the result in three places in the same PR: `TECH_STACK.md` section 1 ("Web" row),
  `pyproject.toml` (`fastapi>=X`), and main TDD 15.1 (replace "floor confirmed in M0 spike").
- The same method gives the **SQLAlchemy floor** with spike 1 (start at `2.0.0`). If the floor
  is not exactly `2.0`, update TECH_STACK, TDD 15.1 and TDD 18.

### 3.12 Report template: `core_docs/reports/M0_spikes.md`
```markdown
# M0 spike report
**Date:** YYYY-MM-DD   **Author:** ...   **Commit of spikes:** <sha> (spikes/ deleted in <sha>)

## Environment
| Thing | Version |
|---|---|
| Python | 3.11.x, 3.15.x |
| SQLAlchemy | lowest tried: 2.0.x, newest: 2.1.x |
| FastAPI | lowest tried: 0.115.x, newest: 0.1xx.x |
| PostgreSQL | 18.x (Docker image tag) |
| Drivers | psycopg 3.x, asyncpg 0.x, aiosqlite 0.x |

## Summary
| Spike | Result | Design change needed? |
|---|---|---|
| 1 rule -> SQL | pass / fail | no / yes (ADR-00X) |
| 2 same answer | pass / fail | ... |
| 3 FastAPI | pass / fail | ... |

## Spike 1 - rule -> SQL
- Results table: case x backend (pass/fail).
- Compiled SQL (SQLite and PostgreSQL) for S1.1, S1.4, S1.6.
- Bound parameters check: pass/fail.
- Typed NULL, empty IN, IS TRUE rendering per dialect.
- S1.5 (NULL column inside has() under NOT): what each DB returned, and the decision.
- Timing: to_sql(bind(...)) = N µs.
- SQLAlchemy floor: X.

## Spike 2 - same answer
- Mismatches per backend (table). Every non-zero cell: cause + fix.
- Lazy-load facts (unloaded detection, MissingGreenlet).
- Timings: full run per backend, evaluate() µs/call, Hypothesis examples/s.
- Estimate for TDD 14.3 example counts: fits / does not fit the 60 s budget.

## Spike 3 - FastAPI
- Results table: case x FastAPI version.
- Route-tree node types per version (class names, attributes).
- Internals used (list) -> all go into _compat.py.
- OpenAPI differences between versions.
- FastAPI floor: X (and why).

## Design changes
- One line per change, with the main TDD section and the ADR file.

## Lessons for M1-M3
- Short list.
```

---

## 4. Config constants

None added to `src/fastauthz/config.py` in M0 (3.4).

Spike and test constants (not library settings, so not in `config.py`):
| Name | Where | Value | Why |
|---|---|---|---|
| `POSTGRES_URL_ENV` | `tests/conftest.py` | `"FASTAUTHZ_TEST_POSTGRES_URL"` | One name for the test DB URL, locally and in CI. |
| `SEEDS` | `spikes/test_spike2_same_answer.py` | `(1, 2, 3)` | Reproducible random data. |
| `ROW_COUNT` | `spikes/test_spike2_same_answer.py` | `1_000` | FSD M0-F4.1. |

---

## 5. Truth-rule impact (TDD 6)

M0 writes no real truth code. But spikes 1 and 2 are the **first test of TDD 6 against real
databases**. They check:
- `NULL` comparisons give `UNKNOWN` and the row is dropped, also under `NOT` (6.1, 6.3).
- Anonymous actor (`None`) and missing actor attributes give `UNKNOWN` (6.2).
- `NO_ROW` through an empty many-to-one link gives `FALSE`, so `NOT` of it gives `TRUE` in both
  engines (6.2).
- Empty `IN` gives `FALSE` and empty `NOT IN` gives `TRUE` (6.3).
- `Is` table cells for `None`, `True`, `False` values (6.3).
- `final = allow AND NOT deny` is not tested in M0 (no policy yet).

Any disagreement found is a design bug in TDD 6, not a spike bug. It must be fixed in the main
TDD (with an ADR) before M1 starts. Known suspect: S1.5 (section 10.2).

---

## 6. Test plan

### 6.1 Kept tests (run by `uv run pytest` and CI)
| File | Kind | Marker |
|---|---|---|
| `tests/unit/test_package.py` | unit | - |
| `tests/unit/test_imports.py` | unit (subprocess) | - |
| `tests/integration/test_db_smoke.py` | integration | SQLite tests: none; PostgreSQL tests: `postgres` |

### 6.2 Cases
| # | Test | Input | Expected |
|---|---|---|---|
| U1 | `test_import_package` | `import fastauthz` | no error |
| U2 | `test_version_is_string` | `fastauthz.__version__` | `"0.0.0"`, and matches `importlib.metadata.version("fastauthz")` |
| U3 | `test_py_typed_present` | `importlib.resources.files("fastauthz") / "py.typed"` | is a file |
| U4 | `test_core_imports_without_extras` | subprocess: `python -I -c "import sys; [sys.modules.__setitem__(m, None) for m in ('sqlalchemy','fastapi','starlette','pydantic')]; import fastauthz, fastauthz.config"` | exit code 0 |
| U5 | `test_core_does_not_load_extras` | subprocess: `import fastauthz, fastauthz.config; print(sorted(m for m in sys.modules if m.split('.')[0] in {'sqlalchemy','fastapi','starlette','pydantic'}))` | prints `[]` |
| U6 | `test_core_blocked_import_really_blocks` | subprocess as U4 but `import sqlalchemy` | non-zero exit, `ImportError` (proves the blocking trick works) |
| I1 | `test_sqlite_sync_select_one` | `create_engine("sqlite://")`, `SELECT 1` | `1` |
| I2 | `test_sqlite_async_select_one` (anyio) | `create_async_engine("sqlite+aiosqlite://")` | `1` |
| I3 | `test_postgres_sync_select_one` (`postgres`) | psycopg URL | `1` |
| I4 | `test_postgres_async_select_one` (`postgres`, anyio) | asyncpg URL | `1` |
| I5 | `test_postgres_url_missing_fails` | run `pytest -m postgres` in a subprocess with the env var removed | non-zero exit, message names `FASTAUTHZ_TEST_POSTGRES_URL` |

- Subprocesses use `sys.executable` so they run in the same venv. `-I` (isolated mode) keeps
  the user's `PYTHONPATH` and current directory out; the editable install is still found
  through the venv's `site-packages`.
- U4 blocks modules by putting `None` in `sys.modules` (Python then raises `ImportError` on
  import). This is the same trick TDD 3 describes for `tests/unit/test_imports.py`, which grows
  in M1 to import every core module.

### 6.3 Spike tests
Spike tests (sections 3.8-3.10) are **not** part of the kept suite. They are run by hand and
their results go into the report. They use the same `postgres` marker.

### 6.4 Coverage
- `coverage` is configured in M0 (branch mode, 7.4) but **no gate yet**: there is almost no
  code. The gates (100% core, 95% overall, TDD 14.5) are switched on in M1, when real code lands.

---

## 7. Tooling and CI

### 7.1 `pyproject.toml` - project and build
```toml
[build-system]
requires = ["hatchling>=1.26"]
build-backend = "hatchling.build"

[project]
name = "fastauthz"
dynamic = ["version"]
description = "Authorization for FastAPI and SQLAlchemy: write each rule once, check objects and filter queries."
readme = "README.md"
license = "MIT"
license-files = ["LICENSE"]
requires-python = ">=3.11"
authors = [{ name = "Ankit Raj" }]
keywords = ["fastapi", "sqlalchemy", "authorization", "permissions", "rbac", "abac"]
classifiers = [
    "Development Status :: 2 - Pre-Alpha",
    "Framework :: FastAPI",
    "Intended Audience :: Developers",
    "Programming Language :: Python :: 3 :: Only",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
    "Programming Language :: Python :: 3.13",
    "Programming Language :: Python :: 3.14",
    "Programming Language :: Python :: 3.15",
    "Topic :: Security",
    "Typing :: Typed",
]
dependencies = []                                   # core: zero runtime dependencies (N10)

[project.optional-dependencies]
sqlalchemy = ["sqlalchemy>=2.0"]
fastapi    = ["fastapi>=0.115"]                     # floor confirmed by spike 3 (3.11)
standard   = ["fastauthz[sqlalchemy,fastapi]"]

[project.urls]
Repository = "https://github.com/ankitraj20616/fastauthz"
Issues = "https://github.com/ankitraj20616/fastauthz/issues"

[tool.hatch.version]
path = "src/fastauthz/_version.py"

[tool.hatch.build.targets.wheel]
packages = ["src/fastauthz"]

[tool.hatch.build.targets.sdist]
include = ["src/fastauthz", "tests", "README.md", "LICENSE", "CHANGELOG.md"]
```
- `[project.scripts] fastauthz = "fastauthz.cli:main"` (TDD 18) is **added in M4**, together
  with `cli.py`. Adding it now would install a command that crashes with `ModuleNotFoundError`.
- The repository URL uses the current GitHub owner. If the repo is renamed or moved, update it.

### 7.2 `pyproject.toml` - dev dependencies (PEP 735 dependency group, used by uv)
```toml
[dependency-groups]
dev = [
    "pytest>=8.3",
    "anyio>=4.6",            # pytest plugin ships with anyio
    "hypothesis>=6.115",
    "coverage[toml]>=7.6",
    "httpx>=0.27",
    "ruff>=0.8",
    "pyright>=1.1.390",
    "pre-commit>=4.0",
    "aiosqlite>=0.20",
    "psycopg[binary]>=3.2",
    "asyncpg>=0.30",
]
```
- Lower bounds only (TECH_STACK 1). The exact versions are fixed by `uv.lock`.
- `mutmut` (M5) and `pytest-benchmark` (M4) are added in their milestones, not now.
- `uv sync --all-extras` installs extras + the `dev` group (uv installs `dev` by default).

### 7.3 Ruff
```toml
[tool.ruff]
line-length = 100
target-version = "py311"
src = ["src", "tests"]
extend-exclude = ["spikes"]          # throw-away code (2.2)

[tool.ruff.lint]
select = [
    "E", "W", "F",      # pycodestyle, pyflakes
    "I",                # isort
    "B",                # bugbear
    "UP",               # pyupgrade
    "SIM", "C4",        # simplify, comprehensions
    "S",                # bandit (security)
    "PT",               # pytest style
    "TID",              # tidy imports (banned APIs, below)
    "RUF",
]

[tool.ruff.lint.flake8-tidy-imports]
ban-relative-imports = "all"

[tool.ruff.lint.flake8-tidy-imports.banned-api]
"sqlalchemy".msg = "Core modules must not import SQLAlchemy (CLAUDE.md rule 4)."
"fastapi".msg    = "Core modules must not import FastAPI (CLAUDE.md rule 4)."
"starlette".msg  = "Core modules must not import Starlette (CLAUDE.md rule 4)."

[tool.ruff.lint.per-file-ignores]
# Modules allowed to use the extras (TDD 3). Internals stay in _compat.py (rule 5, reviewed by hand).
"src/fastauthz/sql.py"      = ["TID251"]
"src/fastauthz/fastapi.py"  = ["TID251"]
"src/fastauthz/openapi.py"  = ["TID251"]
"src/fastauthz/_compat.py"  = ["TID251"]
"src/fastauthz/testing.py"  = ["TID251"]
"tests/**"                  = ["S101", "TID251"]   # asserts and extras are fine in tests

[tool.ruff.format]
docstring-code-format = true
```
- `banned-api` makes CLAUDE.md rule 4 a lint error, not only a runtime test (U4). The runtime
  test stays, because a banned import can hide behind `importlib`.
- The per-file list for `src/` names files that do not exist yet; ruff ignores missing paths.

### 7.4 Pyright, pytest, coverage
```toml
[tool.pyright]
include = ["src", "tests"]
exclude = ["spikes", "**/__pycache__", ".venv"]
pythonVersion = "3.11"
typeCheckingMode = "standard"
strict = ["src", "tests/typing"]     # TDD 14.5: strict on src/ and tests/typing/
reportMissingModuleSource = "none"
venvPath = "."
venv = ".venv"

[tool.pytest.ini_options]
minversion = "8.3"
testpaths = ["tests"]
addopts = ["-ra", "--strict-markers", "--strict-config", "-m", "not postgres"]
markers = ["postgres: needs a local PostgreSQL; set FASTAUTHZ_TEST_POSTGRES_URL"]
xfail_strict = true
filterwarnings = ["error"]

[tool.coverage.run]
branch = true
source = ["fastauthz"]

[tool.coverage.report]
show_missing = true
skip_covered = true
exclude_also = ["if TYPE_CHECKING:", "raise NotImplementedError", "@overload"]
```
- `-m "not postgres"` in `addopts` keeps `uv run pytest` fast and DB-free. A later `-m` on the
  command line replaces it, so `uv run pytest -m postgres` runs **only** the PostgreSQL tests.
  CI runs both commands (7.6), which together give the full suite.
- `filterwarnings = ["error"]`: a new deprecation warning from FastAPI or SQLAlchemy fails the
  suite. That is on purpose (early notice of upgrades, TDD 2.8). Known third-party warnings get
  a narrow `ignore:` line with a comment and an issue link.

### 7.5 pre-commit (`.pre-commit-config.yaml`)
```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-toml
      - id: check-merge-conflict
      - id: check-added-large-files
      - id: mixed-line-ending
        args: [--fix=lf]
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: vX.Y.Z            # same version as ruff in uv.lock
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
```
- Pyright is **not** a pre-commit hook (slow, needs the venv). It runs in CI and by hand.
- Install once: `uv run pre-commit install`. Check all files: `uv run pre-commit run --all-files`.

### 7.6 GitHub Actions (`.github/workflows/ci.yml`) - outline
```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
        with: { python-version: "3.11", enable-cache: true }
      - run: uv sync --all-extras --locked
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run pyright

  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        python: ["3.11", "3.15"]
    services:
      postgres:
        image: postgres:18
        env:
          POSTGRES_USER: fastauthz
          POSTGRES_PASSWORD: fastauthz          # throw-away CI password, not a secret
          POSTGRES_DB: fastauthz_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U fastauthz"
          --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      FASTAUTHZ_TEST_POSTGRES_URL: postgresql+psycopg://fastauthz:fastauthz@localhost:5432/fastauthz_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python }}
          allow-prereleases: true                # 3.15 may still be new / pre-release
      - uses: astral-sh/setup-uv@v6
        with: { enable-cache: true }
      - run: uv sync --all-extras --locked --python ${{ matrix.python }}
      - run: uv run coverage run -m pytest
      - run: uv run pytest -m postgres
      - run: uv run coverage report
```
- `--locked` fails CI if `uv.lock` is out of date with `pyproject.toml`.
- No secrets are used. `permissions: contents: read` only.
- Actions use version tags in M0. M5 pins them by commit SHA and turns on Dependabot.
- The full PR matrix (FastAPI floor/latest x SQLAlchemy 2.0/2.1, TDD 15.2) is added in M3, when
  there is FastAPI code to test.

### 7.7 Python 3.15 in CI
- Risk: on 2026-10-25, Python 3.15 is brand new. Some dev dependencies with C parts
  (`asyncpg`, `psycopg[binary]`, `pydantic-core` via FastAPI) may not have 3.15 wheels yet, and
  building from source may fail.
- `allow-prereleases: true` lets `setup-python` pick 3.15 even if only a release candidate is
  available in the runner's tool cache.
- If a dependency cannot install on 3.15:
  1. Open a GitHub issue naming the package and its wheel status.
  2. Set `continue-on-error: ${{ matrix.python == '3.15' }}` on the `test` job, with a comment
     linking the issue.
  3. Remove it as soon as wheels exist. Never drop or weaken the 3.11 job.
- `psycopg[binary]` failing alone can be replaced on 3.15 by pure-Python `psycopg` (needs
  `libpq` on the runner, present on `ubuntu-latest`) - record which path was used.

### 7.8 Local PostgreSQL for developers
```bash
docker run -d --name fastauthz-pg -p 5432:5432 \
  -e POSTGRES_USER=fastauthz -e POSTGRES_PASSWORD=fastauthz -e POSTGRES_DB=fastauthz_test postgres:18
export FASTAUTHZ_TEST_POSTGRES_URL=postgresql+psycopg://fastauthz:fastauthz@localhost:5432/fastauthz_test
uv run pytest -m postgres
```
Documented in `CONTRIBUTING.md` (one short section, same PR).

---

## 8. Performance notes
- M0 sets no performance gate. Spikes take rough `timeit` numbers only:
  - `to_sql(bind(...))` for a dotted rule vs target `< 100 µs` (TDD 16.1);
  - `evaluate()` for a 2-node `And` vs target `< 20 µs`;
  - property-test examples per second on each DB vs the TDD 14.1 budget (fast suite < 60 s).
- If a number is more than 5x over its target, write it as a risk in the report. Do not
  optimize spike code.
- Fast suite in M0 must run in a few seconds (it has ~10 tests).

---

## 9. Security notes
Threat model rows (TDD 17.1) touched in M0:
| Row | What M0 does |
|---|---|
| SQL injection via actor or literal values | Spike 1 asserts values appear only in `params`, never in SQL text (3.8.3 item 3). |
| `NULL` / missing values open access | Spikes 1-2 compare both engines on `NULL`s, anonymous actors and missing attributes. |
| Enumeration of ids through 403 vs 404 | Spike 3 checks "missing" and "denied" give the same 404 body (S3.2, S3.3). |
| Lazy load in Python check | Spike 2 checks unloaded detection and `MissingGreenlet` (3.9.5 item 2). |
| (Principle 8) FastAPI internals change | Spike 3 lists every internal used, for `_compat.py`. |

Supply chain (TDD 17.2) in M0:
- CI token is read-only, no secrets, no publishing.
- Dependencies come from PyPI through `uv.lock` with hashes.
- The core still has zero runtime dependencies (U4, U5, ruff `banned-api`).

---

## 10. Risks and open questions

### 10.1 If a spike fails
1. Write the failure in the report (what, where, why).
2. Change the main TDD section that is wrong.
3. Add `core_docs/decisions/ADR-00X-<short-name>.md` (context, decision, consequences).
4. Update the FSD if the user-visible behavior changes (CLAUDE.md rule 13).
5. Only then start M1.

### 10.2 Suspected disagreement: `NULL` column inside a dotted path under `NOT` (S1.5)
- Rule `~(R.group.org_id == A.org_id)`, row whose group exists but has `org_id = NULL`.
- SQL: `NOT EXISTS(SELECT ... WHERE groups.org_id = :p)` -> `TRUE` (row returned).
- Python per TDD 6.2: value `None` -> `UNKNOWN` -> `NOT UNKNOWN` = `UNKNOWN` (row not returned).
- **Recommended fix (to confirm with spikes 1-2):** inside a dotted many-to-one path, the
  Python engine treats the comparison the way `has()` does: the whole `Compare` / `In` / `Is`
  on a dotted path is `FALSE` unless the inner condition is `TRUE` (`EXISTS` is two-valued).
  So `UNKNOWN` inside a dotted path becomes `FALSE`. Note: this makes `~(R.group.org_id ==
  A.org_id)` `TRUE` for a group with `NULL` org, which is a fail-**open** risk for deny rules
  and negations. Alternative: compile dotted paths with an explicit null guard so SQL stays
  three-valued:
  `CASE WHEN EXISTS(... AND inner) THEN TRUE WHEN EXISTS(... AND inner IS NULL) THEN NULL ELSE FALSE END`.
  **Third option, recommended in M2 TDD 3.6.1: polarity-aware `EXISTS`.** The Python engine
  stays three-valued (fail closed). SQL renders `EXISTS(rel WHERE cond)` in positive polarity and
  `EXISTS(rel WHERE (cond) IS NOT FALSE)` under an odd number of `NOT`s. M2 TDD 3.6.1 proves the
  final TRUE / not-TRUE answer is then the same in both engines.
  The spike must try this option first (and the two above if it fails) on both DBs, and record
  which one keeps the engines equal **and** fails closed. The choice is an ADR and a TDD 6.2 / 9.4
  change before M1.
- The same question applies to `Related(kind="has")` and `"any"` with a `NULL`-producing
  `where` under `NOT` (TDD 7 says `any` returns `UNKNOWN` if any child is `UNKNOWN`, but SQL
  `EXISTS` returns `FALSE` for that child). Spike 1 cases S1.7 (NULL-tag row) and spike 2
  rules 8-9 under `NOT` must check it.

### 10.3 Other risks
| Risk | Recommended answer |
|---|---|
| FastAPI >= 0.137 route tree shape unknown | Spike 3 reads the source of both versions and writes the node types in the report; `iter_routes` design goes into TDD 12.7 if it differs. |
| `__signature__` trick stops working in a future FastAPI | It uses only `inspect.signature`, which is public Python. Contract test in `tests/compat/` (M3). |
| Python 3.15 wheels missing | 7.7. |
| Hypothesis + DB too slow for the 60 s fast suite | Reuse one engine, SAVEPOINT per example, keep `max_examples=500` on SQLite; if still slow, lower the PR count and raise the nightly count (change TDD 14.3 with the numbers). |
| `filterwarnings = error` breaks on third-party warnings | Narrow `ignore:` lines with comments; never a blanket ignore. |
| `pytest -m postgres` runs only PostgreSQL tests, while CLAUDE.md says it "adds" them | CI runs both commands. Fix the CLAUDE.md wording to "runs the PostgreSQL tests" in the same PR. |
| Lazy-load guard needs SQLAlchemy, but `evaluate.py` is core (rule 4) | Spike 2 confirms the `inspect(obj).unloaded` fact. Design for M1: `evaluate.py` only calls `fastauthz._compat.is_loaded` when `"sqlalchemy" in sys.modules` (if SQLAlchemy was never imported, no SQLAlchemy object can exist), via a lazy import. The core never imports SQLAlchemy itself, so U4/U5 still pass. |
| `[project.scripts]` points to a module that does not exist yet | Added in M4 with `cli.py` (7.1). |
| SQLAlchemy 2.0.0 too old for something we use | 3.11: raise the floor to the lowest passing 2.0.x; update TECH_STACK, TDD 15.1, TDD 18. |

---

## 11. Exit criteria
- [ ] `uv sync --all-extras --locked` works on a fresh clone (Python 3.11).
- [ ] `uv run pytest` (U1-U6, I1, I2, I5) passes locally; `uv run pytest -m postgres` (I3, I4) passes with local PostgreSQL.
- [ ] `uv run ruff check .`, `uv run ruff format --check .`, `uv run pyright` report 0 problems.
- [ ] `uv run pre-commit run --all-files` passes.
- [ ] CI green on Python 3.11 and 3.15 (or 3.15 marked `continue-on-error` with an open issue, 7.7).
- [ ] Spike 1: S1.1-S1.9 recorded on 4 backends; values only in bound params.
- [ ] Spike 2: 0 mismatches, or each mismatch explained and fixed in the design.
- [ ] Spike 3: S3.1-S3.9 recorded on FastAPI 0.115.x and newest; internals listed.
- [ ] FastAPI and SQLAlchemy floors written in `TECH_STACK.md`, `pyproject.toml` and TDD 15.1.
- [ ] Section 10.2 decided, with an ADR and main TDD 6.2 / 9.4 changes if needed.
- [ ] `core_docs/reports/M0_spikes.md` complete (template 3.12).
- [ ] `spikes/` deleted; `CHANGELOG.md` "Unreleased" mentions the project setup.

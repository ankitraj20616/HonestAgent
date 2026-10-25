# M4 - Tools, examples, docs
## Technical design (TDD) for this milestone

**Milestone:** M4 (about 20 hours)
**Main TDD sections:** 3 (layout), 10.2 (explain), 13 (tools for users), 14.4-14.5 (tests and gates),
15.2 (CI), 16 (performance), 17.1 (threat model), 19 (docs)
**Main FSD:** F15, F16, F17, N4-N6. **This milestone's FSD:** `FSD.md` (IDs `M4-F...`).
**Steps:** `TASKS.md` (IDs `M4-T...`).

> This file adds detail to the main TDD for M4 only. It must never contradict it.
> If the code needs a different design, change this file **and** the main TDD in the same PR.
> Section numbers here are stable. Refer to them as "M4 TDD 3.4".

---

## 1. Scope

### 1.1 In scope
| Part | Module / folder | Main TDD | M4 FSD |
|---|---|---|---|
| Test helpers | `src/fastauthz/testing.py` | 13.1-13.3 | M4-F15 |
| Static expression renderer | `src/fastauthz/decision.py` (`describe`) | 10.2 | M4-F16.3, M4-F16.4 |
| Command line tool | `src/fastauthz/cli.py`, `src/fastauthz/__main__.py` | 13.4 | M4-F16 |
| Example apps | `examples/blog`, `examples/saas_multitenant`, `examples/hospital` | 3, 14.4 | M4-F17.1-3 |
| Docs site | `docs/`, `mkdocs.yml` | 19, 14.5 | M4-F17D |
| Benchmarks | `benchmarks/` | 16 | M4-N |
| CI | `.github/workflows/*.yml` | 15.2 | all |

### 1.2 Out of scope
- New expression nodes, operators or problem codes.
- Any change to `truth.py`, `evaluate.py` or `sql.py` behavior. (M4 only **uses** them.)
- Route-level checks in the CLI (`fastauthz check` reads the policy only; route checks run in
  `authz.install()`, M3).
- Everything in main TDD 20 ("Later").

### 1.3 Design rules that apply here
- `testing.py` and `cli.py` are **not** core modules (main TDD 3), but they must import cleanly
  with **only** the core installed. SQLAlchemy and FastAPI are imported lazily inside the functions
  that need them, and only under `TYPE_CHECKING` at module level.
- `cli.py` uses only the standard library (`argparse`, `json`, `csv`, `importlib`, `io`).
- Constants live in `config.py` (section 4). No magic numbers in `testing.py` or `cli.py`.
- Output that shows rule names or values (`explain`, `matrix`, test helpers) is for developers.
  It is never used in HTTP responses (main TDD 12.5, CLAUDE.md rule 7).

---

## 2. Files and inputs

### 2.1 Files added
| Path | Purpose |
|---|---|
| `src/fastauthz/testing.py` | `assert_allowed`, `assert_denied`, `PolicyCase`, `check_cases`, `assert_filter_consistent`, `override_actor` |
| `src/fastauthz/cli.py` | `main(argv) -> int`, sub-commands `check`, `matrix`, `explain`, `version` |
| `src/fastauthz/__main__.py` | `python -m fastauthz` -> `raise SystemExit(main())` |
| `examples/__init__.py` | makes `examples.blog.authz:policy` importable from the repo root |
| `examples/README.md` | how to run each example; the "fake login" warning |
| `examples/blog/{__init__,models,authz,app,seed}.py`, `README.md` | blog example (section 3.6) |
| `examples/saas_multitenant/{__init__,models,authz,app,seed}.py`, `README.md` | SaaS example (section 3.7) |
| `examples/hospital/{__init__,models,authz,app,seed}.py`, `README.md` | hospital example (section 3.8) |
| `tests/unit/test_testing.py` | helpers that need no database |
| `tests/unit/test_describe.py` | `decision.describe()` rendering table |
| `tests/unit/test_cli.py` | every command and exit code, in process |
| `tests/unit/test_cli_subprocess.py` | `python -m fastauthz`, CLI with SQLAlchemy blocked |
| `tests/integration/test_filter_consistent.py` | `assert_filter_consistent` on SQLite (+ PostgreSQL, marked) |
| `tests/integration/test_override_actor.py` | `override_actor` with a real FastAPI app |
| `tests/examples/conftest.py` | per-example app/client fixtures, DB backend parametrization |
| `tests/examples/snapshot.py` | tiny snapshot helper (no new dependency) |
| `tests/examples/test_blog.py`, `test_saas_multitenant.py`, `test_hospital.py` | example tests |
| `tests/examples/snapshots/*` | matrix and OpenAPI snapshots |
| `tests/docs/test_docs_examples.py` | runs every `python` / `pycon` block in `docs/` |
| `docs/**.md`, `mkdocs.yml` | docs site (section 3.9) |
| `benchmarks/conftest.py`, `benchmarks/policies.py`, `benchmarks/test_bench_*.py` | benchmark suites (section 8) |
| `benchmarks/targets.py`, `benchmarks/check_targets.py` | targets and the target report script |
| `.github/workflows/docs.yml` | build on PR, deploy to GitHub Pages on `main` |
| `.github/workflows/nightly.yml` (extended) | benchmark compare job |
| `core_docs/reports/M4_benchmarks.md` | measured numbers on a laptop, with machine details |

### 2.2 Files changed
| Path | Change |
|---|---|
| `src/fastauthz/config.py` | M4 constants (section 4) |
| `src/fastauthz/decision.py` | add `describe(expr) -> str` if M1 did not already add a static renderer (section 3.3) |
| `pyproject.toml` | `[dependency-groups] docs`, `pytest-benchmark` in `dev`, pytest `testpaths`, `pythonpath` (section 7.1) |
| `.github/workflows/ci.yml` | examples job, `check --strict` on examples, docs-tests, benchmark smoke run |
| `tests/unit/test_imports.py` | also import `fastauthz.testing` and `fastauthz.cli` with SQLAlchemy/FastAPI blocked |
| `CHANGELOG.md` | M4 entries, `0.2.0` |
| `README.md` | link to the docs site; status badge text |
| `core_docs/TASKS.md`, `core_docs/timeline/timeline.md` | tick boxes, add date |

### 2.3 Inputs from earlier milestones (checked in task M4-T1)
M4 relies on these names. If an earlier milestone named something differently, M4-T1 adapts
this design (and this file) before coding. Anything private that M4 needs from outside the
package gets a **public, read-only** accessor (it becomes part of the API frozen in M5).

| Name | From | Used by |
|---|---|---|
| `Policy.validate() -> list[PolicyProblem]` | M1 (8.2) | `check` |
| `PolicyProblem(code: str, level: Literal["error","warning","notice"], message: str, source: str \| None, rule: str \| None)` | M1 (8.5) | `check` |
| `Policy.freeze()`, `PolicyError.problems` | M1 (8.2, 11) | CLI, helpers |
| `Policy.rules -> tuple[Rule, ...]` (definition order) | M1 (8.1) | `matrix`, `explain`, `check` (bypass list) |
| `Policy.resources -> Mapping[type, ResourceSpec]` | M1 (8.1) | `matrix`, `explain`, helpers |
| `Policy.role_includes -> Mapping[str, frozenset[str]]` (direct includes, as given to `roles()`) | M1 (8.3) | `matrix` roles section |
| `Policy._condition(action, model) -> Expr` | M1 (8.4) | `explain` full condition, eager-load walk |
| `Policy.actor_id(actor) -> object` | M1 (8.1) | labels in failure messages |
| `Policy.can / explain / filter` | M1, M2 | helpers |
| `Explanation.allowed: bool`, `Explanation.__str__` | M1 (10.2) | helpers |
| `Rule` fields (`name, effect, actions, resource, who, roles, when, check, sql, bypass_scope, source`) | M1 (8.1) | CLI |
| `ANYONE`, `AUTHENTICATED` | M1 | CLI |
| Internal nodes `ActorPresent`, `RolesMatch`, `CustomCheck` | M1 (8.4) | `describe` |
| `_compat.relationship_target(model, name) -> type` | M2/M3 (12.7) | eager-load options |
| `_compat.is_async_session(session) -> bool` | M3 (12.7) | helper guard |
| Lazy-load warning log record with `extra={"fastauthz_event": "not_loaded", "attribute": "<Model>.<name>"}` on logger `fastauthz` | M1 (7) | consistency hint |
| `FastAuthz.actor` - the `actor=` dependency, public read-only attribute | M3 (12.1) | `override_actor` |

---

## 3. Module design

### 3.1 `testing.py` - overview

```python
from __future__ import annotations

import logging
from collections.abc import Iterable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Final

from fastauthz import config
from fastauthz.errors import FastAuthzError
from fastauthz.policy import Policy

if TYPE_CHECKING:
    from fastapi import FastAPI
    from sqlalchemy.orm import Session
    from sqlalchemy.orm.interfaces import ORMOption

    from fastauthz.decision import Explanation
    from fastauthz.fastapi import FastAuthz

__all__ = [
    "PolicyCase",
    "assert_allowed",
    "assert_denied",
    "assert_filter_consistent",
    "check_cases",
    "override_actor",
]

_NOT_SET: Final = object()
```

All helpers raise `AssertionError` for a **test failure** (so pytest shows it as a normal failed
assertion), and normal exceptions for **wrong usage** (`ValueError`, `TypeError`) or policy bugs
(`PolicyError`, `UnknownActionError`, `NotFilterableError`, ...). Every helper sets
`__tracebackhide__ = True` so pytest hides helper frames.

#### 3.1.1 Labels used in messages
```python
def _actor_label(policy: Policy, actor: object | None) -> str:
    """'anonymous (None)' or 'User id=3'. Never the whole object (no repr of user data)."""

def _resource_label(policy: Policy, resource: object) -> str:
    """'Post id=7'. Uses the declared id_column of the resource type, default 'id'.
    Reading the id never raises: on any exception the label is 'Post id=?'."""
```
- Labels use type name + id only. This keeps test output short and avoids printing personal
  data that may be in `__repr__`.

### 3.2 `assert_allowed`, `assert_denied`

```python
def assert_allowed(policy: Policy, actor: object | None, action: str, resource: object) -> None: ...
def assert_denied(policy: Policy, actor: object | None, action: str, resource: object) -> None: ...
```

Behavior (shared by both, `expected` is `True` / `False`):
1. `__tracebackhide__ = True`.
2. `policy.freeze()` (no-op if frozen). A `PolicyError` propagates unchanged.
3. `explanation = policy.explain(actor, action, resource)`.
4. `allowed = policy.can(actor, action, resource)`.
5. If `allowed != explanation.allowed`: raise `AssertionError` with
   `"fastauthz internal error: can() and explain() disagree for <labels>. Please report this bug."`
   (This is a cheap self-check of the library; it must never happen.)
6. If `allowed != expected`: raise `AssertionError(_failure_message(...))`.

Failure message format (exact):
```text
Expected ALLOWED, got DENIED.
  actor:    User id=3
  action:   'edit'
  resource: Post id=7

<str(explanation)>
```
`str(explanation)` is the M1 table (one line per rule: name, effect, result, reason, source).

Edge cases:
- `actor=None` -> label `anonymous (None)`.
- Unknown action -> `UnknownActionError` propagates (it is a bug in the test, not a failed check).
- `resource` not of a declared type -> `UnknownResourceError` propagates.

### 3.3 `decision.describe()` - static renderer (core, stdlib only)

The CLI needs to print a rule tree **without** actor or row values. M1's `explain` already renders
expressions with values (`R.author_id (7) == A.id (3)`). M4 needs the same renderer in a
**static** mode. If M1 built the renderer with an optional values argument, `describe` is a thin
wrapper; otherwise M4 adds it to `decision.py`:

```python
def describe(expr: Expr) -> str:
    """Render an expression tree as text, deterministically, with no values bound."""
```

Rendering table (exact output, tested one row per test case):

| Node | Output |
|---|---|
| `ResourceAttr(("author_id",))` | `R.author_id` |
| `ResourceAttr(("project", "org_id"))` | `R.project.org_id` |
| `ActorAttr(("org", "id"))` | `A.org.id` |
| `Literal("draft")` | `'draft'` (Python `repr` for `str`, `bytes`) |
| `Literal(5)`, `Literal(1.5)`, `Literal(Decimal("2.50"))` | `5`, `1.5`, `Decimal('2.50')` |
| `Literal(True)` / `Literal(None)` | `True` / `None` |
| `Literal(Status.DRAFT)` (Enum) | `Status.DRAFT` |
| `Literal(date(2026, 1, 2))`, `datetime`, `time`, `UUID` | `date('2026-01-02')`, `datetime('2026-01-02T03:04:05')`, `time('03:04:05')`, `UUID('...')` (ISO text) |
| `Literal(("a", "b"))` | `('a', 'b')` - order kept as written |
| `Literal(frozenset({"b", "a"}))` | `{'a', 'b'}` - sorted by the rendered text of each item |
| `Compare(eq, a, b)` | `a == b` (`!=`, `<`, `<=`, `>`, `>=` the same) |
| `In(item, opts, negate=False/True)` | `item in (...)` / `item not in (...)` |
| `Is(item, None, negate=False/True)` | `item is NULL` / `item is not NULL` |
| `Is(item, True/False, negate=...)` | `item is TRUE`, `item is not FALSE`, ... |
| `And(items)` | items joined by ` AND `; an `Or` child is wrapped in `( )` |
| `Or(items)` | items joined by ` OR `; an `And` child is wrapped in `( )` |
| `Not(atomic)` / `Not(compound)` | `NOT a == b` -> rendered as `NOT (a == b)` always (no ambiguity) |
| `Related(("members",), "any", where)` | `R.members.any(<describe(where)>)` |
| `Related(("owner",), "has", where)` | `R.owner.has(<describe(where)>)` |
| `Const(TRUE / FALSE / UNKNOWN)` | `TRUE` / `FALSE` / `UNKNOWN` |
| `ActorPresent()` | `logged in` |
| `RolesMatch(frozenset({"admin"}))` | `role admin` |
| `RolesMatch(frozenset({"editor", "admin"}))` | `role admin or editor` (sorted) |
| `CustomCheck(rule)` | `custom check <qualname of rule.check>` plus ` (SQL: <qualname of rule.sql>)` or ` (no SQL)` |

- Inside `Related.where`, `R` means the related row (main TDD 5.2); the output keeps writing `R.`
  because that is how the user wrote it.
- Lambdas render as `custom check <lambda> (authz.py:42)` using the rule's `source`, so a
  reviewer can find it.
- The function is pure and deterministic: same tree -> same string, on every run and machine.

### 3.4 `check_cases` and `PolicyCase`

```python
@dataclass(frozen=True, slots=True)
class PolicyCase:
    actor: object | None
    action: str
    resource: object
    expected: bool
    label: str | None = None


def check_cases(policy: Policy, cases: Iterable[PolicyCase]) -> None: ...
```

Pseudocode:
```python
def check_cases(policy, cases):
    __tracebackhide__ = True
    case_list = list(cases)
    if not case_list:
        raise ValueError("check_cases() needs at least one PolicyCase")
    for item in case_list:
        if not isinstance(item, PolicyCase):
            raise TypeError(f"check_cases() expects PolicyCase items, got {type(item).__name__}")
    policy.freeze()                          # PolicyError raises once, before the loop
    failures: list[str] = []
    for number, case in enumerate(case_list, start=1):
        try:
            explanation = policy.explain(case.actor, case.action, case.resource)
        except FastAuthzError as exc:        # UnknownActionError, UnknownResourceError, ...
            failures.append(_case_error(number, case, exc))
            continue
        if explanation.allowed != case.expected:
            failures.append(_case_failure(number, case, explanation))
    if failures:
        header = f"{len(failures)} of {len(case_list)} policy cases failed:"
        raise AssertionError("\n\n".join([header, *failures]))
```

Report format (exact first lines of each entry):
```text
2 of 5 policy cases failed:

[case 2] bob cannot edit: actor=User id=2 action='edit' resource=Post id=7
  expected DENIED, got ALLOWED
  <str(explanation), indented by 4 spaces>

[case 4] actor=anonymous (None) action='eidt' resource=Post id=7
  error: UnknownActionError: action 'eidt' is not declared for Post
```
- The label (if any) comes right after `[case N]`.
- Non-fastauthz exceptions (a bug in the user's own object, a `KeyboardInterrupt`) propagate.
- Docs also show how to use `PolicyCase` with `pytest.mark.parametrize` (one test per case).

### 3.5 `assert_filter_consistent`

```python
def assert_filter_consistent(
    policy: Policy,
    session: Session,
    model: type[Any],
    *,
    actors: Sequence[object | None],
    actions: Sequence[str] | None = None,
    options: Sequence[ORMOption] = (),
    max_rows: int = config.CONSISTENCY_MAX_ROWS,
) -> None: ...
```
- Same call shape as main TDD 13.2. Two keyword arguments are added (they do not change the main
  shape): `options` (extra loader options, for custom checks) and `max_rows` (tests of the helper
  itself). `actions=None` means "all actions declared for `model`".

#### 3.5.1 Steps
```python
def assert_filter_consistent(policy, session, model, *, actors, actions=None, options=(), max_rows=...):
    __tracebackhide__ = True
    sa = _import_sqlalchemy()                # ImportError -> "needs the [sqlalchemy] extra"
    from fastauthz import _compat

    # 1. usage checks
    if _compat.is_async_session(session):
        raise TypeError("assert_filter_consistent() needs a sync Session. With an AsyncSession use: "
                        "await session.run_sync(lambda s: assert_filter_consistent(policy, s, ...))")
    if not actors:
        raise ValueError("actors must not be empty (use [None] for an anonymous user)")
    if max_rows < 1:
        raise ValueError("max_rows must be at least 1")
    policy.freeze()
    spec = policy.resources.get(model) or raise UnknownResourceError(model)
    action_list = list(actions) if actions is not None else sorted(spec.actions)
    for action in action_list:
        if action not in spec.actions:
            raise UnknownActionError(model, action)

    # 2. size guard (one COUNT query)
    count = session.scalar(sa.select(sa.func.count()).select_from(model))
    if count > max_rows:
        raise FastAuthzError(
            f"assert_filter_consistent: {model.__name__} has {count} rows, the limit is {max_rows}. "
            "Use a smaller test dataset.")
    if count == 0:
        raise AssertionError(f"assert_filter_consistent: no {model.__name__} rows in the session. "
                             "Add test data first; an empty table proves nothing.")

    # 3. load rows with the relationships the rules read
    chains = _relationship_chains(policy, model, action_list)
    stmt = (sa.select(model)
              .options(*_loader_options(model, chains), *options)
              .execution_options(populate_existing=True))
    rows = session.scalars(stmt).all()
    id_column = spec.id_column
    id_attr = getattr(model, id_column)

    # 4. compare per actor and action
    mismatches: list[_Mismatch] = []
    not_loaded: set[str] = set()
    with _capture_not_loaded(not_loaded):       # logging handler on logger "fastauthz"
        for actor in actors:
            for action in action_list:
                py_ids = {getattr(r, id_column) for r in rows if policy.can(actor, action, r)}
                sql_ids = set(session.scalars(
                    sa.select(id_attr).where(policy.filter(actor, action, model))).all())
                for row_id in sorted(py_ids ^ sql_ids, key=repr):
                    mismatches.append(_Mismatch(action, actor, row_id,
                                                python=row_id in py_ids, sql=row_id in sql_ids))

    # 5. report
    if mismatches:
        raise AssertionError(_consistency_report(policy, model, rows, mismatches, not_loaded))
```

- `policy.filter()` raises `NotFilterableError` for an action with a `check=` rule and no `sql=`.
  It propagates (the user asked to compare an action that has no SQL form).
- `populate_existing=True` makes sure rows already in the identity map get their relationships
  loaded by our options. It also overwrites **unflushed** attribute changes on those rows. The
  default `autoflush=True` flushes them before the query; docs tell users with `autoflush=False`
  to call `session.flush()` first.
- Read-only: only `SELECT` statements are sent (COUNT, the row load, one id query per actor and
  action). Test C11 checks this with a cursor event listener.

#### 3.5.2 Which relationships to load
```python
def _relationship_chains(policy: Policy, model: type, actions: Sequence[str]) -> set[tuple[str, ...]]:
    chains: set[tuple[str, ...]] = set()
    for action in actions:
        _walk(policy._condition(action, model), (), chains)
    # keep only the longest chains: ("org",) is covered by ("org", "members")
    return {c for c in chains if not any(o != c and o[: len(c)] == c for o in chains)}


def _walk(node: Expr, prefix: tuple[str, ...], chains: set[tuple[str, ...]]) -> None:
    match node:
        case ResourceAttr(path=path) if len(path) > 1:
            chains.add(prefix + path[:-1])                 # R.project.org_id -> ("project",)
        case Related(path=path, where=where):
            chains.add(prefix + path)                      # R.members.any(...) -> ("members",)
            _walk(where, prefix + path, chains)            # nested paths are relative to the related row
        case Compare(left=left, right=right):
            _walk(left, prefix, chains); _walk(right, prefix, chains)
        case In(item=item, options=opts):
            _walk(item, prefix, chains); _walk(opts, prefix, chains)
        case Is(item=item):
            _walk(item, prefix, chains)
        case And(items=items) | Or(items=items):
            for child in items: _walk(child, prefix, chains)
        case Not(item=item):
            _walk(item, prefix, chains)
        case _:
            pass        # ActorAttr, Literal, Const, ActorPresent, RolesMatch, CustomCheck


def _loader_options(model: type, chains: set[tuple[str, ...]]) -> list[ORMOption]:
    from sqlalchemy.orm import selectinload
    from fastauthz import _compat
    result = []
    for chain in sorted(chains):                           # deterministic
        current, loader = model, None
        for name in chain:
            attr = getattr(current, name)
            loader = selectinload(attr) if loader is None else loader.selectinload(attr)
            current = _compat.relationship_target(current, name)
        result.append(loader)
    return result
```
- `selectinload` is public SQLAlchemy API, so it is allowed outside `_compat.py`. The
  relationship **target** lookup goes through `_compat`.
- `CustomCheck` nodes may read relationships we cannot see. For those, the user passes
  `options=[selectinload(Doc.shares)]`. If they forget, the lazy-load guard makes the Python side
  `UNKNOWN` (deny) and the capture below explains the mismatch.

#### 3.5.3 The "not loaded" hint
```python
@contextmanager
def _capture_not_loaded(sink: set[str]) -> Iterator[None]:
    """Collect 'attribute' of log records with fastauthz_event == 'not_loaded' while active."""
```
- A `logging.Handler` subclass is added to logger `fastauthz` and removed in `finally`.
- The handler does not stop propagation; the user still sees the normal WARNING.

#### 3.5.4 Report format
```text
assert_filter_consistent: Python and SQL disagree for Post (3 differences).

[1] action='read' actor=User id=2 row Post id=14: Python says ALLOWED, SQL says DENIED
    <str(policy.explain(actor, action, row)), indented by 4 spaces>

[2] ...

(17 more differences not shown)

Hint: these relationships were not loaded during the Python check: Doc.shares.
      Pass options=[selectinload(...)] for relationships that custom checks read.
```
- At most `config.CONSISTENCY_MAX_REPORTED` entries get a full explanation; the rest are counted.
- The hint block appears only if `not_loaded` is not empty.
- `explain` is called only for reported rows (no cost on the happy path).

#### 3.5.5 Async use (documented, no extra API)
```python
async def test_consistent(async_session: AsyncSession) -> None:
    await async_session.run_sync(
        lambda s: assert_filter_consistent(policy, s, Post, actors=[alice, bob, None]))
```

### 3.6 `override_actor`

```python
@contextmanager
def override_actor(app: FastAPI, authz: FastAuthz, actor: object | None) -> Iterator[None]:
    dependency = authz.actor
    previous = app.dependency_overrides.get(dependency, _NOT_SET)

    def _current_actor() -> object | None:
        return actor

    app.dependency_overrides[dependency] = _current_actor
    try:
        yield
    finally:
        if previous is _NOT_SET:
            app.dependency_overrides.pop(dependency, None)
        else:
            app.dependency_overrides[dependency] = previous
```
- No runtime import of FastAPI is needed (only dict operations). Types come from `TYPE_CHECKING`.
- Nested blocks restore in the right order (LIFO), because each block saves what it found.
- `dependency_overrides` is shared by the whole app object. Docs say: do not use the same app
  object from tests that run in parallel threads.

### 3.7 `cli.py`

#### 3.7.1 Entry point
```python
def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:                    # argparse: --help (0) or usage error (2)
        return _exit_code_of(exc)
    try:
        return args.handler(args)
    except _UsageError as exc:
        print(f"fastauthz: error: {exc}", file=sys.stderr)
        return config.CLI_EXIT_USAGE
    except Exception:                            # a bug in fastauthz or in the user's module
        print("fastauthz: internal error (please report it):", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return config.CLI_EXIT_USAGE


def _exit_code_of(exc: SystemExit) -> int:
    code = exc.code
    if code is None:
        return config.CLI_EXIT_OK
    if isinstance(code, int):
        return code
    return config.CLI_EXIT_USAGE


class _UsageError(Exception):
    """Bad input to the CLI. Becomes exit code 2. Private: not part of errors.py."""
```
- `[project.scripts] fastauthz = "fastauthz.cli:main"` (main TDD 18). The console-script wrapper
  calls `sys.exit(main())`, so returning an `int` is enough.
- `__main__.py`:
  ```python
  from fastauthz.cli import main

  raise SystemExit(main())
  ```
- Output goes to `sys.stdout`; error messages to `sys.stderr`. No colors. Lines end with `\n`.
- `cli.py` imports nothing outside the standard library and the fastauthz core at module level.

#### 3.7.2 Parser
```python
def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="fastauthz", description="fastauthz policy tools")
    sub = parser.add_subparsers(dest="command", required=True, metavar="COMMAND")

    p = sub.add_parser("check", help="check a policy for mistakes")
    p.add_argument("target", help="module:attribute, e.g. app.authz:policy")
    p.add_argument("--strict", action="store_true", help="also fail on warnings")
    p.add_argument("--format", choices=config.CLI_CHECK_FORMATS, default=config.CLI_DEFAULT_CHECK_FORMAT)
    p.set_defaults(handler=_cmd_check)

    p = sub.add_parser("matrix", help="print who can do what")
    p.add_argument("target")
    p.add_argument("--format", choices=config.CLI_MATRIX_FORMATS, default=config.CLI_DEFAULT_MATRIX_FORMAT)
    p.add_argument("--output", type=pathlib.Path, default=None, help="write to FILE instead of stdout")
    p.set_defaults(handler=_cmd_matrix)

    p = sub.add_parser("explain", help="print every rule for one resource and action")
    p.add_argument("target")
    p.add_argument("--resource", required=True)
    p.add_argument("--action", required=True)
    p.set_defaults(handler=_cmd_explain)

    p = sub.add_parser("version", help="print versions")
    p.set_defaults(handler=_cmd_version)
    return parser
```

#### 3.7.3 Loading the policy
```python
def _load_policy(target: str) -> Policy:
    module_name, sep, attr_path = target.partition(":")
    if not sep or not module_name or not attr_path:
        raise _UsageError(f"'{target}' is not in the form 'module:attribute' (example: app.authz:policy)")
    cwd = os.getcwd()
    if cwd not in sys.path:
        sys.path.insert(0, cwd)                        # same as uvicorn
    try:
        module = importlib.import_module(module_name)
    except PolicyError:
        raise                                          # a FastAuthz(...) at import froze a bad policy
    except Exception as exc:
        raise _UsageError(f"could not import '{module_name}': {type(exc).__name__}: {exc}") from exc
    obj: object = module
    for part in attr_path.split("."):
        try:
            obj = getattr(obj, part)
        except AttributeError:
            raise _UsageError(f"module '{module_name}' has no attribute '{attr_path}'") from None
    if not isinstance(obj, Policy):
        raise _UsageError(f"'{target}' is a {type(obj).__name__}, not a fastauthz Policy")
    return obj
```
- `PolicyError` during import: `check` prints `exc.problems` in the chosen format and exits `1`
  (the policy has errors - that is a result, not a usage problem). `matrix` and `explain` print
  `policy has N errors; run 'fastauthz check <target>'` to stderr and exit `1`.
- `SystemExit` raised by the user's module is not caught by `except Exception`; it ends the CLI
  with the module's code. This is acceptable and documented ("do not call `sys.exit` at import").

#### 3.7.4 Source paths
```python
def _display_source(source: str | None) -> str:
    """'examples/blog/authz.py:16'. Path relative to cwd if under cwd, POSIX slashes; '-' if None."""
```
- Relative paths make output identical on every machine (needed for snapshots).
- Sorting key for a source: `(path, int(line))`; `None` sorts last.

#### 3.7.5 `check`
```python
def _cmd_check(args: argparse.Namespace) -> int:
    try:
        policy = _load_policy(args.target)
        problems = policy.validate()
    except PolicyError as exc:
        policy, problems = None, list(exc.problems)
    problems = sorted(problems, key=_problem_sort_key)   # level (error, warning, notice), source, code
    bypass = [] if policy is None else _bypass_rules(policy)
    counts = Counter(p.level for p in problems)
    failed = counts["error"] > 0 or (args.strict and counts["warning"] > 0)
    render = _render_check_json if args.format == "json" else _render_check_text
    sys.stdout.write(render(args.target, problems, bypass, counts, strict=args.strict, failed=failed))
    return config.CLI_EXIT_ERRORS if failed else config.CLI_EXIT_OK
```
- `_bypass_rules(policy)` = every allow rule with `bypass_scope=True`, in definition order.
  Main FSD F8.4 and TDD 17.1 say the CLI lists them. There is no FA code for this (TDD 8.5), so it
  is a separate output section, not a problem. (No new code is invented; see section 10, Q5.)
- `check` never calls `freeze()`; `validate()` is pure.

Text format (columns padded to the widest value; exact spacing is tested):
```text
app/authz.py:14  FA001  error    Rule 'Post.eidt#3' uses action 'eidt', which Post does not declare. Declared: create, delete, edit, read.
app/authz.py:20  FA015  warning  Rule 'Post.read#5' compares with None using '=='. This never matches. Use .is_(None).
app/authz.py:9   FA012  notice   Resource Report has scope=None. It is not tenant-scoped.

Rules that bypass the scope:
  app/authz.py:11  public-posts  (Post: read)

Result: 1 error, 1 warning, 1 notice. FAILED.
```
- No problems: `No problems found.` before the result line.
- No bypass rules: the section is printed as `Rules that bypass the scope: none`.
- Result line: `Result: <n> error(s), <n> warning(s), <n> notice(s). OK.` / `FAILED.` (plural `s`
  follows the count). With `--strict` the line ends `(strict)`.

JSON format (`indent=2`, `sort_keys=False`, key order fixed as below, trailing newline):
```json
{
  "version": 1,
  "target": "app.authz:policy",
  "strict": false,
  "ok": false,
  "counts": {"error": 1, "warning": 1, "notice": 1},
  "problems": [
    {"code": "FA001", "level": "error", "source": "app/authz.py:14", "rule": "Post.eidt#3",
     "message": "Rule 'Post.eidt#3' uses action 'eidt', which Post does not declare. Declared: create, delete, edit, read."}
  ],
  "bypass_scope_rules": [
    {"rule": "public-posts", "resource": "Post", "actions": ["read"], "source": "app/authz.py:11"}
  ]
}
```
- `"ok"` is always `exit_code == 0`. `"version"` is `config.CLI_JSON_VERSION` (bump on a breaking
  change of this format).
- For usage errors (exit 2) nothing is written to stdout, even with `--format json`.

#### 3.7.6 `matrix`
Data model (built once, rendered three ways):
```python
@dataclass(frozen=True, slots=True)
class _RuleRow:
    rule: str                    # rule name
    effect: Literal["allow", "deny"]
    text: str                    # plain words (below)
    who: Literal["anyone", "authenticated"]
    roles: tuple[str, ...]       # sorted; () = any role
    when: str | None             # describe(rule.when)
    custom_check: str | None     # qualname of rule.check
    filterable: bool             # False if check= without sql=
    bypass_scope: bool
    source: str                  # display source
    wildcard: bool               # the rule was written with action "*"


@dataclass(frozen=True, slots=True)
class _ActionRow:
    resource: str                # display name (section 3.7.7)
    action: str
    scope: str | None            # describe(spec.scope) or None
    allow: tuple[_RuleRow, ...]  # definition order
    deny: tuple[_RuleRow, ...]

    @property
    def nobody(self) -> bool: return not self.allow
    @property
    def filterable(self) -> bool: return all(r.filterable for r in (*self.allow, *self.deny))
```

Building:
```python
def _matrix_rows(policy: Policy) -> list[_ActionRow]:
    names = _resource_display_names(policy.resources)
    rows = []
    for model, spec in sorted(policy.resources.items(), key=lambda kv: names[kv[0]]):
        for action in sorted(spec.actions):
            matching = [r for r in policy.rules
                        if r.resource is model and (action in r.actions or "*" in r.actions)]
            rows.append(_ActionRow(
                resource=names[model], action=action,
                scope=None if spec.scope is None else describe(spec.scope),
                allow=tuple(_rule_row(r) for r in matching if r.effect == "allow"),
                deny=tuple(_rule_row(r) for r in matching if r.effect == "deny")))
    return rows
```

Plain words for one rule (`_rule_row(...).text`):
```python
def _rule_text(rule: Rule) -> str:
    parts: list[str] = []
    if rule.effect == "allow" and rule.who is ANYONE:
        parts.append("anyone (even not logged in)")
    if rule.effect == "deny" and rule.who is AUTHENTICATED:
        parts.append("logged-in users")
    if rule.roles:
        parts.append("role " + " or ".join(sorted(rule.roles)))
    if rule.when is not None:
        parts.append(describe(rule.when))
    if rule.check is not None:
        parts.append(describe(CustomCheck(rule)))           # "custom check fn (no SQL)"
    if not parts:
        parts.append("any logged-in user" if rule.effect == "allow" else "always")
    text = " and ".join(parts)
    if rule.bypass_scope:
        text += " [bypasses scope]"
    return text
```
- The text is built from the **real** tree (not folded, not simplified), so it cannot hide a
  condition. The scope is shown in its own column; an allow rule without `[bypasses scope]` always
  also needs the scope.

Markdown rendering (exact layout):
```text
# fastauthz permission matrix

Policy: `examples.blog.authz:policy`

Rules are for logged-in users unless they say "anyone". Allow rules also need the scope, unless
they say "[bypasses scope]". Any deny rule blocks access.

| Resource | Action | Allowed when (any one) | Denied when (any one) | Scope |
|---|---|---|---|---|
| Post | create | role editor (`editors-create-posts`) | - | none |
| Post | delete | R.author_id == A.id (`authors-edit-own-posts`)<br>role admin (`admins-do-anything`, `*`) | R.locked is TRUE (`locked-posts-stay`) | none |
| Post | edit | R.author_id == A.id (`authors-edit-own-posts`)<br>role admin (`admins-do-anything`, `*`) | - | none |
| Post | read | anyone (even not logged in) and R.published is TRUE (`public-posts`)<br>R.author_id == A.id (`authors-read-own-drafts`)<br>role admin (`admins-do-anything`, `*`) | - | none |

Roles (a role includes the roles after the arrow):
- admin -> editor

Rules that bypass the scope: none
```
- That is the exact expected output for the blog example policy (section 3.8.1); it is the
  snapshot `tests/examples/snapshots/blog_matrix.md`.
- Several rules in one cell are joined with `<br>`. An empty cell is `-`.
- Action with no allow rule: the cell is `**nobody**`. Non-filterable action: the action cell gets
  ` (not filterable)`.
- Escaping: `|` -> `\|`, newlines -> space, backticks inside rule names -> `'`.
- `*` after a rule name means the rule was written for all actions.

JSON rendering:
```json
{
  "version": 1,
  "target": "examples.blog.authz:policy",
  "roles": {"admin": ["editor"]},
  "resources": [
    {
      "resource": "Post",
      "scope": null,
      "actions": [
        {
          "action": "create",
          "nobody": false,
          "filterable": true,
          "allow": [
            {"rule": "editors-create-posts", "text": "role editor", "who": "authenticated",
             "roles": ["editor"], "when": null, "custom_check": null, "filterable": true,
             "bypass_scope": false, "wildcard": false, "source": "examples/blog/authz.py:14"}
          ],
          "deny": []
        }
      ]
    }
  ],
  "bypass_scope_rules": []
}
```

CSV rendering (`csv.writer`, `lineterminator="\n"`, header row exact):
```text
resource,action,effect,rule,who,roles,when,custom_check,filterable,bypass_scope,wildcard,source
Post,create,allow,editors-create-posts,authenticated,editor,,,true,false,false,examples/blog/authz.py:14
```
- One line per (resource, action, rule). Allow lines before deny lines, each in definition order.
- An action with no rules at all gets one line with `effect=none` and empty rule fields.
- `roles` joined with `;`. Booleans as `true` / `false`.

`--output FILE`: the rendered text is written with `encoding="utf-8"`, `newline="\n"`; stdout
stays empty; exit `0`. A write error (`OSError`) -> `_UsageError` -> exit `2`.

`matrix` on a policy with errors: it runs `validate()` first; if any error, it prints
`policy has N errors; run 'fastauthz check <target>'` to stderr and exits `1` (rules with errors
cannot be described reliably).

#### 3.7.7 Resource names
```python
def _resource_display_names(resources: Mapping[type, ResourceSpec]) -> dict[type, str]:
    """model.__name__, or f"{model.__module__}.{model.__qualname__}" for every model whose
    __name__ is shared with another declared model."""
```
- `--resource` (explain) accepts either form. A short name that matches two models -> exit `2`
  with `resource name 'Post' is ambiguous: blog.models.Post, shop.models.Post`.

#### 3.7.8 `explain`
Output for `fastauthz explain examples.blog.authz:policy --resource Post --action delete`:
```text
Post / delete

Scope: none

Allow rules (any one is enough):
  1. authors-edit-own-posts   examples/blog/authz.py:16
     logged in AND R.author_id == A.id
  2. admins-do-anything       examples/blog/authz.py:17   (written for "*")
     logged in AND role admin

Deny rules (any one blocks):
  1. locked-posts-stay        examples/blog/authz.py:18
     R.locked is TRUE

Full condition:
  ((logged in AND R.author_id == A.id) OR (logged in AND role admin)) AND NOT (R.locked is TRUE)
```
- Each rule line shows `describe()` of the rule's own part of the tree (who, roles, when, scope
  unless bypassed), so the reader sees exactly what main TDD 8.4 builds.
- "Full condition" is `describe(policy._condition(action, model))`, wrapped at no width
  (one line). For readability, the top-level `And(allow_part, Not(deny_part))` is rendered as
  `(<allow>) AND NOT (<deny>)`.
- Errors (exit `2`): unknown resource (message lists known names, sorted), unknown action (message
  lists declared actions, sorted). Policy with errors -> exit `1` (as matrix).
- This command is **static** (no actor, no row). `policy.explain(actor, action, obj)` is the
  dynamic one. The help text and docs name the difference.

#### 3.7.9 `version`
```text
fastauthz 0.2.0
python 3.14.0
sqlalchemy 2.0.44
fastapi not installed
```
- fastauthz version from `fastauthz._version.__version__`; others from
  `importlib.metadata.version(name)` with `PackageNotFoundError` -> `not installed`; Python from
  `platform.python_version()`. Always exit `0`. (Numbers above are examples only.)

### 3.8 Example apps

#### 3.8.0 Shared shape
```text
examples/
  __init__.py
  README.md                  # how to run; "fake login, not for production" warning
  <name>/
    __init__.py
    models.py                # SQLAlchemy 2.0 typed models (Mapped[...])
    authz.py                 # the policy - no side effects at import
    app.py                   # create_app(url=...) -> FastAPI; module-level `app = create_app()`
    seed.py                  # seed(session) -> Seed: demo data used by tests and by the dev server
    README.md                # the rules in plain words + how to try them with curl
```
- `app.py` pattern (async variant; the SaaS example uses the sync variant):
  ```python
  def create_app(url: str = config_url_default) -> FastAPI:
      engine = create_async_engine(url, poolclass=StaticPool)       # StaticPool only for in-memory SQLite
      app = FastAPI(title="fastauthz blog example", lifespan=_lifespan(engine))
      app.state.sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
      app.include_router(router)
      authz.install(app)
      return app


  async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
      async with request.app.state.sessionmaker() as session:
          yield session


  async def get_current_user(
      session: Annotated[AsyncSession, Depends(get_session)],
      x_user_id: Annotated[int | None, Header()] = None,
  ) -> User | None:
      # DEMO ONLY. This is not authentication. Use your real login dependency here.
      return None if x_user_id is None else await session.get(User, x_user_id)


  authz = FastAuthz(policy, actor=get_current_user, session=get_session)
  ```
- FastAPI caches a dependency per request, so `get_current_user` and the fastauthz dependencies
  share one session.
- The example's default database URL (`sqlite+aiosqlite://` in memory, seeded in lifespan) is a
  module constant in the example (examples are not library code; CLAUDE.md rule 8 covers `src/`).
- Running: `uv run uvicorn examples.blog.app:app --reload`.
- Each `authz.py` passes `fastauthz check --strict` (no errors, no warnings; notices are allowed).

#### 3.8.1 `examples/blog` (async session)
Models:
```python
class Base(DeclarativeBase): ...

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    roles: Mapped[list[str]] = mapped_column(JSON, default=list)

class Post(Base):
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str]
    body: Mapped[str]
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    published: Mapped[bool] = mapped_column(default=False)
    locked: Mapped[bool] = mapped_column(default=False)
    author: Mapped[User] = relationship()
```
Policy (`examples/blog/authz.py`; line numbers in snapshots follow this file):
```python
policy = Policy()
policy.roles({"admin": ["editor"]})
policy.resource(Post, actions=["read", "create", "edit", "delete"])

policy.allow("read", Post, who=ANYONE, when=R.published.is_(True), name="public-posts")
policy.allow("read", Post, when=R.author_id == A.id, name="authors-read-own-drafts")
policy.allow("create", Post, roles=["editor"], name="editors-create-posts")
policy.allow(["edit", "delete"], Post, when=R.author_id == A.id, name="authors-edit-own-posts")
policy.allow("*", Post, roles=["admin"], name="admins-do-anything")
policy.deny("delete", Post, when=R.locked.is_(True), name="locked-posts-stay")
```
Routes:
| Method, path | Dependency | Result |
|---|---|---|
| `GET /posts` | `authz.query(Post, "read")` | list, `limit` / `offset` query params |
| `GET /posts/{post_id}` | `authz.load(Post, "read")` | one post or 404 |
| `POST /posts` | `authz.require("create", Post)` + `get_current_user` | 201; `author_id` = current user |
| `PATCH /posts/{post_id}` | `authz.load(Post, "edit")` | 200 or 404 |
| `DELETE /posts/{post_id}` | `authz.load(Post, "delete")` | 204 or 404 |

Seed: `alice` (roles `[]`), `bob` (`[]`), `erin` (`["editor"]`), `root` (`["admin"]`); posts:
alice published, alice draft, bob published, bob draft, alice published + locked.

Tests (`tests/examples/test_blog.py`):
1. Anonymous `GET /posts` -> only the 3 published posts.
2. alice `GET /posts` -> published posts + alice's draft (4).
3. root `GET /posts` -> all 5.
4. Anonymous `GET /posts/{bob_draft}` -> 404; alice -> 404; bob -> 200.
5. alice `PATCH` own post -> 200, body changed in DB.
6. alice `PATCH` bob's post -> 404 (not 403; existence hidden).
7. alice `DELETE` own locked post -> 404; root `DELETE` locked post -> 404 (deny wins).
8. root `DELETE` bob's unlocked post -> 204.
9. bob `POST /posts` -> 403 with `application/problem+json`, body has no rule name.
10. erin `POST /posts` -> 201, `author_id == erin.id`; root `POST /posts` -> 201 (admin includes editor).
11. OpenAPI: `x-fastauthz` on every guarded route; matches `snapshots/blog_openapi.json`.
12. `check_cases` table of 12 cases (each user x each action on two posts).
13. `assert_filter_consistent(policy, s, Post, actors=[alice, bob, erin, root, None])` (via `run_sync`).
14. `main(["check", "--strict", "examples.blog.authz:policy"]) == 0`.
15. `main(["matrix", "examples.blog.authz:policy"])` output == `snapshots/blog_matrix.md`.
16. `override_actor(app, authz, alice)` makes requests without a header act as alice.

#### 3.8.2 `examples/saas_multitenant` (sync session)
Models:
```python
class Org(Base):
    __tablename__ = "orgs"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    members: Mapped[list[Membership]] = relationship(back_populates="org")

class Membership(Base):                       # roles per company
    __tablename__ = "memberships"
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    role: Mapped[str]                          # "owner" | "editor" | "viewer"
    org: Mapped[Org] = relationship(back_populates="members")

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"))
    name: Mapped[str]
    roles: Mapped[list[str]] = mapped_column(JSON, default=list)   # global: "support", "billing"

class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"))
    name: Mapped[str]
    org: Mapped[Org] = relationship()

class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"))
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    amount_cents: Mapped[int]
    status: Mapped[str] = mapped_column(default="pending")    # "pending" | "approved" | "void"
    org: Mapped[Org] = relationship()

class Currency(Base):                          # public reference data, no tenant
    __tablename__ = "currencies"
    code: Mapped[str] = mapped_column(primary_key=True)
    active: Mapped[bool] = mapped_column(default=True)
```
Policy:
```python
policy = Policy(scope=R.org_id == A.org_id)
policy.roles({"support": [], "billing": []})

policy.resource(Org, actions=["read", "manage"], scope=R.id == A.org_id)
policy.resource(Project, actions=["read", "edit"])
policy.resource(Invoice, actions=["read", "create", "approve"])
policy.resource(Currency, actions=["read"], scope=None, id_column="code")

policy.allow("read", Org, name="members-read-own-org")
policy.allow("manage", Org, when=R.members.any(user_id=A.id, role="owner"), name="owners-manage-org")
policy.allow("read", Project, name="members-read-projects")
policy.allow("edit", Project,
             when=R.org.members.any((R.user_id == A.id) & R.role.in_(["owner", "editor"])),
             name="org-editors-edit-projects")
policy.allow("read", Invoice, name="members-read-invoices")
policy.allow("create", Invoice, roles=["billing"], name="billing-creates-invoices")
policy.allow("approve", Invoice,
             when=R.org.members.any(user_id=A.id, role="owner") & (R.status == "pending"),
             name="owners-approve-pending")
policy.allow("read", Invoice, roles=["support"], bypass_scope=True, name="support-reads-all-invoices")
policy.allow("read", Currency, who=ANYONE, when=R.active.is_(True), name="active-currencies-are-public")
policy.deny("approve", Invoice, when=R.created_by_id == A.id, name="no-self-approval")
```
- Depth of `R.org.members.any(...)`: 1 hop + 1 `Related` = 2 (<= `MAX_RELATION_DEPTH`).
- Expected `check --strict`: exit 0, one notice (FA012 for `Currency`), one bypass rule listed.
Routes:
| Method, path | Dependency | Notes |
|---|---|---|
| `GET /invoices` | `authz.query(Invoice, "read")` | only own org (support: all) |
| `GET /invoices/{invoice_id}` | `authz.load(Invoice, "read")` | 404 for other orgs |
| `POST /invoices` | `authz.guard` | builds `Invoice(**body, created_by_id=user.id)`, `guard.check("create", invoice)` -> 403 for another org's `org_id` |
| `POST /invoices/{invoice_id}/approve` | `authz.load(Invoice, "approve")` | sets `status="approved"` |
| `GET /projects` | `authz.query(Project, "read")` | |
| `PATCH /projects/{project_id}` | `authz.load(Project, "edit")` | per-org role from `Membership` |
| `GET /orgs/{org_id}` | `authz.load(Org, "read")` | org scope is `R.id == A.org_id` |
| `GET /currencies/{code}` | `authz.load(Currency, "read", param="code")` | public, no scope |

Seed: orgs `acme` and `globex`; users: `ann` (acme owner), `ed` (acme editor), `vic` (acme viewer),
`bill` (acme, global role `billing`), `gus` (globex owner), `sam` (globex, global role `support`);
invoices in both orgs, one created by `ann`; currencies `INR` (active), `XXX` (inactive).

Tests (`tests/examples/test_saas_multitenant.py`):
1. `ann` lists invoices -> only acme invoices; the compiled SQL has `invoices.org_id = ?` and the
   org id is only in the bound parameters (`compile().params`), not in the SQL text.
2. `gus` `GET /invoices/{acme_invoice}` -> 404.
3. `sam` (support) lists invoices -> invoices of both orgs (bypass scope).
4. `ed` `PATCH /projects/{acme_project}` -> 200; `vic` -> 404; `gus` -> 404.
5. `ann` approves a pending invoice created by `bill` -> 200; approves her own -> 404 (deny wins);
   approves an already approved invoice -> 404.
6. `bill` `POST /invoices` with `org_id=acme` -> 201; with `org_id=globex` -> 403 problem details.
7. `vic` `POST /invoices` (no `billing` role) -> 403.
8. Anonymous `GET /currencies/INR` -> 200; `GET /currencies/XXX` -> 404.
9. `ann` `GET /orgs/{acme}` -> 200; `GET /orgs/{globex}` -> 404.
10. User story 7.2: a copy of the policy with a new `Report` model without `org_id` -> `freeze()`
    raises `PolicyError` whose problems contain FA008 naming `Report` and suggesting `scope=None`.
11. `check --strict` exit 0; text output lists `support-reads-all-invoices` under "bypass the scope".
12. `matrix` snapshot `snapshots/saas_matrix.md`.
13. `assert_filter_consistent` for `Invoice` and `Project`, actors = every seeded user + `None`.

#### 3.8.3 `examples/hospital` (async session)
Models:
```python
ward_doctors = Table(
    "ward_doctors", Base.metadata,
    Column("ward_id", ForeignKey("wards.id"), primary_key=True),
    Column("doctor_id", ForeignKey("doctors.id"), primary_key=True),
)

class Doctor(Base):
    __tablename__ = "doctors"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    is_senior: Mapped[bool | None]                       # None = not known yet
    roles: Mapped[list[str]] = mapped_column(JSON, default=list)   # "doctor", "chief"

class Ward(Base):
    __tablename__ = "wards"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    doctors: Mapped[list[Doctor]] = relationship(secondary=ward_doctors)

class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    ward_id: Mapped[int | None] = mapped_column(ForeignKey("wards.id"))
    is_vip: Mapped[bool] = mapped_column(default=False)
    discharged_at: Mapped[datetime | None]
    ward: Mapped[Ward | None] = relationship()
```
Policy:
```python
policy = Policy()
policy.roles({"chief": ["doctor"], "doctor": []})

policy.resource(Ward, actions=["read"])
policy.resource(Patient, actions=["read", "update", "discharge"])

policy.allow("read", Ward, when=R.doctors.any(id=A.id), name="doctors-read-own-wards")
policy.allow("read", Patient, when=R.ward.doctors.any(id=A.id), name="doctors-read-ward-patients")
policy.allow("update", Patient, roles=["doctor"],
             when=R.ward.doctors.any(id=A.id) & R.discharged_at.is_(None),
             name="doctors-update-admitted-patients")
policy.allow(["read", "update"], Patient, roles=["chief"], name="chiefs-see-all-patients")
policy.allow("discharge", Patient, roles=["chief"], when=R.discharged_at.is_(None), name="chiefs-discharge")
policy.deny(["read", "update"], Patient, when=R.is_vip.is_(True) & ~A.is_senior.is_(True),
            name="vip-only-for-senior-doctors")
```
- The VIP deny covers `update` too, so a junior doctor cannot change a VIP patient they cannot
  read. The example README explains this lesson.
- `is_senior=None`: `A.is_senior.is_(True)` is `FALSE` (Is table, main TDD 6.3), so `~...` is `TRUE`
  and the deny blocks. Unsure = no.
- Anonymous: `A.is_senior` is `MISSING` -> `UNKNOWN`; the allow rules are not `TRUE` anyway.
Routes: `GET /patients` (query read), `GET /patients/{patient_id}` (load read),
`PATCH /patients/{patient_id}` (load update), `POST /patients/{patient_id}/discharge`
(load discharge), `GET /wards` (query read).
Seed: wards `A`, `B`, `C` (no doctors); doctors `jun` (junior, ward A), `sen` (senior, wards A and B),
`unk` (`is_senior=None`, ward B), `chi` (chief, senior, no ward); patients in A and B, one VIP in A,
one discharged in B, one with `ward_id=None`, one in ward C.

Tests (`tests/examples/test_hospital.py`):
1. `jun` lists patients -> ward A patients except the VIP.
2. `sen` lists patients -> wards A and B, including the VIP.
3. `unk` lists patients -> ward B patients; `unk` cannot see the VIP even after a move to ward B.
4. Patient with `ward_id=None` and patient in ward C -> nobody except `chi` sees them.
5. `sen` `PATCH` discharged patient -> 404; `PATCH` admitted patient in ward A -> 200.
6. `jun` `PATCH` the VIP -> 404 (deny covers update).
7. `chi` discharges an admitted patient -> 200; discharges again -> 404.
8. `chi` lists patients -> all, including the VIP (chief is senior).
9. Lazy-load lesson: `policy.can(sen, "read", patient)` on a patient loaded **without** `ward`
   -> `False` and a WARNING in `caplog` naming `Patient.ward`.
10. `assert_filter_consistent` for `Patient`, actors `[jun, sen, unk, chi, None]` plus a dict actor
    `{"id": 999}` (no `is_senior` key -> `MISSING`).
11. `check --strict` exit 0; matrix snapshot `snapshots/hospital_matrix.md`.

#### 3.8.4 Shared test fixtures (`tests/examples/conftest.py`)
```python
DB_BACKENDS = ["sqlite", pytest.param("postgres", marks=pytest.mark.postgres)]

@pytest.fixture(params=DB_BACKENDS)
def db_url(request: pytest.FixtureRequest) -> str: ...    # postgres URL from FASTAUTHZ_TEST_PG_URL

@pytest.fixture
async def blog_client(db_url: str) -> AsyncIterator[httpx.AsyncClient]: ...   # create_app + seed + ASGITransport
```
- PostgreSQL tests use a fresh schema per test session and drop it after (no shared state).
- `tests/examples/snapshot.py`:
  ```python
  def assert_snapshot(actual: str, name: str) -> None:
      """Compare with tests/examples/snapshots/<name>. With FASTAUTHZ_UPDATE_SNAPSHOTS=1, write it instead."""
  ```
  No new dependency (no `syrupy`). Snapshot updates show up in the PR diff for review.

### 3.9 Docs site

#### 3.9.1 `mkdocs.yml`
```yaml
site_name: fastauthz
site_url: https://<owner>.github.io/fastauthz/
repo_url: https://github.com/<owner>/fastauthz
strict: true                          # broken links and missing pages fail the build
theme:
  name: material
  features: [navigation.sections, navigation.top, content.code.copy, search.suggest]
  palette:
    - scheme: default
      toggle: {icon: material/brightness-7, name: Dark mode}
    - scheme: slate
      toggle: {icon: material/brightness-4, name: Light mode}
markdown_extensions:
  - admonition
  - pymdownx.details
  - pymdownx.superfences
  - pymdownx.tabbed: {alternate_style: true}
  - pymdownx.snippets: {base_path: ["."], check_paths: true}
  - toc: {permalink: true}
plugins:
  - search
  - mkdocstrings:
      handlers:
        python:
          paths: [src]
          options: {docstring_style: google, show_source: false, members_order: source}
nav:
  - Home: index.md
  - Get started: get-started.md
  - Concepts: concepts.md
  - Guides:
      - Rules reference: rules.md
      - Roles: roles.md
      - Relationships: relationships.md
      - FastAPI: fastapi.md
      - Testing your policy: testing.md
      - Command line: cli.md
  - Security model: security.md
  - Recipes:
      - Owner only: recipes/owner-only.md
      - Many companies (SaaS): recipes/multi-tenant.md
      - Roles per company: recipes/per-org-roles.md
      - Soft delete: recipes/soft-delete.md
      - Public and private: recipes/public-and-private.md
  - FAQ: faq.md
  - Comparison: comparison.md
  - API reference: reference.md
  - Changelog: changelog.md
```
- Only standard, widely supported Markdown extensions are used, so a later switch of the site
  generator is cheap (section 10, R1).
- `changelog.md` contains only `--8<-- "CHANGELOG.md"` (snippet include; one source of truth).

#### 3.9.2 Pages (one-line outline each)
| Page | Outline |
|---|---|
| `index.md` | The problem (hand-written checks), the idea (one rule, two engines), a 10-line example, install line, links. |
| `get-started.md` | 5-minute tutorial: install, models, policy, `FastAuthz`, one list route with `query`, one detail route with `load`, try it with `httpx`. |
| `concepts.md` | Actor, resource, action, rule, condition, scope, role, decision; default deny, deny wins, unsure = no; `who=`. |
| `rules.md` | Every operator with Python meaning **and** the SQL it compiles to (pycon blocks); `&`/`\|`/`~` precedence; `None` vs `.is_(None)`; truth tables in plain words. |
| `roles.md` | `policy.roles()`, includes, cycles, typos at start, custom `actor_roles`. |
| `relationships.md` | dotted "belongs to" paths, `.any()`, `.has()`, depth limit, what loads and what does not (lazy-load guard). |
| `fastapi.md` | `FastAuthz`, `install`, `query`, `filter`, `load` (404 vs 403, `param`, `id_column`), `require`, `guard`, sync vs async, problem details, OpenAPI, decision log. |
| `testing.md` | `assert_allowed`/`assert_denied`, `check_cases` (+ parametrize), `assert_filter_consistent` (+ async), `override_actor`, `fastauthz check --strict` in CI. |
| `cli.md` | `check`, `matrix`, `explain`, `version`; output formats; exit codes; "the CLI imports your module". |
| `security.md` | Threat model in user words (main TDD 17.1); what fastauthz protects; what it cannot (a raw `select()` you write by hand); reporting. |
| `recipes/owner-only.md` | `R.owner_id == A.id`, 404 for others. |
| `recipes/multi-tenant.md` | `Policy(scope=...)`, `scope=None`, `bypass_scope`, FA008, FA016. |
| `recipes/per-org-roles.md` | memberships table + `R.org.members.any(user_id=A.id, role="editor")`. |
| `recipes/soft-delete.md` | `policy.deny("*", Model, when=R.deleted_at.is_not(None))`. |
| `recipes/public-and-private.md` | `who=ANYONE` + `bypass_scope=True` for published rows. |
| `faq.md` | "Why 404?", "Why is my rule denied for anonymous users?", "Why `&` not `and`?", "Does it work with SQLModel?", "Async?", "MySQL?" |
| `comparison.md` | Section 3.9.3. |
| `reference.md` | `::: fastauthz.Policy`, `R`, `A`, errors, `fastauthz.fastapi`, `fastauthz.testing` (mkdocstrings). |
| `changelog.md` | snippet of `CHANGELOG.md`. |

#### 3.9.3 Comparison page outline
1. When you **do not** need fastauthz (one role check in two routes).
2. Table: hand-written checks, fastauthz, casbin, Cerbos, OpenFGA/Permify, oso OSS (archived),
   with rows: runs in-process, rule language, filters SQLAlchemy lists, FastAPI integration,
   multi-language services, maintained, cost.
3. "Choose Cerbos when...": many services in different languages, one central policy server.
4. "Choose OpenFGA / Permify when...": large relationship graphs, Zanzibar style, unlimited depth.
5. "Choose casbin when...": you want policy files shared across languages and no SQL filtering.
6. "Moving from oso": mapping of common Polar patterns to `R`/`A` rules.
7. Every claim has a link and the date it was checked. No marketing words.

#### 3.9.4 Testing the docs (`tests/docs/test_docs_examples.py`)
Own small extractor (stdlib only; no new dependency; see section 10, Q3):
```python
FENCE = re.compile(r"^`{3}(?P<lang>python|pycon)[^\n]*\n(?P<body>.*?)^`{3}[ \t]*$", re.M | re.S)
SKIP_MARK = "<!-- docs-test: skip"            # full form: <!-- docs-test: skip reason="..." -->

@dataclass(frozen=True)
class Block:
    path: Path
    line: int                                 # 1-based line of the first code line
    lang: Literal["python", "pycon"]
    body: str
    skip_reason: str | None

def collect_blocks(path: Path) -> list[Block]: ...

@pytest.mark.parametrize("page", sorted(DOCS.rglob("*.md")), ids=lambda p: str(p.relative_to(DOCS)))
def test_docs_page(page: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    namespace: dict[str, object] = {"__name__": f"docs_{page.stem}"}
    for block in collect_blocks(page):
        if block.skip_reason is not None:
            continue
        if block.lang == "python":
            exec(compile(block.body, f"{page}:{block.line}", "exec"), namespace)
        else:
            _run_doctest(block, namespace)    # doctest.DocTestParser + DocTestRunner(ELLIPSIS | NORMALIZE_WHITESPACE)
```
- Blocks of one page run in order and share one namespace (like a notebook). Each page starts
  clean.
- `pycon` blocks are doctests: `rules.md` uses them to show the SQL each operator compiles to
  (with plain SQLAlchemy: `print(select(Post).where(policy.filter(...)).compile())`), so the shown
  SQL cannot drift from the real compiler.
- A skip mark must give a reason; `test_skip_marks_have_reasons` checks it. The number of
  skipped blocks is printed in the test summary.
- Unit tests of the extractor: skip mark honored; failing `pycon` output fails; tracebacks point at
  `page.md:<line>`.
- README code blocks are not run; `README.md`'s example must be a copy of the `index.md` example
  (`test_readme_example_matches_index`).

---

## 4. Config constants (`config.py`)

```python
# --- testing.py (M4) ---
CONSISTENCY_MAX_ROWS: Final[int] = 10_000
"""assert_filter_consistent() refuses bigger tables (main TDD 13.2). Keeps tests fast and memory small."""

CONSISTENCY_MAX_REPORTED: Final[int] = 20
"""Differences shown with a full explanation in one report. The rest are only counted."""

# --- cli.py (M4) ---
CLI_EXIT_OK: Final[int] = 0
CLI_EXIT_ERRORS: Final[int] = 1          # policy errors, or warnings with --strict
CLI_EXIT_USAGE: Final[int] = 2           # bad usage, import failed, internal error

CLI_JSON_VERSION: Final[int] = 1         # "version" field of check/matrix JSON output

CLI_CHECK_FORMATS: Final[tuple[str, ...]] = ("text", "json")
CLI_DEFAULT_CHECK_FORMAT: Final[str] = "text"
CLI_MATRIX_FORMATS: Final[tuple[str, ...]] = ("markdown", "json", "csv")
CLI_DEFAULT_MATRIX_FORMAT: Final[str] = "markdown"
```
- `CONSISTENCY_MAX_ROWS` is named in main TDD 13.2. If M1 already added it, M4 keeps it.
- Benchmark targets are **not** library settings; they live in `benchmarks/targets.py`
  (section 8.3, section 10 Q2).

---

## 5. Truth-rule impact

- None. M4 does not change `truth.py`, `evaluate.py` or `sql.py`, and does not change the meaning
  of any node. So the Hypothesis property tests (main TDD 14.3) are not touched.
- `assert_filter_consistent` treats `FALSE` and `UNKNOWN` the same ("not allowed"), exactly as
  main TDD 6.4 does. It compares sets of allowed ids only.
- `describe()` and `matrix` render the **unfolded** tree, so no rule part is hidden by
  simplification. Folding is actor-dependent and belongs to `filter()`.
- The lazy-load guard (main TDD 7) is relied on, not changed: a relationship the helper did not
  load makes the Python side deny and the report shows the hint.

---

## 6. Test plan

### 6.1 `tests/unit/test_testing.py` (no database)
1. `assert_allowed(blog_policy, alice, "edit", alice_post)` -> returns `None`.
2. `assert_allowed(blog_policy, bob, "edit", alice_post)` -> `AssertionError`; message starts with
   `Expected ALLOWED, got DENIED.`, contains `authors-edit-own-posts`, a `file:line`, and
   `R.author_id (1) == A.id (2)`.
3. `assert_denied(blog_policy, bob, "edit", alice_post)` -> `None`.
4. `assert_denied(blog_policy, alice, "edit", alice_post)` -> `AssertionError` starting `Expected DENIED, got ALLOWED.`
5. Anonymous actor -> message contains `actor:    anonymous (None)`.
6. Policy with an FA001 error -> `PolicyError` (not `AssertionError`).
7. Unknown action -> `UnknownActionError` propagates.
8. `can()` and `explain()` disagree (monkeypatched `explain`) -> `AssertionError` containing `internal error`.
9. `check_cases` with 5 passing cases -> `None`.
10. `check_cases` with failures in cases 2 and 4 of 5 -> one `AssertionError`; header
    `2 of 5 policy cases failed:`; `[case 2]` and `[case 4]` present; `[case 1]` absent.
11. Case 3 has an unknown action -> reported as `error: UnknownActionError...`; cases 4 and 5 still run
    (a spy on `policy.explain` sees 5 calls).
12. `check_cases(policy, [])` -> `ValueError`; a tuple item -> `TypeError`.
13. Case label appears right after `[case N]`.
14. `check_cases` on a policy with errors -> `PolicyError` raised once, before any case.
15. `pytest` shows no helper frames (`__tracebackhide__`): run a failing test with `pytester` and
    check the traceback has no `testing.py` lines.

### 6.2 `tests/unit/test_describe.py`
16. One parametrized case per row of the table in 3.3 (exact string).
17. Determinism: a `frozenset` literal renders the same under different `PYTHONHASHSEED`
    (subprocess with seeds 0 and 1).
18. Nested `And`/`Or`/`Not` parenthesize as in the table; `Related` inside `Related`.

### 6.3 `tests/integration/test_filter_consistent.py` (SQLite; PostgreSQL with `-m postgres`)
19. Consistent policy, 50 rows, actors `[alice, bob, admin, None]`, all actions -> passes.
20. `check=` owner-only + wrong `sql=` returning `sa.true()` -> `AssertionError`; names the action,
    a row id, `Python says DENIED, SQL says ALLOWED`.
21. Rule `R.project.org_id == A.org_id`, rows loaded earlier without `project` -> passes, and no
    lazy-load warning is logged (auto eager load works, incl. `populate_existing`).
22. Custom check reading `doc.shares` -> mismatch report contains the hint `Doc.shares`; with
    `options=[selectinload(Doc.shares)]` -> passes.
23. `max_rows=10` with 11 rows -> `FastAuthzError` mentioning `11` and `10`; only one statement
    (the COUNT) was executed (cursor event counter).
24. Empty table -> `AssertionError` containing `no Post rows`.
25. 30 mismatches -> 20 full entries and `(10 more differences not shown)`.
26. `AsyncSession` passed directly -> `TypeError` mentioning `run_sync`; the documented
    `run_sync` form passes (async test).
27. `actions=None` -> every declared action is compared (spy on `policy.filter`).
28. Action with a non-filterable rule -> `NotFilterableError`.
29. Read-only: all executed statements start with `SELECT`; `session.new`, `session.dirty`,
    `session.deleted` are empty after the call.
30. Undeclared model -> `UnknownResourceError`; undeclared action -> `UnknownActionError`;
    `actors=[]` -> `ValueError`.
31. `_relationship_chains` unit: `R.project.org_id` -> `{("project",)}`;
    `R.org.members.any(user_id=A.id)` -> `{("org", "members")}`; nested `Related` -> full chain;
    prefixes removed.

### 6.4 `tests/integration/test_override_actor.py`
32. Inside the block, `GET /me` returns alice; after the block, the real dependency runs again.
33. `actor=None` -> anonymous behavior (public route works, guarded route 404/403).
34. An existing override set by the test is restored after the block.
35. Nested blocks (alice then bob) restore in order.
36. Exception inside the block -> override still restored.

### 6.5 `tests/unit/test_cli.py` (in process, `capsys`, `monkeypatch.chdir(tmp_path)`)
Policies are written as small modules into `tmp_path`; `sys.modules` entries are removed after each
test (fixture).
37. `main(["version"])` -> `0`; first line `fastauthz <__version__>`; 4 lines.
38. `main([])` -> `2`; stderr has `usage:`. `main(["--help"])` -> `0`.
39. `check` on a clean policy -> `0`; stdout ends `Result: 0 errors, 0 warnings, 0 notices. OK.\n`.
40. `check` with FA001 -> `1`; line contains `FA001  error` and `authz.py:<line of the rule>`.
41. Only warnings -> `0`; with `--strict` -> `1` and the result line ends `(strict)`.
42. Only notices + `--strict` -> `0`.
43. `--format json` -> `json.loads` works; keys in the order of 3.7.5; `ok` equals `exit == 0`.
44. Target without `:` -> `2`, stderr mentions `module:attribute`; stdout empty (also with json).
45. Missing module -> `2`, `could not import`. Module raising `RuntimeError` at import -> `2`.
46. Attribute missing -> `2`; attribute not a `Policy` -> `2`, message names the type.
47. Module whose import raises `PolicyError` (a `FastAuthz(...)` at import) -> `check` prints the
    problems and returns `1`; `matrix` returns `1` with the hint to run `check`.
48. Module in the cwd is found although cwd was not on `sys.path`.
49. Bypass rules listed in text and JSON; `none` when there are none.
50. Problem order: errors, then warnings, then notices; inside a level by file, line, code.
    Two runs give byte-identical output.
51. `matrix` (markdown) for the blog policy == `snapshots/blog_matrix.md`.
52. `matrix --format json`: `"*"` rule appears under every action with `"wildcard": true`; resources
    and actions sorted.
53. `matrix --format csv`: exact header; line count = sum of rules per action + one `none` line per
    rule-less action.
54. `matrix --output out.md` -> file content equals stdout of the same command; stdout empty; `0`.
    `--output` into a missing folder -> `2`.
55. Action with no allow rule -> `**nobody**`; non-filterable action -> `(not filterable)`.
56. A literal `'a|b'` is escaped as `'a\|b'` in markdown.
57. Two models named `Post` in different modules -> qualified names in matrix; `explain --resource Post`
    -> `2` with `ambiguous`; `--resource shop.models.Post` works.
58. `explain` blog `Post delete` -> exact text of 3.7.8.
59. `explain` unknown resource -> `2`, lists known names; unknown action -> `2`, lists declared actions.
60. Internal error (monkeypatched handler raising `RuntimeError`) -> `2`, stderr has `internal error` and a traceback.

### 6.6 `tests/unit/test_cli_subprocess.py`
61. `python -m fastauthz version` -> exit `0`.
62. With `sqlalchemy` and `fastapi` blocked (a `sys.meta_path` finder in a `sitecustomize` placed
    on `PYTHONPATH`), `fastauthz check` and `matrix` work on a plain-class policy, and
    `import fastauthz.testing` works.
63. The installed console script `fastauthz check --strict examples.blog.authz:policy` -> `0`
    (run from the repo root).

### 6.7 Example tests
64. All numbered tests in 3.8.1, 3.8.2 and 3.8.3, on SQLite; again on PostgreSQL with `-m postgres`.

### 6.8 Docs tests
65. Every page in `docs/` passes `test_docs_page`.
66. Extractor unit tests (3.9.4).
67. `mkdocs build --strict` passes (CI job, not pytest).

### 6.9 Coverage
- `testing.py`, `cli.py`, `decision.describe`: 100% branch coverage (target; `describe` is in a
  core module, so 100% is a gate there).
- Whole package stays >= 95% (main TDD 14.5 gate).
- Examples and docs are not part of the package coverage number (they are tested by behavior).

---

## 7. Tooling and CI

### 7.1 `pyproject.toml`
```toml
[dependency-groups]
dev = [
    # ... from M0 ...
    "pytest-benchmark",          # lower bound = latest release at M4 start
]
docs = [
    "mkdocs-material",           # lower bound = latest release at M4 start (see section 10, R1)
    "mkdocstrings[python]",
]

[tool.pytest.ini_options]
testpaths = ["tests"]            # benchmarks/ are run on purpose only
pythonpath = ["."]               # makes `examples` importable in tests
markers = ["postgres: needs a local PostgreSQL"]
```
- `TECH_STACK.md` already lists pytest-benchmark, MkDocs Material and mkdocstrings, so no ADR is
  needed. No new runtime dependency.

### 7.2 `ci.yml` (every PR)
| Job | Command |
|---|---|
| tests (existing matrix) | `uv run pytest` - now includes `tests/examples` and `tests/docs` on SQLite |
| tests-postgres (existing) | `uv run pytest -m postgres` - now includes the examples on PostgreSQL |
| example-policies | `uv run fastauthz check --strict examples.blog.authz:policy` (and the other two) |
| docs-build | `uv sync --group docs` then `uv run mkdocs build --strict` |
| bench-smoke | `uv run pytest benchmarks --benchmark-disable` (each benchmark runs once as a test; catches broken benchmarks, not slowness) |

### 7.3 `docs.yml` (deploy)
```yaml
on:
  push: {branches: [main]}
  workflow_dispatch: {}
permissions: {contents: read, pages: write, id-token: write}
concurrency: {group: pages, cancel-in-progress: true}
jobs:
  build:
    steps: [checkout, setup-uv, "uv sync --group docs", "uv run mkdocs build --strict",
            actions/upload-pages-artifact (path: site)]
  deploy:
    needs: build
    environment: {name: github-pages}
    steps: [actions/deploy-pages]
```
- Actions are pinned by commit SHA (M5 makes this a rule for all workflows; new workflows start pinned).
- The repository owner must set **Settings -> Pages -> Source: GitHub Actions** once (section 10, R2).

### 7.4 `nightly.yml` (benchmark job added)
```bash
uv run pytest benchmarks --benchmark-only \
  --benchmark-storage=file://.benchmarks \
  --benchmark-autosave \
  --benchmark-compare \
  --benchmark-compare-fail=median:20% \
  --benchmark-min-rounds=50 \
  --benchmark-json=bench.json
uv run python benchmarks/check_targets.py bench.json      # report; non-blocking (continue-on-error)
```
- `.benchmarks/` is restored with `actions/cache` (key `bench-<os>-<python>-<run_id>`, restore key
  prefix `bench-<os>-<python>-`), so the compare uses the newest saved run, and the new run is saved
  again. First run (no baseline): compare only warns.
- A failure opens an issue (main TDD 15.2 nightly rule).
- Fixed runner: one Python version (3.14) and `ubuntu-latest` only, to keep numbers comparable.

---

## 8. Performance

### 8.1 Suites (`benchmarks/`)
| File | Benchmark | Main target |
|---|---|---|
| `test_bench_can.py` | `test_can_first_rule_allows` - first allow rule is TRUE | `can()` < 20 µs |
| | `test_can_last_rule_allows` - only the 50th rule matches | `can()` < 20 µs |
| | `test_can_denied` - no rule matches (all rules evaluated) | `can()` < 20 µs |
| | `test_can_anonymous` - actor `None` | `can()` < 20 µs |
| `test_bench_filter.py` | `test_compile_filter_member` - normal user | `compile_filter()` < 100 µs |
| | `test_compile_filter_admin` - folds to `TRUE` | `compile_filter()` < 100 µs |
| | `test_compile_filter_anonymous` - folds to `FALSE` | `compile_filter()` < 100 µs |
| `test_bench_freeze.py` | `test_freeze_500_rules` - `benchmark.pedantic(..., setup=new_policy, rounds=20)` | `freeze()` < 50 ms |
| `test_bench_explain.py` | `test_explain_50_rules` - informational only (no target) | - |

Query counts (N6) are behavior, not timing. They are asserted in
`tests/integration/test_query_counts.py` (added in M3; if it is missing, M4 adds it): `load()`
success = 1 statement; `load()` deny with `deny_status=403` = 2; `query()` dependency = 0
statements before the route runs it.

### 8.2 Fixtures (`benchmarks/policies.py`, `benchmarks/conftest.py`)
```python
def make_policy_50(model: type) -> Policy:
    """Deterministic policy with exactly 50 rules on one resource, 5 actions x 10 rules
    (8 allow, 2 deny each). Rule shapes cycle through: owner compare, In with a 5-item tuple,
    Is None, numeric >=, And of two compares, Or of two compares, Not(compare), role rule,
    actor-only rule (A.is_staff.is_(True)), and one dotted path (only in the SQL suite)."""

def make_policy_500() -> Policy:
    """10 resources x 50 rules, not frozen (built fresh for each freeze round)."""
```
- `can()` suites use a plain `@dataclass(slots=True)` resource (no SQLAlchemy, no relationships),
  matching "in memory, no relationships" in main TDD 16.1.
- `compile_filter()` suites use a SQLAlchemy model `BenchItem` with the same columns; they measure
  `policy.filter(actor, "read", BenchItem)` (fold + to SQL), not query execution.
- Actors: `member` (id, org_id, roles `["viewer"]`), `admin` (roles `["admin"]`), `None`.

### 8.3 Reading the numbers
- Target metric: **median** (pytest-benchmark `stats.median`), our "p50".
- `benchmarks/targets.py`:
  ```python
  TARGETS_SECONDS: Final[dict[str, float]] = {
      "test_can_first_rule_allows": 20e-6,
      "test_can_last_rule_allows": 20e-6,
      "test_can_denied": 20e-6,
      "test_can_anonymous": 20e-6,
      "test_compile_filter_member": 100e-6,
      "test_compile_filter_admin": 100e-6,
      "test_compile_filter_anonymous": 100e-6,
      "test_freeze_500_rules": 50e-3,
  }
  ```
- `benchmarks/check_targets.py bench.json` prints a table (name, median, target, OK/OVER) and exits
  `1` if any is over. In CI it is informational (runner CPUs differ from "laptop-class"). The binding
  check is a local run on a laptop, recorded in `core_docs/reports/M4_benchmarks.md` with CPU,
  OS, Python build and date. M4 is done only when that report shows all targets met.
- Regression check = relative (20% median vs the last nightly run), so runner speed cancels out.

---

## 9. Security notes

- **The CLI imports user code.** `_load_policy` runs `import app.authz`, which runs whatever is in
  that module, and puts the cwd first on `sys.path` (like uvicorn). A file in the cwd can shadow a
  module. Docs: run the CLI only in your own project; keep the policy module free of side effects.
- **Developer output shows details.** `explain`, `matrix`, `check` messages and test-helper
  failures show rule names, rule literals and (for `explain`/helpers) row and actor values. They
  are meant for terminals, CI logs and tests. Docs warn not to paste helper output from production
  data into public issues. HTTP errors are unchanged (fixed template, main TDD 12.5).
- **Labels avoid personal data.** Test-helper headers print type name + id, never `repr(obj)`.
- **Read-only helper.** `assert_filter_consistent` sends only `SELECT` statements (test 29).
- **Matrix completeness.** Every rule of the policy appears in the matrix at least once (test:
  set of rule names in JSON == set of `policy.rules` names). `bypass_scope` and `who=ANYONE` are
  always visible. This is what a reviewer relies on (user story 7.4).
- **Examples' fake login.** `X-User-Id` header auth is marked `DEMO ONLY` in code, README and docs.
  The docs never show it outside the examples.
- **Docs tests run code.** They run our own docs only, in `tmp_path`, never fetch anything (no
  network, CLAUDE.md rule 9).
- New threat-model rows (main TDD 17.1) are not needed for M4; the CLI import risk is a
  documentation item. If M5 review disagrees, it adds a row there.

---

## 10. Risks and open questions

### 10.1 Risks
| ID | Risk | Plan |
|---|---|---|
| R1 | MkDocs Material is in maintenance mode; its team builds a successor (Zensical). | At M4 start check: (a) latest Material release and whether it installs and builds with `--strict` on our Python versions; (b) whether MkDocs itself still gets releases; (c) Zensical: is there a stable release, does it read `mkdocs.yml`, does it support mkdocstrings-style API pages. **Recommendation:** use Material if (a) passes; keep only standard extensions (3.9.1) so moving later is cheap. Use Zensical only if it is stable **and** supports API docs. If we switch, write `decisions/ADR-002-docs-generator.md` and update `TECH_STACK.md`. |
| R2 | GitHub Pages must be enabled by the repo owner; a collaborator account may not have that right. | Owner action item in `TASKS.md` (M4-T27). Until then the docs job only builds. |
| R3 | Benchmark noise on shared runners makes the 20% check flap. | Median, `--benchmark-min-rounds=50`, one fixed runner/Python, compare to the last run only. If it still flaps, rerun once before opening the issue. |
| R4 | Docs drift from code. | Every block runs (3.9.4); SQL shown via doctest; API pages from docstrings; `mkdocs build --strict`. |
| R5 | User module has side effects at import (DB connect, `FastAuthz(...)` that raises). | `PolicyError` handled (exit 1 with problems); other errors exit 2 with the cause; docs recommend a side-effect-free `authz.py`, as in the examples. |
| R6 | `populate_existing` discards unflushed changes in the user's session. | Default autoflush flushes first; docs tell `autoflush=False` users to `flush()` first. |
| R7 | Upstream names (2.3) differ from this design. | M4-T1 checks them first and updates this file. |
| R8 | Reviewers misread plain-words output. | The text is the real expression, plus a legend line; `explain` shows the full condition. |

### 10.2 Open questions (with recommended answers)
| ID | Question | Recommendation |
|---|---|---|
| Q1 | Should `fastauthz check` also check routes (needs the app)? | No for v1. Route checks already run at app start (`install()`, M3). Keeps the CLI small. |
| Q2 | CLAUDE.md rule 8 says constants only in `config.py`. Do benchmark targets go there? | No. `config.py` holds library settings shipped to users. Targets are test data -> `benchmarks/targets.py`. State this in CLAUDE.md wording if a reviewer asks. |
| Q3 | Doc tests: own extractor or a plugin (`pytest-markdown-docs`, `phmdoctest`)? | Own extractor (about 80 lines, stdlib). No new dev dependency, full control of skip marks and shared namespaces. |
| Q4 | Async version of `assert_filter_consistent`? | Not as new API. Document `session.run_sync(...)` (3.5.5). |
| Q5 | Should bypass-scope listing get an FA code? | Not in M4 (no new code without TDD 8.5 + FSD F5 + QUICK_REFERENCE change). It is a separate output section. M5 may promote it to a notice code if reviewers want it in `validate()`. |
| Q6 | Should `matrix` expand roles ("role editor" also means admin)? | No expansion in cells (keeps one rule = one line); the roles section under the table shows includes. |

---

## 11. Exit criteria

- All tests in section 6 pass on SQLite; the marked ones pass on PostgreSQL.
- `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run pyright` pass.
- Coverage: core gate 100% (incl. `describe`), package >= 95%.
- `fastauthz check --strict` exits `0` on all three example policies.
- Matrix and OpenAPI snapshots committed and reviewed.
- `mkdocs build --strict` passes; the site is live on GitHub Pages.
- `core_docs/reports/M4_benchmarks.md` shows every target met on a laptop; nightly compare job is green.
- A person new to the project protects a list route and a detail route in 5 minutes using only the
  docs (one real try, noted in the report with the time it took).
- `CHANGELOG.md` updated; `0.2.0` released from CI with Trusted Publishing.
- Main TDD, main FSD, TASKS and this file match the code (CLAUDE.md rule 13).

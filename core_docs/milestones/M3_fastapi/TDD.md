# M3 - FastAPI: Technical Design (TDD)

> HOW M3 is built. Detailed on purpose. Code must match this file.
> Main design: `../../TDD-tech-design-doc.md`, sections 10.1, 11, 12 (all), 14.4, 14.5, 15, 17.
> What M3 does: `FSD.md` here. Steps: `TASKS.md` here.
> IDs: `M3-D<n>` = a design point in this file. Main TDD numbers are written as "TDD 12.3".
> If code needs a different design, change this file **and** the main TDD in the same PR (CLAUDE.md rule 13).

---

## 1. Scope

### 1.1 In scope
| Item | Main TDD | This file |
|---|---|---|
| `FastAuthz` object | 12.1 | 3.2 |
| Rest of `_compat.py` and its contract tests | 12.7 | 3.1 |
| Dependency factories `query`, `filter`, `load`, `require`, `guard` | 12.2-12.4 | 3.3-3.8 |
| Sync vs async variants | 12.8 | 3.3.4 |
| `Guard` | 12.2 | 3.8 |
| `install(app)`, `Denied` handler, route checks | 12.5, 12.3 step 1 | 3.9, 3.10 |
| OpenAPI additions | 12.6 | 3.11 |
| Decision records, `on_decision`, logger | 10.1 | 3.12 |
| HTTP integration tests (SQLite + PostgreSQL), SQLModel test | 14.4 | 6 |
| CI version matrix, release of `0.1.0` | 15.2, 17.2 | 7 |

### 1.2 What M3 assumes from M1 and M2
M3 builds on these. If one is missing when M3 starts, add it first (small, with tests) and note it in the PR.

| From | Thing | Used for |
|---|---|---|
| M1 | `Policy.freeze()`, `_condition(action, model)`, `can()`, `check()`, `actor_id` hook, `Rule`, `ResourceSpec` | everything |
| M1 | `evaluate(expr, actor, resource)`; `resource=None` gives `MISSING` for every `R` path (not `NO_ROW`) | `require()` |
| M1 | per-rule evaluation used by `explain()` | `matched_rules` / `denied_by` |
| M1 | `Decision` dataclass (TDD 10.1), `Denied`, all error classes | decisions, errors |
| M1 | `_compat.is_loaded` | lazy-load guard (already done) |
| M2 | `sql.fold(tree, actor) -> Expr`, `sql.to_sql(expr, model) -> ColumnElement[bool]` | `query`, `filter`, `load` |
| M2 | resolved scope per resource (`Policy._scope_expr(model) -> Expr | None`) | 403 mode exists query |
| M2 | `_condition(action, model, *, with_scope: bool = True)` (cache key includes `with_scope`) | `require()` |
| M2 | `_compat.relationship_target`, `_compat.relationship_direction` (needed by `sql.py` 9.4 and FA004) | contract tests here |

### 1.3 Out of scope (do not build)
- `fastauthz.testing` (`override_actor`, ...) -> M4.
- CLI -> M4. Benchmarks in CI -> M4. Mutation testing, Scorecard -> M5.
- Later items (TDD 20): field permissions, decision caching per request, other frameworks, GraphQL.
- WebSocket routes: not supported in v1 (see 3.10.3).

---

## 2. Files and folders

### 2.1 Source
| Path | New / changed | Purpose |
|---|---|---|
| `src/fastauthz/fastapi.py` | new | `FastAuthz`, `Guard`, `PermissionInfo`, dependency factories, `Denied` handler, `install()`. |
| `src/fastauthz/openapi.py` | new | `wrap_openapi(app, authz)` and the schema-mutation helpers (TDD 12.6). |
| `src/fastauthz/_compat.py` | changed | adds `iter_routes`, `route_dependencies`, `route_path_params`, `is_async_session`, `column_python_type`, `validation_error_schemas`; keeps `is_loaded`; keeps or adds `relationship_target`, `relationship_direction`. |
| `src/fastauthz/config.py` | changed | M3 constants (section 4). |
| `src/fastauthz/errors.py` | changed | `Denied` gets `status_code: int` (3.13). |
| `src/fastauthz/decision.py` | changed | `emit_decision()` helper and log format (3.12). |
| `src/fastauthz/policy.py` | changed (small) | internal helpers `_rule_results(...)`, `_require_truth(...)`, `_rules_for(...)` if not present (3.14). |
| `src/fastauthz/__init__.py` | unchanged | `fastauthz.fastapi` is **not** re-exported from the root (it needs the extra). |

Rules for these files:
- `fastapi.py` and `openapi.py` may import public FastAPI, Starlette, Pydantic and SQLAlchemy API (`fastapi.Depends`, `fastapi.Request`, `fastapi.exceptions.RequestValidationError`, `starlette.responses.JSONResponse`, `pydantic.TypeAdapter`, `sqlalchemy.select`, `sqlalchemy.exists`).
- Anything that reads attributes that are not documented API (`route.dependant`, route trees, `param_convertors`, `inspect(model).mapper`, `fastapi.openapi.utils.*`) goes through `_compat.py` only (CLAUDE.md rule 5).
- `fastapi.py` must **not** use `from __future__ import annotations` (3.3.3).
- Importing `fastauthz.fastapi` without FastAPI installed raises
  `ImportError("fastauthz.fastapi needs the 'fastapi' extra: pip install \"fastauthz[fastapi]\"")`.

### 2.2 Tests
| Path | Purpose |
|---|---|
| `tests/unit/test_fastapi_setup.py` | `FastAuthz(...)` constructor, factory start-time errors, markers, signatures. |
| `tests/unit/test_fastapi_deps.py` | each dependency in isolation through a tiny app (SQLite). |
| `tests/unit/test_fastapi_errors.py` | `Denied` handler, problem-details body, `install()` rules. |
| `tests/unit/test_openapi.py` | every schema addition, caching, idempotency. |
| `tests/unit/test_decisions_fastapi.py` | decision emission, callback crash, logger levels. |
| `tests/compat/test_compat_routes.py` | `iter_routes`, `route_dependencies`, `route_path_params`. |
| `tests/compat/test_compat_sqlalchemy.py` | `is_async_session`, `column_python_type`, `relationship_*`, `is_loaded`. |
| `tests/integration/conftest.py` | engines (SQLite sync/async, PostgreSQL sync/async), app factory, query counter. |
| `tests/integration/test_http_blog.py` | full HTTP tests, matrix sync/async x SQLite/PostgreSQL. |
| `tests/integration/test_http_tenant.py` | tenant scope, 403 mode, other-tenant 404. |
| `tests/integration/test_sqlmodel.py` | one SQLModel app (list + load). |
| `tests/integration/test_openapi_snapshot.py` | snapshot of fastauthz parts of the schema. |
| `tests/integration/snapshots/openapi_blog.json` | the snapshot file. |
| `tests/typing/test_fastapi_types.py` | `assert_type` checks for the public API (pyright). |

### 2.3 CI and release
| Path | Purpose |
|---|---|
| `.github/workflows/ci.yml` | changed: full matrix (7.1), PostgreSQL 18 service. |
| `.github/workflows/release.yml` | new: build + publish on tag `v*` with Trusted Publishing (7.3). |
| `pyproject.toml` | changed: dev group adds `sqlmodel`, `aiosqlite`, `asyncpg`, `psycopg[binary]`; pytest marker `postgres`; classifiers. |
| `CHANGELOG.md`, `README.md` | changed at release: `0.1.0` section; status badge "alpha". |

---

## 3. Design

### 3.1 `_compat.py` (TDD 12.7)

All functions are small, pure and typed. Each has contract tests (6.4) that run on every FastAPI / SQLAlchemy version in the matrix.

```python
from collections.abc import Iterator, Callable
from typing import Any

def iter_routes(app: FastAPI) -> Iterator[APIRoute]: ...
def iter_websocket_routes(app: FastAPI) -> Iterator[APIWebSocketRoute]: ...
def route_dependencies(route: APIRoute | APIWebSocketRoute) -> Iterator[Callable[..., Any]]: ...
def route_path_params(route: APIRoute) -> frozenset[str]: ...
def is_async_session(session: object) -> bool: ...
def is_sync_session(session: object) -> bool: ...
def is_loaded(obj: object, attr: str) -> bool: ...                       # from M1
def relationship_target(model: type, name: str) -> type: ...               # from M2 (if not, here)
def relationship_direction(model: type, name: str) -> Literal["many_to_one", "one_to_many", "many_to_many"]: ...
def column_python_type(model: type, name: str) -> type: ...
def validation_error_schemas() -> dict[str, dict[str, Any]]: ...
```

#### 3.1.1 `iter_routes(app)`
- Goal: every `APIRoute` the app serves, once, including nested routers and the route tree that FastAPI 0.137 introduced (main TDD 2 principle 8).
- Algorithm:
  ```text
  visited: set[int] = {}
  stack = [app.router]                  # start node
  while stack:
      node = stack.pop()
      for child in _children(node):     # version-specific, see below
          if id(child) in visited: continue
          visited.add(id(child))
          if isinstance(child, APIRoute): yield child
          elif _is_mount_of_other_app(child): continue   # sub-app has its own openapi + install
          elif _has_children(child): stack.append(child)
  ```
- `_children(node)` is the only version-sensitive part. It reads `node.routes` (FastAPI < 0.137) or the tree nodes found in the M0 spike (`core_docs/reports/M0_spikes.md`, try 3). Both branches stay in this one function, chosen by feature detection (`hasattr`), never by version string.
- Order: stable (depth-first, in registration order), so OpenAPI and error lists are deterministic.
- `Mount` of another `FastAPI`/`Starlette` app: skipped. Its routes belong to that app. The docs say: call `install()` on each sub-app.
- `Mount` / `Router` that only groups routes (no separate app): walked.

#### 3.1.2 `route_dependencies(route)`
- Walks `route.dependant` recursively (`dependant.dependencies[*].call`, then their `.dependencies`).
- Yields each `call` once per route (dedupe by `id`), depth-first.
- Covers route-level `dependencies=[...]`, router-level `dependencies=[...]` (FastAPI merges them into the route's dependant), `Annotated[..., Depends(...)]` parameters, and nested sub-dependencies.
- Security dependencies (`Security(...)`) are included (same structure).

#### 3.1.3 `route_path_params(route)`
- Returns the names of the path parameters of the route path, without convertors: `/posts/{post_id:int}` -> `{"post_id"}`.
- Implementation: `frozenset(route.param_convertors)` (Starlette builds this mapping when the route is made). Fallback if the attribute is missing: parse `route.path_format` with the regex `config.PATH_PARAM_PATTERN` (`r"{([^}:]+)(?::[^}]*)?}"`).
- **Note:** this helper is not in main TDD 12.7. It is added because `load()` checks the param name at `install()` (TDD 12.3 step 1). Main TDD 12.7 gets one line in the same PR.

#### 3.1.4 `is_async_session(session)` / `is_sync_session(session)`
```python
def is_async_session(session: object) -> bool:
    return isinstance(session, (AsyncSession, async_scoped_session))

def is_sync_session(session: object) -> bool:
    return isinstance(session, (Session, scoped_session))
```
- Anything else (a raw `Connection`, a mock) -> both `False`. `load()` then fails closed (3.6.6).

#### 3.1.5 `column_python_type(model, name)`
```python
def column_python_type(model: type, name: str) -> type:
    mapper = sa_inspect(model)                     # raises NoInspectionAvailable for non-mapped classes
    column = mapper.columns[name]                  # KeyError -> caller turns it into a start-time error
    return column.type.python_type                 # may raise NotImplementedError
```
- `name` is the mapped **attribute key** (same as the main TDD `id_column`), not the database column name.
- The caller (`load()`) turns `KeyError` and `NotImplementedError` into `FastAuthzError` at factory time (3.6.2).

#### 3.1.6 `validation_error_schemas()`
- Returns FastAPI's own `ValidationError` and `HTTPValidationError` component schemas (from `fastapi.openapi.utils`), so the OpenAPI step can add a `422` response to a `load()` route that declares no other parameters (3.11.4).

### 3.2 `FastAuthz` (TDD 12.1)

```python
from typing import Any, Literal, TypeVar
from collections.abc import Callable, Coroutine

M = TypeVar("M")

class FastAuthz:
    def __init__(
        self,
        policy: Policy,
        *,
        actor: Callable[..., Any],
        session: Callable[..., Any] | None = None,
        deny_status: Literal[403, 404] = config.DEFAULT_DENY_STATUS,      # 404
        on_decision: Callable[[Decision], None] | None = None,
    ) -> None: ...

    @property
    def policy(self) -> Policy: ...
    @property
    def deny_status(self) -> Literal[403, 404]: ...

    def query(self, model: type[M], action: str) -> Callable[..., Coroutine[Any, Any, Select[tuple[M]]]]: ...
    def filter(self, model: type[Any], action: str) -> Callable[..., Coroutine[Any, Any, ColumnElement[bool]]]: ...
    def load(
        self, model: type[M], action: str, *, param: str | None = None, id_column: str | None = None,
    ) -> Callable[..., M] | Callable[..., Coroutine[Any, Any, M]]: ...
    def require(self, action: str, model: type[Any]) -> Callable[..., Coroutine[Any, Any, None]]: ...
    guard: Callable[..., Coroutine[Any, Any, Guard]]                     # attribute, built in __init__
    def install(self, app: FastAPI) -> None: ...
```

Constructor steps, in order:
1. `deny_status not in (403, 404)` -> `ValueError("deny_status must be 403 or 404")`.
2. `actor` not callable -> `TypeError`. `session` given and not callable -> `TypeError`.
3. `on_decision` is a coroutine function (`inspect.iscoroutinefunction`, also on `__call__`) -> `ValueError("on_decision must be a normal function in v1")`. (Open question Q7.)
4. `policy.freeze()`. A `PolicyError` propagates unchanged (all problems listed). The app does not start.
5. Store `self._actor`, `self._session`, `self._session_is_async = _is_async_dependency(session)` (3.3.4), `self._deny_status`, `self._on_decision`.
6. Build `self.guard` (3.8) once.
7. `self._loads: list[_LoadPlan] = []` and `self._requires: list[tuple[str, type]] = []` (used by `install()` checks).

`FastAuthz` holds no per-request state. It is safe to share across threads and tasks (the policy is frozen, TDD 2 principle 9).

### 3.3 Building a dependency function (shared machinery)

#### 3.3.1 Start-time checks shared by all factories
```python
def _check_target(self, model: type, action: str, *, filterable: bool) -> ResourceSpec:
    spec = self._policy._resources.get(model)
    if spec is None:
        raise UnknownResourceError(f"{model.__name__} is not declared with policy.resource()")
    if action == "*" or action not in spec.actions:
        raise UnknownActionError(f"action '{action}' is not declared on {model.__name__}")
    if filterable and self._policy._has_unfilterable_rule(action, model):
        raise NotFilterableError(
            f"{model.__name__}.{action} has a check= rule without sql=; it cannot be used in a query")
    return spec
```
- Runs when the factory is called, which is when the route decorator runs (import time). So a typo stops the app at start (F11.8).
- Messages name the model and action (developer data), never actor or row values.
- `"*"` is a rule wildcard, not a real action. Asking for it is an `UnknownActionError`.

#### 3.3.2 Parameters every dependency declares
| Param name | Annotation | Given by FastAPI | Used by |
|---|---|---|---|
| `fastauthz_actor` | `Annotated[object, Depends(self._actor)]` | the user's actor dependency | all |
| `fastauthz_session` | `Annotated[object, Depends(self._session)]` | the user's session dependency | `load` only |
| `fastauthz_request` | `Request` | the current request | `load` only (path params) |

- FastAPI caches a dependency per request by its callable (`use_cache=True`). Because we wrap the **same** callables the app uses, the actor and the session are created once per request and shared with the route. So the object returned by `load()` belongs to the same session the route uses, and the route can change it and commit.
- The docs must say: pass the **exact same** callable as your `SessionDep` uses. A different wrapper callable gives a second session.
- Tests can override the actor with `app.dependency_overrides[get_current_user] = ...` and it also reaches our dependencies (M4's `override_actor` relies on this).

#### 3.3.3 Signature construction
FastAPI reads a dependency's parameters with `inspect.signature(call)`, which honours `__signature__`. We set it explicitly, so the design does not depend on how annotations are evaluated.

```python
def _with_signature(
    fn: Callable[..., Any],
    params: Sequence[inspect.Parameter],
    *,
    returns: object,
    name: str,
    info: PermissionInfo,
) -> Callable[..., Any]:
    fn.__signature__ = inspect.Signature(list(params), return_annotation=returns)  # type: ignore[attr-defined]
    fn.__name__ = name                    # e.g. "fastauthz_load_Post_edit"
    fn.__qualname__ = name
    setattr(fn, config.MARKER_ATTRIBUTE, info)     # "__fastauthz__"
    return fn

def _param(name: str, annotation: object) -> inspect.Parameter:
    return inspect.Parameter(name, inspect.Parameter.KEYWORD_ONLY, annotation=annotation)
```

- The inner functions are written as `def dep(**kwargs: Any)` / `async def dep(**kwargs: Any)`. FastAPI calls them with keyword arguments matching `__signature__`.
- Annotations are real objects (`Annotated[object, Depends(...)]`), never strings. So `from __future__ import annotations` is forbidden in `fastapi.py` (a test greps for it).
- `inspect.iscoroutinefunction(dep)` stays correct because `dep` is defined with `async def` or `def`.

#### 3.3.4 Sync or async (TDD 12.8)
```python
def _is_async_dependency(dep: Callable[..., Any] | None) -> bool:
    if dep is None:
        return False
    target: Any = dep
    while isinstance(target, functools.partial):
        target = target.func
    target = inspect.unwrap(target)
    if not (inspect.isfunction(target) or inspect.ismethod(target)) and callable(target):
        target = target.__call__                  # callable class instance
    return inspect.iscoroutinefunction(target) or inspect.isasyncgenfunction(target)
```
- Only `load()` does I/O, so only `load()` has two variants:
  - async session dependency -> `async def` dependency, `await session.execute(...)`;
  - sync session dependency -> plain `def` dependency. FastAPI runs it in its threadpool, so the event loop is never blocked.
- `query`, `filter`, `require` and `guard` do no I/O. They are always `async def`, so they run on the event loop with no threadpool hop. This is a clarification of TDD 12.8 (open question Q2).
- The variant is picked once, at factory time. At request time `load()` also checks the real session type (3.6.6), so a wrong guess fails closed with a clear error.

#### 3.3.5 `PermissionInfo` marker
```python
@dataclass(frozen=True, slots=True)
class PermissionInfo:
    kind: Literal["query", "filter", "load", "require", "guard"]
    model: type | None                 # None only for "guard"
    action: str | None                 # None only for "guard"
    param: str | None = None           # "load": explicit param=, else None
    owner: "FastAuthz | None" = field(default=None, compare=False, repr=False)
```
- Set as `dep.__fastauthz__`. `install()` and the OpenAPI step find guarded routes only through this marker (TDD 12.6 step 2).
- Public (exported from `fastauthz.fastapi`) so other tools can read it. Fields are stable after 1.0.

### 3.4 `query(model, action)` (TDD 12.2)

```python
def query(self, model: type[M], action: str) -> Callable[..., Coroutine[Any, Any, Select[tuple[M]]]]:
    self._check_target(model, action, filterable=True)

    async def dep(**kw: Any) -> Select[tuple[M]]:
        condition = self._compile(kw["fastauthz_actor"], action, model)
        return select(model).where(condition)

    return _with_signature(dep, [_param("fastauthz_actor", Annotated[object, Depends(self._actor)])],
                           returns=Select[tuple[model]], name=f"fastauthz_query_{model.__name__}_{action}",
                           info=PermissionInfo("query", model, action, owner=self))
```

`_compile` (shared by `query`, `filter`, `Guard.filter`):
```python
def _compile(self, actor: object | None, action: str, model: type) -> ColumnElement[bool]:
    t0 = time.perf_counter_ns()
    tree = self._policy._condition(action, model)          # cached, actor-free
    folded = fold(tree, actor)                             # M2, TDD 9.2
    element = to_sql(folded, model)                        # M2, TDD 9.3
    allowed = not (isinstance(folded, Const) and folded.value is not Truth.TRUE)
    if is_listened(allowed, self._on_decision):                       # 3.12.3
        emit_decision(Decision(
            allowed=allowed, action=action, resource_type=model.__name__, resource_id=None,
            actor_id=self._policy.actor_id(actor) if actor is not None else None,
            kind="filter", matched_rules=(), denied_by=(),
            duration_us=(time.perf_counter_ns() - t0) // config.NS_PER_US), self._on_decision)
    return element
```
- Runs **no** query (N6). The route adds `limit`, `order_by`, `offset` and runs it.
- `Decision.allowed` for a filter means "this filter can match some row": `False` only when the folded tree is the constant `FALSE` or `UNKNOWN` (open question Q8).
- Returned `Select` always has the `where`. A folded `TRUE` renders as `WHERE true` (harmless; SQLite renders `1 = 1`).
- Values in the condition are bound parameters (TDD 9.3). Tested again here at the HTTP level (6.2 case 13).

### 3.5 `filter(model, action)` (TDD 12.2)
- Same as `query`, but returns `condition` (the `ColumnElement[bool]`) instead of `select(model).where(condition)`.
- For custom joins: `select(Post, User).join(User).where(cond)`.
- Name: `fastauthz_filter_<Model>_<action>`; marker kind `"filter"`.

### 3.6 `load(model, action, *, param=None, id_column=None)` (TDD 12.3)

#### 3.6.1 Data held per factory call
```python
@dataclass(frozen=True, slots=True)
class _LoadPlan:
    model: type
    action: str
    id_column: str                      # attribute key, e.g. "id"
    id_attr: Any                        # InstrumentedAttribute, e.g. Post.id
    id_adapter: TypeAdapter[Any]        # pydantic adapter for the column's python type
    id_type: type                       # e.g. int, UUID, str
    param: str | None                   # explicit param=, or None
    default_param: str                  # f"{model.__name__.lower()}_id", e.g. "post_id"
```

#### 3.6.2 Factory-time steps
1. `self._session is None` -> `FastAuthzError("load() needs FastAuthz(session=...)")`.
2. `_check_target(model, action, filterable=True)` (3.3.1).
3. `id_column = id_column or spec.id_column` (default `"id"`, TDD 8.1).
4. `id_type = _compat.column_python_type(model, id_column)`.
   - `KeyError` -> `FastAuthzError(f"{model.__name__} has no column '{id_column}'")`.
   - `NotImplementedError` (custom type with no python type) -> `FastAuthzError(f"cannot read the python type of {model.__name__}.{id_column}; use an int, str or UUID id")`.
5. `id_adapter = TypeAdapter(id_type)` (built once; pydantic gives the same coercion and error format as FastAPI).
6. `default_param = config.LOAD_PARAM_TEMPLATE.format(model=model.__name__.lower())` (`"{model}_id"`).
7. Build the dependency (variant by `self._session_is_async`, 3.3.4), with params `fastauthz_request`, `fastauthz_actor`, `fastauthz_session`.
8. Append the plan to `self._loads` (used by `install()` to check routes).
9. Marker: `PermissionInfo("load", model, action, param=param, owner=self)`.

#### 3.6.3 Resolving the path parameter (same function at start and at request time)
```python
def _resolve_param(explicit: str | None, default: str, names: Collection[str]) -> str | None:
    if explicit is not None:
        return explicit if explicit in names else None
    if default in names:
        return default
    if set(names) == {config.LOAD_FALLBACK_PARAM}:          # route has only {id}
        return config.LOAD_FALLBACK_PARAM
    return None
```
- At `install()`: `names = _compat.route_path_params(route)`. `None` -> collected as a route problem; `install()` raises (3.10.2).
- At request time: `names = request.path_params.keys()`. `None` (a route added after `install()`, or no `install()` at all) -> `FastAuthzError` -> HTTP 500. Fail closed: no object is returned.
- One `load()` dependency may be reused on several routes. Resolving per route keeps that working.

#### 3.6.4 Request-time steps (async variant; the sync variant is the same without `await`)
```python
async def dep(**kw: Any) -> M:
    t0 = time.perf_counter_ns()
    request: Request = kw["fastauthz_request"]
    actor: object | None = kw["fastauthz_actor"]
    session: object = kw["fastauthz_session"]

    name = _resolve_param(plan.param, plan.default_param, request.path_params.keys())
    if name is None:
        raise FastAuthzError(f"load({plan.model.__name__}) found no id in the URL")
    ident = _convert_id(plan, name, request.path_params[name])          # 422 on bad value, 0 queries
    if not _compat.is_async_session(session):
        raise FastAuthzError("load(): the session dependency did not return an AsyncSession")

    condition = self._compile_for_load(actor, plan)                      # fold + to_sql, no decision emitted
    stmt = (select(plan.model)
            .where(plan.id_attr == ident, condition)
            .limit(config.LOAD_FETCH_LIMIT))                             # 2: detect non-unique ids
    obj = (await session.execute(stmt)).scalars().one_or_none()          # MultipleResultsFound -> 500

    if obj is not None:
        self._emit_load(plan, actor, ident, allowed=True, t0=t0)
        return obj

    status = 404
    if self._deny_status == 403 and await self._exists_in_scope(session, actor, plan, ident):
        status = 403
    decision = self._emit_load(plan, actor, ident, allowed=False, t0=t0)
    raise Denied(decision, status_code=status)
```

#### 3.6.5 Id conversion (TDD 12.3 step 2)
```python
def _convert_id(plan: _LoadPlan, name: str, raw: object) -> object:
    try:
        return plan.id_adapter.validate_python(raw)
    except ValidationError as exc:
        errors = [{**e, "loc": ("path", name)} for e in exc.errors(include_url=False)]
        raise RequestValidationError(errors) from None
```
- FastAPI's default handler turns `RequestValidationError` into 422 with its usual body. Same as when a route declares `post_id: int`.
- Runs before any query (6.2 case 18 asserts 0 queries).
- Starlette convertors (`{post_id:int}`) already give an `int`; `validate_python` accepts it unchanged.

#### 3.6.6 Session type check
- Async variant + not `is_async_session(session)` -> `FastAuthzError` (500).
- Sync variant + not `is_sync_session(session)` -> `FastAuthzError` (500).
- The message says what was expected. It contains no values.

#### 3.6.7 The 403 mode extra query (TDD 12.3 step 4)
```python
async def _exists_in_scope(self, session, actor, plan, ident) -> bool:
    scope = self._policy._scope_expr(plan.model)              # resolved scope, or None
    if scope is None:
        where = [plan.id_attr == ident]
    else:
        folded = fold(scope, actor)
        if isinstance(folded, Const) and folded.value is not Truth.TRUE:
            return False                                       # e.g. anonymous: 404, no extra query
        where = [plan.id_attr == ident, to_sql(folded, plan.model)]
    return bool((await session.execute(select(exists().where(*where)))).scalar())
```
- Runs **only** on the deny path. The happy path stays at one query.
- The scope stays in the query, so a row of another tenant gives 404, never 403 (no cross-tenant id leak).
- Deny rules and `bypass_scope` are not used here. The question is only "does this id exist in your tenant?".

#### 3.6.8 Edge cases
| Case | Result |
|---|---|
| Actor is `None` | Filter folds (often to `FALSE`); row not returned -> 404. |
| Row exists, deny rule `TRUE` or `UNKNOWN` | 404 (or 403 in 403 mode if inside the scope). |
| Row's scope column is `NULL` | `UNKNOWN` -> not returned -> 404. |
| `id_column` not unique, 2 rows match | `MultipleResultsFound` -> 500 (fail closed; app bug). |
| Path value is `"abc"` for an `int` id | 422, 0 queries. |
| Object already in the session identity map | Returned only if the database row passes the `WHERE` (the check runs in SQL). |
| Route later reads an unloaded relationship in async code | `MissingGreenlet` from SQLAlchemy. User's eager-loading choice; documented, not ours to fix. |

### 3.7 `require(action, model)` (TDD 12.4)

```python
def require(self, action: str, model: type[Any]) -> Callable[..., Coroutine[Any, Any, None]]:
    self._check_target(model, action, filterable=False)
    self._requires.append((action, model))

    async def dep(**kw: Any) -> None:
        t0 = time.perf_counter_ns()
        actor = kw["fastauthz_actor"]
        truth = self._policy._require_truth(actor, action, model)     # 3.14
        allowed = truth is Truth.TRUE
        decision = self._emit_simple("require", action, model, actor, allowed, t0)
        if not allowed:
            raise Denied(decision, status_code=config.CHECK_DENY_STATUS)       # 403

    return _with_signature(dep, [...actor param...], returns=None,
                           name=f"fastauthz_require_{model.__name__}_{action}",
                           info=PermissionInfo("require", model, action, owner=self))
```
- `_require_truth` evaluates `_condition(action, model, with_scope=False)` with `resource=None`.
- With `resource=None`, every `R` path is `MISSING` -> `UNKNOWN` (section 5). So only actor-only rules can pass.
- Deny rules still apply. A deny rule that reads `R` is `UNKNOWN` here, so `NOT UNKNOWN = UNKNOWN`, and the route always gives 403. `install()` warns about this (3.10.4, open question Q6).
- `filterable=False`: a `check=` rule is allowed here; it is called as `check(actor, None)`. If it raises, the result is `UNKNOWN` (TDD 5.7) -> deny.
- Use with `dependencies=[Depends(authz.require("create", Post))]` or as an `Annotated[None, Depends(...)]` parameter. Both are found by `route_dependencies`.

### 3.8 `Guard` and `authz.guard` (TDD 12.2)

```python
class Guard:
    __slots__ = ("_authz", "_actor")

    def __init__(self, authz: FastAuthz, actor: object | None) -> None: ...
    @property
    def actor(self) -> object | None: ...

    def can(self, action: str, obj: object) -> bool: ...
    def check(self, action: str, obj: object) -> None: ...                  # raises Denied(status_code=403)
    def filter(self, action: str, model: type[Any]) -> ColumnElement[bool]: ...
```
- `authz.guard` is an attribute: an `async def` dependency with one parameter (`fastauthz_actor`) that returns `Guard(self, actor)`. Use: `guard: Annotated[Guard, Depends(authz.guard)]`. Marker: `PermissionInfo("guard", None, None, owner=self)`.
- `can(action, obj)`:
  1. `model = type(obj)`; `UnknownResourceError` / `UnknownActionError` if not declared (runtime, so 500: an app bug).
  2. Answer from the cached combined tree: `evaluate(_condition(action, model), actor, obj) is Truth.TRUE` (same code path as `policy.can`).
  3. Emit `Decision(kind="check", resource_id=getattr(obj, spec.id_column, None), matched_rules, denied_by)`. `matched_rules` / `denied_by` come from `_rule_results` and are computed **only if someone listens** (3.12.3).
  4. Return the bool.
- `check(action, obj)`: same as `can`; if `False`, raise `Denied(decision, status_code=403)`.
- `check` uses the scope (the object exists in memory). So `guard.check("create", Post(**body.model_dump()))` checks the new post's tenant (F11.4).
- `filter(action, model)`: `_check_target(model, action, filterable=True)` at call time, then `_compile(...)`. `NotFilterableError` here is a 500 (an app bug, and FA013 listed it at start).
- Lazy-load guard (TDD 7) still applies: unloaded relationships on DB objects -> `MISSING` -> deny + WARNING.

### 3.9 The `Denied` handler and the problem-details body (TDD 12.5)

```python
async def denied_handler(request: Request, exc: Exception) -> Response:
    if not isinstance(exc, Denied):          # never happens; keeps pyright strict happy, re-raises others
        raise exc
    status = exc.status_code
    template = config.NOT_FOUND_DETAIL_TEMPLATE if status == 404 else config.DENY_DETAIL_TEMPLATE
    body = {
        "type": config.PROBLEM_TYPE,                         # "about:blank"
        "title": HTTPStatus(status).phrase,                  # "Forbidden" / "Not Found"
        "status": status,
        "detail": template.format(action=exc.decision.action, resource=exc.decision.resource_type),
    }
    return JSONResponse(body, status_code=status, media_type=config.PROBLEM_MEDIA_TYPE)
```
- `Content-Type: application/problem+json`.
- The detail only uses the action name and the model name. Both come from `policy.resource(...)` declarations (an undeclared action raises before a `Denied` can exist). No rule names, no values, no explanation (CLAUDE.md rule 7).
- 404 uses its own template ("This Post was not found."). Using the 403 text on a 404 would say "you are not allowed", which leaks that the row exists. A missing row and a denied row in 404 mode give **byte-identical** responses (test 6.2 case 17).
- No `WWW-Authenticate` header and never 401: authentication is the actor dependency's job. An anonymous user gets 403 / 404 like anyone else.
- `Denied` raised by user code with `policy.check(...)` inside a route also goes through this handler -> 403.

### 3.10 `install(app)`

#### 3.10.1 Steps
```python
def install(self, app: FastAPI) -> None:
    current = getattr(app.state, config.APP_STATE_KEY, None)       # "fastauthz"
    if current is self:
        return                                                     # idempotent
    if current is not None:
        raise FastAuthzError("another FastAuthz is already installed on this app")
    problems = self._check_routes(app)                             # 3.10.2 - validate first
    if problems:
        raise FastAuthzError("fastauthz found route problems:\n" + "\n".join(problems))
    self._warn_routes(app)                                         # 3.10.4
    if Denied not in app.exception_handlers:
        app.add_exception_handler(Denied, denied_handler)
    wrap_openapi(app, self)                                        # 3.11
    app.openapi_schema = None                                      # drop a schema built before install
    setattr(app.state, config.APP_STATE_KEY, self)
```
- Validate first, change the app after. If `install()` raises, the app is unchanged.
- One `FastAuthz` per app in v1 (open question Q4).
- If the app already has a handler for `Denied`, it is kept. A handler only for `FastAuthzError` (the base class) does **not** count; ours is added and wins for `Denied` (Starlette picks the most specific class in the MRO). Documented.
- `install()` must be called **after** all routers are included. Routes added later are not checked at start. At request time they still fail closed (3.6.3).

#### 3.10.2 Route checks (errors -> `install()` raises)
For each `route in _compat.iter_routes(app)` and each `dep in _compat.route_dependencies(route)` with a marker `info`:
| Check | Problem text (example) |
|---|---|
| `info.owner is not self` | `GET /posts: uses a dependency from another FastAuthz object` |
| `info.kind == "load"` and `_resolve_param(info.param, default, route_path_params(route)) is None` | `PATCH /posts/{pid}: load(Post, "edit") needs path parameter 'post_id'; pass param="pid"` |

All problems are collected and raised together (same idea as `freeze()`, F5.2). These are app wiring problems, not policy rules, so they have no `FA0xx` code (codes are only added through TDD 8.5).

#### 3.10.3 WebSocket routes
- `_compat.iter_websocket_routes(app)` is walked too. A fastauthz marker on a WebSocket route is a route problem: `WS /ws: fastauthz dependencies are not supported on WebSocket routes in v1`. Fail early instead of failing on connect.

#### 3.10.4 Warnings (logged on logger `fastauthz` at WARNING, never stop the app)
- For every `require(action, model)` used on a route:
  - every allow rule for `(action, model)` "needs R" -> `"... require('create', Post) can never succeed: every allow rule reads R"` (TDD 12.4).
  - (Q6) any deny rule for `(action, model)` "needs R" -> `"... deny rule 'Post.create#4' reads R; with require() it is UNKNOWN and blocks every request"`.
- A rule "needs R" if `rule.check is not None` or its `when` contains a `ResourceAttr` or `Related` node (`_reads_resource(expr)`, a small tree walk).
- Warnings name rules and routes. They go to the server log, never to HTTP responses (rule 7 is about responses and error messages shown to users).

### 3.11 OpenAPI (`openapi.py`, TDD 12.6)

#### 3.11.1 Wrapping
```python
def wrap_openapi(app: FastAPI, authz: FastAuthz) -> None:
    original = app.openapi                        # FastAPI's, or the user's own override

    def openapi() -> dict[str, Any]:
        if app.openapi_schema is not None and getattr(app.state, config.OPENAPI_DONE_KEY, False):
            return app.openapi_schema
        app.openapi_schema = None                 # force a fresh build from the original
        schema = original()
        add_permissions(schema, app, authz)
        app.openapi_schema = schema               # cache, like FastAPI does
        setattr(app.state, config.OPENAPI_DONE_KEY, True)
        return schema

    app.openapi = openapi                         # type: ignore[method-assign]
```
- Wrapped once (`install()` is idempotent). Calling `/openapi.json` twice returns the same cached dict; additions are never applied twice.

#### 3.11.2 `add_permissions(schema, app, authz)`
```text
for route in iter_routes(app):
    if not route.include_in_schema: continue
    infos = [marker(dep) for dep in route_dependencies(route) if marker(dep)]
    if not infos: continue
    for method in sorted(route.methods):
        op = schema["paths"].get(route.path_format, {}).get(method.lower())
        if op is None: continue                   # e.g. HEAD
        add_responses(op, infos, authz)           # 3.11.3
        add_extension(op, infos)                  # "x-fastauthz"
        add_permission_line(op, infos)            # "**Permission:** ..."
        add_load_path_param(op, infos, route)     # 3.11.4
if anything was added: schema["components"]["schemas"]["FastAuthzProblem"] = PROBLEM_SCHEMA
```

#### 3.11.3 Responses per dependency kind
| Kind | Responses added |
|---|---|
| `load` | `404`; plus `403` when `deny_status=403`; plus `422` (bad id) if missing |
| `require` | `403` |
| `guard` | `403` |
| `query`, `filter` | none (they never raise `Denied`; they filter) |

- Main TDD 12.6 says "adds 403" for every guarded route. `query`/`filter` never return 403, so this file adds it only where it can happen (open question Q1; main TDD 12.6 gets updated in the same PR).
- An existing entry for the same status code (declared by the user with `responses={...}`) is never replaced.
- Response object:
  ```json
  {"description": "Forbidden",
   "content": {"application/problem+json": {"schema": {"$ref": "#/components/schemas/FastAuthzProblem"}}}}
  ```
- `FastAuthzProblem` schema:
  ```json
  {"type": "object", "title": "FastAuthzProblem",
   "properties": {"type": {"type": "string"}, "title": {"type": "string"},
                  "status": {"type": "integer"}, "detail": {"type": "string"}},
   "required": ["type", "title", "status", "detail"]}
  ```

#### 3.11.4 Extension, description line, load path parameter
- `x-fastauthz`: a list of `{"resource": model.__name__, "action": action}` for every `query`/`filter`/`load`/`require` marker on the route, deduplicated, sorted by `(resource, action)`. `guard` adds nothing (its actions are not known at start).
- Description: append `"\n\n" + config.OPENAPI_PERMISSION_LINE.format(permissions=...)`, where permissions is `` `edit` on `Post` `` joined by `", "`. If there is no description, the line becomes the description.
- `load` path parameter: if the operation has no path parameter with the resolved name (the route function did not declare `post_id: int`), add
  `{"name": "post_id", "in": "path", "required": true, "schema": TypeAdapter(id_type).json_schema()}`.
  If `#/components/schemas/HTTPValidationError` is missing, add `_compat.validation_error_schemas()`.

#### 3.11.5 Example result
```json
"/posts/{post_id}": {"patch": {
  "summary": "Edit Post",
  "description": "\n\n**Permission:** `edit` on `Post`",
  "parameters": [{"name": "post_id", "in": "path", "required": true, "schema": {"type": "integer"}}],
  "responses": {"200": {"...": "..."},
                "404": {"description": "Not Found", "content": {"application/problem+json": {"schema": {"$ref": "#/components/schemas/FastAuthzProblem"}}}},
                "422": {"...": "..."}},
  "x-fastauthz": [{"resource": "Post", "action": "edit"}]}}
```

### 3.12 Decisions and logging (TDD 10.1)

#### 3.12.1 Where decisions come from
| Source | `kind` | `resource_id` | `matched_rules` / `denied_by` |
|---|---|---|---|
| `query`, `filter`, `Guard.filter` | `"filter"` | `None` | `()` / `()` |
| `load` | `"load"` | converted id (also on deny) | `()` / `()` (the database decided) |
| `require` | `"require"` | `None` | `()` / `()` |
| `Guard.can`, `Guard.check` | `"check"` | `getattr(obj, spec.id_column, None)` | names from `_rule_results` |

- `actor_id = policy.actor_id(actor)` (default `getattr(actor, "id", None)`), or `None` for an anonymous actor. Never the actor object (F14.3).
- `duration_us = (time.perf_counter_ns() - t0) // config.NS_PER_US`. For `load` it includes the database query (and the 403-mode extra query).
- Invariant for `"check"`: `allowed == (len(matched_rules) > 0 and len(denied_by) == 0)`. Proof: `allow_part` is `TRUE` iff some allow rule is `TRUE`; `NOT deny_part` is `TRUE` iff every deny rule is `FALSE`, i.e. `denied_by` (deny rules `TRUE` or `UNKNOWN`) is empty. Tested (6.3 case 56).

#### 3.12.2 `emit_decision` (in `decision.py`, stdlib only)
```python
_decision_logger = logging.getLogger(config.DECISION_LOGGER_NAME)        # "fastauthz.decisions"
_library_logger = logging.getLogger(config.LIBRARY_LOGGER_NAME)          # "fastauthz"

def decision_level(allowed: bool) -> int:
    return logging.INFO if (not allowed and config.LOG_DENIES_AT_INFO) else logging.DEBUG

def is_listened(allowed: bool, callback: Callable[[Decision], None] | None) -> bool:
    return callback is not None or _decision_logger.isEnabledFor(decision_level(allowed))

def emit_decision(decision: Decision, callback: Callable[[Decision], None] | None) -> None:
    level = decision_level(decision.allowed)
    if _decision_logger.isEnabledFor(level):
        _decision_logger.log(level, config.DECISION_LOG_FORMAT,
                             decision.kind, decision.allowed, decision.action, decision.resource_type,
                             decision.resource_id, decision.actor_id, decision.duration_us,
                             extra={"fastauthz_decision": decision})
    if callback is not None:
        try:
            callback(decision)
        except Exception:                          # not BaseException: CancelledError etc. propagate
            _library_logger.exception("on_decision callback raised; the decision is unchanged")
```
- The callback runs **before** `Denied` is raised. Its crash never changes the result (F14.5).
- `extra={"fastauthz_decision": ...}` lets JSON log formatters read the record.
- The log line has ids and names only. It does not include `matched_rules` (they are on the `extra` object for those who want them).

#### 3.12.3 Building decisions lazily
- `FastAuthz._emit*` helpers first compute `allowed`, then call `is_listened(allowed, self._on_decision)`. If nobody listens, the `Decision` is not built and `_rule_results` is not run. The observable behaviour is the same; it keeps `Guard.can` near the `policy.can` speed target (N4).

### 3.13 Change to `errors.py`
```python
class Denied(FastAuthzError):
    def __init__(self, decision: Decision, *, status_code: int = 403) -> None:
        super().__init__(config.DENIED_MESSAGE)        # fixed text, no values: "access denied"
        self.decision = decision
        self.status_code = status_code
```
- `load()` needs to say 404 or 403; `check()`/`require()` say 403. Main TDD 11 shows only `.decision`; `status_code` is an addition (open question Q3). The core stays stdlib-only.

### 3.14 Small internal helpers in `policy.py` (if M1/M2 did not add them)
```python
def _rules_for(self, action: str, model: type, effect: Literal["allow", "deny"]) -> tuple[Rule, ...]: ...
def _rule_results(self, actor: object | None, action: str, obj: object) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """(allow rules that are TRUE incl. scope, deny rules that are TRUE or UNKNOWN). Same logic as explain()."""
def _require_truth(self, actor: object | None, action: str, model: type) -> Truth:
    return evaluate(self._condition(action, model, with_scope=False), actor, None)
def _has_unfilterable_rule(self, action: str, model: type) -> bool: ...
def _scope_expr(self, model: type) -> Expr | None: ...                   # M2
```
- These touch `policy.py` only, not `truth.py`, `evaluate.py` or `sql.py`. If any of those three changes, the property tests must run on SQLite and PostgreSQL (CLAUDE.md rule 3).

---

## 4. Config constants (`config.py`)

| Name | Type | Default | Why |
|---|---|---|---|
| `DEFAULT_DENY_STATUS` | `Literal[403, 404]` | `404` | `load()` default hides which ids exist (TDD 12.3). |
| `CHECK_DENY_STATUS` | `int` | `403` | `require()`, `Guard.check`, `policy.check` in routes (TDD 12.1). |
| `DENY_DETAIL_TEMPLATE` | `str` | `"You do not have permission to {action} this {resource}."` | Fixed 403 text (TDD 12.5). |
| `NOT_FOUND_DETAIL_TEMPLATE` | `str` | `"This {resource} was not found."` | Fixed 404 text; must not hint at permission. |
| `DENIED_MESSAGE` | `str` | `"access denied"` | `str(Denied)`; no values. |
| `PROBLEM_TYPE` | `str` | `"about:blank"` | RFC 9457 default type. |
| `PROBLEM_MEDIA_TYPE` | `str` | `"application/problem+json"` | RFC 9457 media type. |
| `MARKER_ATTRIBUTE` | `str` | `"__fastauthz__"` | Marker on dependency functions (TDD 12.6). |
| `APP_STATE_KEY` | `str` | `"fastauthz"` | `app.state` key for idempotent `install()`. |
| `OPENAPI_DONE_KEY` | `str` | `"fastauthz_openapi_done"` | OpenAPI additions applied once. |
| `OPENAPI_EXTENSION_KEY` | `str` | `"x-fastauthz"` | OpenAPI extension field (F13.2). |
| `OPENAPI_PROBLEM_SCHEMA_NAME` | `str` | `"FastAuthzProblem"` | Component schema name. |
| `OPENAPI_PERMISSION_LINE` | `str` | `"**Permission:** {permissions}"` | Line in each operation description (F13.1). |
| `LOAD_PARAM_TEMPLATE` | `str` | `"{model}_id"` | Default path parameter (TDD 12.3 step 1). |
| `LOAD_FALLBACK_PARAM` | `str` | `"id"` | Used when the route has only `{id}`. |
| `LOAD_FETCH_LIMIT` | `int` | `2` | Detect a non-unique id column without loading many rows. |
| `PATH_PARAM_PATTERN` | `str` | `r"{([^}:]+)(?::[^}]*)?}"` | Fallback parser for route paths (3.1.3). |
| `DECISION_LOGGER_NAME` | `str` | `"fastauthz.decisions"` | F14.4. |
| `LIBRARY_LOGGER_NAME` | `str` | `"fastauthz"` | Warnings and callback errors. |
| `LOG_DENIES_AT_INFO` | `bool` | `False` | TDD 10.1: denies at INFO when `True`. |
| `DECISION_LOG_FORMAT` | `str` | `"decision kind=%s allowed=%s action=%s resource=%s id=%r actor=%r us=%d"` | One stable log line. |
| `NS_PER_US` | `int` | `1000` | `duration_us` conversion (no magic numbers, rule 8). |

---

## 5. Truth-rule impact (TDD 6)

M3 adds **no** new truth rule. It must not weaken any.

| Place | What happens | Why it stays fail-closed |
|---|---|---|
| `query` / `filter` / `load` | SQL `WHERE allow AND NOT deny`; the database keeps only `TRUE` rows (TDD 6.4). | `NULL` / `UNKNOWN` rows are dropped by SQL. |
| `load` 403 mode | Extra `exists()` with the scope only. Gives 403 vs 404, never a row. | Decides only the status code; access still needs the main query. A scope that folds to `FALSE`/`UNKNOWN` -> 404 with no query. |
| `require` | `_condition(..., with_scope=False)` evaluated with `resource=None`. Every `R` path -> `MISSING` -> `UNKNOWN`. | `UNKNOWN` in an allow rule -> not `TRUE` -> 403. `UNKNOWN` in a deny rule -> `NOT UNKNOWN = UNKNOWN` -> 403. |
| `require`, `resource=None` vs `NO_ROW` | `resource=None` means "no resource at all", so paths are `MISSING` (-> `UNKNOWN`), **not** `NO_ROW` (-> `FALSE`). | With `NO_ROW`, `~(R.x == 1)` would be `TRUE` and could open access. `MISSING` keeps it `UNKNOWN`. Unit test 6.2 case 32. |
| `Guard.can/check` | Python engine (TDD 7), including the lazy-load guard. | Unloaded relationship -> `MISSING` -> deny + WARNING. |
| `check=` raising | `UNKNOWN` (TDD 5.7). | Deny. |
| Anonymous actor | `ActorPresent` `FALSE`; actor paths `MISSING`. | Scoped rules never pass; `who=ANYONE` + `bypass_scope=True` needed for public data. |
| `on_decision` crash | Logged; result unchanged. | Callback cannot turn a deny into an allow. |

---

## 6. Test plan

### 6.1 Rules
- Tests first: each task in `TASKS.md` starts with failing tests.
- No network. PostgreSQL only from `FASTAUTHZ_TEST_PG_URL` (local Docker or CI service); tests marked `postgres` are skipped when it is not set.
- HTTP tests use `httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")` under the anyio plugin (`anyio_backend = "asyncio"`; SQLAlchemy async needs asyncio).
- Engines:
  - SQLite sync: `sqlite+pysqlite:///:memory:` with `StaticPool`.
  - SQLite async: `sqlite+aiosqlite:///:memory:` with `StaticPool`.
  - PostgreSQL sync: `postgresql+psycopg://...`; async: `postgresql+asyncpg://...`. One schema per test session, each test in a rolled-back transaction.
- Matrix fixture `stack` = {sync, async} x {sqlite, postgres}. The same test body runs on all four.
- Query counter fixture:
  ```python
  @contextmanager
  def count_queries(engine: Engine | AsyncEngine) -> Iterator[list[str]]:
      sync_engine = engine.sync_engine if isinstance(engine, AsyncEngine) else engine
      seen: list[str] = []
      def on_execute(conn, cursor, statement, params, context, executemany): seen.append(statement)
      event.listen(sync_engine, "before_cursor_execute", on_execute)
      try: yield seen
      finally: event.remove(sync_engine, "before_cursor_execute", on_execute)
  ```
  Only statements run during the request are counted (`BEGIN`/`COMMIT` are not cursor executes). Pool pre-ping is off in tests.

### 6.2 Concrete test cases

Test schema (tests/integration/models.py): `Org(id)`, `User(id, org_id, roles)` (plain object as actor), `Post(id: int, org_id, author_id, published, locked)`, `Doc(id: UUID, org_id, owner_id)`.
Policy: scope `R.org_id == A.org_id`; roles `admin -> editor -> viewer`; public read with `who=ANYONE, when=R.published.is_(True), bypass_scope=True`; `read` for `viewer`; `edit`/`delete` for author; `*` for admin; deny `delete` when `R.locked.is_(True)`; `create` for `editor`.
Actors: `alice` (org 1, viewer, author of post 1), `bob` (org 1, viewer, author of post 2), `carol` (org 2, admin), `None`.

**Setup and start time (`test_fastapi_setup.py`)**
1. `FastAuthz(policy_with_FA001)` -> `PolicyError`, all problems listed.
2. After `FastAuthz(policy, ...)`, `policy.allow(...)` -> `PolicyFrozenError`.
3. `deny_status=401` -> `ValueError`. `on_decision=async_fn` -> `ValueError`.
4. `authz.query(NotDeclared, "read")` -> `UnknownResourceError`.
5. `authz.load(Post, "eidt")` -> `UnknownActionError`; `authz.query(Post, "*")` -> `UnknownActionError`.
6. `publish` has `check=` without `sql=`: `query`, `filter`, `load` -> `NotFilterableError`; `require("publish", Post)` works.
7. `FastAuthz(..., session=None).load(Post, "edit")` -> `FastAuthzError`.
8. `load` on a model whose id column has a custom type without `python_type` -> `FastAuthzError`.
9. Every factory result has `__fastauthz__` with the right `kind`, `model`, `action`, `param`.
10. `inspect.signature(dep)` lists exactly the expected parameters; `load` is `async def` for `async def get_session`, async generator, async callable class and `functools.partial` of one; plain `def` for sync generator and sync function.
11. `fastapi.py` source contains no `from __future__ import annotations`.

**query / filter (`test_fastapi_deps.py`, `test_http_blog.py`)**
12. `GET /posts` as alice -> 200; ids = posts of org 1 she may read + public posts; route ran exactly 1 query; the dependency alone ran 0 (a route that returns `str(stmt)` -> 0 queries).
13. Captured SQL text contains no actor value (actor id `987654` appears only in bound params).
14. `GET /posts` as carol (admin, org 2) -> only org 2 + public posts (scope kept for admins).
15. `GET /posts` as `None` -> only public posts.
16. `filter` dependency used with a join returns the same ids as `query`.

**load**
17. `GET /posts/{bob_post}` as alice (no edit right) -> 404; body equals byte-for-byte `GET /posts/999999` -> 404; both `Content-Type: application/problem+json`; each 1 query.
18. `PATCH /posts/{alice_post}` as alice -> 200; exactly 1 query before the route body; the route changes `title` and commits; a new session sees the change (same session shared).
19. `GET /posts/abc` -> 422 with FastAPI's error shape (`loc == ["path", "post_id"]`); 0 queries.
20. `Doc` with `UUID` id: valid UUID -> 200; `"not-a-uuid"` -> 422.
21. `deny_status=403`: alice edits bob's post (same org) -> 403; 2 queries.
22. `deny_status=403`: id 999999 -> 404; 2 queries.
23. `deny_status=403`: alice edits a post of org 2 -> 404 (not 403).
24. `deny_status=403`: anonymous -> 404 and only 1 query (scope folds to `UNKNOWN`).
25. `DELETE /posts/{locked_alice_post}` as alice -> 404 (deny wins).
26. `param="pid"` on `/posts/{pid}` -> works; default on `/posts/{id}` -> works; route `/posts/{slug}` with default -> `install()` raises naming the route.
27. One `load` dependency reused on `/posts/{post_id}` and `/v2/posts/{post_id}` -> both work.
28. Async variant but session dependency returns a sync `Session` -> 500, response body has no data; and the reverse.
29. Non-unique id column (test model) -> 500 (`MultipleResultsFound`), no object returned.

**require**
30. `POST /posts` as an editor -> 200; as alice (viewer) -> 403 problem body; as `None` -> 403 (never 401).
31. `require("create", Post)` with `allow("create", Post, when=R.org_id == A.org_id)` only -> always 403; `install()` logs the "can never succeed" warning.
32. (a) `require` with `allow("create", Post, roles=["editor"], when=~R.locked.is_(True))` as an editor -> 403: `R.locked` is `MISSING` -> `UNKNOWN` -> `NOT UNKNOWN = UNKNOWN`. (If `resource=None` were wrongly treated as `NO_ROW`, this would be `NOT FALSE = TRUE` and give 200; this test guards that.) (b) `deny("create", Post, when=R.locked.is_(True))` plus a roles-only allow -> 403 for everyone, and the deny warning is logged.
33. `require` ignores scope: an editor with `org_id=None` still passes a roles-only rule.
34. `dependencies=[Depends(authz.require(...))]` on a router -> enforced on every route of that router.

**guard**
35. `guard.check("publish", post)` denied -> 403; body detail is the fixed template; no rule name, no value.
36. `guard.can` returns `True`/`False` and emits `kind="check"` with `matched_rules`.
37. `guard.check("create", Post(org_id=2))` as alice (org 1, editor) -> 403 (scope applied to the built object).
38. `guard.filter("read", Post)` in a route -> same ids as `query`.

**errors and install (`test_fastapi_errors.py`)**
39. Problem body is exactly `{"type": "about:blank", "title": "Forbidden", "status": 403, "detail": "You do not have permission to publish this Post."}`.
40. Bodies of every deny response never contain: any rule name, `"#"`, any actor or row value used in the test (sentinel strings).
41. App with its own `Denied` handler -> handler kept after `install()`.
42. `install(app)` twice -> one handler, OpenAPI additions once.
43. A second `FastAuthz` on the same app -> `FastAuthzError`, app unchanged.
44. `policy.check(...)` raising inside a plain route -> 403 via the handler.
45. Fastauthz dependency on a WebSocket route -> `install()` raises.

**OpenAPI (`test_openapi.py`)**
46. `load` route: `404`, `x-fastauthz`, permission line, path parameter added when the function does not declare it; `422` + `HTTPValidationError` present.
47. `deny_status=403`: also `403`.
48. `require` and `guard` routes: `403`. `query` route: `x-fastauthz` and permission line, no `403`.
49. Route with `include_in_schema=False`: untouched.
50. Routes in nested routers with prefixes: all found.
51. User-declared `responses={404: {...}}`: kept as is.
52. `app.openapi()` twice -> same object, no duplicate lines; a schema built before `install()` is rebuilt.

**Decisions (`test_decisions_fastapi.py`)**
53. `on_decision` receives one `Decision` per check / filter / load / require with the right `kind`; `actor_id` is the id, never the actor object (assert `type(d.actor_id) is int`).
54. `on_decision` raising -> response status unchanged; one ERROR record on logger `fastauthz`.
55. Logger `fastauthz.decisions`: allowed at DEBUG; denies at DEBUG, and at INFO with `LOG_DENIES_AT_INFO=True` (monkeypatched).
56. Invariant `allowed == bool(matched_rules) and not denied_by` for `kind="check"` over a small Hypothesis sample of actors/posts.
57. No listener and logger above DEBUG -> `_rule_results` not called (spy).
58. `duration_us` is an `int >= 0`; for `load` it is >= the measured query time.

**SQLModel (`test_sqlmodel.py`)**
59. `class Post(SQLModel, table=True)` with the same policy: `GET /posts` and `GET /posts/{post_id}` give the same results as the SQLAlchemy models (sync and async).

**Snapshot (`test_openapi_snapshot.py`)**
60. Extract only fastauthz parts (`x-fastauthz`, the added responses, the permission lines, `FastAuthzProblem`) from the blog app schema, dump with `sort_keys=True`, compare with `snapshots/openapi_blog.json`. `FASTAUTHZ_UPDATE_SNAPSHOTS=1` rewrites it. Only our parts are compared, so FastAPI/Pydantic version changes do not break it.

### 6.3 Typing tests (`tests/typing/test_fastapi_types.py`)
```python
assert_type(authz.query(Post, "read"), Callable[..., Coroutine[Any, Any, Select[tuple[Post]]]])
assert_type(authz.require("create", Post), Callable[..., Coroutine[Any, Any, None]])
assert_type(authz.guard, Callable[..., Coroutine[Any, Any, Guard]])
```
Run by `uv run pyright` (strict) on every matrix cell.

### 6.4 Compat contract tests (`tests/compat/`)
- `iter_routes`: routes on the app; `include_router` 2 levels deep with prefixes; `app.add_api_route`; a router with `dependencies=[...]`; a WebSocket route (not yielded); a `Mount` of another FastAPI app (skipped); no duplicates; stable order.
- `route_dependencies`: route-level, router-level, `Annotated[..., Depends()]`, nested sub-dependency, `Security(...)`.
- `route_path_params`: `/a/{x}`, `/a/{x:int}/{y:path}`, `/a` (empty).
- `is_async_session` / `is_sync_session`: `Session`, `scoped_session`, `AsyncSession`, `async_scoped_session`, `Connection` (both `False`), `object()`.
- `column_python_type`: `int`, `str`, `UUID`, custom `TypeDecorator` without `python_type` (raises `NotImplementedError`), unknown name (`KeyError`).
- `relationship_target` / `relationship_direction`: many-to-one, one-to-many, many-to-many.
- `is_loaded`: loaded, unloaded, transient object.
- `validation_error_schemas`: has keys `ValidationError`, `HTTPValidationError`.
- These run on every CI matrix cell and in the nightly job against FastAPI pre-releases (TDD 12.7).

### 6.5 Coverage
- Whole package >= 95% branch (TDD 14.5). Target for `fastapi.py`, `openapi.py`, `_compat.py`: 100% branch except lines that are only reachable on the other FastAPI version branch (marked `# pragma: no branch` with a comment naming the version).
- Core modules stay at 100% (the `errors.py` / `decision.py` / `policy.py` changes are covered by tests 39-58).

---

## 7. Tooling and CI

### 7.1 Matrix (TDD 15.2, every PR)
| Axis | Values |
|---|---|
| Python | 3.11, 3.15 |
| Dependencies | `lowest-direct` (FastAPI floor from M0, SQLAlchemy 2.0.x floor), `highest` |
| SQLAlchemy line | 2.0 latest, 2.1 latest (via a constraint file) |
| Database | SQLite, PostgreSQL 18 (service container `postgres:18`) |

- 2 x 2 x 2 x 2 = 16 jobs. Steps per job:
  ```bash
  uv sync --all-extras --resolution "$RESOLUTION" --constraint "ci/constraints/sqlalchemy-$SA.txt"
  uv run ruff check . && uv run ruff format --check .
  uv run pyright
  uv run pytest            # plus: uv run pytest -m postgres   when DB=postgres
  ```
- `FASTAUTHZ_TEST_PG_URL` is set only in PostgreSQL jobs.
- Nightly (already planned in TDD 15.2; full form in M5): adds FastAPI pre-releases with `--prerelease allow` and runs `tests/compat/` first.

### 7.2 `pyproject.toml` changes
- Dev group: `sqlmodel`, `aiosqlite`, `asyncpg`, `psycopg[binary]`.
- `[tool.pytest.ini_options] markers = ["postgres: needs FASTAUTHZ_TEST_PG_URL"]`.
- Classifiers: `Development Status :: 3 - Alpha`, `Framework :: FastAPI`, `Typing :: Typed`.
- Extras stay as TDD 18: lower bounds only, no upper bounds.

### 7.3 Release job for `0.1.0` (`.github/workflows/release.yml`)
- Trigger: push of a tag `v*`.
- Job `build`: checkout, `uv build`, check that the wheel is `py3-none-any`, that `py.typed` is inside, and that the tag equals `__version__`; upload `dist/` as an artifact.
- Job `publish`: `needs: build`, `environment: pypi`, `permissions: id-token: write` (OIDC, no API token), action `pypa/gh-action-pypi-publish` pinned by commit SHA. Attestations (PEP 740) are on (TDD 17.2).
- One time, by hand: add a "pending trusted publisher" for project `fastauthz` on PyPI (owner, repo, workflow `release.yml`, environment `pypi`).
- Version `0.1.0` is a normal `0.x` release (it is not a PEP 440 pre-release like `0.1.0a1`); `0.x` already means "API may change" (TDD 15.3). The README says "alpha".

---

## 8. Performance

| Item | Target | How we check |
|---|---|---|
| `load()` happy path | exactly 1 SQL statement (N6) | query counter, tests 18, 26 |
| `load()` deny, 404 mode | 1 statement | test 17 |
| `load()` deny, 403 mode | 2 statements (only on deny) | tests 21, 22 |
| `query()` / `filter()` dependency | 0 statements | test 12 |
| `require()` / `guard` | 0 statements | tests 30, 35 |
| Filter build per request | < 100 µs (N5) | `_compile` = cached tree + `fold` + `to_sql`; benchmark added in M4 |
| `Guard.can` | close to `policy.can` (< 20 µs, N4) when nobody listens | lazy decisions (3.12.3); benchmark in M4 |

- Nothing reflects on models at request time: `id_attr`, `id_type`, `id_adapter`, parameter lists and markers are built at factory time.
- Non-I/O dependencies are `async def`, so they do not use the threadpool.
- The `EXISTS` subqueries from relationships keep `LIMIT` correct (TDD 9.4); `load()` adds `LIMIT 2` only to catch non-unique ids.

---

## 9. Security notes

| Threat (TDD 17.1 row) | M3 defence | Test |
|---|---|---|
| List endpoint forgets to filter | `query()`/`filter()` dependencies; `x-fastauthz` shows which routes are guarded | 12-16, 46-50 |
| Typo in action or resource | `UnknownActionError` / `UnknownResourceError` at route definition | 4, 5 |
| Enumeration of ids through 403 vs 404 | `load()` default 404; identical bodies for "missing" and "denied" | 17 |
| Enumeration across tenants in 403 mode | `exists()` keeps the scope -> other tenant is 404 | 23 |
| Error messages leak policy details | fixed templates; detail uses only declared action and model names | 39, 40 |
| Decision logs leak personal data | ids only; `actor_id` hook | 53 |
| SQL injection via values | everything through `to_sql` (bound params); id compared with `==` (bound) | 13 |
| Time-of-check / time-of-use gap | `load()` checks and loads in one statement | 18 |
| Custom check crash treated as allow | `UNKNOWN` -> deny (also in `require`, `check(actor, None)`) | 6, 30 |
| Lazy load reads missing data | `load()` uses SQL; `Guard` keeps the lazy-load guard | 36 |
| Wrong session type at request time | `FastAuthzError` -> 500, no data | 28 |
| Route added after `install()` | request-time param resolution fails closed (500) | 26 |

Known, accepted behaviour (documented):
- In 403 mode a user learns that a row exists **inside their own tenant**. That is what 403 mode means. 404 is the default.
- fastauthz cannot see a raw `select()` that a developer writes by hand without `query()`/`filter()` (TDD 17.1 row 1). The docs say so; `x-fastauthz` makes unguarded routes visible in review.

---

## 10. Risks and open questions

### 10.1 Risks
| Risk | Effect | Answer |
|---|---|---|
| FastAPI changes route or dependant internals again (like 0.137) | route walk or OpenAPI step breaks | all reads in `_compat.py`; contract tests on the matrix; nightly on pre-releases |
| Annotation handling in FastAPI changes | dependencies lose their sub-dependencies | explicit `__signature__` with real objects; test 10 |
| User passes a different session callable than the route uses | `load()` object in another session; route commit misses changes | docs; test 18 shows the right way |
| SQLAlchemy 2.1 changes `Select` generics | `Select[tuple[M]]` annotation wrong in 2.1 | typing test runs on both lines; if 2.1 differs, add a `_compat` type alias and use it in the public signature |
| OpenAPI output differs across FastAPI/Pydantic versions | snapshot noise | snapshot only our parts (test 60) |
| `install()` called before routers are included | those routes are not checked at start | docs + fail-closed request-time resolution; `install()` docstring says "call last" |
| Async route reads an unloaded relationship of the loaded object | `MissingGreenlet` | docs: eager-load what the route needs; not a fastauthz failure |

### 10.2 Open questions (with recommended answer)
| # | Question | Recommended answer |
|---|---|---|
| Q1 | Main TDD 12.6 adds 403 to every guarded route. `query`/`filter` never return 403. | Add responses only where they can happen (3.11.3). Update TDD 12.6 in the same PR. |
| Q2 | TDD 12.8 says dependencies are sync or async by session. Only `load()` uses a session. | `load()` follows 12.8; the others are always `async def`. Add one line to TDD 12.8. |
| Q3 | How does the handler know 404 vs 403? | `Denied.status_code` (3.13). Update TDD 11. |
| Q4 | Several `FastAuthz` objects on one app? | Not in v1; `install()` raises. Revisit only on real demand. |
| Q5 | Where does the route path parameter list come from? | `_compat.route_path_params` (3.1.3). Add to TDD 12.7. |
| Q6 | Warn when a deny rule reads `R` on a `require()` action? | Yes. It always blocks, so users must know. Add to TDD 12.4. |
| Q7 | Async `on_decision` callbacks? | Not in v1; reject at construction. Users can queue work themselves. |
| Q8 | What is `Decision.allowed` for a filter? | `False` only when the folded filter is a constant `FALSE`/`UNKNOWN`. Add to TDD 10.1. |
| Q9 | 404 detail text? | Separate `NOT_FOUND_DETAIL_TEMPLATE` (3.9). Add to TDD 12.5. |

---

## 11. Exit criteria

- [ ] Everything in section 3 is built, typed, and exported from `fastauthz.fastapi` (`FastAuthz`, `Guard`, `PermissionInfo`).
- [ ] All tests in section 6 pass on the 16-job matrix; `-m postgres` passes in CI.
- [ ] Coverage: package >= 95% branch; core modules still 100%.
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run pyright` pass locally, output shown in the PR (CLAUDE.md rule 11).
- [ ] Main TDD sections 10.1, 11, 12.4, 12.5, 12.6, 12.7, 12.8 updated for Q1-Q9 in the same PR.
- [ ] `QUICK_REFERENCE.md` FastAPI table still correct.
- [ ] `0.1.0` published from CI with Trusted Publishing and attestations; `CHANGELOG.md` has the `0.1.0` section; README status says alpha.

# M3 - FastAPI: Tasks

> Very simple English. One small task per line (2 hours or less).
> Do the tasks in order. Write the tests first, see them fail, then write the code.
> Tick `[x]` only when the task is done **and** its tests pass.
> `FSD` = `FSD.md` here. `TDD` = `TDD.md` here. Main docs are in `../../`.
> Test numbers like "tests 17-29" are the cases in TDD 6.2.

**Time guess:** 25 hours in total (same as M3 in `../../TASKS.md`).

| Section | What | Hours |
|---|---|---|
| A | Before we start, and `_compat.py` | 4 |
| B | `FastAuthz` object | 1.5 |
| C | Dependencies | 8 |
| D | Errors and `install()` | 3 |
| E | API docs (OpenAPI) | 3 |
| F | Decision log | 2.5 |
| G | Integration tests and CI matrix | 2 |
| H | Release `0.1.0` | 1 |
| | **Total** | **25** |

---

## A. Before we start, and `_compat.py` (4 h)

- [ ] **M3-T1** Check what M1 and M2 left for us (TDD 1.2). (0.5 h)
  - `fold`, `to_sql`, `_condition(..., with_scope=False)`, `_scope_expr`, `relationship_target`.
  - If one is missing: add it first, with tests. Write it in the PR.
- [ ] **M3-T2** Test helpers for M3: SQLite sync and async engines, PostgreSQL from `FASTAUTHZ_TEST_PG_URL`, the `postgres` marker, the query counter. (TDD 6.1) (1 h)
  - Add `aiosqlite`, `asyncpg`, `psycopg[binary]`, `sqlmodel` to the dev group. (TDD 7.2)
- [ ] **M3-T3** `_compat.iter_routes`, `iter_websocket_routes`, `route_path_params`. Tests first: nested routers, prefixes, Mount of another app, no duplicates. (TDD 3.1.1, 3.1.3, 6.4) (1 h)
  - Use what the M0 spike found about the 0.137 route tree.
- [ ] **M3-T4** `_compat.route_dependencies`. Tests first: route, router, `Annotated`, nested, `Security`. (TDD 3.1.2, 6.4) (0.5 h)
- [ ] **M3-T5** `_compat.is_async_session`, `is_sync_session`, `column_python_type`, `validation_error_schemas`. Contract tests for these and for `is_loaded`, `relationship_*`. (TDD 3.1.4-3.1.6, 6.4) (1 h)

## B. `FastAuthz` object (1.5 h)

- [ ] **M3-T6** Add the M3 constants to `config.py`. (TDD 4) (0.25 h)
- [ ] **M3-T7** `Denied` gets `status_code` (default 403). Tests first. (TDD 3.13) (0.25 h)
- [ ] **M3-T8** `FastAuthz.__init__`: checks its inputs, freezes the policy, finds sync or async session. Tests 1-3. (FSD M3-F11.1, TDD 3.2, 3.3.4) (1 h)

## C. Dependencies (8 h)

- [ ] **M3-T9** Shared parts: `_check_target`, `_with_signature`, `_param`, `PermissionInfo`. Tests 4-6, 9-11. (FSD M3-F11.8, TDD 3.3) (1.5 h)
- [ ] **M3-T10** `authz.query(Model, action)` and `authz.filter(Model, action)`. Tests 12-16. (FSD M3-F11.2, M3-F11.2b, TDD 3.4, 3.5) (1.5 h)
- [ ] **M3-T11** `authz.load()` factory part: id column, id type, path name rules (`_resolve_param`). Tests 7, 8, 26 (factory part). (FSD M3-F11.3, TDD 3.6.1-3.6.3) (1 h)
- [ ] **M3-T12** `authz.load()` request part, async and sync: id to the right type (422), one query, 404. Tests 17-20, 25, 27-29. (TDD 3.6.4-3.6.6, 3.6.8) (1.5 h)
- [ ] **M3-T13** `deny_status=403`: the extra `exists()` query with the scope, only on deny. Tests 21-24. (FSD M3-F12, TDD 3.6.7) (1 h)
- [ ] **M3-T14** `authz.require(action, Model)`: no scope, `resource=None`. Tests 30-34. (FSD M3-F11.4, TDD 3.7, 5) (1 h)
- [ ] **M3-T15** `Guard` and `authz.guard`: `can`, `check`, `filter`. Tests 35-38. (FSD M3-F11.5, TDD 3.8) (0.5 h)

## D. Errors and `install()` (3 h)

- [ ] **M3-T16** The `Denied` handler: problem-details JSON, fixed texts for 403 and 404, `application/problem+json`. Tests 39, 40, 44. (FSD M3-F12, TDD 3.9) (1 h)
- [ ] **M3-T17** `install(app)`: add the handler only if missing, do nothing the second time, refuse a second `FastAuthz`. Tests 41-43. (TDD 3.10.1) (0.75 h)
- [ ] **M3-T18** Route checks at start: `load()` path name, other `FastAuthz`, WebSocket routes. All problems in one error. Tests 26, 45. (TDD 3.10.2, 3.10.3) (0.75 h)
- [ ] **M3-T19** Start warnings for `require()` routes that can never pass, and for deny rules that read `R`. Tests 31, 32. (TDD 3.10.4) (0.5 h)

## E. API docs (OpenAPI) (3 h)

- [ ] **M3-T20** Wrap `app.openapi` once, with cache. Test 52. (FSD M3-F13, TDD 3.11.1) (0.75 h)
- [ ] **M3-T21** Add responses per kind, `x-fastauthz`, the "**Permission:**" line, the `load()` path parameter, `FastAuthzProblem`. Tests 46-51. (TDD 3.11.2-3.11.5) (1.5 h)
- [ ] **M3-T22** OpenAPI snapshot test (only our parts). Test 60. (TDD 6.2) (0.75 h)

## F. Decision log (2.5 h)

- [ ] **M3-T23** `emit_decision`, `decision_level`, `is_listened` in `decision.py`. Logger `fastauthz.decisions`, `LOG_DENIES_AT_INFO`. Test 55. (FSD M3-F14, TDD 3.12.2) (1 h)
- [ ] **M3-T24** Make a decision in `query`, `filter`, `load`, `require`, `Guard`. Ids only. `on_decision` crash is logged and ignored. Tests 53, 54, 58. (TDD 3.12.1) (1 h)
- [ ] **M3-T25** `matched_rules` / `denied_by` for `Guard` checks, built only if someone listens. Tests 56, 57. (TDD 3.12.3, 3.14) (0.5 h)

## G. Integration tests and CI matrix (2 h)

- [ ] **M3-T26** Run the HTTP tests on all 4 stacks (sync/async x SQLite/PostgreSQL). One SQLModel test (test 59). Typing tests (TDD 6.3). (TDD 6.1, 6.2) (1 h)
- [ ] **M3-T27** CI: 16-job matrix, PostgreSQL 18 service, `lowest-direct` and `highest`, SQLAlchemy 2.0 and 2.1 constraint files. (TDD 7.1) (1 h)

## H. Release `0.1.0` (1 h)

- [ ] **M3-T28** Update the main docs for open questions Q1-Q9: main TDD 10.1, 11, 12.4-12.8, and `QUICK_REFERENCE.md` if needed. (TDD 10.2) (0.25 h)
- [ ] **M3-T29** `release.yml`: build, check the wheel, publish with Trusted Publishing and attestations. (TDD 7.3) (0.5 h)
- [ ] **M3-T30** Release steps below. (0.25 h)

---

## Done when

- [ ] All boxes above are ticked.
- [ ] `uv run pytest`, `uv run pytest -m postgres`, `uv run ruff check .`, `uv run pyright` pass. The output is in the PR.
- [ ] The full CI matrix is green.
- [ ] Coverage: 95% or more for the package. 100% for the core modules.
- [ ] `load()` makes 1 query when allowed. `query()` adds 0 queries. Tests prove it.
- [ ] No error body has rule names or values. Tests prove it.
- [ ] Main docs and these docs match the code.
- [ ] `0.1.0` is on PyPI.

## Release steps for `0.1.0`

1. On PyPI, add a "pending trusted publisher" for `fastauthz`: this repo, workflow `release.yml`, environment `pypi`.
2. In GitHub, make the environment `pypi` (require approval by the maintainer).
3. Set `__version__ = "0.1.0"` in `src/fastauthz/_version.py`.
4. Add a `## [0.1.0] - <date>` section to `CHANGELOG.md`. List what M1-M3 added.
5. Change the README status from "design stage" to "alpha (0.1.0)". Show the install line.
6. Merge to `main`. Wait for CI to be green.
7. Make the tag `v0.1.0` on `main` and push it.
8. Approve the `pypi` environment. Watch the release job.
9. Check: `pip install "fastauthz[standard]==0.1.0"` in a clean venv, then import `FastAuthz`.
10. Make a GitHub release with short notes. Ask for early feedback (Discussions).
11. Tick the M3 boxes in `../../TASKS.md`. Add a line to `../../timeline/timeline.md`.

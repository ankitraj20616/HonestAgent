# M0 - Tasks
## Setup and quick tries (spikes)

> Very simple English. One small task per line. Each task is 2 hours or less.
> Tick `[x]` only when the task is done **and** its checks pass.
> Tests come before code. Each task points to `FSD.md` (what) and `TDD.md` (how) in this folder.
> Main plan: `../../TASKS.md` (M0 = 10 hours).

| Part | Hours |
|---|---|
| A. Project setup | 3.0 |
| B. Try 1: rule -> SQL | 2.0 |
| C. Try 2: same answer | 2.0 |
| D. Try 3: FastAPI | 2.0 |
| E. Report, floor versions, clean up | 1.0 |
| **Total** | **10.0** |

---

## A. Project setup (3 h)

- [ ] **M0-T1** Make `pyproject.toml`: name, `src/` layout, hatchling, zero dependencies, extras `sqlalchemy`, `fastapi`, `standard`. (FSD M0-F1.1, M0-F1.4, M0-F1.5; TDD 7.1) - 20 min
- [ ] **M0-T2** Add the `dev` dependency group with lower bounds only. Run `uv lock` and `uv sync --all-extras`. Commit `uv.lock` and `.python-version` (3.11). (TDD 7.2) - 15 min
- [ ] **M0-T3** Add ruff, pyright, pytest and coverage settings to `pyproject.toml`. Include the `postgres` marker and the banned imports for the core. (FSD M0-F2.1-F2.3; TDD 7.3, 7.4) - 25 min
- [ ] **M0-T4** Write the tests first: `tests/unit/test_package.py` (U1-U3) and `tests/unit/test_imports.py` (U4-U6). Run them. They must fail (no package yet). (FSD M0-F2.3; TDD 6.2) - 20 min
- [ ] **M0-T5** Add `src/fastauthz/__init__.py`, `_version.py` (`0.0.0`), `py.typed`, `config.py` (docstring only). Run the tests. They must pass. (FSD M0-F1.1-F1.3, M0-F1.6; TDD 3.1-3.4) - 15 min
- [ ] **M0-T6** Write `tests/conftest.py` (anyio backend, `postgres_url` that fails when the variable is missing) and the DB smoke tests I1-I5 in `tests/integration/test_db_smoke.py`. (FSD M0-F2.5; TDD 3.5, 6.2) - 25 min
- [ ] **M0-T7** Start local PostgreSQL in Docker. Run `uv run pytest` and `uv run pytest -m postgres`. Both pass. Add the short "local PostgreSQL" section to `CONTRIBUTING.md`. (TDD 7.8) - 15 min
- [ ] **M0-T8** Add `.pre-commit-config.yaml` (file checks + ruff). Run `uv run pre-commit install` and `uv run pre-commit run --all-files`. (FSD M0-F2.6; TDD 7.5) - 15 min
- [ ] **M0-T9** Add `.github/workflows/ci.yml`: a lint job, and a test job on Python 3.11 and 3.15 with a PostgreSQL service. Use `allow-prereleases: true`. (FSD M0-F2.4, M0-F2.5; TDD 7.6) - 25 min
- [ ] **M0-T10** Push a branch. See CI go green. If 3.15 cannot install a package, follow TDD 7.7 (issue + `continue-on-error` for 3.15 only). (FSD M0-F2.4; TDD 7.7) - 15 min

## B. Try 1: rule -> SQL (2 h)

- [ ] **M0-T11** Make `spikes/` with `README.md` ("throw-away, delete at end of M0"), `schema.py` (Item, Group, Tag, Post) and `conftest.py` with 4 backends: SQLite sync, SQLite async, PostgreSQL sync, PostgreSQL async. (TDD 2.2, 3.6, 3.8.1) - 30 min
- [ ] **M0-T12** Write the spike tests S1.1-S1.9 first in `spikes/test_spike1_sql.py`. (FSD M0-F3; TDD 3.8.2) - 25 min
- [ ] **M0-T13** Write `spikes/mini_expr.py`: the tiny nodes, `bind()` and `to_sql()` with `has()` and `any()`. Values only as `bindparam`. (FSD M0-F3.1-F3.7; TDD 3.7.3, 3.7.4) - 40 min
- [ ] **M0-T14** Run on all 4 backends. Write down: pass/fail, SQL text, "no values in SQL text", typed `NULL`, empty `IN`, `IS TRUE`, timing. Rerun on SQLAlchemy 2.0.0 and newest 2.1. (FSD M0-F3.3, M0-F3.4, M0-F3.7; TDD 3.8.3) - 25 min

## C. Try 2: same answer (2 h)

- [ ] **M0-T15** Write the same-answer test first in `spikes/test_spike2_same_answer.py`: 1,000 random rows (with `NULL`s), 10 rules plus their `NOT`, 5 actors (with `None` and missing fields). (FSD M0-F4.1-F4.4; TDD 3.9.1-3.9.3) - 30 min
- [ ] **M0-T16** Add `evaluate()` and `read_path()` to `spikes/mini_expr.py`, with the order of checks from main TDD 6.2 and the lazy-load check. (FSD M0-F4.2; TDD 3.7.1, 3.7.2) - 40 min
- [ ] **M0-T17** Run on SQLite and PostgreSQL. Write down every mismatch and its cause. Look hard at the `NOT` + `NULL`-inside-a-link cases. (FSD M0-F4.5; TDD 3.9.5, 10.2) - 25 min
- [ ] **M0-T18** Small Hypothesis try (200 examples, SAVEPOINT per example). Write down examples per second on both databases. Check the lazy-load facts (`unloaded`, `MissingGreenlet`). (TDD 3.9.4, 3.9.5) - 25 min

## D. Try 3: FastAPI (2 h)

- [ ] **M0-T19** Write the spike tests S3.1-S3.9 first in `spikes/test_spike3_fastapi.py`, with the test app (app routes, router, router in router, mount) and the SQL statement counter. (FSD M0-F5; TDD 3.10.5, 3.10.6) - 30 min
- [ ] **M0-T20** Write `spikes/mini_authz.py`: `load()` with a real signature (`__signature__`), one query, 404 for "missing" and "denied". Try one sync variant too. (FSD M0-F5.1-F5.3; TDD 3.10.1, 3.10.2) - 35 min
- [ ] **M0-T21** Add the OpenAPI wrapper, `iter_routes` and `iter_dependency_calls`. (FSD M0-F5.4, M0-F5.5; TDD 3.10.3, 3.10.4) - 25 min
- [ ] **M0-T22** Run on FastAPI 0.115 and the newest FastAPI. Read `routing.py` of both. Write down the route-tree node types and every internal name used. (FSD M0-F5.5; TDD 3.10.4, 3.10.7) - 30 min

## E. Report, floor versions, clean up (1 h)

- [ ] **M0-T23** Pick the FastAPI floor and the SQLAlchemy floor with the method in TDD 3.11. Write them in `TECH_STACK.md`, `pyproject.toml` and main TDD 15.1. (FSD M0-F6.4; TDD 3.11) - 15 min
- [ ] **M0-T24** Write `core_docs/reports/M0_spikes.md` with the template. (FSD M0-F6.1, M0-F6.2; TDD 3.12) - 20 min
- [ ] **M0-T25** If a try showed a design problem (for example TDD 10.2): change the main TDD (and FSD if needed) and add an ADR in `core_docs/decisions/`. (FSD M0-F6.3; TDD 10.1, 10.2) - 15 min
- [ ] **M0-T26** Delete `spikes/`. Fix the CLAUDE.md wording for `-m postgres` (TDD 10.3). Add a line to `CHANGELOG.md` and to `core_docs/timeline/timeline.md`. Tick the M0 boxes in the main `TASKS.md`. (FSD M0-F6.5) - 10 min

---

## Done when

- [ ] `uv run pytest`, `uv run pytest -m postgres`, `uv run ruff check .`, `uv run ruff format --check .` and `uv run pyright` all pass. Show the output.
- [ ] CI is green on Python 3.11 and 3.15.
- [ ] All 3 tries work, or the design is changed in the main TDD with an ADR.
- [ ] The FastAPI and SQLAlchemy floor versions are written down.
- [ ] `core_docs/reports/M0_spikes.md` is written.
- [ ] `spikes/` is gone.

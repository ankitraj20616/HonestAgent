# M4 - Tools, examples, docs
## Tasks

> Very simple English. One small task per line (2 hours or less).
> Tick a box `[x]` only when the task is done **and** its tests pass.
> Do the tasks in order. Tests first: write the test, see it fail, then write the code.
> Each task points to this folder's `FSD.md` (what) and `TDD.md` (how).
> Main plan: `core_docs/TASKS.md`, milestone M4 (20 hours).

**Needs first:** M1, M2 and M3 are done. `0.1.0` is on PyPI.

| Part | What | Hours |
|---|---|---|
| A | Get ready | 1.5 |
| B | Test helpers | 4 |
| C | Command line tool | 4 |
| D | Example apps | 4 |
| E | Docs website | 4.5 |
| F | Speed | 1.5 |
| G | Finish and release | 0.5 |
| | **Total** | **20** |

---

## A. Get ready (1.5 h)

- [ ] **M4-T1** Check the names M4 needs from M1-M3 (`validate`, `PolicyProblem`, `rules`, `resources`, `FastAuthz.actor`, the "not loaded" log record ...). If a name is different, fix `TDD.md` first. If something is private, add a small public read-only property. (TDD 2.3) - 0.25 h
- [ ] **M4-T2** Add the M4 constants to `config.py`: `CONSISTENCY_MAX_ROWS`, `CONSISTENCY_MAX_REPORTED`, CLI exit codes, CLI formats. (TDD 4) - 0.25 h
- [ ] **M4-T3** Write tests for `describe()` (one per row of the table), then build it in `decision.py`. Same tree -> same text, always. (TDD 3.3, tests 16-18) - 1 h

**Done when:** `describe()` has 100% branch coverage. Checks pass.

---

## B. Test helpers (4 h)

- [ ] **M4-T4** Write tests for `assert_allowed` and `assert_denied`: pass, fail, message text, anonymous user, policy errors. (FSD M4-F15.1, M4-F15.2; TDD 3.2; tests 1-8, 15) - 0.5 h
- [ ] **M4-T5** Build `assert_allowed` and `assert_denied` in `testing.py`. Print the full explanation on failure. Hide helper lines in pytest tracebacks. (TDD 3.1, 3.2) - 0.5 h
- [ ] **M4-T6** Write tests for `PolicyCase` and `check_cases`: all pass, some fail, unknown action in one case, empty list, labels. (FSD M4-F15.3; TDD 3.4; tests 9-14) - 0.5 h
- [ ] **M4-T7** Build `PolicyCase` and `check_cases`. Run every case. One report with every failure. (TDD 3.4) - 0.5 h
- [ ] **M4-T8** Write tests for `assert_filter_consistent` on SQLite: agree, disagree, related data, custom check hint, too many rows, no rows, async session, read-only. (FSD M4-F15.4; TDD 3.5; tests 19-31) - 0.75 h
- [ ] **M4-T9** Build `assert_filter_consistent`: row limit, load the related data the rules need, compare Python and SQL, clear report. Import SQLAlchemy only inside the function. (TDD 3.5.1-3.5.4) - 0.75 h
- [ ] **M4-T10** Write tests for `override_actor` (inside, after, None, nested, after an error). Then build it. (FSD M4-F15.5; TDD 3.6; tests 32-36) - 0.5 h

**Done when:**
- All helpers work. `import fastauthz.testing` works with only the core installed (test 62).
- The `postgres` tests for `assert_filter_consistent` pass with `uv run pytest -m postgres`.

---

## C. Command line tool (4 h)

- [ ] **M4-T11** Write tests for `main()`, loading `module:name`, and `version`: good target, no `:`, missing module, crash on import, not a Policy, current folder on the path. (FSD M4-F16.1, M4-F16.5; TDD 3.7.1-3.7.3, 3.7.9; tests 37-38, 44-48, 60) - 0.5 h
- [ ] **M4-T12** Build `main(argv) -> int`, the parser, `_load_policy`, `version` and `__main__.py`. Exit codes 0 / 1 / 2. (TDD 3.7.1-3.7.3, 3.7.9) - 0.5 h
- [ ] **M4-T13** Write tests for `check`: clean, errors, warnings, `--strict`, notices, JSON, bypass list, sort order. (FSD M4-F16.2; TDD 3.7.5; tests 39-43, 49-50) - 0.5 h
- [ ] **M4-T14** Build `check` with text and JSON output. List rules with `bypass_scope=True`. (TDD 3.7.4, 3.7.5) - 0.75 h
- [ ] **M4-T15** Write tests for `matrix`: markdown snapshot, JSON, CSV, `--output`, "nobody", escaping, same-name models. (FSD M4-F16.3; TDD 3.7.6-3.7.7; tests 51-57) - 0.5 h
- [ ] **M4-T16** Build `matrix` in markdown, JSON and CSV. Always sorted. Every rule shows. (TDD 3.7.6, 3.7.7) - 0.75 h
- [ ] **M4-T17** Write tests for `explain`, then build it: rules with file and line, full condition, unknown resource or action. (FSD M4-F16.4; TDD 3.7.8; tests 58-59) - 0.5 h

**Done when:**
- `uv run fastauthz check`, `matrix`, `explain`, `version` and `python -m fastauthz` work (tests 61-63).
- The CLI works with only the core installed, for plain-class policies (test 62).

---

## D. Example apps (4 h)

- [ ] **M4-T18** Make the shared parts: `examples/__init__.py`, `examples/README.md` (fake login warning), `tests/examples/conftest.py` (SQLite + PostgreSQL), the snapshot helper. Add the CI job that runs `fastauthz check --strict` on each example. (TDD 3.8.0, 3.8.4, 7.2) - 0.5 h
- [ ] **M4-T19** Build `examples/blog` (async): models, policy, routes, seed, README. Write its 16 tests first. (FSD M4-F17.1; TDD 3.8.1) - 1 h
- [ ] **M4-T20** Build `examples/saas_multitenant` (sync): models, policy with scope and per-company roles, routes, seed, README. Write its 13 tests first, including the "missing org_id" startup error. (FSD M4-F17.2; TDD 3.8.2) - 1.25 h
- [ ] **M4-T21** Build `examples/hospital` (async): models, policy with relationships and the VIP deny rule, routes, seed, README. Write its 11 tests first. (FSD M4-F17.3; TDD 3.8.3) - 1.25 h

**Done when:**
- CI runs the tests of every example, on SQLite and PostgreSQL.
- `fastauthz check --strict` exits `0` on all three policies.
- Matrix and OpenAPI snapshots are committed.

---

## E. Docs website (4.5 h)

- [ ] **M4-T22** First check the state of MkDocs Material and Zensical (TDD 10.1 R1). Then set up `mkdocs.yml` and the page skeleton. Write the docs test (`tests/docs/test_docs_examples.py`) and its own tests. Add the `docs-build` CI job. (FSD M4-F17D.2, M4-F17D.4; TDD 3.9.1, 3.9.4, 7.2) - 1 h
- [ ] **M4-T23** Write Home, Get started (5 minutes) and Concepts. (TDD 3.9.2) - 0.75 h
- [ ] **M4-T24** Write Rules reference (every operator with its SQL, shown with `pycon` blocks), Roles and Relationships. (TDD 3.9.2) - 1 h
- [ ] **M4-T25** Write the FastAPI guide, Testing your policy and Command line pages. (TDD 3.9.2) - 0.75 h
- [ ] **M4-T26** Write Security model, the five Recipes and the FAQ. (TDD 3.9.2) - 0.5 h
- [ ] **M4-T27** Write the fair Comparison page, the API reference page and the Changelog page. Add `docs.yml` to publish on GitHub Pages. Ask the repo owner to set Settings -> Pages -> Source: GitHub Actions. (FSD M4-F17D.3; TDD 3.9.3, 7.3, 10.1 R2) - 0.5 h

**Done when:**
- `uv run mkdocs build --strict` passes.
- Every code block in `docs/` runs in CI.
- The site is live on GitHub Pages.

---

## F. Speed (1.5 h)

- [ ] **M4-T28** Write the benchmark fixtures (`make_policy_50`, `make_policy_500`) and the suites for `can()`, `compile_filter()`, `freeze()` and `explain()`. (FSD M4-N4, M4-N5; TDD 8.1, 8.2) - 0.75 h
- [ ] **M4-T29** Write `benchmarks/targets.py` and `check_targets.py`. Run on a laptop. Write the numbers in `core_docs/reports/M4_benchmarks.md`. If a target is missed, find why and fix it. (TDD 8.3) - 0.25 h
- [ ] **M4-T30** Add the benchmark smoke run to PR CI, and the 20% compare job to the nightly CI. (TDD 7.2, 7.4) - 0.25 h
- [ ] **M4-T31** Check that the query-count tests from M3 exist (`load()` = 1 query, `query()` = 0 extra). If not, add them. (FSD M4-N6; TDD 8.1) - 0.25 h

**Done when:**
- All targets are met on a laptop (report written).
- The nightly benchmark job is green.

---

## G. Finish and release (0.5 h)

- [ ] **M4-T32** Ask one person who does not know the project to protect a list route and a detail route using only the docs. Time it. Fix what confused them. Write the result in `core_docs/reports/M4_benchmarks.md` (section "5-minute test"). (TDD 11) - 0.25 h
- [ ] **M4-T33** Update `CHANGELOG.md`. Tick the boxes in `core_docs/TASKS.md` and here. Add a line to `core_docs/timeline/timeline.md`. Make sure the main TDD, the main FSD and these files match the code. (TDD 11) - 0.25 h

**Release:**
- [ ] Release `0.2.0` from CI with Trusted Publishing.
- [ ] More `0.x` releases come from user feedback.

---

## Done when (whole milestone)

- [ ] All boxes above are ticked.
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .` and `uv run pyright` pass. Show the output.
- [ ] `uv run pytest -m postgres` passes.
- [ ] Coverage: 100% on core modules, 95% or more on the whole package.
- [ ] The docs site is live.
- [ ] A new person can protect a list route and a detail route in 5 minutes, using only the docs.
- [ ] `0.2.0` is on PyPI.

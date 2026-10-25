# M5 - Security review and 1.0
## Tasks

> Very simple English. One small task per line (2 hours or less).
> Tick a box `[x]` when the task is done **and** its tests pass.
> Each task points to this folder's `FSD.md` (what) and `TDD.md` (how).
> Do the sections in order. Do not start "Later" items. Do not add new features.

**Time guess:** 15 hours in total (same as the main `TASKS.md`).

| Section | What | Hours |
|---|---|---|
| A | One test for each risk | 4 |
| B | Mutation testing | 3 |
| C | Nightly job and safe releases | 3 |
| D | Freeze the public API | 1.5 |
| E | Outside review | 2 |
| F | Release 1.0.0 and launch | 1.5 |

---

## A. One test for each risk (4 h) - FSD M5-F1, TDD 3

- [ ] **M5-T1** Make `tests/security/` with `conftest.py`: shared policies from the examples, `make_actor`, SQL statement counter, secret strings, and a guard that blocks network sockets. (TDD 3.1, 5.3) - 0.25 h
- [ ] **M5-T2** Write the index test: every row of main TDD 17.1 has a `test_tmNN_...`. See it fail first. Add a comment above the table in the main TDD: "add new rows at the end". (TDD 3.2) - 0.25 h
- [ ] **M5-T3** Tests for TM01 (list forgets the filter) and TM02 (typos in actions, roles, resources). (TDD 3.3) - 0.5 h
- [ ] **M5-T4** Tests for TM03 (empty values, missing fields, no user). Run every case in Python **and** SQL, on SQLite and PostgreSQL. (TDD 3.3, FSD 4) - 0.75 h
- [ ] **M5-T5** Tests for TM06 (SQL injection): values are bound parameters; no `literal_binds` or `text()` in `src/`. (TDD 3.3) - 0.5 h
- [ ] **M5-T6** Tests for TM04 (`and` / `or` / `not`, chained compares, `in` on a list) and TM05 (missing parentheses). Decide what to do with FA014 and fix the docs in the same PR. (TDD 3.3, 11.10) - 0.5 h
- [ ] **M5-T7** Tests for TM07 (404 hides ids) and TM08 (admin stays inside the tenant; bypass is listed). (TDD 3.3) - 0.5 h
- [ ] **M5-T8** Tests for TM09 (custom check crashes, non-bool results), TM10 (no lazy loading), TM11 (depth limit), TM12 (no leaks in errors), TM13 (ids only in logs), TM14 (frozen policy, many threads). (TDD 3.3, 11.4) - 0.75 h

## B. Mutation testing (3 h) - FSD M5-F2, TDD 4

- [ ] **M5-T9** Add `[tool.mutmut]` to `pyproject.toml` and the `mutation` Hypothesis profile. Run mutmut once on `truth.py`. (TDD 4.2, 4.3) - 0.5 h
- [ ] **M5-T10** Write `scripts/mutation_gate.py` (score per file and overall, gate 0.90) and `tests/mutation_equivalent.toml`. (TDD 4.4, 4.5) - 0.5 h
- [ ] **M5-T11** Kill the survivors in `truth.py` and `evaluate.py`. Add tests or Hypothesis `@example`s. Write down equivalent ones with a reason. (TDD 4.5) - 1 h
- [ ] **M5-T12** Kill the survivors in `sql.py`. Write `core_docs/reports/M5_mutation.md` with the scores. (TDD 4.4, 4.5) - 1 h

## C. Nightly job and safe releases (3 h) - FSD M5-F3, M5-F4, TDD 5, 6

- [ ] **M5-T13** Pin every GitHub Action by SHA in all workflows. Add `test_workflows_pinned.py`. (TDD 6.1) - 0.5 h
- [ ] **M5-T14** Add `.github/dependabot.yml` (Actions + uv, lock file only). Turn on Dependabot alerts. (TDD 6.2) - 0.25 h
- [ ] **M5-T15** Add `.github/workflows/nightly.yml`: full matrix, 3.14t, FastAPI pre-releases, SQLAlchemy main, PostgreSQL 14 and 18, long Hypothesis, mutation, benchmarks, issue on failure. Run it once by hand. (TDD 5) - 1 h
- [ ] **M5-T16** Add `.github/workflows/scorecard.yml`. Put the Scorecard badge in the README. (TDD 6.3) - 0.25 h
- [ ] **M5-T17** Check the GitHub owner rename is done. Check Trusted Publishing on PyPI and TestPyPI. Set up the `pypi` / `testpypi` environments, the tag ruleset and the `main` ruleset. (TDD 6.4, 11.12) - 0.25 h
- [ ] **M5-T18** Write `release.yml`, `scripts/check_version_tag.py` and `scripts/changelog_section.py`. Decide on GitHub build attestations. Try it with a test tag on TestPyPI. (TDD 6.5) - 0.75 h

## D. Freeze the public API (1.5 h) - FSD M5-F5, TDD 7

- [ ] **M5-T19** Confirm the public names list. Set `__all__` in every module. Mark internal modules in their first docstring line. Fix the main TDD 4 if the list changed. (TDD 7.1) - 0.5 h
- [ ] **M5-T20** Write `tests/unit/test_public_api.py` and create `tests/snapshots/public_api.txt`. Add the "snapshot change needs a CHANGELOG entry" rule to CONTRIBUTING. (TDD 7.2) - 0.5 h
- [ ] **M5-T21** Finish `tests/typing/test_public_types.py`. Add `FastAuthzDeprecationWarning` and `warn_deprecated()` to `errors.py`, with tests. Add the warning to main TDD 11. (TDD 7.3, 7.4) - 0.5 h

## E. Outside review (2 h) - FSD M5-F6, TDD 8

- [ ] **M5-T22** Release `1.0.0rc1` (tag `v1.0.0rc1`). Write the brief, checklist and "try to break it" list in `core_docs/reports/M5_review.md`. Ask 2-3 reviewers. (TDD 8.1-8.4, 9.4) - 0.5 h
- [ ] **M5-T23** Fix the findings. Each real bug gets a test (and a Hypothesis `@example` if the engines disagreed). Update the report table. If a fix takes more than 2 hours, make it its own task. (TDD 8.5, 11.1-11.3) - 1.5 h

## F. Release 1.0.0 and launch (1.5 h) - FSD M5-F7, TDD 9, 10

- [ ] **M5-T24** Walk the main TDD and FSD against the code and fix every difference. Finish `CHANGELOG.md`, `SECURITY.md` (supported versions) and `README.md` (status). (TDD 9.1-9.3) - 0.5 h
- [ ] **M5-T25** Set `_version.py` to `1.0.0`. Tag `v1.0.0`. Approve the PyPI step. Check attestations. Write the GitHub release notes. (TDD 9.2, 9.4, 9.5) - 0.5 h
- [ ] **M5-T26** Write and post the launch posts, one a day: FastAPI Discussions, r/FastAPI, r/Python, Show HN. Answer comments for 3 days. (TDD 10) - 0.5 h

---

## Done when

- [ ] All boxes above are ticked.
- [ ] `uv run pytest`, `uv run pytest -m postgres`, `uv run ruff check .` and `uv run pyright` pass. The output is shown in the PR.
- [ ] Mutation score is 90% or more for `truth.py`, `evaluate.py` and `sql.py`.
- [ ] The nightly job was green 3 nights in a row.
- [ ] `1.0.0` is on PyPI, built by CI, with attestations.
- [ ] No open high-severity bugs.
- [ ] Docs, FSD and TDD match the code.
- [ ] Tick the M5 boxes in the main `core_docs/TASKS.md` and add a line to `core_docs/timeline/timeline.md`.

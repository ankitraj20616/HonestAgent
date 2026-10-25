# M2 - Tasks
## SQL filters, scope, relationships, custom checks (30 h)

> Very simple English. One small task per line (2 hours or less).
> Tests first: write the test, see it fail, then write the code.
> Tick `[x]` only when the task is done **and** its tests pass.
> IDs point to `FSD.md` (`M2-F...`) and `TDD.md` (`M2-TDD ...`) in this folder.
> Do the sections in order. Do not start "Later" items.

| Section | What | Hours |
|---|---|---|
| A | Test setup: PostgreSQL, drivers, markers, CI | 2 |
| B | Model info from SQLAlchemy (`_compat`) | 2 |
| C | `fold()` | 4 |
| D | `to_sql()`, `compile_filter()`, `policy.filter()` | 4 |
| E | Relationships in SQL | 3 |
| F | Startup checks with SQLAlchemy | 2.5 |
| G | Scope | 2.5 |
| H | Custom checks | 1.5 |
| I | Safety tests and SQL snapshots | 1.5 |
| J | Same-answer property tests | 6 |
| K | Docs and wrap-up | 1 |
| | **Total** | **30** |

---

## A. Test setup (2 h)
- [ ] M2-T1 Add dev deps `psycopg[binary]`, `asyncpg`, `aiosqlite`. Add the `postgres` marker. (M2-TDD 7.1, 7.2)
- [ ] M2-T2 Write `tests/conftest.py`: `engine` and `async_engine` fixtures for SQLite and PostgreSQL. Skip PostgreSQL unless `-m postgres`. (M2-TDD 6.2)
- [ ] M2-T3 Add `docker-compose.test.yml` and the PostgreSQL CI job. See it green with one tiny DB test. (M2-TDD 7.3, 7.4)

## B. Model info (2 h)
- [ ] M2-T4 Tests for `_compat.model_info()`: columns, nullable, primary key, python type, Boolean flag, relations, direction, `uselist`. (M2-TDD 3.2)
- [ ] M2-T5 Write `ColumnInfo`, `RelationInfo`, `ModelInfo`, `is_mapped`, `model_info`, `relationship_target`, `relationship_direction`, `column_python_type`, `configure_mappers`. (M2-TDD 3.2)
- [ ] M2-T6 Read model info once at `freeze()` and keep it in the policy. (M2-TDD 3.2, 8)

## C. fold (4 h)
- [ ] M2-T7 Add `simplify()` to `expr.py` with every row of the table. Tests first. (M2-TDD 3.4.5)
- [ ] M2-T8 Tests for fold cases 1-17 (actor values, `who`, roles, missing, `None`, dict actor, flip). (M2-TDD 6.3)
- [ ] M2-T9 Write `fold()` for `Compare` and `In`: normalize sides, step 1, empty lists (Const only for a plain column; dotted paths keep the `In`, NO_ROW first), bad option types. (M2-TDD 3.4.2, 3.4.3, M2-F7.4)
- [ ] M2-T10 Fold for `And`, `Or`, `Not`, `Related`, actor-only sub-trees ("rule zero": use `evaluate`). Tests 18-24, 27-30. (M2-TDD 3.4.1)

## D. SQL output (4 h)
- [ ] M2-T11 Tests for `to_sql` cases 1-11 on both dialects. (M2-TDD 6.4)
- [ ] M2-T12 Write `to_sql()` for `Const`, `Compare`, `In`, `Is`, `And`, `Or`, `Not`. Typed bound parameters. Typed `NULL` for unknown. (M2-TDD 3.5, M2-F7.3)
- [ ] M2-T13 Write `compile_filter()` and `policy.filter()` with all its errors. Lazy SQLAlchemy import. (M2-TDD 3.3.5, 3.5.1, M2-F7.1, M2-F7.7, M2-F7.8)
- [ ] M2-T14 Run filters on real DBs with `Session` and `AsyncSession`, SQLite and PostgreSQL. (M2-TDD 6.4, M2-F7.5, M2-F7.6)
- [ ] M2-T15 Extend `test_imports.py`: core works without SQLAlchemy; `filter()` gives the install hint. (M2-TDD 6.5, M2-F7.8)

## E. Relationships (3 h)
- [ ] M2-T16 Add the build check: at most one relationship path per comparison. (M2-TDD 3.6.2, Q4)
- [ ] M2-T17 Tests 12-15: dotted paths become nested `has()`, positive and under `NOT`. (M2-TDD 6.4, M2-F9.1)
- [ ] M2-T18 Write `_exists()` with polarity, and dotted-path rendering. (M2-TDD 3.6.1, 3.6.2, M2-F9.4, M2-F9.5)
- [ ] M2-T19 Tests 16-19, then write `Related` -> `any()` / `has()`, incl. many-to-many. (M2-TDD 3.6.3, M2-F9.2, M2-F9.3)

## F. Startup checks (2.5 h)
- [ ] M2-T20 FA003 tests (yes / no): unknown column, path ends on a link, `.any()` on a single link, `.is_(True)` on a non-bool column. Then the code. (M2-TDD 3.7, Q6, Q7)
- [ ] M2-T21 FA004 and FA005 tests (yes / no), then the code. (M2-TDD 3.6.4, 3.7, M2-F9.6, M2-F9.7)
- [ ] M2-T22 All problems in one `PolicyError`. Plain classes skip these checks. `configure_mappers` error is clear. (M2-TDD 3.7)

## G. Scope (2.5 h)
- [ ] M2-T23 Tests: `INHERIT`, own scope, `scope=None`, deny not scoped, `bypass_scope`. (M2-TDD 6.5, M2-F8.1, M2-F8.2, M2-F8.4, M2-F8.5)
- [ ] M2-T24 Write `INHERIT`, `ResourceSpec.scope_origin` / `source`, and `_condition(..., with_scope=)`. (M2-TDD 3.3.1, 3.3.3)
- [ ] M2-T25 FA008, FA012, FA016 tests (yes / no), then the code. (M2-TDD 3.8, M2-F8.3, M2-F8.6, M2-F8.7)

## H. Custom checks (1.5 h)
- [ ] M2-T26 Tests: `check=` only, `check=` + `sql=`, `sql=` alone is a `TypeError`, deny with `check=` only. (M2-TDD 6.5, M2-F10)
- [ ] M2-T27 Write the filterable table, `_require_filterable`, FA013, `SqlFragment`, `_call_sql` (crash -> unknown + log). (M2-TDD 3.3.4, 3.4.4, 3.9)

## I. Safety and snapshots (1.5 h)
- [ ] M2-T28 Sentinel test: no value appears in SQL text, for every operator, both dialects. Injection string test on the DB. (M2-TDD 6.5, 9.1)
- [ ] M2-T29 AST test: `sql.py` never uses `text`, `literal_column`, `literal_binds` or string-built SQL. (M2-TDD 6.5)
- [ ] M2-T30 Snapshot tests for the three example policies, three actors, both dialects. (M2-TDD 6.5)

## J. Same-answer property tests (6 h)
- [ ] M2-T31 Write the test schema `Item`, `Group`, `Tag` with `C` collation and `lazy="raise"`. (M2-TDD 6.6.1)
- [ ] M2-T32 Write value pools and the expression strategy (all atoms, depth up to 4). (M2-TDD 6.6.2, 6.6.3)
- [ ] M2-T33 Write the policy strategy, the row strategy and the actor strategy (None, missing fields, dicts). (M2-TDD 6.6.3, 6.6.4)
- [ ] M2-T34 Write `test_allowed_sets_equal`: one transaction per example, eager load, rollback, clear diff message. (M2-TDD 6.6.5, M2-F2.4.2)
- [ ] M2-T35 Write `test_truth_values_equal` (no links, exact three values). Add the Hypothesis profiles. (M2-TDD 6.6.5, 6.6.6)
- [ ] M2-T36 Add the 3 seed regressions as `@example`. Run 500 on SQLite and 2,000 on PostgreSQL. Turn every bug found into an `@example`. (M2-TDD 6.6.5, M2-F2.4.3, M2-F2.4.4)

## K. Docs and wrap-up (1 h)
- [ ] M2-T37 Decide Q1-Q13. Write the accepted answers into the main TDD, FSD and `QUICK_REFERENCE.md`. (M2-TDD 10)
- [ ] M2-T38 Write `core_docs/reports/M2_sql.md`: `compile_filter` time, bugs found. Tick M2 in `core_docs/TASKS.md`. Add a line to `core_docs/timeline/timeline.md`. (M2-TDD 8, 11)

---

## Done when
- All boxes above are ticked.
- `uv run pytest`, `uv run pytest -m postgres`, `uv run ruff check .`, `uv run ruff format --check .` and `uv run pyright` pass. The output is shown.
- The property test passes 500 cases on SQLite and 2,000 cases on PostgreSQL.
- `sql.py` has 100% branch coverage.
- No value ever appears as text in the SQL.
- Main docs match the code.

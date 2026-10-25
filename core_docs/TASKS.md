# Tasks
## fastauthz v1.0 - the build plan

> Very simple English. One small task per line.
> Tick a box `[x]` when the task is done **and** its tests pass.
> Each task points to the FSD (what) and the TDD (how). Read them before you start the task.
> Do the milestones in order. Do not start "Later" items.

**Time guess:** about 125 hours in total. At about 10 hours a week, that is about 3 months.

| Milestone | What we get | Hours |
|---|---|---|
| M0 | Project set up. Risky parts tried first. | 10 |
| M1 | The core: rules, safe answers, roles, checks, explain. | 25 |
| M2 | SQL filters, scope, relationships, custom checks. | 30 |
| M3 | FastAPI: dependencies, errors, API docs, decision log. | 25 |
| M4 | Test helpers, CLI, examples, docs website. | 20 |
| M5 | Security review and the 1.0 release. | 15 |

---

## M0 - Setup and quick tries (10 h)

**Goal:** a clean project that runs checks in CI. Prove the 3 risky ideas work before building them for real.

### Project setup
- [ ] Make `pyproject.toml` with `uv`. Name `fastauthz`. `src/` layout. (TDD 18)
- [ ] Add empty package files: `src/fastauthz/__init__.py`, `_version.py`, `py.typed`, `config.py`. (TDD 3)
- [ ] Add dev tools: pytest, hypothesis, coverage, ruff, pyright, anyio, httpx. (TECH_STACK)
- [ ] Set ruff and pyright (strict) in `pyproject.toml`.
- [ ] Add `pre-commit` with ruff and basic file checks.
- [ ] Add GitHub Actions: lint + type check + tests on Python 3.11 and 3.15. (TDD 15.2)
- [ ] Add one test that just imports the package. See CI go green.

### Quick tries (spikes)
Write each try in `spikes/` (deleted at the end of M0). Write what you learn in `core_docs/reports/M0_spikes.md`.

- [ ] **Try 1: rule -> SQL.** Build a tiny tree (`R.owner_id == A.id`) and turn it into a SQLAlchemy `WHERE`.
  - Run it on SQLite and PostgreSQL.
  - Run it with a normal session and an async session.
  - Try one `has()` and one `any()` relationship.
- [ ] **Try 2: same answer.** For the tiny tree, check in Python and in SQL on 1,000 random rows (with `NULL`s). Both must give the same rows.
- [ ] **Try 3: FastAPI.** Make a dependency `authz.load(Post, "edit")`.
  - It must load and check in one query.
  - Add the permission to the OpenAPI docs.
  - Test it on the oldest FastAPI we want (0.115) and the newest. Find how to walk routes on both (the 0.137 route tree).
- [ ] Choose the lowest FastAPI version we support. Write it in `TECH_STACK.md`.

**Done when:**
- CI is green.
- All 3 tries work, or the design is changed in the TDD with an ADR in `decisions/`.
- `reports/M0_spikes.md` is written.

---

## M1 - The core (25 h)

**Goal:** rules work in plain Python, with no database and no FastAPI.

### Expression tree (FSD F1, TDD 5)
- [ ] `R` and `A` builders. `R.a.b` makes a path. Names starting with `_` give an error.
- [ ] Operators `== != < <= > >=` make `Compare` nodes.
- [ ] `.in_()`, `.not_in()`, `.is_()`, `.is_not()`.
- [ ] `&`, `|`, `~`. Flatten nested `And` / `Or`. `~~a` becomes `a`.
- [ ] `and` / `or` / `not` give a clear error (`__bool__` raises).
- [ ] Only allowed value types. Lists become tuples. Other types give an error.
- [ ] `Literal == Literal` gives an error.
- [ ] `.any()` and `.has()` with a condition or with `key=value` words.
- [ ] Count relationship depth. More than 3 gives an error.

### Safe truth rules (FSD F2, TDD 6)
- [ ] `Truth` enum: `TRUE`, `FALSE`, `UNKNOWN`.
- [ ] Kleene `and` / `or` / `not`. Test the full tables.
- [ ] `MISSING` and `NO_ROW` markers. Test the order of checks (TDD 6.2).
- [ ] `Is` table. Test every cell.
- [ ] Empty `in_()` gives `FALSE`.

### Python evaluator (FSD F4, TDD 7)
- [ ] `evaluate(expr, actor, resource)` with one `match` over node types.
- [ ] Read attributes from objects and from dicts.
- [ ] `any()` and `has()` on Python objects.
- [ ] Do not lazy-load. Not loaded -> `MISSING` + warning. (Needs `_compat.is_loaded`.)
- [ ] Custom check crash -> `UNKNOWN` + warning log.

### Roles (FSD F3, TDD 8.3)
- [ ] `policy.roles({...})`. Expand roles with what they include.
- [ ] Error on role loops.
- [ ] Cache role expansion.

### Policy (FSD F1, F5, TDD 8)
- [ ] `Policy(...)`, `resource(...)`, `allow(...)`, `deny(...)`.
- [ ] `who=AUTHENTICATED` by default for allow. `who=ANYONE` by default for deny.
- [ ] Save the file and line where each rule was written.
- [ ] Auto rule names like `Post.edit#2`.
- [ ] Build one condition per (resource, action): allow part AND NOT deny part. Cache it.
- [ ] `validate()`: every problem code FA001-FA016 that does not need SQLAlchemy. One test that triggers it and one that does not.
- [ ] `freeze()`: show all errors at once. Lock the policy after.
- [ ] `can()`, `check()` (raises `Denied`).

### Explain and errors (FSD F6, TDD 10.2, 11)
- [ ] `Explanation` with one line per rule: result, reason, file and line.
- [ ] Readable `__str__`.
- [ ] All error classes from TDD 11.

### Quality
- [ ] Test: the core imports without SQLAlchemy and FastAPI installed.
- [ ] 100% branch coverage on core modules.

**Done when:**
- All boxes ticked.
- `uv run pytest`, `uv run ruff check .` and `uv run pyright` pass.
- A small script can define a blog policy and call `can()` and `explain()`.

---

## M2 - SQL, scope, relationships (30 h)

**Goal:** the same rules filter real database queries, with the same answers as Python.

### SQL compiler (FSD F7, TDD 9)
- [ ] `fold()`: replace actor values, work out actor-only parts, simplify with Kleene rules. (TDD 9.2)
- [ ] `to_sql()`: every node to SQLAlchemy. (TDD 9.3)
- [ ] Values always as bound parameters. Test: no value appears as text in the SQL.
- [ ] `UNKNOWN` becomes a typed `NULL`.
- [ ] `policy.filter(actor, action, Model)`.
- [ ] SQL snapshot tests for the example policies.

### Relationships (FSD F9, TDD 5.5, 9.4)
- [ ] Dotted paths become nested `has()`.
- [ ] `.any()` / `.has()` become SQLAlchemy `any()` / `has()`.
- [ ] Startup errors: column not found (FA003), dot through a "has many" link (FA004), too deep (FA005).

### Scope (FSD F8, TDD 8.2, 8.4)
- [ ] Policy-wide scope and per-resource scope.
- [ ] Error FA008 when a resource lacks the scope column.
- [ ] `bypass_scope=True` on allow rules.
- [ ] Deny rules are not scoped.

### Custom checks (FSD F10, TDD 5.7)
- [ ] `check=` runs in Python only.
- [ ] `sql=` gives the SQL form.
- [ ] `NotFilterableError` for filter on a rule without SQL.

### Same-answer proof (FSD F2.4, TDD 14.3)
- [ ] Hypothesis strategy for random rules on the test schema.
- [ ] Hypothesis strategy for random rows (with `NULL`s) and random actors (with `None` and missing fields).
- [ ] The property test: Python answer == SQL answer. On SQLite.
- [ ] Same test on PostgreSQL (marked `postgres`). Add PostgreSQL to CI.
- [ ] Every bug found becomes a fixed `@example`.

**Done when:**
- All boxes ticked. All checks pass.
- The property test passes 2,000 examples on PostgreSQL.

---

## M3 - FastAPI (25 h)

**Goal:** a FastAPI app gets safe routes with a few lines.

### Setup (FSD F11, TDD 12.1)
- [ ] `FastAuthz(policy, actor=..., session=..., deny_status=404, on_decision=None)`. It freezes the policy.
- [ ] `_compat.py`: `iter_routes`, `route_dependencies`, `is_async_session`, `is_loaded`, `relationship_target`, `column_python_type`. (TDD 12.7)
- [ ] Contract tests for `_compat.py` on the FastAPI and SQLAlchemy versions in the CI matrix.

### Dependencies (FSD F11, TDD 12.2-12.4, 12.8)
- [ ] `authz.query(Model, action)` returns a filtered `select`.
- [ ] `authz.filter(Model, action)` returns the condition.
- [ ] `authz.load(Model, action)`: id from the URL, one query, 404 (or 403 with one extra query on deny only).
- [ ] `authz.require(action, Model)`: actor-only rules.
- [ ] `authz.guard`: helper with `can`, `check`, `filter`.
- [ ] Sync and async versions picked at start.
- [ ] Wrong action or resource -> error when the route is defined.

### Errors (FSD F12, TDD 12.5)
- [ ] `authz.install(app)` adds the `Denied` handler.
- [ ] Problem-details JSON body. No rule details in it.
- [ ] Do not replace a handler the app already has.

### API docs (FSD F13, TDD 12.6)
- [ ] Add 403 / 404 responses, `x-fastauthz`, and a "Permission:" line to each guarded route.
- [ ] Check the `load()` URL parameter name at start.
- [ ] OpenAPI snapshot test.

### Decision log (FSD F14, TDD 10.1)
- [ ] `Decision` record for check, filter, load and require.
- [ ] `on_decision` callback; its crashes are logged and ignored.
- [ ] Logger `fastauthz.decisions`.

### Integration tests (TDD 14.4)
- [ ] Full HTTP tests with `httpx.AsyncClient` on SQLite and PostgreSQL.
- [ ] One test with SQLModel models.

**Release:** publish `0.1.0` to PyPI (pre-release) to get early feedback. Use Trusted Publishing.

**Done when:**
- All boxes ticked. All checks pass on the full CI matrix.
- `0.1.0` is on PyPI.

---

## M4 - Tools, examples, docs (20 h)

**Goal:** people can learn it fast and test their own rules.

### Test helpers (FSD F15, TDD 13.1-13.3)
- [ ] `assert_allowed`, `assert_denied` (print explanation on failure).
- [ ] `PolicyCase` + `check_cases`.
- [ ] `assert_filter_consistent` with a row limit.
- [ ] `override_actor`.

### CLI (FSD F16, TDD 13.4)
- [ ] `fastauthz check` with `--strict` and `--format`. Exit codes 0 / 1 / 2.
- [ ] `fastauthz matrix` in markdown, json, csv. Sorted output.
- [ ] `fastauthz explain`.
- [ ] `fastauthz version`.

### Examples (FSD F17.1)
- [ ] `examples/blog`
- [ ] `examples/saas_multitenant`
- [ ] `examples/hospital`
- [ ] CI runs the tests of every example.

### Docs website (FSD F17.2, TDD 19)
- [ ] MkDocs setup. Publish to GitHub Pages.
- [ ] 5-minute start guide.
- [ ] Concepts, rules reference (with SQL output), roles, relationships, FastAPI guide.
- [ ] Testing guide, CLI page, security model page.
- [ ] Recipes and FAQ.
- [ ] Fair comparison page.
- [ ] API reference from docstrings.
- [ ] CI runs every code block in the docs.

### Speed (FSD N4-N6, TDD 16)
- [ ] Benchmarks in `benchmarks/`. Meet the targets.
- [ ] Nightly job fails on a 20% slowdown.

**Release:** `0.2.0` (and more `0.x` releases from feedback).

**Done when:**
- All boxes ticked. Docs site is live.
- A new person can protect a list route and a detail route in 5 minutes using only the docs.

---

## M5 - Security review and 1.0 (15 h)

**Goal:** a release people can trust in production.

### Security
- [ ] Go through the threat model (TDD 17.1). One test per row where possible.
- [ ] Mutation testing on `truth`, `evaluate`, `sql`: 90% or more killed.
- [ ] Nightly job: full matrix, FastAPI pre-releases, long Hypothesis run.
- [ ] OpenSSF Scorecard action and badge.
- [ ] Pin all GitHub Actions by commit SHA. Turn on Dependabot.
- [ ] Ask 2-3 outside developers to review the design and try to break it. Fix what they find.

### Release
- [ ] Freeze the public API. Mark anything private with `_`.
- [ ] `CHANGELOG.md` complete.
- [ ] Release `1.0.0` from CI with Trusted Publishing and build attestations.
- [ ] GitHub release notes.
- [ ] Short launch post: FastAPI GitHub Discussions (Show and tell), r/FastAPI, r/Python, Hacker News "Show HN". Be honest, no hype.

**Done when:**
- `1.0.0` is on PyPI.
- No open high-severity bugs.
- Docs, FSD and TDD match the code.

---

## Later (do not start)
See FSD section 8 and TDD section 20.

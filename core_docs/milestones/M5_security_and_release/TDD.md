# M5 - Security review and 1.0
## Technical design (how it is built)

**Milestone:** M5 (15 h). **What:** `FSD.md` in this folder. **Steps:** `TASKS.md` in this folder.
**Parent docs:** main TDD (`../../TDD-tech-design-doc.md`) sections 14.5, 15, 17, 18. Main FSD 6 (N1-N14).

> This file adds detail for M5 only. It must never contradict the main TDD. If M5 work needs a
> design change, change the main TDD (and FSD/QUICK_REFERENCE if needed) in the same PR, and
> write an ADR in `core_docs/decisions/` when the truth rules (main TDD 6) are touched.
> M5 adds **no new library features**. It tests, hardens, and releases what M0-M4 built.

---

## 1. Scope

### 1.1 In scope
| Area | Main TDD | This file |
|---|---|---|
| One test (or checked docs note) per threat-model row | 17.1 | section 3 |
| Mutation testing gate on `truth`, `evaluate`, `sql` | 14.5 | section 4 |
| Nightly CI: full matrix, pre-releases, SQLAlchemy main, long Hypothesis, mutation, benchmarks | 15.2, 16.2 | section 5 |
| Supply chain: SHA pins, Dependabot, Scorecard, Trusted Publishing, PEP 740 | 17.2 | section 6 |
| Public API freeze, snapshot, typing tests, deprecation policy | 15.3, 18 | section 7 |
| External design review | 17 | section 8 |
| 1.0.0 release checklist | 15.3, 18 | section 9 |
| Launch posts | (TASKS M5) | section 10 |

### 1.2 Out of scope
- Any feature in main TDD 20 ("Later").
- New problem codes (FA0xx). If the review finds a need for one, follow `core_docs/quick-prompts.md`
  "Add a startup problem code" and update TDD 8.5, FSD F5, QUICK_REFERENCE in the same PR.
- A paid audit.

### 1.3 Preconditions (from earlier milestones)
- M2: Hypothesis differential test (`tests/property/`) with profiles for 500 / 2000 / 20000 examples.
- M3: `0.1.0` was published with Trusted Publishing (so the PyPI project and its trusted publisher exist).
- M4: example apps (`examples/blog`, `examples/saas_multitenant`, `examples/hospital`), CLI,
  docs site with a "Security model" page, benchmarks in `benchmarks/`.

---

## 2. Files added or changed

```
.github/
  workflows/
    ci.yml                    # changed: all `uses:` pinned by SHA; adds tests/security to the run
    nightly.yml               # NEW (section 5)
    release.yml               # NEW or replaces the M3 publish workflow (section 6.5)
    scorecard.yml             # NEW (section 6.3)
  dependabot.yml              # NEW (section 6.2)
scripts/                      # NEW, dev-only, not in the wheel
  mutation_gate.py            # reads mutmut stats, fails under the gate (section 4.4)
  changelog_section.py        # prints one version's CHANGELOG section for release notes (section 9.3)
  check_version_tag.py        # tag == fastauthz.__version__ (section 6.5)
tests/
  security/                   # NEW
    __init__.py
    conftest.py               # shared policies, models, actors, SQL statement counter
    test_threat_model.py      # TM01-TM14 (section 3)
    test_threat_model_index.py# every TDD 17.1 row has a test (section 3.2)
    test_workflows_pinned.py  # every `uses:` is SHA-pinned (section 6.1)
    test_static_sql_safety.py # no literal_binds / text() in src (TM06)
  unit/
    test_public_api.py        # NEW: public API snapshot (section 7.2)
  snapshots/
    public_api.txt            # NEW: the snapshot file
  typing/
    test_public_types.py      # extended: assert_type for every public entry point (section 7.3)
  mutation_equivalent.toml    # NEW: reviewed equivalent mutants (section 4.5)
pyproject.toml                # changed: [tool.mutmut], classifiers, version source check
src/fastauthz/
  __init__.py                 # changed: final __all__
  errors.py                   # changed: FastAuthzDeprecationWarning + warn_deprecated()
  _version.py                 # "1.0.0"
CHANGELOG.md                  # complete for 1.0.0
SECURITY.md                   # supported versions table for 1.0.x
README.md                     # status badge, Scorecard badge, "design stage" note removed
core_docs/reports/M5_review.md        # NEW: external review findings and outcomes
core_docs/reports/M5_mutation.md      # NEW: last mutation score + survivor triage summary
```

`scripts/` is excluded from the wheel (hatchling `packages = ["src/fastauthz"]` already only ships
the package). Scripts use only the standard library.

---

## 3. Threat-model test plan (main TDD 17.1)

### 3.1 Conventions
- File: `tests/security/test_threat_model.py`. Long files are fine here: one place for auditors.
- Each row of main TDD 17.1 gets an ID by its order in the table: `TM01` ... `TM14`.
- Test names: `test_tmNN_<what_is_proven>`. Parametrized where it helps.
- Tests that need a database run on SQLite by default. The same test with the `postgres` marker
  runs on PostgreSQL in CI (`db` fixture parametrized: `sqlite`, `postgres`).
- Shared fixtures in `tests/security/conftest.py`:
  - `blog_policy` - the policy of `examples/blog` (import it, do not copy it).
  - `saas_policy` - the policy of `examples/saas_multitenant`.
  - `make_actor(**attrs)` - a `SimpleNamespace` actor; `make_actor(missing=["org_id"])` builds an
    object without that attribute.
  - `sql_counter(engine)` - context manager using `sqlalchemy.event.listen(engine,
    "before_cursor_execute", ...)`; yields a list of executed statements. (Event API is public
    SQLAlchemy API, so tests may use it; `src/` code would go through `_compat.py`.)
  - `client(app)` - `httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")`.
- Sentinel strings used to detect leaks: `SECRET_RULE = "zz-secret-rule-name"`,
  `SECRET_VALUE = "zz-secret-value-4711"`, `SECRET_EMAIL = "alice.secret@example.test"`.

### 3.2 Index test
`tests/security/test_threat_model_index.py`:

```python
def test_every_threat_row_has_a_test() -> None:
    rows = _read_tdd_17_1_rows(Path("core_docs/TDD-tech-design-doc.md"))   # markdown table rows
    ids = {f"tm{n:02d}" for n in range(1, len(rows) + 1)}
    tested = {name[5:9] for name in dir(test_threat_model) if name.startswith("test_tm")}
    assert ids <= tested, f"rows without a test: {sorted(ids - tested)}"
```

- `_read_tdd_17_1_rows` finds the heading `### 17.1`, then counts table rows after the header
  separator until the first blank line. Local file read only (no network).
- If someone adds a row to 17.1, CI fails until a `test_tmNN_...` exists. Row order matters, so
  new rows are added at the **end** of the table (write this in a comment above the table in the main TDD).

### 3.3 Row-by-row plan

#### TM01 - A list endpoint forgets to filter -> data leak
Defence: `query()` / `filter()` dependencies; docs show only filtered patterns; `fastauthz matrix`.

| Test | Setup | Expected |
|---|---|---|
| `test_tm01_query_dependency_returns_only_allowed_rows` | blog app, posts by alice (draft + published) and bob (draft); GET `/posts` as alice | ids = alice's posts + published posts; bob's draft absent; result equals `{p.id for p in all if policy.can(alice,"read",p)}` |
| `test_tm01_query_statement_has_where_clause` | `authz.query(Post, "read")` dependency called with a viewer actor | compiled SQL contains `WHERE`; for a no-allow actor the clause is `false` / `0 = 1` (SQLite) |
| `test_tm01_filter_for_unknown_actor_is_false` | `policy.filter(None, "edit", Post)` (no `who=ANYONE` edit rule) | folds to `sa.false()`; query returns 0 rows |
| `test_tm01_docs_warn_about_raw_select` | read `docs/security.md` (M4) | contains the sentence that a hand-written `select()` without `filter()` is not protected; contains a link to the FastAPI guide |

Not testable: a raw `select(Post)` written by the user. Covered by docs only (main TDD 17.1 says so).

#### TM02 - Typo in action or role name silently denies or allows
Defence: FA001, FA007 at freeze; `load()` / `require()` check names at route definition.

| Test | Setup | Expected |
|---|---|---|
| `test_tm02_unknown_action_in_rule_stops_freeze` | `allow("eidt", Post, ...)` | `PolicyError`; `.problems` has one `FA001`; message has `file:line` of this test |
| `test_tm02_unknown_role_in_rule_stops_freeze` | `roles({"admin": []})`, `allow("read", Post, roles=["admn"])` | `PolicyError` with `FA007` |
| `test_tm02_all_problems_reported_at_once` | both typos above in one policy | one `PolicyError` with both codes (FSD F5.2) |
| `test_tm02_load_with_unknown_action_fails_at_definition` | `authz.load(Post, "eidt")` | raises `UnknownActionError` when called (route definition time), not per request |
| `test_tm02_require_with_unknown_resource_fails_at_definition` | `authz.require("create", NotDeclared)` | raises `UnknownResourceError` |
| `test_tm02_can_with_unknown_action_never_returns_true` | frozen policy; `policy.can(admin, "eidt", post)` | raises `UnknownActionError` (main TDD 11); never `True` |

#### TM03 - `NULL` / missing values open access
Defence: three-valued logic, fail closed (main TDD 6).

One parametrized test runs every case on **both engines** and on both databases:

```python
CASES = [
  # id,                 rule,                                   actor,                        row
  ("actor_none",        R.owner_id == A.id,                     None,                         {"owner_id": 1}),
  ("actor_attr_missing",R.org_id == A.org_id,                   make_actor(missing=["org_id"]),{"org_id": 1}),
  ("actor_attr_none",   R.owner_id == A.id,                     make_actor(id=None),          {"owner_id": None}),
  ("column_null",       R.owner_id == A.id,                     make_actor(id=1),             {"owner_id": None}),
  ("negated_missing",   ~(R.owner_id == A.id),                  make_actor(missing=["id"]),   {"owner_id": 2}),
  ("is_none_anonymous", A.banned_at.is_(None),                  None,                         {}),
  ("no_row_path",       R.group.org_id == A.org_id,             make_actor(org_id=1),         {"group": None}),
  ("in_with_null",      R.status.in_(["a", None]),              make_actor(id=1),             {"status": "b"}),
  ("not_in_with_null",  R.status.not_in(["a", None]),           make_actor(id=1),             {"status": "b"}),
]

@pytest.mark.parametrize(("case_id", "rule", "actor", "row"), CASES, ids=[c[0] for c in CASES])
def test_tm03_unclear_values_are_denied_in_python_and_sql(db, case_id, rule, actor, row): ...
```

Expected for every case: `policy.can(actor, "read", item) is False` **and** the item id is not in
`select(Item.id).where(policy.filter(actor, "read", Item))`. Uses the test schema of main TDD 14.3
(`Item`, `Group`, `Tag`), the policy has `who=ANYONE` on the rule so only the value logic decides.

Extra tests:
- `test_tm03_unknown_deny_blocks_true_allow` - an allow rule that is `TRUE`, plus
  `deny("read", Item, when=R.score > 10)` on a row with `score = NULL` -> the deny is `UNKNOWN` ->
  denied in both engines (main TDD 6.4: an unclear deny blocks access).
- `test_tm03_long_differential_run_is_wired` - asserts the nightly profile name exists in the
  Hypothesis settings registry (the real proof is the property test itself).

#### TM04 - `and` / `or` used instead of `&` / `|` drops a condition
Defence: `__bool__` raises (main TDD 5.2).

| Test | Code under test | Expected |
|---|---|---|
| `test_tm04_python_and_raises` | `(R.a == 1) and (R.b == 2)` | `ExpressionError`, message contains `& | ~` |
| `test_tm04_python_or_raises` | `(R.a == 1) or (R.b == 2)` | `ExpressionError` |
| `test_tm04_python_not_raises` | `not (R.a == 1)` | `ExpressionError` |
| `test_tm04_if_on_expression_raises` | `if R.a == 1: ...` | `ExpressionError` |
| `test_tm04_chained_comparison_raises` | `1 < R.score < 5` (Python turns this into `and`) | `ExpressionError`; message should hint `(R.score > 1) & (R.score < 5)` |
| `test_tm04_python_in_on_list_raises` | `R.status in ["a", "b"]` | `ExpressionError` (list `__contains__` calls `bool()`); hint `.in_()` |
| `test_tm04_builtin_any_all_raise` | `all([R.a == 1, R.b == 2])` | `ExpressionError` |

#### TM05 - Missing parentheses (`R.a == 1 & ...`)
Defence: FA014 warning (main TDD 5.3, 8.5).

| Test | Code under test | Expected |
|---|---|---|
| `test_tm05_missing_parens_never_builds_a_silent_rule` | `R.a == 1 & R.b == 2` | Python parses this as `R.a == (1 & R.b) == 2`, a chained comparison. Expected: an error at build time (`ExpressionError` from `__bool__`, or `TypeError`/`ExpressionError` from `1 & R.b`). The test asserts "raises at build **or** `validate()` returns FA014" and never "a rule was added with no problem". |
| `test_tm05_compare_with_boolean_operand_warns_fa014` | a `Compare` whose operand is an `And`/`Or` (if the builder allows it) | `validate()` has `FA014` warning; `fastauthz check --strict` exits 1 |

Note: if the M1 builder rejects `And`/`Or` as a `Compare` operand at build time (main TDD 5.1
says `Operand = ResourceAttr | ActorAttr | Literal`), FA014 can never trigger. Then the second
test asserts the `ExpressionError` instead, and main TDD 8.5 must say FA014 is unreachable or be
removed. Decide during M5-T6 and fix the docs in the same PR (see 11.10).

#### TM06 - SQL injection via actor or literal values
Defence: values are always bound parameters (main TDD 9.3).

| Test | Setup | Expected |
|---|---|---|
| `test_tm06_values_are_bound_parameters` (Hypothesis, `st.text()` + a fixed list of nasty strings: `"'; DROP TABLE item; --"`, `"\" OR 1=1 --"`, `"%"`, `"_"`, `"\\"`, unicode quotes) | actor `org_id` = value; rule `R.status == A.org_id` and `R.status.in_(["x", value])` | `str(stmt.compile(dialect=d))` for SQLite and PostgreSQL dialects does **not** contain the value; `compiled.params` contains it; running the query leaves table `item` present and row count unchanged |
| `test_tm06_custom_sql_fragment_is_passed_as_is` | `sql=` twin returns a `ColumnElement` | fragment used unchanged; docs warn that `sql=` is the user's own code |
| `test_static_sql_safety.py::test_no_literal_binds_in_src` | scan `src/fastauthz/**/*.py` | no `literal_binds`, no `sa.text(` / `text(` / `literal_column(` calls (regex on source text; allowlist empty) |

PostgreSQL rejects `\x00` in text; the Hypothesis strategy filters out `"\x00"` for the
`postgres` run (it is a driver error, not a leak).

#### TM07 - Enumeration of ids through 403 vs 404
Defence: `load()` defaults to 404 for both (main TDD 12.3).

| Test | Setup | Expected |
|---|---|---|
| `test_tm07_denied_and_missing_look_the_same` | blog app, default `deny_status=404`; alice GETs bob's draft id, then id `999999` | both 404; JSON bodies byte-equal; same `content-type`; header names equal |
| `test_tm07_403_mode_never_reveals_other_tenant_ids` | saas app, `deny_status=403`; user of org 1 GETs (a) org-1 row not allowed, (b) org-2 row, (c) missing id | (a) 403, (b) 404, (c) 404; (b) and (c) bodies byte-equal |
| `test_tm07_403_mode_extra_query_only_on_deny` | `sql_counter` | allowed path: 1 statement; denied path: 2 statements |

Not covered: timing side channels (the 403 mode runs one extra query on deny). Written on the
security page as a known limit; 404 mode is the safe default.

#### TM08 - Tenant leak through an admin rule
Defence: scope added to allow rules by default; `bypass_scope=True` is explicit and listed.

| Test | Setup | Expected |
|---|---|---|
| `test_tm08_admin_is_still_scoped` | `Policy(scope=R.org_id == A.org_id)`, `allow("*", Invoice, roles=["admin"])`; admin of org 1 | `can(admin, "read", invoice_org2) is False`; list returns only org-1 rows (both DBs) |
| `test_tm08_bypass_scope_is_listed_by_check` | add `allow("read", Invoice, roles=["staff"], bypass_scope=True, name=...)` | `fastauthz check` output lists this rule's name and `file:line` in the bypass list; `matrix` shows "bypasses scope" |
| `test_tm08_deny_applies_in_every_scope` | staff rule with bypass, plus `deny("read", Invoice, when=R.frozen.is_(True))` | frozen invoice of any org is denied for staff |
| `test_tm08_missing_scope_column_stops_start` | resource without `org_id`, scope inherited | `PolicyError` `FA008` (FSD story 7.2) |
| `test_tm08_anonymous_never_passes_actor_scope` | `who=ANYONE` rule without bypass on scoped resource | `validate()` warns `FA016`; anonymous `can` is `False` |

#### TM09 - Custom check crashes and is treated as allow
Defence: exception -> `UNKNOWN` -> deny, logged (main TDD 5.7).

| Test | Setup | Expected |
|---|---|---|
| `test_tm09_crashing_allow_check_denies_and_logs` | `allow("publish", Post, check=lambda a, p: 1 / 0, name=SECRET_RULE)` | `can` is `False`; one WARNING on the `fastauthz` logger with the rule name and the exception type; the exception message is not re-raised |
| `test_tm09_crashing_deny_check_blocks` | allow `TRUE` + deny with crashing `check` | `can` is `False` (unknown deny blocks, main TDD 6.4) |
| `test_tm09_base_exceptions_propagate` | `check` raises `KeyboardInterrupt` / `asyncio.CancelledError` | propagates (not caught); access is not granted. Only `Exception` subclasses become `UNKNOWN`. |
| `test_tm09_non_bool_result_is_not_true` | `check` returns `"no"`, `1`, `None` | only `True` (identity) gives `TRUE`; the rest give not-`TRUE` -> deny; WARNING for non-bool (see 11.4) |

#### TM10 - Lazy load in a Python check reads stale or missing data
Defence: lazy-load guard (main TDD 7); DB checks use SQL.

| Test | Setup | Expected |
|---|---|---|
| `test_tm10_unloaded_relationship_is_missing_sync` | sync `Session`; load `Item` without `tags`; rule `R.tags.any(name="x")` | `can` is `False`; `sql_counter` shows 0 statements during `can`; WARNING suggests `load()`/`filter()`/eager loading |
| `test_tm10_unloaded_relationship_is_missing_async` | `AsyncSession`, same | `can` is `False`; no `MissingGreenlet`; 0 statements |
| `test_tm10_load_dependency_uses_sql` | `authz.load(Item, "read")` | 1 statement; Python evaluator not called (patch `evaluate.evaluate` to raise) |

#### TM11 - Slow queries from deep relationships (DoS)
Defence: `MAX_RELATION_DEPTH`, `EXISTS` subqueries.

| Test | Setup | Expected |
|---|---|---|
| `test_tm11_depth_over_limit_stops_freeze` | path with `config.MAX_RELATION_DEPTH + 1` hops (test models with a 4-level chain) | `PolicyError` `FA005` |
| `test_tm11_depth_at_limit_compiles_to_exists` | 3 hops | compiled SQL has exactly 3 `EXISTS`; no `JOIN` |
| `test_tm11_pagination_has_no_duplicates` | `.any()` rule matching several related rows; `query().limit(10)` | 10 distinct ids |

#### TM12 - Error messages leak policy details
Defence: `Denied` detail uses a fixed template (main TDD 12.5).

| Test | Setup | Expected |
|---|---|---|
| `test_tm12_http_body_has_no_rule_or_value` | rule named `SECRET_RULE`, actor with `SECRET_VALUE`; denied `require` and `guard.check` | status 403; body == `{"type":"about:blank","title":"Forbidden","status":403,"detail": DENY_DETAIL_TEMPLATE.format(...)}`; `SECRET_RULE`, `SECRET_VALUE` not in body or headers |
| `test_tm12_denied_str_and_repr_have_no_values` | `policy.check(...)` raises `Denied` | `str(e)`, `repr(e)` do not contain `SECRET_VALUE`; `e.decision` has no explanation |
| `test_tm12_problem_json_content_type` | same | `content-type: application/problem+json` |

Developer-facing errors (`PolicyError` at start, `explain()`) **may** show rule names and values;
they never reach HTTP clients. A test asserts `install()` registers a handler only for `Denied`.

#### TM13 - Decision logs leak personal data
Defence: decisions store ids only (main TDD 10.1).

| Test | Setup | Expected |
|---|---|---|
| `test_tm13_decision_holds_ids_only` | actor dataclass with `id=7`, `email=SECRET_EMAIL`, `__repr__` returning the email | every field of the `Decision` is a primitive (`bool`, `str`, `int`, `tuple[str, ...]`, `None`) or the id; `SECRET_EMAIL` not in `repr(decision)` |
| `test_tm13_logger_output_has_no_personal_data` | `caplog` at DEBUG on `fastauthz.decisions`; allowed + denied requests | no record message or arg contains `SECRET_EMAIL` |
| `test_tm13_on_decision_crash_does_not_change_result` | callback raises | response unchanged; error logged (FSD F14.5) |

#### TM14 - Policy changed at runtime by other code
Defence: `freeze()` makes it immutable.

| Test | Setup | Expected |
|---|---|---|
| `test_tm14_frozen_policy_rejects_changes` | frozen policy; call `allow`, `deny`, `resource`, `roles` | each raises `PolicyFrozenError` |
| `test_tm14_rules_and_specs_are_immutable` | `policy.rules`, `ResourceSpec`, `Rule` | containers are `tuple` / `frozenset` / `MappingProxyType` after freeze; assignment raises `FrozenInstanceError` / `TypeError` / `AttributeError` |
| `test_tm14_concurrent_checks_agree` | 16 threads x 1000 `can()` calls on a shared policy (runs on 3.14t in nightly) | all results equal the single-threaded result |

Out of scope (documented): deliberate bypass with `object.__setattr__` or `gc` tricks. We protect
against accidental change, not hostile code running inside the same process.

### 3.4 Coverage of FSD safety promises
| FSD promise | TM tests |
|---|---|
| F2.1 default deny | TM01, TM03 |
| F2.2 deny wins | TM08, TM09 |
| F2.3 unsure means no | TM03, TM09, TM10 |
| F2.4 same answer | TM03 + property tests |
| F12.3 no leak in errors | TM07, TM12 |
| F14.3 ids only | TM13 |
| N2 values not as text | TM06 |

---

## 4. Mutation testing (main TDD 14.5)

### 4.1 Tool and version
- `mutmut` 3.x as a dev dependency (`[dependency-groups] dev`). Already listed in TECH_STACK.
- Target files only: `src/fastauthz/truth.py`, `src/fastauthz/evaluate.py`, `src/fastauthz/sql.py`.

### 4.2 Config (`pyproject.toml`)
```toml
[tool.mutmut]
paths_to_mutate = [
  "src/fastauthz/truth.py",
  "src/fastauthz/evaluate.py",
  "src/fastauthz/sql.py",
]
tests_dir = ["tests/unit/", "tests/property/", "tests/security/"]
pytest_add_cli_args = ["-p", "no:cacheprovider", "-x", "-q", "-m", "not postgres"]
also_copy = ["tests/", "examples/"]
```
- `-x`: stop at the first failure (a killed mutant needs only one failing test).
- `-m "not postgres"`: mutation runs on SQLite only. PostgreSQL behaviour is covered by the
  normal and nightly differential runs.
- Hypothesis under mutation: env var `HYPOTHESIS_PROFILE=mutation` -> profile with
  `max_examples=200`, `derandomize=True`, `database=None`, `deadline=None`. Derandomized so the
  same mutant gives the same result on every run (no flaky "survived").
- Before mutating, the run checks the clean suite passes (mutmut does this; if it fails, the run stops).

### 4.3 Running
```bash
HYPOTHESIS_PROFILE=mutation uv run mutmut run       # full run (nightly / before release)
uv run mutmut results                                # list survived / timeout / suspicious
uv run mutmut show <mutant-name>                     # see the diff of one mutant
uv run mutmut browse                                 # TUI to walk survivors locally
uv run mutmut export-cicd-stats                      # writes mutants/mutmut-cicd-stats.json
uv run python scripts/mutation_gate.py --min 0.90    # gate
```
Local runs can mutate one file: `uv run mutmut run "fastauthz.truth*"`.

### 4.4 Score and gate (`scripts/mutation_gate.py`)
```
score = (killed + timeout) / (total - skipped - equivalent)
```
- `timeout` counts as killed (the mutant made the code hang; a test noticed).
- `no tests` and `suspicious` count as **survived**.
- `equivalent` = the number of mutants listed in `tests/mutation_equivalent.toml` that still exist
  (matched by mutant name **and** a hash of the mutated line, so a stale entry does not hide a new survivor).
- Gate: `score >= 0.90` **per file** and overall. Per file stops `truth.py` (small, easy) from
  hiding a weak `sql.py`.
- Output: a short table per file, written to `$GITHUB_STEP_SUMMARY` in CI, and to
  `core_docs/reports/M5_mutation.md` before the release (by hand, copy of the table + date).
- Exit 1 below the gate, 2 if the stats file is missing.

### 4.5 Triage of survivors
For each survivor, in this order:
1. **Missing test** -> write a test that kills it (unit test in the right `tests/unit/test_*.py`).
   Prefer a test that names the truth-table cell it proves (`test_and_unknown_false_is_false`).
2. **Missing Hypothesis coverage** -> extend the strategy in `tests/property/` so it can produce
   the case, then add the found input as `@example(...)` (main TDD 14.3 step 5).
3. **Equivalent mutant** (behaviour cannot change, e.g. a mutated log message string, or a
   short-circuit order change in `And` that gives the same Kleene result) -> add to
   `tests/mutation_equivalent.toml`:
   ```toml
   [[equivalent]]
   mutant = "fastauthz.evaluate.x__eval_and__mutmut_7"
   line_sha = "3f2a9c1e"            # first 8 hex of sha256 of the mutated source line
   reason = "log message text only; behaviour unchanged"
   reviewed_by = "ankit"
   date = 2026-12-01
   ```
4. **Dead code** -> delete the code instead.
- `# pragma: no mutate` is allowed only for log message strings, with a comment saying why.
- No survivor in the `Kleene` tables, `Is` table, `fold` simplification, or `NO_ROW` handling may be
  marked equivalent without a second reviewer (these are the security core).

### 4.6 Speed budget
- Expected mutant count: a few hundred. With `-x` and the mutation profile, the full run should
  stay under 60 minutes on a GitHub runner. If it grows above that, split by file into 3 parallel
  nightly jobs (matrix over `paths_to_mutate`), each with its own gate.

---

## 5. Nightly workflow (`.github/workflows/nightly.yml`)

### 5.1 Jobs
| Job | What | Blocking |
|---|---|---|
| `full-matrix` | Python 3.11-3.15 x resolution {lowest-direct, highest} x DB {SQLite, PostgreSQL 18} | yes |
| `free-threaded` | Python 3.14t, full fast suite + `test_tm14_concurrent_checks_agree` | no (`continue-on-error`) |
| `fastapi-prerelease` | newest FastAPI / Starlette pre-releases (`--prerelease allow`) | yes |
| `sqlalchemy-main` | SQLAlchemy from its `main` branch | yes |
| `postgres-versions` | PostgreSQL 14 and 18 (main TDD 15.1 range ends) on Python 3.14 | yes |
| `hypothesis-long` | property tests, profile `nightly` (`max_examples=20000`), SQLite + PostgreSQL | yes |
| `mutation` | section 4 | yes |
| `benchmarks` | `benchmarks/`, fails on > 20% median slowdown (main TDD 16.2) | yes |
| `report` | opens / updates an issue when any blocking job fails | - |

### 5.2 YAML outline
All `uses:` are SHA-pinned (shown as `@<sha> # vX.Y.Z`).

```yaml
name: nightly
on:
  schedule:
    - cron: "17 2 * * *"          # 02:17 UTC, off the hour to avoid runner peaks
  workflow_dispatch: {}
permissions:
  contents: read
concurrency:
  group: nightly
  cancel-in-progress: true

env:
  UV_PYTHON_PREFERENCE: only-managed
  FASTAUTHZ_PG_URL: postgresql+psycopg://postgres:postgres@localhost:5432/fastauthz
  FASTAUTHZ_PG_ASYNC_URL: postgresql+asyncpg://postgres:postgres@localhost:5432/fastauthz

jobs:
  full-matrix:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        python: ["3.11", "3.12", "3.13", "3.14", "3.15"]
        resolution: [lowest-direct, highest]
    services:
      postgres:
        image: postgres:18
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: fastauthz }
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 5s --health-retries 10
    steps:
      - uses: actions/checkout@<sha> # v4.x
        with: { persist-credentials: false }
      - uses: astral-sh/setup-uv@<sha> # vX
        with: { python-version: "${{ matrix.python }}" }
      - run: uv lock --resolution ${{ matrix.resolution }}
      - run: uv sync --all-extras
      - run: uv run pytest
      - run: uv run pytest -m postgres

  free-threaded:
    runs-on: ubuntu-24.04
    continue-on-error: true
    steps:
      - uses: actions/checkout@<sha>
        with: { persist-credentials: false }
      - uses: astral-sh/setup-uv@<sha>
        with: { python-version: "3.14t" }
      - run: uv sync --all-extras
      - run: uv run python -c "import sys; assert not sys._is_gil_enabled()"
      - run: uv run pytest

  fastapi-prerelease:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@<sha>
        with: { persist-credentials: false }
      - uses: astral-sh/setup-uv@<sha>
        with: { python-version: "3.14" }
      - run: uv lock --upgrade --prerelease allow
      - run: uv sync --all-extras
      - run: uv run python -c "import fastapi, starlette; print(fastapi.__version__, starlette.__version__)"
      - run: uv run pytest tests/compat tests/integration tests/unit/test_fastapi.py tests/security

  sqlalchemy-main:
    runs-on: ubuntu-24.04
    services: { postgres: <same as full-matrix> }
    steps:
      - uses: actions/checkout@<sha>
        with: { persist-credentials: false }
      - uses: astral-sh/setup-uv@<sha>
        with: { python-version: "3.14" }
      - run: uv sync --all-extras
      - run: uv pip install "sqlalchemy @ git+https://github.com/sqlalchemy/sqlalchemy.git@main"
      - run: uv run --no-sync pytest
      - run: uv run --no-sync pytest -m postgres

  postgres-versions:
    runs-on: ubuntu-24.04
    strategy:
      fail-fast: false
      matrix: { pg: ["14", "18"] }
    services:
      postgres:
        image: "postgres:${{ matrix.pg }}"
        # same env / ports / health options
    steps: [checkout, setup-uv 3.14, "uv sync --all-extras", "uv run pytest -m postgres"]

  hypothesis-long:
    runs-on: ubuntu-24.04
    timeout-minutes: 120
    services: { postgres: <same as full-matrix> }
    env: { HYPOTHESIS_PROFILE: nightly }
    steps:
      - <checkout, setup-uv 3.14, uv sync --all-extras>
      - run: uv run pytest tests/property
      - run: uv run pytest tests/property -m postgres
      - if: failure()
        uses: actions/upload-artifact@<sha>
        with: { name: hypothesis-db, path: .hypothesis/ }   # keeps the failing example

  mutation:
    runs-on: ubuntu-24.04
    timeout-minutes: 90
    env: { HYPOTHESIS_PROFILE: mutation }
    steps:
      - <checkout, setup-uv 3.14, uv sync --all-extras>
      - run: uv run mutmut run
      - run: uv run mutmut export-cicd-stats
      - run: uv run python scripts/mutation_gate.py --min 0.90 >> "$GITHUB_STEP_SUMMARY"

  benchmarks:
    runs-on: ubuntu-24.04
    steps:
      - <checkout, setup-uv 3.14, uv sync --all-extras>
      - uses: actions/cache/restore@<sha>
        with: { path: .benchmarks, key: bench-ubuntu-24.04-py3.14 }
      - run: >-
          uv run pytest benchmarks --benchmark-autosave
          --benchmark-compare --benchmark-compare-fail=median:20%
      - if: success()
        uses: actions/cache/save@<sha>
        with: { path: .benchmarks, key: "bench-ubuntu-24.04-py3.14-${{ github.run_id }}" }

  report:
    needs: [full-matrix, fastapi-prerelease, sqlalchemy-main, postgres-versions,
            hypothesis-long, mutation, benchmarks]
    if: failure()
    runs-on: ubuntu-24.04
    permissions:
      issues: write
    steps:
      - env:
          GH_TOKEN: ${{ github.token }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          TITLE="Nightly CI failed"
          NUM=$(gh issue list -R "$GITHUB_REPOSITORY" --label nightly-failure --state open \
                --json number --jq '.[0].number')
          if [ -n "$NUM" ]; then
            gh issue comment "$NUM" -R "$GITHUB_REPOSITORY" --body "Failed again: $RUN_URL"
          else
            gh issue create -R "$GITHUB_REPOSITORY" --title "$TITLE" --label nightly-failure \
              --body "Nightly run failed: $RUN_URL"
          fi
```

### 5.3 Notes
- Installing packages from PyPI / GitHub in CI is not "network in tests" (rule 9): tests themselves
  still make no network calls. `tests/security/test_threat_model.py` must not open sockets; a
  `conftest.py` guard (`socket.socket` patched to raise, except for the PostgreSQL host in
  `postgres` tests) enforces it in `tests/security/`.
- The `nightly-failure` label is created once by hand.
- `benchmarks` baseline: the first run only saves. The cache key with `run_id` plus a prefix
  `restore-keys` (`bench-ubuntu-24.04-py3.14`) always restores the newest baseline. If the M4
  benchmark job already defines another baseline method, keep M4's and only add the 20% gate.
- A pre-release failure is not automatically our bug. The issue triage steps:
  1. reproduce locally with `uv lock --upgrade --prerelease allow`;
  2. if the break is in FastAPI internals we use, fix `_compat.py` (main TDD 12.7);
  3. if it is a FastAPI bug, report upstream and link it in our issue.

---

## 6. Supply chain (main TDD 17.2)

### 6.1 Pin every action by SHA
- Format: `uses: owner/repo@<40-hex-sha> # vX.Y.Z`. The comment lets Dependabot update both.
- How to pin the first time: for each action, look up the commit of the release tag on GitHub
  (`gh api repos/<owner>/<repo>/git/ref/tags/<tag>`; dereference annotated tags), then write it.
- Test `tests/security/test_workflows_pinned.py` (no YAML library needed; stdlib regex):
  ```python
  USES = re.compile(r"^\s*-?\s*uses:\s*([^\s#]+)", re.M)
  PINNED = re.compile(r"^[\w.-]+/[\w./-]+@[0-9a-f]{40}$")

  def test_every_action_is_sha_pinned() -> None:
      for wf in Path(".github/workflows").glob("*.yml"):
          for ref in USES.findall(wf.read_text()):
              if ref.startswith("./"):           # local composite action
                  continue
              assert PINNED.match(ref), f"{wf.name}: {ref} is not pinned by SHA"
  ```
  Docker images in `services:` are pinned by tag (`postgres:18`) only; Scorecard counts workflow
  actions, and pinning DB images by digest would make the PostgreSQL version matrix hard to read.

### 6.2 Dependabot (`.github/dependabot.yml`)
```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: weekly, day: monday }
    groups:
      actions:
        patterns: ["*"]
    commit-message: { prefix: "ci" }

  - package-ecosystem: uv
    directory: "/"
    schedule: { interval: weekly, day: monday }
    versioning-strategy: lockfile-only     # never raise the runtime lower bounds in pyproject
    groups:
      dev-tools:
        dependency-type: development
    commit-message: { prefix: "chore" }
```
- `lockfile-only` keeps `sqlalchemy>=2.0` / `fastapi>=0.115` untouched (TECH_STACK: lower bounds only).
  Check that this option is accepted for the `uv` ecosystem when the file is added; if not, use
  `ignore` entries for `sqlalchemy` and `fastapi` with `update-types: ["version-update:semver-major"]`
  and review runtime bumps by hand.
- Dependabot security alerts: turn on in repo settings (Security -> Dependabot alerts).

### 6.3 OpenSSF Scorecard (`.github/workflows/scorecard.yml`)
```yaml
name: scorecard
on:
  branch_protection_rule:
  schedule:
    - cron: "30 3 * * 1"
  push:
    branches: [main]
permissions: read-all
jobs:
  analysis:
    runs-on: ubuntu-24.04
    permissions:
      security-events: write
      id-token: write
    steps:
      - uses: actions/checkout@<sha>
        with: { persist-credentials: false }
      - uses: ossf/scorecard-action@<sha>
        with:
          results_file: results.sarif
          results_format: sarif
          publish_results: true
      - uses: actions/upload-artifact@<sha>
        with: { name: scorecard-sarif, path: results.sarif, retention-days: 5 }
      - uses: github/codeql-action/upload-sarif@<sha>
        with: { sarif_file: results.sarif }
```
- README badge: `[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/<owner>/fastauthz/badge)](https://scorecard.dev/viewer/?uri=github.com/<owner>/fastauthz)`.
  `<owner>` = the final GitHub owner after the rename.
- Checks we can pass: Pinned-Dependencies, Token-Permissions (top-level `contents: read` in every
  workflow), Dangerous-Workflow (no `pull_request_target`), Security-Policy, License,
  Dependency-Update-Tool, Signed-Releases (attestations), Branch-Protection (ruleset on `main`),
  CI-Tests, Maintained, Packaging.
- Checks that are hard for a solo maintainer: Code-Review, Contributors. The score is not a CI
  gate. Record the score in `core_docs/reports/M5_review.md`.

### 6.4 Trusted Publishing and environments
Set up once (the PyPI part was done in M3; verify it in M5):
1. PyPI -> project `fastauthz` -> Publishing -> trusted publisher: owner `<owner>`, repo
   `fastauthz`, workflow `release.yml`, environment `pypi`. Remove any API tokens for the project.
2. TestPyPI -> same with environment `testpypi` (used for `rc` tags).
3. GitHub -> Settings -> Environments:
   - `pypi`: required reviewer = maintainer; deployment rule = tags matching `v*`; no secrets.
   - `testpypi`: deployment rule = tags matching `v*rc*`.
4. GitHub -> Rulesets:
   - tag ruleset `v*`: only maintainers can create; no update, no delete.
   - branch ruleset `main`: PR required, status checks (`ci`) required, no force push.
5. Repository -> Settings -> Actions: workflow permissions default "read".

### 6.5 Release workflow (`.github/workflows/release.yml`)
```yaml
name: release
on:
  push:
    tags: ["v*"]
permissions:
  contents: read

jobs:
  test:
    uses: ./.github/workflows/ci.yml          # ci.yml has `on: workflow_call` too

  build:
    needs: test
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@<sha>
        with: { persist-credentials: false }
      - uses: astral-sh/setup-uv@<sha>
        with: { python-version: "3.14" }
      - run: uv run --no-project python scripts/check_version_tag.py "$GITHUB_REF_NAME"
      - run: uv build                                     # sdist + py3-none-any wheel
      - run: |                                            # smoke test the wheel in a clean env
          uv venv /tmp/smoke --python 3.11
          uv pip install --python /tmp/smoke dist/*.whl
          /tmp/smoke/bin/python -c "import fastauthz, sys; print(fastauthz.__version__)"
          uv pip install --python /tmp/smoke "$(ls dist/*.whl)[standard]"
          /tmp/smoke/bin/python -c "import fastauthz.fastapi, fastauthz.sql"
      - uses: actions/upload-artifact@<sha>
        with: { name: dist, path: dist/ }

  publish-testpypi:
    if: contains(github.ref_name, 'rc')
    needs: build
    runs-on: ubuntu-24.04
    environment: { name: testpypi, url: "https://test.pypi.org/p/fastauthz" }
    permissions: { id-token: write }
    steps:
      - uses: actions/download-artifact@<sha>
        with: { name: dist, path: dist/ }
      - uses: pypa/gh-action-pypi-publish@<sha>
        with: { repository-url: "https://test.pypi.org/legacy/" }

  publish-pypi:
    needs: [build, publish-testpypi]
    if: ${{ always() && needs.build.result == 'success' && needs.publish-testpypi.result != 'failure' }}
    runs-on: ubuntu-24.04
    environment: { name: pypi, url: "https://pypi.org/p/fastauthz" }
    permissions: { id-token: write }
    steps:
      - uses: actions/download-artifact@<sha>
        with: { name: dist, path: dist/ }
      - uses: pypa/gh-action-pypi-publish@<sha>        # attestations: true is the default (PEP 740)

  github-release:
    needs: publish-pypi
    runs-on: ubuntu-24.04
    permissions: { contents: write }
    steps:
      - uses: actions/checkout@<sha>
        with: { persist-credentials: false }
      - uses: actions/download-artifact@<sha>
        with: { name: dist, path: dist/ }
      - env: { GH_TOKEN: "${{ github.token }}" }
        run: |
          python scripts/changelog_section.py "${GITHUB_REF_NAME#v}" > notes.md
          FLAGS=""; case "$GITHUB_REF_NAME" in *rc*|*a*|*b*|v0.*) FLAGS="--prerelease";; esac
          gh release create "$GITHUB_REF_NAME" dist/* --verify-tag --notes-file notes.md $FLAGS
```
- `scripts/check_version_tag.py`: imports `src/fastauthz/_version.py` with `runpy` (no install),
  compares `"v" + __version__` to the argument, exits 1 on mismatch.
- `scripts/changelog_section.py`: prints the lines between `## [X.Y.Z]` and the next `## [`;
  exits 1 if the section is missing or empty (a release without notes fails).
- Attestations: `pypa/gh-action-pypi-publish` makes PEP 740 attestations through Trusted
  Publishing. After the release, check by hand (network, not a test):
  `uvx pypi-attestations verify pypi --repository https://github.com/<owner>/fastauthz pypi:fastauthz-1.0.0-py3-none-any.whl`.
  Optional: also `actions/attest-build-provenance` on `dist/*` for GitHub attestations
  (`gh attestation verify`). Decide in M5-T18; it costs one step.

---

## 7. Public API freeze (main TDD 15.3, 18)

### 7.1 The public surface
Public modules (documented in the API reference, TDD 19):

| Module | Public names (`__all__`) |
|---|---|
| `fastauthz` | `Policy`, `R`, `A`, `ANYONE`, `AUTHENTICATED`, `TRUE_`, `FALSE_`, `Truth`, `Decision`, `Explanation`, `RuleResult`, `PolicyProblem`, all error classes of `fastauthz.errors`, `__version__` |
| `fastauthz.errors` | `FastAuthzError`, `ExpressionError`, `PolicyError`, `PolicyFrozenError`, `UnknownResourceError`, `UnknownActionError`, `NotFilterableError`, `Denied`, `FastAuthzDeprecationWarning` |
| `fastauthz.fastapi` | `FastAuthz`, `Guard` |
| `fastauthz.testing` | `assert_allowed`, `assert_denied`, `PolicyCase`, `check_cases`, `assert_filter_consistent`, `override_actor` |

- Final list is confirmed in M5-T19 against what M1-M4 really built. Any difference: fix the code
  or this table, and the main TDD 4, in the same PR.
- Every other module (`expr`, `truth`, `evaluate`, `roles`, `policy`, `decision`, `sql`,
  `openapi`, `config`, `cli`, `_compat`, `_version`) is **internal**. Module names stay as in main
  TDD 3 (renaming would break the doc layout and git history). Each internal module:
  - has `__all__` (for pyright and for re-exports);
  - has a first docstring line: `"""Internal. Import from `fastauthz` instead. Not covered by SemVer."""`;
  - helper names inside public modules start with `_`.
- `config.py` constants are internal in 1.0. Users change behaviour only through constructor
  arguments. (Making settings public is a feature; not in M5.)
- `INHERIT` (the `resource(scope=INHERIT)` default) is not exported; users never pass it.

### 7.2 Snapshot test (`tests/unit/test_public_api.py`)
```python
PUBLIC = ["fastauthz", "fastauthz.errors", "fastauthz.fastapi", "fastauthz.testing"]
SNAPSHOT = Path(__file__).parent.parent / "snapshots" / "public_api.txt"

def _describe(module_name: str) -> list[str]:
    mod = importlib.import_module(module_name)
    lines: list[str] = []
    for name in sorted(mod.__all__):
        obj = getattr(mod, name)
        if inspect.isclass(obj):
            lines.append(f"{module_name}.{name}: class{_safe_sig(obj)} bases={_bases(obj)}")
            for meth in sorted(n for n in vars(obj) if not n.startswith("_")):
                lines.append(f"{module_name}.{name}.{meth}{_safe_sig(getattr(obj, meth))}")
        elif callable(obj):
            lines.append(f"{module_name}.{name}{_safe_sig(obj)}")
        else:
            lines.append(f"{module_name}.{name}: {type(obj).__name__}")
    return lines

def test_public_api_matches_snapshot() -> None:
    current = "\n".join(l for m in PUBLIC for l in _describe(m)) + "\n"
    if os.environ.get("UPDATE_SNAPSHOTS") == "1":
        SNAPSHOT.write_text(current)
    assert current == SNAPSHOT.read_text(), "Public API changed. Update the snapshot AND CHANGELOG.md."

def test_all_names_exist_and_are_not_private() -> None: ...
def test_internal_modules_say_internal() -> None: ...   # first docstring line check
```
- `_safe_sig` uses `inspect.signature(obj)` and returns `str(sig)` (annotations are strings when
  modules use `from __future__ import annotations`, so output is stable across Python versions).
- `__version__` is described as `str` only (not its value), so a version bump does not change
  the snapshot.
- PR rule (CONTRIBUTING): a diff in `tests/snapshots/public_api.txt` needs a CHANGELOG entry under
  `Added`, `Changed`, `Deprecated` or `Removed`.

### 7.3 Typing tests (`tests/typing/test_public_types.py`)
Run by `uv run pyright` (strict covers `tests/typing/`) and also collected by pytest (runtime
`assert_type` is a no-op, so it only checks imports work).

```python
from typing import assert_type
from sqlalchemy import ColumnElement, Select

def check(policy: Policy, user: User, post: Post, authz: FastAuthz) -> None:
    assert_type(policy.can(user, "edit", post), bool)
    assert_type(policy.check(user, "edit", post), None)
    assert_type(policy.filter(user, "read", Post), ColumnElement[bool])
    assert_type(policy.explain(user, "edit", post), Explanation)
    assert_type(policy.allow("read", Post), Policy)          # chaining (main TDD 8.2)
    assert_type(authz.load(Post, "edit"), Callable[..., Awaitable[Post]] | Callable[..., Post])
    ...
```
- The exact return types for the FastAPI factories are the ones M3 built; this file only freezes
  them. Pyright settings: `reportPrivateUsage = "error"` for `tests/typing/`, so a typing test can
  never depend on a private name.
- `py.typed` is present in the wheel: the release smoke test (6.5) checks
  `importlib.resources.files("fastauthz").joinpath("py.typed").is_file()`.

### 7.4 SemVer and deprecation
- Before 1.0: every change is in CHANGELOG (main TDD 15.3). From `1.0.0`: SemVer strictly.
  - patch `1.0.x`: bug fixes only. A security fix that makes a rule **deny** more is a patch (fail
    closed); it is written in the CHANGELOG under `Security`.
  - minor `1.x.0`: new features, deprecations.
  - major: removals and breaking changes.
- `errors.py` adds:
  ```python
  class FastAuthzDeprecationWarning(DeprecationWarning):
      """A fastauthz feature will be removed in a future major version."""

  def warn_deprecated(what: str, *, since: str, removal: str, use: str | None = None) -> None:
      msg = f"{what} is deprecated since fastauthz {since} and will be removed in {removal}."
      if use:
          msg += f" Use {use} instead."
      warnings.warn(msg, FastAuthzDeprecationWarning, stacklevel=3)
  ```
  - It subclasses `DeprecationWarning`, not `FastAuthzError` (it is a warning, not an error). The
    main TDD 11 tree lists only exceptions; add a line for this warning there in the same PR.
  - Removal needs at least two minor releases with the warning (`since="1.2"`, earliest
    `removal="2.0"` and only if `1.3` also shipped it).
  - The test suite runs with `-W error::fastauthz.errors.FastAuthzDeprecationWarning` (pytest
    `filterwarnings`), so our own code never uses a deprecated path.
  - `warnings.deprecated` (PEP 702) is 3.13+ only and the core supports 3.11, so we use our own
    helper (no `typing_extensions`: the core has zero dependencies).

---

## 8. External review

### 8.1 Who
2-3 people, picked for different skills:
1. **Application security** - someone who has done web app pentests or authz reviews.
2. **SQLAlchemy power user** - knows `has()` / `any()`, NULL semantics, dialect differences.
3. **FastAPI SaaS developer** - runs a multi-tenant app; checks the API is usable and the
   tenant story is right.

Where to find them: FastAPI GitHub Discussions, r/FastAPI, Python security folks, people who
opened issues on the `0.x` releases. Offer: credit in release notes and README "Thanks" section.
Fallback if nobody answers in 2 weeks: a public "break fastauthz" Discussion post with the same
brief, and release `1.0.0rc2` instead of `1.0.0` until at least one outside review is done.

### 8.2 The brief (`core_docs/reports/M5_review.md`, top part, also sent to reviewers)
```
fastauthz 1.0.0rc1 - review brief
Time box: 2-4 hours. Version: 1.0.0rc1 on TestPyPI / PyPI pre-release.
Read: README, docs "Security model" page, main TDD sections 6 (truth rules), 9 (SQL), 12 (FastAPI), 17.
Try: the "try to break it" list below, with the example apps (examples/*).
Report security problems PRIVATELY: GitHub -> Security -> Report a vulnerability.
Report everything else: a GitHub issue with label `review-1.0`.
For each finding give: a small policy + data that shows it, versions, expected vs actual.
```

### 8.3 Review checklist
- Default deny: is there any path that returns allowed without a `TRUE` final value?
- Deny wins: can any combination of allow rules beat a deny?
- Fail closed: None actor, missing attribute, NULL column, not-loaded relationship, crashing check.
- Python vs SQL: same answer for the same data, both databases.
- Tenant scope: can a user see another tenant's row without `bypass_scope=True`?
- HTTP: do status codes, bodies, headers or timings reveal ids, rule names or values?
- Logs: do logs or `on_decision` records hold personal data?
- API: is any unsafe pattern easy to write by mistake? Are docs clear about raw `select()`?

### 8.4 "Try to break it" list
1. Make `policy.can()` and `policy.filter()` disagree for one row (any DB).
2. Get access with a `NULL` value, a missing actor field, or `actor=None`.
3. Make a deny rule not apply (scope, roles, `"*"` actions, `who`).
4. Read another tenant's row without `bypass_scope=True`.
5. Get any user value into SQL text (not a bound parameter).
6. Tell "exists but forbidden" from "does not exist" with `load()` in 404 mode.
7. Get a rule name or a value into an HTTP response.
8. Change a frozen policy through the public API.
9. Write a rule with `and` / `or` / chained comparisons / missing parentheses that is accepted silently.
10. Float edge cases: `NaN` in a column or actor value, `-0.0`, `inf` (see 11.1).
11. String compare edge cases on PostgreSQL with a non-`C` collation: `<`, `>` (see 11.2).
12. Dates: timezone-aware vs naive `datetime` between actor and column (see 11.3).
13. Type mixes: `bool` vs `int` (`True == 1`), `Decimal` vs `float`, `Enum` column vs `str` literal.
14. Custom `check=` that returns a non-bool, raises, or is slow; `sql=` twin that disagrees.
15. Huge `in_()` lists from the actor (parameter limits: SQLite 32766, PostgreSQL 65535).

### 8.5 Tracking and fixing
- Each finding gets a row in `core_docs/reports/M5_review.md`:
  `| id | reviewer | summary | severity (high/med/low/info) | status (fixed/wontfix/docs) | PR | test |`.
- Severity "high" = any way to get allowed when the docs say denied, or a tenant leak, or a data
  leak. High findings block `1.0.0`.
- Security fixes: private advisory -> fix in a private fork / advisory branch -> release -> publish
  the GitHub Security Advisory (SECURITY.md timelines: reply 3 days, fix or plan 14 days).
- Every real bug gets a regression test (a `test_tmNN_...` if it fits a row, else a new row in
  main TDD 17.1 **at the end of the table** + a test; quick-prompts "Bug fix" steps).
- Every engine disagreement also becomes a Hypothesis `@example`.
- "wontfix" needs a written reason in the report and, if user-visible, a docs note.

---

## 9. Release checklist for 1.0.0

### 9.1 Before the rc
- [ ] All M5 tests green on the full nightly matrix for 3 nights in a row.
- [ ] Mutation gate >= 0.90 per file; report written.
- [ ] Coverage: 100% core, >= 95% overall.
- [ ] Public API snapshot reviewed line by line.
- [ ] Docs, FSD, TDD, QUICK_REFERENCE match the code (walk the main TDD section list; fix diffs).
- [ ] `fastauthz check --strict` passes on all three example apps.

### 9.2 Version and metadata
- `src/fastauthz/_version.py`: `__version__ = "1.0.0rc1"`, later `"1.0.0"`.
- `pyproject.toml`: classifier `Development Status :: 5 - Production/Stable` (for `1.0.0`; `4 - Beta`
  for the rc); `Typing :: Typed`; Python version classifiers 3.11-3.15; project URLs (Docs,
  Changelog, Issues, Source, Security).
- `README.md`: remove "design stage" note; status badge -> PyPI version badge; Scorecard badge.
- `SECURITY.md`: supported versions table:
  ```
  | Version | Supported |
  |---|---|
  | 1.0.x   | yes       |
  | < 1.0   | no        |
  ```

### 9.3 CHANGELOG
- One section per released version since `0.1.0`, Keep a Changelog headings
  (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`).
- `## [1.0.0] - YYYY-MM-DD` with: "First stable release. Public API is frozen (SemVer)." and the
  changes since the last `0.x`.
- Link references at the bottom (`[1.0.0]: https://github.com/<owner>/fastauthz/compare/v0.N.0...v1.0.0`).

### 9.4 Tag and release
```bash
git switch main && git pull
uv run pytest && uv run pytest -m postgres && uv run ruff check . && uv run pyright
git tag -s v1.0.0rc1 -m "fastauthz 1.0.0rc1"    # signed tag if a key is set up; else -a
git push origin v1.0.0rc1                        # release.yml: TestPyPI + PyPI pre-release
# review period (section 8), fixes, maybe rc2 ...
git tag -s v1.0.0 -m "fastauthz 1.0.0" && git push origin v1.0.0
```
- Approve the `pypi` environment deployment in the Actions UI.
- After publish: install from PyPI in a clean venv, run the blog example, verify attestations (6.5).

### 9.5 GitHub release notes template
```markdown
## fastauthz 1.0.0

Write each permission rule once. Use it to check one object (Python) and to filter list
queries (SQL), with the same answer. For FastAPI + SQLAlchemy 2.0.

### Highlights
- Rules in plain Python with `R` and `A`; default deny, deny wins, fail closed.
- `query`, `load`, `require`, `guard` FastAPI dependencies; RFC 9457 errors; permissions in OpenAPI.
- Tenant scope with startup errors when a model cannot be scoped.
- `fastauthz check` and `fastauthz matrix` for CI and security reviews.

### Stability
The public API is frozen. From now on we follow SemVer.

### Upgrading from 0.x
<list of breaking changes since the last 0.x, or "No changes needed.">

### Not in 1.0
Field-level permissions, unlimited-depth trees, MySQL in CI, other ORMs. See the roadmap.

### Verify this release
`pypi-attestations verify pypi --repository https://github.com/<owner>/fastauthz pypi:fastauthz-1.0.0-py3-none-any.whl`

### Thanks
<reviewers who agreed to be credited>

Full changelog: <compare link>
```

---

## 10. Launch posts

### 10.1 Order (one per day, so each gets attention and feedback can shape the next)
1. FastAPI GitHub Discussions, category "Show and tell".
2. r/FastAPI.
3. r/Python, with the "Showcase" flair. r/Python showcase posts must have the sections
   **What My Project Does**, **Target Audience**, **Comparison**.
4. Hacker News "Show HN" (weekday, morning US Eastern). Title under 80 chars, e.g.
   `Show HN: fastauthz - one permission rule for object checks and SQL filters (FastAPI)`.

### 10.2 Honest-tone rules
- Written by the author, in the author's own words. No AI-generated launch text (r/FastAPI is
  quick to call posts "AI slop", and it is not honest anyway).
- No hype words ("blazing", "revolutionary", "game-changer").
- Say clearly: it is not authentication; it needs SQLAlchemy for filters; relationship depth is
  limited to 3; a raw `select()` you write by hand is not protected.
- Say when another tool is better: Cerbos for many services in many languages; casbin if you
  already use its model files.
- Credit oso as the inspiration for partial evaluation.
- Disclose you are the author. No vote asking, no sock puppets.
- Answer every comment within 24 hours for the first 3 days. Turn real problems into issues.

### 10.3 Post outline (adapt per venue)
```
1. The pain (2 lines): rules repeated in every route; one forgotten WHERE leaks data.
2. The idea (code, 8 lines): policy.allow(...); Depends(authz.query(...)); Depends(authz.load(...)).
3. What makes it different (3 bullets): same rule in Python and SQL, proven with property tests;
   fail closed with three-valued logic; startup errors (typos, missing tenant column).
4. What it does not do (3 bullets).
5. Status: 1.0.0, MIT, zero core dependencies, Python 3.11-3.15.
6. Links: docs, repo, the security model page, the comparison page.
7. Ask: "I would love rules from your app that fastauthz cannot express."
```

---

## 11. Risks and open questions

Each has a recommended answer. Items 11.1-11.4 touch the truth rules: if accepted, update main
TDD 6 / 5.7 with an ADR, add the cases to the Hypothesis strategy, and run both databases.

1. **11.1 Float `NaN` (and `inf`).** Python: `nan == nan` is `False` and every order compare with
   `nan` is `False`. PostgreSQL: `NaN = NaN` is `TRUE` and `NaN` is greater than every number, so
   `R.score > 5` is `TRUE` for a `NaN` row in SQL but `FALSE` in Python. SQLite stores `NaN` as
   `NULL`. The filter would list a row that `can()` denies. **Recommended:** reject `NaN` literals at
   build time (`ExpressionError`); treat a `NaN` actor value as `UNKNOWN` in `fold` and `evaluate`;
   for a `NaN` resource value, the engines can only agree if one side changes (for example Python
   copies the PostgreSQL ordering, or SQL adds a `col != 'NaN'` guard on `Float` columns, which
   SQLite does not need). This is a design change: write an ADR and pick one. Until it lands,
   document "do not store NaN in columns used by rules". Make sure the M2 strategy for
   `Item.score` includes `NaN` if `score` is a float.
2. **11.2 String order and collation.** `<`, `>` on strings in Python use code points; PostgreSQL
   uses the column collation (often `en_US.UTF-8`), so results differ. `==` is the same for
   deterministic collations. **Recommended:** run the PostgreSQL property tests with a database
   created with `LC_COLLATE` other than `C` to measure it; then either (a) FA warning for order
   compares on string columns, or (b) docs: "order compares on text use the database collation;
   Python checks may differ". Prefer (b) + a docs page note for 1.0 (no new code), (a) later.
3. **11.3 Aware vs naive `datetime`.** Python raises `TypeError` -> `UNKNOWN` (main TDD 6.3); SQL may
   compare them anyway (PostgreSQL casts `timestamp` vs `timestamptz`). **Recommended:** add the case
   to the Hypothesis strategy; if they differ, document "use aware datetimes everywhere" and add a
   startup warning only if `column_python_type` can tell (later).
4. **11.4 Custom `check=` returning a non-bool.** Main TDD 5.7 types it as `bool` but does not say what
   happens with `"no"` (truthy). **Recommended:** `result is True` -> `TRUE`, `result is False` ->
   `FALSE`, anything else -> `UNKNOWN` + WARNING. Fail closed. Update main TDD 5.7.
5. **11.5 Mutation run time** with Hypothesis. **Recommended:** the derandomized `mutation` profile
   (4.2); split per file if > 60 minutes (4.6).
6. **11.6 No outside reviewers.** **Recommended:** public "break it" call + stay on `rc` until at
   least one external review is done. Do not ship `1.0.0` reviewed only by the author.
7. **11.7 Pre-release noise** (FastAPI pre-releases break and get fixed upstream). **Recommended:**
   one open issue at a time (5.2 `report` job); fix `_compat.py` only for changes that reach a final
   release.
8. **11.8 Hypothesis example counts vs rule 8** ("constants only in `config.py`"). `config.py` is the
   library's settings. **Recommended:** test settings (profiles 500 / 2000 / 20000 / mutation) live in
   one place, `tests/conftest.py`, as named constants; write this in CLAUDE.md rule 8 ("library
   settings") in the same PR.
9. **11.9 Public `config` constants.** **Recommended:** internal in 1.0 (7.1). Users configure through
   constructor arguments.
10. **11.10 FA014 reachability.** If the builder rejects boolean nodes as `Compare` operands (main TDD
    5.1 operand types), FA014 can never fire. **Recommended:** keep the build-time error (fail early is
    better than a warning) and remove FA014 from main TDD 8.5, FSD F5, QUICK_REFERENCE, or mark it
    "reserved". Decide in M5-T6.
11. **11.11 Scorecard score** may stay low on Code-Review for a solo maintainer. **Recommended:** not a
    gate; record the number; ask reviewers to review PRs during the rc period.
12. **11.12 GitHub owner rename** is still pending (badges, trusted publisher, verify command use the
    owner). **Recommended:** finish the rename before M5-T17; trusted publisher must match the final
    owner/repo or uploads fail.

---

## 12. Exit criteria

- `tests/security/` has `test_tm01_*` ... `test_tm14_*`; the index test passes; all pass on SQLite
  and PostgreSQL.
- Mutation score >= 0.90 for each of `truth.py`, `evaluate.py`, `sql.py`; triage file reviewed;
  `core_docs/reports/M5_mutation.md` written.
- Nightly workflow green 3 nights in a row; the `report` job tested once (by a forced failure on a
  branch via `workflow_dispatch` with a failing input, then reverted).
- `test_workflows_pinned.py` passes; Dependabot config merged; Scorecard runs and the badge shows.
- `release.yml` produced `1.0.0rc1` and `1.0.0` from tags; PyPI shows attestations for both files.
- Public API snapshot and typing tests pass; `FastAuthzDeprecationWarning` exists and is documented.
- `core_docs/reports/M5_review.md` lists every finding with status; no open "high".
- CHANGELOG, README, SECURITY.md updated; docs/FSD/TDD match the code.
- `uv run pytest`, `uv run pytest -m postgres`, `uv run ruff check .`, `uv run pyright` pass, with
  output shown in the final PR.
- Launch posts published.

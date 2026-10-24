# Technical Design Document (TDD)
## HonestAgent - test-integrity gate for agent pull requests

**Version:** 1.0 (draft, v1 only)
**Date:** 2026-10-24
**Related:** `FUNCTIONAL_SPECIFICATIONS.md` (what, F1-F12), `MILESTONES.md` (when, M0-M4), `TECH_STACK.md` (with what), `decisions/ADR-001-pivot-to-test-integrity-gate.md` (why)

> Simple English. This doc says **how** HonestAgent v1 is built. No code exists yet.
> Anything past v1 is in section 17, one line each.

---

## 1. Overview

HonestAgent is one Python package with one CLI command that matters: `honestagent check`.
It reads two versions of a repo from git, compares the test files, test config and CI
files, and prints a report with a **verdict**. It answers one question: "Are the tests
real, or did the agent cheat to make them pass?"

It is stateless. No server, no database, no UI. Every run starts from git and ends with
a report and an exit code.

```
  pre-commit (F9)   GitHub Action (F10)   Claude Code hook (F11)   you, in a terminal
        |                   |                      |                       |
        +-------------------+----------+-----------+-----------------------+
                                       |
                                       v
                          honestagent check  (cli.py, F8)
                                       |
                    config.py  <-------+  load + validate config from the base ref (F7)
                                       |
                                       v
                 git.py  -- subprocess, list args, read-only (F1)
                                       |
                                       v
                 changes.py  -> ChangeSet: ChangedFile[] with before/after text (F1, F2)
                                       |
                                       v
                 rules/  RULES registry: HA001 ... HA007  -> Finding[] (F3)
                 (HA000 notes come from changes.py, the engine and allow.py)
                 mutation.py (only with --mutation)        -> HA100 Finding[] (F12)
                                       |
                                       v
                 allow.py   mark findings allowed (marker or config) (F4)
                                       |
                                       v
                 verdict.py pure function -> Verdict (F5)
                                       |
                                       v
                 report/text.py | report/markdown.py | report/json.py (F6)
                                       |
                                       v
                       stdout or --output FILE, then exit code 0 / 1 / 2
```

---

## 2. Design principles

1. **One package, no services.** `honestagent` in a `src/` layout. A stateless CLI that reads
   git and prints a report.
2. **CLI first.** The pre-commit hook, the GitHub Action and the Claude Code hook only call
   `honestagent check`. They hold no logic of their own except "post the comment" and
   "map the exit code".
3. **Deterministic.** Same input, same output, byte for byte. No LLM. No network in the core.
   No clock or random values in the report. Findings are always sorted.
4. **Read-only.** We never edit, commit or push the user's code. The only exception is the
   mutation check (M3), which writes only inside a temp `git worktree` that we remove.
5. **Git through `subprocess` with a list of args.** Never a shell string.
6. **One rule registry.** `RULES` in `rules/__init__.py`. Each rule is a pure function
   `(ChangeSet, Config) -> list[Finding]`.
7. **Constants live in `config.py`.** Defaults, limits, globs, file names. No magic values
   in other modules.
8. **Tests first.** Every rule gets recorded PR fixtures before it gets code.
9. **Show, do not hide.** Allowed findings still appear in every report. Skipped files are
   listed with the reason.

---

## 3. Package layout

```
HonestAgent/
  pyproject.toml                  # package, deps, [project.scripts] honestagent = "honestagent.cli:app"
  action.yml                      # F10 composite GitHub Action
  .pre-commit-hooks.yaml          # F9 pre-commit hook definition
  hooks/claude-code/              # F11 sample settings.json snippet + README
  src/honestagent/
    __init__.py                   # __version__ only
    cli.py                        # Typer app: check, rules, explain, version; exit codes (F8)
    config.py                     # all defaults and limits; load + validate config (F7)
    git.py                        # every git call; returns plain Python values or raises GitError
    changes.py                    # build the ChangeSet: file list, before/after text, changed lines, is_test (F1, F2)
    models.py                     # Pydantic models: ChangedFile, ChangeSet, Finding, Severity, Verdict, Report
    rules/
      __init__.py                 # Rule dataclass + RULES registry + run_rules()
      _pyast.py                   # shared AST helpers: parse, collect tests, resolve import aliases
      test_deleted.py             # HA001
      skip_added.py               # HA002
      assertion_weakened.py       # HA003
      coverage_lowered.py         # HA004
      ci_lint_weakened.py         # HA005
      snapshot_rewritten.py       # HA006
      gate_config_weakened.py     # HA007
    allow.py                      # parse allow markers + config allow list; mark findings; HA000 for markers with no reason (F4)
    verdict.py                    # pure verdict function (F5)
    report/
      text.py                     # Rich terminal output (F6)
      markdown.py                 # PR comment and proof report (F6)
      json.py                     # JSON report, schema_version 1 (F6)
    mutation.py                   # mutmut on changed lines in a temp worktree; HA100 (F12, M3)
  tests/
    fixtures/prs/<case>/          # before/, after/, expected.json
    golden/                       # expected markdown and json output
    test_rules_*.py  test_verdict.py  test_cli.py  test_git.py  test_allow.py ...
```

`_pyast.py` is a private helper, not a rule. It keeps the "find the test functions" code
in one place, so HA001, HA002 and HA003 agree on what a test is.

---

## 4. Data models (`models.py`)

All models are Pydantic v2, `frozen=True`. Paths are POSIX strings relative to the repo
root (git always gives `/`, also on Windows).

```python
class FileStatus(StrEnum):
    added = "added"; modified = "modified"; deleted = "deleted"; renamed = "renamed"

class ChangedFile(BaseModel):
    path: str                     # path on the after side (for deleted: the old path)
    status: FileStatus
    old_path: str | None = None   # only for renamed
    before_text: str | None       # None when added, binary or skipped
    after_text: str | None        # None when deleted, binary or skipped
    is_test: bool                 # matches test_paths (F2), checked on path (and old_path)
    changed_lines: frozenset[int] # after-side line numbers added or changed (empty for deleted)
    skipped_reason: str | None = None   # "binary", "too large", "not utf-8"

class ChangeSet(BaseModel):
    mode: Literal["refs", "staged", "working"]
    base: str                     # full SHA
    head: str                     # full SHA, or "index" / "working-tree"
    repo_root: str
    files: tuple[ChangedFile, ...]   # sorted by path

    def tests(self) -> Iterator[ChangedFile]: ...     # is_test and .py
    def sources(self) -> Iterator[ChangedFile]: ...   # .py, not test, not snapshot
    def by_path(self, path: str) -> ChangedFile | None: ...

class Severity(StrEnum):
    high = "high"; medium = "medium"; low = "low"

class Verdict(StrEnum):
    has_problems = "has_problems"; take_a_look = "take_a_look"; looks_good = "looks_good"

class Finding(BaseModel):
    rule_id: str                  # "HA000" ... "HA007", "HA100"
    name: str                     # "test-deleted"
    severity: Severity
    file: str
    line: int | None              # None = whole file (deleted file, config-level change)
    message: str                  # one plain sentence
    before: str | None = None     # short snippet, see SNIPPET_MAX_LINES
    after: str | None = None
    allowed: bool = False
    allow_reason: str | None = None

class Report(BaseModel):
    schema_version: Literal[1] = 1
    honestagent_version: str
    verdict: Verdict
    mode: Literal["refs", "staged", "working"]
    base: str
    head: str
    counts: Counts                # high, medium, low, allowed, total
    findings: tuple[Finding, ...] # sorted
    skipped: tuple[SkippedFile, ...]   # path + reason

class Counts(BaseModel):
    high: int; medium: int; low: int     # not-allowed findings only
    allowed: int; total: int

class SkippedFile(BaseModel):
    path: str
    reason: str                   # "binary", "too large", "syntax error on line 12", ...
```

Sort order for findings everywhere: `(file, line or 0, rule_id, message)`.

---

## 5. Git layer (`git.py`, `changes.py`)

### 5.1 Rules for every git call

- `subprocess.run(["git", "-C", repo_root, ...], capture_output=True, check=False)`.
  Never `shell=True`.
- Env: `LC_ALL=C`, `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0` (no lock files, so we
  stay read-only even for `git status`-style calls).
- Every user ref is resolved once to a full SHA with
  `git rev-parse --verify --end-of-options <ref>^{commit}`. After that only SHAs go to git.
  This stops a ref like `--output=x` from being read as an option.
- File lists use `-z` (NUL separated), so paths with spaces or new lines are safe.
- A non-zero git exit raises `GitError(message, hint)`. The CLI turns it into exit code `2`.

### 5.2 Exact commands per mode (F1)

| Step | `--base/--head` (mode `refs`) | `--staged` | `--working` |
|---|---|---|---|
| Repo root | `git rev-parse --show-toplevel` | same | same |
| Base SHA | `--base`, or default (5.3) | `HEAD` | `HEAD` |
| Head | `--head` (default `HEAD`) | the index | the working tree |
| Changed files | `git diff --name-status -z -M --no-ext-diff <base>...<head>` | `git diff --cached --name-status -z -M --no-ext-diff <base>` | `git diff --name-status -z -M --no-ext-diff <base>` + untracked: `git ls-files --others --exclude-standard -z` (status added) |
| Changed lines | `git diff -U0 --no-color --no-ext-diff -M <base>...<head> -- <path>` | `git diff --cached -U0 ... <base> -- <path>` | `git diff -U0 ... <base> -- <path>` (untracked: all lines) |
| Binary check | `git diff --numstat -z -M ...` (same range); `-\t-` means binary | same | same + NUL byte check for untracked |
| Before text | `git cat-file --batch` with `<base>:<old_path or path>` | same | same |
| After text | `git cat-file --batch` with `<head>:<path>` | `git cat-file --batch` with `:<path>` (index) | read from disk: `repo_root / path` |

Notes:
- **Three dots** (`<base>...<head>`) means "diff from the merge-base of base and head".
  So a PR base SHA that moved ahead still gives only the PR's own changes.
- **Rename detection** is `-M` (git's default 50% similarity). A rename gives status `R`,
  so the file is `renamed` with `old_path`. Copies (`C`) are treated as `added`.
- **Empty repo** (no `HEAD` yet, `--staged` on the first commit): base is the empty tree,
  from `git hash-object -t tree --stdin` with empty input. All files are `added`.
- `git cat-file --batch` reads all blobs in one process. This is the main speed trick
  (section 15). Before reading, `git cat-file --batch-check` gives the size; files over
  `MAX_FILE_BYTES` are not read.
- Changed lines come from the `@@ -a,b +c,d @@` hunk headers: lines `c .. c+d-1` on the
  after side. A hunk with `d = 0` (pure delete) adds line `c` (the line after the cut), so a
  rule can still point near the removed code.

### 5.3 Default base

When `--base` is not given in `refs` mode:
1. Default branch = `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`
   (for example `origin/main`).
2. If that fails, the first of `DEFAULT_BRANCH_CANDIDATES = ("main", "master")` that exists
   (`git rev-parse --verify --quiet refs/heads/<name>`).
3. Base = `git merge-base <default branch> <head>`.
4. If nothing is found: exit `2` with "Could not find the default branch. Pass --base."

If the head is on the default branch itself, the merge-base equals the head, the change set
is empty, and the verdict is "Looks good" with the note "No changes to check."

### 5.4 Reading text

- Decode as UTF-8 (`utf-8-sig`, so a BOM is dropped). If decoding fails, the side is
  `None` and `skipped_reason = "not utf-8"`.
- Normalize line endings to `\n` on both sides before any rule sees the text. CRLF changes
  alone are never findings.
- Binary files and files over `MAX_FILE_BYTES` are kept in the ChangeSet (so HA001 still
  sees a deleted test file and HA006 still sees a changed snapshot) but with no text. They
  are listed in `Report.skipped`, and `changes.py` emits one HA000 note (low) per skipped
  file: "File skipped: binary." / "File skipped: too large."
- More than `MAX_CHANGED_FILES` changed files: we keep the first ones in path order, list
  the rest as skipped ("too many changed files"), and say so in the report.

### 5.5 `is_test` (F2)

- `test_paths` globs (default from F2: `tests/**/*.py`, `**/test_*.py`, `**/*_test.py`,
  `**/conftest.py`) are matched with our own small glob function in `changes.py`, because
  `fnmatch` lets `*` cross `/` and `**/` cannot match zero folders.
- Glob meaning: `*` = any chars except `/`; `**/` = zero or more folders; a pattern with
  no `/` matches the file name in any folder (`setup.cfg` matches `a/b/setup.cfg`).
- A renamed file is a test if the new path **or** the old path matches. HA001 uses the
  difference (test before, not a test after) to catch "renamed out of collection".

---

## 6. Rule engine (`rules/`)

### 6.1 Registry

```python
RuleFn = Callable[[ChangeSet, Config], list[Finding]]

@dataclass(frozen=True)
class Rule:
    id: str                    # "HA001"
    name: str                  # "test-deleted"
    default_severity: Severity
    summary: str               # one line for `honestagent rules`
    explain: str               # text for `honestagent explain` (what, example, how to allow)
    check: RuleFn | None       # None for HA000 (notes from changes.py, the engine, allow.py)
                               # and HA100 (findings from mutation.py)

RULES: dict[str, Rule] = {r.id: r for r in
                          (HA000, HA001, HA002, HA003, HA004, HA005, HA006, HA007, HA100)}
```

`run_rules(changes, config)`:
1. For each rule in `RULES` order, skip it if its ID is in `config.disable` or `check` is
   `None`. HA000 and HA100 are registered with `check=None` only so that `rules` and
   `explain` list them.
2. Call `check(changes, config)`. A rule that raises is a bug: we let it crash (exit `2`)
   in tests, and in the CLI we print "Internal error in HA00x" and exit `2`. We never return
   a half verdict.
3. Add the HA000 notes collected while building the ChangeSet and parsing (skipped files,
   syntax errors), unless HA000 is in `config.disable`.
4. If `config.severity` has the rule ID, every finding of that rule gets that severity.
5. Return all findings, sorted.

Rules never read files or call git. They only read the ChangeSet. That makes them pure and
easy to test.

### 6.2 How AST comparison works (`_pyast.py`)

1. `parse(text)` = `ast.parse(text)`, cached by text hash. A `SyntaxError` means "this side
   cannot be compared": the file goes to `Report.skipped` with "syntax error on line N", the
   AST rules skip it, and the engine adds one HA000 note (low) for the file. (pytest would
   fail to collect it anyway, so CI will show it.)
2. `aliases(tree)` maps local names to full names from the imports:
   `import pytest as pt` -> `pt` = `pytest`; `from pytest import mark` -> `mark` =
   `pytest.mark`; `from unittest import skip` -> `skip` = `unittest.skip`.
   `dotted(node, aliases)` turns `pt.mark.skip` or `mark.skip(...)` into `pytest.mark.skip`.
3. `collect_tests(tree)` returns `{qualname: TestItem}` using pytest's default collection
   rules:
   - module-level `def test*` / `async def test*` -> `test_login`
   - methods `test*` in classes named `Test*` that have no `__init__` ->
     `TestApi::test_login`
   - methods `test*` in classes that inherit from `unittest.TestCase` (by alias) ->
     `ApiTests::test_login`
   - nested classes are walked the same way (`TestA::TestB::test_x`).
   Each `TestItem` keeps: the node, the start line, the decorator full names, a
   `body_key` (`ast.dump` of the body without line numbers), and the class decorators.
4. Tests are matched between before and after **by qualname**. Then each rule compares the
   two `TestItem`s. A test whose `body_key` and decorators are the same is "unchanged" and
   most rules skip it.

### 6.3 HA001 test-deleted (high)

Algorithm:
1. Deleted file whose path is a test file and whose before side had at least one test ->
   one finding for the file (`line = None`), message "Test file deleted with N tests."
2. Renamed file that was a test file before and is not a test file after (does not match
   `test_paths`) -> one finding: "Test file renamed to a path pytest does not collect."
3. For each test file present on both sides: every qualname in before but not in after is a
   candidate.
4. Drop candidates that are really moves or renames:
   - a test with the same `body_key` appears as a **new** qualname in the same file
     (`test_foo` -> `test_foo_handles_empty`, body unchanged), or
   - a test with the same qualname and the same `body_key` appears in another test file of
     the ChangeSet (moved file to file).
   A rename to a non-test name (`test_x` -> `_test_x`, `helper_x`) is **not** dropped,
   because the new name is not a test.
5. One finding per remaining candidate. `line` is the nearest after-side changed line
   (from 5.2), `before` is the first lines of the removed test.

Known false positives: a test removed on purpose with its feature (allow it in config with
a reason); a test whose body changed **and** got renamed in one change.
Known false negatives: fewer `@pytest.mark.parametrize` cases; custom `python_functions` /
`python_classes` settings in pytest config (v1 uses pytest defaults).

### 6.4 HA002 skip-added (high)

Python test files, per test present in after:
1. Count "skip marks" on before and after: decorators (on the function or its class)
   whose full name is in `SKIP_DECORATORS = {"pytest.mark.skip", "pytest.mark.skipif",
   "pytest.mark.xfail", "unittest.skip", "unittest.skipIf", "unittest.skipUnless",
   "unittest.expectedFailure"}`,
   with or without a call.
2. Count skip calls in the body: `pytest.skip(...)`, `pytest.xfail(...)`.
3. Module level: a `pytestmark = ...` assignment that contains a skip mark.
4. After count > before count (a new test counts as before = 0) -> finding at the new
   mark's line. A new test that is skipped from day one is also flagged: it adds nothing.

Config and collection files, line level:
5. `--ignore=` / `--ignore ` / `--deselect` in `addopts` of `pyproject.toml`
   (`[tool.pytest.ini_options]`), `pytest.ini`, `tox.ini`, `setup.cfg`
   (`[pytest]` / `[tool:pytest]`), and in `run:` lines of CI workflow files: a path that is
   in after and not in before -> finding.
6. `conftest.py`: `collect_ignore` / `collect_ignore_glob` list literals (assign or
   `+=` / `.append` / `.extend`) that gain an entry -> finding.

Known false negatives: `self.skipTest()`, `pytest.importorskip()`, skips through a custom
marker or a `pytest_collection_modifyitems` hook, `-k "not x"` filters.

### 6.5 HA003 assertion-weakened (high; expected-value rewrite: medium)

Only for tests present on both sides with a changed `body_key`. Five checks:

1. **Fewer asserts.** `assert_count` = `ast.Assert` nodes + calls to `self.assert*` +
   `with pytest.raises(...)` / `pytest.warns(...)` blocks. After < before -> finding.
2. **Trivial replacement.** Split asserts into "strong" (a `Compare` with `==`, `!=`, `<`,
   `>`, `in`, ..., or `self.assertEqual`-style calls with two args) and "trivial":
   `assert True`, `assert <truthy constant>`, `assert x` (a bare name or attribute),
   `assert x is not None`. Strong count goes down **and** trivial count goes up ->
   finding at the first new trivial assert.
3. **Wider raises.** `pytest.raises(X)` where before had a specific class and after has
   `Exception` or `BaseException` (by alias) in the same test -> finding.
4. **Looser approx.** `pytest.approx(..., rel=a, abs=b)`: matched by position in the test.
   A literal `rel` or `abs` that grew, or appeared where there was none (pytest default is
   `rel=1e-6`) -> finding. Non-literal tolerances are skipped.
5. **Expected value rewritten (medium).** Only when the ChangeSet also changes a source
   file that this test file imports (`from pkg.mod import f` -> `pkg/mod.py` or
   `src/pkg/mod.py`). Asserts are paired by the `ast.dump` of their non-constant side
   (for example the call `total(cart)`). If the pair's constant side changed
   (`== 120` -> `== 125`) -> medium finding: "Expected value changed in the same change as
   the code it tests."

Known false positives: real refactors that merge asserts into a helper
(`assert_valid(resp)`); a fixed wrong expected value (check 5 is medium for this reason).
Known false negatives: asserts moved into helpers or fixtures; weaker `match=` patterns.

### 6.6 HA004 coverage-lowered (high)

Line-level and config-level, not AST.

| File | Where we look |
|---|---|
| `pyproject.toml` | `[tool.coverage.report] fail_under`; `--cov-fail-under` in `[tool.pytest.ini_options] addopts` |
| `setup.cfg` | `[coverage:report] fail_under`; `--cov-fail-under` in `[tool:pytest] addopts` |
| `.coveragerc` | `[report] fail_under` |
| `tox.ini` | `[coverage:report] fail_under`; `--cov-fail-under` anywhere |
| `pytest.ini` | `--cov-fail-under` in `[pytest] addopts` |
| CI files (`CI_FILE_GLOBS`) | regex `--cov-fail-under[= ](\d+(\.\d+)?)` and `fail_under` in any line |

Algorithm per file: collect all threshold values on each side (TOML with `tomllib`, INI
with `configparser`, regex as fallback if parsing fails). Finding when the lowest after
value is below the lowest before value, or before had a value and after has none (also
when the file was deleted). Message: "Coverage threshold lowered from 90 to 80."

Known false negatives: thresholds set through env vars or a Makefile.

### 6.7 HA005 ci-or-lint-weakened (medium)

1. **Workflow files** (`.github/workflows/*.yml|*.yaml`): parse both sides with
   `yaml.safe_load`. For each job, a step is a "check step" when its `run` text contains
   a word from `CHECK_COMMANDS` (`pytest`, `tox`, `nox`, `ruff`, `flake8`, `mypy`,
   `pyright`, `pylint`, `coverage`, `pre-commit`) or its `uses` starts with an entry of
   `CHECK_ACTIONS` (`pre-commit/action`). Steps are matched by `name`, else by `run`
   text, else by `uses`. Findings:
   - a check step or a job with check steps removed;
   - `continue-on-error: true` added on a job or step that runs checks;
   - `|| true` or `|| exit 0` added in a `run` line of a check step.
   If YAML does not parse, fall back to the line checks only.
2. **`tox.ini`, `noxfile.py`**: removed lines that contain a `CHECK_COMMANDS` word and are
   not added back elsewhere in the file; added `|| true` / `ignore_outcome = true`.
3. **`.pre-commit-config.yaml`**: a hook `id` present before and missing after.
4. **Lint config ignore lists**: codes added to `LINT_IGNORE_KEYS` - ruff `ignore`,
   `extend-ignore`, `per-file-ignores` (in `pyproject.toml`, `ruff.toml`, `.ruff.toml`);
   flake8 `ignore`, `extend-ignore`, `per-file-ignores` (in `setup.cfg`, `tox.ini`,
   `.flake8`); mypy `disable_error_code`; pyright rules switched to `"none"` / `false`.
   We compare sets of codes, so reordering is not a finding.
5. **Inline suppressions** in any changed `.py` file: an added line (from `changed_lines`)
   with `# noqa`, `# type: ignore` or `# pragma: no cover`, unless the same marker text was
   already on a removed line of the same hunk (a moved line is not new).

Known false positives: a CI job removed because it moved to another workflow file (we do
match steps across workflow files in the same ChangeSet to reduce this).
Known false negatives: `if: false` on a step, a check moved into a script we do not read.

### 6.8 HA006 snapshot-rewritten (medium)

1. Snapshot file = path matches `SNAPSHOT_GLOBS = ("**/__snapshots__/**", "**/*.ambr",
   "**/snapshots/**")`.
2. If the ChangeSet has at least one changed source file (`ChangeSet.sources()`), then
   every snapshot file that is `modified`, `deleted` or `renamed` gets one finding
   (`line = None`): "Snapshot changed in the same change as source code."
3. New snapshot files (`added`) are not flagged; new tests need new snapshots.

Known false positives: a real UI or output change (allow in config with a reason).

### 6.9 HA007 gate-config-weakened (medium, `rules/gate_config_weakened.py`)

Why: the config is read from the base ref (10.1), so an agent cannot switch the gate off in
the same change. This rule makes the attempt visible.

1. Gate config files = `pyproject.toml` (only the `[tool.honestagent]` table) and
   `.honestagent.toml` at the repo root (`GATE_CONFIG_FILES` in `config.py`). Only these
   paths in the ChangeSet are read.
2. Parse both sides with `tomllib` into a plain dict (missing file or table = `{}`). A side
   that does not parse is compared as `{}` (the CLI already fails with exit `2` if the base
   config is bad). If both files exist on one side, `.honestagent.toml` is the one used,
   same as 10.1.
3. Fill missing keys with the defaults from `config.py`, so a removed key means "back to the
   default".
4. Compare before -> after. One finding per weakening:
   - a rule ID in after `disable` that is not in before `disable`;
   - a rule whose effective severity went down (`high` > `medium` > `low`);
   - an `allow` entry in after that is not in before (compared as `(rule, path)`);
   - `fail_on` got looser (order `take_a_look` < `has_problems` < `never`).
5. `line` = the after-side line of the key when it can be found by a text search, else
   `None`. Message, for example: "Gate config changed: HA002 added to disable."

Not findings: stricter changes, `test_paths` and `mutation.*` changes, new inline allow
markers (those are handled by `allow.py` and always listed under "Allowed", 7.3).

---

## 7. Allow markers and the config allow list (`allow.py`, F4)

### 7.1 Inline marker

```
# honestagent: allow HA002 -- flaky on CI, see issue #12
```

Regex (in `config.py` as `ALLOW_MARKER_RE`):

```
#\s*honestagent:\s*allow\s+(HA\d{3})\s*(?:--\s*(?P<reason>\S.*?))?\s*$
```

- Searched only in the **after** text, on the finding's line or the line above.
- Works in any file with `#` comments: Python, YAML, TOML, INI.
- The rule ID must match the finding's rule.
- One rule ID per marker in v1 (the regex takes one ID).
- A marker with no reason (nothing after `--`) is ignored and produces an HA000 note (low)
  at the marker's line: "Allow marker has no reason, so it was ignored." Low findings never
  change the verdict.
- A marker that matches no finding is not reported (it may guard a line for later).

### 7.2 Config allow list

```toml
allow = [{ rule = "HA005", path = "tox.ini", reason = "py3.9 env dropped on purpose" }]
```

- `path` is matched with the same glob function as `test_paths`, so an exact path works.
- `reason` must be non-empty; an empty reason is a config error (exit `2`).
- Findings with `line = None` (a deleted file, a whole-file finding) cannot carry an
  inline marker. They are allowed only through this list.
- Findings on removed code (a removed test, a removed CI step) point to the after-side
  line where the code used to be (5.2), so a marker on that line or the line above works.

### 7.3 Effect

`apply_allows(findings, changes, config) -> list[Finding]` returns copies with
`allowed = True` and `allow_reason` set, plus the HA000 notes for markers with no reason.
Allowed findings stay in every report (their own section). The verdict ignores them.
Markers added in the change itself still count, so a human always sees every marker the
agent added in the "Allowed" section. The config `allow` list comes from the base ref, so
an `allow` entry added in the change has no effect and is an HA007 finding.

---

## 8. Verdict (`verdict.py`, F5)

| Verdict | JSON value | When |
|---|---|---|
| Has problems | `has_problems` | At least one not-allowed **high** finding |
| Take a look | `take_a_look` | No high, but at least one not-allowed **medium** finding |
| Looks good | `looks_good` | No not-allowed high or medium findings |

```python
def verdict(findings: Iterable[Finding]) -> Verdict:
    active = [f for f in findings if not f.allowed]
    if any(f.severity is Severity.high for f in active):
        return Verdict.has_problems
    if any(f.severity is Severity.medium for f in active):
        return Verdict.take_a_look
    return Verdict.looks_good
```

Gate: order is `looks_good < take_a_look < has_problems`. With `--fail-on X`, the gate
fails when the verdict is at or worse than `X`. `never` never fails. Both are pure
functions with a test for every row.

---

## 9. Reports (`report/`, F6)

All three formats take the same `Report`. None of them adds a time stamp, so output is
stable for golden tests.

### 9.1 Text (`report/text.py`)

Rich `Console`. Colour only when stdout is a terminal (Rich's own detection, and
`NO_COLOR` is honoured). With `--output`, no colour.

```
Has problems  - 3 findings: 1 high, 2 medium. 1 allowed.

tests/test_cart.py
  42  high    HA002 skip-added           New @pytest.mark.skip on test_total_with_discount.
  57  medium  HA003 assertion-weakened   Expected value changed in the same change as the code it tests.
tox.ini
  12  medium  HA005 ci-or-lint-weakened  Test command removed from [testenv].

Allowed (1)
setup.cfg
   8  high    HA004 coverage-lowered     Coverage threshold lowered from 90 to 85. Reason: legacy module removed.

Allow a finding: add "# honestagent: allow HA002 -- <reason>" on the line or the line above.
```

### 9.2 Markdown (`report/markdown.py`)

Used for the PR comment and as the **proof report** file. Layout:

1. `<!-- honestagent -->` (first line, always; the Action finds the comment by it).
2. Verdict line with an emoji: `## 🔴 HonestAgent: Has problems`,
   `## 🟡 HonestAgent: Take a look`, `## 🟢 HonestAgent: Looks good`.
3. Summary: "3 findings: 1 high, 2 medium" (not-allowed findings only), plus the base and
   head short SHAs.
4. Table: `| Rule | Where | What |` with `HA002 skip-added (high)`,
   `` `tests/test_cart.py:42` ``, message.
5. `<details><summary>Before / after</summary>` with one fenced block pair per finding.
6. "Allowed findings" small table with the reason.
7. Skipped files, if any, in one line each.
8. Footer: "HonestAgent 0.1.0 - deterministic, no LLM. To allow a finding: ..."

Safety and size:
- Table cells escape `|` and new lines. Snippets use a code fence longer than the longest
  backtick run inside them. The text `<!-- honestagent -->` is removed from snippets.
- Limit: `MARKDOWN_MAX_CHARS = 65_536` (GitHub's comment limit). We build the full text;
  if it is too long we drop, in order: the `<details>` snippets, then table rows from the
  end. Then we add "N more findings not shown. Run `honestagent check` locally or use
  `--format json` for all of them." The final text is always under the limit
  (we aim for `MARKDOWN_TARGET_CHARS = 60_000` to leave room for the note).

### 9.3 JSON (`report/json.py`)

`Report.model_dump_json(indent=2)` with sorted findings. Schema version 1:

```json
{
  "schema_version": 1,
  "honestagent_version": "0.1.0",
  "verdict": "has_problems",
  "mode": "refs",
  "base": "3f2a...full sha",
  "head": "9c1d...full sha",
  "counts": { "high": 1, "medium": 2, "low": 0, "allowed": 1, "total": 4 },
  "findings": [
    {
      "rule_id": "HA002",
      "name": "skip-added",
      "severity": "high",
      "file": "tests/test_cart.py",
      "line": 42,
      "message": "New @pytest.mark.skip on test_total_with_discount.",
      "before": null,
      "after": "@pytest.mark.skip(reason=\"later\")\ndef test_total_with_discount():",
      "allowed": false,
      "allow_reason": null
    }
  ],
  "skipped": [ { "path": "assets/logo.png", "reason": "binary" } ]
}
```

Rules for the schema:
- `counts.high/medium/low` count not-allowed findings; `allowed` counts allowed ones;
  `total` counts all.
- `head` is a SHA in `refs` mode, `"index"` in `staged` mode, `"working-tree"` in `working`
  mode.
- Adding a field is allowed in schema 1. Renaming or removing one needs
  `schema_version: 2`.
- A JSON Schema file is generated from the Pydantic model in tests and compared to a golden
  copy, so a schema change is always a visible diff.

---

## 10. Config (`config.py`, F7)

### 10.1 Where it comes from

1. Find the repo root (`git rev-parse --show-toplevel`).
2. Pick the **base** ref: the base SHA in `refs` mode; `HEAD` in `staged` and `working`
   mode. Read the files from it with `git show <base>:<file>`, never from the working tree
   or the head. So an agent cannot switch the gate off in the same change (HA007, 6.9).
3. If `.honestagent.toml` exists at the root on that ref, use it. Its keys sit at the top
   level (no `[tool.honestagent]` header); mutation settings go under `[mutation]`.
4. Else, if `pyproject.toml` on that ref has `[tool.honestagent]`, use that table.
5. Else (or if there is no base commit yet, as in an empty repo) use the defaults.
6. If both files have config, `.honestagent.toml` wins and we print a one-line warning to
   stderr. We never merge the two.
7. CLI flags win over both files: `--fail-on` over `fail_on`, `--mutation` over
   `mutation.enabled`.

### 10.2 Model and validation

```python
class MutationConfig(BaseModel, extra="forbid"):
    enabled: bool = False
    max_mutants: int = Field(DEFAULT_MAX_MUTANTS, ge=1)      # 50
    timeout_sec: int = Field(DEFAULT_MUTATION_TIMEOUT, ge=1) # 300

class AllowEntry(BaseModel, extra="forbid"):
    rule: RuleId
    path: str
    reason: str = Field(min_length=1)

class Config(BaseModel, extra="forbid"):
    test_paths: list[str] = list(DEFAULT_TEST_PATHS)
    fail_on: Literal["has_problems", "take_a_look", "never"] = "has_problems"
    disable: list[RuleId] = []
    severity: dict[RuleId, Severity] = {}
    allow: list[AllowEntry] = []
    mutation: MutationConfig = MutationConfig()
```

- `RuleId` is validated against `RULES`. A typo like `HA0O5` is an error.
- `extra="forbid"`: an unknown key is an error, not a silent no-op.
- TOML syntax errors and validation errors exit `2` with the file name and the key path,
  for example `pyproject.toml: tool.honestagent.severity.HA005: must be high, medium or low`.

### 10.3 Constants in `config.py`

All of these live only in `config.py`: `DEFAULT_TEST_PATHS`, `SNAPSHOT_GLOBS`,
`CI_FILE_GLOBS`, `CHECK_COMMANDS`, `CHECK_ACTIONS`, `LINT_IGNORE_KEYS`, `SKIP_DECORATORS`,
`ALLOW_MARKER_RE`, `DEFAULT_BRANCH_CANDIDATES`, `GATE_CONFIG_FILES`, `MAX_FILE_BYTES`, `MAX_CHANGED_FILES`,
`SNIPPET_MAX_LINES`, `SNIPPET_MAX_CHARS`, `MARKDOWN_MAX_CHARS`, `MARKDOWN_TARGET_CHARS`,
`DEFAULT_MAX_MUTANTS`, `DEFAULT_MUTATION_TIMEOUT`, `CONFIG_FILE_NAME`.

---

## 11. CLI (`cli.py`, F8)

```
honestagent check [--base REF] [--head REF] [--staged | --working]
                  [--format text|markdown|json] [--output FILE]
                  [--fail-on has_problems|take_a_look|never] [--mutation]
honestagent rules                 # list all rules, their severity and on/off state
honestagent explain HA003         # what the rule catches, an example, how to allow it
honestagent version
```

`check` flow: parse flags -> load config -> build ChangeSet -> `run_rules` -> (mutation) ->
`apply_allows` -> `verdict` -> render -> write -> exit.

| Exit | Meaning |
|---|---|
| `0` | Gate passed (verdict better than `--fail-on`, or `--fail-on never`) |
| `1` | Gate failed (verdict at or worse than `--fail-on`; default `has_problems`) |
| `2` | Tool error. Nothing was judged. |

Tool errors (all exit `2`, message on stderr, report not written):

| Case | Message |
|---|---|
| Not inside a git repo / `git` not on PATH | "Not a git repo" / "git not found" |
| Bad `--base` / `--head` | "Unknown ref: X" |
| No default branch (no `origin/HEAD`, `main` or `master`) | "Could not find the default branch. Pass --base." |
| No merge-base (shallow clone) | "No common history between base and head. In GitHub Actions use `fetch-depth: 0`." |
| `--staged` with `--working`, or either with `--base/--head` | "Use only one of: --base/--head, --staged, --working" |
| Bad config: unknown key, unknown rule ID, bad value, `allow` entry without a reason | file + key path + what is wrong |
| `explain` with an unknown rule ID | "Unknown rule: X" |
| `--mutation` without mutmut | install hint (section 13) |
| `--mutation` with `--staged` or `--working` | "--mutation needs --base/--head (real refs)." |
| `--output` cannot be written | "Cannot write FILE" |
| Unexpected exception | "Internal error. Please open an issue with this output." + traceback with `-v` |

- The report goes to stdout (or `--output`). Errors and warnings go to stderr. So
  `honestagent check --format json > r.json` is always clean JSON.
- `rules` prints a Rich table: ID, name, severity (after config), on/off.
- `explain HAxxx` prints `Rule.explain`. Unknown ID exits `2`.
- `version` prints `honestagent 0.1.0`.

---

## 12. Integrations (F9-F11)

All three call the CLI. None of them has rule logic.

### 12.1 pre-commit (F9, `.pre-commit-hooks.yaml`)

```yaml
- id: honestagent
  name: honestagent (test-integrity gate)
  description: Flags deleted, skipped or weakened tests in staged changes.
  entry: honestagent check --staged --format text
  language: python
  pass_filenames: false
  always_run: true
  require_serial: true
```

- `pass_filenames: false`: the CLI reads the index itself; it needs the whole change set
  (HA003 and HA006 look across files).
- pre-commit stashes unstaged changes before running, so the index is what gets committed.
  We read the index through `git cat-file` (`:path`), not the disk, so it is right either way.
- User side, in `.pre-commit-config.yaml`:
  `- repo: https://github.com/ankitraj20616/HonestAgent`, `rev: v0.1.0`, `hooks: [{id: honestagent}]`.

### 12.2 GitHub Action (F10, `action.yml`)

Composite action. Inputs: `fail-on` (default `has_problems`), `mutation` (default
`false`), `comment` (default `true`), `python-version` (default `3.12`).

```yaml
runs:
  using: composite
  steps:
    - uses: actions/setup-python@v5
      with: { python-version: "${{ inputs.python-version }}" }

    - name: Install HonestAgent
      shell: bash
      env: { MUTATION: "${{ inputs.mutation }}", ACTION_PATH: "${{ github.action_path }}" }
      run: |
        if [ "$MUTATION" = "true" ]; then pip install "$ACTION_PATH[mutation]"
        else pip install "$ACTION_PATH"; fi

    - name: Check
      id: check
      shell: bash
      env:
        BASE: ${{ github.event.pull_request.base.sha }}
        HEAD: ${{ github.event.pull_request.head.sha }}
        FAIL_ON: ${{ inputs.fail-on }}
        MUTATION: ${{ inputs.mutation }}
      run: |
        set +e
        args=(check --base "$BASE" --head "$HEAD" --format markdown
              --output "$RUNNER_TEMP/honestagent.md" --fail-on "$FAIL_ON")
        [ "$MUTATION" = "true" ] && args+=(--mutation)
        honestagent "${args[@]}"
        echo "rc=$?" >> "$GITHUB_OUTPUT"
        cat "$RUNNER_TEMP/honestagent.md" >> "$GITHUB_STEP_SUMMARY" 2>/dev/null || true

    - name: Sticky comment
      if: inputs.comment == 'true' && github.event_name == 'pull_request' && steps.check.outputs.rc != '2'
      shell: bash
      env:
        GH_TOKEN: ${{ github.token }}
        REPO: ${{ github.repository }}
        PR: ${{ github.event.pull_request.number }}
      run: |
        body="$RUNNER_TEMP/honestagent.md"
        id=$(gh api --paginate "repos/$REPO/issues/$PR/comments" \
              --jq '.[] | select(.user.login == "github-actions[bot]")
                        | select(.body | startswith("<!-- honestagent -->")) | .id' | head -n1) || id=""
        if [ -n "$id" ]; then
          gh api -X PATCH "repos/$REPO/issues/comments/$id" -F "body=@$body" > /dev/null
        else
          gh api -X POST "repos/$REPO/issues/$PR/comments" -F "body=@$body" > /dev/null
        fi || echo "::warning::HonestAgent could not post the PR comment (read-only token?)."

    - name: Result
      shell: bash
      env: { RC: "${{ steps.check.outputs.rc }}" }
      run: exit "${RC:-2}"              # no rc means the check step itself broke
```

Design notes:
- Workflow values go through `env:`, never pasted into `run:` with `${{ }}`. This blocks
  script injection from PR titles or branch names.
- **One comment.** The comment is found by the hidden marker `<!-- honestagent -->` on the
  first line, posted by the GitHub Actions account. It is updated in place on every push,
  never duplicated.
- The report also goes to the job summary, so fork PRs still show it.
- The job exits with the CLI exit code. So branch protection can require the check.
- If the CLI exits `2`, no comment is posted; the job fails with the error in the log.
- Install comes from `github.action_path`, so the action version and the package version
  are the same.

User workflow (documented in the README):

```yaml
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  honestagent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }      # both SHAs and the merge-base must be present
      - uses: ankitraj20616/HonestAgent@v0
        with: { fail-on: has_problems }
```

**Fork PRs:** on `pull_request` from a fork, `GITHUB_TOKEN` is read-only. The comment step
fails, prints a warning and goes on. The job result (pass/fail) and the job summary still
work. We document that users must **not** switch to `pull_request_target` to get the
comment: that runs with a write token, and with `mutation: true` it would run untrusted PR
code.

### 12.3 Claude Code hook (F11, `hooks/claude-code/settings.json`)

Checked against the official docs (https://code.claude.com/docs/en/hooks, read on
2026-10-24). Facts we depend on:
- Hooks live in `.claude/settings.json` (project) or `~/.claude/settings.json` (user), as
  `hooks -> <event> -> [ { matcher, hooks: [ { type: "command", command, timeout } ] } ]`.
- The hook gets JSON on stdin. Common fields: `session_id`, `transcript_path`, `cwd`,
  `permission_mode`, `hook_event_name`.
- Exit `0` = success; "Claude never sees stderr from a hook that exits 0".
- Exit `2` on `Stop` = "Prevents Claude from stopping, continues the conversation", and
  Claude gets the stderr text as the reason to continue.
- Exit `2` on `PostToolUse` = "Shows stderr to Claude; the tool already ran".
- Any other exit code is a non-blocking error; the action goes ahead. ("If your hook is
  meant to enforce a policy, use `exit 2`.")
- `Stop` input has `stop_hook_active`: "`true` when Claude Code is already continuing as a
  result of a stop hook. Check this value ... to avoid blocking on a condition that will
  never resolve." Claude Code also caps stop-hook continuations at 8 in a row.
- Matcher `"Edit|Write"` matches either tool exactly. `${CLAUDE_PROJECT_DIR}` is the
  project root. Default command timeout is 600 seconds.

Mapping: the CLI exits `1` when the gate fails, but Claude Code treats `1` as
"non-blocking". So the hook command maps CLI `1` -> hook `2`, and sends the report to
stderr so Claude sees it. CLI `2` (tool error) maps to hook `1`: the user sees an error,
the agent is not blocked by a broken tool.

Loop guard: on the first stop with problems we block. If `stop_hook_active` is already
`true` and the gate still fails, we exit `1` (non-blocking): the agent stops, the user sees
the findings, and the PR gate still catches it later. This avoids an agent loop on a
finding the agent cannot fix.

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "timeout": 120,
            "command": "cd \"$CLAUDE_PROJECT_DIR\" || exit 1; input=$(cat); honestagent check --working --format text 1>&2; rc=$?; if [ $rc -eq 0 ]; then exit 0; fi; if [ $rc -eq 1 ] && ! printf '%s' \"$input\" | grep -Eq '\"stop_hook_active\" *: *true'; then exit 2; fi; exit 1"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "timeout": 60,
            "command": "cd \"$CLAUDE_PROJECT_DIR\" || exit 1; honestagent check --working --format text 1>&2; rc=$?; if [ $rc -eq 0 ]; then exit 0; fi; if [ $rc -eq 1 ]; then exit 2; fi; exit 1"
          }
        ]
      }
    ]
  }
}
```

- The `Stop` hook is the main one. The `PostToolUse` one is optional (the README says so):
  it gives faster feedback but runs after every edit, so it is noisy on big repos.
- `--working` includes untracked files, so a new test file the agent just wrote is seen.
- On a block, the agent gets the text report. It must fix the tests, or add an allow
  marker with a reason. The marker then shows in the PR report under "Allowed", so a human
  still sees it.
- Windows: Claude Code runs shell-form hooks in Git Bash when it is installed. The README
  says Git Bash is needed for this snippet.
- In M4 the same hook ships as a Claude Code plugin; the logic stays in the CLI.

---

## 13. Mutation check (`mutation.py`, F12, M3)

Opt-in: `--mutation` or `mutation.enabled = true`. Uses `mutmut` from the optional extra
`honestagent[mutation]`. Some mutmut details below must be confirmed in the M3 spike
(mutmut 3 changed its CLI); they are marked "verify".

Steps:
1. **Mode and dependency check.** Mode must be `refs` (`--base/--head`); with `--staged`
   or `--working`, exit `2`: "--mutation needs --base/--head (real refs)."
   Then `importlib.util.find_spec("mutmut")`. Missing -> exit `2`:
   "Mutation check needs mutmut. Install it with: pip install 'honestagent[mutation]'".
2. **Targets.** From `ChangeSet.sources()`: changed source lines. With `_pyast.py`, map each
   changed line to the function that holds it. Lines outside functions are skipped
   (mutmut 3 mutates inside functions; verify).
3. **Temp worktree.** `tmp = tempfile.mkdtemp(prefix="honestagent-mut-")`, then
   `git worktree add --detach <tmp> <head SHA>`. The user's working tree is never touched.
4. **Run.** In `<tmp>`: `mutmut run <mutant name globs for the target functions>`
   (verify the name format, for example `pkg.mod.x_total__mutmut_*`). The process runs in
   its own process group with the remaining `timeout_sec` budget. At most `max_mutants`
   mutants are run, picked in sorted name order so the pick is deterministic.
5. **Results.** `mutmut results` lists survived mutants; `mutmut show <name>` gives the
   diff (verify both). We keep only mutants whose changed line is in `changed_lines`.
6. **Findings.** Each surviving mutant -> HA100 (medium): file, line, message "A mutant
   survived: `a < b` changed to `a <= b` and no test failed.", `before` / `after` = the
   original and mutated line.
7. **Cleanup** (in `finally`): kill the process group if still running,
   `git worktree remove --force <tmp>`, `git worktree prune`, remove `<tmp>`.

Limits and notes:
- Timeout reached: kill, keep the results so far, add a skipped note "Mutation check
  stopped after 300 s; N of M mutants ran."
- The tests run with the current Python environment, so the project's test dependencies
  must be installed (in the Action: the user installs them before our step).
- `git worktree add` writes a small entry under `.git/worktrees/`; step 7 removes it.
- mutmut support on Windows is limited (verify); M3 targets Linux and macOS first.

---

## 14. Testing strategy

Rule: write the failing test first. No network, no real GitHub, no real agents.

### 14.1 Recorded PR fixtures

```
tests/fixtures/prs/
  ha001_test_function_deleted/
    before/            # the files before the change (only the ones that matter)
      src/shop/cart.py
      tests/test_cart.py
    after/             # the same tree after the change; a missing file = deleted
      src/shop/cart.py
      tests/test_cart.py
    expected.json      # verdict + expected findings
  ha001_renamed_out_of_collection/
  ha002_skip_decorator_added/
  ha003_assert_true/
  ha003_expected_value_rewrite/
  ha004_fail_under_lowered/
  ha005_continue_on_error/
  ha006_snapshot_with_source/
  ha007_rule_disabled_in_config/   # also checks the base config is the one used
  allow_marker_with_reason/
  allow_marker_without_reason/     # expects an HA000 note
  clean_refactor_moved_test/       # must stay "Looks good"
  real_m0_<n>/                     # real cases saved in M0
```

`expected.json`:

```json
{
  "verdict": "has_problems",
  "findings": [
    { "rule_id": "HA001", "severity": "high", "file": "tests/test_cart.py", "line": 12, "allowed": false }
  ]
}
```

Helper in `tests/conftest.py`:

```python
def make_repo(tmp_path, case, mode="refs") -> RepoUnderTest:
    """git init; copy before/ ; commit; copy after/ (delete missing files);
    then commit (refs), `git add -A` (staged) or leave it (working)."""
```

- It sets `GIT_AUTHOR_*` / `GIT_COMMITTER_*` names and dates, `init.defaultBranch=main`
  and `core.autocrlf=false`, so SHAs and output are the same on every machine.
- One parametrized test runs **every** case in all three modes and compares the result to
  `expected.json` (only the listed fields, so messages can change without breaking it).
- Each rule also has small unit tests on in-memory `ChangeSet`s built by hand, for edge
  cases (aliases, nested classes, syntax errors).

### 14.2 Other tests

- **Verdict:** every row of the table, allowed findings ignored, low never counts, every
  `--fail-on` value.
- **Allow:** marker on the line, on the line above, wrong rule ID, no reason, config glob.
- **Git layer:** temp repos for rename, binary, large file, untracked, empty repo,
  bad ref, shallow clone without merge-base, a path with spaces.
- **Config:** both files present, unknown key, bad rule ID, `allow` without a reason, CLI
  override, config read from the base ref (a head-only config change has no effect).
- **CLI:** Typer's `CliRunner` for every command and every exit code (0, 1, 2), stdout vs
  stderr split.
- **Golden files:** `tests/golden/<case>.md` and `<case>.json` for a few fixture cases,
  plus a long case that triggers markdown truncation. The version is pinned to a test value
  so goldens do not change on release. `UPDATE_GOLDEN=1 uv run pytest` rewrites them.
- **No network:** an autouse fixture replaces `socket.socket` with one that raises.
- **Hook snippet:** a test (Linux/macOS) runs the hook command with fake stdin JSON
  (`stop_hook_active` true and false) in a fixture repo and checks the exit codes 0 / 1 / 2.
- **Mutation (M3):** a tiny fixture project with one weak test; marked `mutation` and
  skipped when mutmut is not installed.
- **Action and pre-commit:** checked by hand on a sandbox repo in M2 (`pre-commit try-repo`,
  a test PR). Not in CI.
- **CI matrix:** Ubuntu, macOS, Windows, Python 3.12 and 3.13. Then `uv run ruff check .`
  and `uv run pyright`.

---

## 15. Performance and limits

| What | Target / limit (constant in `config.py`) |
|---|---|
| `check` on a 50-file PR, no mutation | < 2 s |
| `check --staged` on a typical commit | < 1 s (pre-commit must feel instant) |
| Max size of one file we read | `MAX_FILE_BYTES = 512_000` (bigger -> skipped) |
| Max changed files | `MAX_CHANGED_FILES = 2_000` (rest -> skipped) |
| Snippet size | `SNIPPET_MAX_LINES = 6`, `SNIPPET_MAX_CHARS = 300` |
| Markdown size | `MARKDOWN_MAX_CHARS = 65_536`, target `60_000` |
| Mutation | `max_mutants = 50`, `timeout_sec = 300` (config) |

How: one `git diff --name-status`, one `--numstat`, one `-U0` diff for the whole range
(split per file in Python), and one `git cat-file --batch` process for all blobs. Each file
side is parsed once (cached). Rules only touch files they care about (by path).

---

## 16. Security notes

- **We never run the user's code** in the core. We parse with `ast`; we never import test
  modules, never load `conftest.py`, never run pytest. The only exception is M3 mutation,
  which runs the tests inside a temp worktree.
- **We never write to the user's repo**: no edits, no commits, no `git push`, no branch
  changes. `GIT_OPTIONAL_LOCKS=0` keeps even read calls from writing lock files. Mutation
  writes only in its temp worktree and removes it.
- **No shell.** Git runs with list args. Refs are resolved to SHAs with
  `--end-of-options` first.
- **YAML** is read with `yaml.safe_load` only. TOML with `tomllib`.
- **Token only in the Action.** The core has no network code. `GITHUB_TOKEN` is passed to
  `gh` through env, never printed, never written to the report. Workflow values reach
  scripts through `env:`, not `${{ }}` inside `run:`.
- **Untrusted text in reports.** File content in the PR comment is escaped (table cells,
  code fences), and the hidden marker is stripped from snippets, so a PR cannot fake or
  hijack the sticky comment.
- **Fork PRs:** we document `pull_request`, not `pull_request_target`.
- **Allow markers are visible on purpose.** An agent can add one, but it needs a reason,
  and every allowed finding is listed in the report for a human to read.
- **The gate cannot be switched off from inside the change.** Config comes from the base
  ref, and any weakening of it is an HA007 finding.

---

## 17. Later (not v1)

- JavaScript / TypeScript rules (Jest, Vitest).
- Hosted GitHub App and paid team tier (org policy, history, private-repo app).
- Trust score 0-100.
- Optional LLM second opinion.
- HTML proof report.
- Codex and other agent hooks.
- Web dashboard.
- SARIF output for GitHub code scanning.

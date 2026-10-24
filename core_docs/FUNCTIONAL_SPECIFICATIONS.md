# Functional Specifications (FSD)
## HonestAgent v1 - a test-integrity gate for AI-agent pull requests

**Version:** 1.0 (draft)
**Date:** 2026-10-24
**Scope:** v1 only (milestones M0-M4, see `MILESTONES.md`)
**How it is built:** `TDD-tech-design-doc.md`. **With what:** `TECH_STACK.md`.

> Simple English. This file says WHAT HonestAgent does, not HOW.
> "Must" = needed for v1. "Should" = v1 if time allows. "Later" = not v1.
> Every requirement has an ID (F3.2) so a test can point at it.

---

## 1. Purpose and problem

### 1.1 The problem
- AI coding agents (Claude Code, Codex, Copilot) write more and more pull requests.
- When an agent cannot fix the code, it sometimes changes the **tests** instead:
  it deletes them, skips them, or weakens the asserts so they "pass".
- People in the field call this **"test tampering"** and **"CI weakening"**.
- Reviewers miss it. The PRs are big and review is slow:
  - **80.2%** of agent-written test patches have weak or missing checks
    (the test does not really check the answer).
  - Median review time is up **441%**.
  - Sources (with links): `decisions/ADR-001-pivot-to-test-integrity-gate.md`, section "Context".

### 1.2 What HonestAgent is
- An open-source command-line tool, `honestagent`.
- It reads a change (two git refs, the index, or the working tree) and answers one question:
  **"Are the tests real, or did the agent cheat to make them pass?"**
- It gives a list of **findings** and one **verdict**: Looks good / Take a look / Has problems.
- It runs in three places, all calling the same CLI:
  - before a commit (pre-commit hook),
  - on every PR (GitHub Action, one PR comment),
  - inside the agent's own loop (Claude Code hook).

### 1.3 Stance
- **Deterministic.** The same input always gives the same output. No LLM. No network in the core.
- **Vendor-neutral.** The agent that wrote the code does not grade itself.
- **Read-only.** It never edits, commits or pushes the user's code.
- **Python and pytest first.** JavaScript is Later.

---

## 2. Who uses it

| User | Need | Main way in |
|---|---|---|
| **The author** (a Python freelancer; first user) | Catch his own agents cheating before he trusts their work. | Claude Code hook, pre-commit |
| **Dev teams (5-100 people)** using AI coding agents | A reviewer sees at a glance if an agent PR touched the tests in a bad way. | GitHub Action, PR comment |
| **Freelancers and agencies** | Give a client a written proof that the tests were not weakened. | `honestagent check --format markdown --output proof.md` |

---

## 3. Goals and non-goals (v1)

### 3.1 Goals
- G1. Flag the common ways an agent fakes passing tests (rules HA001-HA007).
- G2. Give one clear verdict and a clear exit code, so CI and hooks can block.
- G3. Let a human (or the agent) allow a finding on purpose, with a written reason that stays visible.
- G4. Work locally (CLI, pre-commit, Claude Code) and in CI (GitHub Action) with the same results.
- G5. Optional: check that tests catch bugs on the changed lines (mutation check, HA100).

### 3.2 Non-goals (v1)
- No UI of any kind: no app, no web page, no dashboard. Output is text only.
- No server, no hosted service, no database, no accounts.
- No LLM, no AI review, no "second opinion".
- No JavaScript / TypeScript rules.
- No paid tier.
- It does not fix tests or code. It only reports.
- It does not run the test suite (except the opt-in mutation check, F12).
- It is not a general code reviewer. It does not look for bugs in source code.

---

## 4. Words

| Word | Meaning |
|---|---|
| **AI coding agent** (agent) | A tool that writes code, like Claude Code, Codex or Copilot. |
| **Base / head** | The "before" and "after" git refs of a change. |
| **Change set** | The list of changed files, each with its before and after text. |
| **Test file** | A file that matches the test globs (F2). |
| **Source file** | A `.py` file that is not a test file and not a snapshot file. |
| **Rule** | One check, with an ID (HA001) and a name (`test-deleted`). |
| **Finding** | One thing a rule flagged: rule, severity, file, line, message, before/after snippet. |
| **Severity** | `high`, `medium` or `low`. |
| **Allow marker** | A comment that says "this finding is on purpose", with a reason. |
| **Allowed finding** | A finding covered by an allow marker or a config allow entry. Still shown. Does not count for the verdict. |
| **Verdict** | Looks good / Take a look / Has problems. |
| **Gate** | The pass/fail decision from the verdict and `--fail-on`. Shown as the exit code. |
| **Proof report** | The Markdown report saved to a file, for a client or a reviewer. |
| **Mutant** | A small bug HonestAgent plants in a changed line to see if the tests fail (F12). |

---

## 5. Features

| F | Feature | Milestone | Priority |
|---|---|---|---|
| F1 | Change input | M1 | Must |
| F2 | Find test and source files | M1 | Must |
| F3 | Tamper rules HA001-HA007 (and HA000 tool notes) | M1 | Must |
| F4 | Allow a finding with a reason | M1 | Must |
| F5 | Verdict | M1 | Must |
| F6 | Reports: text, Markdown, JSON | M1 | Must |
| F7 | Config | M1 | Must |
| F8 | CLI commands and exit codes | M1 | Must |
| F9 | pre-commit hook | M2 | Must |
| F10 | GitHub Action with one sticky PR comment | M2 | Must |
| F11 | Claude Code hook | M2 | Must |
| F12 | Mutation check on changed lines | M3 | Should |

M0 (evidence check) and M4 (launch) add no features. See `MILESTONES.md`.

### F1. Change input (Must, M1)
- **F1.1 Two refs.** `--base REF --head REF` compares two git refs.
  - Default head: `HEAD`.
  - Default base: the merge-base of `HEAD` with the default branch. The default branch is found in
    this order: `origin/HEAD`, then `main`, then `master`. If none exists, exit `2` and ask for `--base`.
- **F1.2 Staged.** `--staged` compares the git index with `HEAD`. Used by pre-commit (F9).
- **F1.3 Working.** `--working` compares the working tree with `HEAD`, including new untracked
  files that are not git-ignored. Used by the Claude Code hook (F11).
- **F1.4 One mode only.** `--staged` and `--working` cannot be used together, or with `--base` / `--head`.
  Doing so exits with code `2` and a message.
- **F1.5 Errors.** Not a git repo, or a ref that does not exist: exit code `2`, with a message that names the problem.
- **F1.6 Empty change.** No changed files: verdict Looks good, exit `0`.
- **F1.7 Read-only.** No mode changes the index, the working tree, or any ref.

### F2. Find test files and source files (Must, M1)
- **F2.1 Default test globs:** `["tests/**/*.py", "**/test_*.py", "**/*_test.py", "**/conftest.py"]`.
- **F2.2 Configurable.** `test_paths` in config (F7) replaces the default list.
- **F2.3 Source files** are changed `.py` files that are not test files and not snapshot files. No config key for this in v1.
- **F2.4 Config and CI files** (for HA004, HA005) are found by name, not by `test_paths`:
  `pyproject.toml`, `setup.cfg`, `.coveragerc`, `tox.ini`, `pytest.ini`, `noxfile.py`,
  `.pre-commit-config.yaml`, `.github/workflows/*`, and ruff / flake8 / mypy / pyright config files.
- **F2.5 Snapshot files** (for HA006): any file under `__snapshots__/` or `snapshots/`, or ending in `.ambr`.
- **F2.6** A file that moved from a test path to a non-test path counts as a deleted test file for HA001.

### F3. Tamper rules (Must, M1)

Every finding has: `rule_id`, `name`, `severity`, `file`, `line`, `message` (one plain sentence),
`before` / `after` (short snippets), `allowed`, `allow_reason`.

| ID | Name | Default severity |
|---|---|---|
| HA000 | honestagent-note (tool notes) | low |
| HA001 | test-deleted | high |
| HA002 | skip-added | high |
| HA003 | assertion-weakened | high (expected-value rewrite: medium) |
| HA004 | coverage-lowered | high |
| HA005 | ci-or-lint-weakened | medium |
| HA006 | snapshot-rewritten | medium |
| HA007 | gate-config-weakened | medium |
| HA100 | mutant-survived (F12 only) | medium |

General rules:
- **F3.0a** Python files are compared by their syntax tree, so formatting-only changes never give a finding.
- **F3.0b** Config, CI and inline comments are compared line by line.
- **F3.0c** A file that does not parse (before or after) gives no AST findings for that file and one HA000 note (low) saying it was skipped. It never crashes the run.
- **F3.0d** Findings are sorted by file, then line, then rule ID. Same input, same order.

**F3.1 HA001 test-deleted (high)**
- Flags when, between base and head:
  - a test file is deleted, or
  - a test function (`test_*`) or test class (`Test*`) is removed from a test file, or
  - it is renamed so pytest no longer collects it (`test_x` -> `_test_x`, `TestX` -> `XTests`).
- Not flagged: a test that moved to another test file in the same change with the same name.
- Line: where the test used to be in the after file (line 1 for a deleted file).

```diff
- def test_refund_rejects_negative_amount():
-     with pytest.raises(ValueError):
-         refund(-5)
+ def _test_refund_rejects_negative_amount():
+     with pytest.raises(ValueError):
+         refund(-5)
```

**F3.2 HA002 skip-added (high)**
- Flags a new skip or expected failure on a test:
  - `@pytest.mark.skip`, `@pytest.mark.skipif`, `@pytest.mark.xfail`,
  - `pytest.skip()` or `pytest.xfail()` inside a test,
  - `@unittest.skip`, `@unittest.skipIf`, `@unittest.skipUnless`, `@unittest.expectedFailure`,
  - a test path newly added to `--ignore` / `--deselect` (in pytest config or CI commands) or to `collect_ignore` in `conftest.py`.
- Not flagged: a skip that was already there at base.

```diff
+ @pytest.mark.skip(reason="TODO")
  def test_invoice_total_with_discount():
      assert invoice_total(items, discount=0.1) == 90.0
```

**F3.3 HA003 assertion-weakened (high; expected-value rewrite: medium)**
- Looks only at test functions that exist at both base and head. Flags when:
  - **F3.3a** the test has fewer asserts than before (`assert` statements and `self.assert*` calls);
  - **F3.3b** an assert is replaced by a trivial one: `assert True`, `assert x`, or `assert x is not None` where an equality check was;
  - **F3.3c** `pytest.raises(SomeError)` is widened to `pytest.raises(Exception)` or `BaseException`;
  - **F3.3d** a `pytest.approx` tolerance (`rel` / `abs`) is raised;
  - **F3.3e** (medium) an expected literal value in an assert changed, **and** the same change edits a source file that this test file imports.

```diff
  def test_parse_date():
-     assert parse_date("2026-10-24") == date(2026, 10, 24)
+     assert parse_date("2026-10-24") is not None
```

```diff
  def test_gst_amount():                      # src/billing/tax.py also changed
-     assert gst_amount(100) == 18.0
+     assert gst_amount(100) == 17.5          # HA003, medium
```

**F3.4 HA004 coverage-lowered (high)**
- Flags when `fail_under` or `--cov-fail-under` is lowered or removed in `pyproject.toml`,
  `setup.cfg`, `.coveragerc`, `tox.ini`, `pytest.ini`, or a CI workflow command.

```diff
  [tool.coverage.report]
- fail_under = 90
+ fail_under = 75
```

**F3.5 HA005 ci-or-lint-weakened (medium)**
- In CI and lint config (F2.4), flags:
  - a step or command that runs tests or lint is removed;
  - `continue-on-error: true` or `|| true` is added to such a step;
  - rules are added to an ignore list (for example ruff `ignore`, flake8 `extend-ignore`, mypy `ignore_errors`).
- In changed lines of any Python file, flags new inline `# noqa`, `# type: ignore`, `# pragma: no cover`.

```diff
-     total = compute_total(items)
+     total = compute_total(items)  # type: ignore
```

```diff
      - run: uv run pytest
+       continue-on-error: true
```

**F3.6 HA006 snapshot-rewritten (medium)**
- Flags a changed snapshot file (F2.5) when the same change also edits a source file.
- Not flagged: snapshot changes with no source change (for example a new snapshot test).

```diff
  # src/report/render.py changed, and:
  # tests/__snapshots__/test_render.ambr
- 'Total: 1,180.00'
+ 'Total: 1,175.00'
```

**F3.7 HA007 gate-config-weakened (medium)**
- An agent could switch the gate off by editing its config. So the config is read from the base side (F7.6),
  and any change in the diff to `[tool.honestagent]` in `pyproject.toml` or to `.honestagent.toml` that does one
  of these is a finding:
  - adds a rule to `disable`;
  - lowers a rule's severity in `severity` (high -> medium, medium -> low);
  - adds an entry to `allow`;
  - loosens `fail_on` (`has_problems` -> `never`, `take_a_look` -> `has_problems` or `never`).
  A removed key (or a removed config file) counts as going back to the default value.
- Not flagged: changes that make the gate stricter, or changes to `test_paths` and `mutation.*`.
- New inline allow markers added in the change are not HA007 findings. They still allow their finding,
  but they are always listed in the report's "Allowed" section so a human sees them.

```diff
  [tool.honestagent]
- disable = []
+ disable = ["HA002"]                         # HA007, medium
```

**F3.8 HA000 honestagent-note (low)**
- Not a tamper rule. Tool notes that need a rule ID use HA000:
  - an allow marker with no reason (F4.2);
  - a Python file that did not parse, so it was skipped (F3.0c);
  - a changed file skipped because it is binary or too large.
- Low, so it never changes the verdict. It can be turned off with `disable = ["HA000"]`.

```text
HA000 low  tests/test_tax.py:12  Allow marker has no reason, so it was ignored.
```

**F3.9 Rules registry**
- Every rule above can be turned off (`disable`) or have its severity changed (`severity`) in config (F7).
- No other rule IDs exist in v1.

### F4. Allow a finding with a reason (Must, M1)
- **F4.1 Inline marker.** On the flagged line or the line above:
  `# honestagent: allow HA002 -- flaky on CI, see issue #12`
- **F4.2 Reason required.** The text after `--` is the reason. A marker with no reason does not allow anything,
  and is itself reported as an HA000 note (low).
- **F4.3 Rule must match.** A marker for HA002 does not allow an HA003 finding on the same line.
- **F4.4 Config form.** `allow = [{ rule = "HA005", path = "tox.ini", reason = "..." }]` allows every finding of
  that rule in that path. `reason` is required; an entry without it is a config error (exit `2`).
- **F4.5 Deleted files.** Use the config form, since there is no line to put a marker on. Config is read from
  the base side (F7.6), so a new config entry takes effect once it is on the base branch; in the same change it
  is an HA007 finding.
- **F4.6 Still shown.** An allowed finding stays in every report with `allowed: true` and its reason.
  It does **not** change the verdict.
- **F4.7 One rule ID per marker** in v1. For two rules on one line, use two markers (the line and the line above).
- **F4.8 Markers added in the change** still count as allowed, but they are always listed in the "Allowed"
  section, so a human sees every marker the agent added.

### F5. Verdict (Must, M1)

| Verdict | JSON value | When |
|---|---|---|
| **Has problems** | `has_problems` | At least one not-allowed **high** finding |
| **Take a look** | `take_a_look` | No not-allowed high, but at least one not-allowed **medium** finding |
| **Looks good** | `looks_good` | No not-allowed high or medium findings |

- **F5.1** Low findings never change the verdict.
- **F5.2** Allowed findings never change the verdict.
- **F5.3** The verdict depends only on the findings. It is unit tested for every row above.
- **F5.4** No 0-100 score in v1.

### F6. Reports (Must, M1)
- **F6.1 Formats.** `--format text` (default), `markdown`, `json`. `--output FILE` writes the report to FILE
  instead of standard output.
- **F6.2 Same content.** All three formats hold the same verdict, counts and findings.
- **F6.3 No time stamps.** Reports hold no date or time, so the same input gives the same bytes.

**F6.4 text** - for terminals.
- First line: the verdict. Then a one-line summary. Then findings grouped by file.
- Colour only when output is a terminal.

```
Has problems  - 2 findings: 1 high, 1 medium. 1 allowed.

tests/test_invoice.py
  42  high    HA002 skip-added          New @pytest.mark.skip on test_invoice_total_with_discount.
tests/test_tax.py
  18  medium  HA003 assertion-weakened  Expected value changed from 18.0 to 17.5 while src/billing/tax.py changed.

Allowed (1)
src/billing/report.py
  88  medium  HA005 ci-or-lint-weakened  New "# noqa: E501". Reason: long URL in docstring.
```

**F6.5 markdown** - the PR comment (F10) and the proof report.
- Order: hidden marker `<!-- honestagent -->`; verdict line with an emoji; one-line summary; findings table
  (rule, file:line, message); before/after snippets in a collapsed `<details>`; an "Allowed" section;
  footer with the HonestAgent version and how to allow a finding.
- Emojis: 🔴 Has problems, 🟡 Take a look, 🟢 Looks good.
- Must stay under 65,536 characters (GitHub's comment limit). If longer, drop snippets first, then
  rows, and add a note "N more findings not shown; run `honestagent check` locally for the full list".

Sample:

````markdown
<!-- honestagent -->
## 🔴 HonestAgent: Has problems

2 findings: 1 high, 1 medium. 1 allowed.

| Rule | Where | What |
|---|---|---|
| HA002 skip-added (high) | `tests/test_invoice.py:42` | New `@pytest.mark.skip` on `test_invoice_total_with_discount`. |
| HA003 assertion-weakened (medium) | `tests/test_tax.py:18` | Expected value changed from `18.0` to `17.5` while `src/billing/tax.py` changed. |

<details><summary>Before / after</summary>

**HA002** `tests/test_invoice.py:42`
```python
+ @pytest.mark.skip(reason="TODO")
  def test_invoice_total_with_discount():
```

**HA003** `tests/test_tax.py:18`
```python
- assert gst_amount(100) == 18.0
+ assert gst_amount(100) == 17.5
```
</details>

**Allowed (1)**
| Rule | Where | Reason |
|---|---|---|
| HA005 ci-or-lint-weakened | `src/billing/report.py:88` | long URL in docstring |

<sub>HonestAgent 0.1.0 · deterministic, no LLM · To allow a finding on purpose, add
`# honestagent: allow <RULE> -- <reason>` on the line or the line above.</sub>
````

**F6.6 json** - for tools.
- Fields: `schema_version` (always `1` in v1), `honestagent_version`, `verdict`, `mode` (`refs`, `staged` or
  `working`), `base`, `head`, `counts`, `findings[]`, `skipped[]` (files not checked, with the reason).
- `counts` has `high`, `medium`, `low` (not-allowed findings only), `allowed` and `total`.
- Each finding has the fields listed in F3. Field names do not change within `schema_version: 1`.

```json
{
  "schema_version": 1,
  "honestagent_version": "0.1.0",
  "verdict": "has_problems",
  "mode": "refs",
  "base": "3f2a91c...full sha",
  "head": "8be04d7...full sha",
  "counts": { "high": 1, "medium": 1, "low": 0, "allowed": 1, "total": 3 },
  "findings": [
    {
      "rule_id": "HA002", "name": "skip-added", "severity": "high",
      "file": "tests/test_invoice.py", "line": 42,
      "message": "New @pytest.mark.skip on test_invoice_total_with_discount.",
      "before": "def test_invoice_total_with_discount():",
      "after": "@pytest.mark.skip(reason=\"TODO\")\ndef test_invoice_total_with_discount():",
      "allowed": false, "allow_reason": null
    }
  ],
  "skipped": []
}
```
(The other two findings are left out of this sample.)

### F7. Config (Must, M1)
- **F7.1 Where.** `[tool.honestagent]` in `pyproject.toml`, or the same keys at the top level of `.honestagent.toml`
  (no `[tool.honestagent]` header; mutation keys go under `[mutation]`). If both exist, `.honestagent.toml` wins.
- **F7.2 No config needed.** With no config, the defaults apply.
- **F7.3 Keys (v1):**

| Key | Meaning | Default |
|---|---|---|
| `test_paths` | Test file globs (F2) | see F2.1 |
| `fail_on` | Gate level (same as `--fail-on`) | `"has_problems"` |
| `disable` | Rule IDs to turn off | `[]` |
| `severity` | Severity per rule, e.g. `{ HA005 = "high" }` | rule defaults (F3) |
| `allow` | Allow entries (F4.4) | `[]` |
| `mutation.enabled` | Run F12 without the flag | `false` |
| `mutation.max_mutants` | Max mutants per run | `50` |
| `mutation.timeout_sec` | Time limit for the mutation run | `300` |

```toml
[tool.honestagent]
test_paths = ["tests/**/*.py", "**/test_*.py", "**/*_test.py", "**/conftest.py"]
fail_on = "has_problems"
disable = []                       # e.g. ["HA006"]
severity = { HA005 = "high" }      # override per rule
allow = [{ rule = "HA005", path = "tox.ini", reason = "py3.9 env dropped on purpose" }]

[tool.honestagent.mutation]
enabled = false
max_mutants = 50
timeout_sec = 300
```

- **F7.4 Errors.** An unknown key, an unknown rule ID, a bad value, or an `allow` entry without a reason exits `2`
  and names the key.
- **F7.5 Flags win.** A CLI flag beats the same setting in both config files.
- **F7.6 Config is read from the base side** of the change, so an agent cannot switch the gate off in the same
  change. With `--base/--head` it is read from the base ref; with `--staged` / `--working` the base is `HEAD`.
  If the base has no config, the defaults are used. Any change to the config that weakens the gate is an
  HA007 finding (F3.7).

### F8. CLI commands and exit codes (Must, M1)

```
honestagent check [--base REF] [--head REF] [--staged | --working]
                  [--format text|markdown|json] [--output FILE]
                  [--fail-on has_problems|take_a_look|never] [--mutation]
honestagent rules                 # list all rules, their severity and on/off state
honestagent explain HA003         # what the rule catches, an example, how to allow it
honestagent version
```

- **F8.1 `check`** runs F1-F6 (and F12 with `--mutation`) and prints the report.
- **F8.2 `rules`** lists every rule: ID, name, severity after config, on/off.
- **F8.3 `explain <ID>`** prints what the rule catches, one before/after example, and how to allow it.
  Works for every ID in F3, including HA000 and HA100. An unknown ID exits `2`.
- **F8.4 `version`** prints the HonestAgent version.

| Exit code | Meaning |
|---|---|
| `0` | Gate passed: the verdict is better than `--fail-on` (or `--fail-on never`). |
| `1` | Gate failed: the verdict is at or worse than `--fail-on` (default `has_problems`). |
| `2` | Tool error: not a git repo, bad ref, no default branch found, bad config (unknown key or rule ID, `allow` entry without a reason), bad flags, `--mutation` without mutmut, `--mutation` with `--staged` / `--working`. |

- **F8.5** Order, worst first: `has_problems`, `take_a_look`, `looks_good`.
  With `--fail-on take_a_look`, both Has problems and Take a look exit `1`.
- **F8.6** The report is still printed when the exit code is `1`.

### F9. pre-commit hook (Must, M2)
- **F9.1** The HonestAgent repo has a `.pre-commit-hooks.yaml` with hook id `honestagent`.
- **F9.2** The hook runs `honestagent check --staged --format text`.
- **F9.3** A failed gate (exit `1`) stops the commit and shows the findings.
- **F9.4** A user adds it in their `.pre-commit-config.yaml` like any other hook. No other setup.

### F10. GitHub Action with one sticky PR comment (Must, M2)
- **F10.1** A composite action `action.yml` in the HonestAgent repo root.
- **F10.2 Inputs:** `fail-on`, `mutation`, `comment` (default `true`), `python-version`.
- **F10.3** It installs HonestAgent and runs
  `honestagent check --base <PR base sha> --head <PR head sha> --format markdown`.
- **F10.4 One comment.** It creates **one** PR comment, found later by the hidden marker
  `<!-- honestagent -->`. Each new push updates that same comment. It never posts a second one.
- **F10.5** The comment is posted for every verdict, including Looks good, so a fixed PR shows it is fixed.
- **F10.6** The job ends with the CLI exit code, so branch protection can block the merge.
- **F10.7** Works on `pull_request` events. Needs `permissions: pull-requests: write`.
- **F10.8 Forks.** If the token is read-only (fork PRs), the job still runs and gives its result,
  with no comment and no error from the comment step.
- **F10.9** `comment: false` skips the comment; the job result stays the same.
- **F10.10** The user's workflow must use `actions/checkout` with `fetch-depth: 0`, so both SHAs and the
  merge-base are present. The action docs say so. Snippet: `uses: ankitraj20616/HonestAgent@v0`.

### F11. Claude Code hook (Must, M2)
- **F11.1** A sample `hooks/claude-code/settings.json` snippet with a `Stop` hook that runs
  `honestagent check --working --format text`.
- **F11.2** Optional: a `PostToolUse` hook on `Edit|Write` that runs the same check when the agent edits a test file.
- **F11.3 Exit code mapping.** The CLI never exits `2` for a failed gate; the hook script maps the codes:
  - CLI exit `0` (gate passed) -> hook exit `0`.
  - CLI exit `1` (gate failed) -> hook exit `2` on the first stop. The findings go to standard error. Claude Code
    then does not let the agent stop; the agent sees the findings and must fix the code or add an allow marker
    with a reason.
  - CLI exit `1` and the hook input has `stop_hook_active: true` -> hook exit `1` (does not block). The user sees
    the findings, the agent may stop, and the PR gate (F10) still catches it. So the agent cannot loop forever.
  - CLI exit `2` (tool error) -> hook exit `1`. A tool bug never blocks the agent.
- **F11.4** With `PostToolUse`, exit `2` only shows the findings to the agent (the edit already happened).
- **F11.5** With the default `--fail-on has_problems`, Take a look and Looks good do not block the agent.
- **F11.6** A README next to the sample says how to install it and what the agent will see.
- **F11.7** A Claude Code plugin listing ships with the launch (M4).

### F12. Mutation check on changed lines (Should, M3)
- **F12.1 Opt-in.** Runs only with `--mutation` or `mutation.enabled = true`.
- **F12.1a Real refs only.** Mutation runs only in `--base/--head` mode. `--mutation` with `--staged` or
  `--working` exits `2` with a clear message.
- **F12.2 Optional install.** Needs `pip install honestagent[mutation]` (mutmut). Without it,
  `--mutation` exits `2` with an install message.
- **F12.3 Changed lines only.** Mutates only source lines changed in the change set, never the whole project.
- **F12.4 Limits.** At most `max_mutants` mutants and `timeout_sec` seconds. If a limit is hit,
  the report says how many mutants were run and how many were skipped.
- **F12.5 Safe.** Runs in a temporary git worktree of the head ref. The user's working tree is never touched.
  The temporary worktree is removed afterwards, also on error.
- **F12.6 HA100 mutant-survived (medium).** Each surviving mutant is a finding with file, line and the mutation.

```diff
  # src/billing/tax.py, line 7 (changed in this PR)
- return amount * 0.18
+ return amount * 0.19      # mutant: tests still pass -> HA100
```

- **F12.7** In the Action, `mutation: true` turns it on.

---

## 6. User stories (end to end)

### 6.1 Claude Code skips a failing test; the Stop hook catches it
1. The author asks Claude Code to add a discount to `invoice_total`. One test keeps failing.
2. The agent adds `@pytest.mark.skip(reason="TODO")` to `test_invoice_total_with_discount` and tries to stop.
3. The `Stop` hook runs `honestagent check --working --format text`.
   HA002 fires (high). Verdict: Has problems. The hook exits `2`.
4. Claude Code keeps the agent working and shows it the finding.
5. The agent removes the skip and fixes the discount code. The hook runs again: Looks good. The agent stops.
6. (Other path) If the skip is really needed, the agent adds
   `# honestagent: allow HA002 -- needs a live payment sandbox, see issue #31`.
   The finding is now allowed, and the author sees it and the reason in the report.

### 6.2 A PR in CI gets a sticky "Has problems" comment
1. An agent opens a PR that changes `src/billing/tax.py`, lowers `fail_under` from 90 to 75,
   and rewrites an expected value in `tests/test_tax.py`.
2. The HonestAgent Action runs on the PR. It finds HA004 (high) and HA003 (medium).
3. It posts one comment: "🔴 HonestAgent: Has problems - 2 findings: 1 high, 1 medium."
   The job fails, so the PR cannot merge.
4. The reviewer opens the `<details>` block and sees the before/after lines at once.
5. The agent (or a developer) restores `fail_under = 90` and fixes the code. On the next push the
   **same** comment changes to "🟢 Looks good". The job passes.

### 6.3 A freelancer makes a proof report for a client
1. A freelancer finishes a client job, mostly written with an agent, on branch `feature/export`.
2. They run `honestagent check --base main --head feature/export --format markdown --output proof.md`.
3. `proof.md` says "🟢 Looks good", lists one allowed finding with its reason, and the HonestAgent version.
4. They attach `proof.md` to the invoice or the handover note. The client can run the same command
   on the same refs and get the same file.

---

## 7. Later (not v1)
- JavaScript / TypeScript rules (Jest, Vitest).
- Hosted GitHub App and paid team tier (org policy, history, private-repo app).
- Trust score 0-100.
- Optional LLM second opinion.
- HTML proof report.
- Hooks for Codex and other agents.
- Web dashboard.
- SARIF output for GitHub code scanning.

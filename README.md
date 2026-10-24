# HonestAgent

**A deterministic test-integrity gate for pull requests written by AI coding agents.**
It answers one question: *"Are the tests real, or did the agent cheat to make them pass?"*

> **Status:** Design stage: docs done, no code yet. Next: M0 evidence check.
> The commands below are the **target** for v1. They do not work yet.
> See [`core_docs/MILESTONES.md`](core_docs/MILESTONES.md).

## The problem

AI coding agents (Claude Code, Codex, Copilot) now write a large share of pull requests.
When an agent cannot fix the code, it sometimes changes the tests instead: it deletes a
test, adds a `skip`, weakens an assert, or lowers the coverage limit. The tests go green.
The bug stays.

Reviewers miss this. Across 22,000 developers, median review time is up **441%**, and
**80.2%** of agent-written test patches have weak or missing checks. People in the field
already have names for it: **"test tampering"** and **"CI weakening"**.
(Sources with links: [ADR-001](core_docs/decisions/ADR-001-pivot-to-test-integrity-gate.md).)

HonestAgent reads the change, compares the tests before and after, and gives a plain
verdict. It is **vendor-neutral and deterministic**: the same input always gives the same
answer. There is no LLM in the core. The agent that wrote the code cannot grade itself.

## How it works

A small Python CLI. It reads `git`, compares the before and after version of each changed
file with Python's `ast` module, and prints a report. No server, no database, no account,
no network calls in the core. It is **read-only**: it never edits, commits or pushes your
code. Python and pytest first; JavaScript comes later.

## What it catches

| Rule | Name | What it flags | Severity |
|---|---|---|---|
| HA000 | honestagent-note | A note from the tool itself: an allow marker with no reason, a Python file that did not parse, a file skipped (binary or too large) | low |
| HA001 | test-deleted | A test function, class or file was removed, or renamed so it no longer collects (`test_x` -> `_test_x`) | high |
| HA002 | skip-added | New `skip` / `skipif` / `xfail` marks, `pytest.skip()`, `@unittest.skip*`, or a test path added to `--ignore` / `--deselect` / `collect_ignore` | high |
| HA003 | assertion-weakened | Fewer asserts; an assert swapped for a trivial one; `pytest.raises` widened to `Exception`; `pytest.approx` tolerance raised; an expected value rewritten in the same change as the source it tests (medium) | high (expected-value rewrite: medium) |
| HA004 | coverage-lowered | `fail_under` / `--cov-fail-under` lowered or removed | high |
| HA005 | ci-or-lint-weakened | A test or lint step removed from CI, `continue-on-error: true` or `\|\| true` added, rules added to ignore lists, new `# noqa` / `# type: ignore` / `# pragma: no cover` | medium |
| HA006 | snapshot-rewritten | Snapshot files changed in the same change as source code | medium |
| HA007 | gate-config-weakened | The change edits HonestAgent's own config to disable a rule, lower a severity, add an `allow` entry or loosen `fail_on` | medium |
| HA100 | mutant-survived | (opt-in, `--mutation`) A small bug planted on a changed source line was not caught by the tests | medium |

Run `honestagent explain HA003` to see what a rule catches, an example, and how to allow it.

## What the PR comment looks like

> ## 🔴 HonestAgent: Has problems
>
> 3 findings: 1 high, 2 medium
>
> | Rule | Where | What |
> |---|---|---|
> | HA002 skip-added (high) | `tests/test_billing.py:42` | New `@pytest.mark.skip` on `test_refund_rounding`. |
> | HA003 assertion-weakened (medium) | `tests/test_billing.py:58` | Expected value changed in the same change that edits `billing.py`. |
> | HA005 ci-or-lint-weakened (medium) | `.github/workflows/ci.yml:31` | `continue-on-error: true` added to the test step. |
>
> <details><summary>Before / after</summary>
>
> `tests/test_billing.py:58` before: `assert refund(10.05) == 10.05`, after: `assert refund(10.05) == 10.0`
>
> </details>
>
> HonestAgent 0.1.0. To allow a finding, add `# honestagent: allow HA002 -- <reason>` on the line or the line above.

The same Markdown file works as a **proof report**: a file you can attach to show a client
that the tests in a change are real.

## Install (target)

```bash
pip install honestagent              # or: uv tool install honestagent
pip install "honestagent[mutation]"  # with the optional mutation check (M3)
```

Needs Python 3.12+ and `git`. Works on Linux, macOS and Windows.

## Usage (target)

```bash
honestagent check                          # this branch vs the default branch (origin/HEAD, else main, else master)
honestagent check --base main --head HEAD  # any two refs
honestagent check --staged                 # what you are about to commit
honestagent check --working                # uncommitted changes
honestagent check --format markdown --output proof.md
honestagent check --format json
honestagent check --fail-on take_a_look    # stricter gate
honestagent check --mutation               # also run the mutation check (M3; --base/--head mode only)
honestagent rules                          # list rules, severity, on/off
honestagent explain HA003                  # explain one rule
honestagent version
```

### pre-commit

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/ankitraj20616/HonestAgent
    rev: v0.1.0
    hooks:
      - id: honestagent   # runs: honestagent check --staged --format text
```

### GitHub Action

Posts **one** PR comment and updates it on every push.

```yaml
# .github/workflows/honestagent.yml
name: honestagent
on: pull_request

permissions:
  contents: read
  pull-requests: write   # needed to post the comment

jobs:
  honestagent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # HonestAgent needs the base commit
      - uses: ankitraj20616/HonestAgent@v0
        with:
          fail-on: has_problems   # has_problems | take_a_look | never
          comment: true
          mutation: false
          python-version: "3.12"
```

Pull requests from forks get the job result but no comment, because their token is read-only.

### Claude Code hook

A `Stop` hook runs `honestagent check --working --format text` when the agent finishes.
If the gate fails (CLI exit `1`, by default on **Has problems**), the hook exits `2` on the
first stop: Claude Code shows the findings to the agent, and the agent must fix them or add
an allow marker with a reason. If the agent is already continuing from a stop hook
(`stop_hook_active` is true), the hook exits `1` instead: you see the findings, the agent may
stop, and the PR gate still catches it. A tool error (CLI exit `2`) maps to hook exit `1`, so
a tool bug never blocks the agent. The sample settings will be in `hooks/claude-code/`
(added in M2).

## Config

In `pyproject.toml`, or the same keys at the top level of `.honestagent.toml` (no
`[tool.honestagent]` header). If both exist, `.honestagent.toml` wins. CLI flags beat both.

```toml
[tool.honestagent]
test_paths = ["tests/**/*.py", "**/test_*.py", "**/*_test.py", "**/conftest.py"]
fail_on = "has_problems"
disable = []                       # e.g. ["HA006"]
severity = { HA005 = "high" }      # override per rule
allow = [{ rule = "HA005", path = "tox.ini", reason = "py3.9 env dropped on purpose" }]

[tool.honestagent.mutation]        # M3
enabled = false
max_mutants = 50
timeout_sec = 300
```

To allow one finding in code, put an **allow marker** on the line or the line above.
A reason after `--` is required:

```python
@pytest.mark.skip  # honestagent: allow HA002 -- flaky on CI, see issue #12
```

Allowed findings still show in the report, but they do not change the verdict.
One rule ID per marker. A marker with no reason is ignored and shows as an HA000 note.

The config is read from the **base** side of the change (with `--staged` / `--working` the
base is `HEAD`), so an agent cannot switch the gate off in the same change. If the base has no
config, the defaults are used. Any change to the config that weakens the gate is an HA007
finding.

## Verdict and exit codes

| Verdict | JSON value | When |
|---|---|---|
| **Has problems** | `has_problems` | At least one high finding that is not allowed |
| **Take a look** | `take_a_look` | No high, but at least one medium finding that is not allowed |
| **Looks good** | `looks_good` | No high or medium findings that are not allowed |

Low findings never change the verdict.

| Exit code | Meaning |
|---|---|
| `0` | Gate passed |
| `1` | Gate failed: the verdict is at or worse than `--fail-on` (default `has_problems`) |
| `2` | Tool error: not a git repo, bad ref, no default branch found, bad config (unknown key or rule ID, `allow` entry without a reason), `--mutation` without mutmut or with `--staged` / `--working` |

## Roadmap (v1)

| # | Milestone | Done when |
|---|---|---|
| M0 | Evidence check | 30 agent-written PRs checked by hand, counts written down, real cases saved as test fixtures. Go if 3 or more of 30 show tampering; stop if fewer than 1 in 30. |
| M1 | Core + CLI | `honestagent check` works locally with rules HA000-HA007, allow markers, verdict, text / Markdown / JSON output, config and exit codes |
| M2 | Integrations | pre-commit hook, GitHub Action with one sticky comment, Claude Code hook sample |
| M3 | Mutation add-on | `--mutation` runs mutmut only on changed lines, in a temp copy; HA100 findings |
| M4 | Launch v0.1 | On PyPI and GitHub Marketplace, Claude Code plugin listing, data post from M0 numbers |

Later (not v1): JavaScript / TypeScript rules, SARIF output, hooks for other agents,
a hosted GitHub App. Details in [`core_docs/MILESTONES.md`](core_docs/MILESTONES.md).

## Docs

| File | What it has |
|---|---|
| [`core_docs/README.md`](core_docs/README.md) | The idea and a map of all docs |
| [`core_docs/QUICK_REFERENCE.md`](core_docs/QUICK_REFERENCE.md) | One-page cheat sheet |
| [`core_docs/FUNCTIONAL_SPECIFICATIONS.md`](core_docs/FUNCTIONAL_SPECIFICATIONS.md) | What it does (features F1-F12) |
| [`core_docs/TDD-tech-design-doc.md`](core_docs/TDD-tech-design-doc.md) | How it is built |
| [`core_docs/TECH_STACK.md`](core_docs/TECH_STACK.md) | Languages, libraries, tools |
| [`core_docs/MILESTONES.md`](core_docs/MILESTONES.md) | Build plan, M0-M4 |
| [`core_docs/decisions/ADR-001-pivot-to-test-integrity-gate.md`](core_docs/decisions/ADR-001-pivot-to-test-integrity-gate.md) | Why this project exists |

## Contributing

Code does not exist yet, so issues and ideas are the most useful thing right now.
When code lands, the rules are short:

- Read [`CLAUDE.md`](CLAUDE.md). The same rules apply to people and AI agents.
- Every rule gets tests first, using recorded PR fixtures in `tests/fixtures/prs/<case>/`.
  No network and no real agents in tests.
- No LLM calls and no network calls in the core.
- Before opening a PR, run `uv run pytest`, `uv run ruff check .` and `uv run pyright`.
- Found an agent PR that cheated and HonestAgent missed it? Open an issue with the diff.
  It becomes a fixture.

## License

MIT (planned).

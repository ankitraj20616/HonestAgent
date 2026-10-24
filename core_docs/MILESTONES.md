# Milestones
## HonestAgent v1 - test-integrity gate for agent pull requests

**Version:** 1.0 (plan for v1 only)
**Date:** 2026-10-24
**Team:** 1 developer + Claude + Codex
**Pace:** Side project. About 10 hours per week. Hours below are estimates.

> Rule: Each milestone ends with something I can **use** or a written answer. No milestone is only "internal work".
> Rule: From **M1**, run `honestagent check` on HonestAgent's own pull requests (dogfood).
> Rule: Tests first. Every rule is tested with recorded PR fixtures in `tests/fixtures/prs/<case>/`. No real GitHub, no real agents, no network in tests.

What each F-number means: `core_docs/FUNCTIONAL_SPECIFICATIONS.md`. How it is built: `core_docs/TDD-tech-design-doc.md`.

---

## Overview

| # | Milestone | Main result | F-numbers | Hours |
|---|---|---|---|---|
| M0 | Evidence check | 30 agent-written PRs hand-checked; go or kill answer | none (no product code) | ~15 |
| M1 | Core + CLI | `honestagent check` works locally with rules HA000-HA007 | F1-F8 | ~30 |
| M2 | Integrations | pre-commit hook, GitHub Action with one sticky comment, Claude Code hook | F9, F10, F11 | ~15 |
| M3 | Mutation add-on | `--mutation` on changed lines; HA100 findings | F12 | ~20-30 |
| M4 | Launch v0.1 | On PyPI and GitHub Marketplace; data post; launch posts | none (release) | ~15 |

Total for v1: about **95-105 hours** (about 10-11 weeks at 10 hours a week). Keep the rest of the ~130-hour budget as buffer.

> M1 needs M0 to say "go". M2 and M3 need M1. M3 can come after M4 if launch is more urgent, but the plan is M3 first.

---

## M0 - Evidence check

**Goal:** Prove with real PRs that agents really weaken tests, before writing any product code.
**Hours:** ~15
**Delivers:** no F-numbers. It delivers the evidence, the counts for the launch post, and the first real fixture cases.

**Do:**
- [ ] Write the counting rules first, in `core_docs/reports/M0_evidence.md`: what counts as "tampering" for each of HA001-HA006 (rule table in `core_docs/FUNCTIONAL_SPECIFICATIONS.md`), and what counts as a fair reason (for example the feature was removed on purpose).
- [ ] Add a counting table to the same file. One row per PR: link, agent (Claude Code / Codex / Copilot / other), repo, lines changed, HA001-HA006 seen (yes/no each), fair reason (yes/no), mutmut result, notes.
- [ ] Pick 5-10 of my own agent-written PRs (client and side work).
- [ ] Find public agent-written Python PRs until there are 30 in total. Ways to search:
  - [ ] Commits: GitHub search for `"Co-Authored-By: Claude"`, or `gh search commits '"Co-Authored-By: Claude"' --limit 100`, then open the PR of each commit.
  - [ ] PRs: `gh search prs '"Generated with Claude Code"' --language python --merged`.
  - [ ] Copilot coding agent PRs (author is the Copilot agent account) and Codex PRs (PR body or branch name mentions Codex).
  - [ ] Prefer PRs that touch both source and test files. Skip docs-only PRs.
  - [ ] Mix merged and open PRs, and at least 3 different agents.
- [ ] Hand-check each PR's diff against the counting rules. Fill one row per PR. Time-box: about 15 minutes per PR.
- [ ] Run mutmut on 5 of the 30 PRs (pick ones with a changed test):
  - [ ] Clone the repo at the PR head commit in a temp folder (never in my own repos).
  - [ ] Limit mutmut to the changed source files only.
  - [ ] Write down: mutants made, mutants that survived, and whether a survivor shows a weak test that matters.
  - [ ] Note the time each run took and any setup pain (this feeds M3).
- [ ] Save at least 10 real cases as fixture candidates:
  - [ ] For each case, save the before and after versions of only the changed files, cut down to the smallest part that still shows the problem.
  - [ ] Write down the PR link, the repo license, and which rule should fire, in `M0_evidence.md`.
  - [ ] Only copy code when the license allows it. Otherwise rewrite the case by hand with the same shape.
  - [ ] Include at least 2 clean cases (no tampering) so M1 can test for false positives.
- [ ] Write the summary at the top of `M0_evidence.md`: X of 30 showed tampering, split by rule and by agent, and mutmut results. Plain numbers, no guesses.
- [ ] Decide go or kill (below) and add a line to `core_docs/timeline/timeline.md`.

**Done when:**
- `core_docs/reports/M0_evidence.md` has 30 filled rows and a summary with counts.
- mutmut was tried on 5 PRs and the results are written down.
- At least 10 fixture candidates are saved and listed with their expected rule.

**Kill signal:** fewer than 1 in 30 PRs show tampering. Stop and rethink before M1.
**Go signal:** 3 or more of 30 PRs show tampering.
**1 or 2 of 30:** no clear signal. Write down why, and decide on purpose before starting M1.

---

## M1 - Core + CLI

**Goal:** `honestagent check` gives a correct verdict on a local repo, from the terminal.
**Hours:** ~30
**Delivers:** F1, F2, F3, F4, F5, F6, F7, F8.

**Build (tests first for every item):**
- [ ] Package setup: `pyproject.toml`, `src/honestagent/` layout, uv, ruff, pyright, pytest. `uv run pytest`, `uv run ruff check .` and `uv run pyright` all pass on an empty package.
- [ ] `config.py`: all defaults and constants in one place (test globs `["tests/**/*.py", "**/test_*.py", "**/*_test.py", "**/conftest.py"]`, severities, `fail_on`).
- [ ] `models.py`: `Finding`, `Report`, `Severity`, `Verdict` as Pydantic models.
- [ ] Test helper: turn a fixture's `before/` and `after/` folders into a temp git repo with two commits.
- [ ] Turn the M0 fixture candidates into `tests/fixtures/prs/<case>/` with `before/`, `after/` and `expected.json`.
- [ ] `git.py`: git calls through `subprocess` with a list of args. Tests for a bad ref and "not a git repo".
- [ ] `changes.py` (F1): build a change set for `--base`/`--head`, `--staged` and `--working`. Default base is the merge-base of `HEAD` with the default branch (`origin/HEAD`, then `main`, then `master`; none found -> exit 2, ask for `--base`); default head is `HEAD`.
- [ ] `changes.py` (F2): sort changed files into test files and source files with the default globs; globs come from config.
- [ ] `rules/__init__.py`: the `RULES` registry. Each rule is a pure function `(ChangeSet, Config) -> list[Finding]`. HA000 and HA100 are registered with `check=None` so `rules` and `explain` list them.
- [ ] HA000 honestagent-note (low): tool notes for a skipped file (binary, too large), a Python file that did not parse, and an allow marker with no reason. Tests for each.
- [ ] HA001 test-deleted: failing fixture tests first, then the rule (removed test function, class or file; rename that stops collection).
- [ ] HA002 skip-added: fixtures first, then the rule (skip/xfail marks and calls, `--ignore`, `--deselect`, `collect_ignore`).
- [ ] HA003 assertion-weakened: fixtures first, then the rule (fewer asserts, trivial assert, wider `pytest.raises`, bigger `pytest.approx` tolerance; expected-value rewrite is medium).
- [ ] HA004 coverage-lowered: fixtures first, then the rule (`fail_under` / `--cov-fail-under` lowered or removed, in every listed file type).
- [ ] HA005 ci-or-lint-weakened: fixtures first, then the rule (removed steps, `continue-on-error: true`, `|| true`, new ignore entries, new inline `# noqa` / `# type: ignore` / `# pragma: no cover`).
- [ ] HA006 snapshot-rewritten: fixtures first, then the rule (snapshot files changed together with source code).
- [ ] HA007 gate-config-weakened (`rules/gate_config_weakened.py`): fixtures first, then the rule (a change to `[tool.honestagent]` or `.honestagent.toml` that disables a rule, lowers a severity, adds an `allow` entry or loosens `fail_on`).
- [ ] `allow.py` (F4): inline allow marker on the line or the line above, and the config `allow` list. One rule ID per marker. A marker with no reason is ignored and reported as an HA000 note. Allowed findings still show; markers added in the change are listed in the "Allowed" section.
- [ ] `verdict.py` (F5): pure function. One unit test for every row of the verdict table, plus "low never changes the verdict".
- [ ] Config loading (F7): `[tool.honestagent]` in `pyproject.toml`, or the same keys at the top level of `.honestagent.toml` (it wins if both exist; CLI flags beat both). Read from the **base** ref (`HEAD` for `--staged` / `--working`); defaults if the base has none. Tests for `disable`, `severity`, a head-only config change (no effect, HA007 fires) and a bad config (unknown key or rule ID, `allow` without a reason: exit 2).
- [ ] `report/text.py`, `report/markdown.py`, `report/json.py` (F6). Snapshot-style tests of each output for 3 fixtures. Markdown is cut with a note when it gets near the GitHub comment limit.
- [ ] `cli.py` (F8): `check`, `rules`, `explain`, `version`. Tests for exit codes 0, 1 and 2 and for every `--fail-on` value.
- [ ] `honestagent explain` text for each rule (HA000-HA007; HA100 gets its text in M3): what it catches, one example, how to allow it.
- [ ] Run `honestagent check` on all M0 cases. Fix the rules until every real case is caught and every clean case says "Looks good".
- [ ] Run it on 3 of my own recent PRs and write down any false positives as new fixtures.

**Done when:**
- `honestagent check` works on a local repo with base/head, `--staged` and `--working`.
- HA000-HA007, allow markers, verdict, text/markdown/json output, config and exit codes all work.
- Every rule has fixture tests, and all M0 real cases are caught.
- `uv run pytest`, `uv run ruff check .` and `uv run pyright` pass, and the output is shown.

---

## M2 - Integrations

**Goal:** The gate runs by itself before a commit, on every PR, and when Claude Code finishes.
**Hours:** ~15
**Delivers:** F9, F10, F11.

**Build:**
- [ ] F9: `.pre-commit-hooks.yaml` with hook id `honestagent` that runs `honestagent check --staged --format text`.
- [ ] Try the hook on a scratch repo with `pre-commit try-repo`: one clean commit passes, one commit with a new skip is blocked.
- [ ] F10: composite `action.yml` with inputs `fail-on`, `mutation`, `comment` (default true) and `python-version`.
- [ ] The Action docs say the user's workflow needs `actions/checkout` with `fetch-depth: 0`. Snippet: `uses: ankitraj20616/HonestAgent@v0`.
- [ ] The Action installs the package and runs `honestagent check --base <PR base sha> --head <PR head sha> --format markdown`.
- [ ] The Action creates or updates **one** PR comment, found by the hidden marker `<!-- honestagent -->`, using `gh` and `GITHUB_TOKEN`. It exits with the CLI exit code.
- [ ] Make a sandbox GitHub repo. Open 3 PRs: clean, tampered, and tampered with an allow marker. Check the verdict and the comment on each.
- [ ] Push a second commit to one PR and check that the same comment is updated (not a new one).
- [ ] Check a fork PR: the job result shows, and the run does not fail just because the token cannot comment.
- [ ] F11: read the current Claude Code hooks docs (https://code.claude.com/docs/en/hooks) before writing anything. Do not guess the JSON or the exit-code behaviour.
- [ ] Write the sample `hooks/claude-code/settings.json`: a `Stop` hook that runs `honestagent check --working --format text` and maps the exit codes: CLI 1 -> hook 2 on the first stop (the agent sees the findings); `stop_hook_active` true -> hook 1 (no block, no loop); CLI 2 -> hook 1.
- [ ] Try the hook in a real Claude Code session on a scratch repo: ask the agent to "make the failing test pass" and check that the hook stops it when it skips the test.
- [ ] Docs: a short section for each of the three integrations in `README.md`, plus `hooks/claude-code/README.md`.

**Done when:**
- The pre-commit hook blocks a tampered commit and passes a clean one.
- The Action posts one sticky comment on the sandbox repo and updates it on a new push.
- The Claude Code `Stop` hook sample works in a real session.
- Docs exist for all three.

---

## M3 - Mutation add-on

**Goal:** Show tests that pass but do not really check the changed code.
**Hours:** ~20-30
**Delivers:** F12.

**Build (tests first):**
- [ ] Add mutmut as an optional extra: `pip install honestagent[mutation]`.
- [ ] If mutmut is not installed, `--mutation` exits 2 with a clear install message. Test it.
- [ ] `--mutation` with `--staged` or `--working` exits 2 with a clear message (mutation needs `--base/--head`). Test it.
- [ ] `honestagent explain HA100` text.
- [ ] Mutation settings in `config.py` defaults and config: `mutation.enabled`, `max_mutants`, `timeout_sec`.
- [ ] Create a temp git worktree of the head ref; remove it at the end, also on error or timeout. Test that the user's working tree is unchanged after a run.
- [ ] Mutate only the changed source lines from the diff, not the whole project. Stop at `max_mutants` and `timeout_sec`.
- [ ] Each surviving mutant becomes an HA100 finding with file, line and the mutation.
- [ ] Fixture: a tiny project with a weak test, where a known mutant survives. A second fixture where all mutants are killed.
- [ ] Show HA100 findings in all three report formats.
- [ ] Action: `mutation: true` passes `--mutation`. Try it on the sandbox repo and note the run time.
- [ ] Use the M0 mutmut notes to set sensible defaults; write the numbers in the docs.

**Done when:**
- `honestagent check --mutation` runs mutmut only on changed lines in a temp worktree, within the limits.
- Surviving mutants show as HA100 findings.
- It works in the Action with `mutation: true`.

---

## M4 - Launch v0.1

**Goal:** Other people can find, install and try HonestAgent in 5 minutes.
**Hours:** ~15
**Delivers:** no new F-numbers. It ships F1-F12 as v0.1.

**Do:**
- [ ] Final check: `uv run pytest`, `uv run ruff check .`, `uv run pyright` pass; run the gate on its own repo.
- [ ] Publish `honestagent` 0.1.0 on PyPI. Install it in a clean virtual env and run `honestagent version`.
- [ ] Tag the release and list the Action on GitHub Marketplace.
- [ ] README: a real PR-comment example (from the sandbox repo), install steps for all three integrations, and the rule table.
- [ ] Data post from the M0 numbers ("I checked 30 agent-written PRs: X weakened or deleted tests").
- [ ] Posts: Show HN, r/Python, and an X thread with a short demo.
- [ ] Claude Code plugin listing for the hook.
- [ ] Open a GitHub Discussion "Team plan - interested?" and link it from the README. No website.
- [ ] Add a line to `core_docs/timeline/timeline.md` with the launch date. Day 60 is counted from here.

**Done when:**
- `pip install honestagent` works and the Action is on GitHub Marketplace.
- The README shows a real PR comment.
- The data post and the launch posts are live, and the Discussion link is in the README.

---

## After v1 - the day-60 check

Nothing for v2 is planned now. About 60 days after launch, look at the numbers and decide if there is pull for a paid team tier.

- **Go signal (all three):**
  1. 300 or more stars, **or** 50 or more repos using the Action; **and**
  2. 5 or more issues or PRs from outside people; **and**
  3. 3 or more teams asking for org features or clicking the "Team plan - interested?" link.
- **Kill signal:** fewer than 100 stars and fewer than 10 installs after launch plus 2 posts. Keep HonestAgent as a portfolio piece and stop adding features.

Source: the 90-day plan in the research, summed up in `decisions/ADR-001-pivot-to-test-integrity-gate.md`.

---

## Later (not v1)

One line each. Do not design or build these now.

- JavaScript / TypeScript rules (Jest, Vitest).
- Hosted GitHub App and paid team tier (org policy, history, private-repo PR checks).
- Trust score 0-100.
- Optional LLM second opinion.
- HTML proof report.
- Codex and other agent hooks.
- Web dashboard.
- SARIF output for GitHub code scanning.

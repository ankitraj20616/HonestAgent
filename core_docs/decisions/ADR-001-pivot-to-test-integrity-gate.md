# ADR-001: Pivot from Saarthi to HonestAgent, a test-integrity gate

**Date:** 2026-10-24
**Status:** Accepted

## Context

- The project started on 2026-10-11 as **Saarthi**: a task-first Agentic Development
  Environment for Linux, macOS and Windows. It had a background service, a desktop app, a
  task board, a worktree per task, two agents racing on one goal, Jira tickets, browser
  testing and more. The plan was M0-M12 (about 6 months of side-project time).
- New research (24 Oct 2026) found that this kind of tool is now free from the big vendors.
  Anthropic (Claude Code `claude agents`), OpenAI (Codex `/agents`), Microsoft (VS Code
  Agent Sessions) and Cursor (Agents Window) all ship the task list, the worktree per task,
  the "needs you" inbox and the diff view.
- More than fifteen independent tools chase the same users, and some are funded (Conductor
  raised $22M). Vibe Kanban had thousands of daily users and still shut down: "the vast
  majority are free users and we couldn't find a business model"
  (https://vibekanban.com/blog/shutdown). It had a $30 per user per month Pro plan before it
  closed (https://nimbalyst.com/blog/vibe-kanban-after-bloop-whats-next/).
- The same research found a strong, named pain: AI coding agents weaken, skip or delete
  tests to make them "pass".
  - The Faros AI 2026 report (22,000 developers), as quoted by Addy Osmani: median review
    time up 441.5%, PRs merged with zero review up 31.3%, incidents per PR up 242.7%, agent
    PRs about 51% larger (https://addyosmani.com/blog/agentic-code-review/). Sources differ a
    little on which Faros report gives which number, and Faros sells analytics.
  - Osmani names the exact problem: "test tampering (agents rewrite assertions to match
    broken behaviour)" and "CI weakening (removing tests, skipping lint, lowering coverage)"
    (same link).
  - 80.2% of agent-written test patches have weak or missing oracle signals, meaning the test
    does not really check the answer
    (https://codex.danielvaughan.com/2026/08/15/all-smoke-no-alarm-oracle-signals-agent-authored-tests-codex-cli-posttooluse-assertion-quality-verification/).
  - The Thoughtworks Technology Radar calls mutation testing "the most reliable signal" of
    whether tests catch faults (https://www.thoughtworks.com/radar/techniques/mutation-testing).
    This is why HonestAgent has the opt-in mutation check (M3).
- Competition is light but real. No commercial product for this was found. There are three
  tiny PyPI tools: checkwash (https://pypi.org/project/checkwash/), tamperguard
  (https://pypi.org/project/tamperguard/0.1.0/) and tampercheck
  (https://pypi.org/project/tampercheck/). A Product Hunt thread asks exactly "How do you stop
  AI coding agents from weakening tests to make them pass?"
  (https://www.producthunt.com/p/vibecoding/how-do-you-stop-ai-coding-agents-from-weakening-tests-to-make-them-pass).
- Teams do pay for review help in general: CodeRabbit charges $24-48 per user per month and
  is estimated by Sacra (not the company) at about $40M ARR (https://sacra.com/c/coderabbit/);
  Cursor Bugbot is $40 (https://docs.cursor.com/bugbot/pricing). AI reviewers also disagree:
  in one test of four reviewers, 93.4% of flagged spots were caught by only one tool
  (https://addyosmani.com/blog/agentic-code-review/). A deterministic yes/no check fits next
  to them.
- No Saarthi code was written. The repo holds only docs, design files and prototype scripts.
  Stopping now is cheap: the only loss is design time.

## Decision

Build **HonestAgent v1**: an open-source, deterministic test-integrity gate for pull
requests, mostly ones written by AI coding agents.

- It answers one question: "Are the tests real, or did the agent cheat to make them pass?"
- Python and pytest first. One package, `honestagent`. A stateless CLI that reads git and
  prints a report. No server, no database, no UI.
- Same input, same answer. No LLM in the core. The agent that wrote the code cannot grade
  itself.
- Ways to run it, all thin wrappers over the CLI: `honestagent check`, a pre-commit hook, a
  GitHub Action with one sticky PR comment, and a Claude Code hook.
- Before any product code, check 30 real agent-written PRs (M0). Stop if fewer than 1 in 30
  show tampering; go if 3 or more do. 1-2 of 30 is no clear signal: write down why and
  decide on purpose before M1.

Details: `core_docs/FUNCTIONAL_SPECIFICATIONS.md`, `core_docs/TDD-tech-design-doc.md`,
`core_docs/MILESTONES.md`.

## What we keep from Saarthi

| Saarthi idea | Becomes in HonestAgent |
|---|---|
| Check Runner (F7.1-F7.2) | The rule engine: one `RULES` registry of pure rule functions |
| Verdict words "Looks good / Take a look / Has problems" | The gate verdict, made simpler (no trust score in v1) |
| Proof Card (F7.3) | The Markdown proof report (also the PR comment) a freelancer can give a client |
| Recorded-fixture testing rule | Tests use recorded PR fixtures in `tests/fixtures/prs/<case>/`; never real agents, GitHub or the network |

## What we drop

Everything else from Saarthi: the background service and its API, the desktop app and all UI
design files, the task board and task page, task stages and their move table, agent adapters,
the worktree per task, Race Mode and side-by-side runs, Context Pack and Change Story, research
and lessons screens, Jira tickets, browser testing and live preview, the per-OS sandbox,
installers, and the SQLite event store.

## Consequences

Good:
- Small scope. v1 fits in about 95-105 hours, so it can launch inside 90 days.
- I am the first user (Python freelancer, agent-written client work), so I can test it on
  real work every week.
- The pain is measured and named by respected people in the field.
- Open source and developer-facing: good for reputation, a data post and Show HN.
- The stance (vendor-neutral, deterministic) is hard for an agent vendor to copy honestly.

Bad:
- Weak proof that people pay. Nobody was found paying for a stand-alone tamper or mutation
  tool (paying for CodeRabbit or Bugbot is general review, not this). Plan for reputation
  and leads in year one, not income.
- Platform risk is medium. CodeRabbit, Copilot review or Anthropic could add a "tests were
  weakened" rule in one sprint.
- Light but real competition (checkwash, tamperguard, tampercheck; links above). HonestAgent
  must be the best and the best-known, not the first.
- Rules can give false positives (a test removed on purpose). Allow markers with a reason
  are needed from day one.
- Python only in v1. JavaScript users must wait.

## Where the old docs are

- All Saarthi docs and design files are kept at the git tag **`saarthi-final`**.
- Read one file: `git show saarthi-final:core_docs/FUNCTIONAL_SPECIFICATIONS.md`.
- List all files: `git ls-tree -r --name-only saarthi-final`.

## After v1: the day-60 check

From the research's 90-day plan. About 60 days after launch, decide if there is pull for a
paid team tier.

- **Go (all three):** (300 or more stars, or 50 or more repos using the Action) and 5 or more
  outside issues or PRs and 3 or more teams asking for org features or clicking the
  "Team plan - interested?" link.
- **Kill:** fewer than 100 stars and fewer than 10 installs after launch plus 2 posts. Keep
  HonestAgent as a portfolio piece and stop adding features.

## Research

This ADR is the record of the research (24 Oct 2026). The facts above carry their source
links, so it stands on its own. The full research notes were private working notes and are
not in the repo.

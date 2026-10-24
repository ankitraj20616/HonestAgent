# core_docs - HonestAgent

**HonestAgent** is an open-source, deterministic **test-integrity gate** for pull requests,
mostly ones written by AI coding agents (Claude Code, Codex, Copilot).
It answers one question: **"Are the tests real, or did the agent cheat to make them pass?"**

---

## The idea in 6 lines

1. When an agent cannot fix the code, it sometimes deletes, skips or weakens the tests so they "pass".
2. Reviewers miss it. HonestAgent reads the change and flags it with fixed rules (HA001-HA007, HA100, plus HA000 tool notes).
3. Each finding is plain: rule, file, line, one sentence, a short before / after.
4. All findings add up to one **verdict**: Looks good / Take a look / Has problems.
5. **Deterministic.** Same input, same answer. No LLM, no network in the core. The agent cannot grade itself.
6. **CLI first.** One stateless `honestagent` command. The pre-commit hook, the GitHub Action and the Claude Code hook only call it.

Python and pytest first. The first user is the author (a Python freelancer).
This is **v1 only**. Anything past v1 is one line in the "Later" list, never designed.

---

## Why we pivoted

This repo used to hold the docs for **Saarthi**, a desktop environment for running AI coding
agents. Research showed that the multi-agent dashboard space is now crowded and free, and that
almost nobody pays for it. Saarthi was dropped before any code was written. We kept its three
best ideas: the check runner, the plain verdict and the proof card (now the **proof report**).
HonestAgent uses them for one narrow, well-measured pain: agents that cheat on tests.
The full reasons, with the research facts and their source links, are in
[`decisions/ADR-001-pivot-to-test-integrity-gate.md`](decisions/ADR-001-pivot-to-test-integrity-gate.md).
The old Saarthi docs are still readable with `git show saarthi-final:<path>`.

---

## How the docs flow

```
FSD (what) -> TDD (how) -> plans/ (steps for one milestone) -> code + tests
```

- The **FSD** says what the tool does, as features F1-F12.
- The **TDD** says how it is built: modules, models, rule logic, report formats.
- A **plan** in `plans/` breaks one milestone into small steps before coding starts.
- After the work: lessons go to `learnings/`, big bugs to `memory/`, the date to `timeline/timeline.md`.

If code and docs disagree, fix the doc in the same PR.

---

## Documents in this folder

| File | What it has | Read it when |
|---|---|---|
| `README.md` | This page. Idea + map of docs. | First |
| `QUICK_REFERENCE.md` | One-page cheat sheet: rules, verdict, CLI, config, milestones. | You need a fast reminder |
| `FUNCTIONAL_SPECIFICATIONS.md` | **FSD**. What the tool does. Features F1-F12, in points. | Before building any feature |
| `TDD-tech-design-doc.md` | **TDD**. How it is built. Modules, models, rules, reports. | Before writing code |
| `TECH_STACK.md` | Languages, libraries, tools, and what was removed. | Before setup or adding a library |
| `MILESTONES.md` | Build plan. M0 to M4 with "done when" checks. | Planning the next session |
| `quick-prompts.md` | Ready prompts to give Claude / Codex while building HonestAgent. | Every session |

## Sub-folders

| Folder | What goes inside |
|---|---|
| `decisions/` | One file per big decision (ADR). Starts with `ADR-001-pivot-to-test-integrity-gate.md`. |
| `plans/` | Implementation plans, one per milestone or feature. |
| `reports/` | Evidence and test reports. M0 writes `reports/M0_evidence.md`. |
| `learnings/` | Patterns, mistakes, "do this, not that" rules. |
| `memory/` | `project_memory.md` - big wins and hard bugs (Problem -> Root cause -> Fix -> Result). |
| `code_reviews/` | Audit reports and review notes. |
| `timeline/` | `timeline.md` - what got done, on which date. |

---

## Golden rules for this project

1. **Simple first.** Build the smallest thing that works.
2. **CLI first.** Every feature works as `honestagent ...` before any integration wraps it.
3. **Deterministic.** No LLM and no network in the core. Same input, same answer.
4. **Read-only.** Never edit, commit or push the user's code.
5. **Real cases first.** Rules are tested on recorded PR fixtures, many taken from the M0 evidence check.
6. **Dogfood.** The author runs HonestAgent on his own client work from M1.

Full rule list: [`../CLAUDE.md`](../CLAUDE.md).

---

## Decisions

| File | Decision |
|---|---|
| `decisions/ADR-001-pivot-to-test-integrity-gate.md` | Drop Saarthi. Build HonestAgent, an open-source test-integrity gate, v1 only. |

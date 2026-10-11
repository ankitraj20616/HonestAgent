# core_docs - Saarthi

**Saarthi** = "the one who drives the chariot".
You decide where to go. The agents (Claude, Codex) do the driving.

Saarthi is a personal **Agentic Development Environment (ADE)** for Linux.
It is **not** an IDE. It is **not** built on VS Code.

---

## The idea in 6 lines

1. An IDE is built around **files**. Saarthi is built around **tasks**.
2. You **research** and write the **intent**. Agents write the **code**.
3. Every task runs in its **own git worktree**. So many tasks can run at the same time, with no clash.
4. No task is "done" without **proof**: tests, checks, logs, screenshots.
5. You review a **Change Story** (what changed and why), not a wall of diff.
6. The project **remembers**: core_docs, learnings, and memory are fed to agents and updated after every task.

Also: every task has a **Docs** tab (plans, changed .md files, pinned project docs), and tasks can start from **Jira tickets** (M10).

---

## Why we need this

How we work today:

- We read the task and research it.
- We ask Claude / Codex to write the code.
- We ask them to test it.
- We check the result and verify.
- We fix, commit, and make the PR.

We spend almost no time typing code. But our tools (IDEs) are still made for typing code.
Saarthi is made for the real loop:

```
Capture -> Research -> Brief -> Run agent -> Verify -> Review -> Ship -> Remember
```

---

## Documents in this folder

| File | What it has | Read it when |
|---|---|---|
| `README.md` | This page. Idea + map of docs. | First |
| `QUICK_REFERENCE.md` | One-page summary of the product. | You need a fast reminder |
| `FUNCTIONAL_SPECIFICATIONS.md` | **FSD**. What the app does. Every feature, in points. | Before building any feature |
| `TDD-tech-design-doc.md` | **TDD**. How the app is built. Parts, data, flows, APIs. | Before writing code |
| `TECH_STACK.md` | Languages, libraries, tools. Python vs Go vs Rust decision. | Before setup or adding a library |
| `MILESTONES.md` | Build plan. Milestones M0 to M10 with "done when" checks. | Planning the next session |
| `quick-prompts.md` | Ready prompts to give Claude / Codex while building Saarthi. | Every session |

## Sub-folders

| Folder | What goes inside |
|---|---|
| `milestones/` | One sub-folder per milestone (M0-M10), each with its own FSD and TDD. Start at `milestones/README.md`. |
| `memory/` | `project_memory.md` - big wins, hard bugs (Problem -> Root cause -> Fix -> Result). One file per module later (`agent_runner_memory.md` etc.). |
| `learnings/` | Patterns, mistakes, "do this, not that" rules. |
| `decisions/` | One file per big decision (ADR). Example: `ADR-001-backend-language.md`. |
| `plans/` | Implementation plans per milestone or feature. |
| `code_reviews/` | Audit reports, review notes. |
| `reports/` | Test reports, manual test runs, screenshots. |
| `timeline/` | `timeline.md` - what got done, on which date. |

---

## Golden rules for this project

1. **Simple first.** Build the smallest thing that works. Add more later.
2. **CLI first, UI second.** Every feature must work from the `saarthi` CLI before it gets a screen.
3. **Dogfood.** From milestone M2, we build Saarthi **using** Saarthi.
4. **Agents are plugins.** Claude and Codex sit behind one common "Agent Adapter". Adding a new agent must not change the core.
5. **Proof over trust.** The app never marks a task done just because the agent said "done".
6. **Local first.** Everything runs on your machine. No cloud server of our own.

# core_docs - Saarthi

**Saarthi** = "the one who drives the chariot".
You decide where to go. The agents (Claude Code, Codex, Gemini CLI) do the driving.

Saarthi is a personal **Agentic Development Environment (ADE)** for Linux, macOS and Windows.
It is task-first, with a **built-in IDE-style file view** (Files) for exploring and reviewing code.
It is **not** a full editor (no LSP, debugger or extensions). It is **not** built on VS Code.

---

## The idea in 6 lines

1. An IDE is built around **files**. Saarthi is built around **tasks**. Files are one screen, not the home screen.
2. You write the **goal**. Agents write the **code**.
3. Every task runs in its **own copy of the repo** (a git worktree). So many tasks can run at the same time, with no clash.
4. No task is "done" without **proof**: tests and checks, shown as a simple verdict.
5. You review **what changed and why**, grouped, not a wall of diff.
6. The project **remembers**: core_docs, lessons and notes are fed to agents and updated after every task.

Also:
- **Many git repos in one window.** Home has project tabs and **All projects**. No new window per repo.
- One light app for **Linux, macOS and Windows** (no Electron).
- Every task has a **Docs** view (plans, changed .md files, pinned project docs), and tasks can start from **Jira tickets** (M10).

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
New task -> Goal -> Start -> Answer Claude -> Check and ship -> Done (lessons learned)
```

On screen a task has only 4 statuses: **To do**, **Working**, **Needs you**, **Done**. The engine keeps its 8 stages (see the FSD).

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
| `design/2026-10-23-simple-ui-design.md` | **Simple UI spec**: product rules P1-P5, decisions D1-D8, statuses, UI words, screens. | Before any UI work |
| `design/Saarthi Prototype.html` | Clickable prototype of the whole product (dummy data). Open a view with `#<id>`. | To see a screen |
| `quick-prompts.md` | Ready prompts to give Claude / Codex while building Saarthi. | Every session |

## Sub-folders

| Folder | What goes inside |
|---|---|
| `milestones/` | One sub-folder per milestone (M0-M10), each with its own FSD and TDD. Start at `milestones/README.md`. |
| `memory/` | `project_memory.md` - big wins, hard bugs (Problem -> Root cause -> Fix -> Result). One file per module later (`agent_runner_memory.md` etc.). |
| `learnings/` | Patterns, mistakes, "do this, not that" rules. |
| `design/` | UI spec and prototype. The old Wheel design is in `design/archive/wheel/` (history only). |
| `decisions/` | One file per big decision (ADR). |
| `plans/` | Implementation plans per milestone or feature. |
| `code_reviews/` | Audit reports, review notes. |
| `reports/` | Test reports, manual test runs, screenshots. |
| `timeline/` | `timeline.md` - what got done, on which date. |

---

## Golden rules for this project

1. **Simple first.** Build the smallest thing that works. Add more later.
2. **CLI first, UI second.** Every feature must work from the `saarthi` CLI before it gets a screen.
3. **Dogfood.** From milestone M2, we build Saarthi **using** Saarthi.
4. **Agents are plugins.** Claude Code, Codex and Gemini CLI sit behind one common "Agent Adapter". Adding a new agent must not change the core.
5. **Proof over trust.** The app never marks a task done just because the agent said "done".
6. **Local first.** Everything runs on your machine. No cloud server of our own.
7. **Light and cross-platform.** One codebase for Linux, macOS and Windows. Small installer, low RAM (see `TECH_STACK.md`, Size budget).

---

## Decisions

| File | Decision |
|---|---|
| `decisions/ADR-001-agent-integration.md` | Agent integration. Written after the M0 spikes. |
| `decisions/ADR-002-cross-platform-lightweight.md` | One app for Linux, macOS and Windows: Tauri 2 + Python daemon as a sidecar, one CI matrix, a size budget. |
| `design/2026-10-23-simple-ui-design.md` | Simple UI replaces the Wheel look: 4 statuses, plain words, Files (IDE view), Check and ship. |

# Milestones
## Saarthi - Agentic Development Environment

**Version:** 0.1
**Date:** 2026-10-11
**Team:** 1 developer + Claude + Codex
**Pace:** Side project. About 8-10 hours per week. Weeks below are rough.

> Rule: Each milestone ends with something I can **use**. No milestone is only "internal work".
> Rule: From **M2**, build Saarthi **using** Saarthi (dogfood).

---

## Overview

| # | Milestone | Main result | Rough time |
|---|---|---|---|
| M0 | Spike + skeleton | Proof that we can drive Claude and Codex from Python and show it in Tauri | 1 week |
| M1 | Daemon core + CLI | Projects, tasks, briefs, events - from the CLI | 2 weeks |
| M2 | Agent runs + worktrees | Run Claude / Codex on a task in its own worktree from the CLI | 2 weeks |
| M3 | Desktop UI v1 | Board + Task Room + live stream + terminal | 3 weeks |
| M4 | Checks + Proof Card | Auto checks, Proof Card, "Fix with agent" loop | 1.5 weeks |
| M5 | Review + Ship | Change Story, comments, Second Opinion, commit + PR | 2 weeks |
| M6 | Research + Memory + Playbooks | Research Desk, Context Pack from core_docs, memory auto-update | 2 weeks |
| M7 | Race Mode + parallel polish | Claude vs Codex side by side | 1 week |
| M8 | Safety + cost + rewind | Sandbox, permission profiles, cost meter, checkpoints UI | 1.5 weeks |
| M9 | Polish + package (v1.0) | AppImage / .deb, systemd service, docs | 1 week |
| Later | Phone glance, voice capture, more agents, team mode | - | - |

Total for v1: about **15 weeks** of side-project time (plus buffer: plan for ~4 months).

---

## M0 - Spike + skeleton

**Goal:** Remove the biggest unknowns before building anything big.

**Build:**
- [ ] Create repo `saarthi/` with `daemon/` and `desktop/` folders (see TECH_STACK.md section 4).
- [x] Add `CLAUDE.md` and `AGENTS.md` with project rules (first draft done with core_docs).
- [ ] Spike 1 - Claude: Python script runs `claude -p --output-format stream-json --input-format stream-json --verbose` in a temp git repo. Print every event.
  - [ ] Record 3 real streams to `tests/fixtures/agents/`: simple edit, a run that asks a question, a run that fails.
  - [ ] Find how a question / permission request looks in the stream.
  - [ ] Test `--resume <session-id>`.
- [ ] Spike 2 - Codex: same with `codex exec --json -C <dir>`.
  - [ ] Record 3 streams.
  - [ ] Test `codex exec resume`.
  - [ ] Test `--output-schema` with a small findings schema.
  - [ ] Try `codex review` once.
- [ ] Spike 3 - PTY: run interactive `claude` in a PTY from Python and pipe it to a WebSocket.
- [ ] Spike 4 - Tauri: Tauri 2 window loads a React page with xterm.js + CodeMirror. Check that it runs smoothly on Ubuntu (WebKitGTK).
- [ ] Spike 5 - Worktree: create / remove a worktree from Python; make a checkpoint with a temp index (TDD 4.5.1).
- [ ] Write findings in `core_docs/decisions/ADR-001-agent-integration.md`.

**Done when:**
- I have 6+ recorded agent streams in the fixtures folder.
- I know how to detect "needs input" for both agents (or I have a written workaround).
- A Tauri window shows a live terminal running `claude`.

---

## M1 - Daemon core + CLI

**Goal:** The brain of the app works without any UI.

**Build:**
- [ ] `daemon/` Python package with uv, ruff, pyright, pytest set up.
- [ ] `config.py`: all settings and constants in one place.
- [ ] SQLite + SQLAlchemy models: projects, tasks, briefs, research_items, runs, events, settings (TDD section 5).
- [ ] Alembic first migration.
- [ ] Event Bus + Event Store (SQLite + JSONL).
- [ ] Task Engine with the stage table `ALLOWED_MOVES` + unit tests for every move.
- [ ] FastAPI app: health, projects, tasks, stage, brief, research endpoints.
- [ ] WebSocket with subscribe + `last_event_id` replay.
- [ ] Token auth, bind to 127.0.0.1.
- [ ] Typer CLI: `daemon start|stop|status`, `project add|list`, `task new|list|show|move`, `brief edit` (opens `$EDITOR`).
- [ ] `.saarthi/project.toml` reader with defaults.

**Done when:**
- `saarthi project add ~/OFFICE/<some-project>` works.
- `saarthi task new "test task"` -> `saarthi task move T-0001 ready` blocks without a brief, works after `saarthi brief edit T-0001`.
- `saarthi task show T-0001 --json` prints the task and its events.
- Test coverage of `core/` above 80%.

---

## M2 - Agent runs + worktrees

**Goal:** Run real agents on real tasks, in isolation. **Start dogfooding here.**

**Build:**
- [ ] `AgentAdapter` protocol + `FakeAdapter` (replays fixtures).
- [ ] `ClaudeAdapter`: start, events (mapping), send, stop, resume.
- [ ] `CodexAdapter`: same.
- [ ] Event mapping tests using M0 fixtures.
- [ ] Workspace Manager: create worktree, setup script, status, diff, checkpoint, remove.
- [ ] Run Manager: queue, max parallel, start/stop, end-of-run checkpoint.
- [ ] "Needs You" flow: detect, set stage, accept answer.
- [ ] Daemon restart -> mark runs `interrupted` + resume.
- [ ] Simple Context Pack v0: brief only -> `.saarthi/context/TASK.md`.
- [ ] Notifier using `notify-send`.
- [ ] CLI: `run <task> --agent --mode`, `run watch <run>` (pretty live stream with Rich), `run say <run> "text"`, `run stop`, `run resume`.

**Done when:**
- `saarthi run T-0002 --agent claude --mode build` creates a worktree, runs Claude, and streams clean events in the terminal.
- Two tasks run at the same time (one Claude, one Codex) without touching each other's files.
- Killing the daemon mid-run and restarting it shows the run as `interrupted`; `saarthi run resume` continues it.
- At least **3 real Saarthi tasks** were done using this CLI.

---

## M3 - Desktop UI v1

**Goal:** Daily use from a window, not the terminal.

**Build:**
- [ ] Tauri 2 shell: starts / connects to the daemon, reads the token, native notifications.
- [ ] TypeScript API client generated from OpenAPI.
- [ ] WebSocket client with reconnect + replay.
- [ ] Layout: left nav, top bar, Command Bar (`Ctrl+K`).
- [ ] Command Deck (home): projects, running agents, "Needs You" list, today's cost.
- [ ] Task Board: columns, cards, drag and drop with stage rules, filters.
- [ ] Quick capture (global shortcut).
- [ ] Task Room:
  - [ ] Left panel: brief editor (markdown), runs list, workspace info.
  - [ ] Stream tab: agent cards (message, tool call, command output, file changed).
  - [ ] Terminal tab: xterm.js (PTY adapter).
  - [ ] Message box: send follow-up, answer "Needs You", stop.
  - [ ] Timeline tab (simple list of events).
- [ ] Code Peek: file tree + CodeMirror read-only + "open in my editor".
- [ ] Settings + Health page.
- [ ] Light / dark theme.

**Done when:**
- I do a full day of real work starting tasks and watching agents only from the Saarthi window.
- The UI shows an agent event in under 300 ms.
- Closing the window does not stop running agents.

---

## M4 - Checks + Proof Card

**Goal:** No task reaches Review without proof.

**Build:**
- [ ] Check Runner: run checks from `project.toml`, timeout, kill process group, save output.
- [ ] Auto-run checks after build / fix runs.
- [ ] Proof Card model + "Brief coverage" (agent fills, user confirms).
- [ ] Stage rule: Verifying -> Review only if required checks pass, or override with reason.
- [ ] "Fix with agent" button: new fix run with failing output. Max rounds setting.
- [ ] Proof tab in Task Room. Status dot on board cards.
- [ ] CLI: `saarthi checks <task>`, `saarthi proof <task>`.

**Done when:**
- A broken change auto-moves to `Failed`, I click "Fix with agent", and after the fix it moves to `Review` with all green.
- Override needs a typed reason, and the reason shows in the Proof Card.

---

## M5 - Review + Ship

**Goal:** Review fast and create the PR from Saarthi.

**Build:**
- [ ] Review Builder: diff parse, rule-based risk flags, agent grouping (JSON Schema), fallback "group by folder".
- [ ] Change Story tab: groups, explanations, risk flags, diff viewer (CodeMirror merge view), plain file list.
- [ ] Line / group comments + "Send comments to agent".
- [ ] Second Opinion: cross agent, read-only, findings JSON, show in Change Story, "Fix these".
- [ ] Approve / Reject.
- [ ] Ship: commit message draft, commit, push (default-branch guard in code), `gh pr create` with brief + story + proof.
- [ ] Worktree cleanup prompt.

**Done when:**
- I ship a real PR for a client project fully from Saarthi.
- Second Opinion finds at least one real issue in a test task and the fix loop works.
- Pushing to `main` is impossible even if I try from the API directly (test proves it).

---

## M6 - Research Desk + Memory + Playbooks

**Goal:** Keep the context and the learning.

**Build:**
- [ ] Research Desk: notes, links (title fetch), snippets, "send to agent" toggle.
- [ ] "Research this" (read-only agent run -> finding saved).
- [ ] "Draft brief" from research.
- [ ] Brief versions.
- [ ] Memory screen: core_docs tree, markdown view, simple edit.
- [ ] Context Pack v1: brief + research + matched memory files (ripgrep) + playbook. Preview button.
- [ ] Memory update on ship: drafts for memory / learnings / timeline, approve each.
- [ ] Playbooks: library screen, built-in 5 playbooks, variables, global + project scope.
- [ ] Import my current `quick-prompts.md` files from client projects as playbooks.

**Done when:**
- A new task gets a good brief from "Research this" + "Draft brief" in under 5 minutes.
- After shipping, `core_docs/memory/project_memory.md` and `timeline/timeline.md` are updated with my approval.

---

## M7 - Race Mode + parallel polish

**Goal:** Use both agents together for hard tasks.

**Build:**
- [ ] Race: one brief -> two runs (Claude + Codex) in two worktrees.
- [ ] Compare screen: Proof Cards, diff size, cost, time, side-by-side Change Stories.
- [ ] Pick winner -> keep branch, delete the other worktree.
- [ ] Per-workspace port numbers (avoid dev server clashes).
- [ ] Board: "running now" strip at the top with live mini status.

**Done when:**
- I race a real task and pick the winner in under 2 minutes of review.

---

## M8 - Safety + cost + rewind

**Goal:** Trust the agents more, spend less, undo anything.

**Build:**
- [ ] Permission profiles UI (read-only / safe build / full) per task.
- [ ] Blocked actions list + "always ask" list (TDD 4.9).
- [ ] `bwrap` sandbox wrapper: only the worktree is writable, secret folders hidden.
- [ ] Secret masking in events and UI (with tests).
- [ ] Cost meter: per run, per task, per day; budget alert.
- [ ] Checkpoints list + Rewind button (save current first).

**Done when:**
- In `Full` profile inside bwrap, an agent cannot read `~/.ssh` (test proves it).
- I rewind a task to a checkpoint and come back to the latest again with no loss.

---

## M9 - Polish + package (v1.0)

**Goal:** Install it like a normal app and use it every day.

**Build:**
- [ ] systemd user service for the daemon (`saarthid.service`).
- [ ] Tauri bundle: AppImage + .deb.
- [ ] Daemon install: `uv tool install` (PyInstaller sidecar if needed).
- [ ] First-run wizard: check tools, add the first project.
- [ ] Keyboard shortcut sheet (`?`).
- [ ] Empty states, error banners, loading states.
- [ ] Playwright tests for the 3 main flows.
- [ ] User guide `docs/USER_GUIDE.md`.

**Done when:**
- Fresh install on a clean Ubuntu 24.04 VM works in under 10 minutes.
- I use Saarthi for 2 full weeks without opening an IDE for agent work.
- Tag `v1.0.0`.

---

## Later (after v1)

- **Phone glance:** read-only web page on the phone (LAN + token) to see status and answer "Needs You".
- **Voice capture:** speak a task, it goes to the Inbox.
- **More agents:** Gemini CLI, Aider, local models.
- **Ticket sync:** pull from Jira / GitHub Issues into briefs; push status back.
- **PR status:** CI and review comments from GitHub inside the Task Room.
- **Evidence:** headless browser screenshots + API recordings in the Proof Card.
- **Smart memory:** search memory by meaning (embeddings).
- **Team mode:** share playbooks and memory with 2-5 devs.
- **Go rewrite of the daemon** - only if the signs in TECH_STACK.md 2.3 show up.

---

## How to track progress

- Tick boxes in this file as work is done.
- After each milestone:
  - Add an entry to `timeline/timeline.md` (date + what shipped).
  - Add big problems + fixes to `memory/project_memory.md`.
  - Add new rules to `learnings/`.
  - Write a short review in `code_reviews/` (what is good, what is debt).

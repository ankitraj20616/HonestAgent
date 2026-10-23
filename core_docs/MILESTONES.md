# Milestones
## Saarthi - Agentic Development Environment

**Version:** 0.2
**Date:** 2026-10-23
**Team:** 1 developer + Claude + Codex
**UI:** screen names follow `design/2026-10-23-simple-ui-design.md`.
**Pace:** Side project. About 8-10 hours per week. Weeks below are rough.

> Rule: Each milestone ends with something I can **use**. No milestone is only "internal work".
> Rule: From **M2**, build Saarthi **using** Saarthi (dogfood).

---

## Overview

| # | Milestone | Main result | Rough time |
|---|---|---|---|
| M0 | Spike + skeleton | Proof that we can drive Claude and Codex from Python and show it in Tauri, on Linux, macOS and Windows | 1 week |
| M1 | Daemon core + CLI | Projects, tasks, briefs, events - from the CLI | 2 weeks |
| M2 | Agent runs + worktrees | Run Claude / Codex on a task in its own worktree from the CLI (PTY and paths on every OS) | 2 weeks |
| M3 | Desktop UI v1 | Home (many projects) + Board view + Task page + Files | 3 weeks |
| M4 | Checks (Check and ship, part 1) | Auto checks, verdict, "Let Claude fix it" loop | 1.5 weeks |
| M5 | Review + ship (Check and ship, part 2) | What changed, comments, Ask Codex to review, Approve and create pull request, Files review marks | 2 weeks |
| M6 | Research + Lessons + Saved instructions | Just research, What Claude reads from core_docs, lessons learned | 2 weeks |
| M7 | Side by side + Gemini CLI | Two agents on one goal; Gemini CLI as the third agent | 1.5 weeks |
| M8 | Safety + cost + undo | Sandbox per OS, what agents may do, Safety and cost, History -> Restore | 1.5 weeks |
| M9 | Polish + package (v1.0) | Installers for Linux, macOS and Windows, daemon sidecar, background service per OS, docs | 2 weeks |
| M10 | Jira tickets | Jira tickets screen, start task from ticket, write back | 2 weeks |
| Later | Phone glance, voice capture, more agents, team mode | - | - |

Total for v1: about **20 weeks** of side-project time (plus buffer: plan for ~5 months).

> M10 needs M1-M6. Build it after M6 (it may come before M7).

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
- [ ] Spike 6 - Cross-platform: a GitHub Actions matrix (Ubuntu, macOS, Windows) builds the Tauri window and starts the daemon on each OS. Note the WebView per OS (WebKitGTK / WKWebView / WebView2) and any gaps.
- [ ] Write findings in `core_docs/decisions/ADR-001-agent-integration.md`.

**Done when:**
- I have 6+ recorded agent streams in the fixtures folder.
- I know how to detect "needs input" for both agents (or I have a written workaround).
- A Tauri window shows a live terminal running `claude`.
- The CI matrix shows the Tauri window and the daemon start on Linux, macOS and Windows.

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
- [ ] Plan run saves its plan as a doc (F22.2) + docs list/show API and CLI (F22.3, F22.4).
- [ ] Notifier: sends to the UI; `notify-send` only as a Linux fallback when no UI is open.
- [ ] PTY works on every OS: stdlib `pty` on Linux / macOS, ConPTY via `pywinpty` on Windows.
- [ ] All paths (config, data, DB, worktrees, logs) come from `platformdirs`, not a fixed `~/.config`.
- [ ] CLI: `run <task> --agent --mode`, `run watch <run>` (pretty live stream with Rich), `run say <run> "text"`, `run stop`, `run resume`.

**Done when:**
- `saarthi run T-0002 --agent claude --mode build` creates a worktree, runs Claude, and streams clean events in the terminal.
- Two tasks run at the same time (one Claude, one Codex) without touching each other's files.
- Killing the daemon mid-run and restarting it shows the run as `interrupted`; `saarthi run resume` continues it.
- `saarthi docs show T-0002 1` prints the plan of the last plan run.
- Unit and integration tests pass on the CI matrix (Linux, macOS, Windows).
- At least **3 real Saarthi tasks** were done using this CLI.

---

## M3 - Desktop UI v1

**Goal:** Daily use from a window, not the terminal.

**Build:**
- [ ] Tauri 2 shell: starts / connects to the daemon, reads the token, native notifications.
- [ ] TypeScript API client generated from OpenAPI.
- [ ] WebSocket client with reconnect + replay. Subscribes to the events of all projects.
- [ ] Daemon: a simple `status` per task (F2.9) and the Files API (tree, file content, diff vs main, per task and per project; TDD 4.14).
- [ ] App frame: top bar (logo, project picker with project tools, search or jump `Ctrl K`, Needs-you pill, Settings). No sidebar, no dock.
- [ ] Home: project tabs + **All projects**, groups Needs you / Working / To do, Done this week (F1.5, F2.9).
- [ ] Board view (project menu): 4 columns, "Show detailed stages", drag and drop with stage rules, filters.
- [ ] New task: pick the project, the goal, agent picker, More options. Quick capture with `Ctrl Alt N` from any app.
- [ ] Task page:
  - [ ] Goal card: view and edit the brief (markdown).
  - [ ] Activity tab: agent cards (message, tool call, command output, file changed).
  - [ ] Message box: send follow-up, answer "Claude has a question", stop.
  - [ ] More -> Terminal: xterm.js (PTY adapter).
  - [ ] More -> Docs: plans, changed .md files, pinned docs, outline (F22.1).
  - [ ] More -> History (simple list of events).
  - [ ] More -> Details: branch, path, behind main, runs list.
- [ ] Files (IDE view): folder tree, file tabs, CodeMirror code view, find a file, "Show changes / Full file" with inline changes against `main`, tiny edits, "Open in my editor" (F17.1-F17.5).
- [ ] Project files: the same view on the main repo of any project (F17.8).
- [ ] Settings (General, Agents, Project) + Health page.
- [ ] Dark theme (default) + light theme.

**Done when:**
- I do a full day of real work starting tasks and watching agents only from the Saarthi window.
- I work on tasks in 2+ repos from one window, and the Needs-you count covers both.
- I read a task's changes against `main` in Files without opening an IDE.
- The UI shows an agent event in under 300 ms.
- Closing the window does not stop running agents.

---

## M4 - Checks (Check and ship, part 1)

**Goal:** No task reaches Review without proof.

**Build:**
- [ ] Check Runner: run checks from `project.toml`, timeout, kill process group, save output.
- [ ] Auto-run checks after build / fix runs.
- [ ] Proof Card model + "What done looks like" coverage. The agent fills it; the user answers only the "Not sure" ones ("That's fine" / "Ask Claude to add it"). No "Confirm all".
- [ ] Trust score + verdict (F7.7). `TRUST_GOOD_MIN = 70` in `config.py`.
- [ ] Stage rule: Verifying -> Review only if required checks pass, or override with reason ("Review anyway").
- [ ] "Let Claude fix it" button: new fix run with failing output. Max rounds setting; at the limit it stops and asks.
- [ ] Check and ship screen, checks part: verdict, tests and checks, "Show output", "How we decided" (shows the score). Status dot on Board cards.
- [ ] CLI: `saarthi checks <task>`, `saarthi proof <task>` (prints the verdict and the score).

**Done when:**
- A broken change auto-moves to `Failed` (verdict "Has problems"), I click "Let Claude fix it", and after the fix it moves to `Review` with all green.
- Override needs a typed reason, and the reason shows on Check and ship.
- Verdict rule tests cover all three verdicts.

---

## M5 - Review + ship (Check and ship, part 2)

**Goal:** Review fast and create the PR from Saarthi.

**Build:**
- [ ] Review Builder: diff parse, rule-based risk flags, agent grouping (JSON Schema) with a one-line "why" per file, fallback "group by folder".
- [ ] Check and ship, what changed part: groups, explanations, risk tags, diff viewer (CodeMirror merge view). Plain file list = Files -> "Show changes".
- [ ] Comments: open a group, comment on a line or the group, "Send to Claude".
- [ ] Ask Codex to review: optional card, cross agent, read-only, findings JSON, shown in the groups, "Fix these".
- [ ] Files: "Why Claude changed this", "Mark as looked at" (kept per task), "Next change" (F17.6, F17.7).
- [ ] Approve / Reject.
- [ ] Ship: **Approve and create pull request** with no dialog. Default commit and PR text from the agent; optional "Edit pull request text". Push (default-branch guard in code), `gh pr create` with goal + what changed + checks.
- [ ] Done screen: PR link. The worktree is removed after `WORKTREE_CLEANUP_DAYS` (7); a link removes it now.

**Done when:**
- I ship a real PR for a client project fully from Saarthi.
- Ask Codex to review finds at least one real issue in a test task and the fix loop works.
- Pushing to `main` is impossible even if I try from the API directly (test proves it).

---

## M6 - Research + Lessons and notes + Saved instructions

**Goal:** Keep the context and the learning.

**Build:**
- [ ] Research on the task page: notes, links (title fetch), snippets, "send to agent" toggle.
- [ ] "Just research" (New task -> More options) and "Research this": read-only agent run -> finding saved.
- [ ] "Make a goal from this" from research, and a drafted goal on New task (F3.2).
- [ ] Brief versions (Goal card -> Edit -> History).
- [ ] Lessons and notes screen: core_docs tree, markdown view, simple edit.
- [ ] Context Pack v1: brief + research + matched memory files (ripgrep) + playbook. Preview at More -> What Claude reads.
- [ ] Lessons learned card on Done: drafts for memory / learnings / timeline, approve each.
- [ ] Saved instructions: library screen, built-in 5 playbooks, variables, global + project scope. Picked in New task -> More options.
- [ ] Research findings in Docs; latest plan in the Context Pack (F22.5).
- [ ] Import my current `quick-prompts.md` files from client projects as saved instructions.

**Done when:**
- A new task gets a good goal from "Just research" + "Make a goal from this" in under 5 minutes.
- After shipping, `core_docs/memory/project_memory.md` and `timeline/timeline.md` are updated with my approval.

---

## M7 - Side by side + Gemini CLI

**Goal:** Use more than one agent together for hard tasks, and add Gemini CLI as the third agent.

**Build:**
- [ ] Gemini spike: run headless `gemini -p` with JSON output in a temp repo. Check the exact flags (output format, resume, approval mode). Record 3 streams to `tests/fixtures/agents/`.
- [ ] `GeminiAdapter` behind `AgentAdapter`: start, events (mapping), send, stop, resume (if the CLI supports it). Unknown lines become raw events.
- [ ] Event mapping tests with the Gemini fixtures. "Needs you" detection (or a written workaround).
- [ ] `gemini` in Health, Settings -> Agents, the agent picker, and `saarthi run --agent gemini`.
- [ ] Side by side: one goal -> two runs (any two installed agents, default Claude + Codex) in two worktrees. Started from New task -> More options.
- [ ] Compare screen: checks, verdict, diff size, cost, time, what changed side by side.
- [ ] Pick winner -> keep branch, delete the other worktree.
- [ ] Per-workspace port numbers (avoid dev server clashes).
- [ ] Home: Working rows show live mini status.

**Done when:**
- I run a real task side by side and pick the winner in under 2 minutes of review.
- A real task runs with Gemini CLI from the CLI and the UI. Tests use only recorded Gemini fixtures.

---

## M8 - Safety + cost + undo

**Goal:** Trust the agents more, spend less, undo anything.

**Build:**
- [ ] "What agents may do" (Read only / Safe / Full access) in Settings -> Safety and cost, and per task in Details.
- [ ] Blocked actions list + "always ask" list (TDD 4.9). An ask shows as a Needs-you card on the task page.
- [ ] Sandbox per OS (TDD 4.9): only the worktree is writable, secret folders hidden.
  - [ ] Linux: `bwrap` wrapper.
  - [ ] macOS: `sandbox-exec` profile.
  - [ ] Windows v1: no OS sandbox. "Full access" is not offered on Windows (UI and API).
- [ ] Secret masking in events and UI (with tests).
- [ ] Cost meter: per run, per task, per day, on the Safety and cost screen and in Details; budget alert.
- [ ] Undo points list in More -> History + Restore (save current first, confirm).

**Done when:**
- In Full access inside the sandbox, an agent cannot read `~/.ssh` on Linux (`bwrap`) and on macOS (`sandbox-exec`) (tests prove it).
- On Windows, the API refuses Full access (test proves it).
- I restore a task to an undo point and come back to the latest again with no loss.

---

## M9 - Polish + package (v1.0)

**Goal:** Install it like a normal app and use it every day.

**Build:**
- [ ] Daemon as a Tauri **sidecar**: one-file binary per OS (PyInstaller or Nuitka). The app starts the daemon.
- [ ] Installers from one GitHub Actions matrix: `.AppImage` + `.deb` (Linux), `.dmg` (macOS), `.msi` (Windows).
- [ ] "Keep running in the background" option, the OS way: systemd user service (Linux), launchd agent (macOS), Tauri autostart plugin / per-user Startup entry (Windows).
- [ ] Notifications through the Tauri notification plugin on every OS (`notify-send` only as a Linux fallback).
- [ ] Size budget check per OS in CI: installer < 40 MB; app open < 2 s and idle RAM (window < 150 MB, daemon < 150 MB) measured and written in `reports/`.
- [ ] First-run wizard: pick a project, "All set" or "One thing to fix".
- [ ] Keyboard shortcut sheet (`?`).
- [ ] Empty states, error states (background service down, agent missing, reconnecting, version mismatch), loading states.
- [ ] Playwright tests for the 3 main flows.
- [ ] User guide `docs/USER_GUIDE.md` (install steps per OS).

**Done when:**
- Fresh install on clean Ubuntu 24.04, macOS 14 and Windows 11 works in under 10 minutes on each.
- The size budget is met on all three OSes, or an ADR records the miss and the fallback (see TECH_STACK.md, Size budget).
- I use Saarthi for 2 full weeks without opening an IDE for agent work.
- Tag `v1.0.0`.

---

## M10 - Jira tickets

**Goal:** Start a client task from a Jira ticket, and keep the Jira status in step.

> Build order: M10 needs M1-M6. Build it after M6 (it may come before M7). M7-M9 keep their numbers.

**Build:**
- [ ] `TicketProvider` protocol + `FakeTicketProvider` + recorded JSON in `tests/fixtures/jira/` (F23).
- [ ] `JiraCloudProvider` with `httpx`: myself, search (POST, `nextPageToken`), issue, transitions, comment, remote link. Retry on 429.
- [ ] ADF -> markdown and markdown -> ADF (`adf.py`) with golden tests. Unknown nodes are kept.
- [ ] Jira site setup: token file `chmod 600`, `saarthi jira login`, `saarthi jira status` (F23.1).
- [ ] Migration: `tickets` cache, `ticket_views`, `ticket_actions`, `tasks.ticket_key`.
- [ ] Ticket cache + views (Mine, Sprint, saved JQL) + stale refresh + offline view (F23.2, F23.6).
- [ ] Start a task from a ticket: brief draft, comments as research, branch and PR name (F3.3, F23.3).
- [ ] Link an existing task: `saarthi task edit T-0012 --ticket ACME-142`.
- [ ] Write back: stage mapping, pending actions, send / skip, `auto_send` (F23.5).
- [ ] API: `/jira/sites`, tickets, start, link, ticket-actions.
- [ ] CLI: `tickets list|show|start`, `ticket actions|send|skip`.
- [ ] UI: Jira tickets screen (project menu), start dialog, ticket chip on the task page and Board cards, write-back as a Needs-you row and a card on Done, offline view, Settings -> Jira (F23.4).
- [ ] Events: `ticket.*`.

**Done when:**
- I start a real client task from a Jira ticket, and its Jira status moves to In Review after my OK.
- A 401 shows the fix command.
- No test calls the real Jira.

---

## Later (after v1)

- **Phone glance:** read-only web page on the phone (LAN + token) to see status and answer "Needs you".
- **Voice capture:** speak a task, it goes to To do.
- **More agents:** Aider, local models (Gemini CLI is M7).
- **GitHub Issues** and other ticket providers (Jira is M10).
- **PR status:** CI and review comments from GitHub on the task page.
- **Evidence:** headless browser screenshots + API recordings on Check and ship.
- **Smart memory:** search memory by meaning (embeddings).
- **Team mode:** share saved instructions and memory with 2-5 devs.
- **Windows sandbox** (FSD Q4), so "Full access" can be offered on Windows.
- **Go or Rust rewrite of the daemon** - only if the size budget is missed in M9 or the signs in TECH_STACK.md 2.3 show up.

---

## How to track progress

- Tick boxes in this file as work is done.
- After each milestone:
  - Add an entry to `timeline/timeline.md` (date + what shipped).
  - Add big problems + fixes to `memory/project_memory.md`.
  - Add new rules to `learnings/`.
  - Write a short review in `code_reviews/` (what is good, what is debt).

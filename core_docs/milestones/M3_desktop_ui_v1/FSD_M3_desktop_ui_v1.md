# FSD — M3: Desktop UI v1

**Document type:** Functional Specification Document (FSD)
**Milestone:** M3 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-11
**Estimated effort:** 32.5 hours (3 weeks at ~10 h/week)
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M3_desktop_ui_v1.md`, `../../FUNCTIONAL_SPECIFICATIONS.md` (sections 4, 5), `../../TDD-tech-design-doc.md` (sections 9, 11), `../M2_agent_runs_worktrees/FSD_M2_agent_runs_worktrees.md` (before), `../M4_checks_proof_card/FSD_M4_checks_proof_card.md` (next)

---

## 1. What this document covers

M3 gives Saarthi its desktop window. It puts the M1 and M2 features on screen. It adds almost no new product logic: the daemon already does the work.

Features owned (from `../README.md`): F1.3, F2.2, F2.4, F2.7, F3.1 (UI), F5.4, F5.5, F5.6 (UI), F6.3 (UI), F6.4, F14.1 (Timeline tab), F16.2 (simple totals), F17.1-F17.4, F18.1, F19.1 (native), F21.1, F21.2 (page), F22.1 (Docs tab; F22.3 and F22.4 on screen).

---

## 2. The goal in plain words

After M2, I drive agents from the terminal. It works, but I juggle `run watch` windows and type run IDs.

After M3, I open one window and:
- see all my projects, what is running, and what needs me — on one home screen;
- drag tasks on a board;
- open a task and see its brief, its live agent work as clean cards, a real terminal, its docs (plans, specs), and its history;
- answer the agent in a message box;
- peek at code and jump to my own editor;
- close the window and the agents keep going.

**What I can use at the end:** a full day of real work — starting tasks and watching agents — only from the Saarthi window.

---

## 3. Where this milestone sits

| Before (needed) | This milestone | After (unlocked) |
|---|---|---|
| M1: projects, tasks, briefs, events, WebSocket with replay, `/health`. M2: runs, worktrees, Needs You, PTY runs, `notify-send`. | Tauri app, all main screens. | M4 adds a Proof tab and the check dot on cards. M5 adds the Review tab. M6 adds Research and Memory screens. |

---

## 4. Easy glossary (new words only)

| Word | Simple meaning |
|---|---|
| **Command Deck** | The home screen. Projects, running agents, "Needs You" list, today's cost. |
| **Task Room** | The screen for one task: brief, runs, workspace, and tabs (Stream, Terminal, Code, Docs, Timeline). |
| **Command Bar** | A search box that opens with `Ctrl+K` on any screen. Find a task or run an action. |
| **Quick capture** | A small pop-up box from a global shortcut. Type one line; it becomes an Inbox task. |
| **Doc** | One markdown text for a task: a saved plan, a changed `*.md` file, or a pinned project doc (M2 builds the list; M3 shows it). |
| **Card** | One readable block in the Stream tab (a message, a tool call, a file change). |
| **Code Peek** | A read-mostly code viewer. Not an editor. |
| **Replay** | When the window reconnects, the daemon sends the events it missed, so nothing is skipped. |

---

## 5. Features

### App shell (MILESTONES "Tauri 2 shell")

- **What:** The Saarthi window. On open, it connects to the daemon. If the daemon is not running, it starts it.
- **Why:** One click to start working. And the daemon (not the window) keeps the agents alive.
- **Example:** I click the Saarthi icon. A splash shows "Starting daemon…" for about a second, then the Command Deck.
- **Rules:**
  - The window never runs agents itself. Closing it never stops a run.
  - It reads the token from `~/.config/saarthi/token`. I never type it.
  - If the daemon stops while the window is open, a red bar says "Daemon offline — reconnecting…". When it is back, missed events are replayed.
- **Acceptance criteria:**
  - With the daemon stopped, opening the app starts it and shows the Deck in under 5 s.
  - Closing the window while a run is live: `saarthi run list` still shows it `running`.
  - Killing the daemon and starting it again: the bar appears, then goes away, and the Stream tab has no gap.

### F1.3 Project list (Command Deck)

- **What:** The Command Deck shows each project with: name, open tasks, running agents, today's cost.
- **Example:** `saarthi · 7 open · 2 running · $1.12`.
- **Acceptance criteria:** Numbers match `saarthi project list --json` and update live when a run starts or ends.

### Command Deck (home)

- **What:** Four blocks: Projects, Running now (task, agent, time running), **Needs You** (task + the question, newest first), Today's cost (total).
- **Rules:** A click on any row opens that Task Room. "Needs You" rows are the most visible thing on the screen.
- **Acceptance criteria:** When a FakeAdapter run asks a question, the row appears on the Deck without a refresh, with the question text.

### F2.4 Task Board

- **What:** One column per stage. Cards show title, ID, agent icon, time spent, cost. Drag and drop to move.
- **Example:** I drag `T-0007` from Inbox to Ready. It has no brief. The card jumps back and a message says "Ready needs a brief with at least a goal".
- **Rules:**
  - The window does not decide if a move is allowed. It asks the daemon. While dragging, it only highlights the columns the daemon listed for that task.
  - Dropping on **Running** does not move the card. It opens the "Start run" dialog.
  - `Needs You` cards glow and sit at the top of their column.
  - Check status dot: comes in M4.
- **Acceptance criteria:**
  - A refused move snaps back and shows the daemon's reason word for word.
  - A move done in the CLI (`saarthi task move`) shows on the open board within 1 second.
  - Board with 200 tasks loads in under 500 ms.

### F2.7 Filters and search (board)

- **What:** Filter bar: stage, label, agent, free text.
- **Rules:** The filter is sent to the daemon. The window does not filter by itself.
- **Acceptance criteria:** Filtering by `agent: codex` shows only tasks with a Codex run.

### F2.2 Quick capture

- **What:** A global shortcut (default `Ctrl+Alt+N`) opens a small box over any app. Type a title, press Enter. It goes to the Inbox of the selected project.
- **Rules:**
  - The box remembers the last project. A dropdown changes it.
  - On Wayland, a global shortcut may not work from the app. Then I bind a GNOME custom shortcut to `saarthi-desktop --quick-capture`. Settings shows the exact command.
- **Acceptance criteria:** From another app, shortcut -> type -> Enter -> the task is in Inbox. Time from shortcut to box under 500 ms when the app is running.

### F3.1 Brief editor (UI)

- **What:** In the Task Room left panel: Goal, Acceptance criteria (a list: add, remove, reorder), Notes, Focus paths. Markdown in Goal and Notes.
- **Rules:** Save makes a new brief version (M1 behaviour). Unsaved changes show a dot and ask before leaving.
- **Acceptance criteria:** Save -> `saarthi task show T-1 --json` shows the new brief version.

### Runs list and Start run (F5.9 on screen)

- **What:** Left panel lists runs: agent, mode, status, start, duration, cost. A **Run** button opens a dialog: agent, mode, extra message, "Interactive terminal" switch.
- **Acceptance criteria:** Starting from the dialog equals `saarthi run …` (same request). An error from the daemon (wrong stage, run active, agent missing) is shown as is.

### F6.3 Workspace info (UI) and F6.4 Open in tools

- **What:** Left panel shows branch, path, ahead/behind, changed files, last checkpoint. Three buttons: **Open folder**, **Open terminal here**, **Open in my editor**.
- **Rules:** Commands come from Settings (editor command, terminal command). The daemon runs them. Same from the CLI: `saarthi open T-0002 --editor`.
- **Acceptance criteria:** Each button opens the right app at the worktree path.

### F5.4 Stream tab

- **What:** The live agent work as cards: message, thinking (collapsed), tool call, command output (collapsed), file changed (with small diff), Needs You (highlighted), raw (grey), run start/end.
- **Rules:**
  - Auto-scroll to the newest card. A **Pause scroll** button stops it. Scrolling up also pauses; a "New events ↓" chip jumps back.
  - Long streams stay smooth (only visible cards are drawn).
  - Run selector at the top: latest run by default.
- **Acceptance criteria:**
  - An agent event shows on screen in under 300 ms (measured, see TDD).
  - 5,000 events scroll smoothly.
  - Each M2 event type has a card; unknown types show as raw.

### F5.5 Terminal tab

- **What:** A real terminal (xterm.js) for runs started with "Interactive terminal" (M2 `--pty`). I can type into it.
- **Rules:**
  - Typing and resizing go to the agent's terminal live.
  - On open, the last part of the output is loaded, then live bytes follow.
  - For a normal (non-interactive) run, the tab says so and offers **Start interactive session**.
- **Acceptance criteria:** Start an interactive Claude, type `/help`, see the result. Resize the window: the agent's screen redraws to the new size.

### F5.6 Needs You (UI) and message box

- **What:** Bottom of the Task Room: a message box with **Send** and **Stop**. When the agent needs me, the question shows above the box with option buttons (if any).
- **Rules:**
  - Send = M2 `run say`. For Codex mid-step, the box says "Queued — Codex gets it when this step ends".
  - Stop asks to confirm.
  - On an "ended with a question" run, a **Close as done** button is shown (M2 `stop` behaviour).
- **Acceptance criteria:** Answering in the box moves the task back to Running (board and header update live).

### F22.1 Docs tab

- **What:** A **Docs** tab in the Task Room. It shows the task's docs from M2 (`saarthi docs list`): saved plans, `*.md` files changed on the task branch, and pinned project docs. I pick one and read it as formatted markdown.
- **Why:** Plans and specs are text I need to read before I say "go". Reading them in an editor or in the run summary is slow.
- **Example:** I run a plan on T-0012. The Docs tab count goes from 4 to 5. I click the tab. Left: groups "Plans", "Changed in this task", "Pinned". I click "Plan - Add password reset API". The center shows the plan as formatted markdown. On the right, an outline lists its headings; I click "Risks" and the view jumps there. I click **Open in editor** and the file opens in my editor.
- **Rules:**
  - Tab order: Stream, Terminal, Code, Docs, Timeline. The tab shows the number of docs. (Proof and Review join in M4 and M5; Docs stays before Timeline.)
  - Left (260 px): groups "Plans", "Changed in this task", "Pinned". Each row has the title, the small path, the size, and a badge `added` or `modified` for changed files. An empty group shows one quiet line, for example "No plan yet. Start a plan run."
  - Center: markdown view (tables, task lists, code blocks in the mono font). Mermaid shows as a code block. The header shows path, size, updated time, badge, **Open in editor** and **Copy path**.
  - Right (220 px): outline of headings. A click jumps to the heading.
  - A doc over 1 MB shows "Too big to show here" and **Open in editor**.
  - Docs are read-only. Editing in Saarthi is Later.
  - The list refreshes live when a plan is saved (`doc.saved`) and when an agent changes a `*.md` file (`agent.file_changed`).
  - The window only renders. The daemon finds the docs and decides what is listed.
  - The "Research" group comes in M6.
- **Acceptance criteria:**
  - After a FakeAdapter plan run ends, the new plan shows in the "Plans" group without a refresh, and the tab count goes up by one.
  - A `*.md` file the agent adds in the worktree shows in "Changed in this task" with the `added` badge.
  - Clicking an outline entry scrolls to that heading.
  - **Open in editor** uses the editor command from Settings.
  - A pinned file that was also changed shows once.

### F14.1 Timeline tab

- **What:** All events of the task, newest at the top, as one list: time, type, short text. Filter chips: Task, Runs, Agent, Workspace.
- **Acceptance criteria:** Brief saves, stage moves, run starts/ends, and checkpoints all appear.

### F16.2 Totals (simple)

- **What:** Each card and the Task Room header show the task's total time and cost. The Deck shows today's cost per project and in total.
- **Rules:** These are sums the daemon already keeps. The cost meter view and budget alert are M8.
- **Acceptance criteria:** After a run ends, the card's cost changes without a refresh.

### F17.1-F17.4 Code Peek

- **What:** A **Code** tab in the Task Room (the task's worktree) and a project-level Code view (the main repo). File tree + code viewer with syntax colours (F17.1). Quick search by file name and by text (F17.2). **Edit** for tiny changes (F17.3). **Open in my editor** at the current line (F17.4).
- **Rules:**
  - Tiny edits are allowed **only in a task worktree**, never in the main repo folder.
  - Editing is blocked while the task has an active run (the agent may be writing the same file).
  - If the file changed on disk since I opened it, save is refused and I reload.
  - A tiny edit shows in the Stream and Timeline as a file change "by you".
  - Binary files and files over 1 MB show "too big / binary — open in editor".
- **Acceptance criteria:**
  - Search `run_say` finds matches in under 1 s in the Saarthi repo.
  - Edit a word, save, `git diff` in the worktree shows it.
  - Edit while a run is active: Edit button disabled with the reason.

### F18.1 Command Bar

- **What:** `Ctrl+K` on any screen. Search tasks (ID or title) and projects. Actions: New task, Start run, Open in editor, Go to Board / Deck / Settings, Toggle theme.
- **Rules:** Playbooks and "Run checks" join the bar in M6 and M4.
- **Acceptance criteria:** `Ctrl+K`, type `T-0002`, Enter -> Task Room of T-0002.

### F19.1 Native notifications

- **What:** When the window is open, notifications are native (Tauri): Needs You, run finished, run failed. Clicking one opens the task.
- **Rules:** While the window is open, the daemon does not also send `notify-send` (no double alerts). When the window is closed, M2's `notify-send` takes over.
- **Acceptance criteria:** One notification per event, window open or closed.

### F21.1 Settings and F21.2 Health page

- **What:** Settings: theme (light / dark / system), editor command, terminal command, max parallel runs, worktree root folder, `claude` and `codex` paths. Health: daemon running, git version, agent CLIs found and logged in, `gh` logged in, UI event delay (last 200 events).
- **Rules:** Settings are saved in the daemon. "Max auto-fix rounds" comes with M4.
- **Acceptance criteria:** Change max parallel runs to 1 -> the next second run is queued. Rename `codex` on PATH -> Health shows it red with the fix text.

### Theme

- **What:** Light and dark theme. Follows the system by default.
- **Acceptance criteria:** Switching in Settings changes the whole app at once, including the terminal and code viewer.

---

## 6. Main user flows

### 6.1 A day from the window
1. Open Saarthi -> Command Deck.
2. `Ctrl+Alt+N` from the browser: "Fix flaky login test" -> Inbox.
3. Board -> open the card -> write the brief -> Save -> drag to Ready.
4. Click **Run** -> Claude, Build -> Start. Stream tab fills with cards.
5. Close the window. Do something else.
6. Native or `notify-send` alert: "Needs You · T-0009". Click -> Task Room. Click option "Yes". Back to Running.
7. Alert "Run finished". Code tab: read the changes. Fix a typo with Edit.
8. Drag to Review (until M4 adds checks).

### 6.2 Two tasks at once
1. Start T-0009 (Claude) and T-0010 (Codex).
2. Deck "Running now" shows both, with live minutes.
3. Whichever needs me first goes to the top of "Needs You".

---

## 7. Done when

1. I do **one full working day** of real tasks, starting and watching agents only from the Saarthi window (no `run watch`). Noted in `timeline/timeline.md`.
2. The UI shows an agent event in **under 300 ms** (p95 on the Health page, over a run of at least 200 events).
3. **Closing the window does not stop running agents** (checked with `saarthi run list`).
4. Every feature in section 5 passes its acceptance criteria.
5. `npm test`, `npm run lint`, `npm run typecheck` pass; daemon `uv run pytest`, `ruff`, `pyright` pass.

---

## 8. Out of scope

| Not in M3 | Owner |
|---|---|
| Proof tab, check status dot, "Run checks" action | M4 |
| Review tab, Change Story, diff viewer, Ship, worktree cleanup | M5 |
| Research Desk, Memory screen, Playbooks, Context Pack preview with research | M6 |
| Research docs in the Docs tab, plan in the Context Pack | M6 |
| Race compare, "running now" strip on the board | M7 |
| Editing docs, Mermaid diagrams | Later (F22.6) |
| Permission profile picker, checkpoints list + Rewind, cost meter, budget alert | M8 |
| `?` shortcut sheet, first-run wizard, AppImage/.deb, Playwright tests | M9 |
| Max auto-fix rounds setting | M4 |

---

## 9. QA checklist

- [ ] Stop the daemon. Open the app. It starts the daemon and shows the Deck.
- [ ] Start a run. Close the window. `saarthi run list` shows `running`. Reopen: Stream tab shows all events, no gap.
- [ ] `saarthi daemon stop` with the window open: red bar. `saarthi daemon start`: bar goes, events continue.
- [ ] Drag Inbox -> Ready with no brief: snaps back with the reason. Add a goal, try again: works.
- [ ] Drag to Running: Start run dialog opens.
- [ ] In a terminal, `saarthi task move T-1 parked`: the board updates within 1 s.
- [ ] Filters: stage, label, agent, text each narrow the board.
- [ ] Quick capture from another app (X11 and Wayland session). On Wayland, use the GNOME shortcut command from Settings.
- [ ] Stream: each card type appears for a FakeAdapter replay of every M2 fixture. Pause scroll works.
- [ ] Health page p95 delay is under 300 ms after a 200-event run.
- [ ] Terminal: start an interactive run, type, resize.
- [ ] Needs You: options show as buttons; answering continues the run. Codex mid-step message shows "Queued".
- [ ] Docs tab: run a plan; the plan appears under "Plans" and the tab count goes up. Click it: formatted markdown. Click an outline entry: the view jumps. Add a `*.md` file in the worktree: it shows under "Changed" with `added`. **Open in editor** works.
- [ ] Timeline lists brief save, stage moves, run start/end, checkpoint.
- [ ] Code tab: tree, search by name, search by text, open in editor at a line.
- [ ] Tiny edit in a worktree: saved; `git diff` shows it; Stream shows "by you". In the main repo view: no Edit button. During an active run: Edit disabled.
- [ ] Settings: change theme, editor command, max parallel runs. Restart app: values kept.
- [ ] Health: rename `codex` binary: red row with fix text.
- [ ] Notifications: window open -> native only; window closed -> `notify-send` only.

---

## 10. Open questions

1. **WebKitGTK performance** (core TDD 16 Q4): if xterm.js or CodeMirror lag in Tauri on Ubuntu 24.04, plan B is the same UI in a normal browser at `http://127.0.0.1:7878`. Confirm with M0 spike 4.
2. **Global shortcut on Wayland:** Tauri's global shortcut may not work on GNOME Wayland. Fallback: GNOME custom shortcut running `saarthi-desktop --quick-capture`. Confirm on my machine early in M3.
3. **Tiny edits (F17.3)** are in M3, with strict limits (worktree only, no active run, stale-file check). If they cause trouble, drop the Edit button; the rest of Code Peek stands alone.
4. **Notification click on Linux:** click actions may not work on every desktop. Fallback: the notification text names the task ID.
5. **Which moves are "user moves"?** The board only offers moves the daemon lists for a user. M1's `ALLOWED_MOVES` must mark system-only moves (like Running -> Verifying). Confirm with M1 TDD.
6. **Secrets on screen** (milestones README, known gap 2): until M8, the Stream and Terminal may show secrets.

---

## 11. Effort

About **32.5 hours** (3 weeks at ~10 h/week). Breakdown in the TDD, section 16.

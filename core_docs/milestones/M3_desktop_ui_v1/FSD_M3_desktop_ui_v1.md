# FSD — M3: Desktop UI v1

**Document type:** Functional Specification Document (FSD)
**Milestone:** M3 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`): new screen names and labels, 4 statuses, many projects in one window, Files (IDE view) with changes against main
**Estimated effort:** 37.5 hours (about 4 weeks at ~10 h/week)
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M3_desktop_ui_v1.md`, `../../FUNCTIONAL_SPECIFICATIONS.md` (sections 4, 5), `../../TDD-tech-design-doc.md` (sections 9, 11), `../M2_agent_runs_worktrees/FSD_M2_agent_runs_worktrees.md` (before), `../M4_checks_proof_card/FSD_M4_checks_proof_card.md` (next)
**Screens:** prototype views `home`, `homeEmpty`, `board`, `newTask`, `todoTask`, `work`, `question`, `terminal`, `docs`, `history`, `details`, `files`, `projectFiles`, `commandBar`, `quickCapture`, `settings`, `settingsAgents`, `settingsHealth` in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. What this document covers

M3 gives Saarthi its desktop window. It puts the M1 and M2 features on screen. It adds almost no new product logic: the daemon already does the work. The two small new daemon pieces are the 4 statuses (F2.9) and the "changes against main" view (F17.5).

Features owned (from `../README.md`): F1.3, F1.5, F2.2, F2.4, F2.7, F2.9, F3.1 (UI), F5.4, F5.5, F5.6 (UI), F6.3 (UI), F6.4, F14.1 (History view), F16.2 (simple totals), F17.1-F17.5, F17.8, F18.1, F19.1 (native), F21.1, F21.2 (page), F22.1 (Docs view; F22.3 and F22.4 on screen).

The screens follow the Simple UI design: one main action per screen, plain words, and advanced parts behind **More**, **Details**, the project menu or **Settings**.

---

## 2. The goal in plain words

After M2, I drive agents from the terminal. It works, but I juggle `run watch` windows and type run IDs.

After M3, I open one window and:
- see every repo I added, and what needs me across all of them, on one **Home** screen;
- start a task, watch Claude work as clean cards on its **Task page**, and answer its questions;
- open a real terminal, the task's docs (plans, specs), and its history under **More**;
- look at the code and what Claude changed against `main` in **Files**, and jump to my own editor;
- close the window and the agents keep going.

**What I can use at the end:** a full day of real work — starting tasks and watching agents in more than one repo — only from the Saarthi window.

---

## 3. Where this milestone sits

| Before (needed) | This milestone | After (unlocked) |
|---|---|---|
| M1: projects, tasks, briefs, events, WebSocket with replay, `/health`. M2: runs, worktrees, Needs You, PTY runs, OS notifications from the daemon. | Tauri app, all main screens, 4 statuses, Files with changes against main. | M4 adds **Check and ship** (tests and checks part, verdict). M5 adds the rest of Check and ship, plus "Why Claude changed this" and "Mark as looked at" in Files. M6 adds Just research, Lessons and notes, Saved instructions. |

---

## 4. Easy glossary (new words only)

| Word | Simple meaning |
|---|---|
| **Home** | The first screen. Project tabs plus **All projects**. Groups: Needs you, Working, To do, and Done this week. |
| **Status** | One of 4 words a user sees on a task: **To do**, **Working**, **Needs you**, **Done**. The daemon still uses its 8 stages inside. |
| **Task page** | The screen for one task: its goal, its **Activity**, a message box, and a **More ▾** menu (Terminal, Docs, History, Details). |
| **Activity** | The live agent work on the Task page, shown as cards. |
| **Files** | An IDE-like file view: folder tree, file tabs, code view, changes against `main`. Per task (its own copy of the repo) and per project (the main repo). Not a full editor. |
| **Its own copy of the repo** | The task's worktree: a separate folder and branch, so tasks never clash. Branch details are under More → Details. |
| **Command bar** | A search box that opens with `Ctrl+K` on any screen. Find a task or run an action. |
| **New task shortcut** | A small pop-up box from a global shortcut (`Ctrl+Alt+N`). Type one line; it becomes a To do task. |
| **Needs-you pill** | The pill in the top bar. It shows how many tasks need me across all projects, and pulses when the number is above 0. |
| **Doc** | One markdown text for a task: a saved plan, a changed `*.md` file, or a pinned project doc (M2 builds the list; M3 shows it). |
| **Card** | One readable block in Activity (a message, a tool call, a file change). |
| **Replay** | When the window reconnects, the daemon sends the events it missed, so nothing is skipped. |

---

## 5. Features

### App shell (MILESTONES "Tauri 2 shell")

- **What:** The Saarthi window. On open, it connects to the background service (the daemon). If it is not running, the window starts it.
- **Why:** One click to start working. And the daemon (not the window) keeps the agents alive.
- **Example:** I click the Saarthi icon. A splash shows "Starting…" for about a second, then Home.
- **Layout:**
  - **Top bar:** logo, project picker, search or jump (`Ctrl K`), the Needs-you pill, Settings. The project picker menu has the project tools (Board view, Project files; more tools join in later milestones) and the list of all projects.
  - No sidebar and no dock. Content is centred with a maximum width. It works from 1280×720 up.
- **Rules:**
  - The window never runs agents itself. Closing it never stops a run.
  - It reads the daemon token from the Saarthi config folder. I never type it.
  - If the daemon stops while the window is open, a bar says "Reconnecting…". When it is back, missed events are replayed. The words "daemon" and "background service" show only when something is broken.
  - The UI looks the same on Linux, macOS and Windows.
- **Acceptance criteria:**
  - With the daemon stopped, opening the app starts it and shows Home in under 5 s.
  - Closing the window while a run is live: `saarthi run list` still shows it `running`.
  - Killing the daemon and starting it again: the bar appears, then goes away, and Activity has no gap.

### F1.3 Project list

- **What:** Each project shows: name, open tasks, running agents, Needs-you count, today's cost. Home shows the name and the Needs-you count on its project tab. The project picker menu shows all numbers.
- **Example:** in the picker: `saarthi · 7 open · 2 working · 1 needs you · $1.12 today`.
- **Acceptance criteria:** Numbers match `saarthi project list --json` and update live when a run starts or ends.

### F1.5 Many projects in one window

- **What:** I add every git repo once (M1 `saarthi project add`). Home has one tab per project plus **All projects**, which merges the tasks of every repo. The top bar has a project picker. The Needs-you pill counts all repos. **New task** asks which repo the task is for (default: the project tab I am on).
- **Why:** I work in more than one repo a day. I should not open a second window or "open a folder" to switch.
- **Example:** I have `saarthi`, `billing-api` and `docs-site`. On **All projects**, Needs you shows "T-0009 · billing-api · Claude has a question" above "T-0012 · saarthi · Tests failed". The pill says `2`. I click the `billing-api` tab: only its tasks show, and the pill still says `2`.
- **Rules:**
  - Each task still has its own branch and its own copy (worktree) of its own repo. Nothing is shared between repos.
  - In **All projects**, every row shows its project name.
  - The window opens on the tab I used last (a per-machine convenience).
  - The daemon merges and counts the tasks. The window does not add numbers up itself.
  - One live connection covers all projects. A project added from the CLI shows as a new tab without a restart (when I switch back to the window).
- **Acceptance criteria:**
  - With 3 projects, **All projects** lists the tasks of all 3, the same set as `saarthi task list --all-projects --json`.
  - A FakeAdapter run in project B asks a question while I look at project A's tab: the pill goes up by one within 1 second, and the row appears under **All projects**.
  - `saarthi project add <path>` while the window is open: when I switch back to the window, a new tab is there.
  - New task with project B picked: the task is created in project B and its worktree is made from B's repo.

### Home

- **What:** Home shows groups, in this order: **Needs you** (task, project, and what it needs, for example "Claude has a question", newest first), **Working** (task, agent, time running), **To do**, and **Done this week**. A **New task** button sits on top. With no projects, Home shows the empty state (`homeEmpty`) with **Add a project**.
- **Rules:**
  - A click on a row opens its Task page.
  - Row actions come from the status (F2.9): Needs you rows show **Answer** (a question) or **Open** (other reasons, until M4 and M5 add Fix and Review). To do rows show **Start** only when the daemon says the task can start.
  - Needs you rows are the most visible thing on the screen.
- **Acceptance criteria:** When a FakeAdapter run asks a question, the row appears under Needs you without a refresh, with the question text.

### F2.9 Simple statuses

- **What:** Every task shows one of 4 statuses. The daemon maps its 8 stages to them:

  | Status | Engine stages | Row action |
  |---|---|---|
  | **Needs you** | `Needs You`, `Failed`, `Review` (later also a conflict or a Jira write-back waiting for me) | Answer / Fix / Review |
  | **Working** | `Running`, `Verifying` | none (open the task) |
  | **To do** | `Inbox`, `Research`, `Ready` | Start (when a goal exists) |
  | **Done** | `Shipped` | PR link (from M5) |

  `Parked` and `Archived` are hidden behind a **Show parked and archived** filter.
- **Why:** A new user should not learn 8 stage names. 4 words tell me what to do next.
- **Example:** T-0007 is in stage `Research`. Home shows it under **To do**. On the Board view I switch on **Show detailed stages** and the card also says "Research".
- **Rules:**
  - The stages and their rules (`ALLOWED_MOVES`) do not change. Only the screen groups them.
  - The daemon sends the status with every task. The window never maps stages itself.
  - The CLI shows both: `saarthi task list` gets a `STATUS` column next to `STAGE`, and `--status needs-you` filters by it.
- **Acceptance criteria:**
  - For each of the 11 `Stage` values (M1), `saarthi task show --json` returns the status in the table above (`hidden` for Parked and Archived).
  - A task moving from stage `Running` to `Needs You` moves from **Working** to **Needs you** on Home without a refresh.
  - Parked tasks are not on Home or the Board until I switch on the filter.

### F2.4 Board view

- **What:** Project menu → **Board view**. 4 columns, one per status. Cards show title, ID, agent icon, time spent, cost. **Show detailed stages** adds the engine stage name to each card. Drag and drop to move.
- **Example:** I drag `T-0007` from To do (stage Inbox) to Working. The task page opens on Start, because Working is reached by starting a run. I drag `T-0008` inside To do from Inbox to Ready: it has no goal, so the card jumps back and a message says "Ready needs a brief with at least a goal".
- **Rules:**
  - The window does not decide if a move is allowed. It asks the daemon. While dragging, it only highlights the columns that hold a stage the daemon listed for that task.
  - If a column holds more than one allowed stage (for example Research and Ready inside To do), a small menu asks which one. With **Show detailed stages** on, the card can also be moved with that menu only.
  - Dropping on **Working** does not move the card. It opens Start on the Task page.
  - Needs you cards glow and sit at the top of their column.
  - Check status dot: comes in M4.
- **Acceptance criteria:**
  - A refused move snaps back and shows the daemon's reason word for word.
  - A move done in the CLI (`saarthi task move`) shows on the open board within 1 second.
  - Board with 200 tasks loads in under 500 ms.

### F2.7 Filters and search (board and Home)

- **What:** Filter bar: status, label, agent, free text. With **Show detailed stages** on, also stage.
- **Rules:** The filter is sent to the daemon. The window does not filter by itself.
- **Acceptance criteria:** Filtering by `agent: codex` shows only tasks with a Codex run.

### F2.2 New task shortcut (quick capture)

- **What:** A global shortcut (default `Ctrl+Alt+N`) opens a small box over any app (`quickCapture`). Type a title, press Enter. It becomes a **To do** task in the picked project.
- **Rules:**
  - The box remembers the last project. A dropdown changes it.
  - On Linux Wayland, a global shortcut may not work from the app. Then I bind a desktop custom shortcut (for example in GNOME) to `saarthi-desktop --quick-capture`. Settings shows the exact command.
- **Acceptance criteria:** From another app, shortcut -> type -> Enter -> the task is in To do. Time from shortcut to box under 500 ms when the app is running.

### New task and F3.1 Goal editor (UI)

- **What:** **New task** (`newTask`): project, title, **Goal**, **What done looks like** (a list: add, remove, reorder), agent picker (default from the project), and **Start**. **More options** holds: how to work (mode: build or plan), a note to the agent, and "Interactive terminal". On the Task page, the **Goal card** shows the same fields with **Edit**. Inside the daemon these fields are the task's brief (goal, acceptance criteria, notes, focus paths). Markdown in Goal and Notes.
- **Rules:**
  - Save makes a new brief version (M1 behaviour). Unsaved changes show a dot and ask before leaving.
  - Defaults need no choice: I can type a goal and press Start.
  - Saved instructions (M6), Side by side (M7) and safety choices (M8) join More options later. A drafted goal is M6.
- **Acceptance criteria:** Save -> `saarthi task show T-1 --json` shows the new brief version.

### Start (F5.9 on screen)

- **What:** A To do task's page (`todoTask`) shows its goal and one main button: **Start**, with the agent picker and More options next to it. The list of runs (agent, mode, status, start, duration, cost) is under More → Details.
- **Acceptance criteria:** Starting from the Task page equals `saarthi run …` (same request). An error from the daemon (wrong stage, run active, agent missing) is shown as is.

### F6.3 Details (UI) and F6.4 Open in tools

- **What:** More → **Details** (`details`) shows the task's own copy of the repo: branch, path, ahead/behind `main`, changed files, last checkpoint, runs, time and cost per run. Three buttons: **Open folder**, **Open terminal here**, **Open in my editor**.
- **Rules:** Commands come from Settings (editor command, terminal command). The daemon runs them. Same from the CLI: `saarthi open T-0002 --editor`.
- **Acceptance criteria:** Each button opens the right app at the worktree path.

### F5.4 Activity

- **What:** The main part of the Task page while it works (`work`). The live agent work as cards: message, thinking (collapsed), tool call, command output (collapsed), file changed (with small diff), "Claude has a question" (highlighted), raw (grey), run start/end.
- **Rules:**
  - Auto-scroll to the newest card. A **Pause scroll** button stops it. Scrolling up also pauses; a "New events ↓" chip jumps back.
  - Long streams stay smooth (only visible cards are drawn).
  - Run selector at the top: latest run by default.
  - "Claude" in labels means the agent that runs the task. A Codex run says "Codex has a question".
- **Acceptance criteria:**
  - An agent event shows on screen in under 300 ms (measured, see TDD).
  - 5,000 events scroll smoothly.
  - Each M2 event type has a card; unknown types show as raw.

### F5.5 Terminal (More → Terminal)

- **What:** A real terminal (xterm.js, `terminal`) for runs started with "Interactive terminal" (M2 `--pty`). I can type into it.
- **Rules:**
  - Typing and resizing go to the agent's terminal live.
  - On open, the last part of the output is loaded, then live bytes follow.
  - For a normal (non-interactive) run, the view says so and offers **Start interactive session**.
- **Acceptance criteria:** Start an interactive Claude, type `/help`, see the result. Resize the window: the agent's screen redraws to the new size.

### F5.6 Claude has a question (UI) and message box

- **What:** Bottom of the Task page: a message box with **Send** and **Stop**. When the agent needs me (`question`), a card "Claude has a question" shows above the box with option buttons (if any).
- **Rules:**
  - Send = M2 `run say`. For Codex mid-step, the box says "Queued — Codex gets it when this step ends".
  - Stop asks to confirm.
  - On an "ended with a question" run, a **Close as done** button is shown (M2 `stop` behaviour).
- **Acceptance criteria:** Answering in the box moves the task back to Working (Home, board and header update live).

### F22.1 Docs (More → Docs)

- **What:** A **Docs** view on the Task page (`docs`). It shows the task's docs from M2 (`saarthi docs list`): saved plans, `*.md` files changed on the task branch, and pinned project docs. I pick one and read it as formatted markdown.
- **Why:** Plans and specs are text I need to read before I say "go". Reading them in an editor or in the run summary is slow.
- **Example:** I run a plan on T-0012. The Docs count in the More menu goes from 4 to 5. I open More → Docs. Left: groups "Plans", "Changed in this task", "Pinned". I click "Plan - Add password reset API". The center shows the plan as formatted markdown. On the right, an outline lists its headings; I click "Risks" and the view jumps there. I click **Open in my editor** and the file opens in my editor.
- **Rules:**
  - More menu order: Terminal, Docs, History, Details. The Docs entry shows the number of docs.
  - Left (260 px): groups "Plans", "Changed in this task", "Pinned". Each row has the title, the small path, the size, and a badge `added` or `modified` for changed files. An empty group shows one quiet line, for example "No plan yet. Start a plan run."
  - Center: markdown view (tables, task lists, code blocks in the mono font). Mermaid shows as a code block. The header shows path, size, updated time, badge, **Open in my editor** and **Copy path**.
  - Right (220 px): outline of headings. A click jumps to the heading.
  - A doc over 1 MB shows "Too big to show here" and **Open in my editor**.
  - Docs are read-only. Editing in Saarthi is Later.
  - The list refreshes live when a plan is saved (`doc.saved`) and when an agent changes a `*.md` file (`agent.file_changed`).
  - The window only renders. The daemon finds the docs and decides what is listed.
  - The "Research" group comes in M6.
- **Acceptance criteria:**
  - After a FakeAdapter plan run ends, the new plan shows in the "Plans" group without a refresh, and the Docs count goes up by one.
  - A `*.md` file the agent adds in the worktree shows in "Changed in this task" with the `added` badge.
  - Clicking an outline entry scrolls to that heading.
  - **Open in my editor** uses the editor command from Settings.
  - A pinned file that was also changed shows once.

### F14.1 History (More → History)

- **What:** All events of the task, newest at the top, as one list (`history`): time, type, short text. Filter chips: Task, Runs, Agent, Workspace.
- **Rules:** In M3, History is the event list only. Undo points and **Restore** join it in M8.
- **Acceptance criteria:** Goal saves, stage moves, run starts/ends, and checkpoints all appear.

### F16.2 Totals (simple)

- **What:** Each board card and More → Details show the task's total time and cost. The project picker shows today's cost per project.
- **Rules:** These are sums the daemon already keeps. The Safety and cost view and the budget alert are M8.
- **Acceptance criteria:** After a run ends, the card's cost changes without a refresh.

### F17.1-F17.4 Files (IDE view)

- **What:** A **Files** screen (`files`) for a task (its own copy of the repo), opened from the Task page. Folder tree, file tabs, and a code view with syntax colours (F17.1). Find a file by name and search by text (F17.2). **Edit** for tiny changes (F17.3). **Open in my editor** at the current line (F17.4). The project version is F17.8.
- **Rules:**
  - It is for exploring and reviewing. It is not a full editor: no language server, no debugger, no extensions.
  - Tiny edits are allowed **only in a task's copy**, never in the main repo folder.
  - Editing is blocked while the task has an active run (the agent may be writing the same file).
  - If the file changed on disk since I opened it, save is refused and I reload.
  - A tiny edit shows in Activity and History as a file change "by you".
  - Binary files and files over 1 MB show "Too big or binary — open in my editor".
  - "Why Claude changed this", "Mark as looked at" and "Next change" are M5 (F17.6, F17.7).
- **Acceptance criteria:**
  - Search `run_say` finds matches in under 1 s in the Saarthi repo.
  - Edit a word, save, `git diff` in the worktree shows it.
  - Edit while a run is active: Edit button disabled with the reason.

### F17.5 Changes against main

- **What:** Files shows what changed against `main` (the project's default branch). On top of the tree, a **Changed (n)** list shows each changed file with `+added −removed` and a badge (`added`, `modified`, `deleted`, `renamed`). In the code view, a toggle switches **Show changes** (only the changed parts, with a few lines around them) and **Full file** (whole file, added lines marked green, removed lines shown in red between the lines).
- **Why:** Most of the time I open Files to see what Claude did. I should not need a terminal and `git diff` for that.
- **Example:** Claude changed `auth/reset.py`, added `auth/tokens.py` and has not committed yet. Files shows "Changed (2)": `auth/reset.py +12 −3 modified`, `auth/tokens.py +40 added`. I click `auth/reset.py`; it opens in **Show changes** mode with the 3 removed lines in red.
- **Rules:**
  - "Against main" means against the point where the task branch left `main` (the merge base), plus changes not committed yet, plus new files not yet added to git. So changes made on `main` later do not show as the task's changes.
  - The daemon computes the list and the diff with git. The window only draws them.
  - The list refreshes live when a file changes (`agent.file_changed`).
  - A file diff over the size limit shows "Too big to show changes here" and **Open in my editor**.
  - Same from the CLI: `saarthi files changes T-0002` and `saarthi files diff T-0002 auth/reset.py`.
- **Acceptance criteria:**
  - After a FakeAdapter run that changes 2 files and adds 1 new (untracked) file, **Changed (3)** lists all 3, and the `+/−` numbers match `git diff --numstat` against the merge base.
  - A commit made on `main` after the task started does not show in the list.
  - **Full file** of a changed file shows every added line marked and every removed line in red, in the right place.
  - When the agent changes another file during a run, the list grows by one without a refresh.

### F17.8 Project files

- **What:** Project menu → **Project files** (`projectFiles`). The same Files screen for the main repo of the project: tree, tabs, code view, find and search, **Open in my editor**, and changes against `main` (useful when the main repo is on another branch or has changes not committed).
- **Why:** Before I write a goal, I want to look around the code of that repo without starting a task.
- **Rules:**
  - Read-only. There is no **Edit** button in the main repo.
  - Each project has its own Project files. The project picker decides which repo.
- **Acceptance criteria:**
  - Project files of project B shows B's repo tree, not A's.
  - No Edit button; a direct edit request to the main repo is refused (`403`).
  - On a clean `main`, **Changed** shows "No changes against main".

### F18.1 Command bar

- **What:** `Ctrl+K` on any screen (`commandBar`). Search tasks (ID or title) and projects, across all projects. Actions: New task, Start, Open in my editor, Go to Home / Board view / Project files / Settings, Toggle theme.
- **Rules:** Saved instructions and "Run tests and checks" join the bar in M6 and M4.
- **Acceptance criteria:** `Ctrl+K`, type `T-0002`, Enter -> Task page of T-0002.

### F19.1 Native notifications

- **What:** When the window is open, notifications are native (Tauri notification plugin, on Linux, macOS and Windows): Claude has a question, run finished, run failed. Clicking one opens the task.
- **Rules:** While the window is open, the daemon does not also send its own OS notification (no double alerts). When the window is closed, M2's daemon notifier takes over on Linux. On macOS and Windows there is no alert while the window is closed (M2 sends none there; see M9 open questions).
- **Acceptance criteria:** One notification per event while the window is open, on each OS. With the window closed, one per event on Linux and none on macOS and Windows.

### F21.1 Settings and F21.2 Health

- **What:** **Settings** (`settings`): General (theme, editor command, terminal command, folder command), Projects (max parallel runs, worktree root folder), **Agents** (`settingsAgents`: `claude` and `codex` paths, found or not, logged in or not), **Health** (`settingsHealth`: background service running, git version, agent CLIs found and logged in, `gh` logged in, UI event delay over the last 200 events).
- **Rules:** Settings are saved in the daemon. "Max auto-fix rounds" comes with M4. A full error screen shows only when something is broken (more error screens in M9).
- **Acceptance criteria:** Change max parallel runs to 1 -> the next second run is queued. Rename `codex` on PATH -> Health and Agents show it red with the fix text.

### Theme

- **What:** **Dark is the default**, plus a light theme (Settings → General → Theme: Dark, Light, System). One set of colour tokens per theme.
- **Acceptance criteria:** Switching in Settings changes the whole app at once, including the terminal and code view.

---

## 6. Main user flows

### 6.1 A day from the window
1. Open Saarthi -> Home, on **All projects**.
2. `Ctrl+Alt+N` from the browser: "Fix flaky login test", project `saarthi` -> To do.
3. Open the task -> Goal card -> **Edit** -> write the goal and "What done looks like" -> Save.
4. Click **Start** (Claude, default mode). Activity fills with cards. Home shows it under Working.
5. Close the window. Do something else.
6. Native alert: "Claude has a question · T-0009". Click -> Task page. Click option "Yes". Back to Working.
7. Alert "Run finished". Open **Files**: read **Changed** against main. Fix a typo with Edit.
8. Drag to Review on the Board view (until M4 adds Check and ship).

### 6.2 Two tasks in two repos
1. Start T-0009 (Claude, project `billing-api`) and T-0010 (Codex, project `saarthi`).
2. Home → **All projects** → Working shows both, with project names and live minutes.
3. Whichever needs me first goes to the top of Needs you, and the pill shows `1`.

---

## 7. Done when

1. I do **one full working day** of real tasks in **at least 2 repos**, starting and watching agents only from the Saarthi window (no `run watch`). Noted in `timeline/timeline.md`.
2. The UI shows an agent event in **under 300 ms** (p95 on the Health page, over a run of at least 200 events).
3. **Closing the window does not stop running agents** (checked with `saarthi run list`).
4. Every feature in section 5 passes its acceptance criteria.
5. `npm test`, `npm run lint`, `npm run typecheck` pass; daemon `uv run pytest`, `ruff`, `pyright` pass.

---

## 8. Out of scope

| Not in M3 | Owner |
|---|---|
| Check and ship: tests and checks, verdict, "Let Claude fix it", check status dot, "Run tests and checks" action | M4 |
| Check and ship: what changed groups, comments, Ask Codex to review, Approve and create pull request, cleanup | M5 |
| Files: "Why Claude changed this", "Mark as looked at", "Next change" (F17.6, F17.7) | M5 |
| Just research, Lessons and notes, Saved instructions, What Claude reads with research, drafted goal | M6 |
| Research docs in the Docs view, plan in What Claude reads | M6 |
| Side by side, Gemini CLI | M7 |
| Editing docs, Mermaid diagrams | Later (F22.6) |
| What agents may do (Read only / Safe / Full access), undo points + Restore in History, Safety and cost, budget alert | M8 |
| `?` shortcut sheet, first-run setup, full error screens, installers for each OS, Playwright tests | M9 |
| Jira tickets page | M10 |
| Max auto-fix rounds setting | M4 |

---

## 9. QA checklist

- [ ] Stop the daemon. Open the app. It starts the daemon and shows Home.
- [ ] No projects: Home shows the empty state with **Add a project**.
- [ ] Add 3 projects. Home shows 3 tabs plus **All projects**. **All projects** lists tasks of all 3 with project names.
- [ ] A question in project B while on project A's tab: the pill goes up; the row is under **All projects** → Needs you.
- [ ] `saarthi project add` with the window open, then switch back to it: a new tab is there.
- [ ] Each status group holds the right stages (spec table in F2.9). Parked tasks only with the filter on.
- [ ] Start a run. Close the window. `saarthi run list` shows `running`. Reopen: Activity shows all events, no gap.
- [ ] `saarthi daemon stop` with the window open: "Reconnecting…" bar. `saarthi daemon start`: bar goes, events continue.
- [ ] Board view: 4 columns. **Show detailed stages** adds the stage name. Drag Inbox -> Ready with no goal: snaps back with the reason. Add a goal, try again: works.
- [ ] Board view: drag to Working: Start opens on the Task page.
- [ ] In a terminal, `saarthi task move T-1 parked`: the board updates within 1 s.
- [ ] Filters: status, label, agent, text each narrow the board.
- [ ] New task shortcut from another app (X11 and Wayland session on Linux; also macOS and Windows). On Wayland, use the shortcut command from Settings.
- [ ] Activity: each card type appears for a FakeAdapter replay of every M2 fixture. Pause scroll works.
- [ ] Health p95 delay is under 300 ms after a 200-event run.
- [ ] More → Terminal: start an interactive run, type, resize.
- [ ] Claude has a question: options show as buttons; answering continues the run. Codex mid-step message shows "Queued".
- [ ] More → Docs: run a plan; the plan appears under "Plans" and the count goes up. Click it: formatted markdown. Click an outline entry: the view jumps. Add a `*.md` file in the worktree: it shows under "Changed" with `added`. **Open in my editor** works.
- [ ] More → History lists goal save, stage moves, run start/end, checkpoint.
- [ ] More → Details shows branch, ahead/behind, runs; the three Open buttons work.
- [ ] Files: tree, tabs, find a file, search by text, open in my editor at a line.
- [ ] Files: **Changed** list matches `git diff --numstat` against the merge base, including a new untracked file. **Show changes** and **Full file** both work.
- [ ] Tiny edit in a task's copy: saved; `git diff` shows it; Activity shows "by you". In Project files: no Edit button. During an active run: Edit disabled.
- [ ] Settings: change theme (dark is the default), editor command, max parallel runs. Restart app: values kept.
- [ ] Settings → Health and Agents: rename `codex` binary: red row with fix text.
- [ ] Notifications: window open -> native only; window closed -> daemon notifier only (Linux).
- [ ] Smoke check on macOS and Windows: app opens, Home loads, a FakeAdapter replay shows in Activity.

---

## 10. Open questions

1. **Webview performance** (core TDD 16 Q4): if xterm.js or CodeMirror lag in Tauri on Linux (WebKitGTK, Ubuntu 24.04), plan B is the same UI in a normal browser at `http://127.0.0.1:7878`. Confirm with M0 spike 4. macOS (WKWebView) and Windows (WebView2) are expected to be faster.
2. **Global shortcut on Wayland:** Tauri's global shortcut may not work on GNOME Wayland. Fallback: a desktop custom shortcut running `saarthi-desktop --quick-capture`. Confirm on my machine early in M3.
3. **Tiny edits (F17.3)** are in M3, with strict limits (worktree only, no active run, stale-file check). If they cause trouble, drop the Edit button; the rest of Files stands alone.
4. **Notification click on Linux:** click actions may not work on every desktop. Fallback: the notification text names the task ID.
5. **Which moves are "user moves"?** The board only offers moves the daemon lists for a user. M1's `ALLOWED_MOVES` must mark system-only moves (like Running -> Verifying). Confirm with M1 TDD.
6. **Secrets on screen** (milestones README, known gap 2): until M8, Activity, Terminal and Files may show secrets.
7. **Base of "changes against main" (decided):** M3 adds the base helper for F17.5 (the remote `main` if it exists, else the local one). M4 and M5 reuse it, so Files and Check and ship always agree on the base.

---

## 11. Effort

About **37.5 hours** (about 4 weeks at ~10 h/week). It was 32.5 h; the Simple UI adds about 5 h for F1.5, F2.9, F17.5 and F17.8. Breakdown in the TDD, section 16.

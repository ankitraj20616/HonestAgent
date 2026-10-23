# FSD — M1: Daemon Core + CLI

**Document type:** Functional Specification Document (FSD)
**Milestone:** M1 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`), new UI words, note on the 4 on-screen statuses, per-OS paths
**Estimated effort:** ~20 hours (2 weeks at 8-10 h/week)
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M1_daemon_core_cli.md`, `../M0_spike_skeleton/FSD_M0_spike_skeleton.md`, `../M2_agent_runs_worktrees/FSD_M2_agent_runs_worktrees.md`, `../../FUNCTIONAL_SPECIFICATIONS.md`, `../../TDD-tech-design-doc.md`
**Screens:** prototype view `cli` (the `saarthi` CLI sessions) in `core_docs/design/Saarthi Prototype.html#cli` (full list in `core_docs/design/README.md`). M1 has no window screen.

---

## 1. What this document covers

M1 builds the **brain of Saarthi without any screen and without any agent**:

- The background program (the **daemon**, `saarthid`) with its database and its API.
- The `saarthi` command line tool that talks to it.
- Projects, tasks, stages, briefs, and the event log.

Agents, worktrees, and the desktop window come later (M2, M3).

---

## 2. The goal in plain words

At the end of M1 I can manage my work from the terminal:

- Add my client repos as projects.
- Create tasks, give them a priority and labels, list and filter them.
- Write a brief for a task in my own editor. Every save is kept.
- Move tasks between stages. Saarthi stops me if I try a move that is not allowed, or if I try to make a task `Ready` without a goal.
- See the full history of a task (every change is an event).

**What I can use at the end:** a working task tracker for my projects, from the CLI. It is the base M2 runs agents on.

---

## 3. Where this milestone sits

| Before | This | Next |
|---|---|---|
| **M0**: repo skeleton, agent fixtures, ADR-001 | **M1**: daemon, DB, API, events, CLI | **M2**: run Claude / Codex on a task in its own worktree |

What M1 unlocks:

- **M2** adds runs on top of tasks, stages, and the event bus built here.
- **M3** builds screens on the API and the WebSocket built here.

---

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Daemon** (`saarthid`) | A program that runs in the background. It owns all data and all logic. |
| **CLI** (`saarthi`) | The command you type. It only sends requests to the daemon. |
| **Token** | A secret password in `~/.config/saarthi/token` (Linux path; M2 picks the right folder on macOS and Windows). Every request must carry it. |
| **Task ID** | A short name for a task, like `T-0001`. Unique across all projects. |
| **Stage** | Where a task is in its life: `Inbox`, `Research`, `Ready`, ... (FSD F2.3). |
| **Stage rule** | A check before a move. Example: `Ready` needs a brief with a goal. |
| **Brief version** | Each time you save a brief, Saarthi keeps a new copy with a number (v1, v2, ...). The window (M3) shows the brief as the task's **Goal** and its acceptance criteria as **What done looks like**. |
| **Event** | A saved line that says "this happened" (task created, stage changed, brief saved). |
| **`project.toml`** | A settings file in your repo at `.saarthi/project.toml`. |
| **Replay** | When a client reconnects, the daemon first sends the events it missed. |

---

## 5. Features

### 5.1 Daemon start / stop / status (F20.1, F21.2)

- **What:** `saarthi daemon start|stop|status`. `status` uses the health endpoint.
- **Why:** everything else needs the daemon running.
- **Example:**
  ```
  $ saarthi daemon start
  Daemon started (pid 41822) on http://127.0.0.1:7878
  $ saarthi daemon status
  Daemon     running  pid 41822  up 3m  v0.1.0
  Database   ~/.local/share/saarthi/saarthi.db  schema 0001
  git        found    2.43.0
  claude     found    2.1.296   login: unknown (checked from M2)
  codex      found    0.152.1   login: unknown (checked from M2)
  gh         missing
  ```
- **Rules:**
  - The daemon listens only on `127.0.0.1`.
  - Only one daemon can run at a time.
  - On first start it makes the token file (only you can read it) and the database.
  - `start --dev` runs in the foreground with debug logs (for development).
  - Commands other than `daemon start` do not start the daemon by themselves. They say: `Daemon is not running. Start it: saarthi daemon start`.
- **Acceptance criteria:**
  - `daemon start` twice -> second one says it is already running.
  - `daemon stop` stops it; `daemon status` then says `not running` (exit code 2).
  - A request without the token gets `401`.
  - `status` shows each tool as found / missing, with its version.

### 5.2 Projects (F1.1-F1.4, CLI)

- **What:** `saarthi project add|list|show|rename|remove`.
- **Why:** every task belongs to a project (a git repo).
- **Example:**
  ```
  $ saarthi project add ~/OFFICE/AD0071-manson-safety-traning-platform
  Added project "AD0071-manson-safety-traning-platform" (01JA3K...)
    repo      /home/me/OFFICE/AD0071-manson-safety-traning-platform
    branch    main  (from git)
    agent     claude
    memory    core_docs  (found)
    created   .saarthi/project.toml
  Warning: gh not found. PRs will not work until it is installed.

  $ saarthi project list
  NAME                                  OPEN TASKS  RUNNING  REPO
  AD0071-manson-safety-traning-platform          3        0  ~/OFFICE/AD0071-...
  saarthi                                        1        0  ~/OFFICE/saarthi
  ```
- **Rules:**
  - The folder must be inside a git repo. If you give a sub-folder, Saarthi uses the repo's top folder.
  - The same repo cannot be added twice.
  - The name is the folder name unless you pass `--name`. Names are unique.
  - Missing `git`, `claude`, `codex`, or `gh` only gives a warning.
  - If `.saarthi/project.toml` does not exist, Saarthi creates it with defaults. It never overwrites an existing one. It does not commit it.
  - If the memory folder (default `core_docs/`) is missing, Saarthi warns and tells you to set `memory_path` in `project.toml` (or pass `--memory-path` on add).
  - **Project settings (F1.2)** live in `.saarthi/project.toml`: default branch, default agent, memory path. To change them, edit the file. `saarthi project show` prints the values in use and where each came from (file, git, or default). Check commands are read from M4.
  - `project rename` changes only the Saarthi name.
  - `project remove` asks "Remove project X and its N tasks from Saarthi? The repo is not touched. [y/N]". `--yes` skips the question. It deletes the project's tasks, briefs, research, and events from Saarthi's database. It never deletes the repo or `.saarthi/`.
  - `list` shows: name, open tasks count (not `Shipped` / `Archived`), running agents count (always 0 until M2), repo path.
- **Acceptance criteria:**
  - Adding a folder that is not a git repo fails with a clear message, exit code 1.
  - Adding the same repo twice fails with "already added as <name>".
  - A new `project.toml` appears in the repo; an existing one is unchanged byte for byte.
  - `project remove` leaves the repo folder and its `.saarthi/` untouched.
  - `--json` works on `list` and `show`.

### 5.3 Create task (F2.1, F2.6)

- **What:** `saarthi task new "<title>"` with optional `--project`, `--priority 1|2|3`, `--label` (repeat), `--ticket <url>`.
- **Why:** starting a task must take seconds.
- **Example:**
  ```
  $ cd ~/OFFICE/saarthi
  $ saarthi task new "Add health endpoint" --label api --priority 1
  Created T-0007  Add health endpoint  [Inbox]  P1  project: saarthi
  ```
- **Rules:**
  - Only the title is needed (1-200 characters).
  - New tasks start in `Inbox`, priority `P2` unless given.
  - **Which project?** In this order: `--project <name or id>`; else the project whose repo contains the current folder; else the only project, if there is just one; else an error that lists the projects.
  - Task IDs are `T-` + a number, at least 4 digits (`T-0001` ... `T-9999`, then `T-10000`). The number counts up across **all** projects and is never reused, even after a project is removed. (Why: commands like `saarthi task move T-0007 ready` do not need a project, and branch names stay unique.)
  - You can type `t-7` or `T-7`; Saarthi reads it as `T-0007`.
  - Edit fields later with `saarthi task edit T-0007 --title ... --priority ... --label ... --ticket ...`. `--label` replaces the whole label list; `--no-labels` clears it.
- **Acceptance criteria:**
  - First task ever is `T-0001`; the next task in another project is `T-0002`.
  - Creating a task makes a `task.created` event; editing makes a `task.updated` event with old and new values.
  - Running `task new` outside any project folder with two projects added prints the project list and exits 1.

### 5.4 Task stages and moves (F2.3, F2.5 `Ready` rule)

- **What:** `saarthi task move <id> <stage> [--reason "..."]`.
- **Why:** the board and all later automation depend on the stage being correct.
- **Example:**
  ```
  $ saarthi task move T-0001 ready
  Cannot move T-0001 to Ready: the brief has no goal.
  Fix: saarthi brief edit T-0001
  $ saarthi brief edit T-0001        # write a goal, save, close the editor
  Saved brief v1 for T-0001
  $ saarthi task move T-0001 ready
  T-0001  Inbox -> Ready
  ```
- **Rules:**
  - Stages: `inbox`, `research`, `ready`, `running`, `needs_you`, `verifying`, `failed`, `review`, `shipped`, `parked`, `archived`. The CLI also accepts `needs-you`.
  - All allowed moves are in **one table** (core TDD section 7). Moves you can do by hand in M1:
    - `Inbox -> Research`, `Inbox -> Ready`, `Research -> Ready`
    - any active stage `-> Parked` (not from `Shipped`, `Archived`, or `Parked`)
    - `Parked -> Inbox`, `Parked -> Research`, `Parked -> Ready` (un-park)
    - `Shipped -> Archived`, `Parked -> Archived`
  - **`Ready` rule:** the latest brief must have a goal that is not blank. This applies to every move into `Ready`.
  - Moves that the system makes (for example `Ready -> Running` when a run starts) are in the table but cannot be done by hand. M1 refuses them with "This move happens automatically when ...". M2, M4, M5 turn them on.
  - Moving a task to the stage it is already in does nothing and says so.
  - `--reason` is saved in the event.
  - These are the engine stages. The window (M3) groups them into 4 simple statuses: To do, Working, Needs you, Done (F2.9). The CLI keeps the real stage names.
- **Acceptance criteria:**
  - Every pair of stages is tested: allowed moves pass, all others fail with a clear message.
  - `Inbox -> Ready` fails without a brief, fails with a brief whose goal is blank, works with a goal.
  - `Ready -> Running` by hand fails in M1.
  - Each move makes one `task.stage_changed` event with `from`, `to`, `reason`.

### 5.5 List and filter tasks (F2.7, CLI)

- **What:** `saarthi task list` with `--project`, `--stage` (repeat), `--label` (repeat), `--agent`, `--search "<text>"`, `--all`, `--json`.
- **Example:**
  ```
  $ saarthi task list --stage inbox --stage ready
  ID      STAGE   P   TITLE                    LABELS   UPDATED
  T-0007  Inbox   P1  Add health endpoint      api      2m ago
  T-0001  Ready   P2  Test task                         1h ago
  ```
- **Rules:**
  - Project is chosen like in 5.3. `--all-projects` lists every project.
  - `Archived` tasks are hidden unless `--all` (or `--stage archived`).
  - `--search` matches the task ID or title (case does not matter).
  - `--agent claude` shows tasks that had a run with that agent. Always empty until M2.
  - Sort: priority (P1 first), then last updated.
- **Acceptance criteria:** each filter is tested alone and combined; `--json` prints a list of task objects.

### 5.6 Show a task (F20.2, F14.1)

- **What:** `saarthi task show <id> [--json]`.
- **Example:**
  ```
  $ saarthi task show T-0001
  T-0001  Test task                         [Ready]  P2
  Project   saarthi        Labels  -        Ticket  -
  Brief     v1  Goal: Prove the stage rule works.
  Events
    #1  10:02  task.created        title="Test task"
    #2  10:05  brief.saved         v1
    #3  10:05  task.stage_changed  Inbox -> Ready
  ```
- **Rules:** `--json` prints `{task, brief, events}` with events oldest first (up to the last 200).
- **Acceptance criteria:** `saarthi task show T-0001 --json` is valid JSON and contains the task and every event made for it.

### 5.7 Brief editor and versions (F3.1 via `$EDITOR`, F3.4 data only)

- **What:** `saarthi brief edit <id>` opens your editor with the brief as markdown. When you close it, Saarthi saves a new version. `saarthi brief show <id>` prints the latest one.
- **Why:** the brief is the most important input for agents later.
- **Example of the file you edit:**
  ```markdown
  # Brief for T-0001: Test task
  <!-- Fill the sections. Lines inside these comments are ignored. -->

  ## Goal
  Prove the stage rule works.

  ## Acceptance criteria
  - `task move T-0001 ready` fails without a goal
  - it works after the brief is saved

  ## Notes

  ## Focus paths
  - daemon/src/saarthi/core/
  ```
- **Rules:**
  - Editor: `$VISUAL`, else `$EDITOR`, else `vi`.
  - Four fixed sections: Goal, Acceptance criteria (one `-` item per line), Notes, Focus paths. Text under an unknown `##` heading is kept and added to Notes.
  - If you change nothing, no new version is saved ("No changes.").
  - If the editor exits with an error, nothing is saved.
  - If saving fails, your text is kept in a temp file and its path is printed.
  - `--file <path>` saves from a file without opening the editor (for scripts).
  - Every save adds a version (`v1`, `v2`, ...). Old versions are kept. Viewing old versions is M6.
  - A brief without a goal can be saved (it is a draft). Only the `Ready` move needs the goal.
- **Acceptance criteria:**
  - Two edits with changes -> versions 1 and 2 exist; `brief show` prints v2.
  - Each saved version makes one `brief.saved` event.
  - Markdown -> brief -> markdown gives the same text back.

### 5.8 Event log (F14.1, events saved)

- **What:** every change to a task, brief, or research item is saved as an event, in the database and in a log file.
- **Why:** the timeline (M3), notifications (M2), and the live UI (M3) are built from events. No event, no history.
- **Rules:**
  - M1 event types: `task.created`, `task.updated`, `task.stage_changed`, `brief.saved`, `research.added`, `research.updated`.
  - Each event has a number that only goes up. Order is by this number.
  - A change and its event are saved together. If one fails, both fail.
  - Events for a task are also written to `~/.local/share/saarthi/logs/tasks/<task-id>.jsonl`.
  - Live events are sent to WebSocket clients. A client that reconnects with `last_event_id` gets the missed ones first, then live ones, with no gaps and no duplicates.
- **Acceptance criteria:** see the TDD tests `test_event_bus.py` and `test_ws.py`.

### 5.9 Research items API (data only)

- **What:** the API can add, list, edit, and delete research items (notes, links, snippets) for a task.
- **Why:** M1 owns the table and the endpoints so the data model is complete. The research features (title fetch, "Just research", "send to agent" use) are M6.
- **Rules:** no CLI command in M1. Add and edit make `research.added` / `research.updated` events. Delete also makes `research.updated` (marked as deleted).
- **Acceptance criteria:** API tests only.

---

## 6. Main user flows

### 6.1 First day
1. `cd daemon && uv sync`
2. `saarthi daemon start`
3. `saarthi daemon status` -> all tools listed.
4. `saarthi project add ~/OFFICE/<some-project>`

### 6.2 Task from idea to Ready
1. `cd ~/OFFICE/<some-project>`
2. `saarthi task new "Add password reset API" --label api`
3. `saarthi task move T-0001 research`
4. `saarthi brief edit T-0001` -> write the goal and criteria, save, close.
5. `saarthi task move T-0001 ready`
6. `saarthi task show T-0001` -> 4 events.

### 6.3 Park and come back
1. `saarthi task move T-0003 parked --reason "waiting for client"`
2. Later: `saarthi task move T-0003 ready`

### 6.4 Remove a project
1. `saarthi project remove old-client`
2. Confirm. Repo stays on disk.

---

## 7. Done when

- [ ] `saarthi project add ~/OFFICE/<some-project>` works and creates `.saarthi/project.toml`.
- [ ] `saarthi task new "test task"` creates `T-0001` (on a fresh database).
- [ ] `saarthi task move T-0001 ready` is blocked with a clear message.
- [ ] After `saarthi brief edit T-0001` (with a goal), the same move works.
- [ ] `saarthi task show T-0001 --json` prints the task and its events (`task.created`, `brief.saved`, `task.stage_changed`).
- [ ] Test coverage of `daemon/src/saarthi/core/` is above 80%.
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run pyright` all pass (CLAUDE.md rule 9).

---

## 8. Out of scope

| Item | Owner |
|---|---|
| Runs, agents, worktrees, `saarthi run ...` | M2 |
| `runs` table in use (M1 only creates it) | M2 |
| Any screen; `/settings` endpoint; Settings → Health page | M3 |
| `Review` and `Shipped` stage rules, override reason | M4, M5 |
| Goal history screen (Goal card → Edit → History), "Draft brief", research features and CLI | M6 |
| Agent login check ("logged in") on health | M2 |
| Secret masking in events | M8 |
| Data and config folders per OS (`platformdirs`) | M2 |
| Background mode and start at login (systemd on Linux, launchd on macOS, autostart on Windows) | M9 |

---

## 9. QA checklist

Use a fresh data folder so IDs start at `T-0001`:
`export SAARTHI_DATA_DIR=/tmp/saarthi-qa SAARTHI_CONFIG_DIR=/tmp/saarthi-qa-config`

1. `saarthi task list` -> "Daemon is not running ...", exit code 2.
2. `saarthi daemon start` -> started. Again -> "already running".
3. `stat -c %a /tmp/saarthi-qa-config/token` -> `600`.
4. `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:7878/api/v1/health` -> `401`.
5. Same with `-H "Authorization: Bearer $(cat /tmp/saarthi-qa-config/token)"` -> `200`.
6. `saarthi project add /tmp` -> "not a git repo", exit 1.
7. `git init /tmp/demo && saarthi project add /tmp/demo` -> works; `/tmp/demo/.saarthi/project.toml` exists.
8. Edit `default_branch = "develop"` in that file; `saarthi project show demo` shows `develop (file)`.
9. `saarthi project add /tmp/demo` again -> "already added".
10. `cd /tmp/demo && saarthi task new "test task"` -> `T-0001 [Inbox]`.
11. `saarthi task move T-0001 shipped` -> refused, "not allowed from Inbox", with the list of allowed stages.
12. `saarthi task move T-0001 ready` -> refused, "brief has no goal".
13. `EDITOR=nano saarthi brief edit T-0001`, close without changes -> "No changes."
14. Edit again, write a goal -> "Saved brief v1".
15. `saarthi task move t-1 ready` -> `Inbox -> Ready`.
16. `saarthi task move T-0001 running` -> refused, "happens automatically when a run starts".
17. `saarthi task show T-0001 --json | python3 -m json.tool` -> valid; 3 events.
18. `cat /tmp/saarthi-qa/logs/tasks/T-0001.jsonl` -> the same 3 events.
19. `saarthi task new "second" --label api --priority 1`, then `saarthi task list --label api` -> only `T-0002`.
20. `saarthi project remove demo --yes`; `ls /tmp/demo/.saarthi` still works.
21. `saarthi daemon stop`; `saarthi daemon status` -> not running.

---

## 10. Open questions

1. **Project events.** Core TDD 6.2 has no `project.*` events, so adding or removing a project leaves no event. Should we add `project.added` / `project.removed`? (M1 does not, to stay within 6.2.)
2. **Project remove deletes history.** M1 deletes the project's rows. The JSONL log files stay on disk. Is that OK, or do we want a soft delete?
3. **Un-park target.** Core TDD 7 has no move out of `Parked` except `Archived`. M1 allows `Parked -> Inbox / Research / Ready`. Later, when runs exist, should un-park go back to the exact stage it came from?
4. **Research delete event.** There is no `research.deleted` in 6.2. M1 uses `research.updated` with `deleted: true`.
5. **`send_to_agent` default** for new research items. M1 uses `true`. M6 may change it.
6. **Side by side (Race Mode) and `worktree_path`** (known gap 4 in `../README.md`): the `tasks` table keeps one `worktree_path` as in core TDD 5.2. M7 decides how to model two worktrees.

---

## 11. Effort

About **20 hours**. Breakdown in the TDD section 16.

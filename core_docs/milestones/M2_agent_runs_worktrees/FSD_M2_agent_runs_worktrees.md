# FSD — M2: Agent Runs + Worktrees

**Document type:** Functional Specification Document (FSD)
**Milestone:** M2 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-11
**Estimated effort:** 20 hours (2 weeks at ~10 h/week)
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M2_agent_runs_worktrees.md`, `../../FUNCTIONAL_SPECIFICATIONS.md`, `../../TDD-tech-design-doc.md`, `../M1_daemon_core_cli/FSD_M1_daemon_core_cli.md` (before), `../M3_desktop_ui_v1/FSD_M3_desktop_ui_v1.md` (next), `../../decisions/ADR-001-agent-integration.md` (M0 output)

---

## 1. What this document covers

This document covers **M2 only**: running real agents (Claude Code and Codex) on a task, each task in its own git worktree, driven from the `saarthi` CLI.

It covers the features M2 owns in the ownership map (`../README.md`):
F5.1, F5.2, F5.3 (v0, brief only), F5.6, F5.7, F5.8, F5.9, F5.10, F6.1, F6.2, F6.3 (CLI), F14.2, F16.1, F19.1 (`notify-send`), NF3.

There is no desktop window in M2. Everything here is used from the terminal. The window comes in M3.

---

## 2. The goal in plain words

Today I open a terminal, `cd` into a repo, and type `claude`. If I want two agents at once, I juggle two terminals and they may edit the same files.

After M2:
- I type `saarthi run T-0002 --agent claude --mode build`.
- Saarthi makes a fresh branch and a separate folder (a worktree) for that task.
- It writes the brief into a file the agent reads first.
- It starts Claude in that folder and shows me clean, readable progress.
- If the agent asks me something, I get a desktop notification and answer with `saarthi run say`.
- I can run a second task with Codex at the same time. They never touch each other's files.
- If the daemon dies, nothing is lost. The run shows as `interrupted` and I can resume it.

**What I can use at the end:** I build Saarthi itself with Saarthi from the CLI. This is where dogfooding starts.

---

## 3. Where this milestone sits

| Before (needed) | This milestone | After (unlocked) |
|---|---|---|
| **M0** recorded real agent streams in `tests/fixtures/agents/` and wrote ADR-001 (how "needs input" looks). | Agent adapters, worktrees, runs, Needs You, resume, CLI. | **M3** puts these runs on screen (Stream tab, Terminal tab, message box). |
| **M1** gave projects, tasks, briefs, events, the stage table `ALLOWED_MOVES`, the API and the WebSocket. | | **M4** plugs the Check Runner into the "build run ended" step. |

---

## 4. Easy glossary (new words only)

| Word | Simple meaning |
|---|---|
| **Adapter** | A small piece of code that knows how to talk to one agent CLI. Saarthi has one per agent. |
| **Worktree** | A second working folder of the same git repo, on its own branch. Changes there do not touch your main folder. |
| **Setup script** | An optional script (`.saarthi/setup.sh`) that runs once in a new worktree. Example: copy `.env`, run `uv sync`. |
| **Context Pack** | A file the agent reads first. In M2 it only holds the brief: `.saarthi/context/TASK.md`. |
| **Checkpoint** | A hidden git snapshot of the worktree, saved at the end of every run. It does not change your branch history. |
| **Session ID** | The agent's own ID for a conversation. Saarthi saves it so a run can be resumed. |
| **Interrupted** | A run that was alive when the daemon stopped. It can be resumed. |
| **Queue** | Runs waiting because the max number of parallel runs is reached. |

---

## 5. Features

### F5.1 Supported agents

- **What:** Saarthi can drive Claude Code (`claude`) and Codex (`codex`). It uses the logins I already have.
- **Why:** These are the two agents I use every day. No API keys to manage.
- **Example:**
  ```
  $ saarthi run T-0002 --agent codex --mode build
  Error: codex not found on PATH. Install it, or set codex_path in ~/.config/saarthi/config.toml
  ```
- **Rules:**
  - Each agent sits behind the same adapter interface. No agent-specific code outside `agents/`.
  - If the CLI is missing, the run does not start. The error says how to fix it.
  - Saarthi never asks for API keys.
- **Acceptance criteria:**
  - A Claude run and a Codex run can each be started from the CLI.
  - With the agent CLI missing, `saarthi run` exits with code 1 and a clear message. No run row is left in `running`.

### F5.2 Start a run

- **What:** Start an agent on a task with an agent and a mode.
- **Why:** This is the main action of the product.
- **Example:**
  ```
  $ saarthi run T-0002 --agent claude --mode build --message "Keep the CLI output short"
  Workspace  saarthi/T-0002-add-run-list-command (new)
             ~/.local/share/saarthi/worktrees/saarthi-7kq2px/T-0002
  Setup      .saarthi/setup.sh ok (14.2 s)
  Context    .saarthi/context/TASK.md (brief v3)
  Run        01JC4Z8M3V  claude · build · started 10:22:31
  10:22:35  msg   I'll read TASK.md first, then look at cli/run.py.
  10:22:38  tool  Read  daemon/src/saarthi/cli/run.py
  10:22:51  tool  Edit  daemon/src/saarthi/cli/run.py
  10:22:51  file  daemon/src/saarthi/cli/run.py  (+18 -2)
  10:23:40  tool  Bash  uv run pytest -q tests/unit/test_cli_run.py
  10:23:44  out   4 passed in 0.31s
  10:23:52  msg   Done. Added `saarthi run list` with a Rich table.
  10:23:52  END   done · 1m21s · $0.18 · checkpoint 1
  Task T-0002 -> Verifying. Checks come in M4. Review the diff, then: saarthi task move T-0002 review
  ```
- **Rules:**
  - Modes: `plan`, `build`, `fix`, `research`. Default `build`.
  - Agent default: the project's `default_agent`.
  - A run can start only when the task is in `Ready`, `Failed` or `Review` (core TDD 8.1).
  - Only **one active run per task** (queued, running or waiting for me). A second one is refused.
  - `plan` and `research` runs are read-only for the agent. `build` and `fix` can edit files in the worktree only.
  - `saarthi run` attaches to the live view by default. `--detach` starts it and returns.
  - `--dry-run` prints the Context Pack and the agent command, and starts nothing.
  - `--pty` starts the agent's normal interactive screen inside a pseudo-terminal instead of the clean JSON mode. `run watch` then shows the raw terminal, and `run say` types a line into it. No clean events, no Needs You, no resume for these runs. This is the base for M3's Terminal tab.
  - Playbooks (`--playbook`) are not in M2. They come in M6.
- **Acceptance criteria:**
  - Starting a run on a task in `Inbox` fails with "Task must be Ready, Failed or Review".
  - Starting a second run on a task that has an active run fails with the active run's ID.
  - A `plan` run never changes a file in the worktree (proved with FakeAdapter + the read-only flags in the argv test).
  - `--dry-run` creates no run row and no worktree.

### F5.3 Context Pack v0 (brief only)

- **What:** Before each run, Saarthi writes the task's latest brief to `<worktree>/.saarthi/context/TASK.md`. The prompt tells the agent to read it first.
- **Why:** The agent gets the same, full intent every time. I can read the exact same file.
- **Example:** `saarthi run T-0002 --dry-run` prints:
  ```
  # T-0002 Add `saarthi run list`
  Mode: build
  ## Goal
  List all runs of a task in a table.
  ## Acceptance criteria
  - [ ] Shows agent, mode, status, start, duration, cost
  ...
  ```
- **Rules:**
  - v0 holds: task ID, title, mode, the latest brief (goal, acceptance criteria, notes, focus paths) and the `--message` text.
  - Research items, memory files and playbooks are **not** included. That is Context Pack v1 in M6.
  - The file is never committed. Saarthi adds `.saarthi/context/` to the repo's local git exclude file.
  - It is rewritten at the start of every run and every resume.
- **Acceptance criteria:**
  - After a run starts, `TASK.md` exists in the worktree and matches the latest brief version.
  - `git status` in the worktree does not show `.saarthi/context/`.
  - `GET /tasks/{id}/context-pack` returns the same text that would be written.

### F5.6 Needs You

- **What:** When an agent asks a question or needs permission, the task moves to `Needs You`, I get a desktop notification, and I answer from the CLI.
- **Why:** I should not have to watch the stream to notice the agent is stuck.
- **Example:**
  ```
  10:31:02  ASK   Should I add a new `run_notes` table, or reuse `events`?
                  Answer: saarthi run say 01JC4Z8M3V "reuse events"
  ```
  Desktop: **Saarthi — Needs You · T-0002** "Should I add a new `run_notes` table…"
  ```
  $ saarthi run say T-0002 "reuse events"
  Sent. Run 01JC4Z8M3V is running again. Task T-0002 -> Running.
  ```
- **Rules:** There are two ways an agent can need me. Both must work, for both agents.
  - **Live question:** the agent is still running and waits for an answer (for example Claude asking through a question tool). My answer goes straight in.
  - **Ended with a question:** the agent finished its turn and its last message is a question, or it was refused a permission it needed. Saarthi treats this as Needs You. My answer **resumes** the same agent session with my text. (Codex may only support this way. See core TDD section 16 Q2.)
  - If I do not want to answer an "ended with a question" run, `saarthi run stop` closes it as **done**. Nothing is killed (the process already ended).
  - Exact detection rules come from M0 (ADR-001).
- **Acceptance criteria:**
  - Replaying the `claude_needs_input` fixture moves the task to `Needs You` and emits one `agent.needs_input` event.
  - Replaying the `codex_needs_input` fixture (run ends with a question) does the same, and the run status is `needs_input`.
  - `run say` on either moves the task back to `Running`.
  - A notification is sent once per question, not once per line.

### F5.7 Send a message during a run

- **What:** `saarthi run say <run> "text"` sends a follow-up to a running agent.
- **Why:** I often want to steer an agent without stopping it.
- **Rules:**
  - Claude takes messages live (through stdin).
  - Codex cannot take messages mid-turn. Saarthi keeps the message and sends it as a resume as soon as the current turn ends. The CLI says so: `Queued. Codex will get it when this step ends.`
  - Every message I send is saved as an event.
- **Acceptance criteria:** A message to a FakeAdapter run with live input is delivered at once. A message to a run without live input is delivered on the next resume, in order.

### F5.8 Stop and resume

- **What:** `saarthi run stop <run>` stops a run. `saarthi run resume <run>` continues the same agent session.
- **Why:** I may stop an agent going the wrong way, or the daemon may die.
- **Example:**
  ```
  $ saarthi run stop T-0002
  Stopped run 01JC4Z8M3V. Checkpoint 2 saved. Task T-0002 -> Ready.
  $ saarthi run resume 01JC4Z8M3V --message "Use a Rich table, not plain print"
  Resumed run 01JC4Z8M3V (session 7f3c…). Task T-0002 -> Running.
  ```
- **Rules:**
  - Stop: the agent gets a polite stop signal, then a hard kill after a few seconds. A checkpoint is saved. Task -> `Ready`.
  - Resume works for `stopped`, `failed` and `interrupted` runs that have a session ID. It continues the **same run** (same ID, same log).
  - A run without a session ID (for example it died before starting) cannot be resumed. The CLI says: "start a new run".
- **Acceptance criteria:** Stop ends the process group within the grace time. Resume uses the saved session ID (checked in the argv test).

### F5.9 Many runs per task

- **What:** A task keeps all its runs. `saarthi run list T-0002` shows them.
- **Example:**
  ```
  $ saarthi run list T-0002
  ID          Agent   Mode   Status       Started   Took    Cost
  01JC4Z8M3V  claude  build  done         10:22     1m21s   $0.18
  01JC51QK2D  codex   plan   done         09:58     2m03s   -
  ```
- **Acceptance criteria:** All runs are listed newest first. Cost shows `-` when the agent did not report it.

### F5.10 Parallel runs

- **What:** Different tasks run at the same time. Default limit: 4. Extra runs wait in a queue.
- **Example:** `Run 01JC5A… queued (4 of 4 running). It will start by itself.`
- **Rules:** The limit comes from the `max_parallel_runs` setting (default 4 in `config.py`, override in `~/.config/saarthi/config.toml`; the Settings screen comes in M3). A queued run starts by itself when a slot frees. When a queued run starts, the task must still allow `Running`; if not, the run is closed as `stopped`.
- **Acceptance criteria:** With the limit set to 1, a second run is `queued` and starts after the first ends. Two runs on two tasks never write to each other's worktree.

### F6.1 Auto workspace

- **What:** On the first run of a task, Saarthi creates branch `saarthi/<task-id>-<short-title>` and a worktree at `~/.local/share/saarthi/worktrees/<project>/<task-id>`.
- **Why:** Isolation. Each task works on its own copy.
- **Rules:**
  - The base is the project's default branch.
  - If the branch already exists for the same task, reuse it. If it belongs to something else, add a suffix (`-2`).
  - My main repo folder is never changed (except the hidden checkpoint refs and the local exclude file).
- **Acceptance criteria:** After the first run, `git worktree list` in the main repo shows the new worktree. The task's `branch` and `worktree_path` are set. The second run reuses it.

### F6.2 Setup script

- **What:** If `.saarthi/setup.sh` exists, it runs once in the new worktree.
- **Example:** a setup script with `cp "$SAARTHI_REPO/.env" . && uv sync`.
- **Rules:** Runs once per worktree. Has a timeout. If it fails, the run fails with the script's last lines, and the next run tries the setup again.
- **Acceptance criteria:** Setup runs on the first run only. A failing script gives `run.failed` with its output tail.

### F6.3 Workspace info (CLI)

- **Example:**
  ```
  $ saarthi workspace T-0002
  Branch     saarthi/T-0002-add-run-list-command  (base main)
  Path       ~/.local/share/saarthi/worktrees/saarthi-7kq2px/T-0002
  Ahead      0   Behind 3
  Changed    2 files (uncommitted)
  Checkpoint 2 (10:31, end of run 01JC4Z8M3V)
  ```
- **Acceptance criteria:** Counts match `git` output in the worktree. Works with `--json`.

### F14.2 Checkpoints

- **What:** At the end of every run (done, failed, stopped, interrupted), Saarthi saves a hidden snapshot of the worktree.
- **Why:** Later (M8) I can rewind. Nothing an agent does is lost.
- **Rules:** The snapshot is stored under `refs/saarthi/checkpoints/<task-id>/<n>`. The task branch and its history do not change. If nothing changed since the last checkpoint, no new one is made. The list screen and Rewind are M8.
- **Acceptance criteria:** After a run, `git for-each-ref refs/saarthi/checkpoints/T-0002` shows a ref. `git log` of the task branch is unchanged.

### F16.1 Tokens and cost per run

- **What:** Each run records tokens in/out, cost (if the agent reports it) and time.
- **Rules:** Claude reports cost. Codex may only report tokens; cost stays empty. Task totals (`total_cost_usd`, `total_seconds`) are updated at the end of each run. Per-day totals and the meter are M3/M8.
- **Acceptance criteria:** Replaying `claude_build_ok` stores the fixture's cost and tokens on the run row.

### F19.1 Desktop notifications (`notify-send`)

- **What:** Saarthi shows a desktop notification for: agent needs you, run finished, run failed.
- **Rules:** Uses `notify-send`. If it is not installed, Saarthi logs one warning and goes on. Native Tauri notifications are M3. "Checks failed / passed" comes with M4.
- **Acceptance criteria:** A test with a fake `notify-send` on PATH sees exactly one call per event.

### NF3 Reliability

- **What:** If the daemon restarts, unfinished runs are marked `interrupted` and can be resumed. Every event is on disk as it comes.
- **Rules:**
  - Live runs at the time of the crash -> `interrupted`. Task -> `Failed` with note "interrupted".
  - Runs that had already **ended with a question** stay `needs_input`. Nothing was lost; I can still answer.
  - Queued runs go back in the queue.
  - A clean `saarthi daemon stop` stops live agents, saves checkpoints, and marks them `interrupted` (so I can resume).
  - Leftover agent processes from a crash are found and killed before a resume, so two agents never run in one worktree.
- **Acceptance criteria:** See section 7, item 3.

---

## 6. Main user flows

### 6.1 Build a task from the CLI (main flow)
1. `saarthi task new "Add run list command"` -> `T-0002` (M1).
2. `saarthi brief edit T-0002`, then `saarthi task move T-0002 ready` (M1).
3. `saarthi run T-0002 --agent claude --mode build`.
4. Worktree + setup + `TASK.md` are made. Claude starts. Task -> `Running`.
5. I watch the stream, or press `Ctrl+C` to detach (the run keeps going).
6. Later: `saarthi run watch T-0002` to re-attach. Past events print first, then live.
7. Run ends -> checkpoint -> task -> `Verifying`. Notification "Run finished".
8. I check the work: `cd` into the worktree path, run tests, read `git diff`.
9. `saarthi task move T-0002 review`. (M4 will put checks here.)

### 6.2 Answer a question
1. Notification: "Needs You · T-0002". Task is in `Needs You`.
2. `saarthi run watch T-0002` shows the question.
3. `saarthi run say T-0002 "reuse events"` -> task -> `Running`.

### 6.3 Two tasks in parallel
1. `saarthi run T-0002 --agent claude --detach`.
2. `saarthi run T-0003 --agent codex --detach`.
3. `saarthi task list --stage running` shows both.
4. Each has its own worktree. Each finishes on its own.

### 6.4 Daemon crash and resume
1. A run is live. I kill the daemon (`kill -9`).
2. `saarthi daemon start`. On start, the run is marked `interrupted`, its worktree gets a checkpoint, the task goes to `Failed`.
3. `saarthi run resume T-0002` -> same run, same session, task -> `Running`.

---

## 7. Done when

1. `saarthi run T-0002 --agent claude --mode build` creates a worktree, runs Claude, and prints clean events (no raw JSON on screen, except lines marked `raw` that Saarthi could not map).
2. One Claude run and one Codex run on two tasks at the same time finish without touching each other's files (`git status` of each worktree shows only its own changes).
3. Kill the daemon with `kill -9` mid-run, start it again: `saarthi run list` shows `interrupted`; `saarthi run resume` continues the same session and the run reaches `done`.
4. Needs You works for both agents: one live-question case and one ended-with-question case, each answered with `run say`.
5. At least **3 real Saarthi tasks** were built with this CLI. They are listed in `core_docs/timeline/timeline.md`.
6. `uv run pytest`, `uv run ruff check .`, `uv run pyright` all pass.

---

## 8. Out of scope

| Not in M2 | Owner |
|---|---|
| Any screen (Stream tab, Terminal tab, message box, workspace panel) | M3 |
| Typing into an interactive agent terminal from the UI (keystrokes, resize) | M3 |
| Native (Tauri) notifications | M3 |
| Check Runner, Proof Card, auto checks after build, `Verifying -> Review` rule | M4 |
| Sync with main, worktree cleanup prompt, `workspace.removed` event, commit, push, PR | M5 |
| Context Pack v1 (research, memory, playbooks), playbooks, "Research this" saving findings | M6 |
| Race Mode, per-workspace ports | M7 |
| Permission profiles UI, blocked-commands list, `bwrap`, secret masking, checkpoint list + Rewind, cost meter | M8 |

---

## 9. QA checklist

Use a scratch repo with a tiny Python project and a brief.

- [ ] `saarthi run T-1 --dry-run` prints `TASK.md` text and the agent command. `saarthi run list T-1` is empty.
- [ ] `saarthi run T-1 --agent claude --mode build` shows `Workspace … (new)`, then events, then `END done`.
- [ ] `git -C <main repo> worktree list` shows the worktree. Main folder `git status` is clean.
- [ ] `cat <worktree>/.saarthi/context/TASK.md` matches the brief. `git -C <worktree> status` does not list it.
- [ ] `git -C <main repo> for-each-ref refs/saarthi/checkpoints/T-1` shows `…/1`.
- [ ] `saarthi task show T-1` stage is `Verifying`.
- [ ] Start a second run on T-1 while one is active -> refused.
- [ ] Set `max_parallel_runs = 1` in `~/.config/saarthi/config.toml`, restart the daemon, start runs on T-2 and T-3 -> T-3 shows `queued`, then starts alone.
- [ ] `saarthi run T-4 --agent codex --mode plan`: no file changes in its worktree. Task -> `Ready` at the end.
- [ ] Ask the agent in the brief to "ask me which name to use before coding". Notification appears. Task is `Needs You`. `run say` continues it.
- [ ] Same with Codex.
- [ ] Press `Ctrl+C` in `run watch` -> the run keeps going (`run list` shows `running`).
- [ ] `run stop` -> process gone (`ps`), checkpoint made, task -> `Ready`.
- [ ] `kill -9` the daemon mid-run, restart -> `interrupted`, task `Failed`; no old agent process left; `run resume` works.
- [ ] `saarthi run T-5 --agent claude --pty` -> `run watch` shows Claude's own screen; `run say T-5 "hello"` types into it; quitting Claude ends the run.
- [ ] Uninstall/rename `notify-send` -> runs still work, one warning in `daemon.log`.
- [ ] Break `.saarthi/setup.sh` (`exit 3`) -> `run.failed` shows its output; fix it; next run re-runs setup.

---

## 10. Open questions

1. **Needs-input detection** for both agents depends on M0. Until ADR-001 confirms, the design covers both the live path and the ended-with-question path. Confirm with M0 ADR-001.
2. **Codex mid-run messages:** assumed impossible (queued until the turn ends). Confirm with M0 ADR-001; if `codex app-server` is stable (core TDD 16 Q3), revisit after v1.
3. **"Ends with a question" false alarms:** agents often end with "Want me to also…?". M2 treats that as Needs You; `run stop` closes it as done. If this is noisy in dogfooding, add a per-project switch. Decide after 3 real tasks.
4. **Stage table rows:** M2 needs a few moves the core table (section 7) does not list (for example `Running -> Failed` when a run crashes, which core 8.6 and 12 already describe). See TDD Decision 6. The M1 owner must agree.
5. **Worktree folder** (FSD Q2): M2 uses the default `~/.local/share/saarthi/worktrees/`.
6. **Secrets in logs** (milestones README, known gap 2): until M8, agent logs and events may contain secrets from `.env`. Accepted risk for a local single-user tool.

---

## 11. Effort

About **20 hours** (2 weeks at ~10 h/week). Dogfooding time (the 3 real tasks) is real work and is not counted. Breakdown in the TDD, section 16.

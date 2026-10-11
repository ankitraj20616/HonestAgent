# FSD — M7: Race Mode + parallel polish

**Document type:** Functional Specification Document (FSD)
**Milestone:** M7 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-11
**Estimated effort:** 10 hours (1 rough week at ~10 h/week)
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M7_race_mode.md`, `../../FUNCTIONAL_SPECIFICATIONS.md` (F6.7, F9, Q3), `../../TDD-tech-design-doc.md` (4.5, 5.2, 7), `../M6_research_memory_playbooks/FSD_M6_research_memory_playbooks.md` (before), `../M8_safety_cost_rewind/FSD_M8_safety_cost_rewind.md` (after)

---

## 1. What this document covers

M7 lets me give **one brief to Claude and Codex at the same time** and keep the better result. It also makes parallel work smoother.

F-numbers owned (from `../README.md`, ownership map):

- **F9.1** Race, **F9.2** Compare, **F9.3** Pick winner.
- **F6.7** Ports per workspace.
- The **"running now" strip** at the top of the board.

## 2. The goal in plain words

For a hard task, I do not know which agent will do it better. Today I would run one, wait, maybe run the other, and compare by hand.

At the end of M7 I can:

1. Click **Race** on a Ready task. Claude and Codex each work in their own worktree.
2. When both are done and checked, open **Compare**: two Proof Cards, diff size, cost, time and Change Stories side by side.
3. Click **Pick Claude** (or Codex). The winner's branch becomes the task's branch. The other worktree is removed, but its work is saved in git.
4. Run two dev servers at once without "port already in use".
5. See every running agent at the top of the board.

## 3. Where this milestone sits

- **Before:** M2 runs agents in worktrees. M4 makes Proof Cards. M5 makes Change Stories and ships. M6 builds the Context Pack and playbooks.
- **M7 adds:** a second workspace for one task, a compare view, and ports.
- **Unlocks next:** M8 adds cost budgets (races cost twice) and rewind.

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Race** | One task, one brief, two agents working at the same time. |
| **Lane** | One side of a race: one agent, its own branch, worktree and port. Named after the agent (`claude`, `codex`). |
| **Compare** | The Task Room tab that shows both lanes side by side. |
| **Winner** | The lane I pick. Its branch becomes the task's branch. |
| **Loser snapshot** | A hidden git ref that keeps the losing lane's files after its worktree is removed. |
| **Port block** | 10 port numbers that belong to one workspace (for example 41010-41019). |
| **Running now strip** | A row at the top of the board with one small card per active run. |

## 5. Features

### 5.1 F9.1 Race

- **What:** Start two `build` runs for one task, one per agent, each in its own worktree and branch, from the same starting commit.
- **Why:** For hard tasks, two tries are cheaper than one bad try plus a redo.
- **Example:**
  ```
  $ saarthi race start T-0051 --playbook plan-then-build
  Race 01JC5A0Z started for T-0051 "Add CSV export"
    lane    run          branch                                  port
    claude  01JC5A1B2C   saarthi/T-0051-add-csv-export-claude    41010
    codex   01JC5A1B3D   saarthi/T-0051-add-csv-export-codex     41020
  Watch one lane: saarthi run watch 01JC5A1B2C
  ```
  In the UI: Task Room -> **Race** button (next to Run) -> pick playbook -> **Start race**.
- **Rules:**
  - One task, two runs (core FSD Q3 default). The race is **not** two tasks.
  - The task must be in `Ready`. Default agents: Claude and Codex (from `project.toml`). The two agents must be different.
  - Only `build` mode can race.
  - If the task already has a worktree with changes, the race is refused ("race needs a clean start"). A clean worktree from a plan run is removed and replaced by the two lane worktrees.
  - Both lanes get the same Context Pack (brief, research, memory, playbook). Only the port line differs.
  - A race uses two of the "max parallel runs" slots. If only one is free, the second lane waits in the queue. Lane time counts from its own start, so waiting is not unfair.
  - During a race these actions are blocked with "pick a winner first": a normal run, Fix with agent, Second Opinion, review comments, Update from main, Ship.
  - I can stop one lane (`saarthi run stop <run>`). That lane then cannot win.
  - **Cancel race** stops both runs, saves both lanes' work as snapshots, removes both worktrees and moves the task back to `Ready`.
- **Acceptance criteria:**
  - After start, `git worktree list` shows two new worktrees on branches ending `-claude` and `-codex`, both from the same commit of `main`.
  - A file written by one lane never shows up in the other lane's worktree.
  - Starting a race on a task that is already racing is refused.

### 5.2 Task stage during a race

The task stays **one card on the board** with a "Race" badge.

| What happens | Task stage |
|---|---|
| Race starts | `Ready` -> `Running` |
| Any lane asks a question | `Needs You` (stays there until **no** lane is waiting) |
| One lane ends, the other still works | stays `Running` (the ended lane's checks already run) |
| Both lanes ended | `Verifying` |
| Both lanes checked | stays `Verifying`; notification "Race ready: pick a winner" |
| I pick a winner | normal proof rule on the winner: all required checks green -> `Review`, else `Failed` |
| I cancel | back to `Ready` |

### 5.3 F9.2 Compare

- **What:** A **Compare** tab in the Task Room (and a CLI table). Two columns, one per lane: status, required checks, diff size (files, lines added / removed, tests added), time, cost, risk flags, the Proof Card, and the Change Story.
- **Why:** The pick should take minutes, not an hour of reading two diffs.
- **Example:**
  ```
  $ saarthi race compare T-0051
                        claude                  codex
  lane status           ready                   ready
  required checks       tests pass, lint pass   tests FAIL, lint pass
  files / added / gone  6 / +182 / -14          9 / +240 / -31
  tests added           4                       2
  time                  11m 20s                 8m 05s
  cost                  $0.62                   $0.41
  risk flags            migration               migration, new dependency
  Change Story          saarthi review T-0051 --lane claude | --lane codex
  ```
  In the UI: each column shows the Proof Card and Change Story components I already know from M4 and M5. The better number in each row is bold (green checks, fewer lines, less time, less cost).
- **Rules:**
  - A lane's Change Story is made right after that lane's checks finish.
  - Compare opens as soon as one lane is ready; the other column shows "still working" with live status.
  - A lane whose run failed shows the error and has no Pick button.
- **Acceptance criteria:**
  - All numbers match `saarthi proof T-0051 --lane <lane>` and the lane's runs.
  - Both Change Stories open side by side and scroll on their own.

### 5.4 F9.3 Pick winner

- **What:** Pick one lane. Its branch, worktree and port become the task's. The other lane's work is saved as a snapshot, its worktree is removed, and its branch is deleted if it has no commits of its own.
- **Why:** The task goes on with the normal flow (review, ship) on one branch.
- **Example:**
  ```
  $ saarthi race pick T-0051 claude
  Winner: claude. Task branch is now saarthi/T-0051-add-csv-export-claude.
  codex work saved at refs/saarthi/race/T-0051/codex; worktree removed; branch deleted.
  T-0051: Verifying -> Review. Review time: 1m 42s.
  ```
- **Rules:**
  - Only a lane that is `ready` (run ended and checks done) can win.
  - If the other lane is still running, picking stops it first (I am asked to confirm; `--yes` skips the question).
  - The winner's branch keeps its `-claude` / `-codex` name. The PR will use it.
  - Nothing is lost: the loser snapshot can be checked out with `git checkout refs/saarthi/race/T-0051/codex -- .` in any worktree.
  - "Review time" = time from "Race ready" to the pick. It is shown and saved.
- **Acceptance criteria:**
  - After the pick, `saarthi task show T-0051` shows the winner's branch and worktree.
  - `git worktree list` no longer shows the loser. `git show refs/saarthi/race/T-0051/codex --stat` shows the loser's changed files.
  - Proof, Change Story and Ship now use the winner only.

### 5.5 F6.7 Ports per workspace

- **What:** Every workspace (normal task or race lane) gets its own block of 10 ports, for example 41010-41019. Saarthi sets `SAARTHI_PORT=41010` (and `PORT=41010` by default) for the agent, the setup script, the checks and the Saarthi terminal of that workspace. The Context Pack tells the agent the port.
- **Why:** Two lanes that both run `npm run dev` on port 3000 break each other.
- **Example:**
  ```
  $ saarthi task show T-0051
  workspace  ~/.local/share/saarthi/worktrees/acme-api/T-0051-claude
  branch     saarthi/T-0051-add-csv-export-claude
  ports      41010-41019 (SAARTHI_PORT=41010)
  ```
- **Rules:**
  - The block stays the same while the workspace exists, also after a daemon restart.
  - The block is freed when the worktree is removed.
  - A block is skipped if its first port is already in use on the machine.
  - Projects pick which env names to set in `project.toml` (`[ports] env`). The project's own scripts must read the variable; Saarthi cannot change hard-coded ports.
  - Workspaces made before M7 get a block the next time a run, check or terminal starts there.
- **Acceptance criteria:**
  - Two lanes of one race get different blocks.
  - `echo $SAARTHI_PORT` in the Saarthi terminal of a workspace prints its port.
  - After removing a worktree, its block is given to the next new workspace.

### 5.6 "Running now" strip

- **What:** A row at the top of the Task Board with one small card per active run (queued, running, needs input) in this project: task id, lane, agent icon, status, time, cost so far, and the last action ("Edit app/export/csv.py").
- **Why:** With 3-4 agents running, I want one glance to know who is doing what and who needs me (FSD flow 6.2).
- **Example:**
  ```
  $ saarthi run list --active
  task    lane    agent   status       time    cost   last action
  T-0051  claude  claude  running      04:12   $0.21  Edit app/export/csv.py
  T-0051  codex   codex   needs_input  03:55   $0.18  asks: "Add pandas as a dependency?"
  T-0048  -       claude  running      12:40   $0.55  Bash: uv run pytest -q
  ```
  In the UI: clicking a card opens that task's Task Room on that lane's Stream tab. `Needs input` cards glow and come first.
- **Rules:** Updates live, at most once per second per card. The strip hides when nothing is running.
- **Acceptance criteria:** A new run shows in the strip within 1 second of `run.started`. A finished run leaves the strip within 1 second of `run.finished`.

## 6. Main user flow

1. Task T-0051 is `Ready` with a good brief. Click **Race**, pick "Plan first, then build", start.
2. The strip shows two cards for T-0051. Codex asks "Add pandas?" -> the task glows `Needs You`. Answer "no, use the csv module".
3. Codex ends first. Its checks run. Claude ends 3 minutes later. Its checks run.
4. Notification: "T-0051 race ready: pick a winner". Open **Compare**.
5. Claude: all green, 6 files. Codex: one test fails. Skim both Change Stories.
6. Click **Pick Claude**. The task moves to `Review`. Go on with Second Opinion and Ship as usual.

## 7. Done when

- [ ] I race one real task and pick the winner with under 2 minutes of review ("Review time" shown by `saarthi race status`).
- [ ] Two lanes run a dev server at the same time on their own ports with no clash.
- [ ] The loser's work can be read back from its snapshot ref.
- [ ] The board shows the running-now strip with live status.
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run pyright` pass.

## 8. Out of scope

| Item | Owner |
|---|---|
| More than 2 lanes, or the same agent twice | Later |
| Racing plan / fix / research modes | Later |
| Fix with agent or Second Opinion inside a lane before the pick | Later |
| Merging parts of both lanes | Later (do it by hand from the snapshot) |
| Budget alert for expensive races (F16.3) | M8 |
| Showing loser snapshots in the checkpoints list / rewind | M8 decides |
| Shortcut for Race / Compare | M9 |

## 9. QA checklist

1. Task in `Inbox` -> `saarthi race start` refused ("task must be Ready").
2. Ready task with a dirty worktree -> refused ("race needs a clean start").
3. Ready task, clean -> race starts; two worktrees, two branches, same base commit (`git merge-base` both = `main` tip).
4. While racing: `saarthi run T-0051 --agent claude --mode build` -> refused; `saarthi ship T-0051` -> refused.
5. Make one lane ask a question -> task in `Needs You`; answer it while the other lane is still running -> task back to `Running`.
6. After both lanes end -> `Verifying`; after both checks -> notification, `saarthi race compare` filled.
7. `saarthi race pick T-0051 codex` while codex is still running -> refused (not ready).
8. Pick the green lane -> task `Review`, loser worktree gone, snapshot ref exists, ports of the loser free.
9. Pick a red lane on another race -> task `Failed`; "Fix with agent" works on the winner branch.
10. Cancel a running race -> both runs stopped, both snapshots exist, task `Ready`, `saarthi race start` works again.
11. Kill the daemon during a race, restart -> lane runs `interrupted`; `saarthi run resume <run>` continues each lane in its own worktree.
12. In each lane's Saarthi terminal, `echo $SAARTHI_PORT` -> two different values.
13. Start a non-race run on another task -> it shows in the strip; it leaves the strip when it ends.

## 10. Open questions

1. **One task, two runs.** Follows core FSD Q3 default. The board shows one card. OK?
2. **Loser branch is deleted** (when it has no commits of its own); the work stays in the snapshot ref. Keep the branch instead?
3. **New stage moves for "cancel race"** (`Running`, `Needs You`, `Verifying`, `Failed` -> `Ready`). Core TDD section 7 has no such move today.
4. **New `race.*` events.** The ownership map in `../README.md` lists no event group for M7; TDD adds one.
5. **F6.7 is "Later" in the core FSD** but MILESTONES.md builds it in M7. This doc follows MILESTONES.md (same as known gap 3).
6. **`PORT` is set by default.** Some tools read `PORT` and may change behaviour. Default only `SAARTHI_PORT` instead?
7. **Known gap 4** (two worktrees, one `worktree_path`) is solved in the TDD with a `race_lanes` table. The owner should confirm.

## 11. Effort

About **10 hours**. See TDD section 16.

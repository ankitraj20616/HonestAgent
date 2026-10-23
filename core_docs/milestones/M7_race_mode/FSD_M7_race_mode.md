# FSD — M7: Side by side (Race Mode) + Gemini CLI + parallel polish

**Document type:** Functional Specification Document (FSD)
**Milestone:** M7 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`): Race is "Side by side", any two agents, Gemini CLI added (F5.1), running agents are Working rows on Home (no strip)
**Estimated effort:** 15 hours (about 1.5 weeks at ~10 h/week)
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M7_race_mode.md`, `../../FUNCTIONAL_SPECIFICATIONS.md` (F5.1, F6.7, F9, Q3), `../../TDD-tech-design-doc.md` (4.4, 4.5, 5.2, 7), `../M6_research_memory_playbooks/FSD_M6_research_memory_playbooks.md` (before), `../M8_safety_cost_rewind/FSD_M8_safety_cost_rewind.md` (after)
**Screens:** prototype views `raceRunning`, `race`, `settingsAgents` (Gemini row) in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. What this document covers

M7 lets me give **one goal to two agents at the same time** and keep the better result. On screen this is called **Side by side**; the engine and the CLI call it a **race**. M7 also adds **Gemini CLI** as the third agent, and makes parallel work smoother.

F-numbers owned (from `../README.md`, ownership map):

- **F9.1** Race (Side by side), **F9.2** Compare, **F9.3** Pick winner ("Keep ...'s version").
- **F5.1** Gemini CLI as an agent (Claude Code and Codex came in M2).
- **F6.7** Ports per workspace.
- **Live Working rows:** every running agent shows as a Working row on Home with its last action (this replaces the old "running now" strip).

"Claude" in a label means the agent that runs the task. With Codex or Gemini, the label uses that name.

## 2. The goal in plain words

For a hard task, I do not know which agent will do it better. Today I would run one, wait, maybe run the other, and compare by hand.

At the end of M7 I can:

1. Start a To do task **Side by side**. Two agents (for example Claude and Codex) each work in their own copy of the repo.
2. When both are done and checked, open the side-by-side view: two verdicts, tests and checks, diff size, cost, time and "What changed", next to each other.
3. Click **Keep Claude's version** (or the other one). That side's branch becomes the task's branch. The other copy is removed, but its work is saved in git.
4. Run two dev servers at once without "port already in use".
5. See every running agent as a Working row on Home, with what it is doing now.
6. Pick **Gemini CLI** as the agent of any task, or as one side of a Side by side.

## 3. Where this milestone sits

- **Before:** M2 runs Claude and Codex in worktrees. M4 makes Proof Cards (tests and checks, verdict). M5 makes Change Stories (What changed) and ships. M6 builds the Context Pack and saved instructions.
- **M7 adds:** a second workspace for one task, a compare view, ports, and the Gemini adapter.
- **Unlocks next:** M8 adds cost budgets (Side by side costs twice) and Restore (rewind). M8's per-agent permission flags must cover Gemini too.

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Race** | One task, one goal, two agents working at the same time. On screen: **Side by side**. |
| **Lane** | One side of a race: one agent, its own branch, copy of the repo and port. Named after the agent (`claude`, `codex`, `gemini`). |
| **Compare** | The side-by-side view on the Task page (`race`) that shows both lanes next to each other. |
| **Winner** | The lane I keep ("Keep Claude's version"). Its branch becomes the task's branch. |
| **Loser snapshot** | A hidden git ref that keeps the other lane's files after its copy is removed. |
| **Port block** | 10 port numbers that belong to one workspace (for example 41010-41019). |
| **Working row** | One row in the Working group on Home. In M7 it shows the agent's last action live. |
| **Gemini CLI** | Google's coding agent for the terminal (`gemini`). Saarthi runs it with `gemini -p` (headless: no chat window) and reads its JSON output. |

## 5. Features

### 5.1 F9.1 Race (Side by side)

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
  In the UI: New task -> More options -> **Side by side** -> pick the two agents (Claude and Codex by default) and saved instructions -> **Start**. A To do Task page has the same choice under More options next to Start. While both work, the Task page shows the `raceRunning` view: one column per agent with its live Activity.
- **Rules:**
  - One task, two runs (core FSD Q3 default). The race is **not** two tasks.
  - The task must be in `Ready` (To do with a goal). Default agents: Claude and Codex (from `project.toml`). Any two **different** agents work: Claude Code, Codex, Gemini CLI.
  - Only `build` mode can race.
  - If the task already has a worktree with changes, the race is refused ("race needs a clean start"). A clean worktree from a plan run is removed and replaced by the two lane worktrees.
  - Both lanes get the same Context Pack (goal, research, memory, saved instructions). Only the port line differs.
  - A race uses two of the "max parallel runs" slots. If only one is free, the second lane waits in the queue. Lane time counts from its own start, so waiting is not unfair.
  - During a race these actions are blocked with "pick a winner first": a normal start, Let Claude fix it, Ask Codex to review, review comments, Update from main, Approve and create pull request.
  - I can stop one lane (`saarthi run stop <run>`). That lane then cannot win.
  - **Cancel** (Side by side -> Cancel, or `saarthi race cancel`) stops both runs, saves both lanes' work as snapshots, removes both worktrees and moves the task back to `Ready`.
- **Acceptance criteria:**
  - After start, `git worktree list` shows two new worktrees on branches ending with the two agent names (`-claude` and `-codex`), both from the same commit of `main`.
  - A race of Claude and Gemini works the same way: branches end `-claude` and `-gemini`.
  - A file written by one lane never shows up in the other lane's worktree.
  - Starting a race on a task that is already racing is refused.
  - Picking the same agent twice is refused.

### 5.2 Task stage during a race

The task stays **one row on Home** (and one card on the Board view) with a "Side by side" tag. The engine stage still moves as below; the screen shows the matching status (F2.9).

| What happens | Task stage | Status on screen |
|---|---|---|
| Race starts | `Ready` -> `Running` | Working |
| Any lane asks a question | `Needs You` (stays there until **no** lane is waiting) | Needs you |
| One lane ends, the other still works | stays `Running` (the ended lane's checks already run) | Working |
| Both lanes ended | `Verifying` | Working |
| Both lanes checked | stays `Verifying`; notification "Side by side ready: pick one to keep" | Needs you ("Pick one to keep") |
| I keep one | normal proof rule on the winner: all required checks green -> `Review`, else `Failed` | Needs you |
| I cancel | back to `Ready` | To do |

### 5.3 F9.2 Compare

- **What:** The side-by-side view on the Task page (`race`), and a CLI table. Two columns, one per lane: status, verdict, required checks, diff size (files, lines added / removed, tests added), time, cost, risk tags, and "What changed".
- **Why:** The pick should take minutes, not an hour of reading two diffs.
- **Example:**
  ```
  $ saarthi race compare T-0051
                        claude                  codex
  lane status           ready                   ready
  verdict               Looks good              Has problems
  required checks       tests pass, lint pass   tests FAIL, lint pass
  files / added / gone  6 / +182 / -14          9 / +240 / -31
  tests added           4                       2
  time                  11m 20s                 8m 05s
  cost                  $0.62                   $0.41
  risk tags             migration               migration, new dependency
  What changed          saarthi review T-0051 --lane claude | --lane codex
  ```
  In the UI: each column shows the verdict, the tests and checks list, and the "What changed" groups I already know from Check and ship (M4 and M5). The better number in each row is bold (green checks, fewer lines, less time, less cost). The view says: "Pick the one to keep. The other's work is saved, nothing is lost."
- **Rules:**
  - A lane's Change Story (What changed) is made right after that lane's checks finish.
  - The view opens as soon as one lane is ready; the other column shows "still working" with live status.
  - A lane whose run failed shows the error and has no Keep button.
- **Acceptance criteria:**
  - All numbers match `saarthi proof T-0051 --lane <lane>` and the lane's runs.
  - Both "What changed" lists open side by side and scroll on their own.

### 5.4 F9.3 Pick winner ("Keep ...'s version")

- **What:** Keep one lane. Its branch, worktree and port become the task's. The other lane's work is saved as a snapshot, its worktree is removed, and its branch is deleted if it has no commits of its own.
- **Why:** The task goes on with the normal flow (Check and ship) on one branch.
- **Example:**
  ```
  $ saarthi race pick T-0051 claude
  Winner: claude. Task branch is now saarthi/T-0051-add-csv-export-claude.
  codex work saved at refs/saarthi/race/T-0051/codex; worktree removed; branch deleted.
  T-0051: Verifying -> Review. Review time: 1m 42s.
  ```
  In the UI: **Keep Claude's version** (or **Keep Codex's version**) under each column.
- **Rules:**
  - Only a lane that is `ready` (run ended and checks done) can win.
  - If the other lane is still running, keeping one stops the other first (I am asked to confirm; `--yes` skips the question).
  - The winner's branch keeps its agent name (`-claude`, `-codex`, `-gemini`). The PR will use it.
  - Nothing is lost: the loser snapshot can be checked out with `git checkout refs/saarthi/race/T-0051/codex -- .` in any worktree.
  - "Review time" = time from "Side by side ready" to the pick. It is shown and saved.
- **Acceptance criteria:**
  - After the pick, `saarthi task show T-0051` shows the winner's branch and worktree.
  - `git worktree list` no longer shows the loser. `git show refs/saarthi/race/T-0051/codex --stat` shows the loser's changed files.
  - Check and ship (proof, What changed, ship) now uses the winner only.

### 5.5 F6.7 Ports per workspace

- **What:** Every workspace (normal task or race lane) gets its own block of 10 ports, for example 41010-41019. Saarthi sets `SAARTHI_PORT=41010` (and `PORT=41010` by default) for the agent, the setup script, the checks and the Terminal (More -> Terminal) of that workspace. The Context Pack tells the agent the port. The block shows in More -> Details.
- **Why:** Two lanes that both run `npm run dev` on port 3000 break each other.
- **Example:**
  ```
  $ saarthi task show T-0051
  workspace  ~/.local/share/saarthi/worktrees/acme-api/T-0051-claude
  branch     saarthi/T-0051-add-csv-export-claude
  ports      41010-41019 (SAARTHI_PORT=41010)
  ```
- **Rules:**
  - The block stays the same while the workspace exists, also after a background service restart.
  - The block is freed when the worktree is removed.
  - A block is skipped if its first port is already in use on the machine.
  - Projects pick which env names to set in `project.toml` (`[ports] env`). The project's own scripts must read the variable; Saarthi cannot change hard-coded ports.
  - Workspaces made before M7 get a block the next time a run, check or terminal starts there.
- **Acceptance criteria:**
  - Two lanes of one race get different blocks.
  - `echo $SAARTHI_PORT` in the Terminal of a workspace prints its port.
  - After removing a worktree, its block is given to the next new workspace.

### 5.6 Live Working rows (was the "running now" strip)

- **What:** On Home, every task with an active run (queued, running) is a **Working** row; a run that waits for an answer puts its task in **Needs you** (M3). In M7 each row also shows, live: agent, time, cost so far, and the last action ("Edit app/export/csv.py"). A Side by side task shows one row with both agents. The rows cover the selected project, or every project under **All projects**.
- **Why:** With 3-4 agents running, I want one glance to know who is doing what and who needs me (FSD flow 6.2). There is no separate strip or dock (Simple UI decision D1).
- **Example:**
  ```
  $ saarthi run list --active
  task    lane    agent   status       time    cost   last action
  T-0051  claude  claude  running      04:12   $0.21  Edit app/export/csv.py
  T-0051  codex   codex   needs_input  03:55   $0.18  asks: "Add pandas as a dependency?"
  T-0048  -       gemini  running      12:40   $0.55  Shell: uv run pytest -q
  ```
  In the UI: clicking a row opens that task's Task page on the Activity tab (for a Side by side task, on that lane's column).
- **Rules:** Updates live, at most once per second per row. `saarthi run list --active` shows the current project; `--all` shows every project.
- **Acceptance criteria:** A new run shows its last action on its Working row within 1 second of `run.started`. A finished run's row stops showing it within 1 second of `run.finished`.

### 5.7 F5.1 Gemini CLI agent

- **What:** Saarthi can drive **Gemini CLI** (`gemini`) the same way it drives Claude Code and Codex. I pick it in the agent picker of New task, in Side by side, in saved instructions (`default_agent = "gemini"`), or with `--agent gemini` in the CLI. Settings -> Agents (`settingsAgents`) shows a Gemini row: path, found or not, version, signed in or not.
- **Why:** Some tasks suit another model. Side by side is more useful with a third choice. The Agent Adapter design says a new agent must not change the core (Simple UI rule P5).
- **Example:**
  ```
  $ saarthi run T-0053 --agent gemini --mode build
  Started run 01JC5C2D9E (gemini, build) for T-0053 "Add CSV import"
  10:12:03  msg   Reading .saarthi/context/TASK.md
  10:12:09  tool  Edit app/import/csv.py
  10:14:40  done  exit 0, 2m 37s, 41k tokens
  ```
- **Rules:**
  - Saarthi runs Gemini **headless**: `gemini -p <prompt>` with JSON output, in the task's worktree. The exact flags (output format, read-only and edit modes, resume) are checked in a small **M7 spike** before the adapter is built, and written in an ADR.
  - It uses my own Gemini login or API key. Saarthi does not store it.
  - Every line Saarthi does not understand is saved as a raw event and shown in Activity. Nothing is dropped.
  - `plan` and `research` runs with Gemini must be read-only, like the other agents. If the spike finds no safe read-only mode, Gemini is not offered for those modes (Saarthi says why).
  - If Gemini cannot take an answer in the middle of a run or resume a session, "Claude has a question" for a Gemini run works the way the spike decides (TDD Decision 13). The UI still shows it as **Needs you**.
  - If the CLI gives tokens but no cost, Saarthi saves the tokens and shows cost as "unknown".
  - Claude stays the default agent.
- **Acceptance criteria:**
  - `saarthi run <task> --agent gemini --mode build` changes files in the task worktree and ends with the task in `Verifying`, like a Claude run.
  - A Gemini `research` run leaves `git status` clean.
  - An unknown JSON line from Gemini becomes a raw event in Activity; the run goes on.
  - With `gemini` not on PATH, Settings -> Agents and Health show the Gemini row red with the fix text; starting a Gemini run is refused before any worktree is made.
  - A Side by side of Claude and Gemini runs, compares and picks like Claude and Codex.
  - All Gemini tests use `FakeAdapter` and recorded fixtures; no test calls the real `gemini`.

## 6. Main user flow

1. Task T-0051 is To do with a good goal. Open it -> More options -> **Side by side**, pick saved instructions "Plan first, then build", Start.
2. Home shows one Working row for T-0051 with both agents. Codex asks "Add pandas?" -> the task moves to **Needs you** and the Needs-you pill glows. Answer "no, use the csv module".
3. Codex ends first. Its checks run. Claude ends 3 minutes later. Its checks run.
4. Notification: "T-0051 side by side ready: pick one to keep". Open the side-by-side view.
5. Claude: Looks good, 6 files. Codex: Has problems, one test fails. Skim both "What changed" lists.
6. Click **Keep Claude's version**. The task moves to Check and ship (`Review`). Go on with Ask Codex to review and Approve and create pull request as usual.

## 7. Done when

- [ ] I race one real task and pick the winner with under 2 minutes of review ("Review time" shown by `saarthi race status`).
- [ ] Two lanes run a dev server at the same time on their own ports with no clash.
- [ ] The loser's work can be read back from its snapshot ref.
- [ ] Home shows running agents as Working rows with their live last action.
- [ ] One real task is built by Gemini CLI from start to Check and ship, and one Side by side uses Gemini as a lane.
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run pyright` pass.

## 8. Out of scope

| Item | Owner |
|---|---|
| More than 2 lanes, or the same agent twice | Later |
| Racing plan / fix / research modes | Later |
| Let Claude fix it or Ask Codex to review inside a lane before the pick | Later |
| Merging parts of both lanes | Later (do it by hand from the snapshot) |
| Gemini as the "Ask ... to review" second-opinion agent | Later (M5 uses Codex) |
| Gemini permission profiles and sandbox per OS | M8 (its `permission_args`) |
| Budget alert for expensive races (F16.3) | M8 |
| Showing loser snapshots in History / Restore | M8 decides |
| Shortcut for Side by side / compare | M9 |

## 9. QA checklist

1. Task in `Inbox` -> `saarthi race start` refused ("task must be Ready").
2. Ready task with a dirty worktree -> refused ("race needs a clean start").
3. Ready task, clean -> race starts; two worktrees, two branches, same base commit (`git merge-base` both = `main` tip).
4. While racing: `saarthi run T-0051 --agent claude --mode build` -> refused; `saarthi ship T-0051` -> refused.
5. Make one lane ask a question -> task in `Needs You`; answer it while the other lane is still running -> task back to `Running`.
6. After both lanes end -> `Verifying`; after both checks -> notification, `saarthi race compare` filled.
7. `saarthi race pick T-0051 codex` while codex is still running -> refused (not ready).
8. Pick the green lane -> task `Review`, loser worktree gone, snapshot ref exists, ports of the loser free.
9. Pick a red lane on another race -> task `Failed`; "Let Claude fix it" works on the winner branch.
10. Cancel a running race -> both runs stopped, both snapshots exist, task `Ready`, `saarthi race start` works again.
11. Kill the background service during a race, restart -> lane runs `interrupted`; `saarthi run resume <run>` continues each lane in its own worktree.
12. In each lane's Terminal, `echo $SAARTHI_PORT` -> two different values.
13. Start a non-race run on another task -> its Working row shows the last action; the row leaves Working when it ends.
14. `saarthi race start T-0052 --agents claude,gemini` -> branches end `-claude` and `-gemini`; `--agents gemini,gemini` -> refused.
15. `saarthi run T-0053 --agent gemini --mode research` -> finding saved, worktree clean. Rename `gemini` on PATH -> Settings -> Agents shows it red; `--agent gemini` refused.

## 10. Open questions

1. **One task, two runs.** Follows core FSD Q3 default. Home shows one row. OK?
2. **Loser branch is deleted** (when it has no commits of its own); the work stays in the snapshot ref. Keep the branch instead?
3. **New stage moves for "cancel race"** (`Running`, `Needs You`, `Verifying`, `Failed` -> `Ready`). Core TDD section 7 has no such move today.
4. **New `race.*` events.** The ownership map in `../README.md` lists no event group for M7; TDD adds one.
5. **F6.7 is "Later" in the core FSD** but MILESTONES.md builds it in M7. This doc follows MILESTONES.md (same as known gap 3).
6. **`PORT` is set by default.** Some tools read `PORT` and may change behaviour. Default only `SAARTHI_PORT` instead?
7. **Known gap 4** (two worktrees, one `worktree_path`) is solved in the TDD with a `race_lanes` table. The owner should confirm.
8. **Gemini flags are not known yet.** The spike (TDD Decision 12) may show that Gemini has no live input, no resume or no safe read-only mode. Then Gemini gets fewer modes in M7, and the doc is updated with the ADR.
9. **"Pick one to keep" counts as Needs you** while the stage is still `Verifying`. The M3 status function (F2.9) then needs one extra input (race ready), like the Jira write-back and conflict cases. OK?
10. **Default lanes stay Claude + Codex.** Should Gemini be a default lane when Codex is not installed?

## 11. Effort

About **15 hours** (was 10): 10 h for Side by side, ports and live Working rows, plus about 5 h for Gemini (spike 1.5 h, adapter + fixtures + Settings row 3.5 h). See TDD section 16.

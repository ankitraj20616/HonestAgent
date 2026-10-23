# TDD — M7: Side by side (Race Mode) + Gemini CLI + parallel polish

**Document type:** Technical Design Document (TDD)
**Milestone:** M7 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`): Side by side with any two agents, `GeminiAdapter` + spike (Decisions 12-13), live Working rows on Home instead of the strip, desktop files renamed
**Estimated effort:** 15 hours (about 1.5 weeks at ~10 h/week)
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. Every decision says *why*.
**Related documents:** `FSD_M7_race_mode.md`, `../../TDD-tech-design-doc.md` (4.3, 4.4, 4.5, 4.6, 4.7, 5.2, 5.5, 7, 8.6), `../M6_research_memory_playbooks/TDD_M6_research_memory_playbooks.md` (before), `../M8_safety_cost_rewind/TDD_M8_safety_cost_rewind.md` (after), `../M0_spike_skeleton/TDD_M0_spike_skeleton.md` (spike pattern), `../M2_agent_runs_worktrees/TDD_M2_agent_runs_worktrees.md` (adapter protocol)
**Screens:** prototype views `raceRunning`, `race`, `settingsAgents` (Gemini row) in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. The goal in one sentence

Let one task hold two short-lived workspaces ("lanes") during a race ("Side by side" on screen), with the smallest change to the M2-M5 code that assumes one workspace per task; give every workspace its own port block; and add Gemini CLI as a third agent behind `AgentAdapter`, with no change to the core.

## 2. Read this first — rules this work must not break

From `CLAUDE.md`:

1. **All logic in the daemon** (rule 1). Lane status, compare numbers, verdicts and "best value" flags are computed in the daemon; the side-by-side view only renders them.
2. **CLI first** (rule 2). `saarthi race ...` and `saarthi run list --active` come before the screens.
3. **Agents only through `AgentAdapter`** (rule 3). A race is two normal runs. No agent-specific race code. Every `gemini` string and flag lives in `agents/gemini/` (and its config keys).
4. **Every action is an event** (rule 4). New `race.*` events in section 7. Unknown Gemini lines become `raw` events, never dropped.
5. **Stage rules in one table** (rule 5). The new cancel moves are rows in `ALLOWED_MOVES`; the race hooks never set `stage` directly.
6. **Git as a list of args, never push to the default branch** (rule 6). Unchanged; the winner ships through M5.
7. **No hard-coded values** (rule 7). Port range, block size, branch / ref templates in `config.py` / `project.toml`.
8. **Tests first with `FakeAdapter`** (rule 8). Gemini tests replay recorded fixtures; they never call the real `gemini`.

## 3. What already exists (do not rebuild)

| Thing | Built in | Used how |
|---|---|---|
| `tasks.branch`, `tasks.worktree_path` | M1 schema, M2 fills | Still the task's **one** workspace outside a race; set to the winner after a pick. |
| Workspace Manager: `create_worktree`, `run_setup_script`, `status`, `diff`, `checkpoint`, `remove_worktree` | M2 / M5 | Take a workspace target instead of reading the task (Decision 2). |
| Checkpoint method (temp index + `commit-tree`, hidden ref) | M2 | Reused for the loser snapshot with another ref name. |
| Run Manager, queue, max parallel, needs-input flow, restart -> `interrupted` + resume | M2 | Lanes are normal runs with `race_lane_id`. |
| Check Runner, Proof Card per `run_id`, auto-run after build | M4 | Runs in the lane's worktree; stage moves delegated during a race. |
| Review Builder, Change Story per `run_id` | M5 | Called per lane after the lane's checks. |
| Context Pack v1 + playbooks | M6 | Same pack for both lanes, plus a port line. |
| Verdict function, Check and ship parts (verdict, checks list, What changed groups) | M4 / M5 | Reused in the side-by-side view (`race`). |
| `AgentAdapter` protocol, `Capabilities`, `agents/registry.py`, mapper + adapter split, `FakeAdapter`, fake binaries in `tests/fixtures/bin/` | M2 | `GeminiAdapter` is one more adapter (Decision 13). |
| Spike recorder `scripts/spikes/_common.py`, ADR-001 | M0 | Reused for the Gemini spike (Decision 12). |
| Home groups (Working / Needs you), All projects, one WebSocket subscription for all projects; Settings -> Agents and Health rows per agent | M3 | Working rows get live last action (Decision 11); a Gemini row is added. |

## 4. Technical decisions

### Decision 1 — A small `race_lanes` table, not a general `workspaces` table (new)

During a race, each lane's branch, worktree and port live in a `race_lanes` row. `tasks.branch` / `tasks.worktree_path` stay empty until the pick, then take the winner's values. `runs.race_lane_id` links a run to its lane. `tasks.race_id` marks "racing now".

**Why:** outside a race (almost all tasks) nothing changes, and no data needs moving. A general `workspaces` table would be cleaner long-term but would touch every M2-M5 query that reads `tasks.worktree_path` and need a data migration. If "more than 2 lanes" or "many workspaces per task" ever comes (Later), `race_lanes` can grow into that table.

### Decision 2 — One resolver for "which workspace?" (new)

`workspace/resolve.py`:

```python
@dataclass(frozen=True)
class WorkspaceRef:
    branch: str
    path: Path
    port: int | None
    lane: str | None          # None outside a race

def workspace_for(task: Task, run: Run | None = None, lane: str | None = None) -> WorkspaceRef: ...
```

Order: `run.race_lane_id` -> that lane; else `lane` arg -> that lane of the active race; else the task's own fields. If the task is racing and none of these is given -> `RaceInProgress` error (409).

Call sites switched to it (each one line): Run Manager start + resume; Context Pack writer; Check Runner; Review Builder diff; `GET /tasks/{id}/workspace`; `status` / `diff`; the PTY "terminal here"; M5 ship and sync (they get the 409 during a race). **Why:** one function decides, so a lane run can never write into the other lane by accident, and the M2-M5 code stays almost unchanged.

### Decision 3 — Lane naming and a shared base commit (new)

- Lane key = agent name (`claude`, `codex`, `gemini`). Exactly `RACE_LANE_COUNT = 2` lanes, distinct agents. Any agent in the registry whose `check_ready()` passes may race.
- Branch: `RACE_BRANCH_TEMPLATE = "saarthi/{task_id}-{slug}-{lane}"` -> `saarthi/T-0051-add-csv-export-claude`.
- Worktree: `<worktree_root>/<project>/{task_id}-{lane}`.
- Both lanes branch from the same `base_commit` (`git rev-parse <default_branch>` once, at race start), saved on each lane row.
- The winner's branch is **not** renamed after the pick.

**Why:** names show the agent in `git branch` and in the PR. One base commit makes the two diffs fair to compare. Renaming a branch that has a worktree and maybe a remote is fiddly and gains little.

### Decision 4 — Stage during a race: one task, two runs (core FSD Q3)

The race hooks live in `core/race.py`. M2 and M4 code calls them when `task.race_id` is set, instead of doing their own stage moves:

| M2 / M4 event | Normal behaviour | During a race (`core/race.py`) |
|---|---|---|
| Run start | `Ready -> Running` | Once, at race start. |
| `agent.needs_input` | `Running -> Needs You` | Same. |
| Answer sent | `Needs You -> Running` | Only when **no** run of the task is `needs_input` (new "any run" rule; harmless outside a race). |
| Build run ends | `Running -> Verifying`, start checks | Lane -> `checking`, start checks for that lane; `Running -> Verifying` only when no lane run is active. |
| Run fails / stopped | `Running -> Failed` | Lane -> `failed`; no stage move while the other lane is alive. All lanes failed -> `Running -> Failed`. |
| Checks done | `Verifying -> Review / Failed` | Lane -> `ready`, build that lane's Change Story; when every lane is `ready` or `failed` -> `race.ready`. No stage move. |
| Pick winner | - | Call M4's normal proof rule on the winner: `Verifying -> Review` or `Verifying -> Failed`. |

**Why:** using only existing moves (plus cancel, Decision 5) keeps `ALLOWED_MOVES` honest. Holding the task in `Verifying` until the pick means the proof gate (F2.5) is applied to the branch that will actually ship.

**Status on screen (F2.9, new input):** while `race.ready` is the newest race event and no pick is made, M3's pure status function returns **Needs you** (row action "Pick one to keep") instead of Working. The task schema computes `race_ready: bool` and passes it into `status_for(stage, waiting_on_user=...)`, like the conflict (M5) and Jira write-back (M10) facts; the function does not change. The stage does not change. **Why:** the user must act; the Needs-you count must show it.

### Decision 5 — New `ALLOWED_MOVES` rows for "cancel race" (new)

`Running | Needs You | Verifying | Failed -> Ready`, rule: "race cancelled" (only allowed when `task.race_id` is set). **Why:** core TDD section 7 has no way back to `Ready` from `Verifying` or `Failed`. Cancel must return the task to a clean start, and the rule must live in the one table.

### Decision 6 — Checks, proof and Change Story are per lane by `run_id`; "latest" queries ignore losers (new)

No change to `check_results`, `proof_cards`, `change_stories`: they already have `run_id`, and the run knows its lane. Read endpoints get an optional `lane` query (`GET /tasks/{id}/proof?lane=codex`, `GET /tasks/{id}/review?lane=codex`, `GET /tasks/{id}/workspace?lane=codex`). During a race, a call without `lane` returns 409.

After the pick, M4/M5 "latest for this task" queries must skip rows from losing lanes. One helper, `core/runs.py: main_line_runs(task)` = runs with `race_lane_id IS NULL` or whose lane is `winner`. M4/M5 queries use it. **Why:** without it, a loser's newer Proof Card could unlock `Review` for the winner.

### Decision 7 — During a race only lane runs exist (new)

Refused with 409 "race in progress - pick a winner first": `POST /tasks/{id}/runs` (any mode, incl. research), fix runs ("Let Claude fix it"), `POST /tasks/{id}/checks` without `lane`, second opinion ("Ask Codex to review"), review comments / send / decision, `workspace/sync`, `ship`. Allowed: `run stop`, `run input`, `run resume` on lane runs, all reads. **Why:** fix rounds and findings are counted per task in M4/M5. Making them per lane is real work for little gain: the point of a race is comparing first attempts. Fixing happens after the pick on one branch.

### Decision 8 — The loser is snapshotted, its worktree removed, its branch deleted only if empty (new)

At the pick, for each losing lane: stop its run if active -> checkpoint its worktree with M2's method into `RACE_SNAPSHOT_REF_TEMPLATE = "refs/saarthi/race/{task_id}/{lane}"` -> `git worktree remove --force <path>` -> if `git rev-list --count <base_commit>..<branch>` is `0` and `[race] delete_loser_branch = true`, `git branch -D <branch>`; else keep it. Lane -> `loser`, `snapshot_ref` saved, port freed.

**Why:** agents do not commit (Saarthi commits on ship), so a loser branch usually points at `base_commit` and holds nothing; the work lives only as files in the worktree. The snapshot keeps it. A separate ref namespace keeps M8's checkpoint list (`refs/saarthi/checkpoints/...`) about the winner only.

### Decision 9 — Ports: a block of 10 per workspace, saved in the DB, given by env vars (F6.7, new)

- Range `PORT_RANGE_START = 41000` to `PORT_RANGE_END = 48999`, block size `PORT_BLOCK_SIZE = 10` (so `web` + `api` + `db` can use `SAARTHI_PORT + n`).
- `workspace/ports.py: allocate(session) -> int`: lowest block start not used by any `tasks.port` or active `race_lanes.port`, and whose first port can be bound on `127.0.0.1` right now. Saved on the row, so it survives restarts.
- Freed when the worktree is removed (`workspace.removed`), on pick (loser) and cancel.
- Set at `create_worktree`. Older workspaces get one lazily in `workspace_for()` when `port` is null.
- Env: every process started in a workspace (agent via `RunRequest.env`, setup script, checks, PTY terminal) gets each name in `[ports] env` (default `["SAARTHI_PORT", "PORT"]`) = block start. If `RunRequest` has no `env` field yet, add `env: dict[str, str] = {}` to it in `agents/base.py` (agent-neutral, both adapters pass it to the subprocess).
- The Context Pack header gets one line: `Ports: 41010-41019. Start dev servers on $SAARTHI_PORT.`

**Why:** a fixed number in the DB is simple and stable. The bind test only catches clashes with things outside Saarthi; between Saarthi workspaces the DB is the truth.

### Decision 10 — A `race.*` event group (new)

The ownership map lists no events for M7. Rule 4 needs the race actions recorded, and reusing `task.updated` would hide them in the timeline. Four types in section 7. `workspace.created` / `workspace.removed` (M2 / M5) get a `lane` and `port` field in their payload. The Notifier (M2) also listens to `race.ready`.

### Decision 11 — Live Working rows use one list endpoint + existing per-run subscriptions (new)

The Simple UI has no strip, dock or Wheel (spec D1): running agents are Working rows on Home. M7 only adds live detail to those rows.

`GET /runs/active?project_id=` (no `project_id` = all projects, for **All projects**) returns active runs with `project_id`, `task_id`, `task_title`, `lane`, `agent`, `status`, `started_at`, `cost_usd` so far, and `last_action` (summary of the newest `agent.tool_call`, `agent.needs_input` or `agent.message` of the run, one indexed query per run). Home groups them by task, so a Side by side task is one row with two agents. The UI subscribes to `run:<id>` for each active run (WebSocket from M1) and throttles redraws to `WORKING_ROW_THROTTLE_MS` (1,000 ms). It refetches the list on `run.started` / `run.finished` seen on M3's all-projects subscription. **Why:** no new WebSocket channel; at most "max parallel" (4-8) per-run subscriptions per project. If M3's Home list already returns running runs, extend it with `lane` and `last_action` instead of adding this endpoint.

### Decision 12 — A short Gemini spike before the adapter (new)

`scripts/spikes/spike_gemini.py`, built like the M0 spikes (Decision 1 there; same `_common.py` recorder and path cleaner, `--record` to save). It runs `gemini -p <prompt>` in a temp repo with JSON output and answers, in a **Gemini section of ADR-001**:

1. Which output flag gives one JSON event per line while the run goes on (expected `--output-format stream-json`), and what the final `json` result holds. Activity needs line-by-line events.
2. The flags for read-only (`plan`, `research`) and for "edit files in this folder" (`build`, `fix`), e.g. approval mode and sandbox flags.
3. Session id and resume: can a finished run be continued with an answer? Can stdin take input mid-run?
4. Where tokens (and cost, if any) appear.
5. The tested version, for the `check_ready()` warning.

Scenarios recorded into `tests/fixtures/agents/`: `gemini_build_ok.jsonl`, `gemini_ends_with_question.jsonl`, `gemini_fail.jsonl`, `gemini_research_ok.jsonl`; plus hand-made `gemini_unknown_lines.jsonl`.

**Why:** M0 did this for Claude and Codex, and it saved guesswork. Agent CLI flags change often. No adapter code is written before the facts are in the ADR. Budget: 1.5 h.

### Decision 13 — `GeminiAdapter` is one more adapter; capabilities come from the spike (new)

`agents/gemini/mapper.py` (pure: one raw line -> `list[AgentEvent]`, no I/O) and `agents/gemini/adapter.py` (owns the process), same split as Claude and Codex (M2 Decision 1). Registered in `agents/registry.py` as `gemini`.

- **Start:** `[GEMINI_BIN, "-p", <prompt>, *GEMINI_OUTPUT_ARGS, *mode args]` as a list of args, `cwd` = the workspace, `env` from `RunRequest.env` (ports, Decision 9). The prompt tells the agent to read `.saarthi/context/TASK.md` first, like the other adapters.
- **Mapping:** known JSON types -> `agent.message`, `agent.tool_call`, `agent.tool_result`, `agent.file_changed`, `agent.usage`, `agent.done`. Anything else, and any non-JSON line -> `raw` event (rule 4).
- **Mode args:** a small table in `config.py` (`GEMINI_MODE_ARGS`), filled from the spike, like M2 Decision 10 for Claude and Codex. M8 replaces it with `permission_args(policy)` on this adapter. If the spike finds no safe read-only mode, `GEMINI_MODE_ARGS` has no `plan` / `research` rows and the Run Manager refuses those modes for Gemini with a clear message.
- **Capabilities:** set from the spike. Expected: `live_input = False`, `structured = True`, `resumable` = what the spike shows. With `resumable = True`, Needs You path B (M2 Decision 3) works as for Codex. With `resumable = False`, an "ended with a question" Gemini run is closed as done and the answer starts a new run of the same mode with the answer in the Context Pack `extra` field. **Why:** the Run Manager already treats agents by capabilities, not names; no core change.
- **`RunResult`:** `session_id`, `exit_code`, `summary` (last message), `tokens_in` / `tokens_out`. `cost_usd = None` when the CLI does not give it (the UI shows "unknown"). `ended_with_question` uses the shared rule in `agents/common.py`.
- **`check_ready()`:** `gemini --version` found; signed in (the check the spike finds, e.g. a cheap call or the CLI's auth status); version warning if not `GEMINI_TESTED_VERSION`. Feeds Settings -> Agents and Health (M3) with no UI logic.

**Why:** one adapter folder, one registry line, config keys and fixtures. The core, the race code and the UI never name Gemini.

## 5. Modules and files

### Daemon (`daemon/src/saarthi/`)

| File | New / changed | What |
|---|---|---|
| `config.py` | changed | Section 10. |
| `core/race.py` | new | `start_race`, `on_needs_input_answered`, `on_lane_run_ended`, `on_lane_checks_done`, `pick_winner`, `cancel_race`, `compare(task)`. |
| `core/tasks.py` | changed (M1) | Cancel rows in `ALLOWED_MOVES`; "any run needs input" rule. |
| `core/runs.py` | changed (M2) | `race_lane_id` on start; call race hooks when `task.race_id`; `main_line_runs()`; 409 guard for non-lane runs. |
| `checks/runner.py` | changed (M4) | Workspace via `workspace_for(run=...)`; delegate stage move to `core/race.py` during a race; `lane` filter on reads. |
| `review/builder.py` | changed (M5) | Diff via `workspace_for`; `build_for_run(run_id)` callable by the race hook; `lane` filter on reads. |
| `workspace/resolve.py` | new | Decision 2. |
| `workspace/ports.py` | new | Decision 9. |
| `workspace/manager.py` | changed (M2) | Functions take a `WorkspaceRef`; `create_worktree(task, lane=None)`; `snapshot(ref_name)` wraps `checkpoint`. |
| `agents/base.py` | changed (M2) | `RunRequest.env` (if missing). |
| `agents/gemini/mapper.py`, `agents/gemini/adapter.py` | new | Decision 13. |
| `agents/registry.py` | changed (M2) | Register `gemini`. |
| `scripts/spikes/spike_gemini.py` | new | Decision 12 (not shipped; run by hand). |
| `core_docs/decisions/ADR-001-agent-integration.md` | changed (M0) | Gemini section from the spike. |
| `memory/context_pack.py` | changed (M6) | Port line; lane in header. |
| `db/models.py` | changed | `RaceLane`; `Run.race_lane_id`; `Task.race_id`, `Task.port`. |
| `db/migrations/versions/<rev>_m7_race_lanes_ports.py` | new | Section 6. |
| `schemas/race.py`, `schemas/runs.py` | new / changed | Pydantic models for race, compare, active runs. |
| `api/routes/race.py` | new | Race endpoints. |
| `api/routes/runs.py`, `checks.py`, `review.py`, `workspace.py` | changed | `lane` query, active list, 409 guards. |
| `cli/race.py` | new | `race start|status|compare|pick|cancel`. |
| `cli/run.py`, `cli/checks.py`, `cli/review.py` | changed | `run list --active [--all]`; `--lane` on `proof`, `checks`, `review`. |

### Desktop (`desktop/src/`)

| File | What |
|---|---|
| `screens/NewTask/MoreOptions.tsx` (M3) | **Side by side** option: two agent pickers (any ready agent, from the agent status the daemon already gives Settings -> Agents in M3), saved instructions, extra. Same option on the To do Task page. |
| `screens/TaskPage/SideBySide/RaceRunningView.tsx` | View `raceRunning`: one column per lane with live Activity and status; Cancel. |
| `screens/TaskPage/SideBySide/CompareView.tsx` | View `race`: two columns from `GET /tasks/{id}/race`; reuses the Check and ship parts (verdict, checks list, What changed groups, compact); "Keep <agent>'s version" / Cancel buttons. |
| `screens/TaskPage/SideBySide/LaneSwitch.tsx` | Lane toggle on Activity and More -> Terminal during a race. |
| `screens/Home/WorkingRow.tsx` (M3) | Live agent(s), time, cost, last action (Decision 11); "Side by side" tag. |
| `screens/Board/TaskCard.tsx` (M3) | "Side by side" tag. |
| `screens/Settings/Agents.tsx` (M3) | Gemini row (path, found, version, signed in), from the daemon's agent status. |
| `config.ts` | `WORKING_ROW_THROTTLE_MS`. |

## 6. Data model changes

Migration: `<rev>_m7_race_lanes_ports.py`.

**`race_lanes`** (new):

| Field | Type | Note |
|---|---|---|
| id | text PK | ULID |
| race_id | text | ULID shared by the lanes of one race |
| task_id | text FK | |
| lane | text | agent name |
| agent | text | `claude` / `codex` / `gemini` |
| branch | text | |
| worktree_path | text null | null after removal |
| port | int null | block start |
| base_commit | text | |
| status | text | `running` / `checking` / `ready` / `failed` / `winner` / `loser` / `cancelled` |
| snapshot_ref | text null | loser / cancelled |
| created_at, ended_at, decided_at | datetime | |

Unique (`race_id`, `lane`). Index (`task_id`).

**`runs`:** add `race_lane_id` text null, FK `race_lanes.id`.
**`tasks`:** add `race_id` text null (active race), `port` int null (block start, F6.7).

## 7. Events added

| Type | When | Payload |
|---|---|---|
| `race.started` | Both lanes created and runs queued | `{race_id, base_commit, playbook_id?, lanes: [{lane, agent, run_id, branch, port}]}` |
| `race.ready` | Every lane is `ready` or `failed` | `{race_id, lanes: [{lane, status, all_required_passed}]}` |
| `race.winner_picked` | Pick done | `{race_id, winner, losers: [{lane, snapshot_ref, branch_deleted}], review_seconds}` |
| `race.cancelled` | Cancel done | `{race_id, snapshots: [{lane, snapshot_ref}], reason?}` |

Changed payloads: `workspace.created`, `workspace.removed` gain `lane?` and `port`.

## 8. API and CLI added

### 8.1 REST (under `/api/v1`)

| Method | Path | Body / query | Response |
|---|---|---|---|
| POST | `/tasks/{id}/race` | `{agents?: [a, b], playbook_id?, extra?}` | 201 `{race_id, lanes[]}`; 409 not Ready / racing / dirty worktree / agent not ready; 422 unknown or same agent twice |
| GET | `/tasks/{id}/race` | - | Compare data: per lane `{lane, agent, status, verdict, run_ids, branch, port, seconds, cost_usd, files_changed, lines_added, lines_removed, tests_added, required_passed, risk_flags, proof_card_id, change_story_id}` + `best: {field: lane}` + `review_seconds?` |
| POST | `/tasks/{id}/race/winner` | `{lane, stop_others: bool}` | `{winner, losers[], stage}`; 409 lane not ready / others running without `stop_others` |
| POST | `/tasks/{id}/race/cancel` | `{reason?}` | `{snapshots[], stage}` |
| GET | `/tasks/{id}/proof`, `/review`, `/workspace` (changed) | `lane?` | as before, for that lane |
| POST | `/tasks/{id}/checks` (changed) | `lane?` | as before |
| GET | `/runs/active` | `project_id?` (none = all projects) | `[{run_id, project_id, task_id, task_title, lane?, agent, status, started_at, cost_usd, last_action}]` |

### 8.2 CLI

| Command | Output |
|---|---|
| `saarthi race start <task> [--agents claude,codex\|claude,gemini\|...] [--playbook P] [--extra T]` | lanes table (FSD 5.1) |
| `saarthi race status <task> [--json]` | lane statuses, stage, review time |
| `saarthi race compare <task> [--json]` | compare table (FSD 5.3) |
| `saarthi race pick <task> <lane> [--yes]` | pick result (FSD 5.4) |
| `saarthi race cancel <task> [--reason T]` | snapshots, new stage |
| `saarthi run list --active [--project P \| --all] [--json]` | active runs table (FSD 5.6) |
| `saarthi run <task> --agent gemini ...` (M2, unchanged) | as M2 |
| `saarthi proof <task> --lane L`, `saarthi checks <task> --lane L`, `saarthi review <task> --lane L` | as M4 / M5, for one lane |

## 9. Key flows

### 9.1 Start a race (`start_race`)
1. Check: stage `ready`; `task.race_id` is null; agents valid, distinct, `check_ready()` OK; mode `build`.
2. If `tasks.worktree_path` exists: clean and `ahead = 0` -> remove it, free its port, clear the task fields; else 409.
3. `base_commit = git rev-parse <default_branch>`; `race_id = ULID`.
4. Per lane: `create_worktree(task, lane)` from `base_commit`, allocate port, setup script, insert `race_lanes` row, `workspace.created`. If lane 2 fails, remove lane 1 (worktree + branch) and return the error.
5. Set `tasks.race_id`. Start one `build` run per lane through the Run Manager with `race_lane_id` (queue rules as usual).
6. `Ready -> Running`. Emit `race.started`.

### 9.2 Lane ends -> ready
1. `run.finished` (build) -> `on_lane_run_ended`: lane `checking`; Check Runner on `workspace_for(run)`.
2. If no lane run is active -> `Running -> Verifying`.
3. `proof.ready` -> `on_lane_checks_done`: `review.builder.build_for_run(run_id)` (fallback "group by folder" as in M5); lane `ready`.
4. All lanes `ready` / `failed` -> `race.ready` (Notifier: "T-0051 side by side ready: pick one to keep").

### 9.3 Pick winner (`pick_winner`)
1. Check lane is `ready`. Other lanes active and `stop_others` false -> 409.
2. Stop other lanes' runs (M2 stop). Snapshot + remove + maybe delete branch per loser (Decision 8). `workspace.removed {lane}` each.
3. Copy winner `branch`, `worktree_path`, `port` to the task. Winner lane `winner`. `tasks.race_id = null`.
4. `review_seconds = now - race.ready ts`. Emit `race.winner_picked`.
5. If the stage is `Verifying`, call M4's proof rule on the winner's latest Proof Card -> `Review` or `Failed`.

### 9.4 Cancel (`cancel_race`)
Stop all lane runs -> snapshot and remove every lane (branches deleted by the same rule) -> lanes `cancelled` -> free ports -> `tasks.race_id = null` -> move to `Ready` (Decision 5) -> `race.cancelled`.

### 9.5 Daemon restart during a race
M2 flow 8.6 marks lane runs `interrupted` and moves the task to `Failed`. Lanes stay `running`, `tasks.race_id` stays. `saarthi run resume <run>` resumes in the lane worktree (resolver) and moves `Failed -> Running` (existing move). The race then goes on as normal.

## 10. Config added

`config.py`:

| Constant | Value |
|---|---|
| `RACE_LANE_COUNT` | `2` |
| `RACE_DEFAULT_AGENTS` | `("claude", "codex")` |
| `RACE_MODES` | `("build",)` |
| `RACE_BRANCH_TEMPLATE` | `"saarthi/{task_id}-{slug}-{lane}"` |
| `RACE_WORKTREE_DIR_TEMPLATE` | `"{task_id}-{lane}"` |
| `RACE_SNAPSHOT_REF_TEMPLATE` | `"refs/saarthi/race/{task_id}/{lane}"` |
| `PORT_RANGE_START`, `PORT_RANGE_END`, `PORT_BLOCK_SIZE` | `41000`, `48999`, `10` |
| `PORT_ENV_DEFAULT` | `("SAARTHI_PORT", "PORT")` |
| `ACTIVE_RUN_STATUSES` | `("queued", "running", "needs_input")` |
| `LAST_ACTION_EVENT_TYPES` | `("agent.tool_call", "agent.needs_input", "agent.message")` |
| `LAST_ACTION_MAX_CHARS` | `80` |
| `GEMINI_BIN` (setting `gemini_path`) | `"gemini"` |
| `GEMINI_OUTPUT_ARGS` | from the spike (expected `("--output-format", "stream-json")`) |
| `GEMINI_MODE_ARGS` | mode -> args table, from the spike (until M8 `permission_args`) |
| `GEMINI_TESTED_VERSION` | from the spike |

`project.toml`:

```toml
[race]
agents = ["claude", "codex"]
delete_loser_branch = true

[ports]
env = ["SAARTHI_PORT", "PORT"]
```

Desktop `config.ts`: `WORKING_ROW_THROTTLE_MS = 1000`.

## 11. Error handling

| Case | What we do |
|---|---|
| Task not `Ready` / already racing | 409 with the reason. |
| Existing worktree has changes or commits | 409 "race needs a clean start". |
| One agent not ready (not installed / not logged in, incl. Gemini) | 409 before any worktree is made, with the fix command. |
| Lane worktree create fails | Roll back the other lane; 500 with git's stderr. |
| Port range full | 503 "no free port block"; race not started. Normal runs start with `port = null` and a warning. |
| Only one run slot free | Second lane `queued` (M2). |
| A lane run crashes | Lane `failed`; race continues with the other lane. |
| Both lanes fail | `Running -> Failed`; `race.ready` with both failed; only Cancel is offered. |
| Pick a lane that is not `ready` | 409. |
| Loser worktree remove fails (files locked) | Snapshot already saved; log; lane still `loser`; `worktree_path` kept so `git worktree prune` can clean later. |
| Change Story agent call fails for a lane | M5 fallback "group by folder". |
| Non-lane action during a race | 409 "race in progress - pick a winner first". |
| Gemini line is not JSON or has an unknown type | `raw` event; run goes on. |
| Gemini mode with no args row (e.g. no safe read-only) | 422 "gemini cannot run mode <m> yet" before any worktree change. |
| Gemini gives no cost | `cost_usd = null`; tokens saved; UI "unknown". |
| Gemini run ended with a question and `resumable = False` | Run `done`; the answer starts a new run (Decision 13). |

## 12. Tests to write

All with `FakeAdapter` and temp git repos. The FakeAdapter writes the files named in its fixture's `agent.file_changed` events into the worktree (as the M4/M5 integration tests already need). Fixtures: `claude_build_ok.jsonl`, `codex_build_ok.jsonl` (M0/M2), plus `codex_build_needs_input.jsonl`, and the Gemini fixtures from Decision 12. A fake binary `tests/fixtures/bin/fake_gemini.py` prints a fixture and logs argv; tests point `GEMINI_BIN` at it. Checks in the test `project.toml` are `true` / `false` commands.

| Test file | Proves |
|---|---|
| `tests/unit/core/test_race_stages.py` | Every row of the Decision 4 table, driven by fake lane events; cancel rows in `ALLOWED_MOVES`; "any run needs input" rule. |
| `tests/unit/workspace/test_resolve.py` | Normal task, lane run, `lane` arg, after pick; no-lane call while racing raises. |
| `tests/unit/workspace/test_ports.py` | Lowest free block; skip a block whose port is bound in the test; free on remove; same block after DB reload; range full error. |
| `tests/integration/test_race_flow.py` | Start -> two worktrees and branches from one base commit; isolation of files; per-lane checks and proofs; `race.ready`; pick -> task fields = winner, loser worktree gone, snapshot ref holds loser files, empty loser branch deleted, port freed, stage `Review`. |
| `tests/integration/test_race_pick_red.py` | Pick a lane with a failing required check -> `Failed`; a fix run then runs in the winner worktree. |
| `tests/integration/test_race_guards.py` | 409 for: not Ready, racing twice, dirty worktree, normal run, research run, second opinion, ship, sync; 422 for same agent twice. |
| `tests/integration/test_race_cancel.py` | Both snapshots, both worktrees removed, stage `Ready`, a new race can start. |
| `tests/integration/test_race_restart.py` | Daemon restart -> lanes `interrupted`; resume continues in the right lane worktree. |
| `tests/integration/test_main_line_queries.py` | After the pick, "latest proof" and "latest story" return the winner's even when the loser's rows are newer. |
| `tests/api/test_race_api.py` | Endpoints, compare `best` flags, `lane` query on proof / review / workspace. |
| `tests/api/test_runs_active.py` | Active list and `last_action`; finished runs drop out; no `project_id` returns runs of every project. |
| `tests/unit/agents/test_gemini_mapper.py` | Every line of each Gemini fixture maps to the right `agent.*` event; unknown and non-JSON lines become `raw`; usage -> tokens. |
| `tests/unit/agents/test_adapter_argv.py` (M2, changed) | Gemini argv per mode (`-p`, output args, mode args, list form); mode with no row refused. |
| `tests/integration/test_gemini_run.py` | `fake_gemini.py` build run -> files changed, `Verifying`; research run -> worktree clean; ended-with-question follows the `resumable` capability; `check_ready()` red when the binary is missing. |
| `tests/integration/test_race_flow.py` (also) | A `claude` + `gemini` race: branches `-claude` / `-gemini`, compare and pick work. |
| `desktop/src/screens/TaskPage/SideBySide/CompareView.test.tsx` | Two columns render with verdicts; Keep button hidden for a not-ready lane. |
| `desktop/src/screens/Home/WorkingRow.test.tsx` | Last action shows and updates throttled; a race task is one row with two agents. |

## 13. Manual verification

1. Race a real small task in this repo (Saarthi on Saarthi) with real Claude and Codex.
2. In each lane, ask the agent to start the dev server on `$SAARTHI_PORT`; open both in the browser at the same time.
3. Time the pick with `saarthi race status` ("review time" < 2 minutes) and note it in `timeline.md`.
4. Restore a few loser files from the snapshot ref to check it works.
5. Run the Gemini spike, write the ADR-001 section, record fixtures. Then one real `build` run and one real race (`claude,gemini`) with the real `gemini`.

## 14. Risks

| Risk | Mitigation |
|---|---|
| A missed call site still reads `tasks.worktree_path` during a race (it is null) | Grep for `worktree_path` and `.branch` in M2-M5 code; `test_race_guards` and `test_resolve` cover the main paths. |
| Loser rows leak into "latest" queries | `main_line_runs()` + `test_main_line_queries.py`. |
| Races cost twice | Compare shows cost; budget alert comes in M8. |
| Setting `PORT` changes a tool's behaviour | Configurable `[ports] env`; FSD open question 6. |
| Gemini CLI output changes between versions | Pure mapper + `raw` fallback; pin `GEMINI_TESTED_VERSION` in the `check_ready()` warning; re-record with the spike. |
| Gemini has no line-by-line JSON | Activity then fills only at the end; the spike checks this first. If so, note it in the ADR and show "working..." with time and the last raw line. |
| Gemini has no safe read-only mode | No `plan` / `research` for Gemini in M7 (Decision 13); M8 may add it with the OS sandbox. |
| 15 hours is tight because of the resolver refactor | Cut order: "best value in bold", then the lane switch on the Terminal. The Gemini spike comes first, so a bad surprise is seen early. |

## 15. What this milestone does not do

More than 2 lanes or the same agent twice; racing non-build modes; fix runs, Ask Codex to review or comments inside a lane; merging two lanes; renaming the winner branch; budget alerts (M8); listing snapshots in History / Restore (M8); a general `workspaces` table; Gemini as the review (second opinion) agent; Gemini permission profiles and OS sandbox (M8).

## 16. Effort breakdown

| Task | Hours |
|---|---|
| Migration, models, `workspace_for()` and call-site switch | 2 |
| `core/race.py`: start, hooks, pick, cancel, `main_line_runs()` | 2.5 |
| Ports: allocate / free / env / pack line | 1 |
| API + CLI (race, `--lane`, active runs) | 1 |
| Side by side option, running view, compare view, lane switch, tags | 1.5 |
| Live Working rows (`/runs/active`, last action) | 1 |
| Fixture glue (FakeAdapter file writes) + manual run | 1 |
| Gemini spike + ADR-001 section + fixtures (Decision 12) | 1.5 |
| `GeminiAdapter`: mapper, adapter, registry, config, tests (Decision 13) | 2.5 |
| Gemini row in Settings -> Agents / Health + manual real run | 1 |
| **Total** | **15** |

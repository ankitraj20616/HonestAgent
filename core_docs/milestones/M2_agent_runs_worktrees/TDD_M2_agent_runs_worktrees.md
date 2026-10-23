# TDD — M2: Agent Runs + Worktrees

**Document type:** Technical Design Document (TDD)
**Milestone:** M2 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`), new UI words, Decision 20: one per-OS layer (paths from `platformdirs`, ConPTY via `pywinpty`, process stop, lock) and a 3-OS CI matrix
**Estimated effort:** 23.5 hours
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. Every decision says *why*.
**Related documents:** `FSD_M2_agent_runs_worktrees.md`, `../../TDD-tech-design-doc.md` (sections 4.3-4.5, 4.8, 4.11, 4.12, 5.5, 6, 7, 8.1, 8.2, 8.6, 12), `../M1_daemon_core_cli/TDD_M1_daemon_core_cli.md`, `../M3_desktop_ui_v1/TDD_M3_desktop_ui_v1.md`, `../../decisions/ADR-001-agent-integration.md`
**Screens:** prototype view `cli` (the `saarthi` CLI sessions) in `core_docs/design/Saarthi Prototype.html#cli` (full list in `core_docs/design/README.md`). M2 has no window screen.

---

## 1. The goal in one sentence

Let the daemon start, watch, steer, stop and resume Claude and Codex runs on a task, each in its own git worktree, with every agent line turned into a saved event — all usable from the `saarthi` CLI on Linux, macOS and Windows.

---

## 2. Read this first — rules this work must not break

1. **All logic lives in the daemon** (CLAUDE.md rule 1). The CLI only calls the API. `run watch` reads REST + WebSocket like any other client.
2. **Agents only through `AgentAdapter`** (rule 3). No `if agent == "claude"` outside `agents/`. The Run Manager sees capabilities, never names.
3. **Every action is an event; unknown lines become raw `agent.message`, never dropped** (rule 4, core 6.3).
4. **Stage rules live in `ALLOWED_MOVES`** (rule 5). The Run Manager asks the Task Engine to move stages. It never writes `tasks.stage` itself.
5. **Git = subprocess with a list of args** (rule 6). No `shell=True`. M2 never pushes.
6. **No hard-coded values** (rule 7). Binaries, limits, flags, prompts, paths: `config.py` or `project.toml`.
7. **Tests first; FakeAdapter + recorded fixtures; never real agents in tests** (rule 8).

---

## 3. What already exists (do not rebuild)

| Thing | Where (M1) | Used for |
|---|---|---|
| `runs` table (schema only, empty) | `db/models.py` | M2 fills it. No new tables. |
| Event Bus + Event Store (SQLite + JSONL per run) | `core/events.py` | `bus.publish()` for every M2 event |
| Task Engine + `ALLOWED_MOVES` | `core/tasks.py` | `task_engine.move(task_id, to, reason, actor)` |
| Brief versions | `core/briefs.py` | Latest brief for the Context Pack |
| `project.toml` reader | `core/project_config.py` | New `[workspace]` keys |
| FastAPI app, token auth, WebSocket `/ws` with replay | `api/` | New routes plug in |
| Typer CLI + API client | `cli/` | New `run` and `workspace` commands |
| `config.py` | `config.py` | New constants (section 10) |
| Recorded streams + ADR-001 | `tests/fixtures/agents/`, `core_docs/decisions/` (M0) | Mapping tests, detection rules |

Names above follow core TDD and TECH_STACK section 4. If M1 used other names, follow M1.

---

## 4. Technical decisions

### Decision 1 — Split each adapter into a pure mapper and a process driver **(new)**
`agents/claude/mapper.py` turns one raw line into `list[AgentEvent]` with no I/O. `agents/claude/adapter.py` owns the process. **Why:** mapping is the part that breaks when CLIs change; pure functions are trivial to test against fixtures, line by line.

### Decision 2 — Adapter protocol: core 4.4 plus capabilities and a result on the handle **(new)**
```python
class Capabilities(BaseModel):
    live_input: bool      # can take send() while a turn is running
    resumable: bool       # resume(session_id) works
    structured: bool      # emits agent.* events (False for PTY)

class RunHandle:          # returned by start()/resume()
    pid: int
    session_id: str | None          # set by the adapter as soon as it is known
    result: RunResult | None        # set when the process ends

class RunResult(BaseModel):
    exit_code: int; is_error: bool; summary: str | None
    tokens_in: int | None; tokens_out: int | None; cost_usd: float | None
    ended_with_question: str | None       # path B of Needs You
    permission_denials: list[str] = []    # path B (Claude)
```
`AgentAdapter` keeps the core methods (`check_ready`, `start`, `events`, `send`, `stop`, `resume`) and adds `capabilities`. **Why:** the Run Manager must treat Claude and Codex differently (live input, resume) without naming them. M7 adds `GeminiAdapter` behind the same protocol; the Run Manager does not change.

### Decision 3 — Needs You has two paths, both handled in the Run Manager **(new, confirm with M0 ADR-001)**
- **Path A — live:** the mapper emits `agent.needs_input {live: true}` (Claude: a `tool_use` whose name is in `CLAUDE_QUESTION_TOOLS`). Process stays alive. Run -> `needs_input`. `send()` delivers the answer.
- **Path B — ended:** the process exits and `RunResult.ended_with_question` or `permission_denials` is set. Adapters fill `ended_with_question` when the last agent text's last non-empty line ends with `?` (rule in `agents/common.py`, switch `NEEDS_INPUT_ON_END_QUESTION`). The Run Manager emits `agent.needs_input {live: false}`. Run -> `needs_input` with `ended_at` set. The answer is a `resume(session_id)` with the answer as the prompt. For a permission denial, the resume adds the denied tool to this run's allowed tools (`RunRequest.extra_allowed_tools`).
- **Close without answering:** `stop` on a path-B run sets status `done` and applies the normal end rule.

**Why:** core 16 Q2 says Codex may only signal by ending with a question. Claude in `-p` mode may do either. One shared model keeps the CLI and the UI the same for both.

### Decision 4 — Codex follow-ups are queued until the turn ends **(new, confirm with M0 ADR-001)**
`CodexAdapter.capabilities.live_input = False`. `POST /runs/{id}/input` on a running Codex run stores the text in the Run Manager's per-run `pending_input` list and returns `{delivered: false}`. When the turn ends, if `pending_input` is not empty, the Run Manager resumes at once with the joined texts instead of finishing the run. **Why:** core 4.4 says Codex follow-ups go through `codex exec resume`. The list is in memory; on a crash the texts are still in the event log (`agent.message {role: "user", delivered: false}`).

### Decision 5 — Resume continues the same run row **(new)**
Resume sets `status = running`, clears `ended_at`, stores the new `pid`, appends to the same JSONL log, and emits `run.started {resumed: true}`. Tokens and cost add up. **Why:** "Uses `runs` fully. No new tables" — a `resumed_from` column would be a schema change, and one row per agent session matches what the user thinks of as "the run".

### Decision 6 — Stage moves at run end (and the extra `ALLOWED_MOVES` rows) **(new, needs M1 owner OK)**

| Run outcome | Task move | In core table? |
|---|---|---|
| started | Ready / Failed / Review -> Running | yes |
| needs input (A or B) | Running -> Needs You | yes |
| answered | Needs You -> Running | yes |
| `done`, mode `build` / `fix` | Running -> **Verifying** | yes |
| `done`, mode `plan` | Running -> Ready | yes |
| mode `research` (start and end) | **no move** - the task stays where it is | **changed** (core says Running -> Ready; see note below) |
| `failed` / `interrupted` | Running or Needs You -> Failed | **no** (core 8.6 and 12 say it; table misses it) |
| `stopped` by user | Running or Needs You -> Ready | **no** |
| path-B run closed as done | Needs You -> Verifying / Ready (by mode) | **no** |

M2 adds the missing rows to `ALLOWED_MOVES` with `by = system` and a test per row.

**Why research runs do not move the stage (new):** a research run can start while the task is still in `Inbox` or `Research`, with no brief. Moving it to `Running` and then `Ready` would skip the F2.5 "Ready needs a goal" rule. So a research run is a side run: no move at start, no move at end. Allowed start stages live in `config.RESEARCH_RUN_STAGES`. M6 ("Research this") builds on this - see M6 TDD Decision 1.

**Why `Verifying` and not `Review` for a finished build run:** it is the exact core move (`Running -> Verifying: build/fix run ends -> checks start`). In M2 the "checks start" step is an empty hook (`after_build_run(task, run)`); M4 puts the Check Runner there with no change to the Run Manager. Moving straight to `Review` would claim proof that does not exist, and would mean M2 writing the `Review` rule that M4 owns. The task waits in `Verifying`; I verify by hand and run `saarthi task move T-0002 review` (allowed until M4 adds the guard). Tasks left in `Verifying` when M4 lands just need `saarthi checks`.

### Decision 7 — One active run per task **(new)**
Active = `queued`, `running`, or `needs_input`. A second start returns `409 run_active`. **Why:** a task has one worktree; two agents in one folder is exactly the clash Saarthi exists to stop. Side by side (Race Mode, M7) will decide its own model.

### Decision 8 — Stopping, process groups and orphans
Agents start in their own process group. Stop = a polite stop to the group, wait `STOP_GRACE_SEC`, then a hard kill (Linux/macOS: `SIGTERM` then `SIGKILL`; Windows: see Decision 20). On daemon start, for each run in `running` / `needs_input` with `ended_at IS NULL` and a `pid`: if the process exists **and** its `cwd` is the task's worktree **and** its cmdline contains the adapter binary (read with `psutil`, same code on every OS), kill its group. Then mark `interrupted`. **Why:** a resume must never start a second agent in the same worktree. The two checks avoid killing an unrelated process that reused the PID. **(new)**

### Decision 9 — Daemon restart rules (core 8.6, refined) **(new)**
- `running`, or `needs_input` with `ended_at IS NULL` (path A) -> `interrupted`, checkpoint, task -> `Failed` (note "interrupted").
- `needs_input` with `ended_at` set (path B) -> unchanged. Nothing was lost.
- `queued` -> put back in the queue in `created order` (by `events` id of `run.queued`).
- Clean `daemon stop`: stop live runs as in Decision 8, checkpoint, mark `interrupted` (not `stopped`, because I did not ask to stop them).

### Decision 10 — Minimal mode-to-flags map until M8 **(new, confirm with M0 ADR-001)**
M8 owns permission profiles and the Safety Guard. M2 uses only the default profile `safe_build` from core 4.9, as config data read by each adapter:

| Mode | Claude | Codex |
|---|---|---|
| `plan`, `research` | `--permission-mode plan` | `--sandbox read-only` |
| `build`, `fix` | `--permission-mode acceptEdits --allowedTools <CLAUDE_SAFE_BUILD_TOOLS>` | `--sandbox workspace-write` |

**Why:** read-only modes must really be read-only, and builds must not ask for every edit. M8 replaces this map: the Safety Guard builds an agent-neutral `PermissionPolicy`, and each adapter turns it into flags with `permission_args(policy)` (M8 TDD Decision 1), so no agent flag lives outside `agents/`.

### Decision 11 — Worktree layout and naming
- Path: `<worktree_root>/<project-slug>-<last 6 of project id, lowercased>/<task-id>`. **(new)** Readable and unique even if two projects share a name.
- Branch: `saarthi/<task-id>-<slug(title)[:BRANCH_SLUG_MAX]>`. Exists and starts with `saarthi/<task-id>-` -> reuse; exists otherwise -> suffix `-2`, `-3` (core 12).
- `git worktree add -b <branch> <path> <default_branch>` (or without `-b` when reusing).
- `.saarthi/context/` is added once to `<git-common-dir>/info/exclude`. **(new)** **Why:** git-ignored without editing the user's `.gitignore`; `info/exclude` is shared by all worktrees.

### Decision 12 — Setup script runs once, tracked by a marker in the worktree's git dir **(new)**
Command: `["bash", <worktree>/<setup_script>]` (on Windows, the `bash` that comes with Git for Windows, found with `shutil.which`; if missing, setup fails with "bash not found - install Git for Windows"), cwd = worktree, env adds `SAARTHI_REPO`, `SAARTHI_TASK_ID`, `SAARTHI_WORKTREE`. On exit 0, write `<git-dir of worktree>/saarthi-setup-done`. **Why:** the marker lives outside the working tree, so the agent cannot commit or delete it by accident, and it disappears with the worktree.

### Decision 13 — Checkpoint per core 4.5.1, with "no change, no new ref"
```
GIT_INDEX_FILE=<tmp> git read-tree HEAD
GIT_INDEX_FILE=<tmp> git add -A
tree = git write-tree
if tree == tree of last checkpoint: reuse it
commit = git commit-tree <tree> -p HEAD -m "saarthi checkpoint T-0002 #3 (run 01JC…)"
git update-ref refs/saarthi/checkpoints/T-0002/3 <commit>
```
`n` = highest existing `n` + 1 (`git for-each-ref`). Stored in `runs.checkpoint_ref`. **Why:** the temp index never touches the user's index or branch. Skipping equal trees stops a ref per no-op run.

### Decision 14 — `file_changed` gets a small diff from the Workspace Manager
Mappers emit `agent.file_changed {path, change}` from edit tools (Claude `Edit`/`Write`/`MultiEdit`, Codex `file_change` items). The Run Manager adds `diff` (from `workspace.diff_file`, cut to `FILE_DIFF_MAX_LINES`) and `added`/`removed` counts before publishing. **Why:** FSD F5.4 wants a "small diff" card; the git diff is the truth, tool inputs are not.

### Decision 15 — PtyShellAdapter is built in M2, not M3 **(new)**
It is daemon code that emits `terminal.output`, an event M2 owns. CLAUDE.md rule 2 says a feature works in the CLI before it gets a screen, so `saarthi run --pty` + `run watch` + `run say` are its CLI. M3 only adds keystroke/resize frames on the WebSocket and the xterm.js Terminal view (task page → More → Terminal). Scope is small: start a command in a PTY (Unix PTY on Linux/macOS, ConPTY through `pywinpty` on Windows; Decision 20) (`PTY_COLS` x `PTY_ROWS`), stream bytes, write input, stop. `capabilities = (live_input=True, resumable=False, structured=False)`. `runs.agent = "pty"`; the real agent CLI is in `run.started.payload.command`. End-of-run stage rules follow the mode like any run.

### Decision 16 — Raw lines and terminal bytes go to the JSONL log only
Each raw agent stdout line is written to `logs/runs/<run_id>.jsonl` as `{"kind": "raw", "line": …}` before mapping. `terminal.output` events are published to the WebSocket with `id: null` and appended to the log, never to SQLite (core 6.2). **Why:** the full raw stream is always on disk (NF3), while SQLite stays small. Clients must not use `id: null` events as `last_event_id`.

### Decision 17 — `saarthi run` is a group with a default command **(new)**
`saarthi run T-0002 …` is the same as `saarthi run start T-0002 …`. A small `DefaultGroup` (click) falls back to `start` when the first word is not a sub-command. All run commands accept a **run ID or a task ID** (task ID = its active run, or its latest run). **Why:** matches the MILESTONES.md commands exactly and saves copying ULIDs.

### Decision 18 — Response additions for M3
`GET /tasks/{id}` and task list items gain `active_run: {id, agent, mode, status} | null`. Run responses gain a computed `needs_input: {kind, question, options, live} | null` (from the latest `agent.needs_input` event). **Why:** the Home rows and the "Needs you" group in M3 need them without extra calls. No new columns.

### Decision 19 — Plan docs live in the data folder **(new)**
A finished `plan` run writes its final message to `<DATA_DIR>/tasks/<task_id>/docs/plan-<run_id>.md` (F22.2), not to the worktree.
- **Why:** a plan run never touches the worktree (F5.2 rule, tested with the read-only flags), and the file must survive worktree cleanup.
- The `docs/` module is Saarthi's own code, not the repo's docs folder. Docs are files found at read time: no new table.
- `changed` docs come from git (`git diff --name-status <base>...HEAD -- '*.md'` and `git status --porcelain -- '*.md'`, list args, in the worktree).
- `pinned` docs come from `[docs] pinned` in `project.toml` (default `DEFAULT_PINNED_DOCS`), read from the worktree, or from the main checkout if the worktree does not exist yet.
- A file in both sets shows once, as `changed`, with `pinned: true`.
- Every path is resolved and must stay inside the worktree / data folder (`..` and symlinks out are refused).
- Doc IDs: `plan:<run_id>`, `wt:<path>`, `pin:<path>`; `research:<item_id>` comes in M6.

### Decision 20 — One per-OS layer, tested on Linux, macOS and Windows **(new)**
Saarthi is one app for Linux, macOS and Windows (simple UI spec P3). M2 is the first milestone that touches folders, processes and terminals, so every OS difference sits in one small module, `os_support.py`. No other file checks the OS.

| Need | Linux / macOS | Windows |
|---|---|---|
| Config, data, log folders | `platformdirs` (`user_config_dir`, `user_data_dir`, `user_log_dir`, app name `APP_DIR_NAME`, `appauthor=False` so Windows uses `%LOCALAPPDATA%\saarthi`); `SAARTHI_*_DIR` still override | same |
| Process group at start | `start_new_session=True` | `creationflags=CREATE_NEW_PROCESS_GROUP` |
| Polite stop, then kill | `os.killpg` `SIGTERM`, wait, `SIGKILL` | `CTRL_BREAK_EVENT`, wait, then `["taskkill", "/T", "/F", "/PID", pid]` (list args) |
| Process info (orphan check) | `psutil` | `psutil` |
| Single-daemon lock (M1 Decision 14) | `fcntl.flock` | `msvcrt.locking` |
| PTY (Decision 15) | stdlib `pty` + `loop.add_reader` | `pywinpty` (ConPTY), read in a worker thread |
| Find an agent binary | `shutil.which(CLAUDE_BIN)` | same; resolves npm `.cmd` shims, which `create_subprocess_exec` cannot find by name |

- M1's `config_dir()` / `data_dir()` helpers switch to `platformdirs` here. On Linux the folders do not move (they are the same XDG paths).
- New deps **(new)**: `platformdirs`, `psutil`, and `pywinpty; sys_platform == "win32"`. **Why:** small, well-known, pure-Python or wheel-only libs; writing our own process-tree kill and ConPTY wrapper would be more code and more bugs.
- Worktrees on Windows get `git config core.longpaths true` (list args) when created. **Why:** worktree paths under `%LOCALAPPDATA%` get long fast.
- CI: `.github/workflows/daemon-tests.yml` runs `uv run pytest`, `ruff`, `pyright` on `ubuntu-24.04`, `macos-14`, `windows-2022` (it grows out of the M0 Spike 6 workflow). The fake agent binaries get a `.cmd` launcher on Windows.

**Why now and not M9:** if the run code assumes POSIX for 7 milestones, M9 would have to rewrite the Run Manager. One table of differences now costs about 2 hours.

---

## 5. Modules and files

All under `daemon/src/saarthi/`.

| File | What |
|---|---|
| `agents/base.py` | `AgentAdapter` Protocol, `Capabilities`, `RunRequest`, `RunHandle`, `RunResult`, `ReadyStatus`, `AgentEvent` |
| `agents/common.py` | `ends_with_question(text)`, `tail(text, n)`, raw-event helper `raw_event(line)` |
| `agents/registry.py` | `get_adapter(name) -> AgentAdapter` (the only lookup by name) |
| `agents/claude/mapper.py`, `agents/claude/adapter.py` | Claude stream-json mapping + process (stdin stream-json messages) |
| `agents/codex/mapper.py`, `agents/codex/adapter.py` | Codex `exec --json` mapping + process, `exec resume` |
| `agents/pty_shell.py` | `PtyShellAdapter` (gets its PTY from `os_support.open_pty()`: stdlib `pty` on Linux/macOS, `pywinpty` on Windows) |
| `os_support.py` | Decision 20: folders, process group start/stop, process info, lock, `open_pty()`, `find_binary()` |
| `agents/fake.py` | `FakeAdapter`: replays a fixture; can pause at `needs_input` until `send()`; scripted exit code |
| `workspace/git.py` | `run_git(args, cwd, env=None) -> GitResult` (list args only, timeout) |
| `workspace/manager.py` | `ensure_worktree`, `run_setup_script`, `status`, `diff`, `diff_file`, `checkpoint`, `remove_worktree` |
| `memory/context_pack.py` | `build_v0(task, brief, mode, message) -> str`, `write(worktree, text)` |
| `core/runs.py` | `RunManager`: queue, slots, lifecycle, stage moves, pending input, restart recovery |
| `core/notify.py` | `Notifier`: bus listener -> `notify-send` (args list) on Linux only; no-op on macOS and Windows until the app shows notifications (M3, Tauri plugin) |
| `schemas/runs.py` | `RunCreate`, `RunOut`, `RunInput`, `RunResume`, `WorkspaceOut`, `ContextPackOut` |
| `schemas/events.py` (extend M1's) | One Pydantic payload model per event in section 7. **Why:** one source of truth; M3 generates TypeScript types from it. |
| `api/routes/runs.py`, `api/routes/workspace.py`, `api/routes/docs.py` | Endpoints in section 8 |
| `cli/run.py`, `cli/workspace.py`, `cli/docs.py`, `cli/render.py` | Typer commands; Rich renderer for events |

`remove_worktree` is built and tested in M2 (MILESTONES.md lists it) but has no API, CLI or event yet. M5 wires it with `workspace.removed` and the cleanup prompt.

---

## 6. Data model changes

**No new tables, no new columns** (docs are files, Decision 19; ownership map: "Uses `runs` fully"). If M1 did not index `runs.status` and `runs.task_id`, add migration `0002_m2_runs_indexes` with `ix_runs_status` and `ix_runs_task_id`; nothing else.

How M2 fills `runs` (core 5.5):

| Field | Set when |
|---|---|
| `agent`, `mode`, `status=queued` | `POST /tasks/{id}/runs` |
| `status=running`, `pid`, `started_at` | process started (and again on resume) |
| `agent_session_id` | as soon as the adapter reports it |
| `tokens_in`, `tokens_out`, `cost_usd` | on `agent.cost` (added up across resumes) |
| `summary` | last agent text |
| `status=needs_input`, `ended_at` (path B only) | Needs You |
| `status=done/failed/stopped/interrupted`, `ended_at`, `checkpoint_ref` | run end |
| `log_path` | `logs/runs/<run_id>.jsonl` at creation |
| `playbook_id` | stays null (M6) |

Also updated at run end: `tasks.branch`, `tasks.worktree_path` (first run), `tasks.total_cost_usd`, `tasks.total_seconds`.

---

## 7. Events added

All use the core 6.1 shape. `task_id` and `run_id` are always set.

| Type | Payload |
|---|---|
| `run.queued` | `{agent, mode, position}` |
| `run.started` | `{agent, mode, pid, session_id, resumed, command}` (`command` = argv without the prompt) |
| `run.finished` | `{status: "done", summary, seconds, tokens_in, tokens_out, cost_usd, checkpoint_ref}` |
| `run.failed` | `{error, exit_code, stderr_tail, checkpoint_ref}` |
| `run.stopped` | `{by: "user" \| "park" \| "dequeue", checkpoint_ref}` |
| `run.interrupted` | `{reason: "daemon_restart" \| "daemon_stop", checkpoint_ref}` |
| `agent.message` | `{role: "agent" \| "user", text, raw?: true, delivered?: bool}` |
| `agent.thinking` | `{text}` |
| `agent.tool_call` | `{tool, call_id, summary, input}` (input cut to `TOOL_INPUT_MAX_CHARS`) |
| `agent.tool_result` | `{call_id, is_error, output_tail, exit_code?}` |
| `agent.file_changed` | `{path, change: "edit" \| "create" \| "delete", added, removed, diff}` |
| `agent.needs_input` | `{kind: "question" \| "permission", question, options: [], live: bool, tool?}` |
| `agent.cost` | `{tokens_in, tokens_out, cost_usd \| null, seconds}` |
| `terminal.output` | `{data_b64}` (PTY runs; `id: null`, log only) |
| `workspace.created` | `{branch, path, base, reused_branch: bool, setup: {ran, exit_code, seconds} }` |
| `workspace.checkpoint` | `{n, ref, tree, run_id, reused: bool}` |
| `doc.saved` **(new)** | `{doc_id, kind: "plan", path, run_id, chars}` |

Unknown lines: `agent.message {role: "agent", text: <line>, raw: true}`.

Mapping (from M0 fixtures — **confirm with M0 ADR-001**):

| Claude stream-json | -> | Codex `exec --json` | -> |
|---|---|---|---|
| `system/init` | session_id only | `thread.started` | session_id only |
| `assistant` text block | `agent.message` | `item.completed` `agent_message` | `agent.message` |
| `assistant` thinking block | `agent.thinking` | `item.completed` `reasoning` | `agent.thinking` |
| `assistant` tool_use | `agent.tool_call` (+ `file_changed` for edit tools, + `needs_input` for question tools) | `item.started` `command_execution` | `agent.tool_call {tool: "shell"}` |
| `user` tool_result | `agent.tool_result` | `item.completed` `command_execution` | `agent.tool_result` |
| `result` | `agent.cost` + `RunResult` | `item.completed` `file_change` | `agent.file_changed` per path |
| | | `turn.completed` (usage) | `agent.cost` (no cost) + `RunResult` |
| | | `turn.failed`, `error` | `RunResult(is_error=True)` |
| anything else | raw `agent.message` | anything else | raw `agent.message` |

---

## 8. API and CLI added

All under `/api/v1`, bearer token, as in M1.

| Method | Path | Body | Response / errors |
|---|---|---|---|
| GET | `/tasks/{id}/runs` | - | `RunOut[]`, newest first |
| POST | `/tasks/{id}/runs` | `{agent?, mode="build", message?, pty=false, dry_run=false}` | `202 RunOut` (`queued`/`running`); dry run: `200 {context_pack, command}`; `409 stage_not_allowed`, `409 run_active {run_id}`, `424 agent_not_ready {fix}` |
| GET | `/runs/{id}` | - | `RunOut` (incl. `needs_input`, Decision 18) |
| GET | `/runs/{id}/events` | `?after=0&limit=500&terminal=false` | `{events, next_after}`; `terminal=true` returns the last `TERMINAL_SCROLLBACK_BYTES` from the log |
| POST | `/runs/{id}/input` | `{text}` | `202 {delivered: bool}`; `409` if not `running`/`needs_input` |
| POST | `/runs/{id}/stop` | - | `RunOut`; on path-B `needs_input` closes as `done` |
| POST | `/runs/{id}/resume` | `{message?}` | `202 RunOut`; `409 not_resumable` (no session, wrong status, or task stage blocks `Running`) |
| GET | `/tasks/{id}/context-pack` | `?mode=build&message=` | `{path, content, brief_version}` (preview; writes nothing) |
| GET | `/tasks/{id}/docs` | - | `[{doc_id, kind, title, path, source: "data"\|"worktree"\|"main", size, updated_at, change: "added"\|"modified"\|null, pinned}]`; order and rules in Decision 19; `title` = first `# ` heading, else file name |
| GET | `/tasks/{id}/docs/content` | `?doc=<doc_id>` | `{doc_id, markdown, size, updated_at, too_big}`; `400 bad_path`, `404 doc_not_found` |
| GET | `/tasks/{id}/workspace` | - | `{exists, branch, path, base, ahead, behind, changed_files, last_checkpoint}` |

In the docs list, `path` is the absolute data-folder path for plan docs (`source: "data"`) and the path relative to the worktree (or main checkout) for the other kinds.

CLI (`cli/run.py`, `cli/workspace.py`). Every command has `--json`.

| Command | Options | Output |
|---|---|---|
| `saarthi run <task>` | `--agent claude\|codex`, `--mode plan\|build\|fix\|research`, `--message TEXT`, `--pty`, `--detach`, `--dry-run` | header (workspace, setup, context, run), then live view unless `--detach` |
| `saarthi run list <task>` | | Rich table (FSD F5.9) |
| `saarthi run watch <run\|task>` | `--from-start/--live-only` (default from start) | past events, then live; `Ctrl+C` detaches only |
| `saarthi run say <run\|task> "text"` | | `Sent.` or `Queued. Codex will get it when this step ends.` |
| `saarthi run stop <run\|task>` | | `Stopped run … Checkpoint n saved. Task -> Ready.` |
| `saarthi run resume <run\|task>` | `--message TEXT`, `--detach` | resumes and attaches |
| `saarthi workspace <task>` | | FSD F6.3 block |
| `saarthi docs list <task>` | `--json` | Rich table (FSD F22.2-F22.4) |
| `saarthi docs show <task> <doc>` | `--json` | Markdown printed with Rich. `<doc>` = number from the list, path, or doc ID |
| `saarthi docs open <task> <doc>` | | Opens the file in `$EDITOR` |

`run watch` render (`cli/render.py`): one line per event, `HH:MM:SS  kind  text`. Kinds: `msg`, `think` (dim, first line), `tool`, `out` (first `WATCH_OUTPUT_LINES` lines), `file` (`path (+a -r)`), `ASK` (yellow panel + the exact `run say` command), `raw` (dim grey), `END`. PTY runs: write decoded bytes straight to stdout.

---

## 9. Key flows

### 9.1 Start a run (core 8.1, M2 version)
1. API validates: agent known, `adapter.check_ready()` ok, task stage in `RUN_START_STAGES`, no active run.
2. Create `runs` row (`queued`), emit `run.queued`. If a slot is free, go on; else wait.
3. On a slot: re-check stage; if blocked -> `stopped {by: "dequeue"}`.
4. `workspace.ensure_worktree(task)` -> `workspace.created` (first time). Setup script if needed; failure -> step 10 with `failed`.
5. `context_pack.build_v0()` -> write `TASK.md`.
6. Task -> `Running` (Task Engine). `adapter.start(RunRequest(cwd, prompt, mode, …))` -> `run.started`.
7. For each line: log raw -> mapper -> enrich `file_changed` -> `bus.publish`. On `session_id`, save it.
8. On `agent.needs_input {live: true}`: run -> `needs_input`, task -> `Needs You`.
9. Process ends -> `RunResult`. If `pending_input` -> resume (9.3) and stop here. If path B -> 9.2.
10. `checkpoint()` -> `workspace.checkpoint`. Save tokens/cost/summary/status. Update task totals. Emit `run.finished` or `run.failed`. Move the task (Decision 6). For `build`/`fix` done: call `after_build_run()` (no-op hook until M4).

### 9.2 Needs You, path B
1. Emit `agent.needs_input {live: false, …}`, run -> `needs_input`, `ended_at` set, task -> `Needs You`. Checkpoint.
2. `run say` -> `adapter.resume(req, session_id)` with the answer -> run `running`, task -> `Running` -> continue at 9.1 step 7.

### 9.3 Resume
1. Check `resumable`, `agent_session_id`, status in `stopped/failed/interrupted/needs_input(path B)`, task stage allows `Running`.
2. Rewrite `TASK.md`, task -> `Running`, `adapter.resume()`, `run.started {resumed: true}`, 9.1 step 7.

### 9.4 Daemon start
1. Kill verified orphans (Decision 8). 2. Apply Decision 9. 3. Re-queue `queued` runs. 4. Start `Notifier`.

---

## 10. Config added

`config.py` (settings table > `~/.config/saarthi/config.toml` > these defaults):

| Constant | Default |
|---|---|
| `CLAUDE_BIN`, `CODEX_BIN` (settings `claude_path`, `codex_path`) | `"claude"`, `"codex"` |
| `CLAUDE_BASE_ARGS` | `["-p", "--output-format", "stream-json", "--input-format", "stream-json", "--verbose"]` |
| `CODEX_BASE_ARGS` | `["exec", "--json"]` |
| `CLAUDE_FLAGS_BY_MODE`, `CODEX_FLAGS_BY_MODE` | Decision 10 table |
| `CLAUDE_SAFE_BUILD_TOOLS` | `["Read", "Edit", "Write", "MultiEdit", "Glob", "Grep", "Bash(uv run *)", "Bash(git status*)", "Bash(git diff*)"]` |
| `CLAUDE_QUESTION_TOOLS` | `["AskUserQuestion"]` (confirm ADR-001) |
| `NEEDS_INPUT_ON_END_QUESTION` | `True` |
| `MAX_PARALLEL_RUNS` (setting `max_parallel_runs`) | `4` |
| `RUN_START_STAGES` | `["ready", "failed", "review"]` |
| `MODE_PROMPTS` | per mode, e.g. build: `"Read .saarthi/context/TASK.md first. Then build it. Work only in this folder."` |
| `WORKTREE_ROOT` (setting `worktree_root`) | `DATA_DIR / "worktrees"` |
| `BRANCH_PREFIX`, `BRANCH_SLUG_MAX` | `"saarthi/"`, `40` |
| `CHECKPOINT_REF_PREFIX` | `"refs/saarthi/checkpoints"` |
| `CONTEXT_PACK_RELPATH` | `".saarthi/context/TASK.md"` |
| `SETUP_MARKER_NAME` | `"saarthi-setup-done"` |
| `GIT_TIMEOUT_SEC` | `60` |
| `STOP_GRACE_SEC` | `5` |
| `RESEARCH_RUN_STAGES` | `("inbox", "research", "ready", "failed", "review")` - research runs start here and never move the stage |
| `STDERR_TAIL_LINES`, `TOOL_OUTPUT_TAIL_LINES`, `TOOL_INPUT_MAX_CHARS` | `50`, `40`, `2000` |
| `FILE_DIFF_MAX_LINES` | `80` |
| `PTY_COLS`, `PTY_ROWS`, `TERMINAL_SCROLLBACK_BYTES` | `120`, `40`, `262144` |
| `WATCH_OUTPUT_LINES` | `5` |
| `DOCS_MAX_LIST` | `200` |
| `DOCS_MAX_BYTES` | `1_000_000` |
| `DEFAULT_PINNED_DOCS` | `["CLAUDE.md", "AGENTS.md", "core_docs/FUNCTIONAL_SPECIFICATIONS.md", "core_docs/TDD-tech-design-doc.md"]` |
| `DOCS_DIR_NAME` | `"docs"` (under `DATA_DIR / "tasks" / <task_id>`) |
| `NOTIFY_ENABLED`, `NOTIFY_SEND_BIN`, `NOTIFY_APP_NAME` | `True`, `"notify-send"`, `"Saarthi"` (Linux only) |
| `WINDOWS_GIT_LONGPATHS` | `True` (Decision 20) |

`project.toml`:
```toml
[workspace]
setup_script = ".saarthi/setup.sh"   # default; missing file = no setup
setup_timeout_sec = 900

[docs]
pinned = ["CLAUDE.md", "AGENTS.md", "core_docs/FUNCTIONAL_SPECIFICATIONS.md", "core_docs/TDD-tech-design-doc.md"]   # default = DEFAULT_PINNED_DOCS
```

---

## 11. Error handling

| Case | What we do |
|---|---|
| Agent CLI missing / not logged in | `424 agent_not_ready` with the fix text; no run row. |
| Agent exits non-zero / `is_error` | `run.failed` with `STDERR_TAIL_LINES` of stderr; checkpoint; task -> `Failed`. |
| Invalid JSON line | Raw `agent.message`. Never crash the reader. |
| Mapper raises on a line | Log it, emit raw `agent.message`, continue. (Test proves it.) |
| Branch exists for another task | Suffix `-2`, `-3` (Decision 11). |
| `git worktree add` fails (path exists, not a worktree) | `run.failed {error: "worktree_path_busy", path}`; never delete the folder. |
| Setup script fails / times out | Kill its group; `run.failed` with output tail; no marker, so next run retries. |
| Checkpoint fails | Log + `run.*` still emitted with `checkpoint_ref: null`. A run result is never lost over a checkpoint. |
| `notify-send` missing (Linux) | One warning in `daemon.log`, then silent. |
| `bash` missing for the setup script (Windows) | `run.failed {error: "bash_not_found"}` with the fix text. |
| `pywinpty` missing or ConPTY not available (old Windows) | `--pty` run fails with `424 pty_not_available`; JSON-mode runs still work. |
| `input` to a finished run | `409`. |
| Resume without session id | `409 not_resumable`, message "start a new run". |
| Orphan PID check fails (not ours) | Do not kill. Mark `interrupted`. Log a warning. |
| Doc path escapes the worktree / data folder | `400 bad_path`. Nothing is read. |
| Doc over `DOCS_MAX_BYTES` | `too_big: true`, no text. |
| Plan file cannot be written | Log it; the run still ends `done`; no `doc.saved`. |
| Worktree deleted by hand | `GET /workspace` -> `exists: false`; next run recreates it (reusing the branch). |

---

## 12. Tests to write

Fixtures: M0 files in `tests/fixtures/agents/` (`claude_build_ok.jsonl`, `claude_needs_input.jsonl`, `claude_fail.jsonl`, `codex_build_ok.jsonl`, `codex_needs_input.jsonl`, `codex_fail.jsonl` — exact names per M0), plus hand-made `claude_unknown_lines.jsonl`, `codex_unknown_lines.jsonl`. Fake binaries `tests/fixtures/bin/fake_claude.py` and `fake_codex.py` print a fixture and log argv/stdin; tests point `CLAUDE_BIN`/`CODEX_BIN` at them. Real `git` in `tmp_path` is fine; real agents never.

| File | Proves |
|---|---|
| `unit/agents/test_claude_mapper.py` | Every fixture line maps to the expected events; unknown -> raw; `result` -> cost + `RunResult` |
| `unit/agents/test_codex_mapper.py` | Same for Codex; `turn.completed` tokens, no cost |
| `unit/agents/test_needs_input_detection.py` | Path A (question tool), path B (ends with `?`, permission denial), switch off |
| `unit/agents/test_adapter_argv.py` | argv per agent x mode (read-only flags for plan/research), resume args carry session id |
| `integration/test_claude_adapter_process.py` | With `fake_claude.py`: stdin stream-json message for `send()`, stop kills the group |
| `integration/test_codex_adapter_process.py` | With `fake_codex.py`: resume command, no live input |
| `unit/agents/test_fake_adapter.py` | Replay, pause at needs_input, scripted failure |
| `integration/test_pty_shell.py` | `bash -c 'read x; echo got:$x'` (Windows: `cmd /c "set /p x= & echo got:%x%"`): input reaches it, `terminal.output` bytes come back, not in SQLite; stop ends it |
| `unit/test_os_support.py` | Folders come from `platformdirs` and the env overrides win; `stop_group` sends the polite stop first and kills after `STOP_GRACE_SEC` (a fake child that ignores it); `find_binary` finds a `.cmd` on Windows; lock refuses a second holder |
| `integration/test_workspace_manager.py` | Create, reuse branch, suffix, exclude entry, setup once + marker, setup failure, status ahead/behind/changed, diff_file, remove |
| `integration/test_checkpoint.py` | Ref created, branch log and user index unchanged, no-change reuse, numbering |
| `unit/test_context_pack_v0.py` | Text has id, title, mode, all brief sections, message; `.saarthi/context/` excluded |
| `integration/test_run_manager.py` | Full lifecycle with FakeAdapter: stage moves of Decision 6, one active run, queue with limit 1, dequeue stage re-check, totals updated |
| `integration/test_run_needs_you.py` | Both paths for both fake capability sets; `stop` closes path B as done; Codex queued input delivered on resume, in order |
| `integration/test_run_restart.py` | Restart rules of Decision 9; orphan kill only when pid cwd + cmdline match |
| `integration/test_docs_finder.py` | Kinds (plan, changed added/modified, pinned); order; pinned + changed shown once; `.saarthi/context/` excluded; `DOCS_MAX_LIST`; missing pinned file skipped; path escape (`..`, symlink out) refused; `too_big` |
| `integration/test_plan_doc.py` | FakeAdapter plan run `done` -> file in data folder + one `doc.saved`, worktree unchanged; `failed` / `stopped` -> no file, no event |
| `api/test_docs_api.py` | Bodies and errors of the two docs endpoints; `docs show` by number |
| `unit/core/test_allowed_moves_m2.py` | One test per new row |
| `unit/test_notifier.py` | Linux: fake `notify-send` on PATH: one call per needs_input / finished / failed; missing binary -> one warning. macOS/Windows: no call, no warning |
| `api/test_runs_api.py`, `api/test_workspace_api.py` | Status codes and bodies of section 8; WebSocket gets `run.*`/`agent.*` |
| `cli/test_run_cli.py` | `DefaultGroup` routing, task id -> run id lookup, renderer output for each event kind (snapshot) |

Coverage target for `agents/`, `workspace/`, `core/runs.py`: 85%. The whole suite runs on Linux, macOS and Windows in CI (Decision 20); a test that only makes sense on one OS is marked with `pytest.mark.skipif` and a reason.

---

## 13. Manual verification

1. `scripts/smoke_real_agents.sh` (core 13, not in CI): runs a tiny build task with real Claude, then Codex, in a temp repo.
2. Follow the FSD QA checklist (section 9) on a scratch repo. Do the PTY and folder checks once on macOS and once on Windows (a VM is fine).
3. Dogfood: build 3 real Saarthi tasks (for example M3 prep: `active_run` field, `run list` polish, `notify-send` icon). Note each in `core_docs/timeline/timeline.md`.
4. Show `uv run pytest`, `uv run ruff check .`, `uv run pyright` output (CLAUDE.md rule 9).

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| CLI JSON formats change (Claude 2.1.x, Codex 0.152.x) | Pure mappers + raw fallback; re-record fixtures with M0 script; pin tested versions in `check_ready()` warning. |
| Needs-input detection wrong or noisy | Two paths, config switch, `stop` closes path B; review after 3 dogfood tasks. |
| Claude `-p` permission prompts block silently | `acceptEdits` + allowed tools; denials surface as path B; M8 may add a permission prompt tool. |
| Codex `workspace-write` sandbox cannot write to the main repo's `.git` (worktree git dir) | Agents should not commit in M2; if needed, document in ADR and let the user commit (M5 ships). |
| Asyncio PTY reading is flaky | Small adapter, its own test; plan B in TECH_STACK 2.3. |
| Windows behaves differently (ConPTY, `.cmd` shims, no process groups like POSIX) | All of it in `os_support.py` (Decision 20); the 3-OS CI matrix catches breaks on every push. |
| Agent CLIs print different paths or line endings on Windows | Mappers strip `\r\n`; paths in events are made relative to the worktree with `pathlib`. |
| A setup script that copies `.env` leaks secrets into logs | Known gap 2 (M8). |
| Dogfooding on Saarthi while changing Saarthi's daemon | Run the "stable" daemon from a separate install (`uv tool install` from a tag) while developing in the repo. |

---

## 15. What this milestone does not do

No UI, no keystroke/resize frames, no Tauri notifications (M3). No checks, Proof Card ("Tests and checks") or `Review` guard (M4). No sync with main, cleanup prompt, `workspace.removed`, commit/push/PR (M5). No research items, memory or playbooks in the Context Pack, no plan in the Context Pack, no `research` docs (M6). No Docs view (M3). No editing docs (Later). No Side by side (race) and no Gemini CLI (M7). No "What agents may do" UI, blocked list, OS sandbox (`bwrap` / `sandbox-exec`), secret masking, History or Restore (checkpoints, rewind), Safety and cost (M8). No installers, sidecar or background mode per OS (M9).

---

## 16. Effort breakdown

| Task | Hours |
|---|---|
| `agents/base.py`, registry, `FakeAdapter` | 1.5 |
| Claude mapper + adapter + tests | 2.5 |
| Codex mapper + adapter + tests | 2 |
| PtyShellAdapter + test | 1.5 |
| Workspace Manager (worktree, setup, status, diff, checkpoint, remove) + tests | 2.5 |
| Run Manager (queue, lifecycle, stage moves, end checkpoint) + tests | 3.5 |
| Needs You (both paths) + queued input | 1.5 |
| Restart / interrupted / resume / orphans | 1 |
| Context Pack v0 | 0.5 |
| Task Docs: finder, reader, plan doc, `doc.saved`, API, CLI + tests | 1.5 |
| Notifier | 0.5 |
| Per-OS layer (`os_support.py`) + 3-OS CI matrix (Decision 20) | 2 |
| API routes | 1 |
| CLI (`run` group, Rich `watch`, `say`, `stop`, `resume`, `list`, `workspace`) | 2 |
| **Total** | **23.5** |

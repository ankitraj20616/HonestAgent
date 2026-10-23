# TDD — M3: Desktop UI v1

**Document type:** Technical Design Document (TDD)
**Milestone:** M3 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`): new screen and component names, status function, task list across projects, one WebSocket topic for all projects, changes against main in Files
**Estimated effort:** 37.5 hours
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. Every decision says *why*.
**Related documents:** `FSD_M3_desktop_ui_v1.md`, `../../TDD-tech-design-doc.md` (sections 4.1, 4.11, 9, 11, 14, 16 Q4), `../../TECH_STACK.md` (sections 1, 4), `../M2_agent_runs_worktrees/TDD_M2_agent_runs_worktrees.md`, `../M4_checks_proof_card/TDD_M4_checks_proof_card.md`
**Screens:** prototype views `home`, `homeEmpty`, `board`, `newTask`, `todoTask`, `work`, `question`, `terminal`, `docs`, `history`, `details`, `files`, `projectFiles`, `commandBar`, `quickCapture`, `settings`, `settingsAgents`, `settingsHealth` in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. The goal in one sentence

Build the Tauri 2 + React window that shows and drives everything M1 and M2 already do in the daemon, for every project at once — live, under 300 ms per event — while holding no business logic and never owning a run.

---

## 2. Read this first — rules this work must not break

1. **The UI holds no business logic** (CLAUDE.md rule 1, core 11.3). It calls the API and renders events. It never decides a stage move, a status, a cost total, a "today" or "this week" boundary, or what changed against `main`.
2. **CLI first** (rule 2). Every new daemon feature in M3 (`open`, settings, task list across projects, status, changes against main) also has a CLI command. Exception: tiny edits (Decision 12).
3. **Every action is an event** (rule 4). A tiny edit emits an event.
4. **No hard-coded values** (rule 7). Daemon: `config.py`. UI: `desktop/src/config.ts`. Rust: `src-tauri/src/config.rs`.
5. **Never call real agents in tests** (rule 8). UI tests use events produced by FakeAdapter from M0 fixtures.
6. **Closing the window never stops a run** (NF3). The daemon owns all processes.
7. **Stage rules stay in `ALLOWED_MOVES`** (rule 5). The 4 statuses only group stages; they never allow or block a move.
8. **Git through subprocess with a list of args** (rule 6). The diff code never builds a shell string.

---

## 3. What already exists (do not rebuild)

| Thing | From | Used for |
|---|---|---|
| REST: projects, tasks, stage, brief, research, health | M1 | Home, Board view, Goal card, Health |
| `saarthi task list --all-projects` (CLI) | M1 | Now backed by one `GET /tasks` call (Decision 22) |
| WebSocket `/ws` with `subscribe` + `last_event_id` replay, token auth | M1 | Live updates |
| `settings` table | M1 | `/settings` endpoint (M3) |
| `projects.default_branch`, `workspace/git.py` `run_git(args, cwd)` | M1 | Base for changes against main (Decision 23) |
| Runs API, workspace API, `active_run` and `needs_input` fields | M2 (Decision 18) | Task page, Home |
| Run start guard (`409 stage_not_allowed`, `409 run_active`) | M2 | `can_start` (Decision 21) |
| `PtyShellAdapter` (ConPTY via `pywinpty` on Windows), `terminal.output`, `GET /runs/{id}/events?terminal=true` | M2 | More → Terminal |
| Daemon `Notifier` (OS notifications) | M2 | Fallback when no window |
| Data and config folders from `platformdirs` | M2 | Token file, plan docs |
| Event payload Pydantic models (`schemas/events.py`) | M1 + M2 | TypeScript event types |
| Tauri + xterm.js + CodeMirror spike (Linux, macOS, Windows in CI) | M0 spike 4 | Starting point for `desktop/` |

---

## 4. Technical decisions

### Decision 1 — The webview talks to the daemon directly; Rust stays thin
React calls `http://127.0.0.1:7878/api/v1` and `ws://…/ws` itself. Rust only: finds/starts the daemon, hands over `{baseUrl, token}`, shows native notifications, registers the global shortcut, and keeps a single instance. **Why:** the UI stays a plain web app, so plan B (core 16 Q4: same UI in a browser) needs no rewrite, and the Go-rewrite path (TECH_STACK 2.4) stays open.

### Decision 2 — CORS + CSP for the webview origin **(new)**
Daemon adds `CORSMiddleware` with `CORS_ALLOWED_ORIGINS` (`tauri://localhost`, `http://tauri.localhost`, Vite dev `http://localhost:1420`). `tauri.conf.json` CSP: `connect-src http://127.0.0.1:7878 ws://127.0.0.1:7878`. **Why:** the webview origin differs from the daemon's; the token still guards every call. (`http://tauri.localhost` is the origin on Windows.)

### Decision 3 — Start or connect to the daemon from Rust
On launch: read the token file (in the Saarthi config folder; Rust uses the `dirs` crate, which gives the same folders as `platformdirs` on each OS); `GET /health` (timeout `HEALTH_TIMEOUT_MS`). On failure: spawn `saarthi daemon start` (binary from env `SAARTHI_CLI` or `config.rs` default), detached and with no pipes held: `process_group(0)` on Linux and macOS, `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP` on Windows. Poll `/health` every `DAEMON_POLL_MS` up to `DAEMON_START_TIMEOUT_MS`; re-read the token (first start creates it). **Why:** the daemon must not be a child the window can take down with it. M9 swaps the CLI for the bundled sidecar binary; this code path stays.

### Decision 4 — Generated types for REST **and** events **(new)**
`scripts/gen-types.sh`:
1. `uv run python -m saarthi.api.export_schema` writes `openapi.json` and `events.schema.json` (JSON Schema of the `EventEnvelope` discriminated union from `schemas/events.py`). No running daemon needed.
2. `openapi-typescript` -> `desktop/src/api/schema.d.ts`; `json-schema-to-typescript` -> `desktop/src/api/events.d.ts`.
3. Client: `openapi-fetch` typed by `schema.d.ts`.

Generated files are committed. A daemon test regenerates into a temp dir and fails if they differ. **Why:** core 4.1 asks for an OpenAPI client, but WebSocket events are not in OpenAPI; without the second step the event cards would be untyped.

### Decision 5 — State: TanStack Query for server data, Zustand for UI and live buffers
- Query keys: `["projects"]`, `["tasks", scope, filters]` (`scope` = project id or `"all"`), `["task", id]`, `["runs", taskId]`, `["run", id]`, `["workspace", taskId]`, `["brief", taskId]`, `["settings"]`, `["health"]`, `["docs", taskId]`, `["doc", taskId, docId]`, `["files", root, path]`, `["changes", root]`, `["diff", root, path]` (`root` = `task:<id>` or `project:<id>`).
- `["projects"]` refetches on window focus. **Why:** a project added from the CLI shows without a new event type (M1 open question 1: no `project.*` events).
- Zustand: `ui` (current project tab, theme, command bar, scroll pause, "Show detailed stages", open file tabs), `connection` (ws status, last_event_id), `stream` (per-run event arrays, capped at `STREAM_MAX_EVENTS`), `latency` (last 200 samples).
- `eventRouter.ts` maps each event type to "patch this query" or "invalidate this query" or "append to stream". It contains no rules. **Why:** one place shows how every event reaches the screen; easy to test with fixtures.

### Decision 6 — One WebSocket, hello frame, topic routing table **(new)**
- Client sends first `{"hello": {"client": "desktop", "notifications": true}}`, then `{"subscribe": [...], "last_event_id": N}`.
- Desktop subscribes to **one** topic for all projects, `board:all` **(new)**, plus `task:<id>` and `run:<id>` for the open Task page.
- Daemon `api/ws_topics.py` (one table): `board:all` gets `task.*`, `brief.saved`, `run.*`, `agent.needs_input`, `agent.cost`, `workspace.*` of **every** project. `board:<pid>` (same events, one project) stays for other clients. `task:` and `run:` get all events of that task/run. `terminal.output` goes only to `run:`.
- Reconnect: backoff `WS_BACKOFF_START_MS` doubling to `WS_BACKOFF_MAX_MS` with jitter. On reconnect, resend hello + subscribe with `last_event_id`, then invalidate all queries once. Events with `id: null` (terminal) never update `last_event_id`. Drop events with `id <= last_event_id` (duplicates from replay).

**Why:** Home shows all projects (F1.5), so one topic is simpler than one per project and needs no re-subscribe when a project is added. The board must not drown in `agent.*` noise, but must hear about `agent.needs_input`. The invalidate-after-reconnect step heals anything replay could not.

### Decision 7 — Native notifications replace the daemon's while a window is open **(new, daemon change)**
`Notifier` skips its OS notification when the WS hub has a connected client whose hello says `client: "desktop", notifications: true`. The desktop shows `tauri-plugin-notification` alerts (Linux, macOS, Windows) for `agent.needs_input`, `run.finished`, `run.failed`, skipping the task whose Task page is focused. If the OS denies permission, hello sends `notifications: false` and the daemon keeps notifying. **Why:** exactly one alert per event (FSD F19.1).

### Decision 8 — The board asks the daemon for allowed moves **(new, response change)**
Task responses gain `next_stages: list[{stage, status}]`: user-allowed targets from `ALLOWED_MOVES` for the current stage (guards not evaluated), each with its status (Decision 21). While dragging, only the columns that hold one of those statuses highlight. On drop: if the column holds one allowed stage, move to it; if more than one, show a small stage menu. Then the card shows a pending state, `POST /tasks/{id}/stage {to}`; `200` -> apply; `409` -> snap back + toast with `detail`. No optimistic final move. Drop on **Working** opens Start on the Task page instead. **Why:** the UI must not copy the stage table (rule 5) or the status table. Guards (like "Ready needs a goal") need the daemon anyway. Depends on M1 marking `by = user | system` per row (FSD open question 5).

### Decision 9 — Activity: card map, frame batching, virtual list
- `components/cards/index.ts`: `Record<EventType, CardComponent>`; missing type -> `RawCard`.
- Initial load: `GET /runs/{id}/events?after=0` paged to the end, then live WS events.
- Incoming events are buffered and flushed once per `requestAnimationFrame`.
- `@tanstack/react-virtual` renders only visible cards. Auto-scroll unless paused; scrolling up pauses; "New events ↓" chip.
- Older events beyond `STREAM_MAX_EVENTS` are dropped from memory; "Load older" fetches them again.
- Card labels use the run's agent name ("Claude has a question", "Codex has a question"), from `run.agent` and a display-name map in `config.ts`.
**Why:** 300 ms target with thousands of events on the slowest webview (WebKitGTK on Linux).

### Decision 10 — Measure the 300 ms target in the app **(new)**
For each event with an `id`, `latency = render_commit_time − Date.parse(event.ts)` (same machine clock). Kept in `stores/latency.ts` (last 200), shown in Settings → Health as p50/p95. Daemon side: M2 publishes on `readline()` with no batching; `ts` is set at publish. **Why:** "Done when" needs a number, and this measures daemon→UI (agent stdout→publish is a few ms in M2's reader and is checked by a daemon test with a timestamped fake binary).

### Decision 11 — Terminal: keystrokes and resize over the WebSocket **(new, daemon change)**
- Client frames: `{"terminal_input": {"run_id", "data_b64"}}`, `{"terminal_resize": {"run_id", "cols", "rows"}}`.
- Daemon: WS handler -> `RunManager.terminal_input()` / `terminal_resize()` -> adapter. `AgentAdapter` gains `resize(h, cols, rows)` with a default no-op; `PtyShellAdapter` sets `TIOCSWINSZ` and sends `SIGWINCH` on Linux and macOS, and calls the `pywinpty` resize on Windows (ConPTY, M2).
- View open: `GET /runs/{id}/events?terminal=true` (scrollback), then live `terminal.output` on `run:<id>`.
- xterm.js with `@xterm/addon-fit` and `@xterm/addon-web-links`; theme from CSS tokens.
**Why:** a REST call per keystroke adds lag and can reorder keys. Resize must be live for TUIs like `claude`.

### Decision 12 — Tiny edits (F17.3) are in M3, tightly limited **(new endpoint)**
`PUT /projects/{id}/files {task_id, path, content, base_sha256}`. Rules: task must have a worktree; no active run (`409 run_active`); file must exist (no create/delete/rename); current sha256 must equal `base_sha256` (`409 stale`); size ≤ `PEEK_MAX_BYTES`; atomic write (temp file + rename, keep mode and line endings). Emits `agent.file_changed {path, change: "edit", by: "user", added, removed, diff}` with `run_id: null`. Main repo: `403 main_repo_read_only`. No CLI command: from a terminal, the user already has `$EDITOR` (a named exception to rule 2). **Why:** the ownership map gives F17.1-F17.4 to M3. The limits keep it a "fix a typo" tool, not an editor, and stop clashes with an agent. Reusing `agent.file_changed` with `by: "user"` adds no new event type to core 6.2 and makes the edit show as a normal file card.

### Decision 13 — "Open in tools" runs in the daemon **(new endpoint)**
`POST /projects/{id}/open {task_id?, target: "folder" | "terminal" | "editor", path?, line?}`. Root = task worktree if `task_id`, else repo. Command templates from settings (`folder_command`, `terminal_command`, `editor_command`), split with `shlex.split` **before** substituting `{path}` and `{line}` in each arg, spawned detached with an args list. Defaults depend on the OS (section 10). CLI: `saarthi open <task-or-project> [--folder | --terminal | --editor] [--file P] [--line N]`. **Why:** one implementation for UI and CLI (rule 1). Risk (Linux): needs `DISPLAY`/`WAYLAND_DISPLAY`; the daemon gets them when started by the app or a desktop terminal; the M9 background mode on Linux (systemd user unit) must import them.

### Decision 14 — Files read endpoints (task copy and project repo)
- `GET /projects/{id}/files?path=&task=` -> dir: `{kind: "dir", entries: [{name, kind, size}]}` (dirs first, hides `PEEK_HIDDEN_NAMES`); file: `{kind: "file", content | null, sha256, size, binary, too_big}`.
- Root = the task's worktree when `task` is given (`files` view), else the project's main repo (`projectFiles` view, F17.8). Same code, read-only for the main repo.
- `GET /projects/{id}/search?q=&kind=text|name&task=` -> text: `rg --json --fixed-strings --max-count … --max-filesize …` -> `[{path, line, col, preview}]`; name: `rg --files` filtered by case-insensitive substring. Capped at `SEARCH_MAX_RESULTS`, killed after `SEARCH_TIMEOUT_SEC`.
- Path safety: `(root / path).resolve()` must be inside `root.resolve()`, else `400 bad_path` (blocks `..` and symlinks out). Paths in responses always use `/`, on Windows too.
- File tabs are UI state only (Zustand `ui`), not stored in the daemon.

### Decision 15 — Settings endpoint over the M1 `settings` table
`GET /settings` -> `{values, defaults}`; `PUT /settings` partial, validated by `SettingsModel` (Pydantic): `theme` (`dark` | `light` | `system`, default `dark`), `editor_command`, `terminal_command`, `folder_command`, `max_parallel_runs` (1-16), `worktree_root` (absolute, writable), `claude_path`, `codex_path`. Unknown key -> `422`. A settings change is written to `daemon.log`, not to the `events` table, because events belong to a task and core 6.2 has no settings group **(new — owner to confirm this is fine under rule 4)**. CLI: `saarthi settings get|set <key> <value>`. `max_parallel_runs` applies at the next dequeue; `worktree_root` applies to new worktrees only. "Max auto-fix rounds" is added by M4. Settings sections in the UI (General, Projects, Agents, Health) are only a layout; the endpoint is one. **Why:** F21.1; the daemon validates, the UI only renders a form.

### Decision 16 — Project list counts and today's cost **(new, response change)**
`GET /projects` items gain `open_tasks`, `running_runs`, `needs_you`, `today_cost_usd` (runs started since local midnight, computed in the daemon). `needs_you` counts tasks whose status is `needs_you` (Decision 21). **Why:** "today" and "needs you" are rules; they live in the daemon. M8's Safety and cost view replaces the cost number.

### Decision 17 — Routing and windows **(new)**
`react-router` (not in TECH_STACK; small and well known). Routes: `/` Home (`?project=<id>|all`), `/new` New task, `/p/:projectId/board`, `/p/:projectId/files`, `/t/:taskId/:view?` (`activity|terminal|docs|history|details`), `/t/:taskId/files`, `/settings/:section?` (`general|projects|agents|health`), `/capture`. Two Tauri windows: `main` and `capture` (small, undecorated, always on top, hidden until the shortcut). `tauri-plugin-single-instance` forwards `--quick-capture` to the running app. The last project tab and quick capture's last project are kept in `localStorage` (a per-machine convenience, not state). **Why:** each prototype view maps to one route, so a link can open any screen.

### Decision 18 — Goal editor uses CodeMirror 6 markdown
Goal and Notes: CodeMirror with `@codemirror/lang-markdown` (already a dependency; Milkdown is "later" in TECH_STACK). "What done looks like" (the brief's acceptance criteria): a list of inputs with add/remove/reorder. Focus paths: chips. Save -> `PUT /tasks/{id}/brief`. New task = `POST /projects/{id}/tasks` then `PUT /tasks/{id}/brief`, then (on **Start**) `POST /tasks/{id}/runs`; each step's error shows on the form. **Why:** no new endpoint; the UI word "Goal" is only a label for the `brief`.

### Decision 19 — History data
Use M1's task-events read (`GET /tasks/{id}?include=events`). If it cannot page, M3 adds `GET /tasks/{id}/events?after=&limit=&group=` **(new)**. History filter chips map to event groups (`task`, `run`, `agent`, `workspace`) sent as `group=`. M8 adds undo points and Restore to the same view.

### Decision 20 — Docs view only renders what M2 serves **(new)**
The Docs view uses `GET /tasks/{id}/docs` and `GET /tasks/{id}/docs/content?doc=` (M2 Decision 19). M3 adds no endpoint, table or event.
- **Refresh:** `eventRouter.ts` invalidates `["docs", taskId]` on `doc.saved` and on `agent.file_changed` when `path` ends with `.md`. The open doc `["doc", taskId, docId]` is invalidated on the same events. Both events already reach `task:<id>` (it gets all events of that task).
- **Markdown:** rendered with `react-markdown` + `remark-gfm`. Raw HTML is not rendered (no `rehype-raw`), so a doc cannot inject markup. Mermaid is a plain code block (Later, F22.6).
- **Outline:** built from the rendered headings (`DocOutline`), with ids from `github-slugger` style slugs made in `lib/slug.ts` (no new library).
- **Open in my editor:** calls the existing `POST /projects/{id}/open` (Decision 13) with `task_id`, `target: "editor"` and the doc path. Plan docs live in the data folder (`source: "data"`), so the call passes the absolute path from the doc list.
- **Open: data-folder paths:** `/projects/{id}/open` also accepts a path inside the Saarthi data folder, for plan docs only. The daemon resolves the path and checks that it stays inside `<data folder>/tasks/<task_id>/docs/` (data folder from `platformdirs`, M2). Any other path outside the worktree is refused (`400 bad_path`).

**Why:** the daemon already decides what a doc is; the UI must not copy that logic (rule 1). A plain code block for Mermaid keeps the bundle small.

### Decision 21 — Status is a pure function in the daemon (F2.9) **(new)**
`core/status.py`:

```python
class Status(StrEnum):
    TODO = "todo"; WORKING = "working"; NEEDS_YOU = "needs_you"; DONE = "done"; HIDDEN = "hidden"

STATUS_BY_STAGE: dict[Stage, Status] = {
    Stage.INBOX: Status.TODO, Stage.RESEARCH: Status.TODO, Stage.READY: Status.TODO,
    Stage.RUNNING: Status.WORKING, Stage.VERIFYING: Status.WORKING,
    Stage.NEEDS_YOU: Status.NEEDS_YOU, Stage.FAILED: Status.NEEDS_YOU, Stage.REVIEW: Status.NEEDS_YOU,
    Stage.SHIPPED: Status.DONE, Stage.PARKED: Status.HIDDEN, Stage.ARCHIVED: Status.HIDDEN,
}

def status_for(stage: Stage, *, waiting_on_user: bool = False) -> Status: ...
def row_action(stage: Stage, *, can_start: bool) -> str | None: ...  # "answer" | "open" | "start" | None
```

- `status_for` reads the table. `waiting_on_user=True` turns any non-hidden status into `needs_you`. In M3 it is always `False`. Later milestones set it from their own fact: M5 (sync conflict), M7 (side by side waiting for a pick) and M10 (Jira write-back waiting). They do not edit the table and do not add parameters; the caller ORs its facts into `waiting_on_user`.
- `row_action`: `needs_you` -> `"answer"`; `failed`, `review` -> `"open"` (M4 changes `failed` to `"fix"`, M5 changes `review` to `"review"`); To do stages -> `"start"` when `can_start`, else `"open"`; others -> `None`.
- `can_start` = the M2 run-start guard evaluated without side effects (stage allows `Running`, brief has a goal, no active run). One function, used by both `POST /tasks/{id}/runs` and `TaskOut`.
- `TaskOut` (all task responses) gains `status`, `action`, `can_start`, `project_name`.
- A test checks that every `Stage` value is a key of `STATUS_BY_STAGE` (no stage forgotten when one is added).

**Why:** the status is a rule, so it lives in the daemon (rule 1), next to the stages but separate from `ALLOWED_MOVES` (rule 5): it groups, it never allows or blocks. A pure function is easy to test with no DB.

### Decision 22 — One task list across projects (F1.5) **(new endpoint)**
`GET /tasks?project=all|<id>&status=&stage=&label=&agent=&q=&include_hidden=false&done_days=` -> `{items: [TaskOut], counts: {needs_you, working, todo, done}}`.
- `project=all` merges every project. Sort: status order (`needs_you`, `working`, `todo`, `done`), then priority, then `updated_at` desc. Same filter code as M1's `/projects/{project}/tasks`, which stays and returns the same `TaskOut`.
- `status` and `stage` are repeatable. Hidden (Parked, Archived) only with `include_hidden=true`.
- `done_days` (default `HOME_DONE_DAYS`, `0` = all): Done tasks show only if they reached Shipped in that many days. Shipped time = `ts` of the task's last `task.stage_changed` event with `to = "shipped"` (one indexed query on `events`).
- `counts` are computed in the daemon over the filtered set (before `done_days`), so the Needs-you pill and group headers never sum in the UI. The pill uses `project=all` with no filter.
- CLI: `saarthi task list --all-projects` now makes this one call and prints one merged table with a `PROJECT` column. `task list` gains a `STATUS` column and `--status` (`todo|working|needs-you|done`, repeatable).

**Why:** Home's **All projects** and the pill need one merged, counted list (F1.5). One endpoint is cheaper than N calls plus merging in the UI, and keeps sorting and counting in the daemon.

### Decision 23 — Changes against main (F17.5, F17.8) **(new endpoints)**
`workspace/changes.py`:
- `base_ref(root, default_branch) -> str`: `refs/remotes/<DEFAULT_REMOTE>/<default_branch>` if that ref exists, else the local `<default_branch>`. M4 (diff stats) and M5 (change story) call the same helper.
- `base_sha(root, default_branch) -> str`: `["git", "merge-base", "HEAD", base_ref(...)]` in `root`; if no base ref exists, `424 no_base` with the fix text. **Why merge base:** commits added to `main` after the task started must not look like the task's changes.
- `changed_files(root, base) -> list[ChangedFile]`: `["git", "diff", "--no-color", "-M", "-z", "--numstat", base]` and `["git", "diff", "--no-color", "-M", "-z", "--name-status", base]` (base vs working tree, so changes not committed are included), plus `["git", "ls-files", "--others", "--exclude-standard", "-z"]` for new untracked files (`change: "added"`, counts from the line count). Capped at `CHANGES_MAX_FILES` (`truncated: true`).
- `file_diff(root, base, path) -> str`: `["git", "diff", "--no-color", "-M", base, "--", path]`; untracked: `["git", "diff", "--no-color", "--no-index", "--", os.devnull, path]` (exit code 1 means "has changes", not an error). Over `DIFF_MAX_BYTES` -> `413 too_big`.
- Root = task worktree (with `task=`) or the project's main repo. Path safety as Decision 14.
- Endpoints: `GET /projects/{id}/changes?task=` -> `{base_branch, base_sha, files: [{path, old_path, change, added, removed, binary}], truncated}`; `GET /projects/{id}/changes/diff?task=&path=` -> `text/x-diff` (same format as M5's `/tasks/{id}/review/diff`).
- UI: `lib/diff.ts` parses unified diff text into hunks for drawing only. CodeMirror shows added lines with a line class and removed lines as block widgets ("Full file"), or only hunks with `DIFF_CONTEXT_LINES` around them ("Show changes"). `eventRouter.ts` invalidates `["changes", root]` and `["diff", root, path]` on `agent.file_changed`.
- CLI: `saarthi files changes <task|project> [--json]` (table: change, `+a −r`, path) and `saarthi files diff <task|project> <path>` (prints the diff).

**Why:** the user mostly opens Files to see what the agent did (P2). git already knows the answer; the daemon only runs it with list args (rule 6). Returning plain diff text keeps the endpoint tiny and lets M5's diff view reuse the same `lib/diff.ts`. M4 and M5 reuse `base_ref()` / `base_sha()`, so Files and Check and ship always count against the same base. **Why the remote ref first:** after an "Update from main" (M5) the local `main` may be behind; the remote ref keeps upstream commits out of the task's changes.

---

## 5. Modules and files

### Daemon (`daemon/src/saarthi/`)

| File | Change |
|---|---|
| `api/app.py` | CORS middleware (Decision 2) |
| `api/export_schema.py` | Writes `openapi.json` + `events.schema.json` |
| `api/ws.py`, `api/ws_topics.py` | hello frame, topic table with `board:all`, terminal frames |
| `api/routes/settings.py`, `core/settings.py` | `/settings`, `SettingsModel` |
| `api/routes/tasks.py` | `GET /tasks` across projects (Decision 22) |
| `core/status.py` | `Status`, `STATUS_BY_STAGE`, `status_for()`, `row_action()` (Decision 21) |
| `core/runs.py` (M2) | `can_start()` extracted from the run-start guard |
| `api/routes/files.py`, `core/peek.py`, `core/search.py` | Files read, search, tiny edit |
| `api/routes/changes.py`, `workspace/changes.py` | Changes against main (Decision 23) |
| `api/routes/open.py`, `core/opener.py` | Open in tools |
| `core/notify.py` | Skip the OS notification when a desktop client handles notifications |
| `agents/base.py`, `agents/pty_shell.py` | `resize()` |
| `schemas/tasks.py`, `schemas/projects.py` | `next_stages`, `status`, `action`, `can_start`, `project_name`; project counts + `needs_you` + `today_cost_usd` |
| `cli/open.py`, `cli/settings.py`, `cli/files.py`, `cli/tasks.py` | `saarthi open`, `saarthi settings`, `saarthi files changes|diff`, `task list --all-projects --status` |

### Tauri (`desktop/src-tauri/src/`)

| File | What |
|---|---|
| `main.rs` | Plugins: notification, global-shortcut, single-instance; windows `main`, `capture` |
| `daemon.rs` | Connect or start (Decision 3), per-OS detach |
| `commands.rs` | `get_connection`, `show_capture`, `notify(title, body, task_id)` |
| `config.rs` | Timeouts, default CLI name, shortcut |

### React (`desktop/src/`)

| Path | What |
|---|---|
| `config.ts` | All UI constants (section 10) |
| `api/schema.d.ts`, `api/events.d.ts` | Generated |
| `api/client.ts`, `api/queries.ts` | `openapi-fetch` client with token; Query hooks |
| `api/ws.ts`, `api/eventRouter.ts` | `WsClient` (Decision 6); event -> cache/stream |
| `stores/ui.ts`, `stores/connection.ts`, `stores/stream.ts`, `stores/latency.ts` | Zustand |
| `lib/slug.ts` | Heading text -> anchor id for the outline |
| `lib/diff.ts` | Unified diff text -> hunks (drawing only) |
| `lib/tauri.ts`, `lib/theme.ts` | Tauri wrappers (mockable); dark and light token sets for app, xterm, CodeMirror |
| `components/layout/` | `TopBar` (logo, `ProjectPicker` with project menu, search, `NeedsYouPill`, Settings), `ReconnectBanner` |
| `components/CommandBar.tsx` | shadcn `Command` (cmdk) |
| `components/cards/` | `MessageCard`, `ThinkingCard`, `ToolCallCard`, `ToolResultCard`, `FileChangedCard`, `QuestionCard`, `RunStatusCard`, `RawCard` |
| `screens/Home/` | `index` (project tabs + All projects), `StatusGroup` (Needs you / Working / To do / Done this week), `TaskRow`, `EmptyHome` |
| `screens/Board.tsx` | `@dnd-kit/core` 4 status columns, "Show detailed stages", stage menu, filter bar |
| `screens/NewTask.tsx` | Project, title, Goal, What done looks like, agent picker, More options, Start |
| `screens/TaskPage/` | `index` (header, More ▾ menu), `GoalCard`, `StartPanel`, `Activity`, `MessageBox`, `TerminalView`, `HistoryView`, `DetailsView` (workspace, runs list, open in tools) |
| `screens/TaskPage/DocsView/` | `index` (3 columns, count), `DocsList` (groups Plans / Changed / Pinned, badges), `DocView` (react-markdown + remark-gfm, header with Open in my editor / Copy path, too-big placeholder), `DocOutline` (heading list, click to jump) |
| `screens/Files/` | `index` (task copy or project repo), `FileTree`, `FileTabs`, `CodeViewer` (CodeMirror read-only + edit mode + inline changes), `ChangedList`, `SearchPanel` |
| `screens/Settings/` | `index` (sections), `General`, `Projects`, `Agents`, `Health` |
| `screens/QuickCapture.tsx` | New task shortcut window |
| `test/fixtures/events/*.json` | Normalized events from M0 fixtures (generated, Decision 4 script step 4: `uv run python -m saarthi.agents.dump_fixture_events`) |

---

## 6. Data model changes

None. No new tables, no new columns, no migration. New `settings` keys only (Decision 15). Status (Decision 21) is computed, not stored. The Docs view reads files through M2's API (Decision 20). Changes against main are read from git each time (Decision 23).

---

## 7. Events added

None (ownership map). The Docs and Files views listen to M2's `doc.saved` and `agent.file_changed`; they add none. One payload extension: `agent.file_changed` may carry `by: "user"` with `run_id: null` (Decision 12). WebSocket gains client frames `hello`, `terminal_input`, `terminal_resize` (Decisions 6, 11) — these are control messages, not events — and the topic `board:all`.

---

## 8. API and CLI added

| Method | Path | Body / query | Response / errors |
|---|---|---|---|
| GET | `/settings` | - | `{values, defaults}` |
| PUT | `/settings` | partial `SettingsModel` | `{values}`; `422` |
| GET | `/tasks` **(new)** | `?project=all\|<id>&status=&stage=&label=&agent=&q=&include_hidden=&done_days=` | `{items: [TaskOut], counts}` (Decision 22); `404` unknown project |
| GET | `/projects/{id}/files` | `?path=&task=` | dir or file (Decision 14); `400 bad_path`, `404` |
| PUT | `/projects/{id}/files` **(new)** | `{task_id, path, content, base_sha256}` | `{sha256}`; `403`, `409 run_active`, `409 stale`, `413` |
| GET | `/projects/{id}/search` | `?q=&kind=text\|name&task=` | `{results, truncated}`; `424 rg_missing` |
| GET | `/projects/{id}/changes` **(new)** | `?task=` | `{base_branch, base_sha, files, truncated}`; `424 no_base` |
| GET | `/projects/{id}/changes/diff` **(new)** | `?task=&path=` | `text/x-diff`; `400 bad_path`, `404`, `413 too_big` |
| POST | `/projects/{id}/open` **(new)** | `{task_id?, target, path?, line?}` | `202`; `400 bad_path`, `424 command_failed {stderr}` |
| GET | `/tasks/{id}/events` **(new, only if M1 lacks paging)** | `?after=&limit=&group=` | `{events, next_after}` |

Response changes: task `next_stages` (with status), `status`, `action`, `can_start`, `project_name`; project `open_tasks`, `running_runs`, `needs_you`, `today_cost_usd`.

| CLI | Output |
|---|---|
| `saarthi task list [--all-projects] [--status S]…` | table with `STATUS` (and `PROJECT` with `--all-projects`); `--json` |
| `saarthi files changes <task\|project> [--json]` | table: change, `+a −r`, path; "No changes against main." |
| `saarthi files diff <task\|project> <path>` | the unified diff |
| `saarthi open <task\|project> [--folder\|--terminal\|--editor] [--file P] [--line N]` | `Opened <path> in <app>.` |
| `saarthi settings get [key]` / `saarthi settings set <key> <value>` | table / `Saved.`; `--json` |
| `saarthi dev replay <fixture> --task <id> [--gap-ms 20]` **(new, dev only, needs daemon `--dev`)** | Replays a fixture through `FakeAdapter` as a real run, for UI and latency checks |

---

## 9. Key flows

### 9.1 App start
1. Rust `daemon::connect_or_start()` (Decision 3). Failure -> error screen with the `daemon.log` path and **Retry**.
2. React gets `{baseUrl, token}` from `get_connection`, builds the client, opens the WS (hello, subscribe `board:all`).
3. Home queries load (`GET /projects`, `GET /tasks?project=<last tab>`, `GET /tasks?project=all` for the pill); events patch them.

### 9.2 Live event to screen
Agent line -> M2 mapper -> `bus.publish` (sets `ts`) -> WS `run:` topic -> `WsClient` -> `eventRouter` -> `stream` store buffer -> rAF flush -> virtual list renders -> latency sample.

### 9.3 Claude has a question
`agent.needs_input` on `board:all` -> router invalidates `["task", id]`, `["tasks", *]`, `["projects"]` -> row under Needs you, pill count, glowing card. Native alert (Decision 7). User clicks an option -> `POST /runs/{id}/input {text}` -> `task.stage_changed` -> Home, board and header update.

### 9.4 Drag on the board
Drag start -> highlight columns from `next_stages[].status` -> drop -> (stage menu if more than one stage) -> pending -> `POST /stage` -> `200` apply / `409` revert + toast.

### 9.5 Tiny edit
Files -> **Edit** (disabled if `active_run` or main repo) -> CodeMirror editable -> **Save** -> `PUT /files` with `base_sha256` -> `200` new sha / `409 stale` -> "File changed on disk. Reload?".

### 9.6 Changes against main
Files opens -> `GET /changes?task=` -> **Changed (n)** list + tree badges -> click a file -> `GET /files` (content) + `GET /changes/diff` (hunks) -> `lib/diff.ts` -> CodeMirror marks. `agent.file_changed` -> invalidate both.

---

## 10. Config added

Daemon `config.py`:

| Constant | Default |
|---|---|
| `CORS_ALLOWED_ORIGINS` | `["tauri://localhost", "http://tauri.localhost", "http://localhost:1420"]` |
| `PEEK_MAX_BYTES` | `1_000_000` |
| `PEEK_HIDDEN_NAMES` | `[".git"]` |
| `RG_BIN`, `SEARCH_MAX_RESULTS`, `SEARCH_TIMEOUT_SEC`, `SEARCH_MAX_FILESIZE` | `"rg"`, `200`, `5`, `"1M"` |
| `HOME_DONE_DAYS` | `7` |
| `CHANGES_MAX_FILES`, `DIFF_MAX_BYTES` | `500`, `1_000_000` |
| `DEFAULT_REMOTE` | `"origin"` (used by `base_ref`; M5 adds a `[project] remote` override) |
| `SETTINGS_DEFAULTS` | `theme="dark"`, plus M2's `max_parallel_runs`, `worktree_root`, `claude_path`, `codex_path`, plus the open commands from `OPEN_COMMAND_DEFAULTS` for the current OS |
| `OPEN_COMMAND_DEFAULTS` | per `sys.platform`: Linux `editor/folder = "xdg-open {path}"`, `terminal = "x-terminal-emulator --working-directory={path}"`; macOS `editor/folder = "open {path}"`, `terminal = "open -a Terminal {path}"`; Windows `editor/folder = "explorer {path}"`, `terminal = "wt -d {path}"` |
| `MAX_PARALLEL_RUNS_RANGE` | `(1, 16)` |

UI `desktop/src/config.ts`: `WS_BACKOFF_START_MS = 500`, `WS_BACKOFF_MAX_MS = 10000`, `STREAM_MAX_EVENTS = 20000`, `EVENTS_PAGE_SIZE = 500`, `LATENCY_SAMPLES = 200`, `LATENCY_TARGET_MS = 300`, `QUICK_CAPTURE_SHORTCUT = "Ctrl+Alt+N"`, `TOAST_MS = 5000`, `DOCS_REFRESH_EVENTS = ["doc.saved", "agent.file_changed"]`, `DIFF_CONTEXT_LINES = 3`, `AGENT_DISPLAY_NAMES = {claude: "Claude", codex: "Codex"}`. New UI dependencies: `react-markdown`, `remark-gfm`.

Rust `config.rs`: `HEALTH_TIMEOUT_MS = 800`, `DAEMON_POLL_MS = 200`, `DAEMON_START_TIMEOUT_MS = 8000`, `DEFAULT_CLI = "saarthi"`.

---

## 11. Error handling

| Case | What we do |
|---|---|
| Daemon does not come up | Error screen: last 20 lines of `daemon.log`, **Retry**, the manual command. |
| Token missing / `401` | Re-read the token via `get_connection` and retry once; then error screen. |
| WS drops | `ReconnectBanner`, backoff reconnect, replay, invalidate queries. |
| Stage move refused | Snap back, toast with the daemon's `detail`. |
| Start refused (`409`/`424`) | Start panel stays open, shows the message and the fix text. |
| `409 stale` on save | Dialog: Reload (lose my edit) or Copy my text. |
| File too big / binary | Viewer placeholder + **Open in my editor**. |
| Diff too big (`413`) | "Too big to show changes here" + **Open in my editor**. |
| No base branch (`424 no_base`) | **Changed** shows the message and the fix text ("fetch `main`" or set `default_branch` in `project.toml`). |
| `rg` missing | Search box disabled with reason; Health shows it red. |
| Open command fails | Toast with stderr; link to Settings. |
| Notification permission denied | hello `notifications: false` -> daemon keeps its OS notification. |
| Unknown event type | `RawCard`; router ignores it for caches. |
| Global shortcut fails to register | Settings shows the command to bind as a desktop shortcut by hand. |

---

## 12. Tests to write

**Daemon (pytest):**

| File | Proves |
|---|---|
| `unit/test_status.py` | every `Stage` is in `STATUS_BY_STAGE`; each stage maps per FSD F2.9; Parked/Archived -> `hidden`; `waiting_on_user` turns `done`/`todo` into `needs_you` but not `hidden`; `row_action` with and without `can_start` |
| `api/test_tasks_all_projects.py` | 3 tmp projects: `project=all` returns all tasks with `project_name` and `status`; sort by status order; `status=` filter; hidden only with `include_hidden`; `done_days` with a frozen clock; `counts` match the items; CLI `task list --all-projects --status needs-you` |
| `api/test_settings_api.py` | defaults (`theme="dark"`, open commands for the current OS), partial PUT, range/path validation, unknown key 422; CLI `settings set` |
| `api/test_files_api.py` | dir/file shape for a task worktree and for the main repo, hidden names, binary/too big, `..` and symlink escape -> 400 |
| `api/test_files_edit.py` | edit ok + `agent.file_changed {by: "user"}`; main repo 403; active run 409; stale 409; new file refused |
| `api/test_changes_api.py` | tmp repo + worktree: committed, not-committed and untracked changes all listed with right `+/−`; a later commit on `main` is not listed (merge base); rename shows `old_path`; diff for an untracked file; `413` over the limit; `424 no_base`; main repo on clean `main` -> empty; CLI `files changes` and `files diff` |
| `api/test_search_api.py` | text + name search on a tmp repo; cap + `truncated`; timeout; `rg` missing 424 |
| `api/test_open_api.py` | template split before substitution (path with spaces and `;` stays one arg); fake binary records argv |
| `api/test_ws_topics.py` | `board:all` gets needs_input of two projects but not `agent.message`; `board:<pid>` only its project; `terminal.output` only on `run:` |
| `api/test_ws_terminal_frames.py` | input reaches a `PtyShellAdapter` running `cat`; resize changes `stty size` (skipped on Windows; Windows resize checked in M2's ConPTY test) |
| `unit/test_notifier_desktop.py` | desktop hello with notifications -> no OS notification; `notifications: false` -> OS notification |
| `api/test_task_next_stages.py`, `api/test_project_counts.py` | `next_stages` matches the table for user moves and carries status; `can_start` matches the run-start guard; counts, `needs_you` and today's cost (frozen clock) |
| `api/test_cors.py` | allowed origin gets headers; other origin does not |
| `test_generated_types_current.py` | regenerated `openapi.json` / `events.schema.json` equal the committed ones |

**UI (Vitest + Testing Library, MSW for REST, `mock-socket` for WS):**

| File | Proves |
|---|---|
| `api/ws.test.ts` | hello + subscribe `board:all`; backoff; reconnect sends `last_event_id`; duplicates dropped; `id: null` ignored for replay |
| `api/eventRouter.test.ts` | each fixture event patches/invalidates the right query or stream; `agent.file_changed` invalidates changes and diff |
| `components/cards/cards.test.tsx` | every event type in `test/fixtures/events/*.json` renders its card; unknown -> raw; question card uses the agent's name |
| `screens/Home/Home.test.tsx` | groups render from `status` (no stage logic in the UI); All projects rows show the project name; pill shows `counts.needs_you`; empty state with no projects |
| `screens/Board.test.tsx` | 4 columns; only columns from `next_stages` accept drops; two stages in a column -> menu; 409 reverts with message; drop on Working opens Start; "Show detailed stages" shows the stage |
| `screens/TaskPage/MessageBox.test.tsx` | send, queued (`delivered: false`) text, options as buttons, Close as done |
| `screens/TaskPage/Activity.test.tsx` | 5,000 events render < 200 DOM cards; pause on scroll up; "New events" chip |
| `screens/TaskPage/DocsView.test.tsx` | Groups and badges render from a docs list; empty group shows its quiet line; click shows markdown; outline click scrolls; `doc.saved` and `agent.file_changed` for `*.md` refresh the list (not for `.py`); too-big placeholder; pinned + changed shows once (as served) |
| `screens/Files/CodeViewer.test.tsx` | Edit disabled with active run / main repo; stale dialog; Show changes vs Full file marks the right lines from a diff fixture |
| `lib/diff.test.ts` | parse added / deleted / renamed / no-newline hunks |
| `stores/latency.test.ts` | p50/p95 math |

Playwright end-to-end tests are M9.

---

## 13. Manual verification

1. Run the FSD QA checklist (section 9) on Ubuntu 24.04, once in an X11 session and once in Wayland, with at least 2 projects.
2. Quick smoke check on macOS and Windows: app opens, starts the daemon, Home loads, a FakeAdapter replay shows in Activity, Files shows changes. (Installers are M9; run from `npm run tauri dev`.)
3. Latency: start a FakeAdapter replay of `claude_build_ok` with a 20 ms gap (`saarthi dev replay <fixture> --task T-1`, dev-only command behind `--dev`), open Settings → Health, check p95 < 300 ms. Repeat with a real Claude run.
4. A full real working day from the window, in 2 repos. Note friction in `core_docs/learnings/`.
5. Show `npm test`, `npm run lint`, `npm run typecheck`, `uv run pytest`, `uv run ruff check .`, `uv run pyright` output.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| WebKitGTK (Linux) slow with xterm.js / CodeMirror / long lists | M0 spike 4; rAF batching; virtual lists; xterm WebGL addon off by default (canvas fallback); plan B browser. |
| Global shortcut does not work on Wayland | `--quick-capture` + a desktop custom shortcut, shown in Settings. |
| Daemon spawned by the app inherits a short-lived env | Spawn detached in its own process group (per OS); `saarthi daemon start` daemonizes (M1). |
| UI slowly gains logic ("just compute it here") | Code review rule: any `if stage ===` or stage-to-status map in `desktop/src` needs a reason; `next_stages`, `status`, `action`, counts and totals come from the daemon. |
| Generated types drift from the daemon | Test `test_generated_types_current.py`. |
| Tiny edits clash with an agent | Blocked during active runs + sha check. |
| `main` is missing locally, so no merge base | Fall back to `origin/<default_branch>`; else `424 no_base` with the fix text. |
| Big repos make `git diff` slow | `CHANGES_MAX_FILES` cap; per-file diff only on click; `DIFF_MAX_BYTES`. |
| `open` fails in the Linux background service (M9) without display env | Documented for the M9 systemd user unit (`systemctl --user import-environment`). |
| Line endings and path slashes on Windows | Paths always use `/` in the API; tiny edits keep the file's line endings. |
| 4 weeks is tight for this many screens | Order of work = section 16; Files tiny edit and History filters are the first to cut. |

---

## 15. What this milestone does not do

No new tables or event types. No editing docs, no Mermaid (Later). No research docs or plan in What Claude reads (M6). No Check and ship: no tests and checks, verdict, check dots or "Run tests and checks" action (M4). No what changed groups, comments, Ask Codex to review, Approve and create pull request, cleanup (M5). No "Why Claude changed this", "Mark as looked at" or "Next change" in Files (M5, F17.6, F17.7). No Just research, Lessons and notes, Saved instructions, drafted goal (M6). No Side by side or Gemini CLI (M7). No "What agents may do" picker, undo points or Restore in History, Safety and cost, budget alert (M8). No `?` sheet, first-run setup, full error screens, installers, Playwright (M9). No Jira tickets page (M10).

---

## 16. Effort breakdown

| Task | Hours |
|---|---|
| Tauri shell: connect/start daemon (per OS), token, single instance, notifications, global shortcut | 3 |
| Type generation + API client + CORS | 1.5 |
| WS client, topic table (`board:all`), event router | 2.5 |
| Layout: top bar, project picker + menu, Needs-you pill, dark and light themes, Command bar | 2 |
| Status function + `can_start` + `TaskOut` fields + tests (F2.9) | 1 |
| `GET /tasks` across projects + counts + CLI (F1.5) | 1.5 |
| Home: project tabs, All projects, status groups, empty state | 1.5 |
| Board view: 4 columns, dnd, `next_stages`, stage menu, detailed stages, filters | 3 |
| Quick capture window | 1 |
| New task, Task page shell, Goal card, Start panel, Details (workspace, runs, open in tools) | 3.5 |
| Activity: cards, batching, virtual list, latency | 3 |
| Terminal view + WS terminal frames + `resize()` | 2 |
| Message box + Claude has a question | 1 |
| History view | 1 |
| Files: files/search endpoints, tree, tabs, viewer, open in my editor, tiny edits | 3.5 |
| Changes against main: endpoints, CLI, `lib/diff.ts`, inline marks (F17.5) | 2 |
| Project files screen (F17.8) | 0.5 |
| Settings (General, Projects, Agents, Health) (+ `/settings`, CLI) | 1.5 |
| Docs view: list, markdown view, outline, live refresh + test | 2.5 |
| **Total** | **37.5** |

# TDD — M3: Desktop UI v1

**Document type:** Technical Design Document (TDD)
**Milestone:** M3 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-11
**Estimated effort:** 32.5 hours
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. Every decision says *why*.
**Related documents:** `FSD_M3_desktop_ui_v1.md`, `../../TDD-tech-design-doc.md` (sections 4.1, 4.11, 9, 11, 14, 16 Q4), `../../TECH_STACK.md` (sections 1, 4), `../M2_agent_runs_worktrees/TDD_M2_agent_runs_worktrees.md`, `../M4_checks_proof_card/TDD_M4_checks_proof_card.md`

---

## 1. The goal in one sentence

Build the Tauri 2 + React window that shows and drives everything M1 and M2 already do in the daemon — live, under 300 ms per event — while holding no business logic and never owning a run.

---

## 2. Read this first — rules this work must not break

1. **The UI holds no business logic** (CLAUDE.md rule 1, core 11.3). It calls the API and renders events. It never decides a stage move, a cost total, or a "today" boundary.
2. **CLI first** (rule 2). Every new daemon feature in M3 (`open`, settings) also has a CLI command. Exception: tiny edits (Decision 12).
3. **Every action is an event** (rule 4). A tiny edit emits an event.
4. **No hard-coded values** (rule 7). Daemon: `config.py`. UI: `desktop/src/config.ts`. Rust: `src-tauri/src/config.rs`.
5. **Never call real agents in tests** (rule 8). UI tests use events produced by FakeAdapter from M0 fixtures.
6. **Closing the window never stops a run** (NF3). The daemon owns all processes.

---

## 3. What already exists (do not rebuild)

| Thing | From | Used for |
|---|---|---|
| REST: projects, tasks, stage, brief, research, health | M1 | Deck, Board, brief editor, Health page |
| WebSocket `/ws` with `subscribe` + `last_event_id` replay, token auth | M1 | Live updates |
| `settings` table | M1 | `/settings` endpoint (M3) |
| Runs API, workspace API, `active_run` and `needs_input` fields | M2 (Decision 18) | Task Room, Deck |
| `PtyShellAdapter`, `terminal.output`, `GET /runs/{id}/events?terminal=true` | M2 | Terminal tab |
| `Notifier` with `notify-send` | M2 | Fallback when no window |
| Event payload Pydantic models (`schemas/events.py`) | M1 + M2 | TypeScript event types |
| Tauri + xterm.js + CodeMirror spike | M0 spike 4 | Starting point for `desktop/` |

---

## 4. Technical decisions

### Decision 1 — The webview talks to the daemon directly; Rust stays thin
React calls `http://127.0.0.1:7878/api/v1` and `ws://…/ws` itself. Rust only: finds/starts the daemon, hands over `{baseUrl, token}`, shows native notifications, registers the global shortcut, and keeps a single instance. **Why:** the UI stays a plain web app, so plan B (core 16 Q4: same UI in a browser) needs no rewrite, and the Go-rewrite path (TECH_STACK 2.4) stays open.

### Decision 2 — CORS + CSP for the webview origin **(new)**
Daemon adds `CORSMiddleware` with `CORS_ALLOWED_ORIGINS` (`tauri://localhost`, `http://tauri.localhost`, Vite dev `http://localhost:1420`). `tauri.conf.json` CSP: `connect-src http://127.0.0.1:7878 ws://127.0.0.1:7878`. **Why:** the webview origin differs from the daemon's; the token still guards every call.

### Decision 3 — Start or connect to the daemon from Rust
On launch: read `~/.config/saarthi/token`; `GET /health` (timeout `HEALTH_TIMEOUT_MS`). On failure: spawn `saarthi daemon start` (binary from env `SAARTHI_CLI` or `config.rs` default) with `process_group(0)` and no pipes held; poll `/health` every `DAEMON_POLL_MS` up to `DAEMON_START_TIMEOUT_MS`; re-read the token (first start creates it). **Why:** the daemon must not be a child the window can take down with it. It lives in its own process group.

### Decision 4 — Generated types for REST **and** events **(new)**
`scripts/gen-types.sh`:
1. `uv run python -m saarthi.api.export_schema` writes `openapi.json` and `events.schema.json` (JSON Schema of the `EventEnvelope` discriminated union from `schemas/events.py`). No running daemon needed.
2. `openapi-typescript` -> `desktop/src/api/schema.d.ts`; `json-schema-to-typescript` -> `desktop/src/api/events.d.ts`.
3. Client: `openapi-fetch` typed by `schema.d.ts`.

Generated files are committed. A daemon test regenerates into a temp dir and fails if they differ. **Why:** core 4.1 asks for an OpenAPI client, but WebSocket events are not in OpenAPI; without the second step the event cards would be untyped.

### Decision 5 — State: TanStack Query for server data, Zustand for UI and live buffers
- Query keys: `["projects"]`, `["tasks", projectId, filters]`, `["task", id]`, `["runs", taskId]`, `["run", id]`, `["workspace", taskId]`, `["brief", taskId]`, `["settings"]`, `["health"]`, `["docs", taskId]`, `["doc", taskId, docId]`.
- Zustand: `ui` (project, theme, command bar, scroll pause), `connection` (ws status, last_event_id), `stream` (per-run event arrays, capped at `STREAM_MAX_EVENTS`), `latency` (last 200 samples).
- `eventRouter.ts` maps each event type to "patch this query" or "invalidate this query" or "append to stream". It contains no rules. **Why:** one place shows how every event reaches the screen; easy to test with fixtures.

### Decision 6 — One WebSocket, hello frame, topic routing table **(new)**
- Client sends first `{"hello": {"client": "desktop", "notifications": true}}`, then `{"subscribe": [...], "last_event_id": N}`.
- Desktop always subscribes to `board:<pid>` for every project (Deck + Board + notifications), plus `task:<id>` and `run:<id>` for the open Task Room.
- Daemon `api/ws_topics.py` (one table): `board:` gets `task.*`, `brief.saved`, `run.*`, `agent.needs_input`, `agent.cost`, `workspace.*`. `task:` and `run:` get all events of that task/run. `terminal.output` goes only to `run:`.
- Reconnect: backoff `WS_BACKOFF_START_MS` doubling to `WS_BACKOFF_MAX_MS` with jitter. On reconnect, resend hello + subscribe with `last_event_id`, then invalidate all queries once. Events with `id: null` (terminal) never update `last_event_id`. Drop events with `id <= last_event_id` (duplicates from replay).

**Why:** the board must not drown in `agent.*` noise, but must hear about Needs You. The invalidate-after-reconnect step heals anything replay could not.

### Decision 7 — Native notifications replace `notify-send` while a window is open **(new, daemon change)**
`Notifier` skips `notify-send` when the WS hub has a connected client whose hello says `client: "desktop", notifications: true`. The desktop shows `tauri-plugin-notification` alerts for `agent.needs_input`, `run.finished`, `run.failed`, skipping the task whose Task Room is focused. If the OS denies permission, hello sends `notifications: false` and the daemon keeps `notify-send`. **Why:** exactly one alert per event (FSD F19.1).

### Decision 8 — The board asks the daemon for allowed moves **(new, response change)**
Task responses gain `next_stages: list[str]`: user-allowed targets from `ALLOWED_MOVES` for the current stage (guards not evaluated). While dragging, only those columns highlight. On drop: card shows a pending state, `POST /tasks/{id}/stage {to}`; `200` -> apply; `409` -> snap back + toast with `detail`. No optimistic final move. Drop on **Running** opens Start Run instead. **Why:** the UI must not copy the stage table (rule 5). Guards (like "Ready needs a goal") need the daemon anyway. Depends on M1 marking `by = user | system` per row (FSD open question 5).

### Decision 9 — Stream tab: card map, frame batching, virtual list
- `components/cards/index.ts`: `Record<EventType, CardComponent>`; missing type -> `RawCard`.
- Initial load: `GET /runs/{id}/events?after=0` paged to the end, then live WS events.
- Incoming events are buffered and flushed once per `requestAnimationFrame`.
- `@tanstack/react-virtual` renders only visible cards. Auto-scroll unless paused; scrolling up pauses; "New events ↓" chip.
- Older events beyond `STREAM_MAX_EVENTS` are dropped from memory; "Load older" fetches them again.
**Why:** 300 ms target with thousands of events on WebKitGTK.

### Decision 10 — Measure the 300 ms target in the app **(new)**
For each event with an `id`, `latency = render_commit_time − Date.parse(event.ts)` (same machine clock). Kept in `stores/latency.ts` (last 200), shown on the Health page as p50/p95. Daemon side: M2 publishes on `readline()` with no batching; `ts` is set at publish. **Why:** "Done when" needs a number, and this measures daemon→UI (agent stdout→publish is a few ms in M2's reader and is checked by a daemon test with a timestamped fake binary).

### Decision 11 — Terminal: keystrokes and resize over the WebSocket **(new, daemon change)**
- Client frames: `{"terminal_input": {"run_id", "data_b64"}}`, `{"terminal_resize": {"run_id", "cols", "rows"}}`.
- Daemon: WS handler -> `RunManager.terminal_input()` / `terminal_resize()` -> adapter. `AgentAdapter` gains `resize(h, cols, rows)` with a default no-op; `PtyShellAdapter` sets `TIOCSWINSZ` and sends `SIGWINCH`.
- Tab open: `GET /runs/{id}/events?terminal=true` (scrollback), then live `terminal.output` on `run:<id>`.
- xterm.js with `@xterm/addon-fit` and `@xterm/addon-web-links`; theme from CSS tokens.
**Why:** a REST call per keystroke adds lag and can reorder keys. Resize must be live for TUIs like `claude`.

### Decision 12 — Tiny edits (F17.3) are in M3, tightly limited **(new endpoint)**
`PUT /projects/{id}/files {task_id, path, content, base_sha256}`. Rules: task must have a worktree; no active run (`409 run_active`); file must exist (no create/delete/rename); current sha256 must equal `base_sha256` (`409 stale`); size ≤ `PEEK_MAX_BYTES`; atomic write (temp file + rename, keep mode). Emits `agent.file_changed {path, change: "edit", by: "user", added, removed, diff}` with `run_id: null`. Main repo: `403 main_repo_read_only`. No CLI command: from a terminal, the user already has `$EDITOR` (a named exception to rule 2). **Why:** the ownership map gives F17.1-F17.4 to M3. The limits keep it a "fix a typo" tool, not an editor, and stop clashes with an agent. Reusing `agent.file_changed` with `by: "user"` adds no new event type to core 6.2 and makes the edit show as a normal file card.

### Decision 13 — "Open in tools" runs in the daemon **(new endpoint)**
`POST /projects/{id}/open {task_id?, target: "folder" | "terminal" | "editor", path?, line?}`. Root = task worktree if `task_id`, else repo. Command templates from settings (`folder_command`, `terminal_command`, `editor_command`), split with `shlex.split` **before** substituting `{path}` and `{line}` in each arg, spawned detached with an args list. CLI: `saarthi open <task-or-project> [--folder | --terminal | --editor] [--file P] [--line N]`. **Why:** one implementation for UI and CLI (rule 1). Risk: needs `DISPLAY`/`WAYLAND_DISPLAY`; the daemon gets them when started by the app or a desktop terminal; the M9 systemd unit must import them.

### Decision 14 — Code Peek read endpoints
- `GET /projects/{id}/files?path=&task=` -> dir: `{kind: "dir", entries: [{name, kind, size}]}` (dirs first, hides `PEEK_HIDDEN_NAMES`); file: `{kind: "file", content | null, sha256, size, binary, too_big}`.
- `GET /projects/{id}/search?q=&kind=text|name&task=` -> text: `rg --json --fixed-strings --max-count … --max-filesize …` -> `[{path, line, col, preview}]`; name: `rg --files` filtered by case-insensitive substring. Capped at `SEARCH_MAX_RESULTS`, killed after `SEARCH_TIMEOUT_SEC`.
- Path safety: `(root / path).resolve()` must be inside `root.resolve()`, else `400 bad_path` (blocks `..` and symlinks out).

### Decision 15 — Settings endpoint over the M1 `settings` table
`GET /settings` -> `{values, defaults}`; `PUT /settings` partial, validated by `SettingsModel` (Pydantic): `theme`, `editor_command`, `terminal_command`, `folder_command`, `max_parallel_runs` (1-16), `worktree_root` (absolute, writable), `claude_path`, `codex_path`. Unknown key -> `422`. A settings change is written to `daemon.log`, not to the `events` table, because events belong to a task and core 6.2 has no settings group **(new — owner to confirm this is fine under rule 4)**. CLI: `saarthi settings get|set <key> <value>`. `max_parallel_runs` applies at the next dequeue; `worktree_root` applies to new worktrees only. "Max auto-fix rounds" is added by M4. **Why:** F21.1; the daemon validates, the UI only renders a form.

### Decision 16 — Project list counts and today's cost **(new, response change)**
`GET /projects` items gain `open_tasks`, `running_runs`, `today_cost_usd` (runs started since local midnight, computed in the daemon). The Deck total is the sum of what is shown. **Why:** "today" is a rule; it lives in the daemon. M8's cost meter replaces this view.

### Decision 17 — Routing and windows **(new)**
`react-router` (not in TECH_STACK; small and well known). Routes: `/` Deck, `/p/:projectId/board`, `/p/:projectId/code`, `/t/:taskId/:tab?` (`stream|terminal|code|docs|timeline`), `/settings`, `/health`, `/capture`. Two Tauri windows: `main` and `capture` (small, undecorated, always on top, hidden until the shortcut). `tauri-plugin-single-instance` forwards `--quick-capture` to the running app. Quick capture's last project is kept in `localStorage` (a per-machine convenience, not state).

### Decision 18 — Brief editor uses CodeMirror 6 markdown
Goal and Notes: CodeMirror with `@codemirror/lang-markdown` (already a dependency; Milkdown is "later" in TECH_STACK). Acceptance criteria: a list of inputs with add/remove/reorder. Focus paths: chips. Save -> `PUT /tasks/{id}/brief`.

### Decision 19 — Timeline data
Use M1's task-events read (the one behind `saarthi task show --json`). If M1 has no paged endpoint, M3 adds `GET /tasks/{id}/events?after=&limit=&group=` **(new)**. Timeline filter chips map to event groups (`task`, `run`, `agent`, `workspace`) sent as `group=`.

### Decision 20 — Docs tab only renders what M2 serves **(new)**
The Docs tab uses `GET /tasks/{id}/docs` and `GET /tasks/{id}/docs/content?doc=` (M2 Decision 19). M3 adds no endpoint, table or event.
- **Refresh:** `eventRouter.ts` invalidates `["docs", taskId]` on `doc.saved` and on `agent.file_changed` when `path` ends with `.md`. The open doc `["doc", taskId, docId]` is invalidated on the same events. Both events already reach `task:<id>` (it gets all events of that task).
- **Markdown:** rendered with `react-markdown` + `remark-gfm`. Raw HTML is not rendered (no `rehype-raw`), so a doc cannot inject markup. Mermaid is a plain code block (Later, F22.6).
- **Outline:** built from the rendered headings (`DocOutline`), with ids from `github-slugger` style slugs made in `lib/slug.ts` (no new library).
- **Open in editor:** calls the existing `POST /projects/{id}/open` (Decision 13) with `task_id`, `target: "editor"` and the doc path. Plan docs live in the data folder (`source: "data"`), so the call passes the absolute path from the doc list.
- **Open: data-folder paths:** `/projects/{id}/open` also accepts a path inside the Saarthi data folder, for plan docs only. The daemon resolves the path and checks that it stays inside `~/.local/share/saarthi/tasks/<task_id>/docs/`. Any other path outside the worktree is refused (`400 bad_path`).

**Why:** the daemon already decides what a doc is; the UI must not copy that logic (rule 1). A plain code block for Mermaid keeps the bundle small.

---

## 5. Modules and files

### Daemon (`daemon/src/saarthi/`)

| File | Change |
|---|---|
| `api/app.py` | CORS middleware (Decision 2) |
| `api/export_schema.py` | Writes `openapi.json` + `events.schema.json` |
| `api/ws.py`, `api/ws_topics.py` | hello frame, topic table, terminal frames |
| `api/routes/settings.py`, `core/settings.py` | `/settings`, `SettingsModel` |
| `api/routes/files.py`, `core/peek.py`, `core/search.py` | Code Peek read, search, tiny edit |
| `api/routes/open.py`, `core/opener.py` | Open in tools |
| `core/notify.py` | Skip `notify-send` when a desktop client handles notifications |
| `agents/base.py`, `agents/pty_shell.py` | `resize()` |
| `schemas/tasks.py`, `schemas/projects.py` | `next_stages`; project counts + `today_cost_usd` |
| `cli/open.py`, `cli/settings.py` | `saarthi open`, `saarthi settings` |

### Tauri (`desktop/src-tauri/src/`)

| File | What |
|---|---|
| `main.rs` | Plugins: notification, global-shortcut, single-instance; windows `main`, `capture` |
| `daemon.rs` | Connect or start (Decision 3) |
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
| `lib/tauri.ts`, `lib/theme.ts` | Tauri wrappers (mockable); theme tokens for app, xterm, CodeMirror |
| `components/layout/` | `NavRail`, `TopBar` (project switcher, running count, today's cost), `OfflineBanner` |
| `components/CommandBar.tsx` | shadcn `Command` (cmdk) |
| `components/cards/` | `MessageCard`, `ThinkingCard`, `ToolCallCard`, `ToolResultCard`, `FileChangedCard`, `NeedsInputCard`, `RunStatusCard`, `RawCard` |
| `screens/Deck.tsx` | Projects, Running now, Needs You, Today's cost |
| `screens/Board.tsx` | `@dnd-kit/core` columns + filter bar |
| `screens/TaskRoom/` | `index`, `LeftPanel`, `BriefEditor`, `RunsList`, `StartRunDialog`, `WorkspacePanel`, `StreamTab`, `TerminalTab`, `CodeTab`, `TimelineTab`, `MessageBox` |
| `screens/TaskRoom/DocsTab/` | `index` (3 columns, tab count), `DocsList` (groups Plans / Changed / Pinned, badges), `DocView` (react-markdown + remark-gfm, header with Open in editor / Copy path, too-big placeholder), `DocOutline` (heading list, click to jump) |
| `screens/CodePeek/` | `FileTree`, `CodeViewer` (CodeMirror read-only + edit mode), `SearchPanel` |
| `screens/Settings.tsx`, `screens/Health.tsx`, `screens/QuickCapture.tsx` | |
| `test/fixtures/events/*.json` | Normalized events from M0 fixtures (generated, Decision 4 script step 4: `uv run python -m saarthi.agents.dump_fixture_events`) |

---

## 6. Data model changes

None. No new tables, no new columns, no migration. New `settings` keys only (Decision 15). The Docs tab reads files through M2's API (Decision 20).

---

## 7. Events added

None (ownership map). The Docs tab listens to M2's `doc.saved` and `agent.file_changed`; it adds none. One payload extension: `agent.file_changed` may carry `by: "user"` with `run_id: null` (Decision 12). WebSocket gains client frames `hello`, `terminal_input`, `terminal_resize` (Decisions 6, 11) — these are control messages, not events.

---

## 8. API and CLI added

| Method | Path | Body / query | Response / errors |
|---|---|---|---|
| GET | `/settings` | - | `{values, defaults}` |
| PUT | `/settings` | partial `SettingsModel` | `{values}`; `422` |
| GET | `/projects/{id}/files` | `?path=&task=` | dir or file (Decision 14); `400 bad_path`, `404` |
| PUT | `/projects/{id}/files` **(new)** | `{task_id, path, content, base_sha256}` | `{sha256}`; `403`, `409 run_active`, `409 stale`, `413` |
| GET | `/projects/{id}/search` | `?q=&kind=text\|name&task=` | `{results, truncated}`; `424 rg_missing` |
| POST | `/projects/{id}/open` **(new)** | `{task_id?, target, path?, line?}` | `202`; `400 bad_path`, `424 command_failed {stderr}` |
| GET | `/tasks/{id}/events` **(new, only if M1 lacks it)** | `?after=&limit=&group=` | `{events, next_after}` |

Response changes: task `next_stages`; project `open_tasks`, `running_runs`, `today_cost_usd`.

| CLI | Output |
|---|---|
| `saarthi open <task\|project> [--folder\|--terminal\|--editor] [--file P] [--line N]` | `Opened <path> in <app>.` |
| `saarthi settings get [key]` / `saarthi settings set <key> <value>` | table / `Saved.`; `--json` |
| `saarthi dev replay <fixture> --task <id> [--gap-ms 20]` **(new, dev only, needs daemon `--dev`)** | Replays a fixture through `FakeAdapter` as a real run, for UI and latency checks |

---

## 9. Key flows

### 9.1 App start
1. Rust `daemon::connect_or_start()` (Decision 3). Failure -> error screen with `daemon.log` path and **Retry**.
2. React gets `{baseUrl, token}` from `get_connection`, builds the client, opens the WS (hello, subscribe all `board:` topics).
3. Deck queries load; events patch them.

### 9.2 Live event to screen
Agent line -> M2 mapper -> `bus.publish` (sets `ts`) -> WS `run:` topic -> `WsClient` -> `eventRouter` -> `stream` store buffer -> rAF flush -> virtual list renders -> latency sample.

### 9.3 Needs You
`agent.needs_input` on `board:` -> router invalidates `["task", id]`, `["tasks", pid]` -> Deck row + glowing card. Native alert (Decision 7). User clicks an option -> `POST /runs/{id}/input {text}` -> `task.stage_changed` -> board/header update.

### 9.4 Drag on the board
Drag start -> highlight `next_stages` -> drop -> pending -> `POST /stage` -> `200` apply / `409` revert + toast.

### 9.5 Tiny edit
Code tab -> **Edit** (disabled if `active_run`) -> CodeMirror editable -> **Save** -> `PUT /files` with `base_sha256` -> `200` new sha / `409 stale` -> "File changed on disk. Reload?".

---

## 10. Config added

Daemon `config.py`:

| Constant | Default |
|---|---|
| `CORS_ALLOWED_ORIGINS` | `["tauri://localhost", "http://tauri.localhost", "http://localhost:1420"]` |
| `PEEK_MAX_BYTES` | `1_000_000` |
| `PEEK_HIDDEN_NAMES` | `[".git"]` |
| `RG_BIN`, `SEARCH_MAX_RESULTS`, `SEARCH_TIMEOUT_SEC`, `SEARCH_MAX_FILESIZE` | `"rg"`, `200`, `5`, `"1M"` |
| `SETTINGS_DEFAULTS` | `theme="system"`, `editor_command="xdg-open {path}"`, `terminal_command="gnome-terminal --working-directory={path}"`, `folder_command="xdg-open {path}"` (plus M2's `max_parallel_runs`, `worktree_root`, `claude_path`, `codex_path`) |
| `MAX_PARALLEL_RUNS_RANGE` | `(1, 16)` |

UI `desktop/src/config.ts`: `WS_BACKOFF_START_MS = 500`, `WS_BACKOFF_MAX_MS = 10000`, `STREAM_MAX_EVENTS = 20000`, `EVENTS_PAGE_SIZE = 500`, `LATENCY_SAMPLES = 200`, `LATENCY_TARGET_MS = 300`, `QUICK_CAPTURE_SHORTCUT = "Ctrl+Alt+N"`, `TOAST_MS = 5000`, `DOCS_TAB_REFRESH_EVENTS = ["doc.saved", "agent.file_changed"]`. New UI dependencies: `react-markdown`, `remark-gfm`.

Rust `config.rs`: `HEALTH_TIMEOUT_MS = 800`, `DAEMON_POLL_MS = 200`, `DAEMON_START_TIMEOUT_MS = 8000`, `DEFAULT_CLI = "saarthi"`.

---

## 11. Error handling

| Case | What we do |
|---|---|
| Daemon does not come up | Error screen: last 20 lines of `daemon.log`, **Retry**, the manual command. |
| Token missing / `401` | Re-read the token via `get_connection` and retry once; then error screen. |
| WS drops | `OfflineBanner`, backoff reconnect, replay, invalidate queries. |
| Stage move refused | Snap back, toast with the daemon's `detail`. |
| Start run refused (`409`/`424`) | Dialog stays open, shows the message and the fix text. |
| `409 stale` on save | Dialog: Reload (lose my edit) or Copy my text. |
| File too big / binary | Viewer placeholder + **Open in editor**. |
| `rg` missing | Search box disabled with reason; Health shows it red. |
| Open command fails | Toast with stderr; link to Settings. |
| Notification permission denied | hello `notifications: false` -> daemon keeps `notify-send`. |
| Unknown event type | `RawCard`; router ignores it for caches. |
| Global shortcut fails to register | Settings shows the GNOME shortcut command to bind by hand. |

---

## 12. Tests to write

**Daemon (pytest):**

| File | Proves |
|---|---|
| `api/test_settings_api.py` | defaults, partial PUT, range/path validation, unknown key 422; CLI `settings set` |
| `api/test_files_api.py` | dir/file shape, hidden names, binary/too big, `..` and symlink escape -> 400 |
| `api/test_files_edit.py` | edit ok + `agent.file_changed {by: "user"}`; main repo 403; active run 409; stale 409; new file refused |
| `api/test_search_api.py` | text + name search on a tmp repo; cap + `truncated`; timeout; `rg` missing 424 |
| `api/test_open_api.py` | template split before substitution (path with spaces and `;` stays one arg); fake binary records argv |
| `api/test_ws_topics.py` | `board:` gets needs_input but not `agent.message`; `terminal.output` only on `run:` |
| `api/test_ws_terminal_frames.py` | input reaches a `PtyShellAdapter` running `cat`; resize changes `stty size` |
| `unit/test_notifier_desktop.py` | desktop hello with notifications -> no `notify-send`; `notifications: false` -> `notify-send` |
| `api/test_task_next_stages.py`, `api/test_project_counts.py` | `next_stages` matches the table for user moves; counts and today's cost (frozen clock) |
| `api/test_cors.py` | allowed origin gets headers; other origin does not |
| `test_generated_types_current.py` | regenerated `openapi.json` / `events.schema.json` equal the committed ones |

**UI (Vitest + Testing Library, MSW for REST, `mock-socket` for WS):**

| File | Proves |
|---|---|
| `api/ws.test.ts` | hello + subscribe; backoff; reconnect sends `last_event_id`; duplicates dropped; `id: null` ignored for replay |
| `api/eventRouter.test.ts` | each fixture event patches/invalidates the right query or stream |
| `components/cards/cards.test.tsx` | every event type in `test/fixtures/events/*.json` renders its card; unknown -> raw |
| `screens/Board.test.tsx` | only `next_stages` columns accept drops; 409 reverts with message; drop on Running opens dialog |
| `screens/TaskRoom/MessageBox.test.tsx` | send, queued (`delivered: false`) text, options as buttons, Close as done |
| `screens/TaskRoom/StreamTab.test.tsx` | 5,000 events render < 200 DOM cards; pause on scroll up; "New events" chip |
| `screens/TaskRoom/DocsTab.test.tsx` | Groups and badges render from a docs list; empty group shows its quiet line; click shows markdown; outline click scrolls; `doc.saved` and `agent.file_changed` for `*.md` refresh the list (not for `.py`); too-big placeholder; pinned + changed shows once (as served) |
| `screens/CodePeek/CodeViewer.test.tsx` | Edit disabled with active run / main repo; stale dialog |
| `stores/latency.test.ts` | p50/p95 math |

Playwright end-to-end tests are M9.

---

## 13. Manual verification

1. Run the FSD QA checklist (section 9) on Ubuntu 24.04, once in an X11 session and once in Wayland.
2. Latency: start a FakeAdapter replay of `claude_build_ok` with a 20 ms gap (`saarthi dev replay <fixture> --task T-1`, dev-only command behind `--dev`), open Health, check p95 < 300 ms. Repeat with a real Claude run.
3. A full real working day from the window. Note friction in `core_docs/learnings/`.
4. Show `npm test`, `npm run lint`, `npm run typecheck`, `uv run pytest`, `uv run ruff check .`, `uv run pyright` output.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| WebKitGTK slow with xterm.js / CodeMirror / long lists | M0 spike 4; rAF batching; virtual lists; xterm WebGL addon off by default (canvas fallback); plan B browser. |
| Global shortcut does not work on Wayland | `--quick-capture` + GNOME custom shortcut, shown in Settings. |
| Daemon spawned by the app inherits a short-lived env | Spawn in its own process group; `saarthi daemon start` daemonizes (M1). |
| UI slowly gains logic ("just compute it here") | Code review rule: any `if stage ===` in `desktop/src` needs a reason; `next_stages`, counts and totals come from the daemon. |
| Generated types drift from the daemon | Test `test_generated_types_current.py`. |
| Tiny edits clash with an agent | Blocked during active runs + sha check. |
| `open` fails under systemd (M9) without display env | Documented for the M9 unit (`systemctl --user import-environment`). |
| 3 weeks is tight for this many screens | Order of work = section 16; Code Peek edit and Timeline filters are the first to cut. |

---

## 15. What this milestone does not do

No new tables or event types. No editing docs, no Mermaid (Later). No research docs or plan-in-Context-Pack (M6). No Proof tab, check dots or checks action (M4). No Review tab, diff viewer, Ship, cleanup (M5). No Research Desk, Memory, Playbooks, Context Pack v1 preview (M6). No race screen or "running now" strip (M7). No permission profile picker, checkpoints list, Rewind, cost meter or budget alert (M8). No `?` sheet, first-run wizard, packaging, Playwright (M9).

---

## 16. Effort breakdown

| Task | Hours |
|---|---|
| Tauri shell: connect/start daemon, token, single instance, notifications, global shortcut | 3 |
| Type generation + API client + CORS | 1.5 |
| WS client, topic table, event router | 2.5 |
| Layout, nav, top bar, theme, Command Bar | 2 |
| Command Deck (+ project counts) | 1.5 |
| Board: columns, dnd, `next_stages`, filters | 3 |
| Quick capture window | 1 |
| Task Room shell, brief editor, runs list, Start run, workspace panel, open in tools | 3.5 |
| Stream tab: cards, batching, virtual list, latency | 3 |
| Terminal tab + WS terminal frames + `resize()` | 2 |
| Message box + Needs You | 1 |
| Timeline tab | 1 |
| Code Peek: files/search endpoints, tree, viewer, open in editor, tiny edits | 3.5 |
| Settings + Health pages (+ `/settings`, CLI) | 1.5 |
| Docs tab: list, markdown view, outline, live refresh + test | 2.5 |
| **Total** | **32.5** |

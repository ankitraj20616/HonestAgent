# TDD — M1: Daemon Core + CLI

**Document type:** Technical Design Document (TDD)
**Milestone:** M1 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-11
**Estimated effort:** ~20 hours (2 weeks at 8-10 h/week)
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `FSD_M1_daemon_core_cli.md`, `../M0_spike_skeleton/TDD_M0_spike_skeleton.md`, `../M2_agent_runs_worktrees/TDD_M2_agent_runs_worktrees.md`, `../../TDD-tech-design-doc.md` (sections 4.1, 4.2, 4.10, 5, 6, 7, 9, 10, 12), `../../TECH_STACK.md`

---

## 1. The goal in one sentence

Build `saarthid` (FastAPI + SQLite + event bus + stage machine) and the `saarthi` CLI, so projects, tasks, briefs, and events work end to end from the terminal, with no agents and no UI.

---

## 2. Read this first — rules this work must not break

1. **All logic lives in the daemon** (rule 1). The CLI only calls the API and prints. Markdown <-> brief parsing, project lookup by path, ID normalising: all in the daemon.
2. **CLI first** (rule 2). Every M1 feature is reachable from `saarthi`.
3. **Every action is an event** (rule 4). A data change and its event are written in **one** transaction.
4. **Stage rules live in one table** (rule 5): `ALLOWED_MOVES` in `core/stages.py`. No `if stage == ...` anywhere else.
5. **Git through subprocess with a list of args** (rule 6). M1 only reads git (`rev-parse`, `symbolic-ref`).
6. **No hard-coded values** (rule 7). Constants in `config.py`, project settings in `.saarthi/project.toml`.
7. **Tests first for core logic** (rule 8). No agents exist in M1, so no `FakeAdapter` yet; tests use temp git repos and `TestClient`.
8. **Before "done"**: `uv run pytest`, `uv run ruff check .`, `uv run pyright`, with output shown (rule 9).

---

## 3. What already exists (from M0) — do not rebuild

| Thing | Where |
|---|---|
| Folder layout | `daemon/`, `desktop/`, `scripts/` (TECH_STACK section 4) |
| Agent fixtures | `daemon/tests/fixtures/agents/*.jsonl` (not used in M1) |
| Agent decisions | `core_docs/decisions/ADR-001-agent-integration.md` (not used in M1) |
| Tauri scaffold | `desktop/` (not touched in M1) |

---

## 4. Technical decisions

### Decision 1 — Package and tooling
`uv init --package` in `daemon/`, code in `src/saarthi/`. Two entry points: `saarthi = "saarthi.cli.main:app"` and `saarthid = "saarthi.daemon:main"`. Runtime deps: `fastapi`, `uvicorn[standard]`, `pydantic>=2`, `sqlalchemy[asyncio]>=2`, `aiosqlite`, `alembic`, `typer`, `rich`, `httpx`, `structlog`, `python-ulid`. Dev deps: `pytest`, `pytest-asyncio`, `pytest-cov`, `ruff`, `pyright`.
**(new)** `aiosqlite`, `httpx`, `python-ulid`, `pytest-cov` are not in TECH_STACK. **Why:** async SQLite driver (Decision 3), HTTP client for the CLI (also what FastAPI's `TestClient` uses), ULIDs (core TDD 5), coverage gate (MILESTONES "done when").

### Decision 2 — One `config.py`, three sources
`config.py` holds every constant and a `Settings` Pydantic model. Values come from, in order: env vars (`SAARTHI_*`), `~/.config/saarthi/config.toml`, defaults in `config.py`. Paths follow XDG (`$XDG_CONFIG_HOME`, `$XDG_DATA_HOME`). `SAARTHI_CONFIG_DIR` and `SAARTHI_DATA_DIR` override them (tests and QA use these).
**Why:** one place to look (rule 7); env overrides let every test run in `tmp_path`. We read TOML with stdlib `tomllib` (no extra lib).
The host is a constant (`127.0.0.1`), **not** a setting. **Why:** nobody should be able to expose the API by editing a file (core TDD 15).

### Decision 3 — Async SQLAlchemy + one write lock **(new)**
`create_async_engine("sqlite+aiosqlite:///<data>/saarthi.db")`. On every connection: `PRAGMA journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=<DB_BUSY_TIMEOUT_MS>`, `synchronous=NORMAL`. All writes go through one `UnitOfWork` that holds a process-wide `asyncio.Lock`.
**Why async:** the event bus and WebSocket are async, and M2 will publish many agent events from async stream readers. One concurrency model, no thread hops. **Why the lock:** SQLite has one writer. The daemon is the only writer, so a lock makes "database is locked" impossible inside the daemon and makes the task counter (Decision 4) safe. Reads do not take the lock (WAL allows parallel reads).

### Decision 4 — Task IDs are global, from a counter **(new)**
Format `T-` + number zero-padded to 4 digits (`T-0001`; `T-10000` after `T-9999`). The number comes from a counter row in `settings` (`key = "internal.task_counter"`), read and increased inside the same write transaction that inserts the task. IDs are never reused.
**Why global, not per project:** core API paths are `/tasks/{id}` (no project in the path), the CLI says `saarthi task move T-0001 ready` with no project, events and branches (`saarthi/T-0042-...`) need one unique key. Per-project numbers would need a project in every command. Cost: numbers in one project jump (`T-0003`, `T-0007`). That is fine.
**Why a counter, not `max(id)+1`:** after a project is removed (Decision 8), `max+1` could hand out an old ID again, and an old branch with that name may still exist in a repo.
Input is normalised in the daemon: `t-7`, `T-7`, `T-0007` all mean `T-0007` (`core/ids.py`).

### Decision 5 — Other IDs are ULIDs
Projects, briefs, research items (and runs in M2) use ULIDs from `python-ulid`, as core TDD 5 says.

### Decision 6 — `project.toml` is the source of truth for project settings **(new)**
`default_branch`, `default_agent`, `memory_path` live in `<repo>/.saarthi/project.toml`. The `projects` table keeps copies of them (core TDD 5.1) as a **cache**, refreshed every time the daemon loads the project config (on add, on daemon start, and on `GET /projects/{id}`; the reader caches by file mtime). `PATCH /projects/{id}` changes only `name`, which is Saarthi-only and not in the file.
**Why:** rule 7 says project settings live in `project.toml`; two editable copies would drift. The cache keeps list queries fast and gives M2 a value even if the file is broken.
`default_branch` when the file does not set it: `git symbolic-ref --short refs/remotes/origin/HEAD` (strip `origin/`), else the current branch, else `DEFAULT_BRANCH_FALLBACK`.

### Decision 7 — Project lookup happens in the daemon
`/projects/{project}` accepts a ULID **or** a project name. `GET /projects?path=<abs path>` returns the project whose `repo_path` contains that path. The CLI sends its current folder.
**(new)** **Why:** keeps the CLI thin (rule 1) and lets `saarthi task new "x"` work from inside a repo with no `--project`.

### Decision 8 — Removing a project hard-deletes its rows **(new)**
`DELETE /projects/{id}` deletes the project and, through `ON DELETE CASCADE`, its tasks, briefs, research items, runs, and events. The repo, `.saarthi/`, and the JSONL logs on disk are not touched.
**Why:** FSD F1.4 says "removes it from Saarthi only". A soft delete needs a column the core data model does not have. Logs stay on disk for debugging. M2 adds: refuse while a run is active. Listed as open question 2 in the FSD.

### Decision 9 — Stages and `ALLOWED_MOVES`
Stages are stored as lowercase strings. The move table holds **every** move from core TDD 7, each tagged with who may do it. In M1 only `brief_has_goal` exists as a guard. Moves owned by later milestones are tagged `SYSTEM`, so the API refuses them from users; M2/M4/M5 add their guards and triggers.

```python
class Stage(StrEnum):
    INBOX = "inbox"; RESEARCH = "research"; READY = "ready"; RUNNING = "running"
    NEEDS_YOU = "needs_you"; VERIFYING = "verifying"; FAILED = "failed"
    REVIEW = "review"; SHIPPED = "shipped"; PARKED = "parked"; ARCHIVED = "archived"

class By(StrEnum):
    USER = "user"
    SYSTEM = "system"

Guard = Callable[["GuardContext"], str | None]   # returns a reason when blocked

@dataclass(frozen=True)
class Move:
    by: By
    guard: Guard | None = None
    when: str = ""        # shown if a user tries a SYSTEM move

PARKABLE = frozenset(Stage) - {Stage.SHIPPED, Stage.ARCHIVED, Stage.PARKED}

ALLOWED_MOVES: dict[tuple[Stage, Stage], Move] = {
    (Stage.INBOX, Stage.RESEARCH):    Move(By.USER),
    (Stage.INBOX, Stage.READY):       Move(By.USER, brief_has_goal),
    (Stage.RESEARCH, Stage.READY):    Move(By.USER, brief_has_goal),
    (Stage.READY, Stage.RUNNING):     Move(By.SYSTEM, when="a run starts"),
    (Stage.RUNNING, Stage.NEEDS_YOU): Move(By.SYSTEM, when="the agent asks you something"),
    (Stage.NEEDS_YOU, Stage.RUNNING): Move(By.SYSTEM, when="you answer the agent"),
    (Stage.RUNNING, Stage.VERIFYING): Move(By.SYSTEM, when="a build or fix run ends"),
    (Stage.RUNNING, Stage.READY):     Move(By.SYSTEM, when="a plan run ends"),  # research runs never move the stage (M2/M6)
    (Stage.RUNNING, Stage.FAILED):    Move(By.SYSTEM, when="a run crashes or is interrupted"),
    (Stage.NEEDS_YOU, Stage.FAILED):  Move(By.SYSTEM, when="a run is interrupted"),
    (Stage.VERIFYING, Stage.REVIEW):  Move(By.SYSTEM, when="required checks pass"),
    (Stage.VERIFYING, Stage.FAILED):  Move(By.SYSTEM, when="a required check fails"),
    (Stage.FAILED, Stage.RUNNING):    Move(By.SYSTEM, when="a fix run starts"),
    (Stage.REVIEW, Stage.RUNNING):    Move(By.SYSTEM, when="comments are sent to the agent"),
    (Stage.REVIEW, Stage.READY):      Move(By.SYSTEM, when="you reject the review"),
    (Stage.REVIEW, Stage.SHIPPED):    Move(By.SYSTEM, when="the commit is made"),
    (Stage.SHIPPED, Stage.ARCHIVED):  Move(By.USER),
    (Stage.PARKED, Stage.ARCHIVED):   Move(By.USER),
    (Stage.PARKED, Stage.INBOX):      Move(By.USER),
    (Stage.PARKED, Stage.RESEARCH):   Move(By.USER),
    (Stage.PARKED, Stage.READY):      Move(By.USER, brief_has_goal),
    **{(s, Stage.PARKED): Move(By.USER) for s in PARKABLE},
}
```

**(new)** additions to core TDD 7, each filling a gap:
- `Running -> Failed` and `Needs You -> Failed` (SYSTEM): core flow 8.6 and section 12 move a task to `Failed` on crash / restart, but table 7 has no such row.
- `Parked -> Inbox / Research / Ready` (USER): table 7 has no way out of `Parked` except `Archived`.
- "Any -> Parked" means any stage except `Shipped`, `Archived`, `Parked`. Stopping a running run before parking is added in M2.

`TaskEngine.move(task_id, to, by, reason)` is the only code that changes `tasks.stage`. Same-stage move = no-op, no event, `changed: false`.

### Decision 10 — Brief markdown lives in the daemon **(new)**
`core/briefs.py` has `render_markdown(brief) -> str` and `parse_markdown(text) -> BriefFields`. `GET /tasks/{id}/brief` returns both the structured brief and its markdown (or an empty template if no brief yet). `PUT /tasks/{id}/brief` accepts **either** `{markdown}` **or** structured fields.
Parsing rules: headings matched case-insensitively (`## Goal`, `## Acceptance criteria`, `## Notes`, `## Focus paths`); `<!-- ... -->` removed; the `# Brief for ...` title line ignored; acceptance and focus paths = `-` / `*` list items; text under unknown `##` headings is appended to notes with its heading. If the parsed fields equal the latest version, nothing is saved (`created: false`).
**Why:** the M3 brief editor needs the same conversion; doing it in the CLI would break rule 1.

### Decision 11 — Event bus: record in the transaction, fan out after commit
`UnitOfWork.emit(type, task=..., payload=...)` adds an `events` row to the open session. On commit, in id order: (1) append each event to its JSONL file, (2) push to WebSocket subscribers. On rollback, nothing is written or pushed.
JSONL files **(new)**: events with a `run_id` -> `logs/runs/<run_id>.jsonl` (core TDD 10, used from M2); events without -> `logs/tasks/<task_id>.jsonl`. **Why:** core TDD 10 only names run logs, but M1 has no runs and MILESTONES asks for JSONL in M1. A JSONL write error is logged and does not undo the action: SQLite is the record; JSONL is the raw debug log.
`events.project_id` column **(new)**, also sent in the event JSON. **Why:** the WebSocket topic `board:<project_id>` and its replay query need it without a join; it also survives later task changes.

### Decision 12 — WebSocket protocol
`ws://127.0.0.1:7878/api/v1/ws?token=...`. Client message (can be sent again to change topics):
```json
{"subscribe": ["board:01JA3K...", "task:T-0042"], "last_event_id": 1040}
```
Topics: `board:<project_id>`, `task:<task_id>`, `run:<run_id>` (matches from M2), and `all` **(new)** for the M3 Command Deck. Server sends events in the core 6.1 shape plus `project_id`. Control messages **(new)** carry a `control` key so clients can tell them apart:
`{"control":"subscribed","topics":[...],"replayed":12,"last_event_id":1052}`, `{"control":"error","code":"bad_topic","message":"..."}`, `{"control":"resync","reason":"replay_too_large"}`.
No gaps, no duplicates: on subscribe the server (1) registers the live queue first, (2) reads `id > last_event_id` from SQLite and sends it, (3) drains the queue, skipping ids it already sent. More than `WS_REPLAY_MAX_EVENTS` missed -> `resync` (client reloads via REST). A subscriber whose queue passes `WS_QUEUE_MAX` is closed with code `4008`; it reconnects and replays, so nothing is lost.

### Decision 13 — Token auth
Token file `<config>/token`, made on first start with `secrets.token_urlsafe(TOKEN_BYTES)`, mode `600`, folder mode `700`. If the mode is wider, the daemon fixes it and logs a warning. REST: `Authorization: Bearer <token>`, compared with `secrets.compare_digest`, on **every** route including `/health` and `/openapi.json`. WebSocket: `?token=` (browsers cannot set WS headers); bad token -> close code `4401`.
**(new)** `TrustedHostMiddleware` with `127.0.0.1` and `localhost`. **Why:** cheap protection against DNS-rebinding pages in the browser. No CORS headers in M1 (M3 adds the Tauri origin).

### Decision 14 — Daemon lifecycle **(new)**
- `saarthid` (foreground): take `flock` on `<data>/saarthid.lock` (fail if held), write `saarthid.pid`, set up logs, make token, run migrations, start uvicorn on `127.0.0.1:<port>`. Remove the pid file on exit.
- `saarthi daemon start`: spawn `saarthid` with `start_new_session=True`, stdout/stderr to `logs/daemon.out`, then poll `/health` until ready (`DAEMON_START_TIMEOUT_SEC`). `--dev` runs it in the foreground with debug logs (TECH_STACK 5).
- `daemon stop`: SIGTERM the pid, wait `DAEMON_STOP_TIMEOUT_SEC`. `--force` sends SIGKILL after that.
- Migrations: on start, if the DB is behind `head`, copy it to `<data>/backups/saarthi-<old_rev>-<utc>.db`, then `alembic upgrade head` in code.
**Why:** single user, no manual migration step; the copy makes a bad migration easy to undo. M9 replaces the spawn with a systemd unit.

### Decision 15 — Error shape and CLI exit codes **(new)**
Every error: `{"error": {"code": "move_not_allowed", "message": "...", "hint": "saarthi brief edit T-0001"}}`. FastAPI validation errors are wrapped in the same shape (`code: "invalid_request"`, plus `details`).
CLI exit codes: `0` ok, `1` request refused (4xx), `2` daemon not reachable, `3` daemon error (5xx). The CLI prints `message`, then `hint` in dim text. With `--json`, it prints the error object.

### Decision 16 — Health endpoint (F21.2, data only)
Tools `git`, `claude`, `codex`, `gh`: `shutil.which` + `<tool> --version` with `TOOL_VERSION_TIMEOUT_SEC`, cached `HEALTH_TOOL_CACHE_SEC`. `logged_in` is `null` in M1; M2 fills it from `AgentAdapter.check_ready()`.

### Decision 17 — Time and JSON
All times are UTC, stored as ISO-8601 text through a small `UtcDateTime` type, sent with `Z`. JSON columns use SQLAlchemy `JSON`.

### Decision 18 — Task events through `GET /tasks/{id}?include=` **(new)**
`include=brief,events` (comma list) adds the latest brief and the task's events (oldest first, last `TASK_SHOW_EVENTS_LIMIT`). **Why:** `task show --json` needs both, and core TDD 9 has no `/tasks/{id}/events` path; a query option avoids a new path.

---

## 5. Modules and files

All under `daemon/`.

| File | What it holds |
|---|---|
| `pyproject.toml` | deps, entry points, ruff, pyright (`strict` for `src/`), pytest (`asyncio_mode = "auto"`, coverage gate on `saarthi.core`) |
| `alembic.ini` | for `uv run alembic revision` during development only |
| `src/saarthi/__init__.py` | `__version__` |
| `src/saarthi/config.py` | constants, `Settings`, path helpers (section 10) |
| `src/saarthi/daemon.py` | `main()`: lock, pid, logging, token, migrate, `uvicorn.run(create_app(), ...)` |
| `src/saarthi/logging.py` | structlog JSON to `logs/daemon.log` (rotating) |
| `src/saarthi/api/app.py` | `create_app(settings)`: lifespan (engine, bus), routers, middleware, error handlers |
| `src/saarthi/api/auth.py` | token load/create, `require_token` dependency, WS token check |
| `src/saarthi/api/errors.py` | `AppError(code, message, hint, status)`, handlers |
| `src/saarthi/api/routes/health.py` | `GET /health` |
| `src/saarthi/api/routes/projects.py` | `/projects*`, `/projects/{id}/tasks` |
| `src/saarthi/api/routes/tasks.py` | `/tasks/{id}`, `/tasks/{id}/stage` |
| `src/saarthi/api/routes/briefs.py` | `/tasks/{id}/brief` |
| `src/saarthi/api/routes/research.py` | `/tasks/{id}/research`, `/research/{id}` |
| `src/saarthi/api/routes/ws.py` | `/ws` (Decision 12) |
| `src/saarthi/core/ids.py` | `new_ulid()`, `format_task_id(n)`, `parse_task_id(text)` |
| `src/saarthi/core/stages.py` | `Stage`, `By`, `Move`, `ALLOWED_MOVES`, `brief_has_goal`, `check_move()` |
| `src/saarthi/core/tasks.py` | Task Engine: create, update, move, list with filters, get |
| `src/saarthi/core/projects.py` | add (git checks, toml create), list with counts, get, rename, remove |
| `src/saarthi/core/project_config.py` | `ProjectConfig` model, `load_project_config(repo)`, `write_default_project_toml(repo)` |
| `src/saarthi/core/briefs.py` | save version, latest, `render_markdown`, `parse_markdown` |
| `src/saarthi/core/research.py` | add, list, update, delete |
| `src/saarthi/core/events.py` | `EventBus`, `Subscription`, topic matching, JSONL writer |
| `src/saarthi/core/uow.py` | `UnitOfWork`: write lock, session, `emit()`, commit -> fan-out, retry on locked |
| `src/saarthi/core/tools.py` | tool lookup + version (health, project add warnings) |
| `src/saarthi/workspace/git.py` | `run_git(args: list[str], cwd) -> str`; `repo_toplevel()`, `detect_default_branch()`. M2 grows this module. |
| `src/saarthi/db/base.py` | `DeclarativeBase`, `UtcDateTime` |
| `src/saarthi/db/models.py` | the 7 tables (section 6) |
| `src/saarthi/db/session.py` | engine, pragmas, session factory |
| `src/saarthi/db/migrate.py` | `upgrade_to_head(settings)` with backup |
| `src/saarthi/db/migrations/env.py`, `versions/0001_m1_core_tables.py` | Alembic (inside the package so it ships with `uv tool install`) |
| `src/saarthi/schemas/*.py` | Pydantic in/out models: `projects`, `tasks`, `briefs`, `research`, `events`, `health`, `errors`, `ws` |
| `src/saarthi/cli/main.py` | Typer app, sub-apps `daemon`, `project`, `task`, `brief` |
| `src/saarthi/cli/client.py` | `ApiClient` on `httpx.Client`; reads port + token; maps errors to exit codes. Tests inject a `TestClient`. |
| `src/saarthi/cli/output.py` | Rich tables, `--json` printing, relative times |
| `src/saarthi/cli/editor.py` | open `$VISUAL`/`$EDITOR` on a temp file (`shlex.split`, list args) |

---

## 6. Data model changes

Migration: `src/saarthi/db/migrations/versions/0001_m1_core_tables.py` (revision `0001`). Seven tables, as core TDD 5. All FKs `ON DELETE CASCADE`.

| Table | Columns (core TDD 5) | M1 notes |
|---|---|---|
| `projects` | id, name, repo_path, default_branch, default_agent, memory_path, created_at | unique `name`, unique `repo_path`; last 3 are a cache (Decision 6) |
| `tasks` | id, project_id, title, stage, priority, labels, ticket_url, branch, worktree_path, permission_profile, total_cost_usd, total_seconds, created_at, updated_at | defaults: stage `inbox`, priority `2`, labels `[]`, profile `DEFAULT_PERMISSION_PROFILE`, totals `0`; `branch` / `worktree_path` stay null until M2; index `(project_id, stage)` |
| `briefs` | id, task_id, version, goal, acceptance, notes, focus_paths, created_at | unique `(task_id, version)`; goal/notes default `""`, lists default `[]` |
| `research_items` | id, task_id, kind, title, body, url, send_to_agent, created_at | `kind` in `note/link/snippet/agent_finding`; API accepts the first three; `send_to_agent` default `true`; index `task_id` |
| `runs` | id, task_id, agent, mode, playbook_id, status, agent_session_id, pid, started_at, ended_at, tokens_in, tokens_out, cost_usd, summary, checkpoint_ref, log_path | **schema only**, no code writes it in M1; index `(task_id, started_at)` |
| `events` | id (INTEGER PK AUTOINCREMENT), task_id, run_id, type, payload, created_at | **+ `project_id` (new, Decision 11)**; `run_id` FK to `runs` nullable; indexes `(task_id, id)`, `(project_id, id)`, `(run_id, id)` |
| `settings` | key (PK), value (json) | M1 uses only `internal.task_counter`. Keys starting with `internal.` are not user settings (M3's `/settings` must hide them). |

`AUTOINCREMENT` on `events.id` so ids never go back after deletes (replay depends on it).

---

## 7. Events added

Shape: core TDD 6.1 plus `project_id`. `run_id` is always `null` in M1.

| Type | When | Payload |
|---|---|---|
| `task.created` | task made | `{"title", "stage": "inbox", "priority", "labels", "ticket_url"}` |
| `task.updated` | PATCH with real changes | `{"changes": {"<field>": {"old": ..., "new": ...}}}` |
| `task.stage_changed` | stage move | `{"from", "to", "by": "user"\|"system", "reason": str \| null}` |
| `brief.saved` | new brief version | `{"brief_id", "version", "has_goal": bool}` |
| `research.added` | item added | `{"research_id", "kind", "title"}` |
| `research.updated` | item edited or deleted | `{"research_id", "changes": [field names], "deleted": bool}` **(new: delete uses this type)** |

No `project.*` events (not in core 6.2; FSD open question 1).

---

## 8. API and CLI added

### 8.1 REST (prefix `/api/v1`, header `Authorization: Bearer <token>`)

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/health` | - | `200 {status, version, pid, uptime_sec, db: {path, schema}, tools: {git\|claude\|codex\|gh: {found, path, version, logged_in}}}` |
| GET | `/projects` | `?path=<abs>` (optional) | `200 [ProjectOut]` with `open_tasks`, `running_runs` |
| POST | `/projects` | `{path, name?, memory_path?}` | `201 {project, warnings: [str], created_project_toml: bool}` |
| GET | `/projects/{project}` | id or name | `200 {project, settings: {key: {value, source: "file"\|"default"\|"git"}}}` |
| PATCH | `/projects/{project}` | `{name}` | `200 ProjectOut` |
| DELETE | `/projects/{project}` | - | `200 {deleted_tasks: int}` |
| GET | `/projects/{project}/tasks` | `?stage=&label=&agent=&q=&include_archived=false` (repeatable `stage`, `label`) | `200 [TaskOut]` sorted priority, then `updated_at` desc |
| POST | `/projects/{project}/tasks` | `{title, priority?, labels?, ticket_url?}` | `201 TaskOut` |
| GET | `/tasks/{id}` | `?include=brief,events` | `200 {task, brief?, events?}` |
| PATCH | `/tasks/{id}` | `{title?, priority?, labels?, ticket_url?}` | `200 TaskOut` |
| POST | `/tasks/{id}/stage` | `{to, reason?}` | `200 {task, changed: bool, event_id: int\|null}`; `409 move_not_allowed` / `system_move` / `rule_failed` |
| GET | `/tasks/{id}/brief` | - | `200 {brief: BriefOut\|null, markdown: str}` |
| PUT | `/tasks/{id}/brief` | `{markdown}` **or** `{goal, acceptance, notes, focus_paths}` | `201 {brief, created: true}` or `200 {brief, created: false}` |
| GET | `/tasks/{id}/research` | - | `200 [ResearchOut]` |
| POST | `/tasks/{id}/research` | `{kind, title, body?, url?, send_to_agent?}` | `201 ResearchOut` |
| PATCH | `/research/{id}` | any of `title, body, url, send_to_agent` | `200 ResearchOut` |
| DELETE | `/research/{id}` | - | `204` |
| WS | `/ws?token=` | Decision 12 | events + control messages |

`/openapi.json` is served under the same prefix (token needed). M3 generates the TS client from it.

### 8.2 CLI

Every read command has `--json`. Project is chosen by `--project/-p`, else `GET /projects?path=$PWD`, else the only project, else error with the list.

| Command | Options | Output |
|---|---|---|
| `saarthi daemon start` | `--dev` (port comes from config / `SAARTHI_PORT`, so every CLI call finds it) | `Daemon started (pid N) on http://127.0.0.1:7878` |
| `saarthi daemon stop` | `--force` | `Daemon stopped.` |
| `saarthi daemon status` | `--json` | health table (FSD 5.1); exit 2 if not running |
| `saarthi project add <path>` | `--name`, `--memory-path`, `--json` | summary + warnings |
| `saarthi project list` | `--json` | table: name, open tasks, running, repo |
| `saarthi project show <project>` | `--json` | settings with source |
| `saarthi project rename <project> <new>` | | `Renamed.` |
| `saarthi project remove <project>` | `--yes` | confirm prompt, then `Removed X (N tasks).` |
| `saarthi task new "<title>"` | `-p`, `--priority`, `--label` (repeat), `--ticket`, `--json` | `Created T-0007 ...` |
| `saarthi task list` | `-p`, `--all-projects`, `--stage`, `--label`, `--agent`, `--search`, `--all`, `--json` | table (one per project with `--all-projects`) |
| `saarthi task show <id>` | `--json` | task, brief summary, events |
| `saarthi task edit <id>` | `--title`, `--priority`, `--label` (repeat, replaces), `--no-labels`, `--ticket` | `Updated T-0007 (title, labels).` |
| `saarthi task move <id> <stage>` | `--reason` | `T-0001  Inbox -> Ready` |
| `saarthi brief edit <id>` | `--file <path>` | `Saved brief v2 for T-0001` / `No changes.` |
| `saarthi brief show <id>` | `--json` | markdown of the latest brief |

---

## 9. Key flows step by step

### 9.1 `saarthi project add <path>`
1. CLI sends `POST /projects {path: <absolute path>}`.
2. Daemon: path exists? `git -C <path> rev-parse --show-toplevel` -> repo root (else `422 not_a_git_repo`).
3. Repo root already in `projects`? -> `409 project_exists`.
4. `.saarthi/project.toml` missing -> write the default template (values from `config.py`); else parse it (`422 bad_project_toml` with line number on error).
5. Resolve settings (Decision 6). Check memory folder exists -> warning if not. Check tools -> warnings.
6. Insert `projects` row. Return project + warnings.

### 9.2 `saarthi task new "<title>"`
1. CLI resolves project, sends `POST /projects/{p}/tasks`.
2. `UnitOfWork` (write lock): read `internal.task_counter` (0 if missing), +1, save; insert task `T-%04d`; `emit("task.created")`.
3. Commit -> JSONL -> WebSocket. Return task.

### 9.3 `saarthi task move T-0001 ready`
1. `POST /tasks/T-0001/stage {to: "ready"}`.
2. Normalise the ID; load task + latest brief.
3. Same stage -> `200 changed:false`.
4. `check_move(from, to, by=USER, ctx)`: not in table -> `409 move_not_allowed` (message lists the allowed targets); `by=SYSTEM` -> `409 system_move` ("This happens automatically when a run starts."); guard returns a reason -> `409 rule_failed` with hint `saarthi brief edit T-0001`.
5. Update `stage`, `updated_at`; `emit("task.stage_changed")`; commit; fan out.

### 9.4 `saarthi brief edit T-0001`
1. `GET /tasks/T-0001/brief` -> markdown (or empty template).
2. Write it to a temp file `saarthi-brief-T-0001-*.md`; run the editor (list args, wait).
3. Editor exit code != 0 -> print "nothing saved", delete temp file, exit 1.
4. File text equals what we wrote -> "No changes.", exit 0.
5. `PUT /tasks/T-0001/brief {markdown}`. Daemon parses; same fields as latest -> `created:false`; else insert version `n+1`, `emit("brief.saved")`.
6. On a failed PUT keep the temp file and print its path.

### 9.5 WebSocket subscribe with replay
1. Connect with `?token=`; bad -> close `4401`.
2. Client sends `{subscribe, last_event_id}`; unknown topic form -> `control:error`, connection stays open.
3. Register queue, query missed events for the topics, send them (or `resync` if too many), drain the queue skipping sent ids, send `control:subscribed`, then stream live.

---

## 10. Config added

`config.py` constants (names fixed; values are defaults):

| Constant | Value | Used by |
|---|---|---|
| `API_HOST` | `"127.0.0.1"` (not overridable) | daemon |
| `API_PREFIX` | `"/api/v1"` | API, CLI |
| `DEFAULT_PORT` | `7878` | daemon, CLI |
| `APP_DIR_NAME` | `"saarthi"` | XDG paths |
| `DB_FILENAME`, `TOKEN_FILENAME`, `PID_FILENAME`, `LOCK_FILENAME` | `"saarthi.db"`, `"token"`, `"saarthid.pid"`, `"saarthid.lock"` | daemon |
| `TOKEN_BYTES` | `32` | auth |
| `DB_BUSY_TIMEOUT_MS`, `DB_WRITE_RETRIES`, `DB_RETRY_BACKOFF_SEC` | `5000`, `3`, `(0.1, 0.3, 0.9)` | uow |
| `TASK_ID_PREFIX`, `TASK_ID_MIN_DIGITS`, `TASK_COUNTER_KEY` | `"T-"`, `4`, `"internal.task_counter"` | ids |
| `TASK_TITLE_MAX_LEN`, `PRIORITIES`, `DEFAULT_PRIORITY` | `200`, `(1, 2, 3)`, `2` | tasks |
| `DEFAULT_PERMISSION_PROFILE` | `"safe_build"` | tasks |
| `TASK_SHOW_EVENTS_LIMIT` | `200` | `GET /tasks/{id}` |
| `PROJECT_DIR_NAME`, `PROJECT_TOML_NAME` | `".saarthi"`, `"project.toml"` | project config |
| `DEFAULT_BRANCH_FALLBACK`, `DEFAULT_AGENT`, `KNOWN_AGENTS`, `DEFAULT_MEMORY_PATH`, `DEFAULT_SYNC_STRATEGY`, `DEFAULT_CREATE_PR` | `"main"`, `"claude"`, `("claude","codex")`, `"core_docs"`, `"rebase"`, `True` | project config |
| `HEALTH_TOOLS`, `TOOL_VERSION_TIMEOUT_SEC`, `HEALTH_TOOL_CACHE_SEC` | `("git","claude","codex","gh")`, `5`, `60` | health |
| `WS_QUEUE_MAX`, `WS_REPLAY_MAX_EVENTS`, `WS_PING_INTERVAL_SEC` | `1000`, `5000`, `20` | ws |
| `DAEMON_START_TIMEOUT_SEC`, `DAEMON_STOP_TIMEOUT_SEC`, `CLI_HTTP_TIMEOUT_SEC` | `10`, `10`, `10` | CLI |
| `FALLBACK_EDITOR` | `"vi"` | CLI |
| `LOG_MAX_BYTES`, `LOG_BACKUP_COUNT` | `10_000_000`, `3` | logging |

`~/.config/saarthi/config.toml` (all optional):
```toml
[daemon]
port = 7878
log_level = "info"

[cli]
editor = ""        # empty = use $VISUAL / $EDITOR / FALLBACK_EDITOR
```

`.saarthi/project.toml` — M1 reads only `[project]`:

| Key | Default | Used from |
|---|---|---|
| `default_branch` | from git, else `"main"` | M2 |
| `default_agent` | `"claude"` | M2 |
| `memory_path` | `"core_docs"` | M6 (M1 only checks it exists) |
| `sync_strategy` | `"rebase"` | M5 |
| `create_pr` | `true` | M5 |

Unknown keys in `[project]` -> warning, ignored. Other tables (`[[checks]]`, `[risk]`) are kept raw and not checked; M4 / M5 add their models. The template written on add has the `[project]` block plus a commented-out `[[checks]]` example.

---

## 11. Error handling

| Case | What we do |
|---|---|
| Daemon not running (CLI) | `Daemon is not running. Start it: saarthi daemon start`, exit 2 |
| Missing / wrong token | `401 unauthorized`; WS close `4401` |
| Port in use on start | `saarthid` exits with "Port 7878 is in use. Set [daemon] port in config.toml." |
| Second daemon | lock held -> "Daemon already running (pid N)" |
| Path is not a git repo | `422 not_a_git_repo` |
| Repo already added / name taken | `409 project_exists` / `409 name_taken` |
| `project.toml` invalid | `422 bad_project_toml` with line number; existing projects keep their cached values and log a warning |
| Unknown project / task / research id | `404 project_not_found` / `task_not_found` / `research_not_found` |
| Bad task ID text (`X-12`) | `422 bad_task_id` |
| Move not in table / system move / guard fails | `409 move_not_allowed` / `system_move` / `rule_failed` (with hint) |
| Brief markdown has no known section | saved as notes only; goal empty (still a valid draft) |
| Editor not found | "Editor 'x' not found. Set $EDITOR.", exit 1 |
| DB locked (outside writer, e.g. sqlite3 shell) | retry `DB_WRITE_RETRIES` times with backoff, then `503 db_busy` |
| JSONL write fails | log error; request still succeeds |
| Migration fails | daemon does not start; message names the backup file |
| WS slow client | close `4008`; client reconnects and replays |

---

## 12. Tests to write

`daemon/tests/conftest.py`: `env` fixture (sets `SAARTHI_DATA_DIR`/`SAARTHI_CONFIG_DIR` to `tmp_path`), `client` fixture (`TestClient(create_app(...))` with the token header), `git_repo` fixture (`git init` + one commit, list args). No agents, no network.

| File | Proves |
|---|---|
| `tests/unit/test_stages.py` | All 121 `(from, to)` pairs: allowed iff in `ALLOWED_MOVES`; USER vs SYSTEM; `brief_has_goal` (no brief, blank goal, goal) on every move into `ready`; `PARKABLE` |
| `tests/unit/test_ids.py` | format/parse, `t-7` -> `T-0007`, `T-10000`, bad input |
| `tests/unit/test_brief_markdown.py` | round trip; comments removed; unknown heading -> notes; `*` and `-` lists; empty file |
| `tests/unit/test_project_config.py` | defaults; partial file; bad TOML -> error with line; unknown key warning; `[[checks]]` kept; template parses back to defaults |
| `tests/unit/test_config.py` | env overrides; XDG paths; `API_HOST` cannot be changed |
| `tests/unit/test_event_bus.py` | emit + commit -> row, JSONL line, subscriber gets it, in id order; rollback -> nothing; topic matching (`all`, `board`, `task`); slow subscriber closed |
| `tests/unit/test_uow.py` | counter never reused after project delete; concurrent creates get distinct IDs |
| `tests/integration/test_migrations.py` | `upgrade head` on empty DB makes 7 tables; Alembic autogenerate diff vs models is empty; backup made when behind |
| `tests/integration/test_auth.py` | no/wrong token -> 401 on REST and WS; token file mode 600; bad host header rejected |
| `tests/integration/test_api_projects.py` | add (sub-folder -> top level), not git, duplicate, toml created / never overwritten, `?path=` lookup, name-or-id, rename, delete cascades and leaves repo |
| `tests/integration/test_api_tasks.py` | IDs global across projects; filters alone and combined; `include=brief,events`; PATCH emits `task.updated` only on real change |
| `tests/integration/test_api_stage.py` | the MILESTONES "done when" flow; `system_move`; park / un-park |
| `tests/integration/test_api_briefs.py` | v1, v2; unchanged -> `created:false`, no event; markdown and structured PUT |
| `tests/integration/test_api_research.py` | add / list / patch / delete + events |
| `tests/integration/test_ws.py` | live event; reconnect with `last_event_id` gets missed events with no gap or duplicate; `resync` when over the limit; bad topic -> control error |
| `tests/integration/test_cli.py` | Typer `CliRunner` with `ApiClient` backed by `TestClient`: `project add`, `task new`, `task move` (blocked, then ok), `brief edit --file`, `task show --json`; exit codes 1/2 |
| `tests/integration/test_daemon_process.py` (marked `slow`) | real `saarthid` on a free port in `tmp_path`: start, status, second start refused, stop |

Coverage gate: `--cov=saarthi.core --cov-fail-under=80` in pytest `addopts`.

---

## 13. Manual verification

Follow the FSD QA checklist (section 9), then paste the output of:
```bash
cd daemon && uv run pytest && uv run ruff check . && uv run pyright
```

---

## 14. Risks

| Risk | What we do |
|---|---|
| Async SQLite + `aiosqlite` adds complexity | One `UnitOfWork`, one lock; tests run real SQLite files in `tmp_path`. |
| Global IDs surprise the user ("why T-0007 in a new project?") | Documented in FSD 5.3; cheap to explain, hard to change later, so decide now. |
| `project.toml` and DB cache drift | File always wins; cache refreshed on load (mtime check). |
| Hard delete loses history | Confirm prompt with task count; JSONL stays on disk; open question for owner. |
| WebSocket replay race (duplicates or gaps) | Register-then-query-then-drain with id skip; dedicated test. |
| Moves table missing rows that M2/M4/M5 need | Every core TDD 7 row is present now (as SYSTEM); later milestones only change tags and add guards. |
| Editor handling differs across editors (`code --wait`, `nvim`) | `shlex.split` the command; doc says GUI editors need their wait flag. |

---

## 15. What this milestone does not do

- No agents, runs, worktrees, Context Pack, notifier (M2). `runs` table exists, unused.
- No `/settings`, `/files`, `/search` endpoints, no UI, no CORS for Tauri (M3).
- No `Review` / `Shipped` guards, no override reason (M4, M5).
- No research CLI, link title fetch, brief versions view, "Draft brief" (M6).
- No secret masking (M8), no systemd unit (M9).

---

## 16. Effort breakdown

| Task | Hours |
|---|---|
| Package, tooling, `config.py`, logging | 2 |
| DB models, `UtcDateTime`, migration `0001`, migrate-on-start | 2 |
| `UnitOfWork` + Event Bus + JSONL + tests | 2.5 |
| `stages.py` + Task Engine + 121-pair tests | 2 |
| Projects + `project_config.py` + git helpers | 2 |
| Briefs (versions, markdown render/parse) | 1.5 |
| Research API | 0.5 |
| REST routes, error shape, auth, health | 2.5 |
| WebSocket subscribe + replay | 2 |
| Daemon lifecycle (lock, pid, start/stop/status) | 1 |
| CLI commands + editor + output | 2 |
| **Total** | **~20** |

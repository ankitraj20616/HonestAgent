# Technical Design Document (TDD)
## Saarthi - Agentic Development Environment

**Version:** 0.1 (draft)
**Date:** 2026-10-11
**Related:** `FUNCTIONAL_SPECIFICATIONS.md` (what), `TECH_STACK.md` (with what)

> Simple English. This doc says **how** Saarthi is built.

---

## 1. Design goals

1. **Daemon owns everything.** All logic lives in one background process (`saarthid`). The UI and the CLI are only "remote controls".
2. **Agents are plugins.** Claude and Codex sit behind one `AgentAdapter` interface.
3. **Everything is an event.** Every action becomes an event saved to disk. The UI is built from events.
4. **Git is the safety net.** Worktrees for isolation, checkpoints for rewind.
5. **Boring tech.** SQLite, subprocess, HTTP, WebSocket. No magic.

## 2. Non-goals

- We do not build our own agent loop (the LLM calling tools). Claude Code and Codex already do that.
- We do not build a code editor.
- We do not run a cloud server.

---

## 3. Big picture

```
┌──────────────────────────────┐      ┌──────────────────────────┐
│  Saarthi Desktop (Tauri 2)   │      │  saarthi CLI (Typer)     │
│  React UI                    │      │                          │
└──────────────┬───────────────┘      └────────────┬─────────────┘
               │  HTTP (REST) + WebSocket (events) │
               │  127.0.0.1:7878 + token           │
               ▼                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                     saarthid  (Python daemon)                    │
│                                                                  │
│  API layer (FastAPI)                                             │
│     │                                                            │
│  ┌──┴───────────┐  ┌─────────────┐  ┌────────────┐  ┌─────────┐  │
│  │ Task Engine  │  │ Run Manager │  │ Check      │  │ Review  │  │
│  │ (stages,     │  │ (start/stop │  │ Runner     │  │ Builder │  │
│  │  rules)      │  │  agents)    │  │ (proof)    │  │ (story) │  │
│  └──────┬───────┘  └──────┬──────┘  └─────┬──────┘  └────┬────┘  │
│         │          ┌──────┴──────┐        │              │       │
│         │          │ Agent       │        │              │       │
│         │          │ Adapters    │        │              │       │
│         │          │ claude│codex│pty     │              │       │
│         │          └──────┬──────┘        │              │       │
│  ┌──────┴────────┐ ┌──────┴──────┐ ┌──────┴──────┐ ┌─────┴─────┐ │
│  │ Memory +      │ │ Workspace   │ │ Safety      │ │ Notifier  │ │
│  │ Context Pack  │ │ Manager(git)│ │ Guard       │ │           │ │
│  └───────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│                                                                  │
│  Event Bus  ──►  Event Store (SQLite + JSONL per run)            │
└──────────────────────────────────────────────────────────────────┘
               │                     │
               ▼                     ▼
     claude / codex processes     git worktrees on disk
```

---

## 4. Components

Each component: **job**, **input**, **output**.

### 4.1 API layer (`api/`)
- **Job:** Gives REST endpoints and one WebSocket.
- **Input:** HTTP requests from the UI / CLI.
- **Output:** JSON responses. Live events on WebSocket.
- **Notes:**
  - Binds only to `127.0.0.1`.
  - Every request needs a token (from `~/.config/saarthi/token`, made on first start).
  - OpenAPI schema is exported. The UI's TypeScript client is generated from it.

### 4.2 Task Engine (`core/tasks.py`)
- **Job:** Create / update tasks, move stages, enforce stage rules (FSD F2.5).
- **Input:** User actions, run results, check results.
- **Output:** Task updates + `task.*` events.
- **Notes:** The stage machine is in one file with a clear table of allowed moves (see section 7).

### 4.3 Run Manager (`core/runs.py`)
- **Job:** Start, watch, stop, and resume agent runs.
- **Input:** "start run" request (task, agent, mode, playbook).
- **Steps when starting a run:**
  1. Ask Workspace Manager for the task's worktree (create if missing).
  2. Ask Memory for the Context Pack.
  3. Ask Safety Guard for the permission profile -> agent flags.
  4. Call the adapter's `start()`.
  5. Read the adapter's event stream. Send each event to the Event Bus.
  6. On end: make a git checkpoint, save the summary, trigger the Check Runner (for `build` / `fix` modes).
- **Limits:** Max parallel runs (default 4). Extra runs wait in a queue.
- **Output:** `run.*` and `agent.*` events.

### 4.4 Agent Adapters (`agents/`)
- **Job:** Hide the differences between Claude, Codex, and others.
- **Interface (Python):**

```python
class AgentAdapter(Protocol):
    name: str                                   # "claude" | "codex"

    async def check_ready(self) -> ReadyStatus: ...        # installed? logged in?
    async def start(self, req: RunRequest) -> RunHandle: ... # start the process
    def events(self, h: RunHandle) -> AsyncIterator[AgentEvent]: ...  # normalized events
    async def send(self, h: RunHandle, text: str) -> None: ...         # follow-up / answer
    async def stop(self, h: RunHandle) -> None: ...
    async def resume(self, req: RunRequest, session_id: str) -> RunHandle: ...
```

- **ClaudeAdapter**
  - Command: `claude -p --output-format stream-json --input-format stream-json --verbose [--resume ID] [--permission-mode ...] [--allowedTools ...]`
  - Working dir = task worktree.
  - Prompt and follow-ups go in through stdin as stream-json messages.
  - Maps Claude JSON lines -> `AgentEvent`.
- **CodexAdapter**
  - Command: `codex exec --json -C <worktree> --sandbox <mode> "<prompt>"`, follow-ups through `codex exec resume <id>`.
  - Maps Codex JSONL -> `AgentEvent`.
  - For Second Opinion: use `--output-schema review_findings.schema.json` to get findings in a fixed shape.
- **PtyShellAdapter**
  - Runs any command (plain `claude` or `codex` interactive) in a pseudo-terminal.
  - Sends raw bytes to the UI terminal (xterm.js). No structured events, only `terminal.output`.
- **FakeAdapter** (tests only)
  - Replays a recorded JSONL file. Used in all tests so we never call real agents in CI.

### 4.5 Workspace Manager (`workspace/`)
- **Job:** All git work.
- **Functions:**
  - `create_worktree(task)` -> `git worktree add <root>/<project>/<task-id> -b saarthi/<task-id>-<slug> <base>`
  - `run_setup_script(task)` -> runs `.saarthi/setup.sh` once.
  - `status(task)` -> changed files, ahead/behind.
  - `diff(task)` -> diff against the base branch.
  - `checkpoint(task, label)` -> saves a snapshot without touching the branch (see 4.5.1).
  - `rewind(task, checkpoint_id)` -> checkpoint current state first, then restore.
  - `sync_with_base(task)` -> rebase or merge.
  - `remove_worktree(task)` -> `git worktree remove`.
- **4.5.1 Checkpoint method:**
  - Use a temp index: `GIT_INDEX_FILE=<tmp> git add -A && git write-tree && git commit-tree`.
  - Save the commit under a hidden ref: `refs/saarthi/checkpoints/<task-id>/<n>`.
  - The task branch history stays clean.
- **Rule:** Use subprocess `git`, never shell strings. Always pass args as a list.

### 4.6 Check Runner (`checks/`)
- **Job:** Run the project's checks in a worktree and build the Proof Card.
- **Input:** Checks from `.saarthi/project.toml`.
- **Steps:**
  1. Run checks one by one (or in parallel if `parallel = true`).
  2. Save exit code, time, last 200 lines of output (full output saved to a file).
  3. Ask the agent (cheap, read-only call) to fill "Brief coverage": each acceptance criterion -> met / not sure / not met.
  4. Build the `ProofCard` and save it.
- **Output:** `check.*` events + a `ProofCard`.

### 4.7 Review Builder (`review/`)
- **Job:** Make the Change Story.
- **Steps:**
  1. Get the diff (per file, per hunk).
  2. Run rule-based risk flags (no AI): migrations, deleted files, auth paths, dependency files, CI/config, big files. Patterns live in `config.py` and can be changed per project.
  3. Ask the agent to group hunks by purpose and write 1-2 lines per group. Output in a fixed JSON shape (JSON Schema).
  4. If the agent output is invalid -> fall back to "group by folder".
- **Output:** `ChangeStory` object.

### 4.8 Memory + Context Pack (`memory/`)
- **Job:** Read `core_docs/`, choose what is relevant, build the Context Pack, draft memory updates.
- **Context Pack build (v1, simple):**
  1. Always include: brief, CLAUDE.md / AGENTS.md (the agent reads them itself; we only list them), the playbook.
  2. Include research items where "send to agent" = yes.
  3. Include memory files that match brief keywords (ripgrep score), max 5 files, max ~20k characters total.
  4. Write the pack to `<worktree>/.saarthi/context/TASK.md` (git-ignored).
  5. The prompt tells the agent: "Read `.saarthi/context/TASK.md` first."
- **Why a file and not a long prompt:** the agent can re-read it any time, and we can show the exact same file to the user.
- **Memory update (on ship):** agent drafts text for `memory/`, `learnings/`, `timeline/`. Saved as "pending". User approves -> written to the files.

### 4.9 Safety Guard (`safety/`)
- **Job:** Turn a permission profile into agent flags, and check commands.
- **Profiles -> flags:**

| Profile | Claude | Codex |
|---|---|---|
| Read-only | `--permission-mode plan` + only read tools allowed | `--sandbox read-only` |
| Safe build | allowed tools list + blocked commands list | `--sandbox workspace-write` |
| Full | `--dangerously-skip-permissions` (only with bwrap sandbox, later) | `--sandbox workspace-write` + no approvals |

- **Secret masking:** Before an event is saved or sent, values from the project `.env` files and patterns (keys, tokens) are replaced with `****`.
- **Later (M8):** wrap the agent command in `bwrap` so only the worktree is writable and secret folders are hidden.

### 4.10 Event Bus and Event Store (`core/events.py`)
- **Job:** One place for all events.
- **Flow:** component -> `bus.publish(event)` -> (1) save to SQLite, (2) append to the run's JSONL file, (3) push to WebSocket subscribers.
- **Why two stores:** SQLite for fast queries. JSONL as the full raw log (easy to debug, easy to replay).

### 4.11 Notifier (`core/notify.py`)
- **Job:** Desktop notifications.
- Listens for `agent.needs_input`, `run.finished`, `check.finished`.
- Sends to the UI (Tauri shows a native alert). If no UI is open, uses `notify-send`.

---

## 5. Data model (SQLite)

> Simple tables. IDs are short readable strings (example: `T-0042`) for tasks and ULIDs for the rest.

### 5.1 `projects`
| Field | Type | Note |
|---|---|---|
| id | text | ULID |
| name | text | |
| repo_path | text | absolute path |
| default_branch | text | `main` |
| default_agent | text | `claude` / `codex` |
| memory_path | text | default `core_docs` |
| created_at | datetime | |

### 5.2 `tasks`
| Field | Type | Note |
|---|---|---|
| id | text | `T-0042` |
| project_id | text | FK |
| title | text | |
| stage | text | see section 7 |
| priority | int | 1/2/3 |
| labels | json | list of strings |
| ticket_url | text | optional |
| branch | text | set when the worktree is made |
| worktree_path | text | |
| permission_profile | text | `read_only` / `safe_build` / `full` |
| total_cost_usd | real | sum of runs |
| total_seconds | int | sum of runs |
| created_at, updated_at | datetime | |

### 5.3 `briefs`
| Field | Type | Note |
|---|---|---|
| id | text | |
| task_id | text | FK |
| version | int | goes up on each save |
| goal | text | |
| acceptance | json | list of strings |
| notes | text | |
| focus_paths | json | optional |
| created_at | datetime | |

### 5.4 `research_items`
| Field | Type | Note |
|---|---|---|
| id | text | |
| task_id | text | FK |
| kind | text | `note` / `link` / `snippet` / `agent_finding` |
| title | text | |
| body | text | |
| url | text | for links |
| send_to_agent | bool | |
| created_at | datetime | |

### 5.5 `runs`
| Field | Type | Note |
|---|---|---|
| id | text | |
| task_id | text | FK |
| agent | text | `claude` / `codex` / `pty` |
| mode | text | `plan` / `build` / `fix` / `research` / `review` |
| playbook_id | text | optional |
| status | text | `queued` / `running` / `needs_input` / `done` / `failed` / `stopped` / `interrupted` |
| agent_session_id | text | for resume |
| pid | int | |
| started_at, ended_at | datetime | |
| tokens_in, tokens_out | int | if reported |
| cost_usd | real | if reported |
| summary | text | last agent message |
| checkpoint_ref | text | git ref at end |
| log_path | text | JSONL file |

### 5.6 `events`
| Field | Type | Note |
|---|---|---|
| id | integer | auto increment (gives order) |
| task_id | text | |
| run_id | text | nullable |
| type | text | see section 6 |
| payload | json | |
| created_at | datetime | |

### 5.7 `checks` and `proof_cards`
- `check_results`: id, task_id, run_id, name, command, required, status (`pass`/`fail`/`skip`/`error`), exit_code, seconds, output_tail, output_path.
- `proof_cards`: id, task_id, run_id, all_required_passed (bool), files_changed, lines_added, lines_removed, tests_added, coverage (json: list of {criterion, status, note}), override_reason.

### 5.8 Review tables
- `change_stories`: id, task_id, run_id, groups (json), risk_flags (json), created_at.
- `review_comments`: id, task_id, file, line, group_id, body, status (`open`/`sent`/`resolved`), created_at.
- `review_findings`: id, task_id, reviewer_agent, file, line, severity, reason, status (`open`/`sent`/`ignored`).

### 5.9 Others
- `playbooks`: id, scope (`global`/`project`), project_id, name, description, prompt, default_agent, default_mode.
- `memory_updates`: id, task_id, file_path, proposed_text, status (`pending`/`approved`/`rejected`).
- `settings`: key, value (json).

---

## 6. Events

### 6.1 Shape (same for all)
```json
{
  "id": 1042,
  "type": "agent.tool_call",
  "task_id": "T-0042",
  "run_id": "01JA...",
  "ts": "2026-10-11T10:22:31Z",
  "payload": { "tool": "Edit", "path": "app/api/auth.py", "summary": "add reset endpoint" }
}
```

### 6.2 Event types
| Group | Types |
|---|---|
| Task | `task.created`, `task.updated`, `task.stage_changed` |
| Brief | `brief.saved` |
| Research | `research.added`, `research.updated` |
| Run | `run.queued`, `run.started`, `run.finished`, `run.failed`, `run.stopped`, `run.interrupted` |
| Agent | `agent.message`, `agent.thinking`, `agent.tool_call`, `agent.tool_result`, `agent.file_changed`, `agent.needs_input`, `agent.cost` |
| Terminal | `terminal.output` (raw bytes, base64, not saved to SQLite - only to the log file) |
| Check | `check.started`, `check.finished`, `proof.ready` |
| Review | `review.story_ready`, `review.finding`, `review.comment`, `review.approved`, `review.rejected` |
| Ship | `ship.committed`, `ship.pushed`, `ship.pr_created` |
| Memory | `memory.update_proposed`, `memory.update_applied` |
| Workspace | `workspace.created`, `workspace.checkpoint`, `workspace.rewound`, `workspace.removed` |

### 6.3 Mapping rule
- Each adapter maps its own raw lines to these types.
- Unknown raw lines are **not dropped**. They become `agent.message` with `payload.raw = true`, so we see them and can add proper mapping later.

---

## 7. Task stage machine

```
           ┌──────────────────────────── Parked ◄───────────── (any stage)
           │
 Inbox ──► Research ──► Ready ──► Running ──► Verifying ──► Review ──► Shipped ──► Archived
                          ▲          │  ▲          │           │
                          │          ▼  │          ▼           │
                          │      Needs You      Failed ────────┘ (fix run -> Running)
                          └──────────────────────────────────── (reject -> Ready)
```

| From | To | Rule |
|---|---|---|
| Inbox | Research / Ready | Ready needs a brief goal |
| Ready | Running | A run starts |
| Running | Needs You | Agent emits `agent.needs_input` |
| Needs You | Running | User answers |
| Running | Verifying | Build / fix run ends -> checks start |
| Running | Ready | Plan / research run ends |
| Verifying | Review | All required checks pass, OR override with reason |
| Verifying | Failed | A required check fails |
| Failed | Running | User starts a fix run |
| Review | Running | User sends comments / findings to the agent |
| Review | Ready | User rejects |
| Review | Shipped | Commit done (+ PR if enabled) |
| Any | Parked | User parks. Running runs are stopped first. |
| Shipped / Parked | Archived | User archives |

- The table lives in code as data (`ALLOWED_MOVES`), not as many `if` statements.

---

## 8. Key flows (step by step)

### 8.1 Start a build run
1. UI: `POST /tasks/T-0042/runs {agent: "claude", mode: "build", playbook_id: "plan-then-build"}`
2. Task Engine checks: stage is `Ready`, `Failed`, or `Review`.
3. Run Manager: queue full? -> `run.queued`. Else continue.
4. Workspace Manager: worktree exists? No -> create + setup script -> `workspace.created`.
5. Memory: build Context Pack -> write `.saarthi/context/TASK.md`.
6. Safety Guard: profile `safe_build` -> Claude flags.
7. ClaudeAdapter.start() -> process starts in the worktree -> `run.started`.
8. Events stream -> Event Bus -> SQLite + JSONL + WebSocket -> UI updates live.
9. Process ends -> `checkpoint()` -> `run.finished` -> Task to `Verifying` -> Check Runner starts.

### 8.2 Agent needs you
1. Adapter sees a question or permission request -> `agent.needs_input {question, options}`.
2. Task -> `Needs You`. Notifier -> desktop alert.
3. User answers in the UI -> `POST /runs/{id}/input {text}`.
4. Adapter `send()` -> agent continues -> Task -> `Running`.

### 8.3 Checks and proof
1. Check Runner reads `.saarthi/project.toml`.
2. Runs each check in the worktree with a timeout.
3. Builds the Proof Card -> `proof.ready`.
4. All required pass -> Task -> `Review` + Review Builder makes the Change Story.
5. Any required fails -> Task -> `Failed`. UI shows "Fix with agent" (auto-fix round counter).

### 8.4 Second Opinion
1. Pick the other agent (Claude built -> Codex reviews).
2. Start a run with mode `review`, profile `read_only`, Context Pack = brief + diff.
3. Codex: `--output-schema review_findings.schema.json`. Claude: prompt asks for the same JSON shape.
4. Parse findings -> `review_findings` table -> shown in the Change Story.

### 8.5 Ship
1. Agent drafts a commit message (read-only call) -> user edits.
2. `git add -A && git commit` in the worktree.
3. `git push -u origin <branch>` (never the default branch - checked in code).
4. `gh pr create --title ... --body-file <generated.md>`.
5. Memory updates drafted -> user approves -> written to `core_docs/` **on the task branch**, so they are part of the PR.
6. Task -> `Shipped`. Ask to remove the worktree.

### 8.6 Daemon restart
1. On start, find runs with status `running` / `needs_input`.
2. Mark them `interrupted`. Task -> `Failed` with note "interrupted".
3. UI shows a "Resume" button -> uses `agent_session_id` with the adapter's `resume()`.

---

## 9. API (v1)

> All under `http://127.0.0.1:7878/api/v1`. Header: `Authorization: Bearer <token>`.

### 9.1 REST
| Method | Path | What |
|---|---|---|
| GET | `/health` | Daemon + tools status |
| GET / POST | `/projects` | List / add |
| GET / PATCH / DELETE | `/projects/{id}` | Read / edit / remove |
| GET / POST | `/projects/{id}/tasks` | List (with filters) / create |
| GET / PATCH | `/tasks/{id}` | Read / edit (title, priority, labels) |
| POST | `/tasks/{id}/stage` | Move stage `{to, reason?}` |
| GET / PUT | `/tasks/{id}/brief` | Latest brief / save new version |
| POST | `/tasks/{id}/brief/draft` | Ask agent to draft brief |
| GET / POST | `/tasks/{id}/research` | List / add item |
| PATCH / DELETE | `/research/{id}` | Edit / delete |
| GET / POST | `/tasks/{id}/runs` | List / start run |
| GET | `/runs/{id}` | Run details |
| GET | `/runs/{id}/events?after=` | Past events (paged) |
| POST | `/runs/{id}/input` | Answer / follow-up |
| POST | `/runs/{id}/stop` | Stop |
| POST | `/runs/{id}/resume` | Resume |
| GET | `/tasks/{id}/context-pack` | Preview Context Pack |
| POST | `/tasks/{id}/checks` | Run checks now |
| GET | `/tasks/{id}/proof` | Latest Proof Card |
| GET | `/tasks/{id}/review` | Change Story + findings + comments |
| POST | `/tasks/{id}/review/second-opinion` | Start cross review |
| POST | `/tasks/{id}/review/comments` | Add comment |
| POST | `/tasks/{id}/review/send` | Send selected comments / findings to agent |
| POST | `/tasks/{id}/review/decision` | Approve / reject |
| GET | `/tasks/{id}/workspace` | Branch, path, status |
| POST | `/tasks/{id}/workspace/sync` | Update from base |
| GET | `/tasks/{id}/checkpoints` | List |
| POST | `/tasks/{id}/checkpoints/{n}/rewind` | Rewind |
| POST | `/tasks/{id}/ship` | Commit / push / PR `{commit_message, create_pr}` |
| GET / POST | `/tasks/{id}/memory-updates` | List / approve-reject |
| GET / POST | `/playbooks` | List / create |
| GET / PUT | `/settings` | Read / save |
| GET | `/projects/{id}/files?path=` | Code Peek: tree / file content |
| GET | `/projects/{id}/search?q=` | ripgrep search |

### 9.2 WebSocket
- `ws://127.0.0.1:7878/api/v1/ws?token=...`
- Client sends: `{"subscribe": ["board:<project_id>", "task:T-0042", "run:<run_id>"]}`
- Server sends events in the shape from section 6.1.
- On reconnect, client sends `last_event_id`. Server sends missed events first.

---

## 10. Files on disk

```
~/.config/saarthi/
├── config.toml            # global settings
└── token                  # API token (chmod 600)

~/.local/share/saarthi/
├── saarthi.db             # SQLite
├── logs/
│   ├── daemon.log
│   └── runs/<run_id>.jsonl        # full raw + normalized events
├── checks/<task_id>/<check>.log   # full check output
└── worktrees/<project>/<task_id>/ # git worktrees

<repo>/.saarthi/           # committed to the project repo
├── project.toml           # checks, setup script, defaults
├── setup.sh               # optional, runs after worktree create
└── playbooks/*.md         # project playbooks

<worktree>/.saarthi/context/TASK.md   # Context Pack (git-ignored)
```

### 10.1 `project.toml` example
```toml
[project]
default_branch = "main"
default_agent = "claude"
memory_path = "core_docs"
sync_strategy = "rebase"
create_pr = true

[[checks]]
name = "tests"
cmd = "uv run pytest -q"
required = true
timeout_sec = 600

[[checks]]
name = "lint"
cmd = "uv run ruff check ."
required = true
timeout_sec = 120

[[checks]]
name = "types"
cmd = "uv run pyright"
required = false
timeout_sec = 300

[risk]
auth_paths = ["**/auth/**", "**/security/**"]
migration_paths = ["**/migrations/**", "**/alembic/**"]
```

---

## 11. UI design (desktop)

### 11.1 Layout
```
┌─────┬────────────────────────────────────────────────────────────┐
│ Nav │  Top bar: project switcher · Ctrl+K · running: 2 · $1.40   │
│     ├────────────────────────────────────────────────────────────┤
│ Deck│                                                            │
│Board│                    Main area                               │
│Mem  │   (Board  OR  Task Room  OR  Memory  OR  Playbooks)        │
│Play │                                                            │
│ Set │                                                            │
└─────┴────────────────────────────────────────────────────────────┘
```

### 11.2 Task Room
```
┌───────────────────────────────────────────────────────────────────┐
│ T-0042  Add password reset API      [Running ●]  claude · 12m · $0.42 │
├───────────────┬───────────────────────────────────────────────────┤
│ Brief         │  Tabs: Stream | Terminal | Proof | Review | Timeline │
│ Research      │                                                   │
│ Runs (3)      │   (live agent cards / proof card / change story)  │
│ Workspace     │                                                   │
│ Checkpoints   │                                                   │
├───────────────┴───────────────────────────────────────────────────┤
│ Message the agent…                                    [Send] [Stop] │
└───────────────────────────────────────────────────────────────────┘
```

### 11.3 UI rules
- The UI never holds business logic. It calls the API and renders events.
- Live state = load from REST once, then apply WebSocket events.
- Long lists (events, logs) use virtual scrolling.

---

## 12. Error handling

| Case | What we do |
|---|---|
| Agent CLI not installed / not logged in | Health page shows it. Run start returns a clear error with the fix command. |
| Agent process crashes | `run.failed` with the last 50 lines of stderr. Task -> `Failed`. |
| Agent emits invalid JSON line | Save as raw `agent.message`. Do not crash. |
| Git worktree create fails (branch exists) | Re-use the branch if it belongs to the same task, else add a suffix. |
| Check times out | Kill the process group. Mark `error` with "timeout". |
| WebSocket drops | UI reconnects with `last_event_id`. |
| Disk full / DB locked | Retry 3 times with backoff, then show an error banner. |
| Daemon restarts | See flow 8.6. |

---

## 13. Testing strategy

- **Unit tests** (pytest): stage machine, Context Pack builder, risk flag rules, event mapping for each adapter, secret masking.
- **Adapter tests:** feed recorded JSONL fixtures (`tests/fixtures/agents/claude_build_ok.jsonl`, `codex_needs_input.jsonl`, ...) into the mapper. Check the normalized events.
- **Integration tests:** real temp git repos (`tmp_path`) + `FakeAdapter`. Test full flows: create task -> run -> checks -> review -> ship (with a local bare repo as `origin`, no real GitHub).
- **API tests:** FastAPI `TestClient` + WebSocket tests.
- **UI tests:** Vitest for components. Playwright for 3 main flows against a daemon running with `FakeAdapter`.
- **Smoke test with real agents:** a manual script `scripts/smoke_real_agents.sh` (not in CI) that runs a tiny task with real Claude and Codex.
- **Rule:** TDD for core logic - write the failing test first.

---

## 14. Performance targets

| What | Target |
|---|---|
| Event: agent stdout -> UI | < 300 ms |
| Board load (200 tasks) | < 500 ms |
| Daemon idle RAM | < 200 MB |
| Parallel runs | 4 default, tested with 8 |
| App start (UI visible) | < 2 s |

---

## 15. Security

- API only on `127.0.0.1`, token required, token file `chmod 600`.
- Phone glance (later): separate read-mostly token, opt-in, LAN only.
- Never push to the default branch (checked in Workspace Manager, not only in UI).
- Secret masking before save and before send.
- Agents run in the worktree folder. Sandbox with `bwrap` in M8.
- No telemetry.

---

## 16. Open technical questions (to answer in M0 spike)

1. Exact event format of `claude -p --output-format stream-json` for questions and permission requests - how do we detect "needs input"?
2. Can `codex exec` ask questions mid-run, or does it only finish? If it only finishes, "Needs You" for Codex = the run ends with a question -> we resume with the answer.
3. Is `codex app-server` stable enough to use instead of `exec`?
4. Does Tauri 2 WebKitGTK on Ubuntu 24.04 run xterm.js and CodeMirror smoothly? If not, plan B: open the UI in a normal browser at `http://127.0.0.1:7878`.
5. Best way to keep agent processes alive when the daemon restarts (systemd `KillMode=process`?) - or accept "interrupted + resume".

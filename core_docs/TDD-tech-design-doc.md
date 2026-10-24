# Technical Design Document (TDD)
## Saarthi - Agentic Development Environment

**Version:** 0.2 (draft)
**Date:** 2026-10-23
**Related:** `FUNCTIONAL_SPECIFICATIONS.md` (what), `TECH_STACK.md` (with what), `design/2026-10-23-simple-ui-design.md` (UI), `decisions/ADR-002-cross-platform-lightweight.md` (platforms), `decisions/ADR-003-browser-testing.md` (browser testing, live preview)

> Simple English. This doc says **how** Saarthi is built.

---

## 1. Design goals

1. **Daemon owns everything.** All logic lives in one background process (`saarthid`). The UI and the CLI are only "remote controls".
2. **Agents are plugins.** Claude, Codex and Gemini sit behind one `AgentAdapter` interface.
3. **Everything is an event.** Every action becomes an event saved to disk. The UI is built from events.
4. **Git is the safety net.** Worktrees for isolation, checkpoints for rewind.
5. **Boring tech.** SQLite, subprocess, HTTP, WebSocket. No magic.
6. **One codebase, three OSes.** Linux, macOS and Windows. OS differences live in a few small wrappers (section 3.2), never in the UI.
7. **Light.** Keep the size budget (`TECH_STACK.md` 2.5).

## 2. Non-goals

- We do not build our own agent loop (the LLM calling tools). Claude Code and Codex already do that.
- We do not build a full code editor. Files (FSD F17) is a read and review view with tiny edits: no LSP, no debugger, no extensions.
- We do not run a cloud server.

---

## 3. Big picture

```
┌──────────────────────────────┐      ┌──────────────────────────┐
│  Saarthi Desktop (Tauri 2)   │      │  saarthi CLI (Typer)     │
│  React UI · daemon sidecar   │      │                          │
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
│         │          │ claude codex│        │              │       │
│         │          │ gemini pty  │        │              │       │
│         │          └──────┬──────┘        │              │       │
│  ┌──────┴────────┐ ┌──────┴──────┐ ┌──────┴──────┐ ┌─────┴─────┐ │
│  │ Memory +      │ │ Workspace   │ │ Safety      │ │ Notifier  │ │
│  │ Context Pack  │ │ Manager(git)│ │ Guard       │ │           │ │
│  └───────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│                                                                  │
│  ┌──────────────┐ ┌───────────────────────┐ ┌──────────────┐     │
│  │ Docs Finder  │ │ Ticket Provider (jira)│ │ Files        │     │
│  └──────────────┘ └───────────────────────┘ └──────────────┘     │
│  ┌──────────────────────────────────────────┐                    │
│  │ Browser (M11): finder, kit, dev server,  │──► Chromium        │
│  │ logins, evidence, MCP endpoint           │   (system or kit)  │
│  └──────────────────────────────────────────┘                    │
│                                                                  │
│  Event Bus  ──►  Event Store (SQLite + JSONL per run)            │
└──────────────────────────────────────────────────────────────────┘
               │                     │
               ▼                     ▼
   claude / codex / gemini        git worktrees on disk
   processes                      (many repos)
```

### 3.1 Runtime and many projects
- **Sidecar.** The desktop app ships `saarthid` as a Tauri sidecar binary (one file per OS, built in M9). On open, the app starts it, or connects to the one already running (for example the background service). It reads the token, then calls `/health` and compares versions. A mismatch shows the "version mismatch" screen. In dev, the daemon runs with `uv run`.
- **Many projects at once.** The daemon already owns every project: one database, one event bus, one run queue. The UI subscribes to the events of all projects (section 9.2), so Home (All projects) and the Needs-you count stay live for every repo. One window, no window per repo.
- Each task still has its own worktree in its own repo. The max parallel runs limit counts all projects together.

### 3.2 Cross-platform notes
| Topic | Linux | macOS | Windows |
|---|---|---|---|
| Paths (config, data, logs, worktrees) | `platformdirs` (`~/.config/saarthi`, `~/.local/share/saarthi`) | `platformdirs` (`~/Library/Application Support/saarthi`) | `platformdirs` (`%LOCALAPPDATA%\saarthi`) |
| PTY | stdlib `pty` | stdlib `pty` | ConPTY via `pywinpty` |
| Stop a process tree | process group (`killpg`) | process group (`killpg`) | Job Object / `taskkill /T` |
| Background service (optional) | systemd user service | launchd agent | Tauri autostart plugin / per-user Startup entry |
| Sandbox (M8) | `bwrap` | `sandbox-exec` profile | none in v1: "Full access" is not offered |
| Notifications | Tauri plugin; `notify-send` fallback | Tauri plugin | Tauri plugin |
| WebView | WebKitGTK | WKWebView | WebView2 |
| Browser for Live tests (M11) | Chrome -> Edge -> Chromium on `PATH` / `/opt` -> browser kit | Chrome -> Edge -> Chromium in `/Applications` -> browser kit | Chrome -> Edge (built in, so usually no download) -> Chromium -> browser kit |
| Live browser screencast (M12) | CDP `Page.startScreencast` | same | same |
| Agent drives the preview window (M12, spike-gated) | WebKitWebDriver (if the spike passes) | not supported (no WKWebView driver) | WebView2 remote debugging, CDP (if the spike passes) |

- Code never builds paths by hand from `~`. It asks `config.py`, which uses `platformdirs`.
- Every OS-specific branch lives in one small module per topic (`core/paths.py`, `agents/pty_shell.py`, `safety/sandbox.py`, `core/notify.py`, `browser/finder.py`). Tests run on all three OSes in CI.

---

## 4. Components

Each component: **job**, **input**, **output**.

### 4.1 API layer (`api/`)
- **Job:** Gives REST endpoints and one WebSocket.
- **Input:** HTTP requests from the UI / CLI.
- **Output:** JSON responses. Live events on WebSocket.
- **Notes:**
  - Binds only to `127.0.0.1`.
  - Every request needs a token (file `token` in the config folder, for example `~/.config/saarthi/token` on Linux; made on first start).
  - OpenAPI schema is exported. The UI's TypeScript client is generated from it.

### 4.2 Task Engine (`core/tasks.py`)
- **Job:** Create / update tasks, move stages, enforce stage rules (FSD F2.5).
- **Input:** User actions, run results, check results.
- **Output:** Task updates + `task.*` events.
- **Notes:** The stage machine is in one file with a clear table of allowed moves (see section 7).
- **Status:** The engine also gives each task a simple UI status (`needs_you` / `working` / `todo` / `done`, FSD F2.9). It comes from the stage map `STAGE_STATUS` (next to `ALLOWED_MOVES`), plus one rule: a pending ticket action, a sync conflict, an expired saved login or a blocked browser host (M11) makes the status `needs_you`. The status is returned with every task. It does not change any stage rule.

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
- **Limits:** Max parallel runs (default 4, across all projects). Extra runs wait in a queue.
- **Output:** `run.*` and `agent.*` events.

### 4.4 Agent Adapters (`agents/`)
- **Job:** Hide the differences between Claude, Codex, and others.
- **Interface (Python):**

```python
class AgentAdapter(Protocol):
    name: str                                   # "claude" | "codex" | "gemini"

    async def check_ready(self) -> ReadyStatus: ...        # installed? logged in?
    async def start(self, req: RunRequest) -> RunHandle: ... # start the process
    def events(self, h: RunHandle) -> AsyncIterator[AgentEvent]: ...  # normalized events
    async def send(self, h: RunHandle, text: str) -> None: ...         # follow-up / answer
    async def stop(self, h: RunHandle) -> None: ...
    async def resume(self, req: RunRequest, session_id: str) -> RunHandle: ...
```

- **`RunRequest`** (in `agents/base.py`) carries everything an adapter needs, agent-neutral: `cwd`, `prompt`, `mode`, `env` (ports, M7), `output_schema` (M4), `extra_allowed_tools` (M2), and **`mcp_servers`** (M11): a list of `McpServerSpec {name, url}` (an HTTP MCP endpoint), or `{name, command, args}` for the stdio fallback. Each adapter turns it into its own flags in `mcp_args()` (for example Claude `--mcp-config`, Codex `-c mcp_servers.<name>...`, Gemini settings). The exact flags are checked in the M11 spike. Browser code never lives in `agents/`; adapters only pass the config through.
- **ClaudeAdapter**
  - Command: `claude -p --output-format stream-json --input-format stream-json --verbose [--resume ID] [--permission-mode ...] [--allowedTools ...]`
  - Working dir = task worktree.
  - Prompt and follow-ups go in through stdin as stream-json messages.
  - Maps Claude JSON lines -> `AgentEvent`.
- **CodexAdapter**
  - Command: `codex exec --json -C <worktree> --sandbox <mode> "<prompt>"`, follow-ups through `codex exec resume <id>`.
  - Maps Codex JSONL -> `AgentEvent`.
  - For Second Opinion: use `--output-schema review_findings.schema.json` to get findings in a fixed shape.
- **GeminiAdapter** (M7)
  - Command: headless `gemini -p "<prompt>"` with JSON output, working dir = task worktree.
  - The exact flags (output format, resume, approval mode) are checked in the M7 spike and recorded as fixtures. Do not trust this line over the spike.
  - Maps Gemini JSON -> `AgentEvent`. Unknown lines become raw events (section 6.3).
  - If the CLI cannot take follow-ups mid-run, "Needs you" works like Codex: the run ends with a question, and we resume with the answer.
- **PtyShellAdapter**
  - Runs any command (plain `claude`, `codex` or `gemini` interactive) in a pseudo-terminal: stdlib `pty` on Linux / macOS, ConPTY (`pywinpty`) on Windows.
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
  - `remove_worktree(task)` -> `git worktree remove`. Shipped and archived tasks are removed after `WORKTREE_CLEANUP_DAYS` (7) by a sweep at daemon start and once a day. The branch is kept.
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
  3. Ask the agent (cheap, read-only call) to fill "Brief coverage" (UI: "What done looks like"): each acceptance criterion -> met / not sure / not met. The user only answers "not sure" ones: "That's fine" sets it to met (`by_user = true`), "Ask Claude to add it" starts a `fix` run.
  4. Build the `ProofCard` and save it.
  5. Compute the trust score and the verdict (4.6.1).
- **Check kinds (M11):** `cmd` (default), `e2e` (the project's own E2E command) and `live` (the Live test, made by Saarthi, never written in `[[checks]]`). With `[browser] enabled = true` the steps become:
  1. Run the `cmd` checks.
  2. If an `e2e` check exists, or the Live test will run: start the dev server on the task's port and wait until `base_url` answers (`DEV_SERVER_READY_TIMEOUT_S`). Events `devserver.started` / `devserver.failed`.
  3. Run the `e2e` checks. Copy their artifacts (`artifacts` globs) into the evidence folder.
  4. If every required check passed and `live_test = "auto"`: run the **Live test** as a `live_test` side run (4.15). Its result is one `check_results` row, kind `live`, name "Live test", `required = live_test_required`.
  5. Stop the dev server. Then coverage (step 3 above, now with the Live test steps as extra input), the Proof Card and the verdict.
- A failed optional Live test does not change the gate. A failed required one sends the task to `Failed`, like any required check.
- **Output:** `check.*` events + a `ProofCard`.

#### 4.6.1 Trust score and verdict (`checks/verdict.py`)
- **Trust score** (0-100, FSD F7.7): required checks 50 points by the share that pass; criteria 35 points by the share met; second opinion 15 / 8 / 0.
- **Verdict**, computed right after the score, from data we already have (`check_results`, coverage, `review_findings`, the score):
  1. A required check failed, or a high finding is open -> `has_problems`.
  2. Else, a criterion is `not_met`, a medium finding is open, or score < `TRUST_GOOD_MIN` -> `take_a_look`.
  3. Else -> `looks_good`.
- `not_sure` criteria do not change the verdict.
- `TRUST_GOOD_MIN = 70` and the point weights live in `config.py`.
- Score and verdict are recomputed when checks, coverage or findings change, and sent in `proof.ready`.
- The verdict never blocks a move. `ALLOWED_MOVES` still decides.
- Pure function, unit tested for every row of the verdict table.

### 4.7 Review Builder (`review/`)
- **Job:** Make the Change Story.
- **Steps:**
  1. Get the diff (per file, per hunk).
  2. Run rule-based risk flags (no AI): migrations, deleted files, auth paths, dependency files, CI/config, big files. Patterns live in `config.py` and can be changed per project.
  3. Ask the agent to group hunks by purpose and write 1-2 lines per group. In the same call it writes a one-line "why" per changed file (FSD F17.6). Output in a fixed JSON shape (JSON Schema).
  4. If the agent output is invalid -> fall back to "group by folder", with no "why" notes.
- **Output:** `ChangeStory` object (groups, risk flags, file notes). Files (4.14) reads the file notes.

### 4.8 Memory + Context Pack (`memory/`)
- **Job:** Read `core_docs/`, choose what is relevant, build the Context Pack, draft memory updates.
- **Context Pack build (v1, simple):**
  1. Always include: brief, CLAUDE.md / AGENTS.md (the agent reads them itself; we only list them), the playbook.
  2. Include research items where "send to agent" = yes.
  3. Include memory files that match brief keywords (ripgrep score), max 5 files, max ~20k characters total.
  4. Write the pack to `<worktree>/.saarthi/context/TASK.md` (git-ignored).
  5. The prompt tells the agent: "Read `.saarthi/context/TASK.md` first."
- **Why a file and not a long prompt:** the agent can re-read it any time, and we can show the exact same file to the user.
- **Memory update (on ship):** agent drafts text for `memory/`, `learnings/`, `timeline/`. Saved as "pending" and shown as the Lessons learned card on Done. User approves -> written to the files (see 8.5).

### 4.9 Safety Guard (`safety/`)
- **Job:** Turn a permission profile into agent flags, and check commands.
- **Profiles -> flags:**

| Profile | Claude | Codex | Gemini (M7) |
|---|---|---|---|
| Read-only | `--permission-mode plan` + only read tools allowed | `--sandbox read-only` | read-only approval mode (flags from the M7 spike) |
| Safe build | allowed tools list + blocked commands list | `--sandbox workspace-write` | default approval + blocked commands list |
| Full | `--dangerously-skip-permissions` (only inside the OS sandbox, M8) | `--sandbox workspace-write` + no approvals | auto approve (only inside the OS sandbox, M8) |

- `Full` needs an OS sandbox. On Windows v1 there is none, so the API refuses `full` with `400 sandbox_unavailable` and the UI does not offer it.

- **Secret masking:** Before an event is saved or sent, values from the project `.env` files and patterns (keys, tokens) are replaced with `****`.
- **Sandbox (M8, `safety/sandbox.py`):** wrap the agent command so only the worktree is writable and secret folders are hidden. Linux: `bwrap`. macOS: a `sandbox-exec` profile. Windows v1: no wrapper.
- **Live tests and the sandbox (M11):** the `live_test` side run is sandboxed like any run. It needs the network on (M8 already keeps it on) to reach the daemon's browser endpoint on `127.0.0.1`. The browser, the browser kit and the saved logins run with the daemon, **outside** the agent sandbox, so the sandbox never binds `browser-kit/` or `logins/`. If the spike forces the stdio fallback, only the small `saarthi mcp-bridge` runs inside the sandbox (read-only binary path + loopback network). Every Live test uses a fresh temp browser profile, deleted after the run.

### 4.10 Event Bus and Event Store (`core/events.py`)
- **Job:** One place for all events.
- **Flow:** component -> `bus.publish(event)` -> (1) save to SQLite, (2) append to the run's JSONL file, (3) push to WebSocket subscribers.
- **Why two stores:** SQLite for fast queries. JSONL as the full raw log (easy to debug, easy to replay).

### 4.11 Notifier (`core/notify.py`)
- **Job:** Desktop notifications.
- Listens for `agent.needs_input`, `run.finished`, `check.finished`, for every project.
- Sends to the UI. Tauri shows a native alert with its notification plugin on every OS. If no UI is open, Linux uses `notify-send`; see open question 7 for macOS and Windows.

### 4.12 Docs Finder (`docs/`)
- **Job:** List and read the markdown docs of a task (FSD F22). Docs are files. There is no docs table.
- **Input:** Task id. A doc id (`plan:<run_id>`, `wt:<path>`, `pin:<path>`, `research:<item_id>`).
- **Output:** A doc list (`doc_id`, kind, title, path, source, size, change, pinned) and the markdown of one doc.
- **Files:** `finder.py` lists docs, `reader.py` reads safely, `plans.py` writes plan docs. This is Saarthi's own module, not the repo's docs folder.
- **Notes:**
  - Four kinds: `plan`, `changed`, `pinned`, `research` (M6).
  - A `plan` run that ends `done` writes its final answer to `<data>/tasks/<task_id>/docs/plan-<run_id>.md` (`<data>` = the Saarthi data folder from `platformdirs`, `~/.local/share/saarthi` on Linux; not the worktree). Event `doc.saved`.
  - Changed files: `git diff --name-status <base>...HEAD -- '*.md'` and `git status --porcelain -- '*.md'` in the worktree (list args, no shell).
  - Pinned list: `[docs] pinned` in `project.toml`. Default is `DEFAULT_PINNED_DOCS` in `config.py`. Missing files are skipped. If the worktree does not exist yet, read from the main checkout.
  - A file that is pinned and changed shows once, as `changed`.
  - Files under `.saarthi/context/` are never listed.
  - Limits: `DOCS_MAX_LIST` (200 docs), `DOCS_MAX_BYTES` (1 MB). A bigger doc returns `too_big`.
  - Paths must stay inside the worktree or the data folder. `..` and symlinks out are refused.
  - Order: plans (newest first), changed (by path), pinned (config order), research.
  - M6: the latest plan doc goes into the Context Pack of `build` and `fix` runs, max `CONTEXT_PLAN_MAX_CHARS` (15,000).

### 4.13 Ticket Provider (`tickets/`)
- **Job:** Read tickets from Jira Cloud and write back status, comment, and link (FSD F23). Behind one interface, like `AgentAdapter`.
- **Input:** Project ticket settings, a JQL view, a ticket key, or a write-back action.
- **Output:** Cached `tickets` and `ticket_views` rows, brief drafts, `ticket_actions`, `ticket.*` events.
- **Files:** `base.py` (protocol + models), `jira_cloud.py` (httpx), `fake.py`, `adf.py`, `brief.py`, `sync.py`, `actions.py`.

```python
class TicketProvider(Protocol):
    name: str                                                      # "jira"
    async def check_ready(self) -> ReadyStatus: ...                # site reachable, token valid, who am I
    async def search(self, jql: str, page_token: str | None) -> TicketPage: ...
    async def get(self, key: str) -> Ticket: ...
    async def transitions(self, key: str) -> list[Transition]: ...
    async def transition(self, key: str, transition_id: str) -> None: ...
    async def comment(self, key: str, markdown: str) -> None: ...
    async def add_link(self, key: str, url: str, title: str) -> None: ...
```

- **JiraCloudProvider** (only provider in v1): Jira Cloud, REST API v3.

| Need | Call |
|---|---|
| Check login | `GET /rest/api/3/myself` |
| List / search | `POST /rest/api/3/search/jql` with `{jql, fields, maxResults: 50, nextPageToken}`. Paging by `nextPageToken` only. Stop at `TICKETS_MAX_SYNC` (200). |
| One ticket | `GET /rest/api/3/issue/{key}?fields=summary,status,issuetype,priority,assignee,labels,description,comment,updated` |
| Transitions | `GET /rest/api/3/issue/{key}/transitions`, then `POST` the same path with `{transition: {id}}`. Match `to.name` with the wanted status, ignoring case. |
| Comment | `POST /rest/api/3/issue/{key}/comment` with an ADF body |
| Remote link | `POST /rest/api/3/issue/{key}/remotelink` with `{object: {url, title}}` |

  - The old `/rest/api/3/search` is removed. Use POST for search (GET with `nextPageToken=null` gives 400).
  - Auth: HTTP Basic `email:token`. HTTPS only. Requests go only to the configured site, or to `api.atlassian.com` for scoped tokens.
  - Scoped tokens need `read:jira-work`, `write:jira-work` (for write back) and `read:jira-user` (`/myself`). They only work through `https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/...`. Login gets `cloudId` from `https://<site>/_edge/tenant_info` when the site URL gives 401.
  - 429: wait `Retry-After`, max 3 tries.
- **ADF rules** (`adf.py`, own small code, no new library):
  - `adf_to_markdown(doc)` handles: paragraph, heading, text marks (strong, em, code, strike, link), bulletList, orderedList, listItem, codeBlock, blockquote, rule, hardBreak, mention, emoji, inlineCard, table (simple GFM), panel (blockquote), media (`[attachment: name]`).
  - An unknown node is never dropped. Its child text is kept. With no children it becomes `[unsupported: <type>]`.
  - `markdown_to_adf(text)` is only for comments Saarthi writes: paragraphs and links.
  - If `adf.py` grows past about 300 lines, switch to `atlas-doc-parser`.
- **Notes:**
  - Cache refresh: by hand, or when the panel opens and the cache is older than `TICKETS_STALE_SECONDS` (300). No background polling.
  - Write-back actions are stored in `ticket_actions` and need my OK unless `auto_send = true`.
  - One pending transition per task: a newer one replaces the older one (`skipped`).
  - Transitions only move forward in `on_stage` order (running < review < shipped). A fix run (Review -> Running) proposes nothing.
  - The cache remembers what each view returned (`ticket_views`), so views work offline.

### 4.14 Files (`files/`)
- **Job:** Back the Files screen (FSD F17): tree, file content, diff vs main, "why" notes, "looked at" marks, tiny edits.
- **Input:** A task id (reads the task worktree) or a project id (reads the main checkout of the repo). A path.
- **Output:** Tree entries (`path`, kind, `change`: added / modified / deleted / none), file text, a unified diff, file notes, marks.
- **Notes:**
  - Diff vs main for a task: `git diff <base>...HEAD -- <path>` plus uncommitted changes in the worktree (list args, no shell). For a project: the main checkout's own uncommitted changes against its `HEAD`.
  - "Why" notes come from the latest `ChangeStory.file_notes` (4.7). No extra agent call.
  - "Looked at" marks are stored per task in `file_marks` with the file's blob hash. If the file changes later, the mark no longer counts. "Next change" is the next changed file without a valid mark, in tree order.
  - Tiny edits (F17.3) write one file in a **task worktree** only, with `base_sha` to catch a stale file (409). The main checkout is read-only in v1. Event `file.edited`.
  - Search uses `rg` with a list of args.
  - Same path rules as Docs: stay inside the worktree or the repo, refuse `..` and symlinks out. Limits `FILES_MAX_BYTES` and `FILES_MAX_TREE` in `config.py`.

### 4.15 Browser (`browser/`, M11)
- **Job:** Everything for browser testing (FSD F24, F7.5): find a browser, download the browser kit, start the dev server, run the browser for the Live test, save and load test logins, keep the evidence.
- **Input:** `[browser]` from `project.toml`, a task (worktree + port), a saved login name.
- **Output:** A browser session the agent can drive, `check_results` rows of kind `live`, evidence files, `browser.*` / `login.*` / `devserver.*` events.
- **Files:**

| File | What |
|---|---|
| `finder.py` | Find Chromium: system Chrome -> Edge -> Chromium -> kit (`BROWSER_SEARCH_ORDER`, known paths per OS in `BROWSER_PATHS_BY_OS`). Returns `{kind, path, version, headed_ok}`. |
| `kit.py` | Download, check and remove the browser kit in `<data>/browser-kit/<BROWSER_KIT_VERSION>/`. Parts: the MCP server (pinned Playwright MCP, plus a Node runtime only if no usable `node` is found), the Chromium headless shell, and the full Chromium only when a window is needed and no system browser exists. Exact packaging from the M11 spike. |
| `devserver.py` | Start `dev_server` in the worktree (list args, no shell, M4 rule), env `SAARTHI_PORT` / `PORT` (M7) + `SAARTHI_BASE_URL`; poll `base_url` until it answers or `DEV_SERVER_READY_TIMEOUT_S`; stop the process group. |
| `host.py` | The **browser host**: starts Playwright MCP (stdio child of the daemon) with the found browser, a temp profile, `storageState` of the chosen login, video and trace on, allowed origins. One host per Live test. |
| `mcp_endpoint.py` | The MCP endpoint the agent talks to (`/browser-mcp/{session}`, HTTP). It forwards each tool call to the host, refuses hosts not in `allowed_hosts` (`browser.host_blocked`), stops after `LIVE_TEST_MAX_STEPS`, takes a screenshot after each action, and writes `browser.step` / `browser.screenshot`. Typed text is never saved, only "Typed 12 characters into Email". |
| `logins.py` | "Save a login": start a headed browser with a temp profile on `base_url`; when the user clicks "I'm logged in", read cookies and local storage over CDP and write a Playwright `storageState` JSON to `<data>/logins/<project_id>/<name>.json` (file `600`, folder `700`). Expiry check before a run (all session cookies of the host expired) and after it (the agent reports `blocked_by_login`). |
| `evidence.py` | Folder `<data>/evidence/<task_id>/<proof_card_id>/`: screenshots, `video.webm`, `trace.zip`, e2e artifacts. Cap `EVIDENCE_MAX_MB` (drop the video first, then the oldest screenshots). Removed with the worktree (M5 cleanup). |
| `cdp.py` | A small CDP client over WebSocket (used by `logins.py` and the M12 screencast). |
| `live_test.py` | Builds the `live_test` side run: prompt (UI items of "What done looks like", base URL, "you are logged in as `test-admin`"), `RunRequest.mcp_servers`, `output_schema` = `live_test_result.schema.json`. Maps the result to a `check_results` row. |

- **Why the browser runs with the daemon, not inside the agent:** the saved login must never be readable by the agent (B6). If the agent started Playwright MCP itself, the `storageState` path would sit in the agent's MCP config and the file would have to be visible inside its sandbox. With the daemon-side host, the agent only sees `http://127.0.0.1:7878/api/v1/browser-mcp/<session>`. It also gives one agent-neutral place for the host guard, the step limit, screenshots and events.
- **Session token:** each Live test gets a random session id in the endpoint path. It works only while that run is active, and only for MCP calls.
- **Live test result** (`live_test_result.schema.json`): `{steps: [{criterion, action, expect, result: pass|fail|skip, note}], status: pass|fail|skip, blocked_by_login: bool, summary}`. `skip` when the goal has no UI items. The result is a normal check result: status, seconds, `output_tail` = summary, `artifacts` = evidence paths.
- **Agent:** the agent of the last build or fix run (same rule as coverage, M4). Profile `read_only` for files; the MCP tools are allowed (flags per adapter, M11 spike).
- **Config (`config.py`):** `BROWSER_KIT_VERSION`, `BROWSER_KIT_DIR`, `BROWSER_SEARCH_ORDER`, `BROWSER_PATHS_BY_OS`, `PLAYWRIGHT_MCP_PACKAGE`, `DEV_SERVER_READY_TIMEOUT_S`, `LIVE_TEST_TIMEOUT_S`, `LIVE_TEST_MAX_STEPS`, `LIVE_TEST_VIDEO_SIZE`, `EVIDENCE_MAX_MB`, `LOGINS_DIR`, `BROWSER_DEFAULT_ALLOWED_HOSTS` (`["127.0.0.1", "localhost"]`), `E2E_DEFAULT_ARTIFACT_GLOBS`. Values in `milestones/M11_browser_testing/TDD_M11_browser_testing.md`.

### 4.16 Live preview (`browser/screencast.py` + desktop, M12)
- **Job:** Show the agent's browser live in the task page, open the task's app in a preview window, and (only where the spike passed) let the agent drive that window (FSD F25).
- **Live browser (F25.1, all OS):** the daemon attaches to the browser host over CDP and calls `Page.startScreencast` (JPEG, `SCREENCAST_QUALITY`, `SCREENCAST_MAX_WIDTH`). Each `Page.screencastFrame` is acked (`Page.screencastFrameAck`) and sent to the UI on the WebSocket topic `screencast:<task_id>`, capped at `SCREENCAST_MAX_FPS`. Frames are not saved (like `terminal.output`). It runs only while a client is subscribed (NF5).
- **Preview window (F25.2):** a separate Tauri `WebviewWindow` with label `preview-<task_id>`, loading the dev server URL from `GET /tasks/{id}/preview`. No capability file matches `preview-*`, no `remote.urls` IPC entry, no init scripts. So it has **no IPC** and cannot call any Saarthi command: it loads untrusted app code. An `on_navigation` guard allows only `base_url` and `allowed_hosts`; other links open in the system browser.
- **Agent drives the preview window (F25.3, spike-gated):** Linux via WebKitWebDriver, Windows via WebView2 remote debugging (CDP, attached by Playwright MCP). macOS has no WKWebView driver, so it is never offered there. The driver must reach only the preview window, never the main window (Windows: a separate WebView2 environment and data folder for the preview). The per-OS result of the spike lives in `PREVIEW_DRIVE_BY_OS` in `config.py`; `GET /browser` returns what this machine supports. Where it is off, the agent uses its own Chromium (F25.1).
- The preview window uses the system WebView, not Chromium. A Live test result always comes from Chromium.

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
| default_agent | text | `claude` / `codex` / `gemini` |
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
| ticket_key | text | optional (M10). Example `ACME-142`. Partial unique index `(project_id, ticket_key)` where not null |
| branch | text | set when the worktree is made |
| worktree_path | text | |
| permission_profile | text | `read_only` / `safe_build` / `full` |
| browser_hosts_ok | json | optional (M11). Extra hosts the user allowed for this task's Live test (F24.7) |
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
| agent | text | `claude` / `codex` / `gemini` / `pty` |
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
- `check_results`: id, task_id, run_id, name, command, required, status (`pass`/`fail`/`skip`/`error`), exit_code, seconds, output_tail, output_path. M11 adds: kind (`cmd` / `e2e` / `live`, default `cmd`), artifacts (json: evidence paths relative to the evidence folder, `{session_id?, screenshots: [...], video?, trace?, files: [...]}`).
- `proof_cards`: id, task_id, run_id, all_required_passed (bool), files_changed, lines_added, lines_removed, tests_added, coverage (json: list of {criterion, status, note, by_user}), trust_score (int), verdict (`looks_good` / `take_a_look` / `has_problems`), override_reason.

### 5.8 Review tables
- `change_stories`: id, task_id, run_id, groups (json), risk_flags (json), file_notes (json: {path: why}), created_at.
- `file_marks`: task_id, path, blob_sha, looked_at. Key `(task_id, path)`.
- `review_comments`: id, task_id, file, line, group_id, body, status (`open`/`sent`/`resolved`), created_at.
- `review_findings`: id, task_id, reviewer_agent, file, line, severity, reason, status (`open`/`sent`/`ignored`).

### 5.9 Others
- `playbooks`: id, scope (`global`/`project`), project_id, name, description, prompt, default_agent, default_mode.
- `memory_updates`: id, task_id, file_path, proposed_text, status (`pending`/`approved`/`rejected`).
- `settings`: key, value (json).

### 5.10 `tickets` (M10, cache)
| Field | Type | Note |
|---|---|---|
| id | text | ULID |
| project_id | text | FK |
| provider | text | `jira` |
| key | text | `ACME-151`. Unique with `project_id` |
| summary | text | |
| status | text | Jira status name |
| status_category | text | `todo` / `in_progress` / `done` |
| issue_type | text | |
| priority | text | |
| assignee | text | |
| url | text | |
| description_md | text | ADF turned into markdown |
| comments_md | text | |
| labels | json | list of strings |
| jira_updated_at | datetime | |
| fetched_at | datetime | |

### 5.11 `ticket_views` (M10, cache)
| Field | Type | Note |
|---|---|---|
| project_id | text | FK. Key with `view` |
| view | text | `mine`, `sprint`, a saved view name, or `adhoc` |
| jql | text | the full JQL that was run |
| keys | json | ticket keys in the order Jira gave them |
| truncated | bool | stopped at `TICKETS_MAX_SYNC` |
| synced_at | datetime | "last synced" for this view |

### 5.12 `ticket_actions` (M10)
| Field | Type | Note |
|---|---|---|
| id | text | ULID |
| task_id | text | FK |
| ticket_key | text | |
| kind | text | `transition` / `comment` / `link` |
| payload | json | |
| trigger | text | for example `stage:review`, `ship.pr_created` |
| status | text | `pending` / `sent` / `skipped` / `failed` |
| error | text | |
| created_at | datetime | |
| decided_at | datetime | |

### 5.13 `saved_logins` (M11)
| Field | Type | Note |
|---|---|---|
| id | text | ULID |
| project_id | text | FK. Unique with `name` |
| name | text | `test-admin` |
| host | text | the host it was saved on, e.g. `127.0.0.1` |
| path | text | the `storageState` file in the data folder (mode `600`). Never returned by the API |
| saved_at | datetime | |
| last_ok_at | datetime | last Live test that worked with it |
| expired_at | datetime | set when it stops working; cleared after "Log in again" |

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
| Check | `check.started`, `check.finished`, `proof.ready` (has `trust_score` and `verdict`) |
| Review | `review.story_ready`, `review.finding`, `review.comment`, `review.approved`, `review.rejected` |
| Ship | `ship.committed`, `ship.pushed`, `ship.pr_created` |
| Doc | `doc.saved` |
| Files | `file.edited`, `file.looked_at` |
| Ticket | `ticket.synced`, `ticket.imported`, `ticket.linked`, `ticket.action_proposed`, `ticket.action_sent`, `ticket.action_failed`, `ticket.action_skipped` |
| Memory | `memory.update_proposed`, `memory.update_applied` |
| Workspace | `workspace.created`, `workspace.checkpoint`, `workspace.rewound`, `workspace.removed` |
| Browser (M11) | `browser.started`, `browser.step`, `browser.screenshot`, `browser.finished`, `browser.host_blocked`, `browser.host_allowed`, `browser.kit_installed`, `browser.kit_removed` |
| Login (M11) | `login.saved`, `login.expired`, `login.removed` (name and host only, never the session) |
| Dev server (M11) | `devserver.started`, `devserver.failed`, `devserver.stopped` |
| Preview (M12) | `preview.opened`, `preview.closed`, `preview.agent_attached` (screencast frames are a stream, not events) |

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
- The UI shows 4 statuses (FSD F2.9), from `STAGE_STATUS`:

| Status | Stages |
|---|---|
| `needs_you` | `Needs You`, `Failed`, `Review` (+ a pending ticket action, sync conflict, expired saved login or blocked browser host on any stage) |
| `working` | `Running`, `Verifying` |
| `todo` | `Inbox`, `Research`, `Ready` |
| `done` | `Shipped` |
| hidden (filter) | `Parked`, `Archived` |

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
5. Any required fails -> Task -> `Failed`. UI shows "Let Claude fix it" (auto-fix round counter).
6. Trust score + verdict are computed (4.6.1) and sent in `proof.ready`.

### 8.4 Second Opinion
1. Pick another agent than the builder, from `REVIEWER_FOR` in `config.py` (claude -> codex, codex -> claude, gemini -> codex).
2. Start a run with mode `review`, profile `read_only`, Context Pack = brief + diff.
3. Codex: `--output-schema review_findings.schema.json`. Claude: prompt asks for the same JSON shape.
4. Parse findings -> `review_findings` table -> shown in What changed. The verdict is recomputed.

### 8.5 Ship
1. Agent drafts the commit message and the PR text (read-only call) when the task reaches `Review`.
2. "Approve and create pull request" (`POST /tasks/{id}/ship`) uses them as they are. No dialog. "Edit pull request text" lets the user change them first.
3. `git add -A && git commit` in the worktree.
4. `git push -u origin <branch>` (never the default branch - checked in code).
5. `gh pr create --title ... --body-file <generated.md>`.
6. Task -> `Shipped`. The worktree is removed later (`WORKTREE_CLEANUP_DAYS`), not now.
7. Memory updates are drafted and shown as the Lessons learned card on Done. Each approved update is committed to `core_docs/` **on the task branch** and pushed, so the open PR gets it.

### 8.6 Daemon restart
1. On start, find runs with status `running` / `needs_input`.
2. Mark them `interrupted`. Task -> `Failed` with note "interrupted".
3. UI shows a "Resume" button -> uses `agent_session_id` with the adapter's `resume()`.

### 8.7 Plan saved as doc (M2)
1. A `plan` run ends with status `done`.
2. Docs Finder (`plans.py`) takes the agent's final message and adds a header comment (task, run, agent, mode, time).
3. It writes `<data>/tasks/<task_id>/docs/plan-<run_id>.md` (data folder, never the worktree).
4. Event `doc.saved {doc_id, kind: "plan", path, run_id, chars}`.
5. A failed or stopped plan run saves nothing.
6. M3 UI: the Docs list (task page -> More -> Docs) refreshes on `doc.saved`.

### 8.8 Start task from ticket (M10)
1. UI: `POST /projects/{id}/tickets/ACME-151/start`.
2. A ticket already linked to a task -> `409 ticket_linked {task_id}`. The UI opens that task.
3. Ticket Provider: fetch the ticket fresh (`get`). ADF description -> markdown.
4. Task Engine: make task `T-0033` with title = summary, `ticket_key`, `ticket_url`, label = issue type. Event `ticket.imported`.
5. `brief.py` makes brief version 1 (not approved). Goal = summary + description up to the first acceptance heading. Acceptance = bullets under a heading like `acceptance criteria`, `AC`, `definition of done` (case ignored). Notes = the rest + `Ticket: <url>`.
6. Newest 20 ticket comments become a research item, kind `snippet`, title "Jira comments", `send_to_agent = false`.
7. Branch is `saarthi/T-0033-ACME-151-<slug>` (key in capitals). PR title will be `ACME-151: <title>`.
8. Ticket text is marked `<!-- from Jira, not trusted -->` in the Context Pack.

### 8.9 Ticket write back (M10)
1. A stage move has a mapping in `[tickets.on_stage]` -> one `transition` action, only **forward**:
   - Stage order is running < review < shipped.
   - The target stage must come later in that order than the stage that maps to the ticket's current Jira status.
   - If the current Jira status maps to no stage, the action is proposed.
   - `ship.pr_created` -> one `comment` action + one `link` action.
2. Actions are saved as `pending`. Event `ticket.action_proposed`.
3. The task page shows a card: "Move ACME-151 to In Review? [Send] [Skip]". The task shows as Needs you on Home (section 7, `STAGE_STATUS` rule).
4. Send -> `POST /ticket-actions/{id}/send`. For a transition: `transitions(key)`, match `to.name` ignoring case, then `transition()`.
5. Ok -> `sent` + `ticket.action_sent`. Error -> `failed` + `ticket.action_failed` with the reason (example: "No transition to In Review from To Do. Possible: In Progress, Done").
6. `auto_send = true` sends at once. The card only shows the result.
7. A newer pending transition replaces the older one (`skipped`, `ticket.action_skipped`).

---

## 9. API (v1)

> All under `http://127.0.0.1:7878/api/v1`. Header: `Authorization: Bearer <token>`.

### 9.1 REST
| Method | Path | What |
|---|---|---|
| GET | `/health` | Daemon + tools status + daemon version (the app checks it) |
| GET | `/tasks?project=&status=` | Tasks of one or all projects (Home, All projects, Needs-you count) |
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
| GET | `/tasks/{id}/files/tree?changed=` | Files: worktree tree with change marks (`changed=true` = only changed) (M3) |
| GET | `/tasks/{id}/files/content?path=` | Files: one file's text (M3) |
| GET | `/tasks/{id}/files/diff?path=` | Files: diff vs main for one file, or all if no path (M3) |
| PUT | `/tasks/{id}/files/content` | Tiny edit `{path, text, base_sha}`; 409 if the file changed (M3) |
| GET | `/tasks/{id}/files/notes` | "Why" note per changed file (M5) |
| GET / PUT / DELETE | `/tasks/{id}/files/marks` | "Looked at" marks `{path}` (M5) |
| GET | `/tasks/{id}/search?q=` | ripgrep search in the worktree |
| GET | `/projects/{id}/files/tree`, `/projects/{id}/files/content?path=`, `/projects/{id}/files/diff?path=` | Project files: the main checkout, read-only (M3) |
| GET | `/projects/{id}/search?q=` | ripgrep search |
| GET | `/tasks/{id}/docs` | List docs: `[{doc_id, kind, title, path, source, size, updated_at, change, pinned}]` (M2) |
| GET | `/tasks/{id}/docs/content?doc=<doc_id>` | One doc: `{doc_id, markdown, size, updated_at, too_big}` (M2) |
| GET | `/jira/sites` | Connected sites + who I am (M10) |
| POST | `/jira/sites` | `{site, email, token}` -> check with `/myself`, save (M10) |
| DELETE | `/jira/sites/{site}` | Forget a site, delete the token file (M10) |
| GET | `/projects/{id}/tickets?view=&q=&refresh=` | List from cache (refresh first if asked or stale) (M10) |
| POST | `/projects/{id}/tickets/sync` | `{view?, jql?}` -> refresh now (M10) |
| GET | `/projects/{id}/tickets/{key}` | One ticket (fresh) + linked task id (M10) |
| POST | `/projects/{id}/tickets/{key}/start` | Body `{dry_run?}`. Make a task -> `201 {task}` (`dry_run` -> `200` preview, nothing saved); 409 `ticket_linked {task_id}` (M10) |
| POST | `/tasks/{id}/ticket` | `{key}` links an existing task, `{key: null}` unlinks it (M10) |
| GET | `/tasks/{id}/ticket-actions` | List write-back actions (M10) |
| POST | `/ticket-actions/{id}/send` or `/skip` | Decide (M10) |
| GET | `/browser` | Browser found (kind, path, version), kit state, what this machine supports (M11; M12 adds `preview_drive`) |
| POST / DELETE | `/browser/kit` | Download / remove the browser kit `{parts?}` (M11) |
| GET | `/projects/{id}/browser` | `[browser]` settings from `project.toml` (read only), checks, the browser in use, saved logins (M11) |
| GET / POST | `/projects/{id}/logins` | List saved logins (no paths) / start "Save a login" `{name}` -> headed browser opens, `{session_id}` (M11) |
| POST | `/projects/{id}/logins/{name}/finish` | "I'm logged in": save the session (M11) |
| DELETE | `/projects/{id}/logins/{name}` | Forget a saved login, delete its file (M11) |
| GET / POST / DELETE | `/tasks/{id}/devserver` | Status / start / stop the task's dev server (M11) |
| POST | `/tasks/{id}/browser/hosts` | `{host}` allow one more host for this task (Needs-you OK) (M11) |
| GET | `/tasks/{id}/evidence` | See it work: per proof card, the steps (from `browser.step`), screenshot, video and trace paths (M11) |
| GET | `/tasks/{id}/evidence/file?path=` | One evidence file (path must stay in the evidence folder) (M11) |
| POST | `/tasks/{id}/evidence/trace` | `{proof_card_id}` open the trace in the local Playwright trace viewer (M11) |
| POST | `/browser-mcp/{session_id}` | MCP endpoint for the agent during a Live test; session id only, not the API token (M11) |
| GET / POST / DELETE | `/tasks/{id}/preview` | Preview URL / open (starts the dev server if needed) / close (M12) |
| POST | `/tasks/{id}/preview/agent` | Let the agent use the preview window; 409 `preview_drive_unsupported` where the spike failed (M12) |

### 9.2 WebSocket
- `ws://127.0.0.1:7878/api/v1/ws?token=...`
- Client sends: `{"subscribe": ["board:<project_id>", "task:T-0042", "run:<run_id>"]}`. `board:*` subscribes to every project; the desktop app uses it for Home and the Needs-you count.
- Server sends events in the shape from section 6.1.
- M12: topic `screencast:<task_id>` sends live frames `{frame: <base64 jpeg>, ts}` of the agent's browser. Frames are not saved. The daemon streams only while someone is subscribed.
- On reconnect, client sends `last_event_id`. Server sends missed events first.

---

## 10. Files on disk

Folders come from `platformdirs`. Below are the Linux paths. On macOS both folders are under `~/Library/Application Support/saarthi/`; on Windows under `%LOCALAPPDATA%\saarthi\`.

```
~/.config/saarthi/
├── config.toml            # global settings (incl. [jira."<site>"] email)
├── token                  # API token (chmod 600)
└── secrets/jira-<site>.token      # Jira API token (chmod 600)

~/.local/share/saarthi/
├── saarthi.db             # SQLite
├── logs/
│   ├── daemon.log
│   └── runs/<run_id>.jsonl        # full raw + normalized events
├── checks/<task_id>/<check>.log   # full check output
├── tasks/<task_id>/docs/plan-<run_id>.md  # plan docs (not in the worktree)
├── browser-kit/<version>/         # M11, downloaded on demand (never in the installer)
├── logins/<project_id>/<name>.json  # M11 saved logins, storageState (folder 700, file 600)
├── evidence/<task_id>/<proof_card_id>/  # M11 screenshots, video.webm, trace.zip, e2e artifacts
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

[browser]                         # M11, off by default
enabled = false
base_url = "http://127.0.0.1:{port}"      # {port} = the task's SAARTHI_PORT (M7)
dev_server = "npm run dev -- --port {port}"
allowed_hosts = ["127.0.0.1", "localhost"]
live_test = "auto"                # "auto" | "off"
live_test_required = false
login = "test-admin"              # optional: the saved login the Live test uses

[[checks]]                        # M11: the project's own E2E tests
name = "e2e"
cmd = "npx playwright test"
kind = "e2e"                      # dev server first, artifacts collected
required = false
timeout_sec = 900
artifacts = ["test-results/**", "playwright-report/**"]

[docs]
pinned = ["CLAUDE.md", "AGENTS.md", "core_docs/FUNCTIONAL_SPECIFICATIONS.md", "core_docs/TDD-tech-design-doc.md"]

[tickets]                         # M10, no secrets here
provider = "jira"
site = "acme.atlassian.net"
project_key = "ACME"
auto_send = false                 # true = write back without asking

[tickets.views]                   # extra saved JQL (Mine and Sprint are built in)
"Bugs" = "issuetype = Bug AND statusCategory != Done"

[tickets.on_stage]                # Saarthi stage -> Jira status name ("" = do nothing)
running = "In Progress"
review = "In Review"
shipped = ""
```

The Jira email is in the global `config.toml`, never in the repo:
```toml
[jira."acme.atlassian.net"]
email = "me@acme.com"
```

---

## 11. UI design (desktop)

The full UI spec is `design/2026-10-23-simple-ui-design.md` (screens, words, view ids). The prototype is `design/Saarthi Prototype.html`. This section only shows the frame.

### 11.1 Layout
```
┌──────────────────────────────────────────────────────────────────────┐
│ Logo · Project picker ▾ · Search or jump (Ctrl K) · ● 2 need you · ⚙ │
├──────────────────────────────────────────────────────────────────────┤
│        [ acme-billing | acme-web | saarthi | All projects ]          │
│                                                                      │
│        Needs you   (rows from every project)                         │
│        Working                                                       │
│        To do                                                         │
│        Done this week                                                │
└──────────────────────────────────────────────────────────────────────┘
```
- No sidebar, no dock. Content is centred with a max width.
- The project picker menu holds the project tools: Board view, Lessons and notes, Saved instructions, Jira tickets, Safety and cost, Project files.

### 11.2 Task page
```
┌──────────────────────────────────────────────────────────────────────┐
│ T-0012  Add password reset API  [ACME-142]  Working ●   More ▾       │
├──────────────────────────────────────────────────────────────────────┤
│ Goal card (goal, what done looks like)                     [Edit]    │
│ Activity                                  [Files] [Check and ship]   │
│   (live agent cards)                                                 │
├──────────────────────────────────────────────────────────────────────┤
│ Message Claude…                                    [Send] [Stop]     │
└──────────────────────────────────────────────────────────────────────┘
```

- Files and Check and ship open their own screens (FSD F17, F7, F10).
- More ▾ holds: Terminal, Docs, History, Details, What Claude reads.
- The ticket chip (M10) shows the Jira key. It only shows when the task has a ticket.
- Docs (M3): left list (Plans, Changed, Pinned), center markdown view, right outline.

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
| Jira 401 | "Token wrong or expired. Run `saarthi jira login`." Panel shows the fix command. |
| Jira 403 | "No permission on ACME". Nothing is changed. |
| Jira 404 | "Ticket not found or no access". |
| Jira 429 | Wait `Retry-After`, max 3 tries, then show an error. |
| Jira offline | Show the cache with "Offline · last synced 12m ago". Write-back actions stay `pending` or become `failed` with the reason. |
| Doc too big (> `DOCS_MAX_BYTES`) | Show "Too big to show here" + Open in editor. |
| Doc path outside the worktree / data folder | Refuse (`..`, symlink out). Return 400. |
| Files path outside the worktree / repo | Refuse. Return 400. |
| Tiny edit on a file that changed since it was loaded | 409. The UI reloads the file. |
| Background service not running | The app tries to start the sidecar. If it fails, the "background service" error screen shows the fix. |
| App and daemon versions differ | "Version mismatch" screen with the fix. |
| `full` profile asked on Windows | 400 `sandbox_unavailable`. |
| No browser found, kit not downloaded (M11) | Live test `skip` with "No browser. Download the browser kit in Settings -> Browser testing." If `live_test_required`, it is `error` with the same fix. |
| Dev server not ready in time (M11) | `devserver.failed` with the last lines of output. Live test and `e2e` checks are `error`. |
| Live test goes over `LIVE_TEST_TIMEOUT_S` or `LIVE_TEST_MAX_STEPS` (M11) | Stop the side run and the browser. Status `error`, note "timeout" or "too many steps". Evidence so far is kept. |
| Page outside the allowed hosts (M11) | The call is refused, `browser.host_blocked`, a Needs-you card "Allow it for this task?". |
| Saved login expired (M11) | `login.expired`, `saved_logins.expired_at` set, Needs-you card "Log in again". |
| Evidence over `EVIDENCE_MAX_MB` (M11) | Drop the video first, then the oldest screenshots. Note on the check. |
| Agent asks to drive the preview window on an OS where the spike failed (M12) | 409 `preview_drive_unsupported`. The agent keeps its own Chromium. |

---

## 13. Testing strategy

- **Unit tests** (pytest): stage machine, Context Pack builder, risk flag rules, event mapping for each adapter, secret masking.
- **Adapter tests:** feed recorded JSONL fixtures (`tests/fixtures/agents/claude_build_ok.jsonl`, `codex_needs_input.jsonl`, ...) into the mapper. Check the normalized events.
- **Integration tests:** real temp git repos (`tmp_path`) + `FakeAdapter`. Test full flows: create task -> run -> checks -> review -> ship (with a local bare repo as `origin`, no real GitHub).
- **API tests:** FastAPI `TestClient` + WebSocket tests.
- **UI tests:** Vitest for components. Playwright for 3 main flows against a daemon running with `FakeAdapter`.
- **Verdict tests:** every row of the verdict table (4.6.1), and "not sure" does not change it.
- **Files tests:** tree and diff on a temp repo, path safety, stale tiny edit (409), marks cleared when a file changes.
- **CI matrix:** unit, integration and API tests run on Ubuntu, macOS and Windows (GitHub Actions). PTY, paths and process-stop tests run on each OS.
- **Gemini fixtures (M7):** recorded `gemini` streams in `tests/fixtures/agents/`, same as Claude and Codex.
- **Smoke test with real agents:** a manual script `scripts/smoke_real_agents.sh` (not in CI) that runs a tiny task with real Claude and Codex.
- **Jira tests (M10):** `JiraCloudProvider` with `httpx.MockTransport` + recorded JSON in `tests/fixtures/jira/` (search pages, issue, transitions, 401, 429). Never the real network. `FakeTicketProvider` for the rest.
- **ADF golden tests:** each node type, and an unknown node is kept.
- **Browser tests (M11):** a `FakeBrowser` (a fake Playwright MCP server that replays recorded JSON-RPC lines from `tests/fixtures/browser/`) and recorded agent streams of a Live test. Never a real browser in unit tests. Cover: browser finder order per OS (pure function over fake paths), host guard, step limit, typed text never saved, `storageState` file mode `600` and never in events, logs, the Context Pack or API responses, expiry -> Needs you, evidence cap, dev server ready / timeout with a tiny fake server.
- **One optional integration test** starts a real headless Chromium in CI, behind the pytest marker `real_browser` (off by default).
- **Live preview tests (M12):** screencast frame ack and fps cap with a fake CDP socket; a desktop test proves the preview window cannot call any Tauri command.
- **Rule:** TDD for core logic - write the failing test first.

---

## 14. Performance targets

| What | Target |
|---|---|
| Event: agent stdout -> UI | < 300 ms |
| Board load (200 tasks) | < 500 ms |
| Daemon idle RAM | < 150 MB |
| Window idle RAM | < 150 MB |
| Installer size | < 40 MB per OS (the browser kit is downloaded on demand, not counted) |
| Parallel runs | 4 default, tested with 8 |
| App start (UI visible) | < 2 s |

---

## 15. Security

- API only on `127.0.0.1`, token required, token file `chmod 600`.
- Phone glance (later): separate read-mostly token, opt-in, LAN only.
- Never push to the default branch (checked in Workspace Manager, not only in UI).
- Secret masking before save and before send.
- Agents run in the worktree folder. OS sandbox in M8: `bwrap` (Linux), `sandbox-exec` (macOS). Windows v1 has none, so `full` is refused there.
- No telemetry.
- Jira token file `chmod 600`, kept outside the repo. The token never shows in logs or events. Jira requests go only to the configured site, or to `api.atlassian.com` for scoped tokens.
- Ticket text is untrusted. It is marked `<!-- from Jira, not trusted -->` in the Context Pack. The permission profile still applies.
- Docs paths must stay inside the worktree or the data folder. Files paths must stay inside the worktree or the repo.
- Browser testing (M11): saved logins are for **test accounts only**. The `storageState` file is mode `600` in the data folder. It is never logged, never in events, the Context Pack, the repo or agent text. The API never returns its path. Saarthi never stores a password.
- The agent's browser opens only `base_url` and `allowed_hosts`. Screenshots of login pages are kept as evidence but never sent to the agent as text. Typed text is not saved in events.
- The browser runs with the daemon, outside the agent's sandbox; each Live test uses a temp browser profile, deleted after the run. Chromium's own sandbox stays on (never `--no-sandbox`).
- The MCP endpoint takes a per-run session id, not the API token, and works only while that Live test runs.
- Live preview (M12): the preview window has no IPC and no capabilities. A driver (M12, spike-gated) may reach only the preview window, never the main window.

---

## 16. Open technical questions (to answer in M0 spike)

1. Exact event format of `claude -p --output-format stream-json` for questions and permission requests - how do we detect "needs input"?
2. Can `codex exec` ask questions mid-run, or does it only finish? If it only finishes, "Needs You" for Codex = the run ends with a question -> we resume with the answer.
3. Is `codex app-server` stable enough to use instead of `exec`?
4. Do the system WebViews run xterm.js and CodeMirror smoothly on all three OSes (WebKitGTK on Ubuntu 24.04, WKWebView on macOS 14, WebView2 on Windows 11)? WebKitGTK is the most likely weak one. If one fails, plan B: open the UI in a normal browser at `http://127.0.0.1:7878`.
5. Best way to keep agent processes alive when the daemon restarts, per OS (systemd `KillMode=process` on Linux, launchd on macOS, a Job Object setting on Windows) - or accept "interrupted + resume" everywhere.
6. Gemini CLI (M7 spike): exact headless flags, how a question shows in the stream, and whether resume works.
7. Notifications when no window is open on macOS and Windows: is the Tauri plugin enough, or does the app need to stay in the tray?
8. Sidecar size: PyInstaller or Nuitka gives the smaller one-file binary per OS? Measured in M9 against the size budget.
9. Browser kit packaging (M11 spike): how to ship Playwright MCP and Node when the user has no `node`; real sizes of the headless shell and the full Chromium per OS.
10. Playwright MCP with each agent (M11 spike): exact flags for Claude, Codex and Gemini to use an HTTP MCP server, and to allow its tools in the `read_only` profile. If one agent only takes stdio servers, use the `saarthi mcp-bridge` fallback.
11. Browser launch mode (M11 spike): Playwright MCP launches Chromium itself, or attaches to one the daemon starts (`--cdp-endpoint`)? M12's screencast needs a CDP handle, so attach is preferred if video and trace still work.
12. Video size (M11 spike): size and length of `video.webm` per Live test against `EVIDENCE_MAX_MB`.
13. Agent drives the preview window (M12 spike): go / no-go per OS. Linux WebKitWebDriver, Windows WebView2 CDP, macOS none.

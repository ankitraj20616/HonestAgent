# Tech Stack
## Saarthi - Agentic Development Environment

**Version:** 0.1
**Date:** 2026-10-11

---

## 1. Summary (one table)

| Layer | Choice | Why (short) |
|---|---|---|
| Backend daemon | **Python 3.12+** | I know it best. The work is mostly waiting on processes and I/O. Python asyncio is enough. |
| Web framework | **FastAPI + Uvicorn** | REST + WebSocket. Already used in my client projects. |
| Data models | **Pydantic v2** | Same models for API, events, and config. |
| Database | **SQLite** (WAL mode) | One file. No server. Perfect for a local app. |
| DB layer | **SQLAlchemy 2.0 + Alembic** | Known tools. Easy migrations. |
| CLI | **Typer + Rich** | Fast to build, nice output. |
| Process / PTY | **asyncio subprocess + stdlib `pty`** | Run `claude` / `codex` and stream output. |
| File watch | **watchfiles** | Live "files changed" in a worktree. |
| Logs | **structlog** | JSON logs, easy to search. |
| Package manager | **uv** | Fast, already installed. |
| Desktop shell | **Tauri 2** | Small, uses system WebView, low RAM. Not Electron, not VS Code. |
| UI | **React + TypeScript + Vite** | Big ecosystem, agents write it well. |
| UI styling | **Tailwind CSS + shadcn/ui** | Fast, clean UI. |
| UI state | **Zustand + TanStack Query** | Simple client state + server cache. |
| Terminal in UI | **xterm.js** | The standard web terminal. |
| Code / diff view | **CodeMirror 6 + @codemirror/merge** | Light. Read-only view and diff. (Not Monaco - we are not making VS Code.) |
| Markdown | **react-markdown** + **Milkdown** (editor, later) | View and edit briefs and core_docs. |
| Agents | **Claude Code CLI** + **Codex CLI** | Use my existing logins and subscriptions. |
| Git | **system `git`** (called as a subprocess) | Most reliable. Worktrees fully supported. |
| GitHub | **`gh` CLI** | PRs, CI status. Already logged in. |
| Search | **ripgrep (`rg`)** | Fast code search. |
| Sandbox (later) | **bubblewrap (`bwrap`)** | Linux sandbox. Already installed. |
| Notifications | **Tauri notification plugin** (fallback `notify-send`) | Native desktop alerts. |
| Tests (backend) | **pytest + pytest-asyncio** | Standard. |
| Tests (UI) | **Vitest + Playwright** | Unit + end-to-end. |
| Lint / format | **ruff**, **pyright**; **eslint**, **prettier** | Fast and strict. |
| Packaging | **AppImage + .deb** (Tauri bundler); daemon via `uv tool install` first, PyInstaller sidecar later | Easy install on Ubuntu. |
| Run as service | **systemd user service** | Daemon starts at login, keeps runs alive if the UI closes. |

---

## 2. The big question: Python, Go, or Rust for the backend?

### 2.1 What the backend really does
- Starts agent processes (`claude`, `codex`) and reads their output line by line.
- Runs git commands and check commands (`pytest`, `npm run build`).
- Saves events to SQLite.
- Sends events to the UI over WebSocket.
- Builds text (Context Pack, Change Story).

So the backend is mostly **waiting**: on processes, on disk, on the network.
It does **not** do heavy number crunching. The heavy "thinking" is done by Claude / Codex, not by us.

### 2.2 Score (1 = bad, 5 = great)

| Point | Python | Go | Rust |
|---|---|---|---|
| My speed to build | **5** | 3 | 2 |
| Agents (Claude/Codex) writing it well | 5 | 5 | 4 |
| Handling many processes at once | 4 (asyncio) | **5** (goroutines) | 5 (tokio) |
| Single binary, easy install | 2 | **5** | **5** |
| RAM / start time | 3 | 5 | 5 |
| Works with Tauri (Rust) | 3 (sidecar) | 3 (sidecar) | **5** (same process) |
| Libraries for this job (FastAPI, Pydantic, AI SDKs) | **5** | 4 | 3 |
| Learning curve for me | **5** | 4 | 2 |
| **Total** | **32** | **34** | **31** |

### 2.3 Decision

**v1: Python.** Go wins the raw score by 2 points, but only on install size and RAM. Those do not matter much for a tool on my own machine. Reasons:
1. I am a Python dev. With agents writing code, **I still must review it**. I review Python best.
2. The backend is I/O-bound. asyncio can handle 10+ agent processes easily.
3. Go wins on packaging and RAM. That matters for a product sold to many users. It matters less for my personal tool on my own machine.
4. We are not stuck. See 2.4.

**Plan B: Go** (not Rust) if we hit real limits. Signs to switch:
- Daemon RAM goes over 300 MB with normal use.
- PTY / process handling becomes buggy with asyncio.
- We want to share Saarthi with others as a single-file download.

Why Go over Rust for plan B: Go is simpler, compiles fast, and goroutines fit "many processes + streams" very well. Rust is only better if we want to merge the daemon into the Tauri app. That is not needed.

**Where Rust is used anyway:** the Tauri shell. But this is a **thin** layer (start the window, start the daemon, notifications). Almost no Rust code to write.

### 2.4 How we keep the switch easy
- The UI talks to the daemon **only** through HTTP + WebSocket with a written API (see TDD section 9). No Python-specific magic.
- The CLI also uses the same API.
- Event and data formats are plain JSON, defined in one place (`schemas/`), and exported as JSON Schema.
- So later we can rewrite the daemon in Go **without touching the UI**.

---

## 3. Agent integration details

### 3.1 Claude Code
- Binary: `claude` (checked: version 2.1.x installed).
- Headless mode: `claude -p --output-format stream-json --input-format stream-json --verbose`
  - Gives one JSON event per line: messages, tool calls, results, cost, session id.
  - `--input-format stream-json` lets us send follow-up messages while it runs.
- Resume: `claude -p --resume <session-id>`.
- Permissions: `--permission-mode`, `--allowedTools`, `--disallowedTools`.
- Option for later: **Claude Agent SDK for Python** (`claude-agent-sdk`) for deeper control (hooks, custom tools). It wraps the same CLI.
- Interactive fallback: run plain `claude` inside a PTY, show it in xterm.js.

### 3.2 Codex
- Binary: `codex` (checked: version 0.152.x installed).
- Headless mode: `codex exec --json -C <worktree> "<prompt>"`
  - Gives JSONL events on stdout.
- Resume: `codex exec resume <session-id>`.
- Sandbox: `--sandbox read-only | workspace-write`.
- Structured answers: `--output-schema <file>` - useful for review findings (Second Opinion) in a fixed JSON shape.
- Built-in reviewer: `codex review` - test it in M0 for Second Opinion.
- Later: `codex app-server` (experimental JSON-RPC) for deeper control.

### 3.3 Rule
- **Spike first (M0).** The flags above were checked with `--help` on 2026-10-11. CLI flags change often. M0 must record real sample event files for both agents in `tests/fixtures/agents/`.

---

## 4. Project repo layout (code)

```
saarthi/
├── core_docs/                 # these docs
├── CLAUDE.md                  # rules for Claude when building Saarthi
├── AGENTS.md                  # same rules for Codex (points to CLAUDE.md)
├── daemon/                    # Python backend (saarthid)
│   ├── pyproject.toml
│   ├── src/saarthi/
│   │   ├── api/               # FastAPI routes + WebSocket
│   │   ├── core/              # task engine, state machine, event bus
│   │   ├── agents/            # adapters: base.py, claude.py, codex.py, pty_shell.py
│   │   ├── workspace/         # git + worktrees
│   │   ├── checks/            # check runner + proof card
│   │   ├── review/            # change story builder
│   │   ├── memory/            # core_docs reader, context pack
│   │   ├── safety/            # permission profiles, secret masking
│   │   ├── db/                # SQLAlchemy models + Alembic
│   │   ├── schemas/           # Pydantic models (single source of truth)
│   │   ├── cli/               # Typer CLI (saarthi ...)
│   │   └── config.py          # all settings + constants in one place
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── fixtures/agents/   # recorded claude / codex JSONL streams
├── desktop/                   # Tauri 2 + React app
│   ├── src-tauri/             # thin Rust shell
│   └── src/                   # React UI
│       ├── screens/
│       ├── components/
│       ├── api/               # typed client (generated from OpenAPI)
│       └── stores/
└── scripts/                   # dev helpers (dev.sh, gen-types.sh)
```

---

## 5. Dev setup (target)

```bash
# backend
cd daemon && uv sync && uv run saarthi daemon start --dev

# UI
cd desktop && npm install && npm run tauri dev

# tests
cd daemon && uv run pytest
cd desktop && npm test
```

---

## 6. Things we will NOT use (and why)

| Not using | Why |
|---|---|
| VS Code / Code-OSS / Theia | The whole point is a task-first tool, not a file editor. |
| Monaco editor | It is VS Code's editor and heavy. CodeMirror 6 is enough for read-only + diff. |
| Electron | Heavy RAM. Tauri is lighter. |
| LangChain / big agent frameworks | We drive existing agent CLIs. We do not build our own agent loop in v1. |
| PostgreSQL / Redis | Overkill for a local single-user app. SQLite is enough. |
| GitPython | Plain `git` subprocess is simpler and supports everything (worktrees). |
| Docker for sandbox | Too heavy for every run. `bwrap` is faster and already installed. |

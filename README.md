# Saarthi

**Saarthi** means "the one who drives the chariot".
You decide where to go. The AI agents (Claude Code, Codex) do the driving.

Saarthi is a personal **Agentic Development Environment (ADE)** for Linux.
It is **not** an IDE, and it is **not** built on VS Code.

> **Status:** Design stage. The design docs are done in [`core_docs/`](core_docs/).
> No code is written yet. The next step is milestone **M0** (spike + skeleton).
> See [`core_docs/MILESTONES.md`](core_docs/MILESTONES.md).

---

## Why Saarthi

Today, most of the work is not typing code. It is:

1. Read the task and research it.
2. Ask Claude or Codex to write the code.
3. Ask them to test it.
4. Check the result.
5. Fix, commit, and open a PR.

But IDEs are still made for typing code. Research sits in browser tabs, agent output scrolls away in a terminal, and running 2-3 tasks at once leads to agents touching the same files.

Saarthi is built for the real loop:

```
Capture -> Research -> Brief -> Run agent -> Verify -> Review -> Ship -> Remember
```

## The idea

1. An IDE is built around **files**. Saarthi is built around **tasks**.
2. You **research** and write the **intent**. Agents write the **code**.
3. Every task runs in its **own git worktree**, so many tasks can run at the same time without clashes.
4. No task is "done" without **proof**: tests, checks, logs.
5. You review a **Change Story** (what changed and why), not a wall of diff.
6. The project **remembers**: `core_docs/`, learnings, and memory are given to agents and updated after every task.

## Main features (planned for v1)

| Feature | What it does |
|---|---|
| **Task Board** | The home screen is your work, not a file tree. Tasks move through stages. |
| **Task Room** | One place per task: brief, research, live agent stream, terminal, proof, review, history. |
| **Worktree per task** | Each task gets its own branch `saarthi/<task-id>-<slug>` and worktree. |
| **Context Pack** | Brief + research + relevant docs, written to one file the agent reads first. |
| **Proof Card** | Checks run by themselves after each build. No proof, no review. |
| **Change Story** | The diff grouped by purpose, with short notes and risk flags. |
| **Second Opinion** | Claude builds, Codex reviews (or the other way round). |
| **Race Mode** | The same brief goes to both agents. You pick the better result. |
| **Checkpoints + Rewind** | A hidden git checkpoint after every run. Rewind to any of them. |
| **Self-updating memory** | After shipping, the agent drafts updates to memory, learnings, and timeline. You approve each one. |

Task stages:

```
Inbox -> Research -> Ready -> Running -> Verifying -> Review -> Shipped
                                 |            |
                             Needs You      Failed
```

## How it is built

```
 Desktop app (Tauri 2 + React)        saarthi CLI (Typer)
              \                          /
        HTTP + WebSocket on 127.0.0.1:7878 (token)
                          |
              saarthid  (Python daemon)
   Task Engine · Run Manager · Check Runner · Review Builder
   Agent Adapters (claude | codex | pty) · Workspace Manager (git)
   Memory + Context Pack · Safety Guard · Event Bus -> SQLite + JSONL
                          |
        claude / codex processes      git worktrees on disk
```

- **The daemon owns all logic.** The desktop app and the CLI only call its API.
- **Agents are plugins.** Claude and Codex sit behind one `AgentAdapter` interface.
- **Everything is an event.** Every action is saved to disk. The UI is built from events.
- **Git is the safety net.** Worktrees for isolation, checkpoints for rewind.
- **Local first.** Everything runs on your machine. No cloud server, no telemetry.

## Tech stack

| Part | Tools |
|---|---|
| Daemon (`daemon/`) | Python 3.12+, uv, FastAPI, Pydantic v2, SQLAlchemy 2 + Alembic, SQLite, Typer + Rich, pytest |
| Desktop (`desktop/`) | Tauri 2, React, TypeScript, Vite, Tailwind, shadcn/ui, xterm.js, CodeMirror 6 |
| Agents | Claude Code CLI (`claude`), Codex CLI (`codex`) |
| Other tools | `git`, `gh`, `ripgrep`, `bwrap` (later) |

Why Python and not Go or Rust: see [`core_docs/TECH_STACK.md`](core_docs/TECH_STACK.md), section 2.

## Requirements

- Ubuntu 24.04 or newer (other Linux distros later; no Windows or macOS in v1)
- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- Node.js and npm
- Tauri 2 system packages (WebKitGTK)
- `git`, `gh` (logged in), `ripgrep`
- `claude` and/or `codex` CLI, already logged in. Saarthi uses your existing logins. It does not ask for API keys.

## Getting started

> These are the **target** commands. They work once `daemon/` and `desktop/` exist (milestones M0 and M1).

```bash
# Daemon (backend)
cd daemon
uv sync
uv run saarthi daemon start --dev

# Desktop app
cd desktop
npm install
npm run tauri dev
```

## CLI

Every feature works from the CLI before it gets a screen.

```bash
saarthi daemon start|stop|status
saarthi project add <path>
saarthi task new "Add password reset API"
saarthi task list
saarthi brief edit T-0001
saarthi task move T-0001 ready
saarthi run T-0001 --agent claude --mode build
saarthi checks T-0001
saarthi review T-0001
saarthi ship T-0001
```

Add `--json` to get JSON output for scripts.

## Project config

Each project gets a `.saarthi/project.toml` file. It holds the default branch, the default agent, and the checks to run:

```toml
[project]
default_branch = "main"
default_agent = "claude"
memory_path = "core_docs"

[[checks]]
name = "tests"
cmd = "uv run pytest -q"
required = true
timeout_sec = 600
```

Saarthi keeps its own data in these places:

- Global config: `~/.config/saarthi/config.toml`
- Database, logs, worktrees: `~/.local/share/saarthi/`
- API: `http://127.0.0.1:7878/api/v1` (token in `~/.config/saarthi/token`)

## Roadmap

| # | Milestone | Result |
|---|---|---|
| M0 | Spike + skeleton | Drive Claude and Codex from Python; show a terminal in Tauri |
| M1 | Daemon core + CLI | Projects, tasks, briefs, events from the CLI |
| M2 | Agent runs + worktrees | Run agents on tasks in their own worktrees |
| M3 | Desktop UI v1 | Board, Task Room, live stream, terminal |
| M4 | Checks + Proof Card | Auto checks and the "Fix with agent" loop |
| M5 | Review + Ship | Change Story, Second Opinion, commit + PR |
| M6 | Research + Memory + Playbooks | Research Desk, Context Pack, memory updates |
| M7 | Race Mode | Claude vs Codex side by side |
| M8 | Safety + cost + rewind | Sandbox, permission profiles, cost meter, rewind |
| M9 | Polish + package (v1.0) | AppImage / .deb, systemd service |

Full plan with "done when" checks: [`core_docs/MILESTONES.md`](core_docs/MILESTONES.md).

## Documentation

| File | What it has |
|---|---|
| [`core_docs/README.md`](core_docs/README.md) | The idea and a map of all docs |
| [`core_docs/QUICK_REFERENCE.md`](core_docs/QUICK_REFERENCE.md) | One-page summary |
| [`core_docs/FUNCTIONAL_SPECIFICATIONS.md`](core_docs/FUNCTIONAL_SPECIFICATIONS.md) | What the app does (features F1-F21) |
| [`core_docs/TDD-tech-design-doc.md`](core_docs/TDD-tech-design-doc.md) | How it is built: parts, data, events, API |
| [`core_docs/TECH_STACK.md`](core_docs/TECH_STACK.md) | Languages, libraries, and tools |
| [`core_docs/MILESTONES.md`](core_docs/MILESTONES.md) | The build plan |

## Working on Saarthi

Saarthi is built with Claude and Codex. Their rules are in [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md). In short:

- All logic lives in the daemon. The UI and the CLI only call the API.
- CLI first, UI second.
- Agent-specific code lives only in `agents/`, behind `AgentAdapter`.
- Write tests first for core logic. Use `FakeAdapter` with recorded fixtures. Never call real agents in tests.
- Never push to the default branch. Work on a branch and open a PR.
- Before saying "done", run `uv run pytest`, `uv run ruff check .`, and `uv run pyright`.

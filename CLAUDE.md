# Saarthi - rules for AI agents

Saarthi is a task-first Agentic Development Environment for Linux, macOS and Windows, with a built-in IDE-style file view. Not built on VS Code.

## Read first
- `core_docs/README.md` - idea and doc map
- `core_docs/MILESTONES.md` - what to build now
- `core_docs/FUNCTIONAL_SPECIFICATIONS.md` - what (FSD, F-numbers)
- `core_docs/TDD-tech-design-doc.md` - how (TDD)
- `core_docs/TECH_STACK.md` - with what

## Stack
- `daemon/`: Python 3.12+, uv, FastAPI, Pydantic v2, SQLAlchemy 2 + Alembic, SQLite, Typer, pytest.
- `desktop/`: Tauri 2, React, TypeScript, Vite, Tailwind, shadcn/ui, xterm.js, CodeMirror 6.

## Rules
1. All logic lives in the daemon. UI and CLI only call the API.
2. CLI first: a feature works in `saarthi` CLI before it gets a screen.
3. Agents only through the `AgentAdapter` interface. No agent-specific code outside `agents/`.
4. Every action is an event (TDD section 6). Unknown agent lines become raw events, never dropped.
5. Stage rules live in one table (`ALLOWED_MOVES`).
6. Git: subprocess with a list of args. Never push to the default branch.
7. Settings and constants only in `config.py` / `project.toml`. No hard-coded values.
8. Tests first for core logic. Use `FakeAdapter` + recorded fixtures; never call real agents in tests.
9. Before saying "done", run `uv run pytest`, `uv run ruff check .`, `uv run pyright` and show the output.
10. Simple English in docs. Keep it small; do not build "Later" features early.

## Commands
```bash
cd daemon && uv sync && uv run pytest
cd desktop && npm install && npm run tauri dev
```

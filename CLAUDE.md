# HonestAgent - rules for AI agents

HonestAgent is an open-source, deterministic test-integrity gate for pull requests, mostly ones written by AI coding agents. It answers one question: "Are the tests real, or did the agent cheat to make them pass?" It is a stateless Python CLI that reads git and prints a report. Integrations (pre-commit, GitHub Action, Claude Code hook) only call the CLI.

## Read first
- `core_docs/README.md` - idea and doc map
- `core_docs/MILESTONES.md` - what to build now
- `core_docs/FUNCTIONAL_SPECIFICATIONS.md` - what (FSD, F-numbers)
- `core_docs/TDD-tech-design-doc.md` - how (TDD)
- `core_docs/TECH_STACK.md` - with what

## Stack
- One Python package in `src/honestagent`: Python 3.12+, uv, Typer + Rich, Pydantic v2, stdlib `ast` + `tomllib`, PyYAML, pytest, ruff, pyright. mutmut is an optional extra (M3).

## Rules
1. One Python package, `honestagent`, in a `src/` layout. No daemon, no server, no database, no UI. A stateless CLI that reads git and prints a report.
2. CLI first: every feature works as `honestagent ...` before any integration wraps it. The pre-commit hook, the GitHub Action and the Claude Code hook only call the CLI.
3. Deterministic core. No LLM calls in v1. No network calls in the core (only the GitHub Action wrapper talks to GitHub, through `gh`).
4. Read-only on the user's repo. Never edit, commit or push the user's code. Mutation testing runs in a temp `git worktree` that is removed afterwards.
5. Git through `subprocess` with a list of args, never a shell string.
6. All rules live in one registry (`RULES` in `rules/__init__.py`). Each rule is a pure function: `(ChangeSet, Config) -> list[Finding]`.
7. Settings and constants only in `config.py` (defaults) and the user's config file. No hard-coded values elsewhere.
8. Tests first for every rule. Use recorded PR fixtures (`tests/fixtures/prs/<case>/`). Never real GitHub, never real agents, never the network.
9. Before saying "done", run `uv run pytest`, `uv run ruff check .`, `uv run pyright` and show the output.
10. Simple English in docs. Keep it small. Do not build "Later" features early.

## Commands
```bash
uv sync
uv run pytest
uv run ruff check .
uv run pyright
uv run honestagent check
```

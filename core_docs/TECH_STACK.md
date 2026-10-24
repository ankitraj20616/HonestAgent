# Tech Stack
## HonestAgent - test-integrity gate for agent pull requests

**Version:** 1.0 (v1 docs)
**Date:** 2026-10-24
**Platforms:** Linux, macOS and Windows. A pure-Python CLI that shells out to `git`.

---

## 1. Summary (one table)

| Layer | Choice | Why (short) |
|---|---|---|
| Language | **Python 3.12+** | I know it best. The first target is Python + pytest, so the tool reads Python with Python's own parser. |
| Package manager | **uv** | Fast. One tool for venv, lock file, run, build and publish. |
| CLI | **Typer** | Commands and flags from type hints. Little code. |
| Terminal output | **Rich** | Clear colored text report, tables, no extra work. |
| Data models | **Pydantic v2** | `Finding`, `Report` and `Config` models with checks. The JSON report comes straight from the model. |
| Python parsing | **stdlib `ast`** | Compares before and after test code by structure, not by text. No extra dependency. |
| TOML | **stdlib `tomllib`** | Reads `pyproject.toml` and `.honestagent.toml`. Read-only is all we need. |
| YAML | **PyYAML** (`safe_load`) | Reads CI files (`.github/workflows/*`, `.pre-commit-config.yaml`) for HA005. |
| INI files | **stdlib `configparser`** | Reads `setup.cfg`, `tox.ini`, `.coveragerc`, `pytest.ini` for HA004 / HA005. |
| Git | **system `git`** via `subprocess` (list args) | Most reliable. Works the same on all three OSes. Gives before / after file text and temp worktrees. |
| GitHub | **`gh` CLI** (Action only) | Creates or updates the one PR comment. Already on GitHub runners. Never used by the core. |
| Mutation (M3) | **mutmut** (optional extra) | Plants small bugs in changed lines and checks that the tests fail. Python-native, works with pytest. |
| Tests | **pytest** | Standard. Rules are tested on recorded PR fixtures. |
| Lint / format | **ruff** | One fast tool for lint and format. |
| Types | **pyright** | Strict type checks catch mistakes in agent-written code early. |

No other runtime dependencies in v1. Adding one needs a line in this file with a "why".

---

## 2. Why Python (and no other language)

- The tool checks Python projects first. Python's `ast` module is the most exact way to read
  Python test code, and it ships with the language.
- The work is small and fast: read a few files from git, compare trees, print a report.
  Speed is not a problem.
- I review Python best. Agents write most of the code, but I still review all of it.
- When JavaScript support comes (Later), it will be a new set of rules, not a rewrite.

---

## 3. Runtime dependencies

| Package | Used in | Notes |
|---|---|---|
| `typer` | `cli.py` | Pulls in `click` |
| `rich` | `report/text.py`, CLI errors | Plain text when output is not a terminal |
| `pydantic` (v2) | `models.py`, `config.py` | JSON report via `model_dump_json` |
| `pyyaml` | HA005 | Always `safe_load`, never `load` |

Stdlib only for the rest: `ast`, `tomllib`, `configparser`, `subprocess`, `pathlib`,
`tempfile`, `json`.

Optional extra `[mutation]`: `mutmut`. Installed with `pip install "honestagent[mutation]"`.
If `--mutation` is used without it, the CLI exits with code `2` and a clear install message.

---

## 4. Dev tooling

| Tool | Command | Why |
|---|---|---|
| uv | `uv sync` | Install the package and dev tools from the lock file |
| pytest | `uv run pytest` | All tests, offline, on fixtures in `tests/fixtures/prs/<case>/` |
| ruff | `uv run ruff check .` / `uv run ruff format .` | Lint and format |
| pyright | `uv run pyright` | Type checks |
| the tool itself | `uv run honestagent check` | Dogfood on this repo |

All four checks (`pytest`, `ruff check`, `pyright`, plus a self-check) run in this repo's own CI.
Dev tools live in a uv dev group, not in the runtime dependencies.

---

## 5. Packaging and release

- **PyPI name:** `honestagent`. Import name: `honestagent`. Command: `honestagent`.
- **Layout:** `src/` layout, one package (`src/honestagent`), entry point `honestagent = "honestagent.cli:app"`.
- **Build and publish:** `uv build`, then `uv publish` (M4).
- **Optional extra:** `[mutation]` adds mutmut.
- **pre-commit:** `.pre-commit-hooks.yaml` in the repo root (hook id `honestagent`).
- **GitHub Action:** composite `action.yml` in the repo root. It installs the package with
  the chosen Python and calls the CLI. Listed on GitHub Marketplace in M4.
- **Claude Code hook:** a sample `hooks/claude-code/settings.json` in v1. A Claude Code plugin
  listing comes with the launch (M4).
- **Versions:** semantic versions, starting at `0.1.0`. The JSON report has its own
  `schema_version` (starts at `1`).

---

## 6. Supported Python versions

- HonestAgent itself runs on **Python 3.12 and newer**. CI tests 3.12 and 3.13.
- It only **reads** the user's files with `ast`; it does not import or run them. So it can
  check projects that target older Python 3 versions, as long as the code parses with the
  3.12+ parser.
- The GitHub Action installs its own Python (`python-version` input, default 3.12), so the
  user's project Python does not matter there.
- The mutation check (M3) runs the user's tests, so the project's test dependencies must
  be installed in the same environment.

---

## 7. Supported operating systems

| OS | Status | Notes |
|---|---|---|
| Linux | Supported | Main dev and CI platform |
| macOS | Supported | Same code; tested in CI |
| Windows | Supported | Same code; tested in CI. Paths are handled with `pathlib` and shown with `/` in reports. |

- Needs `git` on the `PATH`. Nothing else.
- No OS-specific code in the core. Git is the only outside program the core calls.
- mutmut on Windows may need WSL. Checked in M3; if so, the docs say it plainly.

---

## 8. What was removed from the old stack, and why

This repo used to plan a different, much bigger product (see
`decisions/ADR-001-pivot-to-test-integrity-gate.md`). Its stack is gone:

| Removed | Why |
|---|---|
| FastAPI, Uvicorn | No server. HonestAgent is a CLI that runs and exits. |
| SQLAlchemy, Alembic, SQLite | No database. Each run is stateless; the report is the output. |
| Tauri, React, TypeScript, Vite | No UI. The outputs are text: terminal, Markdown, JSON. |
| Tailwind, shadcn/ui, xterm.js, CodeMirror | No UI, so no UI libraries. |
| Node.js | No UI build and no JS tools. |
| structlog, watchfiles, platformdirs, PTY wrappers | Nothing long-running to log, watch or manage. |
| Agent CLIs as dependencies | HonestAgent never runs an agent. It only reads what the agent changed. |

---

## 9. Later (not v1)

- Parsers for JavaScript / TypeScript tests (Jest, Vitest).
- SARIF output for GitHub code scanning.
- Anything hosted (GitHub App, team tier) would need its own stack decision then, in a new ADR.

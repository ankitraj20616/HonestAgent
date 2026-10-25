# fastauthz - rules for AI agents

fastauthz is an open-source authorization library for FastAPI and SQLAlchemy. Users write
permission rules once in plain Python (`R` = resource, `A` = actor). The same rule checks one
object in Python and filters list queries in SQL, with the same answer. It must be safe enough
for production: default deny, deny wins, fail closed.

## Read first
- `core_docs/README.md` - idea and doc map
- `core_docs/TASKS.md` - what to build now
- `core_docs/FUNCTIONAL_SPECIFICATIONS.md` - what (FSD, F-numbers)
- `core_docs/TDD-tech-design-doc.md` - how (TDD, section numbers)
- `core_docs/TECH_STACK.md` - with what

## Stack
- One Python package in `src/fastauthz`: Python 3.11+, uv, hatchling. Core uses only the standard
  library. Extras: SQLAlchemy 2.0+, FastAPI 0.115+. Tests: pytest, Hypothesis, anyio, httpx.
  Lint and types: ruff, pyright (strict).

## Rules
1. One library package, `fastauthz`, in a `src/` layout. No server, no database of our own, no UI, no LLM, no network calls.
2. Safe first. Default deny. Deny wins. Unclear = deny. Never weaken the truth rules in TDD 6.
3. Both engines must agree. Any change to `truth.py`, `evaluate.py` or `sql.py` must pass the Hypothesis property tests on SQLite and PostgreSQL.
4. The core (`expr`, `truth`, `evaluate`, `roles`, `policy`, `decision`, `errors`, `config`) imports nothing outside the standard library.
5. Only `_compat.py` may touch FastAPI or SQLAlchemy internals.
6. Values go into SQL only as bound parameters. Never build SQL text from values.
7. Error messages and HTTP responses must not leak rule names or data values.
8. Settings and constants only in `config.py`. No magic numbers elsewhere.
9. Tests first. Never call real external services or the network in tests. Local PostgreSQL (Docker / CI service) is allowed.
10. Public API fully typed. Keep `py.typed`.
11. Before saying "done", run `uv run pytest`, `uv run ruff check .`, `uv run pyright` and show the output.
12. Simple English in docs. FSD and TASKS in very simple English. Keep it small. Do not build "Later" features early.
13. If code and docs disagree, fix the doc in the same PR.

## Commands
```bash
uv sync --all-extras
uv run pytest                 # fast suite (SQLite)
uv run pytest -m postgres     # adds PostgreSQL
uv run ruff check .
uv run pyright
uv run fastauthz check examples.blog.authz:policy
```

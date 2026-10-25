# Tech Stack
## fastauthz

> What we use, and why. Add a new library only if this file says why.
> Fewer dependencies = fewer things that break for our users.

---

## 1. Runtime (what users install)

| Part | Choice | Why |
|---|---|---|
| Language | **Python 3.11+** | 3.10 reaches end of life in Oct 2026. 3.11 gives `StrEnum`, `Self`, better errors. |
| Core | **No dependencies** | The core (`expr`, `truth`, `evaluate`, `roles`, `policy`, `decision`) uses only the standard library. |
| SQL | **SQLAlchemy 2.0+** (extra `[sqlalchemy]`) | The ORM most FastAPI apps use. SQLModel is built on it, so it works too. |
| Web | **FastAPI 0.115+** (extra `[fastapi]`) | The framework we serve. Final lowest version is picked in the M0 spike. |
| CLI | **stdlib `argparse`** | The CLI is small. No need for Typer or Click as a dependency. |

Install for users: `pip install "fastauthz[standard]"` (= core + SQLAlchemy + FastAPI).

**Rules for runtime dependencies**
- Lower bounds only (`>=`). No upper bounds. Upper bounds break users' installs. Our CI catches
  real breaks (TDD 15).
- No new runtime dependency without an ADR in `decisions/`.

---

## 2. Development

| Need | Tool | Why |
|---|---|---|
| Project and env | **uv** | Fast. Lock file. Can test lowest and highest versions (`--resolution lowest-direct`). |
| Build backend | **hatchling** | Simple, standard, pure-Python wheels. |
| Tests | **pytest** | Standard. |
| Async tests | **anyio** pytest plugin | FastAPI and Starlette use anyio. |
| Random / property tests | **Hypothesis** | Proves Python checks and SQL filters agree (TDD 14.3). |
| HTTP tests | **httpx** (`AsyncClient` + `ASGITransport`) | Tests FastAPI apps without a server. |
| Coverage | **coverage.py** (branch mode) | Gates: 100% core, 95% overall. |
| Mutation tests | **mutmut** | Checks that tests really catch bugs in `truth`, `evaluate`, `sql`. |
| Lint and format | **ruff** | One fast tool for both. |
| Types | **pyright** (strict) | Public API must be fully typed (`py.typed`). |
| Benchmarks | **pytest-benchmark** | Tracks speed targets (TDD 16). |
| Git hooks | **pre-commit** | ruff + basic file checks before each commit. |
| Databases in tests | **SQLite** (in memory) + **PostgreSQL** (local Docker / CI service) | SQLite for speed, PostgreSQL for real behavior. |
| Postgres driver | **psycopg 3** (sync) and **asyncpg** (async) | The two drivers FastAPI users use most. |
| Async SQLite driver | **aiosqlite** | For async tests on SQLite. |

---

## 3. Docs

| Need | Tool | Why |
|---|---|---|
| Docs site | **MkDocs** with the **Material** theme | Same look as the FastAPI docs; users know it. Check its status again in M4 (Material went into maintenance mode; its team is building a successor, Zensical). |
| API reference | **mkdocstrings** (Python handler) | Built from docstrings, so it cannot drift from the code. |
| Hosting | **GitHub Pages** | Free. Built by GitHub Actions from `main`. |

---

## 4. CI and release

| Need | Tool |
|---|---|
| CI | **GitHub Actions** (matrix in TDD 15.2) |
| Publish to PyPI | **PyPI Trusted Publishing** (OIDC). No API tokens stored. |
| Build proof | **PEP 740 attestations** uploaded with each release |
| Dependency updates | **Dependabot** (GitHub Actions + dev dependencies) |
| Supply-chain score | **OpenSSF Scorecard** action |
| Security reports | **GitHub Security Advisories** (see `SECURITY.md`) |

---

## 5. Not used (and why)

| Not used | Why |
|---|---|
| Pydantic as a dependency | Not needed by the core. FastAPI brings it anyway. |
| Typer / Click / Rich | The CLI is small. `argparse` keeps the core dependency-free. |
| A policy language (Polar, Rego, YAML) | Plain Python is easier, and editors and pyright can check it. |
| Any server or database of our own | fastauthz is a library inside the user's app. |
| Any LLM or paid API | Not needed. The library must be deterministic. |
| mypy | One type checker is enough. pyright is faster and stricter. |

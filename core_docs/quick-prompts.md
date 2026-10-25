# Quick Prompts - fastauthz

Prompts to give Claude / Codex while building fastauthz.

---

## Start of a session
Read `CLAUDE.md`, `core_docs/README.md`, `core_docs/TASKS.md`, and the latest lines of `core_docs/timeline/timeline.md`. Tell me which milestone we are on, what is done, and the next 3 small tasks. Do not write code yet.

## Plan a task
Read the FSD feature (F-number) and the TDD section named in the task in `core_docs/TASKS.md`, and `core_docs/TECH_STACK.md`. Then read all related code files fully. Write a plan in `core_docs/plans/<milestone>_<task>.md`: files to add or change, tests to write first, risks, and which truth rules (TDD 6) are touched. Constants go in `config.py`. Do not build "Later" items.

## Build with tests first
Follow the plan in `core_docs/plans/<file>.md`. Write the failing tests first, run them and show they fail. Then write the code. Then run `uv run pytest`, `uv run ruff check .` and `uv run pyright`, and show me the real output. Do not say "done" without it.

## Change the evaluator or the SQL compiler
Any change to `truth.py`, `evaluate.py` or `sql.py` must keep both engines equal. Steps: 1) add a unit test for the new case in both engines; 2) make sure the Hypothesis strategy in `tests/property/` can produce the case; 3) run the property tests on SQLite, and on PostgreSQL with `uv run pytest -m postgres`; 4) if Hypothesis found a bug, add it as a fixed `@example`. Show the output.

## Add a startup problem code
Codes come from TDD 8.5. Do not invent a new code without adding it to TDD 8.5, FSD F5 and `QUICK_REFERENCE.md` in the same change. Write one test that triggers it and one that does not. The message must say what is wrong, where (file:line of the rule), and how to fix it.

## Bug fix
Read the full files involved. First write a test that shows the bug. Run it and show it fails. Explain the root cause in 3 lines. Fix it and run all checks. If the bug could give access when it should not, mark it as security: add a row to TDD 17.1 if a new risk was found, and add Problem -> Root cause -> Fix -> Result to `core_docs/memory/project_memory.md`.

## Review before commit
Review the diff against the TDD and FSD. Check: default deny and fail-closed kept; both engines agree; values only as bound parameters; core imports nothing outside stdlib; FastAPI/SQLAlchemy internals only in `_compat.py`; constants only in `config.py`; public API fully typed; every new behavior has tests; error messages leak no rule details or values; docs match the code; no "Later" features. List issues by severity. Do not fix yet.

## End of a session
Tick boxes in `core_docs/TASKS.md`, add a line to `core_docs/timeline/timeline.md` with today's date, and add any new lesson to `core_docs/learnings/`. Keep it short.

# Quick Prompts - HonestAgent

Prompts to give Claude / Codex while building HonestAgent.

---

## Start of a session
Read `CLAUDE.md`, `core_docs/README.md`, `core_docs/MILESTONES.md`, and the latest lines of `core_docs/timeline/timeline.md`. Tell me which milestone we are on, what is done, and what the next 3 small steps are. Do not write code yet.

## Plan a milestone item
Read `core_docs/FUNCTIONAL_SPECIFICATIONS.md` (the related F-number), `core_docs/TDD-tech-design-doc.md` (the related section), and `core_docs/TECH_STACK.md`. Then read all the related code files fully, not just a few lines. Make a plan in `core_docs/plans/<milestone>_<feature>.md`: files to add or change, fixtures and tests to write first, risks. Keep constants in `config.py`. Reuse code. Do not over-engineer and do not build "Later" items.

## Build with tests first
Follow the plan in `core_docs/plans/<file>.md`. First add or pick the recorded PR fixtures in `tests/fixtures/prs/<case>/` (`before/`, `after/`, `expected.json`). Write the failing tests, run them and show they fail, then write the code, then run `uv run pytest`, `uv run ruff check .` and `uv run pyright`. Show me the real output. Do not say "done" without it. Never call real GitHub, real agents or the network in tests.

## Add a new rule
Rule IDs and names come from `core_docs/FUNCTIONAL_SPECIFICATIONS.md`; do not make up a new ID. Steps: 1) add fixtures first: at least one case where the rule must fire and one clean case where it must not; 2) write the rule as a pure function `(ChangeSet, Config) -> list[Finding]`, using the stdlib `ast` module for Python files; 3) add it to the `RULES` registry in `rules/__init__.py`; 4) put its default severity in `config.py`; 5) update the docs: the FSD rule table, the rule table in `README.md`, and the `honestagent explain <ID>` text (what it catches, one example, how to allow it). Run all checks and show the output.

## Bug fix (false positive or false negative)
Read the full files involved, not snippets. First add a fixture in `tests/fixtures/prs/<case>/` that shows the bug: a clean change that gets flagged (false positive) or a tampered change that is missed (false negative). Run it and show it fails. Explain the root cause in 3 lines. Then fix the rule and run all checks. Add problem -> root cause -> fix -> result to `core_docs/memory/project_memory.md`.

## Review before commit
Review the current diff against the TDD and FSD. Check: core is deterministic (no LLM, no network); read-only on the user's repo; git args passed as a list, never a shell string; mutation runs only in a temp worktree that is removed; all rules in the `RULES` registry and each one pure; constants only in `config.py`; every rule has fixture tests; integrations only call the CLI; no "Later" features; docs and `honestagent explain` text match the code. List issues by severity. Do not fix yet.

## End of a session
Update `core_docs/MILESTONES.md` checkboxes, add a line to `core_docs/timeline/timeline.md` with today's date, and add any new lesson to `core_docs/learnings/`. Keep it short.

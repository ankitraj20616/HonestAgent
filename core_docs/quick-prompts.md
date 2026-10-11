# Quick Prompts - Saarthi

Prompts to give Claude / Codex while building Saarthi.

---

## Start of a session
Read `core_docs/README.md`, `core_docs/MILESTONES.md`, and the latest file in `core_docs/timeline/`. Tell me which milestone we are on, what is done, and what the next 3 small steps are. Do not write code yet.

## Plan a milestone item
Read `core_docs/FUNCTIONAL_SPECIFICATIONS.md` (the related F-number), `core_docs/TDD-tech-design-doc.md` (the related section), and `core_docs/TECH_STACK.md`. Then read all the related code files fully, not just a few lines. Make a plan in `core_docs/plans/<milestone>_<feature>.md`: files to add/change, tests to write first, risks. Follow the TDD. Keep constants in `config.py`. Reuse code. Do not over-engineer.

## Build with tests first
Follow the plan in `core_docs/plans/<file>.md`. Write the failing tests first, run them and show they fail, then write the code, then run all tests + ruff + pyright. Show me the real output. Do not say "done" without the output.

## Agent adapter work
Use the recorded streams in `daemon/tests/fixtures/agents/` as the source of truth for event formats. Never guess a CLI flag - check `claude --help` / `codex exec --help` first. Unknown event lines must become raw `agent.message` events, never be dropped.

## Bug fix
Read the full files involved, not snippets. Find the root cause first and explain it in 3 lines. Then write a failing test that shows the bug, then fix it. Add the problem -> root cause -> fix -> result to `core_docs/memory/project_memory.md`.

## Review before commit
Review the current diff against the TDD and FSD. Check: stage rules in one table, no business logic in the UI, git args passed as a list, no push to the default branch, secrets masked, constants centralised. List issues by severity. Do not fix yet.

## End of a session
Update `core_docs/MILESTONES.md` checkboxes, add a line to `core_docs/timeline/timeline.md` with today's date, and add any new rule to `core_docs/learnings/`. Keep it short.

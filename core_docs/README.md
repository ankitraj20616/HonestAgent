# core_docs - fastauthz

**fastauthz** is an open-source authorization library for **FastAPI** and **SQLAlchemy**.
It answers one question in every route: **"Can this user do this action on this thing?"**

---

## The idea in 6 lines

1. You write permission rules once, in plain Python: `policy.allow("edit", Post, when=R.author_id == A.id)`.
2. The same rule checks one object (Python) **and** filters list queries (SQL `WHERE`).
3. Both give the same answer. Property-based tests prove it.
4. Safe by default: no rule = no access, deny wins, unsure = no.
5. Mistakes (typos, missing columns, missing tenant scope) stop the app at start.
6. FastAPI dependencies (`query`, `load`, `require`, `guard`) make routes safe in one line.

No server. No subscription. No LLM. Zero dependencies in the core. MIT license.

---

## How the docs flow

```
FSD (what) -> TDD (how) -> TASKS (steps) -> plans/ (one task in detail) -> code + tests
```

- The **FSD** says what the library does, as features F1-F17. Very simple English.
- The **TDD** says how it is built: modules, the expression tree, truth rules, SQL compiler, FastAPI layer.
- **TASKS** is the build plan: milestones M0-M5 with small checkbox tasks.
- A **plan** in `plans/` breaks one bigger task into steps before coding.
- After the work: lessons go to `learnings/`, hard bugs to `memory/`, the date to `timeline/timeline.md`.

If code and docs disagree, fix the doc in the same PR.

---

## Documents in this folder

| File | What it has | Read it when |
|---|---|---|
| `README.md` | This page. Idea + map of docs. | First |
| `QUICK_REFERENCE.md` | One-page cheat sheet: API, truth rules, problem codes, CLI. | You need a fast reminder |
| `FUNCTIONAL_SPECIFICATIONS.md` | **FSD**. What it does. Features F1-F17. | Before building any feature |
| `TDD-tech-design-doc.md` | **TDD**. How it is built, in detail. | Before writing code |
| `TASKS.md` | Build plan. M0-M5, checkbox tasks, "done when". | Planning the next session |
| `TECH_STACK.md` | Libraries and tools, and why. | Before setup or adding a library |
| `quick-prompts.md` | Ready prompts for Claude / Codex while building. | Every session |

## Sub-folders

| Folder | What goes inside |
|---|---|
| `milestones/` | One folder per milestone (M0-M5), each with its own `FSD.md`, `TDD.md` and `TASKS.md`. |
| `decisions/` | One file per big decision (ADR). Starts with `ADR-001-build-fastauthz.md`. |
| `plans/` | Implementation plans for bigger tasks. |
| `reports/` | Spike results, test and benchmark reports. M0 writes `reports/M0_spikes.md`. |
| `learnings/` | Patterns, mistakes, "do this, not that" rules. |
| `memory/` | `project_memory.md` - big wins and hard bugs (Problem -> Root cause -> Fix -> Result). |
| `code_reviews/` | Review notes and audit reports. |
| `timeline/` | `timeline.md` - what got done, on which date. |

---

## Golden rules for this project

1. **Safe first.** When unsure, deny. Every new feature must keep the fail-closed rules (TDD 6).
2. **Same answer.** Python and SQL must agree. Any change to `evaluate.py` or `sql.py` needs the property tests to pass.
3. **Small core.** The core imports nothing outside the standard library.
4. **Internals in one place.** Only `_compat.py` touches FastAPI or SQLAlchemy internals.
5. **Tests first.** Red, then green, then refactor.
6. **Simple first.** Build the smallest thing that works. Do not build "Later" items.

Full rule list: [`../CLAUDE.md`](../CLAUDE.md).

---

## Decisions

| File | Decision |
|---|---|
| `decisions/ADR-001-build-fastauthz.md` | Build fastauthz. Why authorization, the evidence, and the ideas we rejected. |

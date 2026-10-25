# Milestones

One folder per milestone. Each folder has three files:

| File | What | English |
|---|---|---|
| `FSD.md` | What this milestone gives. Points and sub-points. | Very simple |
| `TDD.md` | How it is built: files, signatures, algorithms, tests. | Detailed |
| `TASKS.md` | Small checkbox tasks, tests first. | Very simple |

These files add detail to the main docs. They never replace them:
- Main FSD: `../FUNCTIONAL_SPECIFICATIONS.md`
- Main TDD: `../TDD-tech-design-doc.md`
- Main plan: `../TASKS.md`

If a milestone doc and a main doc disagree, fix one of them in the same PR.

## Folders

| Milestone | Folder | What we get | Hours |
|---|---|---|---|
| M0 | [`M0_setup_and_spikes/`](M0_setup_and_spikes/) | Project set up. Risky parts tried first. | 10 |
| M1 | [`M1_core/`](M1_core/) | Rules, safe answers, roles, checks, explain. | 25 |
| M2 | [`M2_sql_scope_relationships/`](M2_sql_scope_relationships/) | SQL filters, scope, relationships, custom checks. | 30 |
| M3 | [`M3_fastapi/`](M3_fastapi/) | FastAPI dependencies, errors, API docs, decision log. | 25 |
| M4 | [`M4_tools_examples_docs/`](M4_tools_examples_docs/) | Test helpers, CLI, examples, docs website. | 20 |
| M5 | [`M5_security_and_release/`](M5_security_and_release/) | Security review and the 1.0 release. | 15 |

Do the milestones in order. Tick boxes in the milestone `TASKS.md` and in the main `TASKS.md`.

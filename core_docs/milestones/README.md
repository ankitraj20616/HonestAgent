# Milestones - FSD and TDD per milestone

**Date:** 2026-10-11
**Source of truth:** `../MILESTONES.md` (plan), `../FUNCTIONAL_SPECIFICATIONS.md` (what), `../TDD-tech-design-doc.md` (how), `../TECH_STACK.md` (with what)

> The big FSD and TDD describe the whole product. The files here cut them into one small, buildable slice per milestone.
> Read the milestone's FSD first (what and why), then its TDD (how), then build.

---

## Folder map

| # | Folder | FSD | TDD | Main result |
|---|---|---|---|---|
| M0 | `M0_spike_skeleton/` | `FSD_M0_spike_skeleton.md` | `TDD_M0_spike_skeleton.md` | Proof we can drive Claude and Codex from Python and show it in Tauri |
| M1 | `M1_daemon_core_cli/` | `FSD_M1_daemon_core_cli.md` | `TDD_M1_daemon_core_cli.md` | Projects, tasks, briefs, events - from the CLI |
| M2 | `M2_agent_runs_worktrees/` | `FSD_M2_agent_runs_worktrees.md` | `TDD_M2_agent_runs_worktrees.md` | Run Claude / Codex on a task in its own worktree from the CLI |
| M3 | `M3_desktop_ui_v1/` | `FSD_M3_desktop_ui_v1.md` | `TDD_M3_desktop_ui_v1.md` | Board + Task Room + live stream + terminal |
| M4 | `M4_checks_proof_card/` | `FSD_M4_checks_proof_card.md` | `TDD_M4_checks_proof_card.md` | Auto checks, Proof Card, "Fix with agent" loop |
| M5 | `M5_review_ship/` | `FSD_M5_review_ship.md` | `TDD_M5_review_ship.md` | Change Story, comments, Second Opinion, commit + PR |
| M6 | `M6_research_memory_playbooks/` | `FSD_M6_research_memory_playbooks.md` | `TDD_M6_research_memory_playbooks.md` | Research Desk, Context Pack v1, memory update, playbooks |
| M7 | `M7_race_mode/` | `FSD_M7_race_mode.md` | `TDD_M7_race_mode.md` | Claude vs Codex side by side |
| M8 | `M8_safety_cost_rewind/` | `FSD_M8_safety_cost_rewind.md` | `TDD_M8_safety_cost_rewind.md` | Sandbox, permission profiles, cost meter, rewind |
| M9 | `M9_polish_package/` | `FSD_M9_polish_package.md` | `TDD_M9_polish_package.md` | AppImage / .deb, systemd service, docs - v1.0 |
| M10 | `M10_jira_tickets/` | `FSD_M10_jira_tickets.md` | `TDD_M10_jira_tickets.md` | Tickets panel, start task from Jira ticket, write back |

**Build order:** M0 to M9 in order, except M10 (Jira tickets). M10 needs M1-M6 and is built after M6; it may come before M7. M7-M9 keep their numbers. The files for M10 are added by the Task Docs + Jira spec (`../design/2026-10-12-task-docs-and-jira-design.md`).

Each folder can also hold, later: `IMPLEMENTATION_PLAN_<name>.md`, `testing/`, and review notes.

---

## Who builds what (ownership map)

This table decides which milestone **owns** each feature, table, endpoint and event.
A milestone doc must not build something owned by a later milestone. It may only *prepare* for it (for example, a nullable column).

### Features (FSD F-numbers)

| Milestone | F-numbers owned |
|---|---|
| M0 | None (spikes only). Answers TDD section 16 questions. |
| M1 | F1.1-F1.4 (CLI), F2.1, F2.3, F2.5 (`Ready` rule only), F2.6, F2.7 (CLI filters), F3.1 (brief via `$EDITOR`), F3.4 (save versions - data only), F14.1 (events saved), F20.1-F20.2 (project/task/brief/daemon commands), F21.2 (health endpoint) |
| M2 | F5.1, F5.2, F5.3 (v0: brief only), F5.6, F5.7, F5.8, F5.9, F5.10, F6.1, F6.2, F6.3 (CLI), F14.2, F16.1 (record tokens/cost per run), F19.1 (`notify-send`), NF3, F22.2-F22.4 (plan saved as a doc, changed and pinned docs - CLI + API) |
| M3 | Screens for M1+M2 features: F1.3, F2.2, F2.4, F2.7, F3.1 (UI), F5.4, F5.5, F5.6 (UI), F6.3 (UI), F6.4, F14.1 (timeline tab), F16.2, F17.1-F17.4, F18.1, F19.1 (native), F21.1, F21.2 (page), F22.1 (Docs tab) |
| M4 | F2.5 (`Review` rule), F7.1-F7.4, F7.6 |
| M5 | F2.5 (`Shipped` rule), F6.5, F6.6, F8.1-F8.3, F10.1-F10.6, F11.1-F11.3 |
| M6 | F3.2, F3.4 (versions view), F4.1-F4.4, F4.6, F5.3 (v1), F12.1-F12.3, F13.1-F13.4, F22.5 (research docs + plan in Context Pack) |
| M7 | F6.7, F9.1-F9.3, "running now" strip on the board |
| M8 | F14.3, F15.1, F15.2, F15.3, F15.4, F16.2 (cost meter), F16.3 (budget alert) |
| M9 | F18.2 (shortcut sheet `?`), packaging, systemd, first-run wizard, Playwright, user guide, NF1, NF6 |
| M10 | F3.3 (brief from ticket), F23.1-F23.6 (Jira Cloud connect, Tickets panel, start/link task, ticket chip, write back, cache + offline) |

### Data (SQLite tables, TDD section 5)

| Milestone | Tables / columns added |
|---|---|
| M1 | `projects`, `tasks`, `briefs`, `research_items`, `runs` (empty, schema only), `events` (+ `project_id`), `settings` |
| M2 | Uses `runs` fully. No new tables. (Docs are files; plan docs live in the data folder.) |
| M4 | `check_results`, `proof_cards` |
| M4 | + `check_results.proof_card_id`, extra `proof_cards` columns (status, coverage state, warnings) |
| M5 | `change_stories`, `review_comments`, `review_findings`; + `tasks.pr_url`, `tasks.shipped_sha` |
| M6 | `playbooks`, `memory_updates` (+ extra columns); + `research_items.run_id` |
| M7 | `race_lanes`; + `runs.race_lane_id`, `tasks.race_id`, `tasks.port` |
| M8 | `checkpoints` (index over git refs); + `runs.permission_profile`, `runs.sandboxed`, `runs.cost_estimated`. Budgets live in `settings`. |
| M10 | `tickets` (cache), `ticket_views` (what each view returned, for offline), `ticket_actions`; + `tasks.ticket_key` (nullable, partial unique index per project; `tasks.ticket_url` already exists) |

One Alembic migration per milestone that adds tables.

### API (TDD section 9)

| Milestone | Endpoints added |
|---|---|
| M1 | `/health`, `/projects*`, `/projects/{id}/tasks`, `/tasks/{id}`, `/tasks/{id}/stage`, `/tasks/{id}/brief` (GET/PUT), `/tasks/{id}/research`, `/research/{id}`, WebSocket `/ws` |
| M2 | `/tasks/{id}/runs`, `/runs/{id}`, `/runs/{id}/events`, `/runs/{id}/input`, `/runs/{id}/stop`, `/runs/{id}/resume`, `/tasks/{id}/context-pack`, `/tasks/{id}/workspace`, `/tasks/{id}/docs`, `/tasks/{id}/docs/content` |
| M3 | `/settings`, `/projects/{id}/files`, `/projects/{id}/search` |
| M4 | `/tasks/{id}/checks`, `/tasks/{id}/proof` |
| M5 | `/tasks/{id}/review*`, `/tasks/{id}/ship`, `/tasks/{id}/workspace/sync` |
| M6 | `/tasks/{id}/brief/draft`, `/tasks/{id}/memory-updates`, `/playbooks` |
| M7 | Race endpoints, `/projects/{id}/runs/active` (see M7 TDD) |
| M8 | `/tasks/{id}/checkpoints`, `/tasks/{id}/checkpoints/{n}/rewind`, `/tasks/{id}/safety`, `/safety/check`, `/safety/scrub`, `/cost` |
| M10 | `/jira/sites*`, `/projects/{id}/tickets*`, `/tasks/{id}/ticket`, `/tasks/{id}/ticket-actions`, `/ticket-actions/{id}/send`, `/ticket-actions/{id}/skip` |

### Events (TDD section 6.2)

| Milestone | Event groups added |
|---|---|
| M1 | `task.*`, `brief.*`, `research.*` |
| M2 | `run.*`, `agent.*`, `terminal.output`, `workspace.created`, `workspace.checkpoint`, `doc.saved` (new) |
| M4 | `check.*`, `proof.ready`, `proof.coverage_confirmed` |
| M5 | `review.*`, `ship.*` (incl. `ship.failed`), `workspace.removed`, `workspace.synced` |
| M6 | `memory.*` (incl. `memory.update_decided`, `memory.file_saved`) |
| M7 | `race.*` (`race.started`, `race.ready`, `race.winner_picked`, `race.cancelled`) |
| M8 | `workspace.rewound`, `safety.alert`, `cost.budget_exceeded` |
| M10 | `ticket.*` (`ticket.synced`, `ticket.imported`, `ticket.linked`, `ticket.action_proposed`, `ticket.action_sent`, `ticket.action_failed`, `ticket.action_skipped`) |

Events beyond core TDD 6.2 are marked **(new)** in each TDD. When a milestone is built, copy its new events into the core TDD.

### Stage moves added on top of core TDD section 7

M1 puts every core move in `ALLOWED_MOVES`, each tagged `By.USER` or `By.SYSTEM`. Later milestones add these rows:

| Milestone | Move | Who | Why |
|---|---|---|---|
| M1 | Running / Needs You -> Failed | system | Run crashed or interrupted (core 8.6 says it, table 7 missed it) |
| M1 | Parked -> Inbox / Research / Ready | user | Table 7 had no way out of Parked except Archived |
| M2 | Running / Needs You -> Ready | system | User stopped the run |
| M2 | Needs You -> Verifying / Ready | system | A run that ended with a question is closed as done |
| M2 | *(removed)* Running -> Ready for **research** runs | - | Research runs never move the stage (would skip the "Ready needs a goal" rule) |
| M4 | Failed -> Review | user | Override with a typed reason (failed checks put the task in Failed, not Verifying) |
| M4 | Failed -> Verifying | system | Checks run again by hand |
| M5 | Review -> Verifying | system | Checks run again after "Update from main" changed code |
| M7 | Running / Needs You / Verifying / Failed -> Ready | user | Cancel a race |

---

## Known gaps between MILESTONES.md and the FSD

Each one is listed again in the "Open questions" of the milestone that owns it.

1. **F6.5 Sync with main** is "Must" in the FSD but is not in any milestone. Placed in **M5** (about 2.5 h extra).
2. **F15.4 Secret masking** is "Must" in the FSD, but MILESTONES.md builds it in **M8**. Until M8, logs may contain secrets. M5 keeps check output out of the PR body for this reason. M8 adds `saarthi safety scrub` to clean old data.
3. **F16.3 Budget alert** and **F6.7 Ports** are "Later" in the FSD but MILESTONES.md builds them in **M8** and **M7**. Followed MILESTONES.md.
4. **Race Mode needs two worktrees per task.** Solved in M7 with a small `race_lanes` table.

---

## Decisions that change the core docs (owner must confirm)

These go against or beyond the core FSD / TDD. If you accept them, update the core docs too.

| # | Milestone | Decision | Core doc it changes |
|---|---|---|---|
| 1 | M1 | Task IDs are global (`T-0001` across all projects), not per project | TDD 5.2 |
| 2 | M2 | Research runs do not move the stage | TDD 7 |
| 3 | M2 | Needs You has two paths: live answer (Claude), or "ended with a question" -> resume (Codex) | TDD 8.2 (confirm with M0 ADR-001) |
| 4 | M3 | Tiny edits (F17.3) are in M3 with no CLI command | CLAUDE.md rule 2 exception |
| 5 | M4 | Check commands run without a shell; `&&`, `\|`, `>` are refused | TDD 10.1 |
| 6 | M5 | Second Opinion uses `codex exec --output-schema`, not `codex review` | TECH_STACK 3.2 |
| 7 | M6 | Memory updates are drafted **after** Shipped, as an extra commit on the PR branch | TDD 8.5 |
| 8 | M6 | Playbooks are files (markdown + TOML front matter); the DB is only an index | TDD 5.9 |
| 9 | M8 | Agent flags come from each adapter (`permission_args(policy)`), not from `safety/` | TDD 4.9 |
| 10 | M9 | systemd `KillMode=mixed`: runs stop with the daemon and are resumed later | TDD 16 Q5 |
| 11 | M2 | Plan docs are saved in the data folder, not the worktree (a plan run never changes a worktree file) | TDD 10 (files on disk) |
| 12 | M10 | Jira Cloud only; write back needs my OK by default | FSD F3.3, F23 |

---

## Effort (from the TDDs)

| M0 | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ~10 h | ~20 h | ~21.5 h | ~32.5 h | ~14 h | ~22 h | ~21 h | ~10 h | ~19 h | ~19 h | ~18 h | ~207 h |

M8 and M9 are over the MILESTONES.md plan (15 h and 10 h). Their FSDs list what to cut.

---

## How to write a new milestone doc

- **Header block:** document type, milestone, product, status, version, date, effort, written for, language style, related documents.
- **FSD** = what and why, for a reader who does not code. Every feature has: What, Why, Example (a real command or a real click), Rules, Acceptance criteria.
- **TDD** = how, for a developer. Every decision says **why**. Lists files, tables, events, endpoints, CLI, config keys, tests, risks, effort.
- Simple English. Short sentences. No jargon without a one-line explanation.
- Do not build "Later" features early (CLAUDE.md rule 10).

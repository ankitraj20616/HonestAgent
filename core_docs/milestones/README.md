# Milestones - FSD and TDD per milestone

**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../design/2026-10-23-simple-ui-design.md`): new screen words, many projects in one window, Files (IDE view), one app for Linux, macOS and Windows, Gemini CLI in M7. Browser testing (M11) and live preview (M12) added (spec section 11, `../decisions/ADR-003-browser-testing.md`).
**Source of truth:** `../MILESTONES.md` (plan), `../FUNCTIONAL_SPECIFICATIONS.md` (what), `../TDD-tech-design-doc.md` (how), `../TECH_STACK.md` (with what)

> The big FSD and TDD describe the whole product. The files here cut them into one small, buildable slice per milestone.
> Read the milestone's FSD first (what and why), then its TDD (how), then build.
>
> **Screens** are views of the prototype `../design/Saarthi Prototype.html#<view id>`. Each milestone doc lists its views in its header; the full list per milestone is in `../design/README.md`.

---

## Folder map

| # | Folder | FSD | TDD | Main result |
|---|---|---|---|---|
| M0 | `M0_spike_skeleton/` | `FSD_M0_spike_skeleton.md` | `TDD_M0_spike_skeleton.md` | Proof we can drive Claude and Codex from Python and show it in Tauri, and that the window + daemon start on Linux, macOS and Windows |
| M1 | `M1_daemon_core_cli/` | `FSD_M1_daemon_core_cli.md` | `TDD_M1_daemon_core_cli.md` | Projects, tasks, goals (briefs), events - from the CLI |
| M2 | `M2_agent_runs_worktrees/` | `FSD_M2_agent_runs_worktrees.md` | `TDD_M2_agent_runs_worktrees.md` | Run Claude Code / Codex on a task in its own copy of the repo (worktree) from the CLI, on all 3 OSes |
| M3 | `M3_desktop_ui_v1/` | `FSD_M3_desktop_ui_v1.md` | `TDD_M3_desktop_ui_v1.md` | Home (many projects, 4 statuses), Board view, Task page (Activity, More → Terminal / Docs / History / Details), Files (IDE view) |
| M4 | `M4_checks_proof_card/` | `FSD_M4_checks_proof_card.md` | `TDD_M4_checks_proof_card.md` | Tests and checks, verdict (Looks good / Take a look / Has problems), "Let Claude fix it" loop - the checks part of Check and ship |
| M5 | `M5_review_ship/` | `FSD_M5_review_ship.md` | `TDD_M5_review_ship.md` | What changed groups, comments, Ask Codex to review, Approve and create pull request, Done screen, Files: why it changed + looked at |
| M6 | `M6_research_memory_playbooks/` | `FSD_M6_research_memory_playbooks.md` | `TDD_M6_research_memory_playbooks.md` | Just research, What Claude reads (Context Pack v1), Lessons and notes, Saved instructions |
| M7 | `M7_race_mode/` | `FSD_M7_race_mode.md` | `TDD_M7_race_mode.md` | Side by side (any two agents), Gemini CLI agent |
| M8 | `M8_safety_cost_rewind/` | `FSD_M8_safety_cost_rewind.md` | `TDD_M8_safety_cost_rewind.md` | OS sandbox per OS, What agents may do, Safety and cost, History → Restore |
| M9 | `M9_polish_package/` | `FSD_M9_polish_package.md` | `TDD_M9_polish_package.md` | `.dmg` / `.msi` / `.AppImage` + `.deb`, daemon as a sidecar, background mode per OS, first-run setup, docs - v1.0 |
| M10 | `M10_jira_tickets/` | `FSD_M10_jira_tickets.md` | `TDD_M10_jira_tickets.md` | Jira tickets page, start a task from a ticket, write back (Needs-you row + card on Done) |
| M11 | `M11_browser_testing/` | `FSD_M11_browser_testing.md` | `TDD_M11_browser_testing.md` | Live test in a real Chromium after the checks, `e2e` checks, saved test logins, allowed hosts, See it work. Screens: `settingsBrowser`, `loginSave`, `liveTest`, `evidence`, `loginExpired`, `check` (See it work card) |
| M12 | `M12_live_preview/` | `FSD_M12_live_preview.md` | `TDD_M12_live_preview.md` | Live browser (screencast) in the task page, preview window with no IPC, agent drives it only where the spike passes. Screens: `livePreview`, `liveTest` |

**Build order:** M0 to M9 in order, except M10 (Jira tickets). M10 needs M1-M6 and is built after M6; it may come before M7. M7-M9 keep their numbers. The files for M10 are added by the Task Docs + Jira spec (`../design/2026-10-12-task-docs-and-jira-design.md`).
M11 (browser testing) needs M4 and M5 and uses M7's per-workspace ports, so it is built after M7 (if M7 is not done, M11 builds the port part). M12 (live preview) needs M11 and M3, and starts with a go/no-go spike per OS. The files for M11 and M12 come from the Simple UI spec, section 11.

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
| M2 | F5.1 (Claude Code, Codex), F5.2, F5.3 (v0: brief only), F5.6, F5.7, F5.8, F5.9, F5.10, F6.1, F6.2, F6.3 (CLI), F14.2, F16.1 (record tokens/cost per run), F19.1 (daemon notification, Linux only), NF3, NF6 base (per-OS paths via `platformdirs`, ConPTY on Windows, process control), F22.2-F22.4 (plan saved as a doc, changed and pinned docs - CLI + API) |
| M3 | Screens for M1+M2 features: F1.3, F1.5 (many projects in one window), F2.2, F2.4, F2.7, F2.9 (4 statuses), F3.1 (UI), F5.4, F5.5, F5.6 (UI), F6.3 (UI), F6.4, F14.1 (History view), F16.2, F17.1-F17.5, F17.8 (Files, project files), F18.1, F19.1 (native, Tauri plugin), F21.1, F21.2 (page), F22.1 (Docs view) |
| M4 | F2.5 (`Review` rule), F7.1-F7.4, F7.6, F7.7 (shown as a verdict) |
| M5 | F2.5 (`Shipped` rule), F6.5, F6.6, F8.1-F8.3, F10.1-F10.6, F11.1-F11.3, F17.6, F17.7 |
| M6 | F3.2, F3.4 (versions view), F4.1-F4.4, F4.6, F5.3 (v1), F12.1-F12.3, F13.1-F13.4, F22.5 (research docs + plan in Context Pack) |
| M7 | F5.1 (Gemini CLI), F6.7, F9.1-F9.3, live Working rows on Home |
| M8 | F14.3, F15.1, F15.2, F15.3 (per OS: `bwrap` / `sandbox-exec` / none on Windows), F15.4, F16.2 (Safety and cost), F16.3 (budget alert) |
| M9 | F18.2 (shortcut sheet `?`), packaging for 3 OSes, background mode (systemd on Linux, launchd on macOS, autostart on Windows), first-run setup, Playwright, user guide, NF1, NF6 |
| M10 | F3.3 (goal from ticket), F23.1-F23.6 (Jira Cloud connect, Jira tickets page, start/link task, ticket chip, write back, cache + offline) |
| M11 | F7.5 (evidence, See it work), F24.1-F24.7 (browser on demand, `[browser]` settings, dev server per task, Live test, `e2e` checks, saved logins, allowed hosts). Uses F6.7 (ports, M7). |
| M12 | F25.1 (live browser), F25.2 (preview window, no IPC), F25.3 (agent drives the preview window, spike-gated per OS) |

### Data (SQLite tables, TDD section 5)

| Milestone | Tables / columns added |
|---|---|
| M1 | `projects`, `tasks`, `briefs`, `research_items`, `runs` (empty, schema only), `events` (+ `project_id`), `settings` |
| M2 | Uses `runs` fully. No new tables. (Docs are files; plan docs live in the data folder.) |
| M4 | `check_results`, `proof_cards` |
| M4 | + `check_results.proof_card_id`, extra `proof_cards` columns (status, coverage state, warnings; coverage items get `by: agent/user`) |
| M5 | `change_stories` (+ `commit_draft`), `review_comments`, `review_findings`, `file_marks` (looked-at marks); + `tasks.pr_url`, `tasks.shipped_sha` |
| M6 | `playbooks`, `memory_updates` (+ extra columns); + `research_items.run_id` |
| M7 | `race_lanes`; + `runs.race_lane_id`, `tasks.race_id`, `tasks.port` |
| M8 | `checkpoints` (index over git refs); + `runs.permission_profile`, `runs.sandboxed`, `runs.cost_estimated`. Budgets live in `settings`. |
| M10 | `tickets` (cache), `ticket_views` (what each view returned, for offline), `ticket_actions`; + `tasks.ticket_key` (nullable, partial unique index per project; `tasks.ticket_url` already exists) |
| M11 | `saved_logins`; + `check_results.kind`, `check_results.artifacts`, `tasks.browser_hosts_ok`. Evidence files and the `storageState` files live in the data folder, not in the DB. |
| M12 | None |

One Alembic migration per milestone that adds tables.

### API (TDD section 9)

| Milestone | Endpoints added |
|---|---|
| M1 | `/health`, `/projects*`, `/projects/{id}/tasks`, `/tasks/{id}`, `/tasks/{id}/stage`, `/tasks/{id}/brief` (GET/PUT), `/tasks/{id}/research`, `/research/{id}`, WebSocket `/ws` |
| M2 | `/tasks/{id}/runs`, `/runs/{id}`, `/runs/{id}/events`, `/runs/{id}/input`, `/runs/{id}/stop`, `/runs/{id}/resume`, `/tasks/{id}/context-pack`, `/tasks/{id}/workspace`, `/tasks/{id}/docs`, `/tasks/{id}/docs/content` |
| M3 | `/settings`, `/tasks` (all projects, with status counts), `/projects/{id}/files` (+ `PUT` tiny edit), `/projects/{id}/changes`, `/projects/{id}/changes/diff`, `/projects/{id}/search`; WebSocket topic `board:all` |
| M4 | `/tasks/{id}/checks`, `/tasks/{id}/proof` (+ `verdict`), `/projects/{id}/checks` |
| M5 | `/tasks/{id}/review*`, `/tasks/{id}/ship`, `/tasks/{id}/workspace/sync`, `/tasks/{id}/files/changes`, `/tasks/{id}/files/why`, `/tasks/{id}/files/looked-at` |
| M6 | `/tasks/{id}/brief/draft`, `/tasks/{id}/memory-updates`, `/playbooks` |
| M7 | Race endpoints, `/runs/active?project_id=` (no id = all projects; see M7 TDD) |
| M8 | `/tasks/{id}/checkpoints`, `/tasks/{id}/checkpoints/{n}/rewind`, `/tasks/{id}/safety`, `/safety/check`, `/safety/scrub`, `/cost` |
| M10 | `/jira/sites*`, `/projects/{id}/tickets*`, `/tasks/{id}/ticket`, `/tasks/{id}/ticket-actions`, `/ticket-actions/{id}/send`, `/ticket-actions/{id}/skip` |
| M11 | `/browser`, `/browser/kit`, `/projects/{id}/browser`, `/projects/{id}/logins*`, `/tasks/{id}/devserver`, `/tasks/{id}/browser/hosts`, `/tasks/{id}/evidence*`, `/browser-mcp/{session_id}` (agent MCP endpoint) |
| M12 | `/tasks/{id}/preview`, `/tasks/{id}/preview/agent`; WebSocket topic `screencast:<task_id>` |

### Events (TDD section 6.2)

| Milestone | Event groups added |
|---|---|
| M1 | `task.*`, `brief.*`, `research.*` |
| M2 | `run.*`, `agent.*`, `terminal.output`, `workspace.created`, `workspace.checkpoint`, `doc.saved` (new) |
| M4 | `check.*`, `proof.ready`, `proof.coverage_confirmed` |
| M5 | `review.*` (incl. `review.looked_at`, `review.commit_drafted`), `ship.*` (incl. `ship.failed`), `workspace.removed`, `workspace.synced` |
| M6 | `memory.*` (incl. `memory.update_decided`, `memory.file_saved`) |
| M7 | `race.*` (`race.started`, `race.ready`, `race.winner_picked`, `race.cancelled`) |
| M8 | `workspace.rewound`, `safety.alert`, `cost.budget_exceeded` |
| M10 | `ticket.*` (`ticket.synced`, `ticket.imported`, `ticket.linked`, `ticket.action_proposed`, `ticket.action_sent`, `ticket.action_failed`, `ticket.action_skipped`) |
| M11 | `browser.*` (`browser.started`, `browser.step`, `browser.screenshot`, `browser.finished`, `browser.host_blocked`, `browser.host_allowed`, `browser.kit_installed`, `browser.kit_removed`), `login.*` (`login.saved`, `login.expired`, `login.removed`), `devserver.*` (`devserver.started`, `devserver.failed`, `devserver.stopped`) |
| M12 | `preview.*` (`preview.opened`, `preview.closed`, `preview.agent_attached`). Screencast frames are a stream, not events. |

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
4. **Side by side (Race Mode) needs two worktrees per task.** Solved in M7 with a small `race_lanes` table.

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
| 10 | M9 | Background mode per OS (systemd `KillMode=mixed` on Linux, launchd on macOS, autostart on Windows): runs stop with the daemon and are resumed later | TDD 16 Q5 |
| 11 | M2 | Plan docs are saved in the data folder, not the worktree (a plan run never changes a worktree file) | TDD 10 (files on disk) |
| 12 | M10 | Jira Cloud only; write back needs my OK by default, and a waiting write back shows as Needs you | FSD F3.3, F23 |
| 13 | M3 | The 4 statuses come from one pure function in the daemon (`core/status.py`). Later milestones add Needs-you facts (conflict, side by side pick, Jira write back) through its `waiting_on_user` flag, not new table rows | TDD 7 (UI only) |
| 14 | M5 | Ship has no dialog: one click uses drafted default text; the copy of the repo is cleaned up after 7 days | TDD 8.4 |
| 15 | M2 | Windows support in the daemon: ConPTY (`pywinpty`), `platformdirs`, `psutil` for process control | TECH_STACK |
| 16 | M8 | No OS sandbox on Windows in v1, so "Full access" is not offered there; macOS uses `sandbox-exec` | TDD 4.9 |
| 17 | M9 | The daemon ships as a Tauri sidecar binary (PyInstaller, Nuitka as plan B); the app starts it | TECH_STACK, TDD 16 |
| 18 | M11 | The browser and Playwright MCP run with the daemon; the agent reaches them through a Saarthi MCP endpoint (`RunRequest.mcp_servers`), so the saved login is never visible inside the agent's sandbox | TDD 4.4, 4.9, 4.15; ADR-003 |
| 19 | M11 | `[browser]` in `project.toml` is read only in Saarthi (Settings shows it and opens the file); one saved login per project (`[browser] login`) | FSD F24.2, F24.6 |
| 20 | M11 | Expired login and a blocked host make the task Needs you, through `waiting_on_user` | TDD 7 (UI only) |
| 21 | M12 | The preview window has no capability at all; the driver may reach only the preview window (own WebView2 environment on Windows, preview-only process on Linux) | TDD 4.16 |

---

## Effort (from the TDDs)

| M0 | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 | M11 | M12 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ~11 h | ~20 h | ~23.5 h | ~37.5 h | ~14.5 h | ~25 h | ~21 h | ~15 h | ~21.5 h | ~25 h | ~18 h | ~21 h | ~15.5 h | ~268.5 h |

The Simple UI and 3-OS work added ~25 h (was ~207 h): many projects, statuses and Files in M3; the verdict in M4; why notes and looked-at marks in M5; Gemini in M7; per-OS sandbox in M8; per-OS packaging in M9; Windows base in M0/M2.
M8 and M9 are over the MILESTONES.md plan (15 h and 10 h). Their FSDs list what to cut.
Browser testing adds ~36.5 h: M11 ~21 h (+~2 h if M7's ports are not built yet), M12 ~15.5 h (~12.5 h if the spike is no-go on every OS). In weeks: M11 about 2, M12 about 1.5; the plan total is about 23.5 weeks.

---

## How to write a new milestone doc

- **Header block:** document type, milestone, product, status, version, date, effort, written for, language style, related documents.
- **Header** also has an `**Updated:**` line for big changes and a `**Screens:**` line with the prototype view ids.
- **FSD** = what and why, for a reader who does not code. Every feature has: What, Why, Example (a real command or a real click), Rules, Acceptance criteria.
- **TDD** = how, for a developer. Every decision says **why**. Lists files, tables, events, endpoints, CLI, config keys, tests, risks, effort.
- Simple English. Short sentences. No jargon without a one-line explanation.
- Do not build "Later" features early (CLAUDE.md rule 10).

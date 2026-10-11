# Task Docs + Jira tickets - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the approved spec (`core_docs/design/2026-10-12-task-docs-and-jira-design.md`) into every product doc and into the Wheel design screens.

**Architecture:** This is a docs + design change. No daemon or desktop code exists yet. Product docs are markdown in `core_docs/`. Screens are HTML fragments in `core_docs/design/milestones/_src/screens/<milestone>/`, built by `_src/build.py`; the clickable prototype is built by `_src/proto.py`.

**Tech Stack:** Markdown, HTML/CSS fragments, Python 3 build scripts, pytest for the build tools, Playwright (via `shoot.py`) for screenshots.

**The spec is the source of truth.** Every task below must read it first. Names, F-numbers, endpoints, events, config keys and the sample world must match it word for word.

**Writing rules (CLAUDE.md rule 10, `milestones/README.md` "How to write a new milestone doc"):** simple English, short sentences, points and sub-points. Do not build "Later" features early.

**Commits:** workers do not commit. The controller commits after each task review (several workers share one working tree).

---

## File map

| Task | Files |
|---|---|
| 1 Core docs | `core_docs/FUNCTIONAL_SPECIFICATIONS.md`, `core_docs/TDD-tech-design-doc.md`, `core_docs/MILESTONES.md`, `core_docs/README.md`, `core_docs/QUICK_REFERENCE.md`, `core_docs/TECH_STACK.md` |
| 2 Milestone docs M2/M3/M6 | `core_docs/milestones/M2_agent_runs_worktrees/{FSD,TDD}_*.md`, `M3_desktop_ui_v1/{FSD,TDD}_*.md`, `M6_research_memory_playbooks/{FSD,TDD}_*.md`, `core_docs/milestones/README.md` |
| 3 M10 docs | Create `core_docs/milestones/M10_jira_tickets/FSD_M10_jira_tickets.md`, `TDD_M10_jira_tickets.md` |
| 4 Build tooling | `core_docs/design/milestones/_src/build.py`, `_src/tests/test_build.py`, `_src/SCREEN_GUIDE.md`, `core_docs/design/milestones/README.md`, `core_docs/design/2026-10-11-wheel-ui-design.md` |
| 5 Docs screens | `_src/screens/M2_agent_runs_worktrees/05_plan_docs_cli.html` (new), `_src/screens/M3_desktop_ui_v1/12_task_room_docs.html` (new), tab strips in every Task Room fragment M3-M9, `_src/screens/M6_research_memory_playbooks/05_context_pack_preview.html` |
| 6 M10 screens | `_src/screens/M10_jira_tickets/01..07_*.html` (new), optional `_shared.css` |
| 7 Prototype + build | `_src/proto.py`, `_src/tests/test_proto.py`, generated outputs, `Saarthi Prototype.html` |
| 8 Final review | read-only cross check, fixes |

Order: 1, 2, 3, 4, 5 can run in parallel (disjoint files). 6 needs 4. 7 needs 5 and 6. 8 is last.

---

### Task 1: Core product docs

**Files:** Modify the six core docs listed in the file map.

- [ ] **Step 1:** Read the spec, then the current FSD, TDD, MILESTONES.
- [ ] **Step 2: FSD.**
  - Section 3 glossary: add **Doc** ("a markdown text about a task: a plan, a changed .md file, a pinned project doc, a research finding") and **Ticket** ("a Jira issue linked to a task").
  - Section 4 screens: add "Docs (tab inside Task Room)" and "Tickets (per project)".
  - F3.3 "Brief from ticket": change to **(Must, M10)**, text: from a Jira ticket (Cloud); GitHub issues stay Later.
  - Add **F22 Task Docs** with F22.1-F22.6 exactly as spec 3.1 (priority + one to four sub-points each from spec 3.2-3.6).
  - Add **F23 Tickets (Jira)** with F23.1-F23.9 exactly as spec 4.1, sub-points from spec 4.2-4.6 (no REST details in the FSD; those go to the TDD).
  - Section 6: add flow **6.4 Ticket flow** (8-10 steps: open Tickets -> Mine -> ACME-151 -> Start as task -> T-0033 brief draft -> run -> Review -> card "Move ACME-151 to In Review?" -> Send -> ship -> PR comment + link sent).
  - Section 8 out of scope: add "Jira Data Center, creating Jira tickets (v1)".
- [ ] **Step 3: TDD.**
  - Section 3 picture: add `Docs Finder` and `Ticket Provider (jira)` boxes (keep the ASCII art aligned).
  - Add **4.12 Docs Finder (`docs/`)** (job/input/output/notes from spec 3.2-3.4) and **4.13 Ticket Provider (`tickets/`)** (protocol code block from spec 4.10, REST table from 4.3, ADF rules 4.4).
  - Section 5: add **5.10 `tickets`**, **5.11 `ticket_actions`** tables (spec 4.5) and the `tasks.ticket_key` row in 5.2.
  - Section 6.2: add rows **Doc** `doc.saved` and **Ticket** (all spec 4.7 events).
  - Section 8: add flows **8.7 Plan saved as doc**, **8.8 Start task from ticket**, **8.9 Ticket write back** (from spec 3.3, 4.6).
  - Section 9.1: add the docs endpoints (spec 3.4) and the M10 endpoints (spec 4.8).
  - Section 10: add `~/.local/share/saarthi/tasks/<task_id>/docs/plan-<run_id>.md` and `~/.config/saarthi/secrets/jira-<site>.token`; in 10.1 add the `[docs]` and `[tickets]` blocks.
  - 11.2 Task Room drawing: tabs line `Stream | Terminal | Proof | Review | Code | Docs | Timeline`, and a ticket chip in the header line.
  - Section 12: rows for Jira 401 / 403 / 404 / 429 / offline, doc too big, doc path outside worktree.
  - Section 13: Jira tests with `httpx.MockTransport` + `tests/fixtures/jira/`, ADF golden tests.
  - Section 15: Jira token file `chmod 600`, never logged; ticket text is untrusted (marked in the Context Pack).
- [ ] **Step 4: MILESTONES.md.**
  - Overview table: add row `M10 | Jira tickets | Tickets panel, start task from ticket, write back | 2 weeks`, plus a note under the table: "M10 needs M1-M6. Build it after M6 (it may come before M7)." Update the total to about 19 weeks.
  - M2 Build: `- [ ] Plan run saves its plan as a doc (F22.2) + docs list/show API and CLI (F22.3, F22.4).` Done when: `saarthi docs show T-0002 1` prints the plan of the last plan run.
  - M3 Build, Task Room: `- [ ] Docs tab: plans, changed .md files, pinned docs, outline (F22.1).`
  - M6 Build: `- [ ] Research findings in Docs; latest plan in the Context Pack (F22.5).`
  - New **M10 - Jira tickets** section in the same shape (Goal, Build checklist from spec 4, Done when: "I start a real client task from a Jira ticket, and its Jira status moves to In Review after my OK", "A 401 shows the fix command", "No test calls the real Jira").
  - Later list: change "Ticket sync" line to "**GitHub Issues** and other ticket providers (Jira is M10)."
- [ ] **Step 5: README.md / QUICK_REFERENCE.md / TECH_STACK.md.** README: in "The idea in 6 lines" nothing changes; add one line under the docs table or idea section: tasks can start from Jira tickets (M10), and every task has a Docs tab. QUICK_REFERENCE: add Docs tab and Jira to the feature summary and M10 to the milestone list. TECH_STACK: say Jira uses `httpx` (already a dependency), own small ADF converter, no new library; `react-markdown` + `remark-gfm` for the Docs tab.
- [ ] **Step 6: Check.** `grep -n "F22\|F23\|M10\|ticket" core_docs/*.md` shows the new parts; no "TBD"/"TODO".

### Task 2: Milestone docs M2, M3, M6 + ownership map

**Files:** the six milestone docs + `core_docs/milestones/README.md`.

- [ ] **Step 1:** Read the spec section 3 and each file. Keep each file's structure (numbered sections, What / Why / Example / Rules / Acceptance criteria in FSDs; decisions, files, tables, events, endpoints, CLI, tests, effort in TDDs).
- [ ] **Step 2: M2 FSD.** Add F22.2, F22.3, F22.4 to "covers"; add a feature section "Plan saved as a doc + docs list" with a real CLI example (`saarthi run T-0012 --agent claude --mode plan` ending with `Plan saved: plan-01JC5...md`, then `saarthi docs list T-0012` table with 1 plan, 1 changed file, 4 pinned, then `saarthi docs show T-0012 1`). Rules + acceptance from spec 3.2-3.4 (failed run saves nothing; `..` refused; >1 MB shows too big; `.saarthi/context/` never listed). Add to the done-when list.
- [ ] **Step 3: M2 TDD.** New decision "Plan docs live in the data folder" (why: plan runs never touch the worktree). Files: `docs/finder.py`, `docs/reader.py`, `docs/plans.py`, `cli/docs.py`. Config: `DOCS_MAX_LIST`, `DOCS_MAX_BYTES`, `DEFAULT_PINNED_DOCS`. Event `doc.saved` **(new)**. Endpoints `/tasks/{id}/docs`, `/tasks/{id}/docs/content`. Tests: `test_docs_finder.py` (kinds, order, dedupe pinned+changed, context excluded, path escape refused), `test_plan_doc.py` (FakeAdapter plan run done -> file + event; failed -> nothing). Effort +1.5 h.
- [ ] **Step 4: M3 FSD + TDD.** FSD: F22.1 in covers; Task Room tab list gets Docs; feature section "Docs tab" (spec 3.5) with a click example. TDD: `screens/TaskRoom/DocsTab/` (`DocsList`, `DocView`, `DocOutline`); deps `react-markdown`, `remark-gfm`; refresh on `doc.saved` and `agent.file_changed` for `*.md`; tests `DocsTab.test.tsx`; effort +2.5 h.
- [ ] **Step 5: M6 FSD + TDD.** F22.5 in covers; research items in Docs as kind `research`; Context Pack "Plan" section with `CONTEXT_PLAN_MAX_CHARS = 15000`; update the Context Pack preview example to include `plan   plan-01JC5...md   full   6,120`. TDD tests: pack includes latest plan for build/fix, not for research; cut note when over limit. Effort +1 h.
- [ ] **Step 6: milestones/README.md.** Folder map row M10. Ownership: M2 gets F22.2-F22.4, M3 F22.1, M6 F22.5, M10 F3.3, F23.1-F23.6. Data: M10 `tickets`, `ticket_actions`, `tasks.ticket_key`. API: M2 docs endpoints; M10 `/jira/*`, `/projects/{id}/tickets*`, `/tasks/{id}/ticket`, `/tasks/{id}/ticket-actions`, `/ticket-actions/{id}/*`. Events: M2 `doc.saved`; M10 `ticket.*`. Decisions table: add "M10 | Jira Cloud only, write back needs OK by default | FSD F3.3, F23". Effort table: M2 ~21.5 h, M3 ~32.5 h, M6 ~21 h, add M10 ~18 h, new total.
- [ ] **Step 7: Check.** Each changed file still reads top to bottom; numbers in effort tables add up.

### Task 3: M10 FSD + TDD (new)

**Files:** Create `core_docs/milestones/M10_jira_tickets/FSD_M10_jira_tickets.md` and `TDD_M10_jira_tickets.md`.

- [ ] **Step 1:** Read the spec section 4, `milestones/README.md` ("How to write a new milestone doc"), and `M6_research_memory_playbooks/FSD_*.md` + `TDD_*.md` as the format model.
- [ ] **Step 2: FSD** (about 300-380 lines). Header block (type, milestone "M10 (after M6; see MILESTONES.md)", effort 18 h, related docs). Sections: what it covers (F3.3, F23.1-F23.6), goal in plain words, where it sits (needs M1-M6), glossary (Jira site, API token, JQL, view, ticket, write back, action), one feature section per F-number with What / Why / Example (real CLI output and real clicks in the acme-billing world, spec 5.5) / Rules / Acceptance criteria, then "Done when", "Not in M10" (F23.7-F23.9, polling, keyring), open questions (for example: should `shipped` map to Done by default?).
- [ ] **Step 3: TDD** (about 350-450 lines). Header. Decisions with why (D5-D10 of the spec, plus: POST search/jql, own ADF converter, one pending transition per task, untrusted ticket text marker, branch name with the key). Files (spec 4.10 + `api/tickets.py`, `cli/jira.py`, `cli/tickets.py`, migration `00XX_m10_tickets.py`). Config keys (`TICKETS_STALE_SECONDS=300`, `TICKETS_MAX_SYNC=200`, `TICKETS_PAGE_SIZE=50`, `TICKETS_RETRY_MAX=3`, `TICKETS_COMMENTS_MAX=20`, `JIRA_TIMEOUT_SEC=20`). Tables, events, endpoints (with request/response shapes and error codes), CLI table, the three flows step by step, error table, tests table (file -> what it proves), fixtures list, risks (endpoint quirks: no total, GET nextPageToken=null 400; scoped tokens; rate limits from 2026), effort breakdown (spec 4.12).
- [ ] **Step 4: Check.** Every F-number, event, endpoint and config key in the spec section 4 appears in the TDD; no "Later" feature is built.

### Task 4: Build tooling for M10 and the Tickets link

**Files:** `_src/build.py`, `_src/tests/test_build.py`, `_src/SCREEN_GUIDE.md`, `design/milestones/README.md`, `design/2026-10-11-wheel-ui-design.md`.

- [ ] **Step 1: Failing tests** in `_src/tests/test_build.py` (follow the existing test style there):
  - `M10_jira_tickets` is in `build.MILESTONES` with code `"M10"`.
  - A topbar built with `{"nav": "tickets"}` has `<a class="on">Tickets</a>`; with `{"tickets": true, "nav": "board"}` has `<a>Tickets</a>`; with `{"nav": "board"}` has no "Tickets".
- [ ] **Step 2:** Run `python3 -m pytest core_docs/design/milestones/_src/tests -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** in `build.py`: add `"M10_jira_tickets": ("M10", "Jira tickets")` to `MILESTONES`; in the top bar function, build the link list as `NAV + [("tickets", "Tickets")]` when `meta.get("tickets") or nav == "tickets"`; add `tickets` to the docstring (`nav` values and a `tickets` key line).
- [ ] **Step 4:** Run the tests again. Expected: all PASS.
- [ ] **Step 5: Docs.** SCREEN_GUIDE: `nav` list adds `tickets`; new key `tickets` ("true adds the Tickets link; only M10 screens"); sample world line adds the Jira tickets (spec 5.5); Task Room tab order `Stream · Terminal · Proof · Review · Code · Docs · Timeline`. `design/milestones/README.md`: folder list adds M10. Wheel spec: section 5 top bar mentions Tickets (M10); 6.3 Task Room tabs: "M3: Stream, Terminal, Code, Docs, Timeline"; section 8 table adds rows "M2: plan docs in the CLI", "M3: Docs tab", "M10: Tickets page, start-from-ticket dialog, ticket chip, write-back card, Jira settings"; a "Related" line pointing to `2026-10-12-task-docs-and-jira-design.md`.

### Task 5: Docs screens and the Docs tab everywhere

**Files:** see file map. Read `_src/SCREEN_GUIDE.md` first and copy patterns from `M3_desktop_ui_v1/03_task_room_stream.html` and `M6_research_memory_playbooks/06_memory_screen.html` (markdown view `.md`, tree `.tf`).

- [ ] **Step 1: Tab strips.** In every fragment under `_src/screens/M3_*` ... `M9_*` that has `<div class="tabs">`, add `<span class="tab">Docs <span class="n">N</span></span>` right before the Timeline tab (or at the end if there is no Timeline tab). N = 6 in M3 screens (1 plan, 1 changed, 4 pinned), 8 from M6 on (adds 2 research). Find them with `grep -l 'class="tabs"' core_docs/design/milestones/_src/screens/*/*.html`. Keep the active tab as it is.
- [ ] **Step 2: M3 `12_task_room_docs.html`.** Copy the header/side of `03_task_room_stream.html` (same task T-0012, same agents). Docs tab active. Layout spec 3.5: left 260px groups (Plans: "Plan - Add password reset API" `plan-01JC5Q.md` 6 KB; Changed in this task: `core_docs/plans/T-0012-reset-api.md` badge `added`; Pinned: CLAUDE.md, AGENTS.md, FUNCTIONAL_SPECIFICATIONS.md, TDD-tech-design-doc.md), center the plan rendered (headings: Goal, Steps 1-5 with real file names like `app/api/auth.py`, `app/models/reset_token.py`, Risks, Tests), header with path, "6,120 chars · 10:41", Open in editor, Copy path; right 220px outline. Front matter note ends with `F22.1`.
- [ ] **Step 3: M2 `05_plan_docs_cli.html`** (bare, copy the terminal look of `M2_agent_runs_worktrees/01_run_and_watch.html`). Show spec 5.2 row commands with real output. Note ends with `F22.2, F22.3, F22.4`.
- [ ] **Step 4: M6 `05_context_pack_preview.html`.** Add the `plan` line (spec 3.6) in the pack list, keeping totals right.
- [ ] **Step 5: Build + look.** `python3 core_docs/design/milestones/_src/build.py M2_agent_runs_worktrees`, then the same for M3 ... M9 one by one (the script takes one folder). Then `python3 core_docs/design/milestones/_src/shoot.py /tmp/<scratch>/shots M2_agent_runs_worktrees M3_desktop_ui_v1 M6_research_memory_playbooks` and look at every new or changed PNG: no overflow, no cut text, tab strips fit at 1440 wide.

### Task 6: M10 screens

**Files:** create `_src/screens/M10_jira_tickets/01_tickets_panel.html` ... `07_tickets_offline.html` (spec 5.2). Needs Task 4.

- [ ] **Step 1:** Read SCREEN_GUIDE, spec 4 and 5, and the reference screens it names. Every `app` screen sets `"tickets": true` (or `"nav": "tickets"` on the Tickets page). Task 03 and 04 are Task Room screens: copy `M5_review_ship/01_change_story.html` frame (M10 comes after M6, so tabs include Proof, Review, Docs, Research as in M6+ screens), and show the Trust ring where M4+ screens show it.
- [ ] **Step 2: Write the 7 fragments** with the sample world of spec 5.5. Status pills use tokens only (`--info` To Do, `--road` In Progress, `--ok` Done). Linked tasks show as beads with the task number. The write-back card uses the `.ask-card` pattern but must not count in the Needs You pill. 05 is a Settings screen (`nav: settings`), copy `M3_desktop_ui_v1/11_settings_health.html`. 06 is bare CLI. 07 shows both the offline banner and a 401 error with `saarthi jira login --site acme.atlassian.net`.
- [ ] **Step 3: Build + look.** `python3 core_docs/design/milestones/_src/build.py M10_jira_tickets`, `shoot.py` for M10, check each PNG.

### Task 7: Prototype + full build

**Files:** `_src/proto.py`, `_src/tests/test_proto.py`.

- [ ] **Step 1: Failing test** in `test_proto.py`: views `room-docs`, `tickets`, `ticket-start`, `room-ticket`, `ticket-confirm` exist; a `.tab` rule "Docs" -> `room-docs`; a `.navs a` rule "Tickets" -> `tickets`. Run, expect FAIL.
- [ ] **Step 2: Implement** (spec 5.4): add the views to `VIEWS` (add `M10 = "M10_jira_tickets"` next to the other folder names), `room-docs`, `room-ticket`, `ticket-confirm` into `ROOM_VIEWS`, `ticket-start` into `DIALOG_VIEWS`; GLOBAL_RULES `Rule(".tab", "room-docs", "Docs")`, `Rule(".navs a", "tickets", "Tickets")`; CLICKS for `tickets` ("Start as task" -> `ticket-start`), `ticket-start` ("Start" -> `room-ticket`), `room-ticket` (the write-back card or a "Move to Review" step -> `ticket-confirm`). Keep the main flow and `?selftest` working.
- [ ] **Step 3:** Tests PASS. Full build: `python3 core_docs/design/milestones/_src/build.py && python3 core_docs/design/milestones/_src/proto.py && python3 -m pytest core_docs/design/milestones/_src/tests -q`. Open the prototype with `?selftest` via `shoot.py` or a headless browser and confirm PASS.

### Task 8: Final cross check

- [ ] Every spec section 6 row is done. F-numbers, events, endpoints, config keys and sample names are the same in FSD, TDD, milestone docs, M10 docs and screens (`grep -rn "ACME-1\|ticket\.\|doc\.saved\|F22\|F23" core_docs`).
- [ ] No screen before M10 shows Tickets; no screen before M3 shows the Docs tab; no Trust ring before M4.
- [ ] Build, tests and prototype selftest pass. Commit.

# Task Docs + Jira tickets (spec)

**Date:** 2026-10-12
**Status:** Approved in brainstorming (owner said "start implementation")
**Changes:** FSD (new F22, F23; F3.3 becomes Must), core TDD, MILESTONES.md, milestone docs M2, M3, M6, a new milestone **M10**, the Wheel design screens.
**Look:** The Wheel (`2026-10-11-wheel-ui-design.md`). Nothing in the look changes. Only new screens and one new tab.

---

## 1. Why

Two gaps in the ADE today:

1. **No place to read a task's documents.** A `plan` run is read-only, so its plan only lives in the run summary. Specs, research notes, FSD/TDD files that an agent writes on the task branch can only be read in an editor. The Memory screen shows `core_docs/` in the **main checkout**, not the task branch.
2. **No ticket source.** Most client work starts as a Jira ticket. Today I copy the ticket text into a brief by hand, and I move the Jira status by hand.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | Task docs live in a new **Docs** tab in the Task Room. The Memory screen does not change. |
| D2 | Docs are **files**, found by the daemon. No new table. Git and the data folder are the source of truth. |
| D3 | A `plan` run saves its full final message as a markdown file in the **data folder**, not the worktree (M2 rule: a plan run never changes a worktree file). |
| D4 | Docs are **read-only** in Saarthi. "Open in editor" for changes. Editing in Saarthi is Later. |
| D5 | Jira is a **new milestone M10** ("Jira tickets"). It needs M1-M6. Build it after M6 (it may come before M7). M7-M9 keep their numbers. |
| D6 | Jira **Cloud** only (`*.atlassian.net`, email + API token, REST API v3). Data Center is Later. |
| D7 | Jira scope: **read + write back**. Write back = status transition, a comment with the PR link, a remote link. Every write needs my OK by default. Creating Jira tickets from Saarthi is Later. |
| D8 | Jira code sits behind a `TicketProvider` interface in `daemon/src/saarthi/tickets/`, like `AgentAdapter`. Only `JiraCloudProvider` in v1. `FakeTicketProvider` + recorded JSON for tests. GitHub Issues is Later, through the same interface. |
| D9 | The Jira token is stored outside the repo: `~/.config/saarthi/secrets/jira-<site>.token`, `chmod 600`. Same method as the API token. System keyring is Later. |
| D10 | No background polling. Tickets refresh by hand, or when the panel opens and the cache is older than `TICKETS_STALE_SECONDS` (300). |

## 3. Feature: Task Docs (FSD F22)

### 3.1 F-numbers

| F | Name | Priority | Milestone |
|---|---|---|---|
| F22.1 | Docs tab in the Task Room (list + markdown view + outline) | Must | M3 |
| F22.2 | Plan run saved as a doc | Must | M2 |
| F22.3 | Markdown files changed on the task branch are listed | Must | M2 (CLI + API), M3 (UI) |
| F22.4 | Pinned project docs (FSD, TDD, CLAUDE.md...) are listed, read from the task worktree | Must | M2 (CLI + API), M3 (UI) |
| F22.5 | Research findings show in Docs; the latest plan goes into the Context Pack of the next build / fix run | Must | M6 |
| F22.6 | Edit docs inside Saarthi, render Mermaid diagrams | Later | - |

### 3.2 What a "doc" is

One doc = one markdown text the user may want to read for this task. Four kinds:

| Kind | Where the file is | `doc_id` | Example |
|---|---|---|---|
| `plan` | `~/.local/share/saarthi/tasks/<task_id>/docs/plan-<run_id>.md` | `plan:<run_id>` | the plan from a `plan` run |
| `changed` | task worktree, a `*.md` file added or changed against the base branch (committed or not) | `wt:<repo-relative path>` | `core_docs/plans/T-0012-reset-api.md` written by the agent |
| `pinned` | task worktree (main checkout if the worktree does not exist yet) | `pin:<repo-relative path>` | `core_docs/FUNCTIONAL_SPECIFICATIONS.md` |
| `research` (M6) | `research_items` row of kind `agent_finding` or `note` | `research:<item_id>` | "Research this" finding |

Rules:
- A file that is both `pinned` and `changed` shows once, as `changed`, with a "pinned" mark.
- Files under `.saarthi/context/` are never listed (the Context Pack has its own preview).
- Max 200 docs per task (`DOCS_MAX_LIST`). Max 1 MB per doc (`DOCS_MAX_BYTES`). A bigger doc shows "Too big to show here" + Open in editor.
- Paths are checked: must stay inside the worktree / data folder; `..` and symlinks out are refused.
- Pinned list comes from `project.toml`:
  ```toml
  [docs]
  pinned = ["CLAUDE.md", "AGENTS.md", "core_docs/FUNCTIONAL_SPECIFICATIONS.md", "core_docs/TDD-tech-design-doc.md"]
  ```
  Default `DEFAULT_PINNED_DOCS` in `config.py` is the same list. Missing files are skipped quietly.

### 3.3 Plan saved as a doc (M2)
- When a `plan` run ends with status `done`, the daemon writes the full text of the agent's final answer to the plan file, with a small header:
  ```markdown
  <!-- saarthi: task T-0012 · run 01JC5... · claude · plan · 2026-10-12 10:41 -->
  # Plan - Add password reset API
  ...agent text...
  ```
- Event **`doc.saved`** (new) `{doc_id, kind: "plan", path, run_id, chars}`.
- A failed or stopped plan run saves nothing.

### 3.4 API + CLI (M2)
| Method | Path | Returns |
|---|---|---|
| GET | `/tasks/{id}/docs` | `[{doc_id, kind, title, path, source: "data"\|"worktree"\|"main", size, updated_at, change: "added"\|"modified"\|null, pinned: bool}]` |
| GET | `/tasks/{id}/docs/content?doc=<doc_id>` | `{doc_id, markdown, size, updated_at, too_big}` |

- `title` = the first `# ` heading, else the file name.
- Order: plans (newest first), then changed (by path), then pinned (in config order), then research (M6).
- CLI: `saarthi docs list T-0012 [--json]`, `saarthi docs show T-0012 <doc_id or path or number from the list>` (prints markdown with Rich), `saarthi docs open T-0012 <doc>` (opens `$EDITOR`).
- Code: `daemon/src/saarthi/docs/` (`finder.py` lists docs, `reader.py` safe read, `plans.py` writes plan docs). `docs/` is Saarthi's own module, not the repo's docs folder.
- Changed files: `git diff --name-status <base>...HEAD -- '*.md'` + `git status --porcelain -- '*.md'` in the worktree (list args, no shell).

### 3.5 Docs tab (M3)
- Tab strip: `Stream · Terminal · Code · Docs · Timeline` (Proof and Review join in M4 / M5 as before; Docs stays before Timeline). The tab shows a count.
- **Left (260px):** groups "Plans", "Changed in this task", "Pinned". Each row: title, small path, size, a badge `added` / `modified` for changed files. Empty group: one quiet line ("No plan yet. Start a plan run.").
- **Center:** markdown view (react-markdown + remark-gfm; code blocks with the same mono font; Mermaid shows as a code block). Header: path, size, updated time, badge, **Open in editor**, **Copy path**.
- **Right (220px):** outline (headings, click to jump).
- Live: on `doc.saved`, and on `agent.file_changed` for a `*.md` path, the list refreshes.
- No new tables. No new events in M3.

### 3.6 M6 additions
- Research items of kind `agent_finding` and `note` join the Docs list as kind `research` ("Research" group).
- Context Pack v1: for `build` and `fix` runs, the **latest plan doc** is inlined in a "Plan" section, max `CONTEXT_PLAN_MAX_CHARS` (15,000; cut with a note). The Context Pack preview shows the line `plan   plan-01JC5...md   full   6,120`.

## 4. Feature: Jira tickets (FSD F23, milestone M10)

### 4.1 F-numbers

| F | Name | Priority | Milestone |
|---|---|---|---|
| F3.3 | Brief from ticket (was Later) | Must | M10 |
| F23.1 | Connect Jira Cloud (site, email, API token) + health | Must | M10 |
| F23.2 | Tickets panel per project (Mine / Sprint / saved JQL, search, refresh) | Must | M10 |
| F23.3 | Start a task from a ticket; link an existing task to a ticket | Must | M10 |
| F23.4 | Ticket chip on Task Room header and Board cards | Must | M10 |
| F23.5 | Write back with confirm: transition, PR comment, remote link | Must | M10 |
| F23.6 | Cache + offline view | Must | M10 |
| F23.7 | GitHub Issues and other providers | Later | - |
| F23.8 | Create a Jira ticket from Saarthi; two-way comment sync | Later | - |
| F23.9 | Jira Data Center / Server (PAT, API v2) | Later | - |

### 4.2 Config
Global, per Jira site (`~/.config/saarthi/config.toml`), never in the repo:
```toml
[jira."acme.atlassian.net"]
email = "me@acme.com"
# token: ~/.config/saarthi/secrets/jira-acme.atlassian.net.token (chmod 600)
```
Per project (`<repo>/.saarthi/project.toml`, committed, no secrets):
```toml
[tickets]
provider = "jira"
site = "acme.atlassian.net"
project_key = "ACME"
auto_send = false                 # true = write back without asking

[tickets.views]                   # extra saved JQL views (Mine and Sprint are built in)
"Bugs" = "issuetype = Bug AND statusCategory != Done"

[tickets.on_stage]                # Saarthi stage -> Jira status name ("" = do nothing)
running = "In Progress"
review = "In Review"
shipped = ""                      # PR not merged yet; set "Done" if your team wants it
```
Built-in views (always prefixed with `project = <KEY> AND`, ending `ORDER BY updated DESC`):
- **Mine:** `assignee = currentUser() AND statusCategory != Done`
- **Sprint:** `sprint in openSprints()`

### 4.3 Jira REST calls (Cloud, v3)
| Need | Call |
|---|---|
| Check login | `GET /rest/api/3/myself` |
| List / search | `POST /rest/api/3/search/jql` with `{jql, fields, maxResults: 50, nextPageToken}`. Paging by `nextPageToken` only (no `startAt`, no total). The old `/rest/api/3/search` is removed. Use POST: GET with `nextPageToken=null` gives 400. Stop at `TICKETS_MAX_SYNC` (200). |
| One ticket | `GET /rest/api/3/issue/{key}?fields=summary,status,issuetype,priority,assignee,labels,description,comment,updated` |
| Transitions | `GET /rest/api/3/issue/{key}/transitions`, then `POST` the same path with `{transition: {id}}`. Match `to.name` with the wanted status, ignoring case. |
| Comment | `POST /rest/api/3/issue/{key}/comment` with an ADF body |
| Remote link | `POST /rest/api/3/issue/{key}/remotelink` with `{object: {url, title}}` |

- Auth: HTTP Basic, `email:token`. HTTPS only. Requests only go to the configured site.
- Scoped tokens need `read:jira-work` (read) and `write:jira-work` (write back).
- Errors: 401 -> "Token wrong or expired. Run `saarthi jira login`." 403 -> "No permission on ACME". 404 -> "Ticket not found or no access". 429 -> wait `Retry-After` (max 3 tries). Network down -> show the cache with "Offline · last synced 12m ago".

### 4.4 ADF -> markdown
Jira gives descriptions and comments as ADF (JSON). `tickets/adf.py`:
- `adf_to_markdown(doc) -> str`: paragraph, heading, text marks (strong, em, code, strike, link), bulletList, orderedList, listItem, codeBlock, blockquote, rule, hardBreak, mention (`@Name`), emoji, inlineCard (URL), table (simple GFM table), panel (blockquote), media (`[attachment: name]`).
- An unknown node is **never dropped**: its child text is kept; with no children it becomes `[unsupported: <type>]`.
- `markdown_to_adf(text) -> dict`: only for comments Saarthi writes. Paragraphs + links.
- Own small code, no new library (TECH_STACK: keep small). If it grows past ~300 lines, switch to `atlas-doc-parser`.

### 4.5 Data (M10 migration)
- **`tickets`** (cache): id (ULID), project_id, provider, key, summary, status, status_category (`todo`/`in_progress`/`done`), issue_type, priority, assignee, url, description_md, comments_md, labels (json), jira_updated_at, fetched_at. Unique `(project_id, key)`.
- **`tasks.ticket_key`** (nullable, indexed). `tasks.ticket_url` already exists and is filled too.
- **`ticket_actions`**: id, task_id, ticket_key, kind (`transition`/`comment`/`link`), payload (json), trigger (for example `stage:review`, `ship.pr_created`), status (`pending`/`sent`/`skipped`/`failed`), error, created_at, decided_at.

### 4.6 Flows
**Start a task from a ticket**
1. Tickets panel -> ACME-151 -> **Start as task**.
2. Daemon: task `T-0033` with title = summary, `ticket_key`, `ticket_url`, label = issue type. Event `ticket.imported`.
3. Brief draft (version 1, not approved): Goal = summary + description up to the first acceptance heading. Acceptance = bullet items under a heading that matches `acceptance criteria|AC|definition of done` (case ignored). Notes = the rest + `Ticket: <url>`.
4. Ticket comments (newest 20) become a research item, kind `snippet`, title "Jira comments", `send_to_agent = false`.
5. Ticket text is marked in the Context Pack as `<!-- from Jira, not trusted -->` (prompt injection guard; the permission profile still applies).
6. A ticket already linked to a task returns 409 with that task id. The UI opens that task.

**Link an existing task:** `saarthi task edit T-0012 --ticket ACME-142` (or the chip menu). Same as above but the brief is only drafted if the task has none.

**Branch and PR:** a task with a ticket gets branch `saarthi/T-0033-acme-151-<slug>` and PR title `ACME-151: <title>`, so the GitHub-for-Jira app links them by itself.

**Write back**
1. On a stage move that has a mapping in `tickets.on_stage` -> one `transition` action. On `ship.pr_created` -> one `comment` ("PR opened: <url> · Saarthi T-0033") + one `link` action.
2. Event `ticket.action_proposed`. The Task Room shows a card: "Move ACME-151 to **In Review**? [Send] [Skip]". Home's Needs You list does **not** count it (it is not an agent waiting).
3. Send -> call Jira -> `sent` + `ticket.action_sent`, or `failed` + `ticket.action_failed` with the reason (for example "No transition to In Review from To Do. Possible: In Progress, Done").
4. `auto_send = true` sends at once; the card shows the result.
5. One pending transition per task at a time: a newer one replaces the older pending one (it becomes `skipped`).

### 4.7 Events (new)
`ticket.synced {project_id, view, count}`, `ticket.imported {key, task_id}`, `ticket.linked {key, task_id}`, `ticket.action_proposed {action_id, kind, key, summary}`, `ticket.action_sent {action_id}`, `ticket.action_failed {action_id, error}`, `ticket.action_skipped {action_id}`.

### 4.8 API (M10)
| Method | Path | What |
|---|---|---|
| GET | `/jira/sites` | Connected sites + who I am |
| POST | `/jira/sites` | `{site, email, token}` -> check with `/myself`, save |
| DELETE | `/jira/sites/{site}` | Forget a site (deletes the token file) |
| GET | `/projects/{id}/tickets?view=&q=&refresh=` | List from cache (refresh first if asked or stale) |
| POST | `/projects/{id}/tickets/sync` | `{view?, jql?}` -> refresh now |
| GET | `/projects/{id}/tickets/{key}` | One ticket (fresh) + linked task id |
| POST | `/projects/{id}/tickets/{key}/start` | Make a task -> `201 {task}`; 409 `ticket_linked {task_id}` |
| POST | `/tasks/{id}/ticket` | `{key}` link an existing task |
| GET | `/tasks/{id}/ticket-actions` | List |
| POST | `/ticket-actions/{id}/send` / `/skip` | Decide |

### 4.9 CLI (M10)
```
saarthi jira login --site acme.atlassian.net --email me@acme.com   # asks for the token, hidden
saarthi jira status
saarthi tickets list [--view mine|sprint|<name>] [--jql "..."] [--refresh] [--json]
saarthi tickets show ACME-151
saarthi tickets start ACME-151
saarthi task edit T-0012 --ticket ACME-142
saarthi ticket actions T-0033
saarthi ticket send <action_id> | saarthi ticket skip <action_id>
```

### 4.10 Code layout
```
daemon/src/saarthi/tickets/
├── base.py        # TicketProvider protocol, Ticket, TicketPage, Transition models
├── jira_cloud.py  # JiraCloudProvider (httpx)
├── fake.py        # FakeTicketProvider (replays tests/fixtures/jira/*.json)
├── adf.py         # adf_to_markdown, markdown_to_adf
├── brief.py       # ticket -> brief draft + comments research item
├── sync.py        # cache refresh, stale check
└── actions.py     # propose / send / skip write-back actions
```
```python
class TicketProvider(Protocol):
    name: str                                                      # "jira"
    async def check_ready(self) -> ReadyStatus: ...                # site reachable, token valid, who am I
    async def search(self, jql: str, page_token: str | None) -> TicketPage: ...
    async def get(self, key: str) -> Ticket: ...
    async def transitions(self, key: str) -> list[Transition]: ...
    async def transition(self, key: str, transition_id: str) -> None: ...
    async def comment(self, key: str, markdown: str) -> None: ...
    async def add_link(self, key: str, url: str, title: str) -> None: ...
```

### 4.11 Tests
- `JiraCloudProvider` with `httpx.MockTransport` + recorded JSON in `tests/fixtures/jira/` (search pages, issue, transitions, 401, 429). Never the real network.
- ADF golden tests (each node type, unknown node kept).
- Brief draft from ticket (with and without an AC heading).
- Write-back: stage move -> pending action; send ok; send fails with no matching transition; auto_send; newer transition replaces older.
- Token file is `0600`, the token never shows in logs or events.

### 4.12 Effort (M10): about 18 h
Provider + ADF 5 h · cache + views + API + CLI 4 h · start/link + brief draft 2.5 h · write back 3 h · UI (panel, dialog, chip, card, settings) 3.5 h.

## 5. UI (Wheel look)

### 5.1 Top bar
- From M10, the top bar gets a **Tickets** link after Playbooks (only for projects with `[tickets]`; screens before M10 do not show it).
- Build tool: front-matter key `"tickets": true` adds the link; `"nav": "tickets"` marks it active and adds it.

### 5.2 New screens
| Milestone | File | What it shows |
|---|---|---|
| M2 | `05_plan_docs_cli.html` (bare) | `saarthi run T-0012 --mode plan` ends with "Plan saved"; `saarthi docs list T-0012`; `saarthi docs show T-0012 1` |
| M3 | `12_task_room_docs.html` | Docs tab: groups, plan open in the center, outline on the right |
| M10 | `01_tickets_panel.html` | Tickets page: views (Mine / Sprint / Bugs), search, list with status pills and linked task beads, ticket detail on the right, "Start as task" |
| M10 | `02_start_from_ticket.html` | Dialog: preview of task title, branch, brief draft (goal, AC from the ticket), comments as research; Start |
| M10 | `03_task_room_ticket.html` | Task Room of T-0012 linked to ACME-142: Jira chip in the header, brief with "from ACME-142" note, Docs count |
| M10 | `04_write_back_confirm.html` | Task moved to Review: card "Move ACME-142 to In Review?" + PR comment and link actions after ship |
| M10 | `05_settings_jira.html` | Settings -> Jira: site, email, token (hidden), Test, scopes hint, per-project mapping view |
| M10 | `06_tickets_cli.html` (bare) | `jira login`, `tickets list`, `tickets start`, `ticket actions/send` |
| M10 | `07_tickets_offline.html` | Panel offline: cached list + "Offline · last synced 12m ago" banner, and a 401 error with the fix command |

### 5.3 Existing screens
- Every Task Room screen from M3 on gets the **Docs** tab in its tab strip (before Timeline), with a count from M3 on.
- M6 `05_context_pack_preview`: add the `plan` line.

### 5.4 Prototype
New views: `room-docs` (M3 12), `tickets` (M10 01), `ticket-start` (M10 02, dialog), `room-ticket` (M10 03), `ticket-confirm` (M10 04). Clicks: `.tab` "Docs" -> `room-docs`; top bar "Tickets" -> `tickets`; "Start as task" -> `ticket-start`; Start -> `room-ticket`.

### 5.5 Sample world
Project `acme-billing`, Jira site `acme.atlassian.net`, key `ACME`. T-0012 "Add password reset API" is linked to **ACME-142**. New ticket **ACME-151** "Export invoices as CSV" becomes **T-0033**. Other tickets: ACME-139 "Webhook retries", ACME-147 "Invoice PDF footer" (linked to T-0018), ACME-150 "Rate limit login" (bug), ACME-153 "Tax rounding error" (bug).

## 6. Docs to update

| File | Change |
|---|---|
| `FUNCTIONAL_SPECIFICATIONS.md` | F3.3 -> Must (M10). New F22, F23. Screens list: Docs tab, Tickets. Glossary: Doc, Ticket. Flow 6.4 "Ticket flow". |
| `TDD-tech-design-doc.md` | Components 4.12 Docs Finder, 4.13 Ticket Provider. Data 5.10 tickets, ticket_actions, tasks.ticket_key. Events 6.2 Doc + Ticket groups. API 9.1 rows. Files on disk 10 (plan docs, secrets). project.toml example `[docs]`, `[tickets]`. UI 11.2 Docs tab. Errors 12. Security 15 (token, untrusted ticket text). |
| `MILESTONES.md` | M2/M3/M6 build lines; new M10 section; remove "Ticket sync" from Later (keep GitHub Issues there). Overview table row. |
| `README.md`, `QUICK_REFERENCE.md`, `TECH_STACK.md` | Mention Docs tab + Jira; TECH_STACK: httpx is used for Jira; no new library. |
| `milestones/README.md` | Folder map M10, ownership rows (F, tables, API, events), effort table. |
| `milestones/M2_*`, `M3_*`, `M6_*` FSD + TDD | The parts in section 3. |
| `milestones/M10_jira_tickets/FSD_M10_jira_tickets.md`, `TDD_M10_jira_tickets.md` | New, in the same format as the other milestone docs. |
| `design/2026-10-11-wheel-ui-design.md` | Task Room tabs list adds Docs; section 8 table adds M10; link to this spec. |
| `design/milestones/README.md`, `_src/SCREEN_GUIDE.md` | M10 folder; `tickets` front-matter key. |

## 7. Out of scope
Editing docs in Saarthi, Mermaid rendering, Jira Data Center, creating Jira tickets, comment sync, webhooks, GitHub Issues, background polling, keyring storage.

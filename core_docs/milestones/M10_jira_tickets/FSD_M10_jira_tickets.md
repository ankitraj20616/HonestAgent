# FSD — M10: Jira tickets

**Document type:** Functional Specification Document (FSD)
**Milestone:** M10 of M0-M10 (built after M6; see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-12
**Estimated effort:** 18 hours (2 rough weeks at ~10 h/week)
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M10_jira_tickets.md`, `../../design/2026-10-12-task-docs-and-jira-design.md` (the approved spec, section 4), `../../FUNCTIONAL_SPECIFICATIONS.md` (F3.3, F23, flow 6.4), `../../TDD-tech-design-doc.md`, `../M6_research_memory_playbooks/FSD_M6_research_memory_playbooks.md` (before), `../M7_race_mode/FSD_M7_race_mode.md` (after)

---

## 1. What this document covers

M10 connects Saarthi to **Jira Cloud**. Most client work starts as a Jira ticket. After M10, a ticket becomes a task in one click, and the ticket status follows the task.

It covers these F-numbers (from the spec, section 4.1):

- **F3.3** Brief from ticket (was Later, now Must).
- **F23.1** Connect Jira Cloud (site, email, API token) + health.
- **F23.2** Tickets panel per project (Mine / Sprint / saved JQL views, search, refresh).
- **F23.3** Start a task from a ticket; link an existing task to a ticket.
- **F23.4** Ticket chip on the Task Room header and on Board cards.
- **F23.5** Write back with confirm: status transition, PR comment, remote link.
- **F23.6** Cache + offline view.

The milestone number is 10, but it is built **after M6**. It may come before M7. M7-M9 keep their numbers (spec D5).

## 2. The goal in plain words

Today I copy the ticket text into a brief by hand. I open Jira to move the status by hand. I paste the PR link into a Jira comment by hand. I forget one of the three about half the time.

At the end of M10 I can:

1. Log in to my client's Jira site once, with an API token.
2. See "my" tickets and the sprint tickets for a project, inside Saarthi, even when I am offline.
3. Click **Start as task** on a ticket and get a task with a brief draft (goal + acceptance criteria) made from the ticket.
4. See which ticket a task belongs to, on the Board and in the Task Room.
5. When the task moves to Review, say "yes" once and the Jira ticket moves to **In Review**. When the PR opens, say "yes" once and the ticket gets a comment and a link to the PR.

## 3. Where this milestone sits

- **Needs (already built):**
  - M1: tasks, briefs (versions), research items, events, `tasks.ticket_url`, `saarthi task edit --ticket`.
  - M2: runs, worktrees, branch names (`saarthi/<task-id>-<slug>`).
  - M3: Board, Task Room, top bar, Settings screen.
  - M5: ship flow, PR created with `gh`, event `ship.pr_created`.
  - M6: research items in the UI, Context Pack v1 (the agent reads ticket text from there).
- **M10 adds:** the Jira connection, a ticket cache, the Tickets screen, start/link, write back.
- **Unlocks next:** GitHub Issues (F23.7) can reuse the same `TicketProvider` interface later. Nothing in M7-M9 needs M10.

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Jira site** | The client's Jira Cloud address, like `acme.atlassian.net`. One login per site. |
| **API token** | A long password made at `id.atlassian.com`. Saarthi uses it with my email to talk to Jira. |
| **Scoped token** | An API token that can only do some things. Saarthi needs "read Jira work", "write Jira work" and "read Jira user" (scopes `read:jira-work`, `write:jira-work`, `read:jira-user`). |
| **JQL** | Jira's search language. Example: `assignee = currentUser() AND statusCategory != Done`. |
| **View** | A saved search in the Tickets panel. "Mine" and "Sprint" are built in. More come from `project.toml`. |
| **Ticket** | One Jira issue, like `ACME-151`. Saarthi keeps a copy (the cache). |
| **Linked task** | A Saarthi task that belongs to a ticket. One ticket has at most one task per project. |
| **Write back** | Saarthi changing something in Jira: the status, a comment, or a link. |
| **Action** | One proposed write back, shown as a card: "Move ACME-151 to In Review? [Send] [Skip]". |
| **ADF** | "Atlassian Document Format". The JSON Jira uses for descriptions and comments. Saarthi turns it into markdown. |

## 5. Features

### 5.1 F23.1 Connect Jira Cloud

- **What:** I give the site, my email and an API token. Saarthi checks them with Jira ("who am I") and saves them. A status command shows each site and whether the login still works.
- **Why:** Every other feature needs a working login. A clear check now saves confusing errors later.
- **Example:**
  ```
  $ saarthi jira login --site acme.atlassian.net --email me@acme.com
  Jira API token for me@acme.com (hidden): ********
  Checking https://acme.atlassian.net/rest/api/3/myself ... ok
  Connected as Ankit R.  Token saved (chmod 600).
    ~/.config/saarthi/secrets/jira-acme.atlassian.net.token · scopes read:jira-work, write:jira-work, read:jira-user

  $ saarthi jira status
  site                  email         user       state
  acme.atlassian.net    me@acme.com   Ankit R.   ok
  ```
  In the UI: Settings -> **Jira** -> site, email, token (hidden) -> **Test** -> "Connected as Ankit R." -> **Save**. The page also shows the scopes hint and, for the open project, its views and stage mapping (read only).
- **Rules:**
  - Jira **Cloud** only. The site must end with `.atlassian.net`. Data Center is Later (F23.9).
  - The token is never saved if the check fails.
  - The token lives in its own file, readable only by me (`chmod 600`). It is never in the repo, in `project.toml`, in events or in logs.
  - The site and email go into my global `~/.config/saarthi/config.toml`, never into the repo.
  - A project turns tickets on with a `[tickets]` table in `.saarthi/project.toml` (site, project key, views, stage mapping). No secrets there.
  - `saarthi jira logout --site ...` (and **Forget** in Settings) deletes the token file.
- **Acceptance criteria:**
  - A good token prints "Connected as <name>". A wrong token prints "Token wrong or expired" and saves nothing.
  - The token file has mode `600`. `grep` for the token in the data folder and logs finds nothing.
  - `saarthi jira status` shows `token expired` (not a crash) when the token was revoked in Atlassian.

### 5.2 F23.2 Tickets panel per project

- **What:** A **Tickets** screen per project (top bar link after Playbooks). Left: views **Mine**, **Sprint**, and my saved JQL views. Top: a search box and **Refresh**. Middle: the list (key, type, status pill, priority, summary, linked task bead). Right: the ticket detail (description, last comments, linked task) and **Start as task**.
- **Why:** I want to pick my next piece of work without leaving Saarthi.
- **Example:**
  ```
  $ saarthi tickets list --view mine
  Mine · ACME · synced just now · 6 tickets
  KEY       TYPE   PRIORITY  STATUS       TASK    SUMMARY
  ACME-142  Story  High      In Review    T-0012  Add password reset API
  ACME-151  Story  High      To Do        -       Export invoices as CSV
  ACME-147  Story  Medium    In Progress  T-0018  Invoice PDF footer
  ACME-153  Bug    Highest   To Do        -       Tax rounding error
  ACME-150  Bug    Medium    To Do        -       Rate limit login
  ACME-139  Task   Low       To Do        -       Webhook retries

  $ saarthi tickets list --view Bugs
  Bugs · ACME · synced 3m ago · 2 tickets
  KEY       TYPE   PRIORITY  STATUS       TASK    SUMMARY
  ACME-153  Bug    Highest   To Do        -       Tax rounding error
  ACME-150  Bug    Medium    To Do        -       Rate limit login

  $ saarthi tickets show ACME-139
  ACME-139  Webhook retries  (Task · To Do · Low)
  https://acme.atlassian.net/browse/ACME-139
  ... description as markdown ...
  ```
  In the UI: top bar **Tickets** -> **Sprint** -> click ACME-139 -> the detail opens on the right.
- **Rules:**
  - **Mine** = my open tickets. **Sprint** = tickets in open sprints. Both only for the project key in `project.toml`.
  - Saved views come from `[tickets.views]` in `project.toml` (name = JQL). Every view is limited to the project key and sorted by "last updated" first.
  - `--jql "..."` runs a one-off search. It is not saved as a view.
  - Search (`q`) filters the shown view by key or summary words. It works offline.
  - At most 200 tickets per view. More -> "Showing the first 200. Narrow the view."
  - The **Tickets** link shows only for projects that have a `[tickets]` table.
- **Acceptance criteria:**
  - Mine, Sprint and one saved view list the same tickets as the same JQL in Jira's own search.
  - A linked ticket shows its task id. Clicking the bead opens that Task Room.
  - A project without `[tickets]` shows no Tickets link; the CLI says "Tickets are not set up for this project" with the `project.toml` example.

### 5.3 F23.3 Start a task from a ticket; link an existing task

- **What:** **Start as task** on a ticket makes a new task. The title is the ticket summary. The task keeps the ticket key and URL. The issue type becomes a label. A brief draft and a "Jira comments" research item are made too (see 5.4). An existing task can also be linked to a ticket.
- **Why:** Copying the ticket by hand is slow and I lose the link between the two.
- **Example:**
  ```
  $ saarthi tickets start ACME-151
  Created T-0033  Export invoices as CSV  (label Story · ticket ACME-151)
  Brief     draft v1 · goal + 3 acceptance criteria · not approved
  Research  "Jira comments" · 2 comments · not sent to agent
  Branch    saarthi/T-0033-ACME-151-export-invoices-as-csv  (worktree on first run)
  Next      saarthi brief edit T-0033, then saarthi run T-0033

  $ saarthi tickets start ACME-147
  ACME-147 is already linked to T-0018. Opening nothing. Use: saarthi task show T-0018

  $ saarthi task edit T-0012 --ticket ACME-142
  Linked T-0012 to ACME-142 (Add password reset API). Brief kept (T-0012 already has one).
  ```
  In the UI: Tickets -> ACME-151 -> **Start as task** -> a dialog shows the task title, the branch name, the brief draft (goal, acceptance criteria) and "2 Jira comments -> research snippet, not sent to the agent" -> **Start** -> the Task Room of T-0033 opens. On a linked ticket the button says **Open T-0018** instead.
- **Rules:**
  - One ticket is linked to at most one task in a project. Starting a linked ticket opens its task (error code `ticket_linked` with the task id).
  - The new task starts in **Inbox**. Nothing runs by itself.
  - A task linked to a ticket gets the branch `saarthi/T-0033-ACME-151-<slug>` (key in capitals) and the PR title `ACME-151: <task title>`. The "GitHub for Jira" app then links branch and PR to the ticket by itself.
  - Linking a task that already has a worktree does not rename its branch (branches are never renamed). The PR title still carries the key. Example: T-0012 keeps `saarthi/T-0012-add-password-reset-api`; its PR title becomes `ACME-142: Add password reset API`.
  - Linking an existing task makes a brief draft **only** if the task has no brief yet. If it has one, the brief is kept. Its title is not changed.
  - Only **Start as task** imports the Jira comments as a research item. Linking does not.
  - `saarthi task edit T-0012 --ticket <key or Jira URL>` links. `--no-ticket` unlinks. A non-Jira URL keeps the old M1 behaviour (just a URL, no link).
  - The dialog preview changes nothing. Only **Start** makes the task (`--dry-run` in the CLI).
- **Acceptance criteria:**
  - Start on ACME-151 makes exactly one task, one brief version, one research item, and the events `task.created`, `ticket.imported`.
  - Start on ACME-147 (linked to T-0018) makes nothing and points to T-0018.
  - The first run of T-0033 makes the branch `saarthi/T-0033-ACME-151-export-invoices-as-csv`.

### 5.4 F3.3 Brief from ticket

- **What:** The brief draft is made from the ticket text, with fixed rules (no agent call):
  - **Goal** = the summary + the description up to the first acceptance heading.
  - **Acceptance criteria** = the bullet items under a heading named "Acceptance criteria", "AC" or "Definition of done" (any case).
  - **Notes** = the rest of the description + `Ticket: <url>`.
  - The newest 20 comments become one research item, kind snippet, title "Jira comments", **send to agent: no**.
- **Why:** Most tickets already have the goal and the acceptance criteria. Fixed rules are fast, free and always give the same result.
- **Example:** ACME-151 description in Jira:
  ```
  Finance wants one CSV file per month so they can load invoices into their accounting tool.
  ## Acceptance criteria
  - GET /invoices/export?month=2026-09 returns a CSV file
  - Same columns as GET /invoices, in the same order
  - Amounts have 2 decimals; dates are UTC ISO 8601
  Out of scope: XLSX files.
  ```
  The ticket has 2 comments: Marco D ("Keep the column order fixed. Their import maps columns by position.") and Priya S ("Finance opens it in Excel, so please add a UTF-8 BOM.").

  Brief version 1 of T-0033: goal "Export invoices as CSV. Finance wants one CSV file per month so they can load invoices into their accounting tool.", 3 acceptance criteria (the three lines above), notes "Out of scope: XLSX files. Ticket: https://acme.atlassian.net/browse/ACME-151". The Brief panel shows a small "from ACME-151" note.
- **Rules:**
  - The draft is saved as brief version 1 but the task stays in Inbox. "Approving" it means I read it, edit it if needed, and move the task to Ready myself.
  - No acceptance heading -> no acceptance criteria, the whole description goes to the goal, and a warning says "No acceptance criteria in ACME-xxx. Add them before Ready."
  - Ticket text is **not trusted**. In the Context Pack it is marked "from Jira, not trusted", so the agent treats it as data, not as orders. The permission profile still applies.
  - Images and attachments are not downloaded. They show as `[attachment: name]`.
- **Acceptance criteria:**
  - The ACME-151 example gives the goal, 3 criteria and the notes above, word for word.
  - A ticket with no AC heading gives an empty acceptance list and the warning.
  - Switching "Jira comments" to "send to agent: yes" puts it in the next Context Pack, inside the "not trusted" markers.

### 5.5 F23.4 Ticket chip

- **What:** A small chip with the ticket key and its Jira status, in the Task Room header and on Board cards.
- **Why:** At a glance I see which task belongs to which ticket, and where the ticket is in Jira.
- **Example:** Board -> the T-0012 card shows `ACME-142 · In Review`. Task Room of T-0012 -> header chip `ACME-142 · In Review` -> click -> menu: **Open in Jira**, **Refresh**, **Change ticket**, **Unlink**.
- **Rules:**
  - The status on the chip is from the cache. It refreshes with the panel, with **Refresh**, and after a write back.
  - Colours follow the Jira status category (to do / in progress / done), in the Wheel look.
  - Tasks with only a plain `ticket_url` (no key) show a link icon, not a chip.
- **Acceptance criteria:** After a sent transition, the chip shows the new status without a page reload.

### 5.6 F23.5 Write back with confirm

- **What:** Saarthi proposes Jira changes at two moments:
  - **Stage move:** when the task enters a stage that has a mapping in `[tickets.on_stage]` (default: Running -> "In Progress", Review -> "In Review", Shipped -> nothing), one **transition** action.
  - **PR created:** one **comment** ("PR opened: <url> · Saarthi T-0033") and one **link** action (a link to the PR in the ticket).

  Each action shows as a card in the Task Room. I click **Send** or **Skip**.
- **Why:** The status in Jira is what my client and PM see. It should never lag behind, but Saarthi must not change a client's Jira without my OK.
- **Example:**
  ```
  $ saarthi ticket actions T-0033
  ID          KIND        STATUS   TRIGGER         WHAT
  01JC9A2D1X  transition  sent     stage:running  ACME-151 -> In Progress
  01JC9F3K7Q  transition  pending  stage:review   ACME-151 -> In Review
  $ saarthi ticket send 01JC9F3K7Q
  Sent: ACME-151 -> In Review

  (after the approval and ship: PR #88 opened)
  $ saarthi ticket actions T-0033
  ID          KIND        STATUS   TRIGGER          WHAT
  01JC9A2D1X  transition  sent     stage:running    ACME-151 -> In Progress
  01JC9F3K7Q  transition  sent     stage:review     ACME-151 -> In Review
  01JC9H8M2V  comment     pending  ship.pr_created  PR opened: github.com/acme/billing/pull/88 · Saarthi T-0033
  01JC9H8M3W  link        pending  ship.pr_created  PR #88
  $ saarthi ticket send 01JC9H8M2V && saarthi ticket send 01JC9H8M3W
  Sent: comment added to ACME-151.
  Sent: link added to ACME-151.

  $ saarthi ticket send 01JC9C1P6T
  Failed: No transition to In Review from To Do. Possible: In Progress, Done
  ```
  In the UI: T-0033 moves to Review -> card "Move ACME-151 to **In Review**? [Send] [Skip]" -> Send -> the card turns green "Sent" and the chip shows `In Review`.
- **Rules:**
  - Every write needs my OK, unless the project sets `auto_send = true`. Then it is sent at once and the card shows the result.
  - One **pending transition** per task. A newer one replaces the older pending one (the older one becomes "skipped").
  - Transitions only move **forward**. A card is made only when the wanted status comes later in the `on_stage` order (Running < Review < Shipped) than the ticket's current status, or when the current status is not in the mapping. So a fix run (Review -> Running) does not propose "In Progress" again, and no card is made when the ticket is already in the wanted status.
  - The status names are matched ignoring case. If no matching move exists, the action fails and lists the possible statuses.
  - A failed action can be sent again. A sent or skipped action cannot.
  - These cards do **not** count in Home's **Needs You** list. No agent is waiting.
  - Shipped maps to nothing by default (the PR is not merged yet). A team can set `shipped = "Done"`.
  - Saarthi never creates tickets and never syncs comments back (F23.8, Later).
- **Acceptance criteria:**
  - Moving T-0033 to Review makes one pending transition and the event `ticket.action_proposed`; nothing changes in Jira before Send.
  - Send moves the ticket in Jira; the action is `sent` and `ticket.action_sent` is saved.
  - With `auto_send = true`, the ticket moves without a click.
  - Two quick stage moves leave one pending transition, the newest.
  - A ticket in "In Review" gets no "In Progress" card when a fix run moves the task back to Running.

### 5.7 F23.6 Cache + offline view

- **What:** Saarthi keeps a copy of the tickets it has seen. When Jira cannot be reached, the panel shows the copy with a banner.
- **Why:** I work on trains. I still want to read the ticket I am working on.
- **Example:**
  ```
  $ saarthi tickets list
  Mine · ACME · 6 tickets · cached, last synced 12m ago
  ! Offline: acme.atlassian.net cannot be reached.

  $ saarthi tickets list --refresh
  Mine · ACME · 6 tickets · cached, last synced 2h ago
  ! Jira: Token wrong or expired. Run `saarthi jira login --site acme.atlassian.net`.
  ```
  In the UI: banner "Offline · last synced 12m ago" above the list; on a 401, a red banner with the fix command and a **Copy** button.
- **Rules:**
  - No background polling. The cache refreshes when I click **Refresh**, or when the panel opens and the copy is older than 5 minutes.
  - Offline, the list, the detail (if it was opened once) and the chips still work. Start, link and write back need Jira.
  - When Jira says "too many requests", Saarthi waits as asked and tries at most 3 times.
- **Acceptance criteria:**
  - With the network off, `saarthi tickets list` shows the cached list and "last synced" time, exit code 0.
  - A revoked token shows the fix command, never a stack trace.

## 6. Main user flows

### 6.1 Ticket to PR (core FSD flow 6.4)
1. Top bar **Tickets** -> **Mine** -> ACME-151 -> **Start as task** -> **Start**.
2. T-0033 opens. Read the brief draft, fix one criterion, move to Ready.
3. Run Claude -> Build. A card asks "Move ACME-151 to In Progress?" -> Send.
4. Checks pass, task moves to Review. Card: "Move ACME-151 to In Review?" -> Send.
5. Approve the Change Story, Ship. Two cards: PR comment and PR link -> Send both.
6. In Jira, ACME-151 is In Review, with the PR comment, the PR link, and (with GitHub for Jira) the branch.

### 6.2 Link a task I already started
1. T-0012 was made by hand. `saarthi task edit T-0012 --ticket ACME-142`.
2. The chip shows `ACME-142 · In Review`. The brief stays as it was, and so does the branch `saarthi/T-0012-add-password-reset-api`. The next PR title is `ACME-142: Add password reset API`. Jira comments are not imported (only Start as task does that).

## 7. Done when

- [ ] I start a real client task from a real Jira ticket. Its brief has the ticket's goal and acceptance criteria.
- [ ] When that task moves to Review, its Jira status moves to **In Review** only after my OK.
- [ ] After ship, the Jira ticket has the PR comment and the PR link.
- [ ] With the network off, the Tickets panel shows the cache with "last synced".
- [ ] A revoked token shows "Token wrong or expired. Run `saarthi jira login`" with the site.
- [ ] No test calls the real Jira. All tests use recorded JSON.
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run pyright` pass.

## 8. Not in M10

| Item | Owner |
|---|---|
| GitHub Issues and other providers (F23.7) | Later (same `TicketProvider` interface) |
| Create a Jira ticket from Saarthi; two-way comment sync (F23.8) | Later |
| Jira Data Center / Server, PAT, API v2 (F23.9) | Later |
| Background polling, Jira webhooks | Later |
| System keyring for the token | Later |
| Download of ticket images and attachments | Later |
| Changing the ticket assignee from Saarthi | Later (open question 2) |
| Editing docs in Saarthi, Mermaid diagrams (F22.6) | Later |

## 9. QA checklist

Use a free Jira Cloud site (TDD section 15).

1. `saarthi jira login` with a wrong token -> "Token wrong or expired", no token file.
2. Login with a good token -> `saarthi jira status` shows `ok`; `stat -c %a` on the token file prints `600`.
3. `saarthi tickets list --view mine`, `--view sprint`, `--view Bugs` -> same tickets as in Jira.
4. `saarthi tickets list --jql "labels = csv"` -> one-off list, not saved as a view.
5. `saarthi tickets start ACME-151 --dry-run` -> preview, no task made.
6. `saarthi tickets start ACME-151` -> T-0033, brief v1 with 3 criteria, "Jira comments" item (2 comments) set to "no".
7. Start ACME-151 again -> "already linked to T-0033".
8. `saarthi task edit T-0012 --ticket ACME-142` -> chip shows; brief and branch name unchanged; no research item added.
9. Move T-0033 to Review -> one pending action; Jira unchanged. Send -> Jira shows In Review.
10. Remove "In Review" from the workflow, propose again, Send -> fails with the list of possible statuses.
11. Set `auto_send = true`, move a task to Running -> Jira changes with no click.
12. Ship T-0033 -> comment + link actions; Send both -> visible on the ticket. Ship again (PR reused) -> no second comment.
13. Turn off Wi-Fi -> panel shows "Offline · last synced Xm ago"; chips still show.
14. Revoke the token in Atlassian -> red banner with `saarthi jira login --site acme.atlassian.net`.
15. `grep -r <token> ~/.local/share/saarthi` -> nothing.

## 10. Open questions

1. **Should `shipped` map to Done by default?** The spec says no (PR not merged yet). Some teams close the ticket when the PR opens. Keep `""` as the default?
2. **Should the ticket's assignee change to me when I start it?** Today Saarthi does not touch the assignee. Adding it is one more write back (one more card).
3. ~~Running -> "In Progress" on every fix run?~~ **Answered:** transitions only move forward (5.6 rules). A fix run after Review proposes nothing.
4. **Scoped tokens** must call Jira through `api.atlassian.com`, not the site (TDD Decision 12). OK to allow that one extra host?
5. **Brief "approval".** Briefs have no "approved" flag. The draft is saved as version 1 and I approve by moving to Ready. Enough?
6. If 18 hours is not enough, cut first: `--jql` one-off search, then the Settings mapping view (keep the CLI).

## 11. Effort

About **18 hours**. See TDD section 17 for the breakdown.

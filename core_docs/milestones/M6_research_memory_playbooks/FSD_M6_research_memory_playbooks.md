# FSD — M6: Research Desk + Memory + Playbooks

**Document type:** Functional Specification Document (FSD)
**Milestone:** M6 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-11
**Estimated effort:** 20 hours (2 rough weeks at ~10 h/week)
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M6_research_memory_playbooks.md`, `../../FUNCTIONAL_SPECIFICATIONS.md` (F3, F4, F5.3, F12, F13), `../../TDD-tech-design-doc.md` (4.8, 5.4, 5.9, 8.5), `../M5_review_ship/FSD_M5_review_ship.md` (before), `../M7_race_mode/FSD_M7_race_mode.md` (after)

---

## 1. What this document covers

M6 adds the **thinking around a task**: the research before it, the memory after it, and the saved prompts used during it.

It covers these F-numbers (from `../README.md`, ownership map):

- **F3.2** Brief from research ("Draft brief"), **F3.4** brief versions view.
- **F4.1** notes, **F4.2** links, **F4.3** snippets, **F4.4** "Research this", **F4.6** "send to agent" toggle.
- **F5.3** Context Pack **v1** (replaces the brief-only v0 from M2).
- **F12.1** Memory screen, **F12.2** smart context, **F12.3** memory update on ship.
- **F13.1-F13.4** Playbooks: library, 5 built-ins, variables, global + project scope.
- Import of existing `quick-prompts.md` files as playbooks (MILESTONES.md M6 list).

## 2. The goal in plain words

Today the research for a task lives in browser tabs. What we learn after shipping lives in my head. My good prompts live in `quick-prompts.md` files that I copy and paste.

At the end of M6 I can:

1. Collect notes, links and error logs on a task, and let an agent explore the code for me.
2. Turn that research into a brief with one click, then edit it.
3. See every old version of a brief.
4. Read and fix my `core_docs/` from inside Saarthi.
5. Start a run with a playbook, and see the exact Context Pack the agent will get.
6. After shipping, approve small updates to `project_memory.md`, `learnings/` and `timeline.md`. They go into the same PR.

## 3. Where this milestone sits

- **Before (already built):** M1 saves research items and brief versions (data only). M2 runs agents and writes a brief-only `TASK.md`. M3 has the Task Room. M4 has Proof Cards. M5 has Change Story and the ship flow (commit, push, PR).
- **M6 adds:** the screens and logic that use that data, plus playbooks and memory.
- **Unlocks next:** M7 Race Mode gives one Context Pack (with a playbook) to two agents. Smart memory by meaning (embeddings) and ADR suggestions (F12.4) stay **Later**.

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Research item** | One thing saved on a task: a note, a link, a snippet, or an agent finding. |
| **Agent finding** | The written result of a "Research this" run, saved as a research item. |
| **Send to agent** | A yes/no switch on each research item. "Yes" means it goes into the Context Pack. |
| **Context Pack** | The file `.saarthi/context/TASK.md` that the agent reads first. |
| **Memory match** | A `core_docs/` file picked for the Context Pack because it shares words with the brief. |
| **Always-include list** | Files every run should know about (FSD, TDD, CLAUDE.md). Listed by path in the pack. |
| **Memory update** | A short text the agent proposes to add to a memory file after shipping. You approve or reject it. |
| **Playbook** | A saved prompt recipe, stored as a markdown file. |
| **Variable** | A slot like `{{task.title}}` in a playbook that Saarthi fills in before the run. |
| **Scope** | Where a playbook lives: built-in, global (all projects) or project (`.saarthi/playbooks/`). |

## 5. Features

### 5.1 F4.1 Notes

- **What:** Free markdown notes on a task.
- **Why:** My thinking about a task should sit next to the task, not in a scratch file.
- **Example:**
  ```
  $ saarthi research add T-0042 --note "Reset tokens must expire in 30 minutes. Ask client about SMS."
  Added note 01JC4M7Q2X to T-0042 (send to agent: yes)
  ```
- **Rules:** Body is markdown. Title is optional (first line is used if empty). Edit and delete are allowed.
- **Acceptance criteria:**
  - A note added from the CLI shows in the Research tab of the Task Room without a refresh.
  - Editing a note keeps its id. A `research.updated` event is saved.

### 5.2 F4.2 Links

- **What:** Save a URL with a short note. Saarthi fetches the page title.
- **Why:** A list of bare URLs is useless a week later. A title says what the page was.
- **Example:**
  ```
  $ saarthi research add T-0042 --link https://docs.python.org/3/library/secrets.html --note "use token_urlsafe"
  Added link 01JC4M9K1D to T-0042: "secrets — Generate secure random numbers ..."
  ```
- **Rules:**
  - Only `http` and `https` URLs.
  - The title fetch happens in the background. It waits at most 5 seconds and reads at most 256 KB.
  - If the fetch fails, the title is the URL host and path. The link is still saved.
  - If I type a title myself, Saarthi does not overwrite it.
  - Title fetch can be turned off in Settings (`research.fetch_titles = false`).
- **Acceptance criteria:**
  - A link to a normal web page gets its `<title>` within 5 seconds.
  - A link to a dead host is saved with the host as title and no error banner.
  - A `file://` URL is refused with a clear message.

### 5.3 F4.3 Snippets

- **What:** Paste code, logs, error messages or API responses. Each snippet has a label.
- **Why:** Error logs are the most useful input for a bug fix (FSD flow 6.3).
- **Example:**
  ```
  $ pytest -x 2>&1 | saarthi research add T-0042 --snippet --title "pytest failure on main"
  Added snippet 01JC4MB3RW to T-0042 (212 lines)
  ```
- **Rules:** Label is required. Body is shown in a code block. Big snippets are kept whole in the database, but only the first 8,000 characters go into the Context Pack (with a "cut" note).
- **Acceptance criteria:** A snippet read from stdin is saved exactly, byte for byte. A 50,000-character snippet is saved whole and cut in the Context Pack preview.

### 5.4 F4.4 "Research this"

- **What:** A button (and a CLI command) that starts a **read-only** agent run. The agent explores the code and writes findings with four fixed headings: **Related files**, **How the current code works**, **Risks**, **Suggested approach**. The findings are saved as an `agent_finding` research item.
- **Why:** The first 20 minutes of every task is "where is this in the code?". An agent can do that while I read the ticket.
- **Example:**
  ```
  $ saarthi research run T-0042 --agent claude --focus "how are login tokens made today?"
  Started research run 01JC4MD0A1 (claude, read-only) for T-0042
  ... (live stream, same as `saarthi run watch`)
  Finding saved: 01JC4MF7ZQ "Agent finding (claude) - 2026-10-11 10:42"
  ```
- **Rules:**
  - The run uses mode `research` and read-only agent flags. It cannot change files.
  - It does **not** move the task stage. I can click it in Inbox, Research, Ready, Failed or Review.
  - It uses the current Context Pack (brief if any, research items set to "send to agent").
  - If the agent gives no usable text, nothing is saved and the run shows "No finding text found".
  - The finding is a normal research item: I can edit it, delete it, or switch "send to agent" off.
- **Acceptance criteria:**
  - After a research run ends, one new `agent_finding` item exists, linked to that run.
  - `git status` in the task worktree is clean after the run.
  - The task stage is the same before and after the run.

### 5.5 F4.6 "Send to agent" toggle

- **What:** Each research item has a switch. Only items set to "yes" go into the Context Pack.
- **Why:** Some notes are for me only ("ask client"), and big logs can waste the agent's attention.
- **Example:** `saarthi research toggle 01JC4MB3RW --no-send` -> `Snippet "pytest failure on main": send to agent = no`
- **Rules:** New items default to "yes". The switch is shown on every item in the Research tab.
- **Acceptance criteria:** Switching an item off removes it from the next Context Pack preview. Switching it on adds it back.

### 5.6 F3.2 Brief from research ("Draft brief")

- **What:** The agent reads the task title, the current brief (if any) and the research items set to "send to agent", then writes a brief draft: goal, acceptance criteria, notes, focus files. I edit it and save.
- **Why:** Writing the brief is the slowest step. The research already has the facts.
- **Example:**
  ```
  $ saarthi brief draft T-0042
  Drafting brief with claude ... done (34 s, $0.03)
  Opening draft in $EDITOR ...
  Saved brief version 3 for T-0042
  ```
  In the UI: Task Room -> Brief -> **Draft brief** -> the draft fills the editor (not saved yet) -> I edit -> **Save**.
- **Rules:**
  - The draft is **never saved by itself**. Only my Save makes a new brief version.
  - If the agent returns broken output, the raw text is put into the Notes section so nothing is lost, and a warning is shown.
  - The draft call is read-only and its cost is counted on the task.
- **Acceptance criteria:**
  - Draft with 3 research items gives a brief with a goal and at least one acceptance criterion.
  - Closing the editor without saving creates no new version.
  - A broken agent answer still opens the editor, with the raw text under Notes.

### 5.7 F3.4 Brief versions view

- **What:** A list of all brief versions (number, date, first line of the goal). I can open an old one, compare it with the current one, and restore it.
- **Why:** M1 already saves every version. Now I can see them.
- **Example:**
  ```
  $ saarthi brief versions T-0042
  v  saved             goal
  3  2026-10-11 10:51  Add a password reset API with email token ...
  2  2026-10-11 10:12  Add password reset API
  1  2026-10-10 18:03  (empty)
  $ saarthi brief restore T-0042 2
  Saved brief version 4 for T-0042 (copy of version 2)
  ```
- **Rules:** Old versions are read-only. "Restore" saves a **new** version that copies the old one. Nothing is ever deleted.
- **Acceptance criteria:** Restoring version 2 creates version 4 with the same goal and acceptance as version 2. The compare view shows changed lines.

### 5.8 F5.3 Context Pack v1 (with F12.2 smart context)

- **What:** Before each run, Saarthi writes `<worktree>/.saarthi/context/TASK.md` with, in this order:
  1. Task header (id, title, mode, agent).
  2. Playbook text, with variables filled in (if a playbook was picked).
  3. The latest brief.
  4. Research items set to "send to agent".
  5. Project rules and the always-include list, **by path only** (the agent reads them itself).
  6. Up to 5 matched memory files, inlined, at most ~20,000 characters in total.
- **Why:** The agent should start with the same picture I have. One file means I can see exactly what it got.
- **Example:**
  ```
  $ saarthi context T-0042 --mode build --playbook plan-then-build
  Context Pack for T-0042 (build, claude) - 27,410 chars
    playbook   plan-then-build (builtin)                 1,120
    brief      version 3                                 1,480
    research   3 of 4 items (1 switched off)             4,210
    listed     CLAUDE.md, AGENTS.md, core_docs/FUNCTIONAL_SPECIFICATIONS.md, core_docs/TDD-tech-design-doc.md
    memory     core_docs/memory/project_memory.md   score 14   full   9,880
               core_docs/learnings/auth.md          score 9    full   2,330
               core_docs/plans/m2_tokens.md         score 4    cut    8,390
  Use --show to print the full TASK.md.
  ```
  In the UI: the run dialog has a **Preview** button that shows the same file and the same table.
- **Rules (F12.2, simple keyword match):**
  - Keywords come from the task title, the brief goal and the acceptance criteria. Short words (under 3 letters) and common words ("the", "and", "should", ...) are dropped. At most 20 keywords.
  - Each `.md` file in the memory folder gets a score: for each keyword, the number of lines that contain it, counted at most 5 times. Add up all keywords.
  - Files with a score under 2 are skipped. The top 5 files are taken, best score first.
  - Files are added whole until the 20,000-character budget is used. A file that does not fit is cut, with a line telling the agent where to read the rest. If less than 2,000 characters are left, the file is listed by path only.
  - Files in the always-include list are never inlined (they are big and listed already).
  - The memory folder and the lists come from `.saarthi/project.toml` (`[memory]`).
- **Acceptance criteria:**
  - A brief about "password reset token" picks a memory file that talks about tokens over one that does not.
  - No more than 5 memory files and no more than 20,000 memory characters are inlined.
  - The preview and the file the agent gets are exactly the same text.
  - A project with no memory folder still gets a pack (brief + research), with a note "no memory folder".

### 5.9 F12.1 Memory screen

- **What:** A screen (left nav **Mem**) with the project's `core_docs/` tree, a markdown view, and a simple editor.
- **Why:** I keep core_docs for every project. I should not need another app to read or fix them.
- **Example:** Mem -> `core_docs/memory/project_memory.md` -> **Edit** -> fix a line -> **Save**. CLI: `saarthi memory tree`, `saarthi memory show memory/project_memory.md`, `saarthi memory edit memory/project_memory.md` (opens `$EDITOR`).
- **Rules:**
  - Shows the files in the **main checkout** of the repo (not a task worktree).
  - Only `.md` files under the memory folder can be edited. Max 1 MB.
  - A banner says: "Edits change files in your main checkout (branch: main). Saarthi does not commit them."
  - If the file changed on disk after I opened it, Save is refused and I am asked to reload.
- **Acceptance criteria:**
  - The tree matches `find core_docs -name '*.md'`.
  - A path like `../.ssh/id_rsa` is refused.
  - Saving writes the file and adds a `memory.file_saved` event.

### 5.10 F12.3 Memory update on ship

- **What:** When a task reaches **Shipped**, Saarthi drafts up to three kinds of updates:
  - `memory/project_memory.md`: what was done, hard bugs (Problem -> Root cause -> Fix -> Result), solutions.
  - `learnings/<topic>.md`: new rules or mistakes (zero or more files).
  - `timeline/timeline.md`: one row with the date, task id, title and PR link.

  I approve, edit or reject each one. When none is left pending, all approved texts are written **on the task branch** in one commit and pushed, so they are part of the PR.
- **Why:** FSD success criterion: after 1 month, memory is updated by the app, not by hand.
- **Example:**
  ```
  $ saarthi memory updates T-0042
  id          file                                   action  status
  01JC4N0..   core_docs/memory/project_memory.md     append  pending
  01JC4N1..   core_docs/learnings/tokens.md          create  pending
  01JC4N2..   core_docs/timeline/timeline.md         append  pending
  $ saarthi memory approve 01JC4N0 --edit      # opens $EDITOR with the text
  $ saarthi memory reject 01JC4N1
  $ saarthi memory approve 01JC4N2
  Applied 2 memory updates on saarthi/T-0042-password-reset (commit 4f1c2ab), pushed.
  ```
- **Rules:**
  - Updates only **add** text (append to a file, or create a new file). They never rewrite what is there.
  - The timeline row is made by Saarthi itself, not by the agent.
  - Nothing is written before I decide. Rejected texts are kept in the database, not in files.
  - The commit is never made on the default branch.
  - Deleting the worktree after ship is fine. If it is gone, Saarthi uses a short-lived worktree on the same branch to write the updates.
  - `auto_update_on_ship = false` in `project.toml` turns drafting off. I can still run `saarthi memory draft T-0042`.
- **Acceptance criteria:**
  - Shipping a task creates a pending timeline update every time, and memory/learnings updates when the agent has something to say.
  - Approve 2, reject 1 -> one commit on the task branch with exactly the 2 approved texts; `main` is unchanged.
  - The PR on GitHub shows the memory commit.

### 5.11 F13.1 Playbook library

- **What:** A **Playbooks** screen and `saarthi playbook ...` commands. Each playbook has: name, description, prompt text, default agent, default mode.
- **Why:** My best prompts should be one click away, not copy-pasted.
- **Example:**
  ```
  $ saarthi playbook list
  slug              scope    name                                   agent   mode
  plan-then-build   builtin  Plan first, then build                 claude  build
  fix-bug-tdd       project  Fix bug with TDD (failing test first)  -       build
  security-review   builtin  Review for security                    codex   research
  ...
  $ saarthi run T-0042 --playbook fix-bug-tdd
  ```
- **Rules:** A playbook is a markdown file with a small settings block at the top (TDD Decision 10). The run dialog has a playbook picker. If the playbook has a default agent or mode, they are pre-filled; I can change them. The Command Bar (`Ctrl+K`) also finds playbooks.
- **Acceptance criteria:** I can create, edit and delete a project playbook from the CLI and the screen. A run started with a playbook shows its name in the runs list.

### 5.12 F13.2 Built-in playbooks

- **What:** Five playbooks ship with Saarthi:

| Slug | Name | Default agent | Default mode |
|---|---|---|---|
| `plan-then-build` | Plan first, then build | claude | build |
| `fix-bug-tdd` | Fix bug with TDD (failing test first) | claude | build |
| `refactor-safe` | Refactor without behaviour change | claude | build |
| `write-tests` | Write tests for this module | codex | build |
| `security-review` | Review for security | codex | research |

- **Why:** A new project should have good recipes on day one.
- **Rules:** Built-ins cannot be edited or deleted. **Copy to edit** makes a global or project copy with the same slug, which then wins over the built-in.
- **Acceptance criteria:** A fresh install lists all 5. A project copy of `fix-bug-tdd` is used instead of the built-in for that project only.

### 5.13 F13.3 Variables

- **What:** Playbooks can use: `{{task.id}}`, `{{task.title}}`, `{{brief}}`, `{{brief.goal}}`, `{{brief.acceptance}}`, `{{failing_checks}}`, `{{branch}}`, `{{project.name}}`, `{{extra}}` (my extra instruction).
- **Why:** The same recipe must work on every task.
- **Example:** `saarthi playbook render fix-bug-tdd --task T-0042` prints the filled text.
- **Rules:** An empty value becomes `(none)`. An unknown variable is left as is and the preview shows a warning. There is no logic (no `if`, no loops).
- **Acceptance criteria:** `{{failing_checks}}` shows the names and last output lines of the failing required checks from the latest Proof Card. A typo like `{{task.titel}}` shows a warning and stays in the text.

### 5.14 F13.4 Scope

- **What:** Three places, in this order of priority when two have the same slug:
  1. Project: `<repo>/.saarthi/playbooks/*.md` (committed with the project).
  2. Global: `~/.config/saarthi/playbooks/*.md` (all my projects).
  3. Built-in: inside the Saarthi package.
- **Why:** Some recipes are about one client project; others are about how I work.
- **Rules:** The file is the truth. Editing the file by hand is fine; Saarthi re-reads it.
- **Acceptance criteria:** A playbook dropped into `~/.config/saarthi/playbooks/` shows up in `saarthi playbook list` with no restart.

### 5.15 Import `quick-prompts.md` files

- **What:** Turn an existing `quick-prompts.md` into playbooks.
- **Why:** I already have prompt files in my client projects.
- **Example:**
  ```
  $ saarthi playbook import ~/OFFICE/AD0069-manson-safety-report-generator/core_docs/quick-prompts.md --project AD0069 --dry-run
  5 playbooks found:
    1  keep-in-mind-about-the-previous           "Keep in mind about the previous..."
    2  replace-the-hard-coded-values-ultrathink   "replace the hard coded values, ultrathink"
    3  when-understanding-reviewing-fixing-bug   "When understanding , reviewing, fixing bug..."
    4  read-related-files-follow-the-standard    "Read related files, follow the standard..."
    5  for-creating-plan                         "For creating plan"
  $ saarthi playbook import <same file> --project AD0069 --only 1,4,5
  Created 3 project playbooks in .saarthi/playbooks/
  ```
- **Rules:**
  - If the file has `##` headings, each heading is one playbook (Saarthi's own file gives 7).
  - Otherwise each block of text between blank lines is one playbook. A block ending with `:` joins the next block. A block that starts with a list (`-`, `1.`, `**`) joins the block before it.
  - A short first line (6 words or less) becomes the name; else the name is the first 6 words.
  - Imported playbooks have no default agent or mode. Same slug as an existing file -> a `-2` suffix.
  - `--dry-run` shows what would be made and writes nothing.
- **Acceptance criteria:** The three real files give 7, 5 and 7 playbooks (Saarthi, AD0069, AD0071). The prompt text is kept word for word.

## 6. Main user flows

### 6.1 From idea to brief in under 5 minutes
1. Quick capture "Add password reset API". Open the task, move it to Research.
2. Paste the client's message as a note. Add one doc link.
3. Click **Research this** (Claude). Watch or wait about 2 minutes.
4. Read the finding. Switch off one snippet I do not need.
5. Click **Draft brief**. Edit two lines. Save. Move to Ready.

### 6.2 Run with a playbook
1. Click **Run**. Pick playbook "Fix bug with TDD". Agent and mode are pre-filled.
2. Click **Preview**. Check that the right memory files are in. Start.

### 6.3 Ship and remember
1. Ship the task (M5). Task moves to Shipped.
2. The Task Room shows "3 memory updates to review".
3. Approve the timeline row, edit and approve the memory text, reject the learning.
4. Saarthi commits and pushes. The PR now has the memory commit. Delete the worktree (before or after step 3, both work).

## 7. Done when

- [ ] On a real task, "Research this" + "Draft brief" + my edits give a saved brief in under 5 minutes (timed once, written in `timeline.md`).
- [ ] After shipping a real task, `core_docs/memory/project_memory.md` and `core_docs/timeline/timeline.md` are updated **only** after my approval, and the change is in the PR.
- [ ] `saarthi context T-xxxx --show` prints the same text the agent read.
- [ ] All 5 built-in playbooks are listed; my 3 `quick-prompts.md` files are imported.
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run pyright` pass.

## 8. Out of scope

| Item | Owner |
|---|---|
| Files and images in research (F4.5) | Later |
| Brief from a ticket URL (F3.3) | Later |
| Search memory by meaning / embeddings | Later |
| ADR suggestions (F12.4) | Later |
| Sharing playbooks with a team | Later (team mode) |
| Secret masking in research, Context Pack and memory drafts (F15.4) | M8 |
| Race Mode using a playbook on two agents | M7 |
| Shortcut sheet for the new screens | M9 |

## 9. QA checklist

1. `saarthi research add T-1 --note "hello"` -> shows in the UI Research tab within 1 second.
2. Add a link to `https://example.com` -> title becomes "Example Domain".
3. Add a link to `https://no-such-host.invalid/x` -> saved, title `no-such-host.invalid/x`.
4. Pipe a 50,000-char log as a snippet -> `saarthi context T-1` shows it as cut.
5. Toggle the snippet off -> it is gone from the next preview.
6. `saarthi research run T-1` -> new `agent_finding` item; stage unchanged; `git -C <worktree> status` clean.
7. `saarthi brief draft T-1`, quit the editor without saving -> `saarthi brief versions T-1` shows no new version.
8. `saarthi brief restore T-1 1` -> a new version equal to version 1.
9. Mem screen: open, edit and save a file -> `git diff` in the main repo shows the change. Change the file in another editor, then Save in Saarthi -> refused with "file changed, reload".
10. Ship a test task (local bare remote) -> 3 pending updates. Approve 2, reject 1 -> one new commit on the task branch, none on `main`.
11. Delete the worktree first, then approve the pending updates -> the commit is still made on the task branch and pushed.
12. `saarthi playbook list` -> 5 built-ins. Copy `fix-bug-tdd` to the project, edit it -> the project copy is used.
13. `saarthi playbook render fix-bug-tdd --task T-1` with a typo variable -> warning shown.
14. Import the 3 `quick-prompts.md` files with `--dry-run` -> counts 7, 5, 7, nothing written.

## 10. Open questions

1. **Memory updates after Shipped, not before.** Core TDD 8.5 lists memory updates before the task moves to Shipped. M6 drafts them **after** Shipped so that my approval never blocks shipping. If the PR is already merged when I approve, the commit lands on the branch but not in main (Saarthi warns). OK?
2. **Playbook settings block format.** TDD picks TOML between `+++` lines (no new library). YAML between `---` is more common. Which do I prefer?
3. **Memory screen edits the main checkout** without a commit. Is that right, or should edits go to a "memory" branch?
4. **Research runs do not move the stage.** Core TDD section 7 has "Running -> Ready: plan / research run ends". M6 treats a research run as a side run. OK?
5. **Secrets (known gap 2 in `../README.md`).** Snippets often hold logs with tokens. Until M8 they go to the agent unmasked. Accept for now?
6. Effort is tight for 20 hours. If it runs over, cut first: brief compare view (keep list + restore), then the import `--only` option.

## 11. Effort

About **20 hours**. See TDD section 16 for the breakdown.

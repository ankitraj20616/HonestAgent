# Functional Specifications (FSD)
## Saarthi - Agentic Development Environment

**Version:** 0.1 (draft)
**Date:** 2026-10-11
**Type:** Personal project
**Platform:** Linux desktop (Ubuntu first)

> Simple English. Points and sub-points. "Must" = needed for v1. "Later" = after v1.

---

## 1. Overview

### 1.1 What is Saarthi
- A desktop app for Linux.
- It helps a developer **direct AI coding agents** (Claude Code, Codex).
- The main unit is a **Task**, not a file.
- The developer does: research, write intent, verify, approve.
- The agents do: write code, run tests, explain changes.

### 1.2 The problem
- Today we use an IDE, a terminal, a browser, and many agent chats at once.
- Context is spread everywhere:
  - Research is in browser tabs.
  - Task details are in the head or in a chat.
  - Agent output is in a terminal that scrolls away.
  - Test results are in another terminal.
- Running 2-3 tasks at the same time is hard:
  - Agents touch the same files.
  - We forget which terminal is doing what.
- Verifying is manual and easy to skip.
- Learnings are lost after the session ends.

### 1.3 The solution
- One place per task, called the **Task Room**. It has:
  - the brief (what to build),
  - the research,
  - the live agent work,
  - the proof (tests, checks),
  - the review,
  - the history.
- Each task gets its **own git worktree and branch**. Tasks never clash.
- A task moves on a **board**, stage by stage.
- The app **runs checks by itself** and shows a **Proof Card**.
- The app **remembers** the project (core_docs, learnings) and gives it to the agents.

### 1.4 What makes it different (not an IDE)
- **Task-first, not file-first.** The home screen is a task board, not a file tree.
- **Proof gate.** A task cannot go to "Review" without passing checks.
- **Change Story.** The diff is grouped by "why", with the agent's notes and risk flags.
- **Second Opinion.** One agent builds, another agent reviews (Claude <-> Codex).
- **Race Mode.** The same brief is given to Claude and Codex in parallel. You pick the better result.
- **Project Memory.** The app reads and updates `core_docs/` by itself.
- **Code is "peek only".** You can read code. For heavy editing, one click opens your own editor.

### 1.5 Success criteria
- I can do a full daily task (research -> PR) **without opening an IDE**.
- I can run **3 tasks in parallel** without confusion.
- Every finished task has a **Proof Card**.
- Starting a new task takes **under 30 seconds**.
- After 1 month of use, `core_docs/memory` and `learnings` are **updated by the app**, not by hand.

---

## 2. Users

### 2.1 Primary user: Solo developer (me)
- Python developer.
- Uses Claude Code and Codex every day.
- Works on 3-5 client projects at the same time.
- Spends most time on research, reviewing, and verifying.

### 2.2 Later: small team
- 2-5 developers share playbooks and memory.
- Not in v1.

---

## 3. Key words (glossary)

| Word | Meaning |
|---|---|
| **Project** | A git repo added to Saarthi. |
| **Task** | One piece of work. Example: "Add password reset API". |
| **Brief** | The written intent of a task: goal, acceptance criteria, notes. |
| **Run** | One agent working on one task one time. A task can have many runs. |
| **Agent** | An AI coding tool. v1: Claude Code and Codex CLI. |
| **Workspace** | The git worktree + branch made for a task. |
| **Check** | A command that verifies the work. Example: `pytest`, `ruff`, `npm run build`. |
| **Proof Card** | A summary of all check results + evidence for a task. |
| **Change Story** | The review view: changes grouped by purpose, with explanations. |
| **Playbook** | A saved, reusable prompt recipe. Example: "Fix bug with TDD". |
| **Memory** | Project knowledge: core_docs, learnings, decisions. |
| **Needs You** | A state when the agent is waiting for your answer or permission. |
| **Doc** | A markdown text about a task: a plan, a changed .md file, a pinned project doc, a research finding. |
| **Ticket** | A Jira issue linked to a task. |

---

## 4. Main screens (overview)

1. **Command Deck** (home)
2. **Task Board**
3. **Task Room** (main working screen)
4. **Research Desk** (inside Task Room)
5. **Agent Stream + Terminal** (inside Task Room)
6. **Proof Card** (inside Task Room)
7. **Change Story** (review, inside Task Room)
8. **Memory** (project brain)
9. **Playbooks**
10. **Settings**
11. **Command Bar** (Ctrl+K, works on every screen)
12. **Docs** (tab inside Task Room)
13. **Tickets** (per project)

---

## 5. Functional requirements

### F1. Projects

- **F1.1 Add project** (Must)
  - User picks a folder that is a git repo.
  - App checks:
    - It is a git repo.
    - `git`, `claude`, and `codex` are installed (warn if missing, do not block).
  - App creates a `.saarthi/` folder in the repo with `project.toml`.
  - App finds `core_docs/` (or asks for the docs folder path).
- **F1.2 Project settings** (Must)
  - Default branch (main/master/develop).
  - Default agent (Claude or Codex).
  - Check commands (test, lint, type check, build).
  - Memory folder path (default `core_docs/`).
- **F1.3 Project list** (Must)
  - Shows all projects with: name, open tasks count, running agents count.
- **F1.4 Remove project** (Must)
  - Removes it from Saarthi only. Never deletes the repo.

### F2. Tasks and Task Board

- **F2.1 Create task** (Must)
  - From the board, the Command Bar, or the CLI: `saarthi task new "title"`.
  - Only the title is required. Everything else can come later.
- **F2.2 Quick capture** (Must)
  - Global shortcut opens a small box. Type one line. It goes to the project's Inbox.
- **F2.3 Task stages** (Must)
  - `Inbox` -> `Research` -> `Ready` -> `Running` -> `Verifying` -> `Review` -> `Shipped`
  - Side states:
    - `Needs You` - agent is waiting for you.
    - `Failed` - run or checks failed.
    - `Parked` - paused by you.
    - `Archived` - hidden, kept for history.
- **F2.4 Board view** (Must)
  - One column per stage.
  - Drag and drop to move (only allowed moves, see F2.5).
  - Each card shows: title, agent icon, time spent, cost, check status dot.
  - Cards in `Needs You` glow and go to the top.
- **F2.5 Stage rules** (Must)
  - `Ready` needs a brief with at least a goal.
  - `Review` needs a Proof Card with all required checks green (or a manual override with a reason).
  - `Shipped` needs a commit (and a PR if the project uses PRs).
- **F2.6 Task fields** (Must)
  - Title, brief, stage, priority (P1/P2/P3), labels, linked ticket URL, created/updated dates.
- **F2.7 Filters and search** (Must)
  - By stage, label, agent, text.
- **F2.8 Sub-tasks** (Later)
  - Split a big task into smaller tasks. Agent can suggest the split.

### F3. Task Brief

- **F3.1 Brief editor** (Must)
  - Markdown editor with fixed sections:
    - Goal (what and why)
    - Acceptance criteria (list of "done when" points)
    - Notes / constraints
    - Files or areas to focus (optional)
- **F3.2 Brief from research** (Must)
  - Button: "Draft brief". The agent reads the research notes and writes a brief draft.
  - User edits and approves.
- **F3.3 Brief from ticket** (Must, M10)
  - Start a task from a Jira ticket (Cloud). App pulls the text into the brief draft.
  - See F23.3.
  - GitHub issues stay Later (F23.7).
- **F3.4 Brief versions** (Must)
  - Every save keeps a version. User can see old versions.

### F4. Research Desk

- **F4.1 Notes** (Must)
  - Free notes per task (markdown).
- **F4.2 Links** (Must)
  - Save URLs with a short note. App fetches the page title.
- **F4.3 Snippets** (Must)
  - Paste code, logs, error messages, API responses. Each snippet has a label.
- **F4.4 Ask agent to research** (Must)
  - "Research this" button. Agent explores the codebase in **read-only mode** and writes findings:
    - Related files
    - How the current code works
    - Risks
    - Suggested approach
  - Findings are saved as a research note.
- **F4.5 Files and images** (Later)
  - Attach screenshots, PDFs, designs.
- **F4.6 Use in context** (Must)
  - Each research item has a toggle: "send to agent" yes/no.

### F5. Agents and Runs

- **F5.1 Supported agents** (Must)
  - Claude Code (CLI `claude`)
  - Codex (CLI `codex`)
  - The app uses the user's **existing logins** for these CLIs. It does not ask for API keys if the CLI is already logged in.
- **F5.2 Start a run** (Must)
  - User picks: agent, mode, playbook (optional), extra instruction (optional).
  - Modes:
    - `Plan` - agent only writes a plan. No code changes.
    - `Build` - agent writes code.
    - `Fix` - agent fixes failing checks.
    - `Research` - read-only exploration.
- **F5.3 Context Pack** (Must)
  - Before each run, the app builds a Context Pack:
    - The brief
    - Selected research items
    - Relevant memory (core_docs, learnings)
    - Playbook text (if picked)
    - Project rules (CLAUDE.md / AGENTS.md)
  - User can preview the Context Pack before starting.
- **F5.4 Live Agent Stream** (Must)
  - Shows agent work as clean cards, not raw text:
    - Thinking / message card
    - Tool call card (read file, edit file, run command)
    - Command output (collapsed by default)
    - File changed card (with small diff)
  - Auto-scroll with a "pause scroll" button.
- **F5.5 Raw terminal** (Must)
  - Toggle to see the raw terminal of the agent.
  - User can type into it (interactive mode).
- **F5.6 Needs You** (Must)
  - When the agent asks a question or asks permission:
    - Task moves to `Needs You`.
    - Desktop notification is shown.
    - User answers inside the Task Room.
- **F5.7 Send message during a run** (Must)
  - User can send a follow-up message to the running agent.
- **F5.8 Stop / Resume** (Must)
  - Stop a run at any time.
  - Resume the same agent session later (if the agent supports it).
- **F5.9 Many runs per task** (Must)
  - All runs are listed in the task with: agent, mode, start time, duration, cost, result.
- **F5.10 Parallel runs** (Must)
  - Different tasks can run at the same time.
  - Default limit: 4 running agents. Can be changed in Settings.
- **F5.11 More agents** (Later)
  - Gemini CLI, Aider, local models via the same adapter design.

### F6. Workspace (isolation)

- **F6.1 Auto workspace** (Must)
  - When a task first runs, the app creates:
    - A branch: `saarthi/<task-id>-<short-title>`
    - A git worktree for that branch, outside the main repo folder.
- **F6.2 Setup script** (Must)
  - Optional per project. Runs once after the worktree is created.
  - Example: copy `.env`, `uv sync`, `npm install`.
- **F6.3 Workspace info** (Must)
  - Task Room shows: branch name, path, "ahead/behind main" count, changed files count.
- **F6.4 Open in tools** (Must)
  - Buttons: open folder, open terminal here, open in my editor (`$EDITOR`, Zed, Neovim, etc.).
- **F6.5 Sync with main** (Must)
  - Button: "Update from main" (rebase or merge, user picks in settings).
  - If there is a conflict, the app can start a `Fix` run to solve it.
- **F6.6 Cleanup** (Must)
  - When a task is shipped or archived, the app asks to delete the worktree. The branch is kept.
- **F6.7 Ports** (Later)
  - Give each workspace its own port number, so two dev servers do not clash.

### F7. Checks and Proof

- **F7.1 Check list per project** (Must)
  - Defined in `.saarthi/project.toml`.
  - Each check has: name, command, required yes/no, timeout.
  - Examples: `pytest`, `ruff check`, `mypy`, `npm run build`, `playwright test`.
- **F7.2 Auto-run checks** (Must)
  - After every `Build` or `Fix` run ends, the app runs all checks in the task's workspace.
- **F7.3 Proof Card** (Must)
  - Shows for each check: pass / fail / skipped, time taken, short output.
  - Shows: files changed count, lines added/removed, tests added count.
  - Shows a "Brief coverage" list: each acceptance criterion with a status (met / not sure / not met). The agent fills this, the user confirms.
- **F7.4 Auto-fix loop** (Must)
  - If checks fail, the user can click "Fix with agent".
  - The app sends the failing output to the agent.
  - Max auto-fix rounds: 3 (setting). Then it stops and asks the user.
- **F7.5 Evidence** (Later)
  - Screenshots of web pages (headless browser).
  - API call recordings (request + response).
- **F7.6 Manual override** (Must)
  - User can move a task to Review with failing checks, but must type a reason. The reason is saved.
- **F7.7 Trust score** (Must, M4; second-opinion part in M5)
  - One number from 0 to 100 that sums up the proof of a task:
    - Required checks: 50 points, by the share that pass.
    - Brief criteria: 35 points, by the share marked Met ("Not sure" counts 0 until confirmed).
    - Second opinion: 15 points if no high or medium finding is open, 8 if only medium findings are open, 0 if a high finding is open or no second opinion ran.
  - The daemon computes it. The UI only shows it (Proof ring, Home, Board cards).
  - It never blocks a move. The stage rules stay as in F2.5.

### F8. Second Opinion

- **F8.1 Cross review** (Must)
  - Button: "Get second opinion".
  - If Claude built it, Codex reviews it (and the other way round).
  - The reviewer agent is **read-only**.
- **F8.2 Review result** (Must)
  - A list of findings, each with: file, line, severity (high / medium / low), short reason.
  - Findings show inside the Change Story.
- **F8.3 Send findings back** (Must)
  - User ticks findings and clicks "Fix these". The builder agent gets them as a new run.

### F9. Race Mode

- **F9.1 Race** (Later, M7)
  - Same brief goes to Claude and Codex at the same time.
  - Each one works in its own worktree.
- **F9.2 Compare** (Later, M7)
  - Side by side: Proof Cards, diff size, cost, time.
- **F9.3 Pick winner** (Later, M7)
  - The winner branch stays. The loser worktree is deleted.

### F10. Change Story (Review)

- **F10.1 Grouped changes** (Must)
  - Changes are grouped by purpose, not by file. Example groups:
    - "New API endpoint"
    - "Database change"
    - "Tests"
  - The agent writes a 1-2 line explanation for each group.
- **F10.2 Risk flags** (Must)
  - Auto flags on:
    - DB migrations
    - Deleted files
    - Changes to auth / security code
    - New dependencies
    - Changes to config / env / CI files
    - Big files (more than 300 changed lines)
- **F10.3 Diff view** (Must)
  - Side-by-side or unified diff for each file.
  - Read-only.
- **F10.4 Comments** (Must)
  - User can comment on any line or group.
  - "Send comments to agent" starts a `Fix` run with all comments.
- **F10.5 Approve / Reject** (Must)
  - Approve the whole task, or reject with a note.
- **F10.6 Plain file view** (Must)
  - A normal "files changed" list for users who want it.

### F11. Ship

- **F11.1 Commit** (Must)
  - The agent drafts the commit message. User edits and confirms.
  - Commit style follows the project setting (for example Conventional Commits).
- **F11.2 Push and PR** (Must)
  - Push the branch.
  - Create a PR with GitHub CLI (`gh`). The PR body uses the brief + Change Story + Proof Card.
- **F11.3 No direct push to main** (Must)
  - The app never pushes to the default branch.
- **F11.4 PR status** (Later)
  - Show CI status and review comments from GitHub in the Task Room.

### F12. Project Memory

- **F12.1 Memory viewer** (Must)
  - Shows the project's `core_docs/` as a tree with a markdown viewer and simple editor.
- **F12.2 Smart context** (Must)
  - For each run, the app picks the most relevant memory files and adds them to the Context Pack.
  - v1: simple keyword match + always-include list (FSD, TDD, CLAUDE.md).
  - Later: search by meaning (embeddings).
- **F12.3 Auto memory update** (Must)
  - When a task is shipped, the agent drafts updates for:
    - `memory/project_memory.md` (what was done, hard bugs, solutions)
    - `learnings/` (new rules or mistakes)
    - `timeline/timeline.md` (date + task)
  - User approves each update before it is saved.
- **F12.4 Decisions** (Later)
  - When the brief or review has a big decision, the app suggests a new ADR file in `decisions/`.

### F13. Playbooks

- **F13.1 Playbook library** (Must)
  - Saved prompt recipes. Each has: name, description, prompt text, default agent, default mode.
- **F13.2 Built-in playbooks** (Must)
  - "Plan first, then build"
  - "Fix bug with TDD (failing test first)"
  - "Refactor without behaviour change"
  - "Write tests for this module"
  - "Review for security"
- **F13.3 Variables** (Must)
  - Playbooks can use variables like `{{task.title}}`, `{{brief}}`, `{{failing_checks}}`.
- **F13.4 Scope** (Must)
  - Global playbooks (all projects) and project playbooks (in `.saarthi/playbooks/`).

### F14. Timeline and Rewind

- **F14.1 Task timeline** (Must)
  - Every event is saved: brief edits, runs, agent tool calls, checks, comments, stage moves.
  - Shown as one vertical timeline.
- **F14.2 Checkpoints** (Must)
  - The app makes a git checkpoint (a hidden commit) at the end of every run.
- **F14.3 Rewind** (Must)
  - User can restore the workspace to any checkpoint.
  - The current state is saved as a checkpoint first, so nothing is lost.
- **F14.4 Replay** (Later)
  - Play back a run step by step.

### F15. Safety and Permissions

- **F15.1 Permission profiles** (Must)
  - `Read-only` - agent can read, not write or run commands.
  - `Safe build` (default) - agent can edit files in its worktree and run allowed commands.
  - `Full` - agent can do anything inside the worktree. Must be turned on per task.
- **F15.2 Blocked actions** (Must)
  - Always blocked or always asked:
    - `git push` to the default branch
    - `rm -rf` outside the worktree
    - Reading `~/.ssh`, `~/.aws`, and other secret folders
    - Production DB commands (patterns set by user)
- **F15.3 Sandbox** (Later, M8)
  - Run the agent inside a Linux sandbox (bubblewrap) so it can only see its worktree.
- **F15.4 Secret masking** (Must)
  - Values from `.env` files and known key patterns are hidden in logs and in the UI.

### F16. Cost and Time Meter

- **F16.1 Per run** (Must)
  - Tokens (if the agent reports them), cost (if reported), time.
- **F16.2 Per task and per day** (Must)
  - Totals on the task card and on the Command Deck.
- **F16.3 Budget alert** (Later)
  - Warn when a task or day goes over a set amount.

### F17. Code Peek

- **F17.1 Read-only code viewer** (Must)
  - File tree of the workspace + code viewer with syntax colours.
- **F17.2 Quick search** (Must)
  - Search file names and text (uses `ripgrep`).
- **F17.3 Small edits** (Must)
  - Allow tiny edits (a typo, a value). Not a full editor.
- **F17.4 Open in editor** (Must)
  - One click to open the file at the line in the user's editor.

### F18. Command Bar and Keyboard

- **F18.1 Command Bar** (Must)
  - `Ctrl+K` opens it on any screen.
  - Search tasks, projects, playbooks, and actions ("run checks", "new task", "open in editor").
- **F18.2 Keyboard first** (Must)
  - Every main action has a shortcut. A `?` key shows the shortcut list.

### F19. Notifications

- **F19.1 Desktop notifications** (Must)
  - Agent needs you.
  - Run finished.
  - Checks failed / passed.
- **F19.2 Sound** (Later)
  - Optional sound for "Needs You".
- **F19.3 Phone glance** (Later)
  - Read-only web page on the phone (same Wi-Fi, with a token) to see task status and answer "Needs You" questions.

### F20. CLI (`saarthi`)

- **F20.1 Same power as the UI** (Must)
  - `saarthi project add <path>`
  - `saarthi task new "<title>"`
  - `saarthi task list`
  - `saarthi run <task-id> --agent claude --mode build`
  - `saarthi checks <task-id>`
  - `saarthi review <task-id>` (prints the Change Story)
  - `saarthi ship <task-id>`
  - `saarthi daemon start|stop|status`
- **F20.2 JSON output** (Must)
  - `--json` flag for scripts.

### F21. Settings

- **F21.1 Global** (Must)
  - Theme (light / dark / system).
  - Default editor command.
  - Max parallel runs.
  - Max auto-fix rounds.
  - Worktree root folder.
  - Agent CLI paths (`claude`, `codex`).
- **F21.2 Health check** (Must)
  - A page that shows: daemon running, git version, agent CLIs found and logged in, `gh` logged in.

### F22. Task Docs

- **F22.1 Docs tab in the Task Room** (Must, M3)
  - A list of docs, a markdown view, and an outline of headings.
  - Docs are read-only in Saarthi. "Open in editor" is for changes.
- **F22.2 Plan run saved as a doc** (Must, M2)
  - When a `Plan` run ends well, its full final answer is saved as a markdown file.
  - A failed or stopped plan run saves nothing.
  - The file is kept outside the worktree, so a plan run never changes a worktree file.
- **F22.3 Changed markdown files are listed** (Must, M2 CLI + API, M3 UI)
  - Every `.md` file added or changed on the task branch is listed (committed or not).
  - Each one has an "added" or "modified" badge.
- **F22.4 Pinned project docs are listed** (Must, M2 CLI + API, M3 UI)
  - Docs like FSD, TDD, CLAUDE.md are listed. They are read from the task worktree.
  - The pinned list is set in `project.toml`. Missing files are skipped quietly.
  - A file that is pinned and changed shows once, as changed.
- **F22.5 Research findings and plan in context** (Must, M6)
  - Research findings show in Docs.
  - The latest plan goes into the Context Pack of the next `Build` or `Fix` run.
- **F22.6 Edit docs in Saarthi, render Mermaid diagrams** (Later)

### F23. Tickets (Jira)

- **F23.1 Connect Jira Cloud** (Must, M10)
  - Site, email, API token. A health check shows who I am.
  - The token is kept outside the repo.
- **F23.2 Tickets panel per project** (Must, M10)
  - Views: Mine, Sprint, and saved JQL views from `project.toml`.
  - Search and refresh.
- **F23.3 Start a task from a ticket** (Must, M10)
  - One click makes a task with a brief draft from the ticket.
  - A ticket already linked to a task opens that task.
  - An existing task can be linked to a ticket.
- **F23.4 Ticket chip** (Must, M10)
  - Shown in the Task Room header and on Board cards.
- **F23.5 Write back with confirm** (Must, M10)
  - Move the ticket status, add a PR comment, add a link to the PR.
  - Every write needs my OK by default. A project can turn on auto send.
  - Status moves only go forward (Running < Review < Shipped). A fix run after Review does not move the ticket back to "In Progress".
  - Home's "Needs You" list does not count these.
- **F23.6 Cache and offline view** (Must, M10)
  - Tickets are cached. When Jira is not reachable, the cache shows with "last synced" time.
  - No background polling. Refresh is by hand, or when the panel opens and the cache is old.
- **F23.7 GitHub Issues and other providers** (Later)
- **F23.8 Create a Jira ticket from Saarthi; two-way comment sync** (Later)
- **F23.9 Jira Data Center / Server** (Later)

---

## 6. Main user flows

### 6.1 Daily task flow (the main flow)
1. Press quick capture. Type "Add password reset API". It lands in Inbox.
2. Open the task. Move it to Research.
3. Click "Research this". Claude explores the code (read-only) and writes findings.
4. Add your own notes and links.
5. Click "Draft brief". Edit it. Move to Ready.
6. Click Run -> Claude -> Build -> Playbook "Plan first, then build".
7. Watch the stream, or go do something else.
8. Get a notification: "Needs You - should I add a new table?". Answer "yes".
9. Run ends. Checks run by themselves. Proof Card: 1 test failed.
10. Click "Fix with agent". Checks pass. Task moves to Review.
11. Click "Get second opinion". Codex finds 1 medium issue.
12. Tick it. Click "Fix these". Checks pass again.
13. Read the Change Story. Approve.
14. Click Ship. Commit message drafted. PR created.
15. Approve the memory updates. Task moves to Shipped.

### 6.2 Parallel flow
1. Task A is running (Claude).
2. Start Task B (Codex) in another worktree.
3. Board shows both in `Running`, each with live status.
4. Whichever needs you first glows.

### 6.3 Bug fix flow
1. Paste the error log into Research as a snippet.
2. Pick playbook "Fix bug with TDD".
3. Agent writes a failing test, then the fix.
4. Proof Card shows the new test: failed before, passes after.

### 6.4 Ticket flow
1. Open Tickets for project `acme-billing`.
2. Pick the view "Mine". Find ACME-151 "Export invoices as CSV".
3. Click "Start as task". Task T-0033 is made.
4. T-0033 has a brief draft from the ticket: goal, acceptance criteria, notes. Edit it and approve.
5. Run Claude -> Build. Checks run by themselves.
6. Task moves to Review.
7. A card shows: "Move ACME-151 to In Review?" Click Send. Jira status changes.
8. Approve the Change Story. Click Ship. The PR is created.
9. A card offers a PR comment and a link on ACME-151. Click Send.
10. The ticket now shows the PR link and comment.

---

## 7. Non-functional requirements

- **NF1 Speed**
  - App opens in under 2 seconds.
  - Agent events show in the UI in under 300 ms.
- **NF2 Scale**
  - 10 projects, 500 tasks, 4+ parallel runs without lag.
- **NF3 Reliability**
  - If the app UI closes, runs keep going (the daemon keeps them alive).
  - If the daemon restarts, unfinished runs are marked `Interrupted` and can be resumed.
  - No data loss: every event is saved to disk as it comes.
- **NF4 Privacy**
  - All data stays on the machine. No telemetry.
  - Code only goes to the agent providers the user already uses.
- **NF5 Resource use**
  - Daemon idle RAM under 200 MB.
- **NF6 Platform**
  - Ubuntu 24.04+ first. Other Linux distros later. No Windows / Mac in v1.

---

## 8. Out of scope (v1)

- Being a full code editor (no LSP, no debugger, no extensions).
- Windows and macOS.
- Our own AI model or our own cloud server.
- Team / multi-user features.
- Mobile app (only a read-only phone page, later).
- Jira Data Center, creating Jira tickets (v1).

---

## 9. Open questions

- Q1: Rebase or merge for "Update from main"? (Default: rebase, setting to change.)
- Q2: Where to keep worktrees? Inside `~/.local/share/saarthi/worktrees/` or next to the repo? (Default: first one.)
- Q3: Should Race Mode count as one task or two? (Default: one task, two runs.)

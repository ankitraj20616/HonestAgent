# Functional Specifications (FSD)
## Saarthi - Agentic Development Environment

**Version:** 0.2 (draft)
**Date:** 2026-10-23
**Type:** Personal project
**Platform:** Linux, macOS and Windows (one app, one codebase)
**UI spec:** `design/2026-10-23-simple-ui-design.md` (screens, words, statuses). Prototype: `design/Saarthi Prototype.html`.

> Simple English. Points and sub-points. "Must" = needed for v1. "Later" = after v1.

---

## 1. Overview

### 1.1 What is Saarthi
- A light desktop app for Linux, macOS and Windows.
- It helps a developer **direct AI coding agents** (Claude Code, Codex, Gemini CLI).
- The main unit is a **Task**, not a file.
- One window holds **many git repos** (projects).
- The developer does: research, write intent, verify, approve.
- The agents do: write code, run tests, explain changes.

### 1.2 The problem
- Today we use an IDE, a terminal, a browser, and many agent chats at once.
- Each repo needs its own IDE window.
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
- One place per task, called the **Task page**. It has:
  - the goal (what to build),
  - the research,
  - the live agent work (Activity),
  - the checks and the review (**Check and ship**),
  - the history (under More).
- Each task gets its **own git worktree and branch** ("its own copy of the repo"). Tasks never clash.
- On screen a task has one of **4 statuses**: To do, Working, Needs you, Done. Inside, the engine moves it stage by stage.
- The app **runs checks by itself** and shows a simple **verdict**.
- A **Files** screen shows the code like an IDE file view, for exploring and reviewing.
- The app **remembers** the project (core_docs, learnings) and gives it to the agents.
- All repos live in **one window**: project tabs and **All projects** on Home.

### 1.4 What makes it different (ADE with a built-in IDE-style file view)
- **Task-first, not file-first.** Home is a list of tasks across all projects, not a file tree.
- **Many repos, one window.** No new window per repo.
- **Proof gate.** A task cannot reach the `Review` stage without passing checks.
- **What changed.** The diff is grouped by "why", with the agent's notes and risk tags.
- **Ask Codex to review.** One agent builds, another agent reviews.
- **Side by side.** The same goal goes to two agents in parallel. You pick the better result.
- **Project Memory.** The app reads and updates `core_docs/` by itself.
- **Files, IDE-style, for reading.** Tree, tabs, syntax colours, changes against `main`. Only tiny edits. For heavy editing, one click opens your own editor. Not built on VS Code.
- **Light and cross-platform.** One small app for Linux, macOS and Windows. No Electron.

### 1.5 Success criteria
- I can do a full daily task (research -> PR) **without opening an IDE**.
- I can run **3 tasks in parallel**, in **different repos**, from one window, without confusion.
- Every finished task has **proof** (checks + verdict).
- Starting a new task takes **under 30 seconds**.
- A new user goes from opening the app to an open pull request, without help, in **under 5 minutes**.
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

Engine words stay in the code, API and CLI. The UI shows the label in the middle column (full list: UI spec, section 5).

| Word (engine) | UI label | Meaning |
|---|---|---|
| **Project** | Project | A git repo added to Saarthi. One window holds many projects. |
| **Task** | Task | One piece of work. Example: "Add password reset API". |
| **Brief** | Goal | The written intent of a task: goal, acceptance criteria, notes. |
| **Acceptance criteria** | What done looks like | The "done when" points of a brief. The agent pre-fills them. |
| **Stage** | Status | The engine has 8 stages. The UI groups them into 4 statuses (F2.9). |
| **Run** | Start (button) | One agent working on one task one time. A task can have many runs. |
| **Agent** | its name ("Claude", "Codex", "Gemini") | An AI coding tool. v1: Claude Code, Codex, Gemini CLI. |
| **Workspace** | "its own copy of the repo" | The git worktree + branch made for a task. Branch details under More -> Details. |
| **Check** | Tests and checks | A command that verifies the work. Example: `pytest`, `ruff`, `npm run build`. |
| **Proof Card** | Check and ship (checks part) | A summary of all check results + evidence for a task. |
| **Trust score** | Verdict: Looks good / Take a look / Has problems | A 0-100 number made by the daemon. The UI shows a verdict (F7.7). |
| **Change Story** | What changed | The review view: changes grouped by purpose, with explanations. |
| **Second Opinion** | Ask Codex to review | A read-only review by a second agent. |
| **Playbook** | Saved instructions | A saved, reusable prompt recipe. Example: "Fix bug with TDD". |
| **Memory** | Lessons and notes | Project knowledge: core_docs, learnings, decisions. |
| **Memory update** | Lessons learned | Drafted memory changes, shown as a card after shipping. |
| **Context Pack** | What Claude reads | The file the agent reads before a run. |
| **Checkpoint / Rewind** | Undo point / Restore | A hidden snapshot of the worktree, and going back to it. |
| **Race Mode** | Side by side | One goal, two agents, pick the winner. |
| **Needs You** | Needs you ("Claude has a question") | The agent is waiting for your answer or permission. |
| **Permission profile** | What agents may do: Read only / Safe / Full access | How much an agent may do in its worktree. |
| **Daemon** | Background service | `saarthid`. Shown only when broken. |
| - | Home | The start screen: project tabs + All projects. |
| - | All projects | One merged task list of every project. |
| - | Files | The IDE-style file view (F17). |
| **Doc** | Doc | A markdown text about a task: a plan, a changed .md file, a pinned project doc, a research finding. |
| **Ticket** | Jira ticket | A Jira issue linked to a task. |

---

## 4. Main screens (overview)

Details and view ids: UI spec, section 8. The top bar has: logo, project picker (with the project tools), search or jump (`Ctrl K`), the Needs-you pill, Settings. There is no sidebar and no dock.

1. **Home** - project tabs + All projects. Groups: Needs you, Working, To do. Done this week.
2. **Board view** - 4 columns (project menu). "Show detailed stages" shows the engine stage.
3. **New task** - a drafted goal + More options (how to work, saved instructions, note, side by side, safety).
4. **Task page** - goal card, Activity, answers to the agent. More: Terminal, Docs, History, Details, What Claude reads.
5. **Files** - IDE-style file view, per task and per project (F17).
6. **Check and ship** - verdict, tests and checks, what changed, Ask Codex to review, Approve and create pull request.
7. **Done** - PR link, lessons learned, Jira write-back.
8. **Side by side** - two agents on one goal, compare and pick.
9. **Lessons and notes** - project memory (project menu).
10. **Saved instructions** - playbooks (project menu).
11. **Jira tickets** - per project (project menu, M10).
12. **Safety and cost** - what agents may do, sandbox, budget, cost.
13. **Settings** - General, Agents, Project, Safety, Jira, Health, About.
14. **Command bar** (`Ctrl K`, every screen) + New task from any app (`Ctrl Alt N`) + shortcut list (`?`).

---

## 5. Functional requirements

### F1. Projects

- **F1.1 Add project** (Must)
  - User picks a folder that is a git repo.
  - App checks:
    - It is a git repo.
    - `git` and the agent CLIs (`claude`, `codex`, `gemini`) are installed (warn if missing, do not block).
  - App creates a `.saarthi/` folder in the repo with `project.toml`.
  - App finds `core_docs/` (or asks for the docs folder path).
- **F1.2 Project settings** (Must)
  - Default branch (main/master/develop).
  - Default agent (Claude, Codex or Gemini). Claude is the default.
  - Check commands (test, lint, type check, build).
  - Memory folder path (default `core_docs/`).
- **F1.3 Project list** (Must)
  - Shows all projects with: name, open tasks count, running agents count.
  - In the UI: the project picker menu and the project tabs on Home.
- **F1.4 Remove project** (Must)
  - Removes it from Saarthi only. Never deletes the repo.
- **F1.5 Many projects in one window** (Must, M3)
  - The user adds every repo once. No second window, no "open folder" per repo.
  - Home has one tab per project plus **All projects**, which merges the tasks of every project. Each row shows its project.
  - The top bar has a project picker. Its menu has the project tools (Board view, Lessons and notes, Saved instructions, Jira tickets, Safety and cost, Project files) and the list of all projects.
  - The "Needs you" count and notifications cover every project.
  - A new task picks its project (default: the open project tab).
  - Each task still has its own branch and worktree in its own repo.
  - CLI: `saarthi task list` without a project lists the tasks of all projects.

### F2. Tasks and Board view

- **F2.1 Create task** (Must)
  - From Home (**New task**), the Command bar, or the CLI: `saarthi task new "title"`.
  - Only the title (a one-line description) and the project are required. Everything else can come later.
- **F2.2 Quick capture** (Must)
  - `Ctrl Alt N` from any app opens a small New task box. Type one line. It goes to the To do list of the chosen project.
- **F2.3 Task stages** (Must)
  - `Inbox` -> `Research` -> `Ready` -> `Running` -> `Verifying` -> `Review` -> `Shipped`
  - Side states:
    - `Needs You` - agent is waiting for you.
    - `Failed` - run or checks failed.
    - `Parked` - paused by you.
    - `Archived` - hidden, kept for history.
  - These are engine stages. The UI shows them as 4 statuses (F2.9).
- **F2.4 Board view** (Must)
  - Project menu -> Board view. 4 columns, one per status (F2.9).
  - "Show detailed stages" adds the engine stage name to each card.
  - Drag and drop to move (only allowed moves, see F2.5).
  - Each card shows: title, agent icon, time spent, cost, check status dot.
  - Cards in Needs you glow and go to the top.
- **F2.5 Stage rules** (Must)
  - `Ready` needs a brief with at least a goal.
  - `Review` needs a Proof Card with all required checks green (or a manual override with a reason).
  - `Shipped` needs a commit (and a PR if the project uses PRs).
- **F2.6 Task fields** (Must)
  - Title, brief, stage, priority (P1/P2/P3), labels, linked ticket URL, created/updated dates.
- **F2.7 Filters and search** (Must)
  - By project, status, stage, label, agent, text.
  - `Parked` and `Archived` tasks show only with a filter.
- **F2.8 Sub-tasks** (Later)
  - Split a big task into smaller tasks. Agent can suggest the split.
- **F2.9 Simple statuses** (Must, M3)
  - The UI shows 4 statuses. Each one groups engine stages:

| Status on screen | Engine stages | Row action |
|---|---|---|
| **Needs you** | `Needs You`, `Failed`, `Review`, and any Jira write-back or conflict waiting for the user | Answer / Fix / Review |
| **Working** | `Running`, `Verifying` | none (open the task) |
| **To do** | `Inbox`, `Research`, `Ready` | Start (when a goal exists) |
| **Done** | `Shipped` (+ pending lessons) | PR link |

  - `Parked` and `Archived` are hidden behind a filter.
  - The engine stages and `ALLOWED_MOVES` do not change. Only the UI groups them.
  - The daemon gives the status with each task, so the UI and the CLI show the same thing.

### F3. Task Goal (brief)

- **F3.1 Goal card** (Must)
  - On the task page. "Edit" opens a markdown editor with fixed sections:
    - Goal (what and why)
    - What done looks like (acceptance criteria, a list of "done when" points)
    - Notes / constraints
    - Files or areas to focus (optional)
- **F3.2 Goal from research** (Must)
  - Button: "Make a goal from this" on the research view. The agent reads the research notes and writes a brief draft.
  - New task shows a drafted goal from the one-line description, made the same way.
  - User edits and starts.
- **F3.3 Brief from ticket** (Must, M10)
  - Start a task from a Jira ticket (Cloud). App pulls the text into the brief draft.
  - See F23.3.
  - GitHub issues stay Later (F23.7).
- **F3.4 Brief versions** (Must)
  - Every save keeps a version. User can see old versions (Goal card -> Edit -> History).

### F4. Research

- **F4.1 Notes** (Must)
  - Free notes per task (markdown).
- **F4.2 Links** (Must)
  - Save URLs with a short note. App fetches the page title.
- **F4.3 Snippets** (Must)
  - Paste code, logs, error messages, API responses. Each snippet has a label.
- **F4.4 Ask agent to research** (Must)
  - New task -> More options -> "Just research", or "Research this" on a task. Agent explores the codebase in **read-only mode** and writes findings:
    - Related files
    - How the current code works
    - Risks
    - Suggested approach
  - Findings are saved as a research note and shown on the task page research view.
  - "Make a goal from this" turns them into a goal (F3.2).
- **F4.5 Files and images** (Later)
  - Attach screenshots, PDFs, designs.
- **F4.6 Use in context** (Must)
  - Each research item has a toggle: "send to agent" yes/no.

### F5. Agents and Runs

- **F5.1 Supported agents** (Must)
  - Claude Code (CLI `claude`) - M2. The default.
  - Codex (CLI `codex`) - M2.
  - Gemini CLI (CLI `gemini`) - M7.
  - All of them sit behind the `AgentAdapter` interface. Labels use the agent's name ("Claude has a question", "Let Codex fix it").
  - The app uses the user's **existing logins** for these CLIs. It does not ask for API keys if the CLI is already logged in.
- **F5.2 Start a run** (Must)
  - **Start** uses the defaults: the project's default agent, `Build` mode. No choice is needed.
  - New task -> agent picker + More options lets the user pick: agent, how to work (mode), saved instructions (optional), a note (optional).
  - Modes:
    - `Plan` - agent only writes a plan. No code changes.
    - `Build` - agent writes code.
    - `Fix` - agent fixes failing checks.
    - `Research` - read-only exploration.
- **F5.3 Context Pack** (Must)
  - Before each run, the app builds a Context Pack (UI: "What Claude reads"):
    - The brief
    - Selected research items
    - Relevant memory (core_docs, learnings)
    - Playbook text (if picked)
    - Project rules (CLAUDE.md / AGENTS.md)
  - User can open it before or after starting: task page -> More -> What Claude reads.
- **F5.4 Live activity** (Must)
  - The **Activity** tab on the task page shows agent work as clean cards, not raw text:
    - Thinking / message card
    - Tool call card (read file, edit file, run command)
    - Command output (collapsed by default)
    - File changed card (with small diff)
  - Auto-scroll with a "pause scroll" button.
- **F5.5 Raw terminal** (Must)
  - Task page -> More -> Terminal shows the raw terminal of the agent.
  - User can type into it (interactive mode).
- **F5.6 Needs You** (Must)
  - When the agent asks a question or asks permission:
    - Task moves to `Needs You` (status Needs you: "Claude has a question").
    - Desktop notification is shown.
    - User answers on the task page (or from the row on Home).
- **F5.7 Send message during a run** (Must)
  - User can send a follow-up message to the running agent.
- **F5.8 Stop / Resume** (Must)
  - Stop a run at any time.
  - Resume the same agent session later (if the agent supports it).
- **F5.9 Many runs per task** (Must)
  - All runs are listed in the task (More -> Details) with: agent, mode, start time, duration, cost, result.
- **F5.10 Parallel runs** (Must)
  - Different tasks can run at the same time, in the same or in different projects.
  - Default limit: 4 running agents across all projects. Can be changed in Settings.
- **F5.11 More agents** (Later)
  - Aider, local models, others, via the same adapter design.

### F6. Workspace (isolation)

- **F6.1 Auto workspace** (Must)
  - When a task first runs, the app creates:
    - A branch: `saarthi/<task-id>-<short-title>`
    - A git worktree for that branch, outside the main repo folder.
  - The UI calls it "its own copy of the repo".
- **F6.2 Setup script** (Must)
  - Optional per project. Runs once after the worktree is created.
  - Example: copy `.env`, `uv sync`, `npm install`.
- **F6.3 Workspace info** (Must)
  - Task page -> More -> Details shows: branch name, path, "ahead/behind main" count ("Behind main"), changed files count.
- **F6.4 Open in tools** (Must)
  - Buttons: open folder, open terminal here, open in my editor (`$EDITOR`, Zed, Neovim, etc.).
- **F6.5 Sync with main** (Must)
  - Button: "Update from main" in Details (rebase or merge, user picks in settings).
  - If there is a conflict, the task shows in Needs you with "Let Claude fix it", which starts a `Fix` run to solve it.
- **F6.6 Cleanup** (Must)
  - When a task is shipped or archived, there is no prompt. The worktree is removed after 7 days (`WORKTREE_CLEANUP_DAYS` in `config.py`). The branch is kept.
  - Done shows a link to remove it now.
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
  - Shown as the checks part of **Check and ship** ("Tests and checks").
  - Shows for each check: pass / fail / skipped, time taken, short output ("Show output").
  - Shows: files changed count, lines added/removed, tests added count.
  - Shows a "What done looks like" list: each acceptance criterion with a status (met / not sure / not met). The agent fills this.
  - The user answers only the "Not sure" ones: "That's fine" (counts as met) or "Ask Claude to add it" (starts a `Fix` run). There is no "Confirm all".
- **F7.4 Auto-fix loop** (Must)
  - If checks fail, the user can click "Let Claude fix it".
  - The app sends the failing output to the agent.
  - Max auto-fix rounds: 3 (setting). Then it stops and asks the user.
- **F7.5 Evidence** (Later)
  - Screenshots of web pages (headless browser).
  - API call recordings (request + response).
- **F7.6 Manual override** (Must)
  - "Review anyway": user can move a task to Review with failing checks, but must type a reason. The reason is saved.
- **F7.7 Trust score** (Must, M4; second-opinion part in M5)
  - One number from 0 to 100 that sums up the proof of a task:
    - Required checks: 50 points, by the share that pass.
    - Brief criteria: 35 points, by the share marked Met ("Not sure" counts 0 until the user says "That's fine").
    - Second opinion: 15 points if no high or medium finding is open, 8 if only medium findings are open, 0 if a high finding is open or no second opinion ran.
  - The daemon computes it, and also a **verdict** from it:

| Verdict | When |
|---|---|
| **Has problems** | A required check failed, or a high finding is open. |
| **Take a look** | Every required check passed, but a goal is "Not met", a medium finding is open, or the score is below `TRUST_GOOD_MIN`. |
| **Looks good** | Every required check passed, no goal is "Not met", no medium or high finding is open, and the score is at least `TRUST_GOOD_MIN`. |

  - `TRUST_GOOD_MIN = 70` lives in `config.py`.
  - A "Not sure" goal does not change the verdict.
  - The UI shows the verdict on Check and ship. The number shows only under "How we decided".
  - It never blocks a move. The stage rules stay as in F2.5.

### F8. Second Opinion (Ask Codex to review)

- **F8.1 Cross review** (Must)
  - An optional card on Check and ship: "Ask Codex to review".
  - The reviewer is another agent than the builder. If Claude built it, Codex reviews it (and the other way round). The label uses the reviewer's name.
  - The reviewer agent is **read-only**.
- **F8.2 Review result** (Must)
  - A list of findings, each with: file, line, severity (high / medium / low), short reason.
  - Findings show inside What changed.
- **F8.3 Send findings back** (Must)
  - User ticks findings and clicks "Fix these". The builder agent gets them as a new run.

### F9. Side by side (Race Mode)

- **F9.1 Race** (Later, M7)
  - New task -> More options -> Side by side.
  - The same goal goes to two agents (for example Claude and Codex) at the same time.
  - Each one works in its own worktree.
- **F9.2 Compare** (Later, M7)
  - Side by side: checks, verdict, diff size, cost, time.
- **F9.3 Pick winner** (Later, M7)
  - The winner branch stays. The loser worktree is deleted.

### F10. What changed (Change Story)

- **F10.1 Grouped changes** (Must)
  - Part of Check and ship. Changes are grouped by purpose, not by file. Example groups:
    - "New API endpoint"
    - "Database change"
    - "Tests"
  - The agent writes a 1-2 line explanation for each group.
- **F10.2 Risk flags** (Must)
  - Auto flags, shown as a small tag on a group (for example "Login code", "Migration"), on:
    - DB migrations
    - Deleted files
    - Changes to auth / security code
    - New dependencies
    - Changes to config / env / CI files
    - Big files (more than 300 changed lines)
- **F10.3 Diff view** (Must)
  - Open a group to see the diff of its files. Side-by-side or unified.
  - Read-only. The same diff also shows in Files (F17.5).
- **F10.4 Comments** (Must)
  - Open a group, comment on any line or on the group.
  - "Send to Claude" starts a `Fix` run with all comments.
- **F10.5 Approve / Reject** (Must)
  - Approve the whole task ("Approve and create pull request", F11), or reject with a note.
- **F10.6 Plain file view** (Must)
  - A normal "files changed" list for users who want it: Files -> "Show changes" (F17.5).

### F11. Ship

- **F11.1 Commit** (Must)
  - **Approve and create pull request** has no dialog. It uses a commit message and PR text drafted by the agent.
  - "Edit pull request text" is optional. It lets the user change the text first.
  - Commit style follows the project setting (for example Conventional Commits).
- **F11.2 Push and PR** (Must)
  - Push the branch.
  - Create a PR with GitHub CLI (`gh`). The PR body uses the goal + what changed + the checks.
- **F11.3 No direct push to main** (Must)
  - The app never pushes to the default branch.
- **F11.4 PR status** (Later)
  - Show CI status and review comments from GitHub on the task page.

### F12. Project Memory (Lessons and notes)

- **F12.1 Memory viewer** (Must)
  - **Lessons and notes** (project menu) shows the project's `core_docs/` as a tree with a markdown viewer and simple editor.
- **F12.2 Smart context** (Must)
  - For each run, the app picks the most relevant memory files and adds them to the Context Pack.
  - v1: simple keyword match + always-include list (FSD, TDD, CLAUDE.md).
  - Later: search by meaning (embeddings).
- **F12.3 Auto memory update** (Must)
  - When a task is shipped, the agent drafts updates for:
    - `memory/project_memory.md` (what was done, hard bugs, solutions)
    - `learnings/` (new rules or mistakes)
    - `timeline/timeline.md` (date + task)
  - They show as an optional **Lessons learned** card on Done. User approves each update before it is saved.
- **F12.4 Decisions** (Later)
  - When the brief or review has a big decision, the app suggests a new ADR file in `decisions/`.

### F13. Playbooks (Saved instructions)

- **F13.1 Playbook library** (Must)
  - **Saved instructions** (project menu). Each has: name, description, prompt text, default agent, default mode.
  - Picked in New task -> More options.
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

### F14. Timeline and Rewind (History and undo points)

- **F14.1 Task timeline** (Must)
  - Every event is saved: brief edits, runs, agent tool calls, checks, comments, stage moves.
  - Shown as one vertical list: task page -> More -> History.
- **F14.2 Checkpoints** (Must)
  - The app makes a git checkpoint (a hidden commit, UI: "undo point") at the end of every run.
- **F14.3 Rewind** (Must)
  - User can restore the workspace to any checkpoint (History -> Restore, with a confirm).
  - The current state is saved as a checkpoint first, so nothing is lost.
- **F14.4 Replay** (Later)
  - Play back a run step by step.

### F15. Safety and Permissions

- **F15.1 Permission profiles** (Must)
  - UI: "What agents may do", in Settings -> Safety and cost, and per task in Details.
  - `Read-only` ("Read only") - agent can read, not write or run commands.
  - `Safe build` ("Safe", default) - agent can edit files in its worktree and run allowed commands.
  - `Full` ("Full access") - agent can do anything inside the worktree. Must be turned on per task. Not offered on Windows in v1 (see F15.3).
- **F15.2 Blocked actions** (Must)
  - Always blocked or always asked:
    - `git push` to the default branch
    - `rm -rf` outside the worktree
    - Reading `~/.ssh`, `~/.aws`, and other secret folders
    - Production DB commands (patterns set by user)
  - An "always ask" action shows as a Needs-you card on the task page.
- **F15.3 Sandbox** (Later, M8)
  - Run the agent inside an OS sandbox so it can only see its worktree:
    - Linux: bubblewrap (`bwrap`).
    - macOS: a `sandbox-exec` profile.
    - Windows v1: no OS sandbox. So "Full access" is not offered on Windows. Read only and Safe still work.
- **F15.4 Secret masking** (Must)
  - Values from `.env` files and known key patterns are hidden in logs and in the UI.

### F16. Cost and Time Meter

- **F16.1 Per run** (Must)
  - Tokens (if the agent reports them), cost (if reported), time.
- **F16.2 Per task and per day** (Must)
  - Totals per task (Board card, More -> Details) and per day (Safety and cost).
- **F16.3 Budget alert** (Later)
  - Warn when a task or day goes over a set amount.

### F17. Files (IDE view)

Files works like an IDE file view, for exploring and reviewing. It is not a full editor: no LSP, no debugger, no extensions.

- **F17.1 Read-only code viewer** (Must)
  - Folder tree of the task's worktree + file tabs + code view with syntax colours.
- **F17.2 Quick search** (Must)
  - Find a file by name, and search text (uses `ripgrep`).
- **F17.3 Small edits** (Must)
  - Allow tiny edits (a typo, a value). Not a full editor.
- **F17.4 Open in editor** (Must)
  - "Open in my editor": one click opens the file at the line in the user's editor.
- **F17.5 Changes against main** (Must, M3)
  - "Show changes / Full file": a filter for only the changed files, or the whole tree.
  - Changed files are marked in the tree.
  - The changes against the project's default branch (`main`) show inline in the code view.
- **F17.6 Why it changed** (Must, M5)
  - Each changed file shows a one-line reason from the agent: "Why Claude changed this".
  - The reason comes from the What changed grouping (F10.1).
- **F17.7 Mark as looked at + Next change** (Must, M5)
  - "Mark as looked at" on a changed file. The marks are kept per task.
  - "Next change" jumps to the next change in a file not yet looked at.
- **F17.8 Project files** (Must, M3)
  - Project menu -> Project files: browse the main repo of any project with the same view (tree, tabs, search, "Open in my editor").
  - No task is needed.
  - Read-only in v1. Tiny edits (F17.3) are only in a task's copy, so the main repo is never changed by Saarthi.

### F18. Command Bar and Keyboard

- **F18.1 Command Bar** (Must)
  - `Ctrl+K` opens it on any screen.
  - Search tasks (in all projects), projects, saved instructions, and actions ("run checks", "new task", "open in editor").
- **F18.2 Keyboard first** (Must)
  - Every main action has a shortcut. A `?` key shows the shortcut list.

### F19. Notifications

- **F19.1 Desktop notifications** (Must)
  - Native on every OS (Tauri notification plugin). Cover every project.
  - Agent needs you.
  - Run finished.
  - Checks failed / passed.
- **F19.2 Sound** (Later)
  - Optional sound for "Needs you".
- **F19.3 Phone glance** (Later)
  - Read-only web page on the phone (same Wi-Fi, with a token) to see task status and answer "Needs you" questions.

### F20. CLI (`saarthi`)

- **F20.1 Same power as the UI** (Must)
  - `saarthi project add <path>`
  - `saarthi task new "<title>"`
  - `saarthi task list`
  - `saarthi run <task-id> --agent claude|codex|gemini --mode build`
  - `saarthi checks <task-id>`
  - `saarthi review <task-id>` (prints what changed)
  - `saarthi ship <task-id>`
  - `saarthi daemon start|stop|status`
- **F20.2 JSON output** (Must)
  - `--json` flag for scripts.

### F21. Settings

- **F21.1 Global** (Must)
  - Theme: dark (default) or light (Settings -> General -> Theme).
  - Default editor command.
  - Max parallel runs.
  - Max auto-fix rounds.
  - Worktree root folder.
  - Agent CLI paths (`claude`, `codex`, `gemini`).
  - "Keep running in the background" (M9): the background service starts at login, the OS way (see TDD).
- **F21.2 Health check** (Must)
  - Settings -> Health shows: background service running, git version, agent CLIs found and logged in, `gh` logged in.
  - A full screen shows only when something is broken.

### F22. Task Docs

- **F22.1 Docs view on the task page** (Must, M3)
  - Task page -> More -> Docs. A list of docs, a markdown view, and an outline of headings.
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
  - Project menu -> Jira tickets.
  - Views: Mine, Sprint, and saved JQL views from `project.toml`.
  - Search and refresh.
- **F23.3 Start a task from a ticket** (Must, M10)
  - One click makes a task with a brief draft from the ticket.
  - A ticket already linked to a task opens that task.
  - An existing task can be linked to a ticket.
- **F23.4 Ticket chip** (Must, M10)
  - Shown in the task page header and on Board cards.
- **F23.5 Write back with confirm** (Must, M10)
  - Move the ticket status, add a PR comment, add a link to the PR.
  - Every write needs my OK by default. A project can turn on auto send.
  - Status moves only go forward (Running < Review < Shipped). A fix run after Review does not move the ticket back to "In Progress".
  - A write-back waiting for my OK is a Needs-you row (F2.9), and a card on Done.
- **F23.6 Cache and offline view** (Must, M10)
  - Tickets are cached. When Jira is not reachable, the cache shows with "last synced" time.
  - No background polling. Refresh is by hand, or when the panel opens and the cache is old.
- **F23.7 GitHub Issues and other providers** (Later)
- **F23.8 Create a Jira ticket from Saarthi; two-way comment sync** (Later)
- **F23.9 Jira Data Center / Server** (Later)

---

## 6. Main user flows

### 6.1 Daily task flow (the main flow, 5 steps)
1. **Describe.** Press New task (or `Ctrl Alt N` from any app). Pick the project. Type "Add password reset API". Claude drafts the goal and "What done looks like".
2. **Edit the goal and Start.** Fix anything wrong. Click Start. The task is Working. Go do something else.
3. **Answer Claude.** A notification: "Claude has a question - should I add a new table?". The task is in Needs you. Answer "yes".
4. **Let Claude fix it.** The run ends. Checks run by themselves. If a check fails, the verdict is "Has problems". Click "Let Claude fix it". Checks pass.
5. **Approve and create pull request.** Check and ship shows the verdict and what changed, grouped. Answer any "Not sure" goal. Click "Approve and create pull request". The PR opens. The task is Done.

Optional extras (never needed for the 5 steps):
- **Research first:** New task -> More options -> Just research -> "Make a goal from this".
- **Saved instructions:** New task -> More options, for example "Plan first, then build".
- **Side by side:** New task -> More options -> Side by side (M7).
- **Ask Codex to review:** a card on Check and ship. Tick findings, click "Fix these".
- **Lessons learned:** a card on Done. Approve each memory update.

### 6.2 Parallel flow
1. Task A is running (Claude).
2. Start Task B (Codex) in another worktree.
3. Home shows both under Working, each with live status.
4. Whichever needs you first moves to Needs you and glows.

### 6.3 Bug fix flow
1. Paste the error log into Research as a snippet (or as a note in New task -> More options).
2. Pick saved instructions "Fix bug with TDD".
3. Agent writes a failing test, then the fix.
4. Check and ship shows the new test: failed before, passes after.

### 6.4 Ticket flow
1. Project menu -> Jira tickets for project `acme-billing`.
2. Pick the view "Mine". Find ACME-151 "Export invoices as CSV".
3. Click "Start as task". Task T-0033 is made.
4. T-0033 has a drafted goal from the ticket: goal, what done looks like, notes. Edit it and click Start.
5. Claude builds. Checks run by themselves.
6. Task moves to the `Review` stage (status Needs you).
7. A Needs-you card shows: "Move ACME-151 to In Review?" Click Send. Jira status changes.
8. Click "Approve and create pull request". The PR is created.
9. A card on Done offers a PR comment and a link on ACME-151. Click Send.
10. The ticket now shows the PR link and comment.

### 6.5 Many repos flow
1. Add `acme-billing`, `acme-web` and `saarthi` once, from the project picker.
2. Home -> All projects shows the tasks of all three. Each row shows its project.
3. New task -> pick `acme-web` -> Start. Then a second task in `acme-billing` -> Start.
4. The Needs-you pill counts both repos. Click it and answer each one.
5. Click a project tab (or use the picker) to see one project only. No second window.

### 6.6 Review in Files flow
1. On Check and ship, open Files (or task page -> Files).
2. "Show changes" shows only the changed files. The changes against `main` show inline.
3. Each changed file shows "Why Claude changed this".
4. Read a file, click "Mark as looked at", then "Next change".
5. Fix a typo with a tiny edit, or click "Open in my editor" for more.
6. Go back to Check and ship and click "Approve and create pull request".
- To explore code without a task: project menu -> Project files.

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
  - When no run is active, the app and the daemon do almost no work: no polling (Jira refresh is by hand, F23.6).
  - Agent CLI processes (`claude`, `codex`, `gemini`) and check commands are not counted in Saarthi's numbers.
  - The size and RAM limits are in NF7.
- **NF6 Platform**
  - One app for Linux, macOS and Windows, from one codebase and one release pipeline.
  - v1 test targets: Ubuntu 24.04+, macOS 14+, Windows 11.
  - Native installers: `.AppImage` + `.deb` (Linux), `.dmg` (macOS), `.msi` (Windows).
  - Nothing in the UI depends on the OS.
  - One known gap: Windows v1 has no OS sandbox, so "Full access" is not offered there (F15.3).
- **NF7 Lightweight**
  - Installer under 40 MB.
  - App open in under 2 s.
  - Idle RAM under 150 MB for the window plus under 150 MB for the daemon.
  - No Electron, no bundled browser, no VS Code.
  - Checked on all three OSes before a release (M9).

---

## 8. Out of scope (v1)

- Being a full code editor (no LSP, no debugger, no extensions). Files (F17) is for exploring and reviewing, with tiny edits only.
- Our own AI model or our own cloud server.
- Team / multi-user features.
- Mobile app (only a read-only phone page, later).
- Jira Data Center, creating Jira tickets (v1).

---

## 9. Open questions

- Q1: Rebase or merge for "Update from main"? (Default: rebase, setting to change.)
- Q2: Where to keep worktrees? Inside the Saarthi data folder (`worktrees/`) or next to the repo? (Default: first one.)
- Q3: Should Race Mode count as one task or two? (Default: one task, two runs.)
- Q4: How to sandbox agents on Windows after v1? (v1: no OS sandbox, so no "Full access" on Windows. Options to study: AppContainer, a restricted token + Job Object, or running the agent in WSL2.)

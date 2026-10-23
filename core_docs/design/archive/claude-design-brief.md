# Saarthi: make the design very simple

You are redesigning the UI of **Saarthi**, a desktop app for Linux. The current design is attached. It is complete, but it is **too complex for a new user**. Your job is to make it **very, very simple and friendly**, while keeping what makes the product useful.

Read this file first. Then look at the screenshots in the order given in section 9.

---

## 1. What Saarthi is (30 seconds)

- Saarthi is an **Agentic Development Environment (ADE)**. It is **not** a code editor.
- The user does not type code. They tell AI coding agents (Claude Code, Codex) **what** to build. The agents write the code.
- Saarthi is built around **tasks**, not files. One task = one piece of work, e.g. "Add password reset API".
- For each task the app:
  1. gives the agent a clear written goal,
  2. runs the agent in its own safe copy of the repo (a git worktree), so many tasks can run at once,
  3. asks the user when the agent has a question,
  4. runs tests and checks by itself, so there is **proof** that the work is good,
  5. shows the changes in a readable way, so the user can review them,
  6. commits and opens a Pull Request (it never pushes to `main`),
  7. remembers lessons for next time.

**The core promise in one line:** *"Tell the agent what you want, answer its questions, check the proof, ship."*

## 2. Who the new user is

- A developer who already uses an AI coding agent in the terminal (Claude Code or Codex).
- Knows git and pull requests. Does **not** know any Saarthi words.
- Opens the app for the first time and wants to get one real task done **in a few minutes**, without reading a guide.
- Uses a laptop screen (1366×768) as often as a big screen (1440×900 and up).

## 3. Why the current design is hard

These problems come from the attached screens. Please fix all of them.

### 3.1 Too many ideas on the first screen
**Home** (`M3_desktop_ui_v1__01_home`) shows at the same time: an 8-stage circular "Wheel", "beads" with task numbers, an agents dock with live charts, a "Needs you" card, a "Ready for review" list, "Remembered this week", the daemon status, and today's cost. A new user cannot tell what to do first. The Wheel looks nice, but you have to learn it before you can use it.

### 3.2 Too many stages
The task moves through 8 stages: Capture → Research → Brief → Run → Verify → Review → Ship → Remember. The Board (`02_task_board`) has 8 narrow columns. A new user only cares about a few things: *What is waiting for me? What is working? What is done?*

### 3.3 Too many words to learn
Bead, Capture, Brief, Run, Verify, Remember, Proof Card, Trust score, Gate, Change Story, Chapters, Second opinion, Race, Playbook, Context Pack, Workspace, Worktree, Checkpoint, Rewind, Permission profile, Daemon, Research Desk, Memory. Most of these appear on screen with no explanation.

### 3.4 The task screen is crowded
**Task Room** (`03_task_room_stream`) has a left panel (brief, workspace, branch, checkpoint, runs), a small "journey Wheel" with "Run · 4 of 8", and 5 to 7 tabs (Stream, Terminal, Proof, Review, Code, Docs, Timeline). The most important thing, the agent's question, is only one card among many.

### 3.5 Proof and review need too much work
- **Proof** (`M4…03_proof_green`) shows a Trust score of 78 with its formula (50/35/15 points), a "gate" box, 4 stats, check commands, and 5 criteria where the user must click Met / Not sure / Not met for each one and then "Confirm coverage".
- **Review** (`M5…01_change_story`) adds risk tags, chapters, a "second opinion" with severity check boxes, then Approve, then a separate Ship step.
- A new user only wants to know: *Is it good? What changed? Can I ship it?*

### 3.6 The main flow is 15 steps long
The written main flow (FSD section 6.1) has 15 steps: capture, move to Research, research, notes, draft brief, move to Ready, pick agent + mode + playbook, watch, answer, fix failed check, get second opinion, fix findings, approve, ship, approve memory updates. A first task should take about **5 steps**.

### 3.7 First run starts with plumbing
The setup wizard (`M9…02_wizard_daemon`) starts with "Daemon not found", `curl … | bash`, `systemctl` and a port number. The user meets errors and terminal commands before they see any value.

### 3.8 Hard to read
Dark only. A lot of small text (11–13px), low-contrast grey text, monospace in many places, uppercase letter-spaced labels everywhere.

## 4. Goal and design rules

**Goal:** a new user can go from opening the app to an open Pull Request **without help, in under 5 minutes**, and the screen always makes the next step obvious.

Rules:
1. **One main action per screen.** One clear primary button. Everything else is quieter.
2. **Show the next step, not the system.** Tell the user what to do now ("Claude has a question for you"), not what state the machine is in ("Run · 4 of 8").
3. **Plain words only** on default screens. No Saarthi words without an explanation. Use the label table in section 5.
4. **Hide the advanced parts, don't delete them.** Put power features behind "Details", "More", a settings switch, or show them only when they matter (progressive disclosure).
5. **Good defaults.** A first task needs no settings: default agent, default mode, safe permissions.
6. **Few things at once.** Aim for about 7 visible items on a screen at most.
7. **Readable.** Body text 14px or more, strong contrast, monospace only for code, file names and commands.
8. **Works at 1366×768** without scrolling sideways.
9. **Calm.** Use motion and glow only for "the agent needs you".

## 5. Simpler model and words (suggestion)

Show the user **4 simple statuses** instead of 8 stages. The engine keeps its 8 stages; only the screen changes.

| Show the user | Covers these internal stages | What the user should feel |
|---|---|---|
| **To do** | Capture (Inbox), Research, Brief (Ready) | "Ideas and tasks I have not started." |
| **Working** | Run, Verify | "The agent is on it. I can leave." |
| **Needs you** | Needs You, Failed, Review | "My turn: answer, decide, or review." |
| **Done** | Ship, Remember | "PR is open. Finished." |

Suggested plain labels:

| Old word | New label (idea) |
|---|---|
| Capture / Quick capture | New task |
| Brief | Goal (plus "What done looks like" for acceptance criteria) |
| Run agent | Start |
| Needs You | Question from Claude / Your turn |
| Verify, Proof Card, Checks | Tests and checks |
| Trust score 78 + formula | One verdict: **Looks good** / **Take a look** / **Has problems**, details on click |
| Gate passed | (hide it; just say "All checks passed") |
| Change Story, Chapters | What changed |
| Second opinion | Ask Codex to review (an optional button) |
| Ship | Create pull request |
| Remember, Memory updates | Lessons learned (a short optional note after shipping) |
| Bead | (remove; use the task title) |
| Workspace / worktree / checkpoint | Details → "Branch and files" |
| Daemon | Background service (show only if it is broken) |

You can choose better words. Keep the product name **Saarthi**.

## 6. Proposed simple structure (a starting point, improve it)

**App frame**
- Top bar: logo + project picker, a search/command box (`Ctrl K`), one "Needs you" counter, settings. That is all.
- Move **Memory**, **Playbooks**, **Tickets (Jira)** and **Cost** into a "Project" menu or Settings. They are not first-day features.
- No permanent agents dock. Show running agents inside the task list instead.

**Home = "What should the agent do?"**
- A large input at the top: "Describe a task…" with a **Start** button (agent picker as a small default "Claude ▾").
- Below it, one list of tasks grouped by **Needs you**, **Working**, **To do**, **Done**. The "Needs you" group is on top and stands out.
- Each row: title, one line of status in plain words ("Claude is writing tests · 12 min"), and one action button when it is the user's turn ("Answer", "Review").
- The Board (columns) is an optional view toggle (List | Board) with the same 4 columns. The Wheel can stay as the logo and as a "progress" picture, but it should **not** be the navigation.

**Task page = one clear column**
- Top: title, a simple status chip, the primary action.
- The goal (brief) as a short card that can be folded.
- The activity feed in plain sentences ("Read routes.py", "Changed reset.py (+42)", "Tests passed (4)"), with technical rows folded by default.
- When the agent asks something, show it as a **big card above the feed** with answer buttons and a reply box. It must be impossible to miss.
- Tabs reduced to: **Activity**, **Changes**, and **More ▾** (Terminal, Code, Docs, Timeline).

**Review = one "Check and ship" screen** (merge Proof + Review)
- Top: the verdict in one sentence: "All 3 checks passed. 4 of 5 goals met. 1 needs your look."
- A simple checklist of goals, with the agent's answer already filled in. The user only touches the unsure ones.
- "What changed": groups with a one-line reason each; the diff opens on click.
- Optional: "Ask Codex to review".
- One big button: **Approve and create pull request** (and a small "Request changes").
- After shipping: a small "Lessons learned" card with Save / Skip. Do not block on it.

**New task flow (target: 5 steps)**
1. Type what you want → Start.
2. (Optional) Saarthi drafts the goal and "what done looks like" → user edits or accepts.
3. Agent works. User may answer a question.
4. Checks run by themselves. If something fails, one button: "Let Claude fix it".
5. Check and ship → pull request.
Research, playbooks, race mode and second opinion are **optional extras** at the right step, not required steps.

**First run**
- Step 1: "Pick a project folder." (the git repo)
- Step 2: Saarthi checks for git and an agent (Claude/Codex) by itself and shows green ticks. If something is missing, show **one** fix with a Copy button, in plain words.
- The background service starts by itself. Show its details only if it fails.
- End on Home with an example task ready to try.

**Empty states teach.** An empty Home says what Saarthi does in one line and shows the input box with an example task.

## 7. What must not change

- Every feature still exists (all screens in the zip). Advanced ones may move or hide, but must be reachable.
- The 8 internal stages and their rules stay in the engine. Only labels and grouping on screen change.
- "Needs you" must be the most visible thing in the app whenever it happens.
- Work goes to review only after checks pass (or the user overrides with a reason).
- Saarthi never pushes to `main`; it always opens a pull request. Say so near the ship button.
- It is a desktop app (Tauri). It will be built with **React + Tailwind + shadcn/ui**, so use simple, standard components.
- Brand: the warm amber "road" color (`#E9A23B`) as the accent, and the fonts Space Grotesk, Inter, JetBrains Mono. You may soften the dark theme and raise contrast. A light theme is welcome as a second option; dark stays the default.
- Sample data: keep the same story (project `acme-billing`, task T-0012 "Add password reset API", Claude asks "new table or Redis?") so screens are easy to compare with the old ones.

## 8. What to deliver

Priority 1, the main flow (please do these first and as a clickable prototype):
1. First run (2–3 steps)
2. Home with the task list (normal state and empty state)
3. New task (input → draft goal)
4. Task page while the agent is working
5. Task page when the agent has a question
6. Check and ship (all good, and one check failed)
7. Done / pull request created

Priority 2: where the advanced features now live (Board view, Memory, Playbooks, Race mode, Safety and cost, Jira tickets, Settings), error states (service down, agent missing).

Also deliver:
- the final label list (old word → new word),
- a short note on what you hid or moved, and where it went.

**How we will judge it:** a developer who never saw Saarthi can do the main flow without help. Each screen has one obvious next step. No unexplained Saarthi words on the default screens. Nothing is lost, only moved.

## 9. What is in this zip

| Path | What it is |
|---|---|
| `START_HERE.md` | This brief. |
| `screenshots/` | 84 screenshots of the current design (1440×900). Name = `<milestone>__<screen>.jpg`. |
| `current_design/Saarthi Prototype.html` | Clickable prototype of the current design. Open in a browser. Starts at Home. `Ctrl K` = command bar, `Esc` = back. |
| `current_design/screens/` | The same screens as HTML, one file per screen. `index.html` lists them all. |
| `current_design/wheel_mockups/` | The 3 mockups the current "Wheel" look came from. |
| `current_design/specs/` | The current design specs: the Wheel look, and the Docs tab + Jira tickets. |
| `product/` | Product docs: README (the idea), QUICK_REFERENCE (one page), FUNCTIONAL_SPECIFICATIONS (every feature, with the main user flows in section 6). |

**Look at these screenshots first (the main flow, in order):**
1. `M9_polish_package__02_wizard_daemon` – first run today
2. `M9_polish_package__07_empty_deck` – empty Home
3. `M3_desktop_ui_v1__01_home` – Home with the Wheel
4. `M3_desktop_ui_v1__10_quick_capture` – new task
5. `M3_desktop_ui_v1__02_task_board` – Board, 8 columns
6. `M3_desktop_ui_v1__08_start_run_dialog` – start an agent
7. `M3_desktop_ui_v1__03_task_room_stream` – task page, agent asks a question
8. `M4_checks_proof_card__02_proof_failed` and `__03_proof_green` – proof
9. `M5_review_ship__01_change_story` and `__03_second_opinion` – review
10. `M5_review_ship__04_ship_dialog` and `__05_shipped_cleanup` – ship

Then skim the rest to see every feature that has to find a home: M6 (research, memory, playbooks), M7 (race mode), M8 (safety, cost, rewind), M10 (Jira tickets).

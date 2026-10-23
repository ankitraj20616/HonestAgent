# Design

Saarthi's UI is the **Simple UI**: plain words, one main action per screen, advanced parts behind More, Details, the project menu or Settings.

| File | What |
|---|---|
| `2026-10-23-simple-ui-design.md` | **The design spec.** Product rules, decisions, statuses, words, verdict rules, the screen list, and where every old feature lives. |
| `Saarthi Prototype.html` | **The whole product as one clickable file with dummy data.** Open it in a browser. |
| `prototype/` | Source of the prototype (`build.py`, `shoot.py`, `core.js`, `views/*.js`). Edit here, never the built file. |
| `2026-10-12-task-docs-and-jira-design.md` | The Docs tab and Jira design (features still valid; screens are now prototype views). |
| `archive/` | Old designs: the Wheel look (`archive/wheel/`, with the 84 old per-milestone screens), the first look, the Claude Design original and its brief. |

## Using the prototype
- It opens at first run. Click **Next →** in the bar at the bottom left to walk the main flow. **Screens** lists every screen by area, by main flow, or by milestone, and has a light/dark switch.
- Deep link to one screen: `Saarthi Prototype.html#check`.
- Keys: `Ctrl K` command bar, `Ctrl Alt N` new task, `?` shortcuts, `Esc` back or close.
- `?noproto` hides the prototype bar. `?theme=light` starts in the light theme. `?selftest` renders every screen and checks every link, then writes PASS or FAIL in the tab title.

```bash
python3 core_docs/design/prototype/build.py --test        # build + checks + selftest
python3 core_docs/design/prototype/shoot.py OUT_DIR       # screenshots of every screen
```

## Screens per milestone
Each milestone's screens are prototype views. A screen may show parts from later milestones; the FSD of each milestone says what it builds.

<!-- screens:start -->
| Milestone | Screens (open as `Saarthi Prototype.html#<id>`) |
|---|---|
| M0 | - |
| M1 | `cli` The saarthi CLI |
| M2 | `cli` The saarthi CLI |
| M3 | `homeEmpty` Home, empty · `home` Home with tasks (all projects) · `board` Board view · `newTask` New task: drafted goal · `work` Task: agent working · `question` Task: agent asks a question · `files` Files: explore and review the task · `projectFiles` Project files (main repo) · `commandBar` Command bar (Ctrl K) · `quickCapture` New task from any app (Ctrl Alt N) · `settings` Settings: General · `settingsAgents` Settings: Agents · `settingsHealth` Settings: Health · `todoTask` Task: to do, not started · `terminal` Task → More: Claude's terminal · `docs` Task → More: Docs · `history` Task → More: History and undo points · `details` Task → More: Details |
| M4 | `board` Board view · `checks` Task: checks running · `fixing` Task: Claude fixing a failed check · `check` Check and ship: looks good · `checkFail` Check and ship: has problems · `settingsProject` Settings: Project · `fixLimit` Task: agent could not fix it in 3 tries |
| M5 | `files` Files: explore and review the task · `check` Check and ship: looks good · `done` Done: pull request created · `conflict` Task: main moved on, conflict · `comment` Check and ship: comment on a line · `editPr` Check and ship: edit pull request text |
| M6 | `newTask` New task: drafted goal · `done` Done: pull request created · `notes` Lessons and notes · `noteEdit` Lessons and notes: edit a file · `playbooks` Saved instructions · `playbookEdit` Saved instructions: edit and import · `settingsProject` Settings: Project · `research` Task: just research, no code · `planReview` Task: plan ready, waiting for your OK · `details` Task → More: Details · `contextPack` Task → More: what Claude reads |
| M7 | `newTask` New task: drafted goal · `settingsAgents` Settings: Agents · `raceRunning` Side by side: both agents working · `race` Side by side: compare and keep one |
| M8 | `newTask` New task: drafted goal · `safety` Settings: Safety and cost · `fullAccess` Settings: give full access (confirm) · `safetyAsk` Task: agent asks to run a command · `budgetWarn` Task: budget passed (soft warning) · `history` Task → More: History and undo points · `restoreConfirm` Task → More: restore an undo point · `details` Task → More: Details |
| M9 | `setup1` First run: pick a project · `setup2` First run: all set · `setup2x` First run: one thing to fix · `homeEmpty` Home, empty · `shortcuts` Keyboard shortcuts (?) · `errService` Background service stopped · `errAgent` Agent not logged in · `reconnecting` Reconnecting to the background service · `versionMismatch` App and service versions differ · `settingsAbout` Settings: About |
| M10 | `done` Done: pull request created · `cli` The saarthi CLI · `tickets` Jira tickets · `ticketsOffline` Jira tickets: Jira can't be reached · `ticketStart` Jira: start a task from a ticket · `writeBack` Home: Jira update waits for you · `settingsJira` Settings: Jira |
<!-- screens:end -->

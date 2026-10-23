# Simple UI - Saarthi design (spec)

**Date:** 2026-10-23
**Status:** Approved by the owner. Replaces the Wheel look (`archive/wheel/2026-10-11-wheel-ui-design.md`).
**Source:** the "Saarthi Simple Prototype" made in Claude Design from the brief in `archive/claude-design-brief.md`. The original file is kept in `archive/Saarthi Simple Prototype - Claude Design.html`.
**Prototype:** `core_docs/design/Saarthi Prototype.html` (one file, the whole product, dummy data). Source in `core_docs/design/prototype/`.

---

## 1. Why

The Wheel design was complete, but too hard for a new user:
- Home showed about 8 ideas at once.
- There were 8 stages to learn.
- About 20 Saarthi-only words.
- 5-7 tabs per task.
- The main flow took 15 steps.
- Setup started with daemon errors.

The new design keeps every feature but shows only the next step. Advanced parts move behind "More", "Details", the project menu or Settings.

**Goal:** a new user goes from opening the app to an open pull request without help, in under 5 minutes.

## 2. Product rules this design adds

| # | Rule |
|---|---|
| P1 | **Many git repos in one window.** The user adds every repo once. Home shows project tabs plus **All projects**, which merges the tasks of every repo. The top bar has a project picker. "Needs you" counts cover all repos. A new task picks its repo. Each task still gets its own branch and its own copy (worktree) of its repo. No second window, no "open folder" per repo. |
| P2 | **IDE + ADE.** A **Files** screen works like an IDE file view: folder tree, file tabs, a code view with syntax colours, find a file, "Show changes / Full file", changes against `main` inline, "Why Claude changed this", "Mark as looked at", "Next change", tiny edits, "Open in my editor". It exists per task (the task's copy) and per project (the main repo). It is for exploring and reviewing. It is not a full editor: no LSP, no debugger, no extensions. |
| P3 | **One app for Linux, macOS and Windows.** One codebase, one release pipeline, native installers for each OS. Nothing in the UI depends on the OS. See `decisions/ADR-002-cross-platform-lightweight.md`. |
| P4 | **Very light.** Targets: installer under 40 MB. App open in under 2 s. Idle RAM under 150 MB for the window plus under 150 MB for the background service. No Electron, no bundled browser, no VS Code. |
| P5 | **Agents: Claude Code, Codex and Gemini CLI.** All behind the `AgentAdapter` interface. Gemini CLI joins in M7. Claude stays the default. |
| P6 | **Agents test it live in a browser (M11).** When a project turns on browser testing, every build ends with a **Live test**: the agent opens the app in a real browser, walks through the UI parts of "What done looks like", and saves screenshots, a short video and a trace as proof ("See it work"). Logins use **saved logins of test accounts**. The browser is **not in the installer**: Saarthi uses the system Chrome / Edge / Chromium, or downloads a browser kit once, on demand. See section 11. |
| P7 | **Live preview inside Saarthi (M12, starts with a spike).** Watch the agent's browser live in the task page, and open the task's running app in a Saarthi preview window. Letting the agent drive Saarthi's own WebView is tried in the M12 spike and kept only on the OSes where it works. See section 11. |

## 3. Decisions

| # | Decision |
|---|---|
| D1 | No Wheel, no beads, no agents dock, no Trust ring on screen. The Wheel stays only as the logo. |
| D2 | Users see **4 statuses**. The engine keeps its 8 stages and the `ALLOWED_MOVES` table. Only the UI groups them. |
| D3 | **Dark is the default, plus a light theme** (Settings → General → Theme). One token set per theme. |
| D4 | One main action per screen. Plain words only (section 5). |
| D5 | Trust score is still computed by the daemon (F7.7). The UI shows a **verdict**. The number appears only under "How we decided". |
| D6 | Proof and Review are one screen: **Check and ship**. |
| D7 | Goals ("What done looks like") are pre-filled by the agent. The user only answers the ones marked "not sure". |
| D8 | Ship has no dialog. **Approve and create pull request** uses default commit and PR text. "Edit pull request text" is optional. |

## 4. Statuses (UI) vs stages (engine)

| Status on screen | Engine stages | Row action |
|---|---|---|
| **Needs you** | `Needs You`, `Failed`, `Review`, and any task where the user must act: a Jira write-back to confirm, a conflict after "Update from main", or a Side by side pick (this wins over Working) | Answer / Fix / Review / Decide |
| **Working** | `Running`, `Verifying` | none (open the task) |
| **To do** | `Inbox`, `Research`, `Ready` | Start (when a goal exists) |
| **Done** | `Shipped` (+ pending lessons) | PR link |

`Parked` and `Archived` are hidden behind a filter. The Board view shows the same 4 columns. "Show detailed stages" adds the engine stage name to each card.

## 5. Words (UI labels)

| Old word | New label |
|---|---|
| Command Deck | Home |
| Capture, Quick capture | New task (`Ctrl Alt N` from any app) |
| Brief | Goal |
| Acceptance criteria | What done looks like |
| Run agent | Start |
| Needs You | Needs you · "Claude has a question" |
| Task Room / Stream tab | Task page / Activity tab |
| Code tab, Code Peek | Files |
| Timeline tab, Checkpoints, Rewind | More → History; Undo point; Restore |
| Workspace, Worktree | "its own copy of the repo"; branch details under More → Details |
| Verify, Proof Card, Checks | Tests and checks |
| Trust score + formula | **Looks good** / **Take a look** / **Has problems** |
| Gate passed / closed | (hidden) "All checks passed" |
| Change Story, Chapters | What changed / groups |
| Risk flags | small tag on a group, e.g. "Login code", "Migration" |
| Second opinion | Ask Codex to review (optional) |
| Fix with agent | Let Claude fix it |
| Override | Review anyway (with a reason) |
| Approve + Ship | Approve and create pull request |
| Remember, Memory updates | Lessons learned (optional card after shipping) |
| Memory | Lessons and notes |
| Context Pack | What Claude reads (More → Details) |
| Playbook | Saved instructions |
| Research Desk | New task → More options → "Just research" |
| Race Mode | Side by side |
| Permission profile | What agents may do: Read only / Safe / Full access |
| Cost meter, budget | Safety and cost |
| Daemon | Background service (shown only when broken) |
| Bead, Wheel | removed (logo only) |
| E2E / browser check | Live test |
| Evidence (screenshots, video, trace) | See it work |
| Auth state / storageState | Saved login |

"Claude" in labels means the agent that runs the task. With Codex or Gemini, the label uses that name.

## 6. Verdict rules (Check and ship)

The daemon computes these from data it already has (`check_results`, goal coverage, `review_findings`, `trust_score`). The thresholds live in `config.py` (`TRUST_GOOD_MIN = 70`).

| Verdict | When |
|---|---|
| **Has problems** | A required check failed, or a high finding is open. |
| **Take a look** | Every required check passed, but a goal is "Not met", a medium finding is open, or the score is below `TRUST_GOOD_MIN`. |
| **Looks good** | Every required check passed, no goal is "Not met", no medium or high finding is open, and the score is at least `TRUST_GOOD_MIN`. |

- A "Not sure" goal is never a reason for "Take a look" by itself. It adds 0 points to the score (F7.7) until the user answers, so it lowers the score; with the threshold at 70 one "Not sure" still gives "Looks good" (example: 4 of 5 met → 78). It shows a question with "That's fine" (counts as Met, `by_user`) or "Ask Claude to add it".
- The verdict never blocks anything. The stage rules still decide, for example: Review needs green required checks, or an override with a reason.

## 7. App frame

- **Top bar (62px):**
  - Logo
  - Project picker. Its menu has the project tools (Board view, Lessons and notes, Saved instructions, Jira tickets, Safety and cost, Project files) and the list of all projects.
  - Search or jump (`Ctrl K`)
  - The Needs-you pill. It pulses when the count is above 0; otherwise it reads "Nothing needs you".
  - Settings
- No sidebar and no dock.
- Content is centred with a maximum width (760-1280px). It works from 1280×720 up, and at 1366×768 without scrolling sideways.
- Fonts: Space Grotesk (headings), Inter (body, 15px base), JetBrains Mono (code, paths, commands only).
- Accent: `#E9A23B`. Tokens: `--bg --surface --surface-2 --raised --border --border-strong --text --muted --faint --accent --accent-hover --on-accent --accent-soft --accent-text --green --red --blue (+ -soft) --code-bg --shadow`, one block for dark and one for light.
- Motion: only the Needs-you glow, spinners, and pulsing dots.

## 8. Screens

Every screen is a view in the prototype. Open one with `Saarthi Prototype.html#<id>`. The list per milestone is in `core_docs/design/README.md`.

| Area | Views (id) |
|---|---|
| First run | `setup1` pick project · `setup2` all set · `setup2x` one thing to fix |
| Home | `homeEmpty` · `home` (project tabs, All projects, groups Needs you / Working / To do, Done this week) · `board` |
| New task | `newTask` (drafted goal, More options: how to work, saved instructions, note, side by side, safety) |
| Task page | `todoTask` · `work` · `question` · `checks` · `fixing` · `fixLimit` · `safetyAsk` · `budgetWarn` · `conflict` · `planReview` · `research` |
| Task → More | `terminal` · `docs` · `history` · `restoreConfirm` · `details` · `contextPack` |
| Files (IDE) | `files` (task copy) · `projectFiles` (main repo of a project) |
| Check and ship | `checkFail` · `check` · `comment` · `editPr` |
| Done | `done` (PR open, lessons learned, Jira write-back) |
| Side by side | `raceRunning` · `race` |
| Project tools | `notes` · `noteEdit` · `playbooks` · `playbookEdit` · `tickets` · `ticketStart` · `ticketsOffline` · `writeBack` |
| Settings | `settings` · `settingsAgents` · `settingsProject` · `safety` · `fullAccess` · `settingsJira` · `settingsHealth` · `settingsAbout` |
| Overlays | `commandBar` · `quickCapture` · `shortcuts` |
| Errors and states | `errService` · `errAgent` · `reconnecting` · `versionMismatch` |
| Browser testing (M11) | `settingsBrowser` · `loginSave` · `liveTest` · `evidence` · `loginExpired` |
| Live preview (M12) | `livePreview` |
| CLI | `cli` (the `saarthi` CLI sessions of M1, M2, M10) |
| Notes | `designNotes` (labels, what moved where, screens per milestone) |

## 9. Where every old feature lives now

| Old | Now |
|---|---|
| Wheel, beads, agents dock | Gone. Running agents are "Working" rows. |
| 8-column Board | Project menu → Board view (4 columns, "Show detailed stages"). |
| Research Desk, findings, draft brief | New task → More options → Just research → task page `research` → "Make a goal from this". |
| Brief versions, focus paths | Task page → Goal card → Edit → History. |
| Start-run dialog (agent, mode, playbook) | New task → agent picker + More options. Defaults need no choice. |
| Code tab, Code Peek, tiny edit | Files (`files`, `projectFiles`). |
| Terminal, Docs, Timeline tabs | Task page → More ▾. |
| Worktree, branch, ports, cost per run, Context Pack | More ▾ → Details / What Claude reads. |
| Checkpoints and Rewind | More ▾ → History → Restore. |
| Update from main, sync conflict | Details shows "Behind main". A conflict becomes a Needs-you task with "Let Claude fix it". |
| Trust score, check commands, logs | Check and ship → "How we decided" / "Show output". |
| Second opinion and severity ticks | Optional card on Check and ship. |
| Diff comments | Check and ship → open a group → comment on a line → "Send to Claude". |
| Ship dialog, cleanup prompt | Default text, optional `editPr`. The copy is cleaned up after 7 days (link on Done). |
| Memory screen, memory updates | Lessons and notes. Lessons learned card on Done. |
| Playbooks and import | Saved instructions. |
| Race Mode | New task → More options → Side by side. |
| Safety alerts, always-ask | Needs-you card on the task page (`safetyAsk`). |
| Permission profile, sandbox, budget | Settings → Safety and cost. Per task in Details. |
| Cost in the top bar | Safety and cost (and Details per task). |
| Jira tickets, write-back | Project menu → Jira tickets. Write-back is a Needs-you row and a card on Done. |
| Daemon status, versions, health | Settings → Health / About. Full screen only when broken. |
| Shortcut sheet, quick capture, command bar | `?`, `Ctrl Alt N`, `Ctrl K`. |

## 11. Browser testing (M11) and live preview (M12)

### 11.1 Why
Many tasks only count as "done" when the app really works in a browser: log in, open a page, click, see the result. Unit tests do not prove that. So the agent tests it live, once per build, and shows proof.

### 11.2 Decisions
| # | Decision |
|---|---|
| B1 | **No browser in the installer.** Chromium is 100-200 MB; the installer budget is 40 MB (P4). |
| B2 | **One engine: Chromium, on all three OSes.** Same engine everywhere, so a Live test behaves the same on Linux, macOS and Windows. It also gives CDP (needed for the live screencast in M12) and is what Playwright MCP uses by default. Firefox and WebKit are not used. |
| B2a | **Lightest path first, in this order:** (1) system **Google Chrome**, (2) system **Microsoft Edge** (built into Windows 10/11, so Windows usually needs no download), (3) system **Chromium**, (4) else Settings → Browser testing offers a one-time download of the **browser kit** into the Saarthi data folder: Playwright's **Chromium headless shell** for Live tests (the smallest build), plus the full Chromium only if the user wants to watch it or save a login and no system browser exists. Exact sizes and packaging are measured in the M11 spike. |
| B3 | **Off by default, per project.** `[browser]` in `.saarthi/project.toml`: `enabled`, `base_url`, `dev_server` (command), `allowed_hosts`, `live_test = "auto" | "off"`, `live_test_required = false`. Backend-only projects keep it off. |
| B4 | **Live test = one more check.** After the required checks pass, the Check Runner starts the task's dev server on the task's own port and runs the Live test. The agent drives the browser through a browser MCP server (for example Playwright MCP, flags checked in the spike). It walks the UI items of "What done looks like" and saves screenshots, video and trace. The result is a normal check result: optional by default, so it feeds the verdict like any optional check, or required if `live_test_required = true`. |
| B4a | **The daemon owns the browser.** The daemon runs Chromium and the browser MCP server; the agent reaches it only through a per-run endpoint on `127.0.0.1`. The kit, the saved logins and the browser profile stay with the daemon, outside the agent's sandbox, so the agent never sees a session file (ADR-003, TDD 4.15). |
| B3a | In M11, `[browser]` is shown read-only in Settings → Browser testing, with "Edit project.toml". Editing it from the UI is Later. |
| B5 | **The project's own E2E tests** (`npx playwright test`, `pytest -m e2e`) are just checks of kind `e2e`. Saarthi starts the dev server and collects their artifacts. |
| B6 | **Saved logins, test accounts only.** "Save a login" opens a normal (headed) browser; the user logs in once by hand; Saarthi saves the session (Playwright `storageState`) per project and name, in the data folder (owner-only file). Never in the repo, never in events, never in the Context Pack, never shown to the agent as text. The agent only gets "use login `test-admin`". Saarthi never stores the password. |
| B7 | **Browser stays on allowed hosts.** The agent's browser opens only `base_url` and `allowed_hosts` (default `127.0.0.1`, `localhost`). Any other host needs a Needs-you OK. Never use production accounts; the Save-a-login dialog says so. |
| B8 | **Expired login → Needs you.** If a saved login no longer works, the task shows "Log in again" (one click opens the headed browser). |
| B9 | **See it work** on Check and ship: a step list with screenshots, the short video, and "Open trace". Kept with the task; cleaned up with the worktree. |
| B10 | **Live preview (M12) has three parts.** (a) *Live browser*: the agent's Chromium is streamed into the task page (screencast), so you watch it click. Works on every OS. (b) *Preview window*: a separate Saarthi window (Tauri WebView) opens the task's dev server, so you click around yourself. It has **no access** to Saarthi's commands (no IPC). (c) *Agent drives the preview window*: Linux via WebKitWebDriver, Windows via WebView2 remote debugging (CDP), macOS has no driver. This part is spike-gated: kept only where the spike passes, else the agent uses its own Chromium (a). |

### 11.3 Screens
- `settingsBrowser`: Settings → Browser testing. It shows:
  - which browser was found (or "Download browser kit");
  - base URL, dev server command and port;
  - allowed hosts;
  - Live test: Auto / Off, and Required;
  - saved logins, with "Save a login".
- `loginSave`: the "Save a login" flow. The browser opens, you log in, Saarthi saves the session.
- `liveTest`: the task page while the agent is live testing. Steps appear as they happen, each with a thumbnail; in M12 the live browser also shows here.
- `evidence`: "See it work". Every step with its screenshot, the video, and "Open trace". It is reached from Check and ship.
- `loginExpired`: the Needs-you card "Your saved login test-admin expired. Log in again."
- `livePreview` (M12): the preview window next to the live browser, with "Let the agent use this window" shown only where supported.

## 12. Out of scope

- A real React build of these screens. This work is the design and the prototype.
- Mobile layouts.
- A full code editor (LSP, debugger, extensions).

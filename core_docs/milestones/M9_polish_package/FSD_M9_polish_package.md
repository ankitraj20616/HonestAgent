# FSD — M9: Polish + Package (v1.0)

**Document type:** Functional Specification Document (FSD)
**Milestone:** M9 of M0-M12 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`), installers for 3 OSes from one GitHub Actions matrix, daemon as a sidecar binary, background service per OS, lightness targets, new setup and error screens
**Estimated effort:** 10 hours planned (1 week at ~10 h/week). The TDD task list adds up to ~25 h (was ~19 h before the 3-OS work) — see section 11. Plus 2 weeks of calendar time for the dogfood gate.
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M9_polish_package.md`, `../../FUNCTIONAL_SPECIFICATIONS.md` (F18.2, section 6, section 7), `../../TDD-tech-design-doc.md` (13, 14, 16 Q5), `../../TECH_STACK.md` (packaging), `../../decisions/ADR-002-cross-platform-lightweight.md`, `../M8_safety_cost_rewind/FSD_M8_safety_cost_rewind.md` (previous)
**Screens:** prototype views `setup1`, `setup2`, `setup2x`, `homeEmpty`, `shortcuts`, `errService`, `errAgent`, `reconnecting`, `versionMismatch`, `settingsAbout` in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. What this document covers

M9 turns a working dev setup into an app I install and use every day, on Linux, macOS and Windows:

1. The daemon ships **inside the app** as a sidecar binary. The app starts it. On screen it is the **Background service**, and it shows only when it is broken.
2. **Background mode** keeps the service running after login: systemd (Linux), launchd (macOS) or autostart (Windows).
3. The desktop app ships as **`.dmg`** (macOS), **`.msi`** (Windows), **`.AppImage`** + **`.deb`** (Linux), all built by **one GitHub Actions matrix**.
4. A short **first-run setup**: pick a project, then "All set" or "One thing to fix".
5. A **shortcut sheet** opens with `?`.
6. Every screen has proper **empty, error and loading states**.
7. **Playwright tests** cover the 3 main flows (FSD 6.1-6.3) against a daemon running FakeAdapter.
8. A **user guide**: `docs/USER_GUIDE.md`.
9. A **release checklist**, with NF1-NF6 and the lightness targets as a gate, and the tag `v1.0.0`.

Owned (from `../README.md`): **F18.2**, packaging, background service, first-run setup, Playwright, user guide, **NF1**, **NF6**. The release gate also checks NF2-NF5, which earlier milestones built.

**Lightness targets** (Simple UI spec P4, ADR-002): installer under **40 MB**, app open in under **2 s**, idle RAM under **150 MB** for the window plus under **150 MB** for the background service.

---

## 2. The goal in plain words

Today Saarthi runs from two dev terminals (`uv run saarthi daemon start --dev` and `npm run tauri dev`). If I reboot, I start both by hand. A new machine needs an hour of setup. It only runs on Linux.

**At the end of M9 I can:**
- Install Saarthi on a clean Linux (Ubuntu 24.04), macOS or Windows 11 machine in under 10 minutes, from one native installer.
- Open Saarthi. The background service starts by itself. I never see daemon errors unless something is really broken.
- Pick my first project and see "All set", or the one thing to fix with the exact command.
- Press `?` anywhere to see every shortcut.
- Trust that the 3 main flows keep working, because tests run them on every change.
- Use Saarthi for 2 weeks without opening an IDE for agent work, then tag `v1.0.0`.

---

## 3. Where this milestone sits

| Before (already built) | M9 adds |
|---|---|
| M0: Tauri window + daemon start proven on Linux, macOS and Windows (CI matrix) | Release builds and installers from the same matrix |
| M1: `saarthid`, `saarthi daemon start\|stop\|status`, `/health` | Sidecar binary, `saarthi daemon install-service` (per OS), `saarthi doctor` |
| M2: paths from `platformdirs`; PTY on Windows via ConPTY | Nothing new; the installers ship them |
| M3: Tauri shell starts / connects to the daemon; Settings → Health; Search or jump (`Ctrl K`) | Start the sidecar; setup screens; shortcut sheet; states |
| M1-M8: all features | Playwright end-to-end tests; user guide; release |
| M8: sandbox probe per OS | Setup shows whether the safe box works (Linux, macOS) |

M9 is the last v1 milestone. After it comes "Later" (section 8).

---

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Background service** | The daemon, as the user sees it. A program that does the real work. Shown on screen only when it is broken. |
| **Background mode** | The OS starts the service when I log in, and keeps it running. |
| **systemd / launchd / autostart** | The tool each OS uses for background mode: systemd on Linux, launchd on macOS, an autostart entry on Windows. No admin rights needed. |
| **Sidecar** | A program bundled inside the desktop app and started by it. Here: the daemon, built as one binary. |
| **PyInstaller / Nuitka** | Tools that turn a Python app into one binary, so the user needs no Python. |
| **`.dmg` / `.msi` / `.AppImage` / `.deb`** | The normal install files on macOS, Windows, and Linux (AppImage runs on most Linux systems; `.deb` is Ubuntu's package). |
| **GitHub Actions matrix** | One CI job that runs the same build on Linux, macOS and Windows machines. |
| **First-run setup** | The screens that guide me the first time I open the app. |
| **Playwright** | A tool that drives a real browser engine and clicks through the app like a user. |
| **Release gate** | A list of checks that must all pass before the version tag. |

---

## 5. Features

### 5.1 Background service per OS

**What.** The app starts the service when it opens, if it is not already running. Closing the window does not stop it, so runs go on. **Background mode** goes one step further: the OS starts the service at login and restarts it if it crashes.

| OS | Background mode | Where |
|---|---|---|
| Linux | systemd user service | `~/.config/systemd/user/saarthid.service` |
| macOS | launchd agent | `~/Library/LaunchAgents/dev.saarthi.daemon.plist` |
| Windows | autostart entry at login | current-user "Run" entry |

**Why.** The UI and CLI need the service. I should never have to start it by hand.

**Example.**
```
$ saarthi daemon install-service
Background mode: systemd (Linux)
Wrote ~/.config/systemd/user/saarthid.service
Wrote ~/.config/saarthi/daemon.env (PATH with claude, codex, gemini, gh, rg)
Enabled and started saarthid. Status: running, http://127.0.0.1:7878
```
In the UI: setup (`setup2`) has "Keep Saarthi ready in the background" (on by default). Settings → General has the same switch. After that, `saarthi daemon start|stop|status` use the OS tool under the hood.

**Rules.**
- The service gets my shell's `PATH` (and display variables, for "Open in my editor") at install time, so it finds `claude`, `codex` and `gemini` (they often live in `~/.local/bin` or `~/.nvm`). After installing a new tool: `saarthi daemon install-service --refresh-env`. On Windows the user `PATH` is read from the registry, so this step is not needed.
- On stop or restart, running agents are stopped cleanly and marked `interrupted`. I resume them later (core TDD 8.6). Runs do not survive a service restart in v1 (see TDD Decision 2 and open question 2).
- `saarthi daemon uninstall-service` removes background mode. Data stays.

**Acceptance criteria.**
- After a reboot and login, `/health` answers without any manual step (each OS, background mode on).
- Restarting the service during a run (`systemctl --user restart saarthid`, `launchctl kickstart -k`, or `saarthi daemon restart` on Windows): the run shows `interrupted`, `saarthi run resume` continues it.
- Linux and macOS: `kill -9` of the service: it is back within 5 seconds. Windows: the next app open (or CLI call) starts it again.

### 5.2 Packaging: one matrix, native installers, daemon as a sidecar

**What.**
- One GitHub Actions workflow with a matrix of `ubuntu-24.04`, `macos-latest` and `windows-latest` builds:
  - the daemon as one binary (PyInstaller, or Nuitka if PyInstaller misses the size or start targets);
  - the Tauri app with that binary as a sidecar;
  - `saarthi_1.0.0_amd64.deb`, `saarthi_1.0.0_amd64.AppImage`, `Saarthi_1.0.0_aarch64.dmg`, `Saarthi_1.0.0_x64.msi`.
- The sidecar binary is also the `saarthi` CLI. The installers put `saarthi` on `PATH` (the `.deb` and `.msi` do it; on macOS, setup offers to link it into `~/.local/bin`).
- All files go on the GitHub release `v1.0.0` with `SHA256SUMS`.
- `uv tool install` from the source repo stays as the developer path. Users never need Python or uv.

**Why.** One file per OS, nothing else to install. Python is inside the sidecar, so a clean machine works.

**Example (Linux).**
```
$ sudo apt install -y git ripgrep bubblewrap gh ./saarthi_1.0.0_amd64.deb
$ saarthi --version
saarthi 1.0.0 (api 1)
```
macOS: open the `.dmg`, drag Saarthi to Applications. Windows: run the `.msi`.

**Rules.**
- The app and the sidecar are built together, so they always have the same version. If a developer runs a different daemon (`uv tool install`), the app shows `versionMismatch` with the fix.
- The installer stays under 40 MB (release gate). If it does not, cut first: Nuitka instead of PyInstaller, then drop unused Python modules.

**Acceptance criteria.**
- The matrix builds all four files from one tag, with no manual step.
- Each installer installs on a clean machine of its OS and adds a menu / Start / Applications entry with an icon.
- Each installer file is under 40 MB (CI fails the build if not).
- `saarthi --version` and Settings → About (`settingsAbout`) both show `1.0.0`.

### 5.3 First-run setup

**What.** Shown the first time the app opens (or when there are no projects). It never starts with service errors: the app starts the service first, and only if that fails do I see `errService`.
1. **Pick a project** (`setup1`) — pick a folder. Saarthi checks it is a git repo and writes `.saarthi/project.toml`. I can add more repos now or later (many projects in one window).
2. Saarthi checks the tools: `git`, `claude` (logged in?), `codex` (logged in?), `gemini` (logged in?), `gh` (logged in?), `rg`, and the safe box (Linux `bwrap`, macOS `sandbox-exec`; Windows shows "not available yet").
3. **All set** (`setup2`) — everything required is ok. A button: "Create your first task". Warnings show as one quiet line each.
   **One thing to fix** (`setup2x`) — the first required item that fails, in plain words, with a copy button for the fix command and **Check again**.

**Why.** Setup problems should show up on day one, with the fix next to them. One thing at a time, not a wall of errors.

**Rules.**
- Required to continue: `git` and at least one agent (`claude`, `codex` or `gemini`) logged in. Others are warnings.
- "Skip for now" is allowed on `setup2x` when only warnings are left.
- CLI first: the same checks are `saarthi doctor`. Adding a project is `saarthi project add` (M1).

**Example.**
```
$ saarthi doctor
service  ok    1.0.0 · background mode: systemd
git      ok    2.43.0
claude   ok    2.1.x · logged in
codex    warn  not logged in        fix: codex login
gemini   warn  not found            fix: npm install -g @google/gemini-cli
gh       ok    logged in as ankit
rg       ok    14.1.0
sandbox  fail  bwrap: user namespaces blocked by AppArmor   fix: see USER_GUIDE.md "Safe box on Ubuntu 24.04"
```

**Acceptance criteria.**
- On a clean profile (empty data dir), the app opens on `setup1`, never on an error.
- Each tool row matches `saarthi doctor --json`.
- With `git` missing, the app shows `setup2x` with the git fix command; after installing git, **Check again** shows `setup2`.
- After adding a project, setup never shows again (`settings.first_run_done = true`). Settings has "Run setup again".

### 5.4 F18.2 — Keyboard shortcut sheet (`?`)

**What.** Press `?` on any screen (not inside a text box or terminal). A sheet (`shortcuts`) lists all shortcuts, grouped: Global, Home, Task page, Files, Check and ship.

**Why.** FSD F18.2: "Every main action has a shortcut. A `?` key shows the shortcut list."

**Example (proposed set).** On macOS, `Ctrl` is `Cmd`.

| Keys | Action |
|---|---|
| `Ctrl+K` | Search or jump (M3) |
| `Ctrl+Alt+N` | New task, works outside the app too (M3) |
| `?` | This sheet |
| `N` | New task |
| `G` then `H` / `B` / `L` / `I` / `S` | Go to Home / Board view / Lessons and notes / Saved instructions / Settings |
| `/` | Search on this screen |
| `J` / `K`, `Enter` | Move selection, open |
| `R` | Start (task page) |
| `Ctrl+Enter` | Send message to the agent |
| `Ctrl+.` | Stop the agent |
| `C` | Run tests and checks |
| `1`-`3` | Activity / Files / Check and ship (task page) |
| `]` / `[` | Next / previous change (Files) |
| `Esc` | Close dialog / sheet |

**Rules.**
- All shortcuts are declared in one list in the code. The sheet and Search or jump read the same list, so they never drift.
- Shortcuts do not fire while typing in an input, the goal editor, the code view, or the terminal.
- No CLI command: this is a UI-only feature (`saarthi --help` is the CLI's version).

**Acceptance criteria.**
- `?` opens the sheet on Home, Board view, Task page, Files, Check and ship, Lessons and notes, Saved instructions, Settings.
- Every action in Search or jump that has a shortcut shows the same keys in the sheet.
- Typing `?` in the goal editor types a `?`.

### 5.5 Empty, error and loading states

**What.** Every list and panel has three designed states:
- **Empty:** one line of help and one main button. Example, Home with no tasks (`homeEmpty`): "Nothing here yet. Press N to create a task."
- **Error:** what went wrong in simple words, and what to do. Example: "The background service is not running. [Start it]".
- **Loading:** grey skeleton rows, shown only if loading takes more than 150 ms (no flicker).

**Why.** v1 must feel finished. Blank screens look like bugs.

**Rules.**
- Service down (`errService`): full-screen message with **Start it**. The app starts the service the right way for this OS (systemd, launchd, or the sidecar directly).
- Agent broken (`errAgent`): "Claude is not logged in" (or not found) with the fix command and **Check again**. Shown on the task page when a start fails for that reason.
- WebSocket reconnecting (`reconnecting`): thin banner at the top; it goes away by itself.
- App and service versions differ (`versionMismatch`): blocking screen with the fix.
- Any failed action: a toast with the daemon's error message and its `hint` (the fix) if there is one.

**Acceptance criteria.**
- The inventory in TDD section 5.3 is done; each item is checked once by hand.
- Stopping the service while the app is open shows `errService` within 5 s; **Start it** brings it back and restores the screen I was on.
- A start with a logged-out agent shows `errAgent` with the login command.

### 5.6 Playwright tests for the 3 main flows

**What.** Three end-to-end tests that click through the real UI against a real daemon that uses FakeAdapter (no real agents):
1. `daily-flow` — FSD 6.1: New task → More options → Just research → "Make a goal from this" → Start → "Claude has a question" → answer → checks fail → **Let Claude fix it** → Check and ship (Looks good) → **Ask Codex to review** → send a comment to Claude → **Approve and create pull request** (to a local bare repo, fake `gh`) → Lessons learned card → Done.
2. `parallel-flow` — FSD 6.2: two tasks run at the same time (Claude fixture + Codex fixture) in two projects; both show under Working; the one that needs input moves to Needs you and the Needs-you count goes to 1.
3. `bugfix-flow` — FSD 6.3: paste the error log as a note → saved instructions "Fix bug with TDD" → Start → Tests and checks shows the new test.

**Why.** These flows touch every milestone. One test each catches most breakages.

**Rules.**
- Tests run against the Vite build, not inside the Tauri window, in two engines: WebKit (close to the macOS and Linux webviews) and Chromium (close to WebView2 on Windows). Both are gates.
- New task from any app (a global OS shortcut) cannot be tested this way; `daily-flow` starts with `N` instead. The global shortcut is in the manual checklist.

**Acceptance criteria.**
- `npm run e2e` passes 3/3 in both engines, three runs in a row (no flaky tests).
- Total run time under 3 minutes per engine.

### 5.7 User guide

**What.** `docs/USER_GUIDE.md`, in simple English: install (per OS), first run, daily flow, many projects, parallel tasks, bug fix flow, "What agents may do" and the safe box per OS, Safety and cost, History and Restore, Files, CLI cheat sheet, shortcuts, troubleshooting, uninstall, where my data lives (per OS).

**Acceptance criteria.**
- Every command in the guide was run on a clean machine of its OS and works as written.
- Troubleshooting covers: service does not find agents (PATH), bwrap blocked on Ubuntu 24.04, agent not logged in, port 7878 busy, AppImage needs `libfuse2t64`, macOS "unidentified developer" warning, Windows SmartScreen warning, no Full access on Windows.

---

## 6. Main user flows

### 6.1 Fresh install (the < 10 minute flow)
1. Install the app: Linux `sudo apt install -y git ripgrep bubblewrap gh ./saarthi_1.0.0_amd64.deb`; macOS open the `.dmg`; Windows run the `.msi` (and install Git for Windows if missing).
2. Install agents if missing (`claude`, `codex`, `gemini`) and log in to each once.
3. Open Saarthi. The service starts by itself.
4. `setup1`: pick the first project. Then `setup2` "All set" (or `setup2x` with the one fix).
5. "Create your first task". Write a short goal, pick Read only, **Start** Claude on a tiny question. It answers.

### 6.2 After a reboot
1. Log in. With background mode on, the service starts by itself.
2. Open Saarthi. Home is there. Interrupted runs (if any) show "Resume".

### 6.3 Upgrade
1. Download the new installer for my OS and install it over the old one.
2. The app restarts the service with the new sidecar. Runs in progress are `interrupted` and can be resumed.
3. Settings → About shows the new version. No `versionMismatch` = done.

---

## 7. Done when

From `../../MILESTONES.md`, made concrete:

1. **Fresh install on a clean machine works in under 10 minutes, on each OS.**
   - Machines: Ubuntu 24.04 desktop VM, a clean macOS user account (latest macOS), Windows 11 VM. Fresh, network on, nothing extra installed.
   - Timer starts at the first step of flow 6.1 and stops when step 5 shows the agent's answer. Includes installing agents and logging in.
   - Result written in the release checklist with the time per OS.
2. **The lightness targets pass on each OS:** installer < 40 MB, app open < 2 s, idle RAM < 150 MB for the window and < 150 MB for the service (section 9 B).
3. **I use Saarthi for 2 full weeks without opening an IDE for agent work.**
   - "Agent work" = starting, watching, answering, reviewing and shipping agent changes. Opening my editor from "Open in my editor" for a small manual edit is allowed (F6.4, F17.4).
   - Daily one-line log in `core_docs/reports/dogfood_v1.md`: date, tasks done, "IDE opened for agent work: no / yes + why".
   - Every "yes" becomes a fix and restarts the count only if it shows a missing v1 feature. A bug fixed the same day does not restart it.
   - The 2 weeks run on `v1.0.0-rc.1`. Fixes go into `rc.2`, `rc.3`...
4. **Tag `v1.0.0`** after items 1-3 and the release checklist (section 9) are all green.

---

## 8. Out of scope (Later, after v1)

| Item | Note |
|---|---|
| Phone glance (F19.3) | Read-only LAN page |
| Voice capture | |
| More agents (F5.11): Aider, local models | Same adapter design (Gemini CLI is in M7) |
| GitHub Issues and other ticket providers (F23.7) | Jira is M10 |
| PR status on the task page (F11.4) | |
| API recordings (F7.8) | Screenshots, video and trace (F7.5) moved to M11 |
| Smart memory by meaning (F12.2 later part), ADR suggestions (F12.4) | |
| Team mode | |
| Sub-tasks (F2.8), files/images in research (F4.5), replay (F14.4), sound (F19.2) | |
| Go rewrite of the daemon | Only if TECH_STACK 2.3 signs show up |
| apt repository, auto-update, code signing and notarization, app stores, Flatpak/Snap | Not planned for v1 (open question 1) |
| An OS sandbox on Windows | Later (M8) |

---

## 9. QA checklist (release checklist)

**A. Build**
1. Version is `1.0.0` in `daemon/pyproject.toml`, `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml` (`scripts/check_versions.py` passes).
2. `cd daemon && uv run pytest && uv run ruff check . && uv run pyright` — all green on all 3 OSes, output saved.
3. `cd desktop && npm run lint && npm test && npm run e2e` — all green.
4. The release workflow (GitHub Actions matrix) makes the `.deb`, `.AppImage`, `.dmg`, `.msi` and the `SHA256SUMS` file from the tag.

**B. NF gate** (FSD section 7, TDD section 14) — on each OS unless noted

| Gate | How to check | Target |
|---|---|---|
| Installer size | CI step checks each file size | < 40 MB each |
| NF1a App open | `scripts/measure_startup.py`, 5 cold starts, median | < 2 s |
| NF1b Event to UI | Playwright `latency.spec.ts`, 50 FakeAdapter events, p95 | < 300 ms |
| NF2 Scale | `scripts/seed_scale.py` (10 projects, 500 tasks); Home "All projects" with 200 tasks; 8 parallel fake runs | Home < 500 ms, no errors |
| NF3 Reliability | Close the window during a run (run continues); restart the service (run `interrupted`, resume works) | pass |
| NF4 Privacy | Only `127.0.0.1:7878` is listening (`ss -tlnp` / `lsof -i` / `netstat -ano`); no telemetry code (`scripts/check_no_telemetry.py`) | pass |
| NF5 Idle RAM | `scripts/measure_idle_ram.py` after 10 min idle with seeded data | window < 150 MB, service < 150 MB |
| NF6 Platform | Clean install on each OS (Done when 1) | < 10 min |

**C. Manual**
5. Clean install timed on each OS (flow 6.1). Write the times here.
6. Reboot, log in: service up (background mode on), app opens on Home.
7. Setup: uninstall `rg` → `setup2` shows it as a warning line; remove `git` from `PATH` → `setup2x` with the fix.
8. `?` on every main screen.
9. Stop the service with the app open → `errService` → **Start it** works (each OS).
10. New task from any app (`Ctrl Alt N` / `Cmd Alt N`) works on GNOME, macOS and Windows (not covered by Playwright).
11. Notifications show on each OS (Tauri notification plugin).
12. Every command in `docs/USER_GUIDE.md` run once.
13. M8 checks still pass: `saarthi safety check` ok on Linux and macOS; on Windows it says "none (v1)" and Full access is not offered.

**D. Release**
14. Tag `v1.0.0-rc.1`, start the 2-week dogfood log.
15. After 2 weeks with no restart of the count: tag `v1.0.0`; the release workflow uploads the four installers and `SHA256SUMS` to the GitHub release.
16. Update `core_docs/timeline/timeline.md`, `memory/project_memory.md`, tick M9 in `MILESTONES.md`, write a review in `code_reviews/`.

---

## 10. Open questions

1. **Code signing.** Unsigned `.dmg` and `.msi` files show a macOS Gatekeeper and a Windows SmartScreen warning. Proposed: accept for v1; the user guide shows the steps. Apple notarization and a Windows certificate cost money and time.
2. **Runs and service restarts (core TDD 16 Q5).** Proposed on Linux: `KillMode=mixed` — agents stop with the service and are resumed later. `KillMode=process` would keep them running, but nobody would read their output or record their cost (see TDD Decision 2). macOS (launchd) and Windows give the same result: agents stop with the service and are resumed later. Accept?
3. **Playwright runs in WebKit and Chromium, not inside Tauri.** Tauri-only parts (window, native notifications, folder picker, global shortcut) are checked by hand on each OS. Accept?
4. **bwrap fix on Ubuntu 24.04.** Should setup add the AppArmor profile for bwrap (needs `sudo`), or only show the steps in the guide? Proposed: only show.
5. **Notifications need the app.** The Tauri plugin shows them only while the app runs (the window may be closed to the tray or hidden). Enough for v1?
6. **Effort.** The task list is ~25 h against a 1-week plan. Plan 2.5 weeks, or cut the perf scripts to manual checks?
7. **Intel Macs.** The macOS build is for Apple silicon only (the arm64 CI runner). Add an Intel (x64) build to the matrix, or leave it out of v1?

---

## 11. Effort

| Part | Hours |
|---|---|
| Background service per OS (systemd, launchd, Windows autostart) + install-service + clean shutdown | 3.5 |
| Sidecar binary (PyInstaller or Nuitka) + Tauri bundles (.deb, .AppImage, .dmg, .msi) + version check | 3.5 |
| GitHub Actions release matrix (3 OSes) | 2 |
| Doctor + first-run setup | 2 |
| Shortcut registry + sheet | 1 |
| Empty / error / loading states | 2 |
| Playwright harness + 3 flows + latency test (2 engines) | 4.5 |
| NF gate scripts incl. size, open time, idle RAM | 2 |
| User guide | 2 |
| Clean machine runs (Linux, macOS, Windows) + release | 2.5 |
| **Total** | **25** |

About 2.5 times the 1-week plan (it was ~19 h for Linux only; the 3-OS work adds ~6 h). The 2-week dogfood gate is calendar time on top.

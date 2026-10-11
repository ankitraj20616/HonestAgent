# FSD — M9: Polish + Package (v1.0)

**Document type:** Functional Specification Document (FSD)
**Milestone:** M9 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-11
**Estimated effort:** 10 hours planned (1 week at ~10 h/week). The TDD task list adds up to ~19 h — see section 11. Plus 2 weeks of calendar time for the dogfood gate.
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M9_polish_package.md`, `../../FUNCTIONAL_SPECIFICATIONS.md` (F18.2, section 6, section 7), `../../TDD-tech-design-doc.md` (13, 14, 16 Q5), `../../TECH_STACK.md` (packaging, systemd), `../M8_safety_cost_rewind/FSD_M8_safety_cost_rewind.md` (previous)

---

## 1. What this document covers

M9 turns a working dev setup into an app I install and use every day:

1. The daemon runs as a **systemd user service** (`saarthid.service`).
2. The desktop app ships as **AppImage** and **.deb**. The daemon installs with **`uv tool install`**.
3. A **first-run wizard** checks tools and adds the first project.
4. A **shortcut sheet** opens with `?`.
5. Every screen has proper **empty, error and loading states**.
6. **Playwright tests** cover the 3 main flows (FSD 6.1-6.3) against a daemon running FakeAdapter.
7. A **user guide**: `docs/USER_GUIDE.md`.
8. A **release checklist**, with NF1-NF6 as a gate, and the tag `v1.0.0`.

Owned (from `../README.md`): **F18.2**, packaging, systemd, first-run wizard, Playwright, user guide, **NF1**, **NF6**. The release gate also checks NF2-NF5, which earlier milestones built.

---

## 2. The goal in plain words

Today Saarthi runs from two dev terminals (`uv run saarthi daemon start --dev` and `npm run tauri dev`). If I reboot, I start both by hand. A new machine needs an hour of setup.

**At the end of M9 I can:**
- Install Saarthi on a clean Ubuntu 24.04 machine in under 10 minutes.
- Log in, and the daemon is already running. Open Saarthi from the app menu.
- See, on first start, which tools are missing and the exact command to fix each one.
- Press `?` anywhere to see every shortcut.
- Trust that the 3 main flows keep working, because tests run them on every change.
- Use Saarthi for 2 weeks without opening an IDE for agent work, then tag `v1.0.0`.

---

## 3. Where this milestone sits

| Before (already built) | M9 adds |
|---|---|
| M1: `saarthid`, `saarthi daemon start\|stop\|status`, `/health` | systemd unit, `saarthi daemon install-service`, `saarthi doctor` |
| M3: Tauri shell starts / connects to the daemon; Health page; Command Bar | Start through systemd; wizard; shortcut sheet; states |
| M1-M8: all features | Playwright end-to-end tests; user guide; release |
| M8: sandbox probe | Wizard checks that `bwrap` actually works |

M9 is the last v1 milestone. After it comes "Later" (section 8).

---

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **systemd user service** | A background program that Linux starts for me when I log in. No root needed. |
| **AppImage** | One file that runs on most Linux systems. Download, make it executable, run. |
| **.deb** | Ubuntu's normal install package (`sudo apt install ./file.deb`). Adds a menu entry. |
| **`uv tool install`** | Installs a Python command-line app in its own private environment. |
| **Wheel** | The install file of a Python package (`.whl`). |
| **Sidecar** | A program bundled inside the desktop app and started by it. |
| **First-run wizard** | The screens that guide me the first time I open the app. |
| **Playwright** | A tool that drives a real browser engine and clicks through the app like a user. |
| **Release gate** | A list of checks that must all pass before the version tag. |

---

## 5. Features

### 5.1 systemd user service

**What.** The daemon runs as `~/.config/systemd/user/saarthid.service`. It starts at login and restarts if it crashes.

**Why.** The UI and CLI need the daemon. I should never have to start it by hand.

**Example.**
```
$ saarthi daemon install-service
Wrote ~/.config/systemd/user/saarthid.service
Wrote ~/.config/saarthi/daemon.env (PATH with claude, codex, gh, rg)
Enabled and started saarthid. Status: active (running), http://127.0.0.1:7878
```
After that, `saarthi daemon start|stop|status` use `systemctl --user` under the hood.

**Rules.**
- The daemon gets my shell's `PATH` (and display variables, for "open in my editor") at install time, so it finds `claude` and `codex` (they often live in `~/.local/bin` or `~/.nvm`). After installing a new tool: `saarthi daemon install-service --refresh-env`.
- On stop or restart, running agents are stopped cleanly and marked `interrupted`. I resume them later (core TDD 8.6). Runs do not survive a daemon restart in v1 (see TDD Decision 2 and open question 2).
- `saarthi daemon uninstall-service` removes it. Data stays.

**Acceptance criteria.**
- After a reboot and login, `/health` answers without any manual step.
- `systemctl --user restart saarthid` during a run: the run shows `interrupted`, `saarthi run resume` continues it.
- `kill -9` of the daemon: it is back within 5 seconds.

### 5.2 Packaging: AppImage, .deb, daemon by `uv tool install`

**What.**
- Desktop: `saarthi_1.0.0_amd64.deb` and `saarthi_1.0.0_amd64.AppImage`, built by the Tauri bundler.
- Daemon: a wheel `saarthi-1.0.0-py3-none-any.whl` installed with `uv tool install`. This gives `saarthi` on `PATH`.
- `scripts/install.sh` does the daemon part in one go.
- All files go on the GitHub release `v1.0.0` with `SHA256SUMS`.

**Why.** TECH_STACK chose `uv tool install` first. It is the least work and uv brings its own Python 3.12.

**PyInstaller sidecar — only if one of these happens:**
1. `uv tool install` fails on the clean Ubuntu 24.04 VM test, or
2. the daemon part of the install takes more than 4 of the 10 minutes, or
3. I want to give Saarthi to someone who will not install uv.

None of these is expected for v1, so no sidecar is built unless a trigger fires.

**Example.**
```
$ sudo apt install -y git ripgrep bubblewrap gh ./saarthi_1.0.0_amd64.deb
$ curl -fsSL https://github.com/<owner>/saarthi/releases/download/v1.0.0/install.sh | bash
uv found (0.9.x)
Installed saarthi 1.0.0 -> ~/.local/bin/saarthi
saarthid service: active (running)
Next: open "Saarthi" from the app menu.
```

**Rules.**
- The desktop app and the daemon have the same version. If they do not match, the app shows a banner with the upgrade command.
- The .deb does not install the daemon (it is per user). The app tells me how if the daemon is missing.

**Acceptance criteria.**
- `.deb` installs on clean Ubuntu 24.04 and adds a menu entry with an icon.
- AppImage runs on the same VM (after `sudo apt install libfuse2t64`).
- `saarthi --version` and the app's About box both show `1.0.0`.

### 5.3 First-run wizard

**What.** Shown the first time the app opens (or when there are no projects). Three steps:
1. **Daemon** — connected? If not: the install command, and a "Retry" button.
2. **Tools** — `git`, `claude` (logged in?), `codex` (logged in?), `gh` (logged in?), `rg`, `bwrap` (works, not only installed). Each row: ok / missing, and a copy button with the fix command.
3. **First project** — pick a folder, Saarthi checks it is a git repo, writes `.saarthi/project.toml`, shows the board.

**Why.** Setup problems should show up on day one, with the fix next to them.

**Rules.**
- Required to continue: daemon, `git`, and at least one agent (`claude` or `codex`) logged in. Others are warnings.
- "Skip" is allowed on the project step.
- CLI first: the same checks are `saarthi doctor`. Adding a project is `saarthi project add` (M1).

**Example.**
```
$ saarthi doctor
daemon   ok    1.0.0 · saarthid.service active
git      ok    2.43.0
claude   ok    2.1.x · logged in
codex    warn  not logged in        fix: codex login
gh       ok    logged in as ankit
rg       ok    14.1.0
bwrap    fail  user namespaces blocked by AppArmor   fix: see USER_GUIDE.md "Sandbox on Ubuntu 24.04"
```

**Acceptance criteria.**
- On a clean profile (empty data dir), the app opens on the wizard.
- Each tool row matches `saarthi doctor --json`.
- After adding a project, the wizard never shows again (`settings.first_run_done = true`). Settings has "Run setup again".

### 5.4 F18.2 — Keyboard shortcut sheet (`?`)

**What.** Press `?` on any screen (not inside a text box or terminal). A sheet lists all shortcuts, grouped: Global, Board, Task Room, Review.

**Why.** FSD F18.2: "Every main action has a shortcut. A `?` key shows the shortcut list."

**Example (proposed set).**

| Keys | Action |
|---|---|
| `Ctrl+K` | Command Bar (M3) |
| `Ctrl+Alt+N` | Quick capture, works outside the app too (M3) |
| `?` | This sheet |
| `N` | New task |
| `G` then `D` / `B` / `M` / `P` / `S` | Go to Deck / Board / Memory / Playbooks / Settings |
| `/` | Search on this screen |
| `J` / `K`, `Enter` | Move selection, open |
| `R` | Start run (Task Room) |
| `Ctrl+Enter` | Send message to agent |
| `Ctrl+.` | Stop run |
| `C` | Run checks |
| `1`-`5` | Stream / Terminal / Proof / Review / Timeline tab |
| `Esc` | Close dialog / sheet |

**Rules.**
- All shortcuts are declared in one list in the code. The sheet and the Command Bar read the same list, so they never drift.
- Shortcuts do not fire while typing in an input, the brief editor, or the terminal.
- No CLI command: this is a UI-only feature (`saarthi --help` is the CLI's version).

**Acceptance criteria.**
- `?` opens the sheet on Deck, Board, Task Room, Memory, Playbooks, Settings.
- Every action in the Command Bar that has a shortcut shows the same keys in the sheet.
- Typing `?` in the brief editor types a `?`.

### 5.5 Empty, error and loading states

**What.** Every list and panel has three designed states:
- **Empty:** one line of help and one main button. Example, Board with no tasks: "No tasks yet. Press N to create one."
- **Error:** what went wrong in simple words, and what to do. Example: "Daemon is not running. [Start it]".
- **Loading:** grey skeleton rows, shown only if loading takes more than 150 ms (no flicker).

**Why.** v1 must feel finished. Blank screens look like bugs.

**Rules.**
- Daemon down: full-screen message with "Start daemon" (runs `systemctl --user start saarthid`).
- WebSocket reconnecting: thin banner at the top; it goes away by itself.
- Any failed action: a toast with the daemon's error message and its `hint` (the fix) if there is one.

**Acceptance criteria.**
- The inventory in TDD section 5.6 is done; each item is checked once by hand.
- Stopping the daemon while the app is open shows the daemon-down screen within 5 s; starting it again restores the screen I was on.

### 5.6 Playwright tests for the 3 main flows

**What.** Three end-to-end tests that click through the real UI against a real daemon that uses FakeAdapter (no real agents):
1. `daily-flow` — FSD 6.1: new task -> research -> draft brief -> Ready -> run -> Needs You -> answer -> checks fail -> fix -> Review -> second opinion -> fix these -> approve -> ship (to a local bare repo, fake `gh`) -> approve memory updates -> Shipped.
2. `parallel-flow` — FSD 6.2: two tasks run at the same time (Claude fixture + Codex fixture); both show Running; the one that needs input glows and moves to the top.
3. `bugfix-flow` — FSD 6.3: paste error log as a snippet -> playbook "Fix bug with TDD" -> run -> Proof Card shows the new test.

**Why.** These flows touch every milestone. One test each catches most breakages.

**Rules.**
- Tests run in Playwright's WebKit engine (closest to Tauri's WebKitGTK) against the Vite build, not inside the Tauri window.
- Quick capture (a global OS shortcut) cannot be tested this way; `daily-flow` starts with `N` instead. Quick capture is in the manual checklist.

**Acceptance criteria.**
- `npm run e2e` passes 3/3, three runs in a row (no flaky tests).
- Total run time under 3 minutes.

### 5.7 User guide

**What.** `docs/USER_GUIDE.md`, in simple English: install, first run, daily flow, parallel tasks, bug fix flow, permission profiles and sandbox, cost and budgets, rewind, CLI cheat sheet, shortcuts, troubleshooting, uninstall, where my data lives.

**Acceptance criteria.**
- Every command in the guide was run on the clean VM and works as written.
- Troubleshooting covers: daemon not found agents (PATH), bwrap blocked on Ubuntu 24.04, agent not logged in, port 7878 busy, AppImage needs `libfuse2t64`.

---

## 6. Main user flows

### 6.1 Fresh install (the < 10 minute flow)
1. `sudo apt install -y git ripgrep bubblewrap gh ./saarthi_1.0.0_amd64.deb`.
2. Install agents if missing (`claude`, `codex`) and log in to each once.
3. Run `install.sh` (installs uv if needed, the daemon, the service).
4. Open Saarthi from the app menu. The wizard shows all green (or the fix commands).
5. Add the first project. The board opens.
6. Create a task, write a brief, run Claude in `read_only` mode on a tiny question. It answers.

### 6.2 After a reboot
1. Log in. The daemon starts by itself.
2. Open Saarthi. The board is there. Interrupted runs (if any) show "Resume".

### 6.3 Upgrade
1. Download the new `.deb`, `sudo apt install ./saarthi_x.y.z_amd64.deb`.
2. `uv tool upgrade saarthi` (or re-run `install.sh`). The service restarts.
3. The app checks the versions match. No banner = done.

---

## 7. Done when

From `../../MILESTONES.md`, made concrete:

1. **Fresh install on a clean Ubuntu 24.04 VM works in under 10 minutes.**
   - VM: Ubuntu 24.04 desktop, fresh, network on, nothing extra installed.
   - Timer starts at the first command of flow 6.1 and stops when step 6 shows the agent's answer. Includes installing agents and logging in.
   - Result written in the release checklist with the time.
2. **I use Saarthi for 2 full weeks without opening an IDE for agent work.**
   - "Agent work" = starting, watching, answering, reviewing and shipping agent changes. Opening my editor from "Open in my editor" for a small manual edit is allowed (F6.4, F17.4).
   - Daily one-line log in `core_docs/reports/dogfood_v1.md`: date, tasks done, "IDE opened for agent work: no / yes + why".
   - Every "yes" becomes a fix and restarts the count only if it shows a missing v1 feature. A bug fixed the same day does not restart it.
   - The 2 weeks run on `v1.0.0-rc.1`. Fixes go into `rc.2`, `rc.3`...
3. **Tag `v1.0.0`** after items 1 and 2 and the release checklist (section 9) are all green.

---

## 8. Out of scope (Later, after v1)

| Item | Note |
|---|---|
| Phone glance (F19.3) | Read-only LAN page |
| Voice capture | |
| More agents (F5.11): Gemini CLI, Aider, local models | Same adapter design |
| Ticket sync (F3.3): Jira / GitHub Issues | |
| PR status in Task Room (F11.4) | |
| Evidence: screenshots, API recordings (F7.5) | |
| Smart memory by meaning (F12.2 later part), ADR suggestions (F12.4) | |
| Team mode | |
| Sub-tasks (F2.8), files/images in research (F4.5), replay (F14.4), sound (F19.2) | |
| Go rewrite of the daemon | Only if TECH_STACK 2.3 signs show up |
| apt repository, auto-update, package signing, other distros | Not planned for v1 |
| PyInstaller sidecar | Only if a trigger in 5.2 fires |

---

## 9. QA checklist (release checklist)

**A. Build**
1. Version is `1.0.0` in `daemon/pyproject.toml`, `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml` (`scripts/check_versions.sh` passes).
2. `cd daemon && uv run pytest && uv run ruff check . && uv run pyright` — all green, output saved.
3. `cd desktop && npm run lint && npm test && npm run e2e` — all green.
4. `npm run tauri build` makes the `.deb` and AppImage; `uv build` makes the wheel; `sha256sum` file made.

**B. NF gate** (FSD section 7, TDD section 14)

| Gate | How to check | Target |
|---|---|---|
| NF1a App opens | `scripts/measure_startup.sh` on the VM, 5 cold starts, median | < 2 s |
| NF1b Event to UI | Playwright `latency.spec.ts`, 50 FakeAdapter events, p95 | < 300 ms |
| NF2 Scale | `scripts/seed_scale.py` (10 projects, 500 tasks); board with 200 tasks; 8 parallel fake runs | board < 500 ms, no errors |
| NF3 Reliability | Close the UI during a run (run continues); `systemctl --user restart saarthid` (run `interrupted`, resume works) | pass |
| NF4 Privacy | `ss -tlnp` shows only `127.0.0.1:7878`; no telemetry code (`scripts/check_no_telemetry.sh`) | pass |
| NF5 Idle RAM | After 10 min idle with seeded data: `systemctl --user show saarthid -p MemoryCurrent` | < 200 MB |
| NF6 Platform | Clean Ubuntu 24.04 VM install (Done when 1) | < 10 min |

**C. Manual**
5. Clean VM install timed (flow 6.1). Write the time here.
6. Reboot the VM, log in: daemon up, app opens on the board.
7. Wizard: uninstall `rg` -> wizard shows it with the fix command.
8. `?` on every main screen.
9. Stop the daemon with the app open -> daemon-down screen -> "Start daemon" works.
10. Quick capture global shortcut works on GNOME (not covered by Playwright).
11. Every command in `docs/USER_GUIDE.md` run once.
12. M8 checks still pass on the VM: `saarthi safety check` ok.

**D. Release**
13. Tag `v1.0.0-rc.1`, start the 2-week dogfood log.
14. After 2 weeks with no restart of the count: tag `v1.0.0`, `gh release create v1.0.0` with the `.deb`, AppImage, wheel, `install.sh`, `SHA256SUMS`.
15. Update `core_docs/timeline/timeline.md`, `memory/project_memory.md`, tick M9 in `MILESTONES.md`, write a review in `code_reviews/`.

---

## 10. Open questions

1. **Where does the wheel live?** If the repo is private, `install.sh` cannot download from the release without `gh auth`. Proposed: `install.sh` uses `gh release download` when the repo is private.
2. **Runs and daemon restarts (core TDD 16 Q5).** Proposed: `KillMode=mixed` — agents stop with the daemon and are resumed later. `KillMode=process` would keep them running, but nobody would read their output or record their cost (see TDD Decision 2). Accept?
3. **Playwright runs in WebKit, not inside Tauri.** Tauri-only parts (window, native notifications, folder picker, global shortcut) are checked by hand. Accept?
4. **bwrap fix on Ubuntu 24.04.** Should `install.sh` add the AppArmor profile for bwrap (needs `sudo`), or only show the steps in the guide? Proposed: only show.
5. **Effort.** The task list is ~19 h against a 1-week plan. Plan 2 weeks, or cut the perf scripts to manual checks?

---

## 11. Effort

| Part | Hours |
|---|---|
| systemd service + install-service + clean shutdown | 2 |
| Packaging (.deb, AppImage, wheel, install.sh, version check) | 2.5 |
| Doctor + first-run wizard | 2 |
| Shortcut registry + sheet | 1 |
| Empty / error / loading states | 2 |
| Playwright harness + 3 flows + latency test | 4.5 |
| NF gate scripts | 1.5 |
| User guide | 2 |
| Clean VM run + release | 1.5 |
| **Total** | **19** |

About double the 1-week plan. The 2-week dogfood gate is calendar time on top.

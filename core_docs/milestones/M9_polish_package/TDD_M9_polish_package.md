# TDD — M9: Polish + Package (v1.0)

**Document type:** Technical Design Document (TDD)
**Milestone:** M9 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`), sidecar daemon, background service per OS, one GitHub Actions release matrix, lightness gate, new setup and error screens
**Estimated effort:** 10 hours planned; breakdown in section 16 says ~25 h (was ~19 h for Linux only) (+ 2 weeks calendar for dogfooding)
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. Every decision says *why*.
**Related documents:** `FSD_M9_polish_package.md`, `../../TDD-tech-design-doc.md` (8.6, 10, 12, 13, 14, 16 Q4-Q5), `../../TECH_STACK.md` (1, 2.3, 5), `../../decisions/ADR-002-cross-platform-lightweight.md`, `../M8_safety_cost_rewind/TDD_M8_safety_cost_rewind.md`, `../M3_desktop_ui_v1/TDD_M3_desktop_ui_v1.md`
**Screens:** prototype views `setup1`, `setup2`, `setup2x`, `homeEmpty`, `shortcuts`, `errService`, `errAgent`, `reconnecting`, `versionMismatch`, `settingsAbout` in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. The goal in one sentence

Make Saarthi install in under 10 minutes on a clean Linux, macOS or Windows machine from one native installer (daemon inside as a sidecar), keep the background service running after login on each OS, guide the first run, cover the 3 main flows with end-to-end tests, and ship `v1.0.0` only after a release gate that checks NF1-NF6 and the lightness targets (installer < 40 MB, open < 2 s, idle RAM < 150 MB window + < 150 MB service).

---

## 2. Read this first — rules this work must not break

1. **All logic in the daemon** (CLAUDE.md rule 1). The setup screens read `/health`; they do not check tools themselves. One exception, on purpose: `saarthi daemon install-service` and `saarthi doctor` must work when the daemon is *not* running, so they call shared Python functions directly (Decision 1, Decision 7). They do not duplicate logic. Starting the service is done by the Tauri shell (M3 already does this), not by React code.
2. **CLI first** (rule 2). `saarthi doctor` before the setup screens; `saarthi daemon install-service` before the "Keep Saarthi ready in the background" switch. The shortcut sheet is UI-only by nature.
3. **No agent-specific code outside `agents/`** (rule 3). The e2e fake-agent scenario loader lives in `agents/`.
4. **Never call real agents in tests** (rule 8). Playwright drives a daemon whose adapters are all FakeAdapter.
5. **No hard-coded values** (rule 7). Ports, timeouts, tool list, fix hints, service names, size and RAM targets in `config.py`; UI timings in `desktop/src/config.ts`.
6. **Do not build "Later" features** (rule 10). No auto-update, no apt repo, no code signing, no app stores.
7. **One codebase for 3 OSes** (Simple UI spec P3). OS differences live in small tables (`SERVICE_BACKEND_BY_OS`, per-OS `hint`), never in `if` chains spread over the code.

---

## 3. What already exists (do not rebuild)

| Thing | Where | Built in |
|---|---|---|
| `saarthid` foreground entry point (lock, pid, migrations, uvicorn); `saarthi daemon start\|stop\|status` (spawns `saarthid`); `SAARTHI_DATA_DIR` / `SAARTHI_CONFIG_DIR` / `SAARTHI_PORT`; error shape `{error: {code, message, hint}}` | `daemon.py`, `cli/daemon.py`, `config.py` | M1 |
| Tauri window + daemon start proven on Linux, macOS and Windows; CI matrix of the 3 OSes | `spikes/`, `.github/workflows/spike-cross-platform.yml` (M0), `.github/workflows/daemon-tests.yml` (M2) | M0, M2 |
| Data and config folders from `platformdirs`; PTY on Windows via ConPTY (`pywinpty`) | `config.py`, `agents/pty.py` | M2 |
| `/health` (daemon, git, agents found + logged in, `gh`) | `api/health.py`, `core/health.py` | M1 / M3 |
| Run interrupt + resume on daemon restart (core TDD 8.6); clean `daemon stop` marks live runs `interrupted` | `core/runs.py` | M2 |
| Latency samples (p50/p95) in `stores/latency.ts`; `saarthi dev replay` | `desktop/src/stores/`, `cli/` | M3 |
| FakeAdapter replaying JSONL fixtures; spawn mode | `agents/fake.py` | M2 / M8 |
| Tauri shell: start / connect daemon, read token, notifications (Tauri notification plugin); Settings → Health; Search or jump; global New task | `desktop/src-tauri/`, `desktop/src/` | M3 |
| `GeminiAdapter` and its `check_ready()` | `agents/gemini.py` | M7 |
| All features of the 3 main flows | — | M3-M7 |
| Sandbox probe per OS (`bwrap` / `sandbox-exec` works?; none on Windows) | `safety/sandbox.py::probe()` | M8 |

---

## 4. Technical decisions

### Decision 1 — Background service: one small backend per OS, picked from a table (new)
`service/__init__.py::backend_for(sys.platform)` reads `config.SERVICE_BACKEND_BY_OS = {"linux": "systemd", "darwin": "launchd", "win32": "win_autostart"}`. Each backend has the same five functions: `install()`, `uninstall()`, `is_installed()`, `start()`, `stop()`. `daemon start` keeps M1's spawn mode for machines where the backend is not available (no systemd user session, container, WSL).

All backends run the **sidecar binary** (Decision 5). Its absolute path is found at install time (`sys.executable` of the frozen binary, or the `saarthid` script in dev) and written into the service file.

| OS | What `install()` writes | Start / stop |
|---|---|---|
| Linux | `~/.config/systemd/user/saarthid.service` (template below) | `systemctl --user enable --now saarthid` / `stop` |
| macOS | `~/Library/LaunchAgents/dev.saarthi.daemon.plist` with `ProgramArguments = [<sidecar>, "serve"]`, `RunAtLoad = true`, `KeepAlive = {SuccessfulExit: false}`, `ExitTimeOut = SERVICE_STOP_TIMEOUT_SEC`, `EnvironmentVariables` from `daemon.env` | `launchctl bootstrap gui/<uid> <plist>`, `launchctl kickstart -k gui/<uid>/dev.saarthi.daemon`, `launchctl bootout ...` |
| Windows | current-user Run entry (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, value `Saarthi` = `"<sidecar>" serve`), written with stdlib `winreg` | start = spawn the sidecar detached (`DETACHED_PROCESS \| CREATE_NEW_PROCESS_GROUP`); stop = Decision 2 |

Linux unit template (package data `saarthi/service/saarthid.service.tmpl`):

```ini
[Unit]
Description=Saarthi background service (saarthid)

[Service]
Type=simple
ExecStart=<sidecar path> serve
EnvironmentFile=-<config dir>/daemon.env
Restart=on-failure
RestartSec=3
KillMode=mixed
TimeoutStopSec=20

[Install]
WantedBy=default.target
```

No sandboxing options (`ProtectHome=` etc.) in the unit: the daemon must start git, agents and the OS sandbox exactly as the user would. Agent isolation is M8's job.
**Why a table and three tiny files:** each OS tool is different, but the daemon only needs "start at login, restart on crash, stop cleanly". Windows has no user-level service manager without admin rights, so an autostart entry plus "the app restarts it when it opens" (Decision 4) is the light choice. A real Windows service (SCM) needs admin and is not worth it for v1.

### Decision 2 — Stop: agents stop with the service (answers core TDD 16 Q5) (new)
`KillMode=process` would leave agents alive when the daemon restarts. But agents write their stream to a pipe the daemon owned. After a restart nobody reads that pipe: events and cost are lost (breaks rule 4 and NF3 "no data loss"), and the agent may block or die on a broken pipe while still spending tokens. Re-attaching would need agents to write to files and the daemon to tail them: a big M2 change, not polish.
- **Linux:** `KillMode=mixed` sends SIGTERM to the daemon only. SIGTERM runs the same path as M2's clean `daemon stop`: stop each live run through its adapter, checkpoint, mark it `interrupted` (with `agent_session_id` kept), flush the Event Store, exit within `SHUTDOWN_GRACE_SEC = 10`. After `TimeoutStopSec`, systemd kills what is left.
- **macOS:** launchd sends SIGTERM to the daemon, waits `ExitTimeOut`, then kills the process group. Same clean-stop path, same result.
- **Windows:** `saarthi daemon stop` sends `CTRL_BREAK_EVENT` to the service's process group; Python sees `SIGBREAK`, and the daemon runs the same clean-stop path. After `SHUTDOWN_GRACE_SEC` it is ended. At logoff Windows ends it; on the next start flow 8.6 marks leftovers `interrupted`.

M9 only makes sure SIGTERM / SIGBREAK reach that path. M8's `bwrap --die-with-parent` agrees with this. On start, flow 8.6 offers Resume.
M0's `spike_detach.py` tested file-based survival. If ADR-001 says it is simple and reliable, revisit after v1.

### Decision 3 — Capture `PATH` into `daemon.env` (Linux, macOS) (new)
A systemd user service and a launchd agent get a short default `PATH`, without `~/.local/bin` or `~/.nvm/.../bin`, where `claude`, `codex` and `gemini` often live. `install-service` writes `<config dir>/daemon.env` (chmod 600) with only allow-listed variables from the current shell: `DAEMON_ENV_CAPTURE = ["PATH", "SSH_AUTH_SOCK", "EDITOR", "LANG", "DISPLAY", "WAYLAND_DISPLAY"]`. Never API keys. `SSH_AUTH_SOCK` lets the daemon's own `git push` at ship time (M5) work; M8 still hides it from agents. `DISPLAY` / `WAYLAND_DISPLAY` let M3's "Open in my editor / terminal" work from the service (M3 flagged this); on a one-seat desktop they are stable. systemd reads the file with `EnvironmentFile`; on macOS the same values go into the plist `EnvironmentVariables`.
Windows: a process started at login gets the user's full environment from the registry, so no file is needed.
It also stores the resolved absolute paths of `claude`, `codex`, `gemini`, `gh` into settings (`agents.claude_path`, F21.1) if they are empty. `saarthi daemon install-service --refresh-env` re-captures after installing a new tool.

### Decision 4 — How the desktop app finds and starts the service (new detail)
`desktop/src-tauri/src/daemon.rs`, on launch:
1. `GET /health` with the token. OK -> go.
2. Else if background mode is installed -> start it through the OS (`systemctl --user start saarthid`, `launchctl kickstart gui/<uid>/dev.saarthi.daemon`, or on Windows spawn the sidecar), poll health for `DAEMON_START_WAIT_MS = 5000`.
3. Else -> spawn the bundled sidecar directly, **detached** (own session on Linux/macOS, `DETACHED_PROCESS` on Windows), so closing the window does not stop it (NF3). Poll.
4. Still down -> `errService` ("The background service is not running") with the last 20 lines of `daemon.log` and **Start it**.
All via `std::process::Command` with list args. **Start it** calls the same Tauri command. The OS choice lives in one Rust `match` on the target OS.
**Why spawn detached and not through the shell plugin's sidecar API:** the plugin ties the child to the app's life; runs must go on when the window closes.

### Decision 5 — Distribution: the daemon is one sidecar binary inside each installer (new)
- `packaging/build_sidecar.py` builds the daemon with **PyInstaller `--onefile`** into `desktop/src-tauri/binaries/saarthid-<target-triple>[.exe]` (the name Tauri `externalBin` expects). The same binary is the CLI: `saarthid serve` runs the daemon; `saarthid <anything else>` runs the Typer CLI. The installers expose it as `saarthi` on `PATH` (the `.deb` adds `/usr/bin/saarthi`; the `.msi` adds the install folder to the user `PATH`; macOS setup offers a link in `~/.local/bin`).
- **Switch to Nuitka** (`--onefile`, compiled) if PyInstaller misses the size target (installer > 40 MB) or the sidecar takes more than `SIDECAR_START_MAX_MS = 1500` to answer `/health` on the CI runners. Measured in the release workflow, not guessed.
- `uv tool install` from the repo stays as the developer path (and the e2e harness uses `uv run saarthid`).
**Why:** a clean machine has no uv and maybe an old or no Python (Windows, macOS). One binary per OS removes a whole install step and a version-drift source. PyInstaller first because it is the most used and simplest; Nuitka is the known way out if size or start time is too high.

### Decision 6 — Bundle config
`desktop/src-tauri/tauri.conf.json`: `bundle.targets = ["deb", "appimage", "dmg", "msi"]`, `bundle.externalBin = ["binaries/saarthid"]`, product name `Saarthi`, identifier `dev.saarthi.app`, icons in `src-tauri/icons/`, category `Development`. Plugins: `notification` (all 3 OSes), `dialog` (folder picker), `global-shortcut` (New task from any app). `.deb` depends on what the Tauri bundler adds for WebKitGTK 4.1, plus `git`. `ripgrep`, `bubblewrap`, `gh` go in `recommends` if the Tauri deb config supports it; if not, setup covers them. Linux builds on Ubuntu 24.04 (same glibc as the target); AppImage needs `libfuse2t64` on 24.04 (user guide). macOS builds on the arm64 runner (Apple silicon; Intel is FSD open question 7). Windows `.msi` uses WebView2, which Windows 11 already has (`webviewInstallMode = "downloadBootstrapper"` for older machines).

### Decision 7 — `saarthi doctor` and `/health` share one check list
`core/health.py::check_tools()` returns `[ToolStatus(name, found, version, logged_in, ok, required, hint)]`. Tools and fix hints come from `config.TOOL_CHECKS`. A `hint` is a small dict per OS (`{"linux": ..., "darwin": ..., "win32": ...}`); `check_tools()` returns the one for this OS.

| Tool | Required | Check | `hint` (Linux / macOS / Windows) |
|---|---|---|---|
| `git` | yes | `git --version` | `sudo apt install git` / `xcode-select --install` / `winget install Git.Git` |
| `claude` | one of claude/codex/gemini | adapter `check_ready()` | the official install command, then `claude` to log in |
| `codex` | one of claude/codex/gemini | adapter `check_ready()` | `npm install -g @openai/codex` then `codex login` |
| `gemini` | one of claude/codex/gemini | adapter `check_ready()` (M7) | `npm install -g @google/gemini-cli` then `gemini` to log in |
| `gh` | no | `gh auth status` | `sudo apt install gh` / `brew install gh` / `winget install GitHub.cli`, then `gh auth login` |
| `rg` | no | `rg --version` | `sudo apt install ripgrep` / `brew install ripgrep` / `winget install BurntSushi.ripgrep.MSVC` |
| `sandbox` | no (needed for `full`) | M8 `probe()` | `sudo apt install bubblewrap`; if userns blocked: USER_GUIDE "Safe box on Ubuntu 24.04" / built in / "not available on Windows yet" |

Agent checks go through `AgentAdapter.check_ready()` (rule 3). `/health` returns the list plus `version`, `api_version`, `os`, `service` (`running` / `stopped` / `not_installed`, and `backend`), `fake_agents`. `saarthi doctor` calls `/health`; if the daemon is down it calls `check_tools()` locally and adds `service: fail`. Exit code 0 if all required are ok, else 1.
The setup screens show `setup2` when every required tool is ok, else `setup2x` with the **first** failing required tool (order of `TOOL_CHECKS`).

### Decision 8 — Version match between UI and service (new)
The app and its sidecar are built together, so a fresh install always matches. A mismatch happens in two cases: after an upgrade the old service is still running, or a developer runs a different daemon. `config.API_VERSION` (int, bumped on breaking API change) and the package version are in `/health`. The UI is built with the same `API_VERSION` (generated into `desktop/src/api/version.ts` by `scripts/gen_types.py`).
- Package version differs -> the shell restarts the service once (stop, start the bundled sidecar). This is the normal upgrade path.
- Still a different `API_VERSION` -> blocking `versionMismatch` screen with the fix (for developers: `uv tool upgrade saarthi`). Same API, different package version -> small grey note in Settings → About.

### Decision 9 — One shortcut registry
`desktop/src/lib/shortcuts.ts` exports `SHORTCUTS: Shortcut[]` (`id`, `keys`, `label`, `scope`, `action id`). Keys use `Mod` for `Ctrl` (Linux, Windows) / `Cmd` (macOS). `useShortcuts()` binds them; `ShortcutSheet` and Search or jump render from the same array. Scopes: `global`, `home`, `task`, `files`, `check`. The hook ignores keys when focus is in `input`, `textarea`, `[contenteditable]`, CodeMirror or xterm. A Vitest test checks no two shortcuts in the same scope share keys.

### Decision 10 — Standard state components
`EmptyState`, `ErrorBanner`, `Skeleton`, `ServiceDown` (`errService`), `AgentError` (`errAgent`), `ReconnectingBar` (`reconnecting`), `VersionMismatch` (`versionMismatch`), and `useDelayedLoading(ms)` (`LOADING_SKELETON_DELAY_MS = 150` in `desktop/src/config.ts`). Errors show the daemon's `{error: {code, message, hint}}` body (M1 shape); M9 adds `hint` text where it is missing (tool not found, agent not logged in, sandbox unavailable, port busy). `AgentError` shows when a start fails with `agent_not_found` / `agent_not_logged_in`.

### Decision 11 — Playwright runs in WebKit and Chromium against the web build, with a test daemon (new)
Playwright cannot drive the Tauri window directly. Core TDD 16 Q4 already names "UI in a normal browser" as plan B, so the React app works outside Tauri.
- `desktop/src/platform/index.ts`: `isTauri ? tauriImpl : webImpl` for notifications, folder picker, open-in-editor, start-service. Web versions are simple (folder path as a text input; notifications as toasts). If M3 already has this layer, reuse it.
- Playwright projects: `webkit` (close to WKWebView on macOS and WebKitGTK on Linux) and `chromium` (close to WebView2 on Windows). Both are gates. E2E runs on the Linux CI runner; the macOS and Windows runners run the unit tests and the sidecar smoke test (Decision 15).
- `e2e/global-setup.ts` makes a temp data dir and two temp sample repos (from `e2e/fixtures/sample-repo/`, each with a bare repo as `origin`, for the many-projects flow), then starts `saarthid` with `SAARTHI_DATA_DIR=<tmp>`, `SAARTHI_CONFIG_DIR=<tmp>`, `SAARTHI_PORT=7879`, `SAARTHI_FAKE_AGENTS=<scenario.toml>` and `PATH=e2e/bin:$PATH` (a fake `gh` that writes the PR body to a file and prints a URL). Then `vite preview` with `VITE_DAEMON_URL` and the test token.

### Decision 12 — Fake agent scenarios for e2e (new)
`agents/fake_scenario.py` reads a TOML that maps each call to a fixture:
```toml
[[step]]   # first claude build run on any task
agent = "claude"; mode = "build"; nth = 1
fixture = "e2e/daily_build_needs_input.jsonl"
patch   = "e2e/daily_build.patch"     # applied with `git apply` in the worktree before run.finished
```
All adapter names (`claude`, `codex`, `gemini`) resolve to FakeAdapter with the matching step. `delay_ms` per line lets the parallel flow and latency test control timing.
Guard: `SAARTHI_FAKE_AGENTS` is refused unless `SAARTHI_DATA_DIR` is set and is not the default data dir. `/health.fake_agents = true` makes the UI show a red "TEST MODE" bar.

### Decision 13 — How NF1 and the lightness targets are measured
- **App open < 2 s** (`NF_APP_OPEN_MAX_MS`): Tauri `main.rs` logs `startup_t0` (process start, monotonic ms). The React app calls `platform.markReady("home")` on the first Home paint with data; Tauri logs `ready_ms`. `scripts/measure_startup.py` starts the installed app 5 times with the service already running (background mode, the normal case), reads the log, prints the median. A launch that must also start the sidecar is logged too, but not gated.
- **Event -> UI < 300 ms:** M3 already records latency samples in `stores/latency.ts`. `e2e/latency.spec.ts` replays a fixture of 50 events at 100 ms spacing, then reads p95 from Settings → Health (or the store, exposed on `window` only when `VITE_E2E=1`). Assert p95 < `LATENCY_TARGET_MS` (300, M3 config).
- **Idle RAM** (`NF_IDLE_RAM_WINDOW_MAX_MB`, `NF_IDLE_RAM_SERVICE_MAX_MB`): `scripts/measure_idle_ram.py` (uses `psutil`, dev dependency only) after 10 min idle with seeded data. Service = the sidecar process. Window = the app process plus its webview helper processes, found by the names in `WEBVIEW_PROCESS_NAMES` per OS (WebKitGTK `WebKitWebProcess`, macOS `com.apple.WebKit.WebContent`, Windows `msedgewebview2.exe`).
- **Installer size** (`NF_INSTALLER_MAX_MB`): `scripts/check_installer_size.py` runs in the release workflow after the bundle step and fails the job if any file is bigger.
The gate scripts read the targets from `config.py`, so there is one place for the numbers.

### Decision 14 — Release via release candidates (new)
`v1.0.0-rc.1` starts the 2-week dogfood. Fixes ship as `rc.N`. `v1.0.0` is tagged on the commit of the last rc when the gate is green. Tags are pushed; nothing is pushed to `main` by Saarthi (rule 6 is about the app; the owner tags by hand).

### Decision 15 — One GitHub Actions release matrix (new)
`.github/workflows/release.yml`, on a `v*` tag, matrix `os: [ubuntu-24.04, macos-latest, windows-latest]`:
1. Install uv, Node, Rust. `uv sync`, `npm ci`.
2. `uv run pytest -m "not perf"` (sandbox tests required on Linux and macOS, M8).
3. `uv run python packaging/build_sidecar.py` -> `binaries/saarthid-<triple>`.
4. `scripts/smoke_sidecar.py`: start the built sidecar with a temp data dir, wait for `/health`, check `version`, stop it cleanly. This is the per-OS proof that the frozen daemon works.
5. `npm run tauri build` -> the bundles of that OS.
6. `scripts/check_installer_size.py`.
7. Upload artifacts; a last job (Linux) writes `SHA256SUMS` and creates a **draft** GitHub release with all files. The owner publishes it by hand.
The normal CI (`daemon-tests.yml`, from M2, which grew out of the M0 spike workflow) keeps the same 3-OS matrix for tests on every push; M9 adds the e2e job, on Linux only.
**Why:** one workflow, one tag, every OS built the same way. A draft release keeps the last step human.

---

## 5. Modules and files

### 5.1 Daemon
| File | Change |
|---|---|
| `daemon/src/saarthi/service/__init__.py` | **New.** `backend_for(platform)` from `SERVICE_BACKEND_BY_OS`; `Backend` protocol (Decision 1). |
| `daemon/src/saarthi/service/systemd.py` | **New.** `render_unit()`, `install()`, `uninstall()`, `is_installed()`, `start()`, `stop()`, `systemctl(*args)`. |
| `daemon/src/saarthi/service/launchd.py` | **New.** `render_plist()` (stdlib `plistlib`), same five functions, `launchctl(*args)`. |
| `daemon/src/saarthi/service/win_autostart.py` | **New.** Run-entry write / delete with stdlib `winreg`; detached spawn; stop via `CTRL_BREAK_EVENT`. |
| `daemon/src/saarthi/service/env.py` | **New.** `write_daemon_env()` (Decision 3). |
| `daemon/src/saarthi/service/saarthid.service.tmpl` | **New.** Unit template (Decision 1). |
| `daemon/src/saarthi/cli/daemon.py` | `install-service [--refresh-env]`, `uninstall-service`, `restart`; `start/stop/status` delegate to the backend when installed. |
| `daemon/src/saarthi/cli/doctor.py` | **New.** `saarthi doctor [--json]`. |
| `daemon/src/saarthi/cli/main.py` | `--version`; `serve` subcommand in the frozen binary (Decision 5). |
| `daemon/src/saarthi/core/health.py`, `api/health.py` | Tool list from `TOOL_CHECKS` (per-OS hint), `version`, `api_version`, `os`, `service`, `fake_agents`. |
| `daemon/src/saarthi/daemon.py` | SIGTERM (and SIGBREAK on Windows) handler calls M2's clean-stop path (Decision 2). |
| `daemon/src/saarthi/agents/fake_scenario.py` | **New.** Scenario loader (Decision 12). |
| `daemon/src/saarthi/config.py` | Section 10. |
| `daemon/pyproject.toml` | Version `1.0.0`; package data for the unit template; `pyinstaller` and `psutil` in the dev group only. |
| `daemon/packaging/build_sidecar.py`, `daemon/packaging/saarthid.spec` | **New.** Sidecar build (Decision 5). |

### 5.2 Desktop
| File | Change |
|---|---|
| `desktop/src-tauri/src/daemon.rs` | Decision 4 (find / start the service per OS, detached spawn, restart on version change). `startup_t0` / `ready_ms` logging. |
| `desktop/src-tauri/tauri.conf.json`, `Cargo.toml`, `icons/`, `binaries/` | Bundle config (4 targets), `externalBin`, plugins, version. |
| `desktop/src/platform/index.ts` (+ `tauri.ts`, `web.ts`) | Decision 11. |
| `desktop/src/screens/Setup/SetupPickProject.tsx` (`setup1`), `SetupAllSet.tsx` (`setup2`), `SetupOneFix.tsx` (`setup2x`) | **New.** First-run setup. |
| `desktop/src/screens/Settings/About.tsx` (`settingsAbout`) | **New.** App, service and API versions, OS, background mode. |
| `desktop/src/lib/shortcuts.ts`, `hooks/useShortcuts.ts`, `components/ShortcutSheet.tsx` (`shortcuts`) | **New.** Decision 9. |
| `desktop/src/components/states/*.tsx`, `hooks/useDelayedLoading.ts` | **New.** Decision 10. |
| `desktop/src/config.ts` | UI timings. |
| `desktop/src/api/version.ts` | Generated `API_VERSION`. |

### 5.3 Empty / error / loading inventory
| Screen / panel | Empty | Error | Loading |
|---|---|---|---|
| Home (`homeEmpty`) | "Add your first project" -> `setup1`; with projects but no tasks: "Nothing here yet. Press N" | `ServiceDown` | skeleton rows |
| Board view | "No tasks. Press N" | banner + retry | skeleton columns |
| Task page: Activity | "Nothing yet. Press R to start" | toast; `AgentError` on a failed start | skeleton rows |
| Check and ship | "Tests and checks run when the agent finishes" | banner | skeleton |
| More → History (M8) | "Undo points are made at the end of each run" | toast | skeleton |
| Files search | "No matches" | "ripgrep not found" + fix | spinner in box |
| Just research, Lessons and notes, Saved instructions | one line + main button each | banner | skeleton |
| Jira tickets (M10, if built) | "Tickets are not set up for this project" + `project.toml` example | banner | skeleton |
| Global | — | `ReconnectingBar`; `VersionMismatch`; TEST MODE bar | — |

### 5.4 Tests, scripts, CI, docs
| Path | What |
|---|---|
| `desktop/e2e/playwright.config.ts`, `global-setup.ts`, `global-teardown.ts` | Harness (WebKit + Chromium). |
| `desktop/e2e/daily-flow.spec.ts`, `parallel-flow.spec.ts`, `bugfix-flow.spec.ts`, `latency.spec.ts` | The flows + NF1b. |
| `desktop/e2e/scenarios/*.toml`, `daemon/tests/fixtures/agents/e2e/*.jsonl` + `.patch` | Fake agent data. |
| `desktop/e2e/fixtures/sample-repo/` | Tiny Python repo; checks: `python3 -m unittest` (no uv needed in e2e). |
| `desktop/e2e/bin/gh` | Fake `gh`. |
| `.github/workflows/release.yml` | **New.** Decision 15. |
| `.github/workflows/daemon-tests.yml` | 3-OS test matrix (from M2) + new Linux e2e job. |
| `scripts/check_versions.py`, `measure_startup.py`, `measure_idle_ram.py`, `check_installer_size.py`, `smoke_sidecar.py`, `seed_scale.py`, `check_no_telemetry.py`, `gen_types.py` | Gate and release helpers. Python, so they run on all 3 OSes. |
| `docs/USER_GUIDE.md` | **New.** User guide (FSD 5.7). |
| `core_docs/reports/dogfood_v1.md` | Daily log for the 2 weeks. |

---

## 6. Data model changes

None. No migration. One new `settings` key: `first_run_done` (bool).

---

## 7. Events added

None. Service start/stop shows through existing `run.interrupted` events and the daemon log.

---

## 8. API and CLI added

### 8.1 API
| Method | Path | Change |
|---|---|---|
| GET | `/health` | Adds `version`, `api_version`, `os`, `service: {state, backend}`, `fake_agents`, and `tools: [{name, found, version, logged_in, ok, required, hint}]` |

No new endpoints. The setup screens use `/health`, `POST /projects` (M1) and `PUT /settings` (M3).

### 8.2 CLI
| Command | Options | Output |
|---|---|---|
| `saarthi daemon install-service` | `--refresh-env` | Backend, paths written, service status |
| `saarthi daemon uninstall-service` | — | "Removed background mode. Data kept in <data dir>" |
| `saarthi daemon start\|stop\|restart\|status` | — | Unchanged output; uses the OS backend if installed |
| `saarthi doctor` | `--json` | Table as in FSD 5.3; exit 1 if a required tool fails |
| `saarthi --version` | — | `saarthi 1.0.0 (api 1)` |

`saarthid` (M1) is unchanged in dev; the frozen sidecar runs it as `saarthid serve`. The OS backends and the e2e harness run it directly.

---

## 9. Key flows

### 9.1 Install and first open
Installer -> user opens Saarthi -> Decision 4: no health -> spawn sidecar detached -> health OK -> no projects -> `setup1` -> project added -> `/health.tools` -> `setup2` (background-mode switch on -> `install-service`) or `setup2x`.

### 9.2 Service stop with active runs
Linux `systemctl --user stop saarthid` / macOS `launchctl bootout` / Windows `saarthi daemon stop` -> SIGTERM or SIGBREAK -> `shutdown()`: refuse new runs; for each active run `adapter.stop()` -> status `interrupted`, `run.interrupted` event -> task `Failed` "interrupted" (8.6) -> flush -> exit 0. Start later -> UI shows Resume.

### 9.3 Upgrade
New installer replaces the app and its sidecar -> user opens the app -> health shows the old version -> Decision 8: restart the service once with the new sidecar -> runs are `interrupted`, resumable.

### 9.4 E2E run
`npm run e2e` -> global setup (temp dirs, two sample repos, bare origins, test daemon on 7879 with scenario, `vite preview`) -> specs in WebKit and Chromium -> teardown kills daemon and removes temp dirs.

---

## 10. Config added

`config.py`:

| Constant | Default |
|---|---|
| `SERVICE_NAME` | `"saarthid"` |
| `SERVICE_BACKEND_BY_OS` | `{"linux": "systemd", "darwin": "launchd", "win32": "win_autostart"}` |
| `SYSTEMD_USER_DIR` | `~/.config/systemd/user` |
| `LAUNCHD_AGENTS_DIR`, `LAUNCHD_LABEL` | `~/Library/LaunchAgents`, `"dev.saarthi.daemon"` |
| `WIN_RUN_KEY`, `WIN_RUN_VALUE` | `r"Software\Microsoft\Windows\CurrentVersion\Run"`, `"Saarthi"` |
| `DAEMON_ENV_FILE` | `<config dir>/daemon.env` (config dir from `platformdirs`) |
| `DAEMON_ENV_CAPTURE` | `["PATH", "SSH_AUTH_SOCK", "EDITOR", "LANG", "DISPLAY", "WAYLAND_DISPLAY"]` |
| `SERVICE_STOP_TIMEOUT_SEC` | `20` (goes into the unit and the plist) |
| `SHUTDOWN_GRACE_SEC` | `10` |
| `TOOL_CHECKS` | Decision 7 table (per-OS hints) |
| `API_VERSION` | `1` |
| `FAKE_AGENTS_ENV` | `"SAARTHI_FAKE_AGENTS"` |
| `E2E_DEFAULT_PORT` | `7879` |
| `SIDECAR_START_MAX_MS` | `1500` (Decision 5 switch rule) |
| `NF_INSTALLER_MAX_MB` | `40` |
| `NF_APP_OPEN_MAX_MS` | `2000` |
| `NF_IDLE_RAM_WINDOW_MAX_MB`, `NF_IDLE_RAM_SERVICE_MAX_MB` | `150`, `150` |
| `WEBVIEW_PROCESS_NAMES` | per OS, Decision 13 |

`desktop/src/config.ts`: `LOADING_SKELETON_DELAY_MS = 150`, `DAEMON_START_WAIT_MS = 5000`, `DAEMON_DOWN_AFTER_MS = 3000`.
No new `project.toml` keys.

---

## 11. Error handling

| Case | What we do |
|---|---|
| No systemd user session (container, WSL) or `launchctl` refuses | `install-service` fails with a clear message; the app keeps starting the sidecar itself (Decision 4 step 3) |
| Windows Run entry cannot be written | Clear message; background mode stays off; the app starts the service when it opens |
| Service cannot find `claude` / `codex` / `gemini` (Linux, macOS) | `doctor` and `errAgent` show it with "run `saarthi daemon install-service --refresh-env`" |
| Sidecar does not start (blocked by antivirus, missing library) | `errService` with the log tail and the manual command |
| Port 7878 busy | M1 behaviour (`saarthid` exits with "Port 7878 is in use..."); systemd / launchd stop retrying after their limit; `doctor` and `errService` show the message |
| UI / service API version mismatch | One automatic restart (Decision 8); then blocking `versionMismatch` |
| AppImage fails to start (no FUSE) | User guide: `sudo apt install libfuse2t64` |
| macOS "unidentified developer" / Windows SmartScreen | User guide steps (unsigned in v1, FSD open question 1) |
| bwrap blocked by AppArmor | Setup row `sandbox: fail` + guide section; Full access stays off (M8) |
| Shutdown takes longer than grace | systemd SIGKILL after `TimeoutStopSec`; launchd kill after `ExitTimeOut`; Windows: `daemon stop` ends the process after `SHUTDOWN_GRACE_SEC`. M8's `--die-with-parent` takes sandboxed agents down too on Linux; on start, flow 8.6 marks leftovers `interrupted` |
| `SAARTHI_FAKE_AGENTS` with the default data dir | Daemon refuses to start, exit 2 |
| E2E daemon does not become healthy in 15 s | Global setup fails with the daemon log tail |

---

## 12. Tests to write

| Test file | Proves |
|---|---|
| `daemon/tests/unit/service/test_backend_table.py` | `backend_for("linux"/"darwin"/"win32")` gives systemd / launchd / win_autostart; unknown OS -> none (spawn mode) |
| `daemon/tests/unit/service/test_unit_render.py` | Unit has `KillMode=mixed`, `ExecStart=<sidecar> serve`, `EnvironmentFile`, `TimeoutStopSec` from config |
| `daemon/tests/unit/service/test_plist_render.py` | Plist has `Label`, `ProgramArguments`, `RunAtLoad`, `KeepAlive`, `ExitTimeOut` from config, env from `daemon.env` |
| `daemon/tests/unit/service/test_win_autostart.py` | `winreg` mocked: install writes the Run value with the quoted sidecar path; uninstall removes it |
| `daemon/tests/unit/service/test_daemon_env.py` | Only `DAEMON_ENV_CAPTURE` names written; file mode 600; a fake `ANTHROPIC_API_KEY` in env is not written |
| `daemon/tests/unit/service/test_service_calls.py` | `install()` calls `daemon-reload` then `enable --now` (systemd), `bootstrap` (launchd), as list args (subprocess mocked) |
| `daemon/tests/integration/test_shutdown_signal.py` (marked `slow`, runs on all 3 runners) | Real `saarthid` in a subprocess (temp data dir) with a slow FakeAdapter run; SIGTERM (SIGBREAK on Windows) -> run `interrupted`, events on disk, exit < `SHUTDOWN_GRACE_SEC`; restart -> resume works |
| `daemon/tests/unit/core/test_health_tools.py` | Stub binaries on a temp `PATH`; missing tools have the right `hint` for the patched OS; required logic (git + one of three agents); first failing required tool is reported first |
| `daemon/tests/unit/cli/test_doctor.py` | Output and exit codes, with daemon up (TestClient) and down |
| `daemon/tests/unit/agents/test_fake_scenario.py` | (agent, mode, nth) -> fixture; patch applied; unknown step -> clear error |
| `daemon/tests/integration/test_fake_agents_guard.py` | Refused with default data dir; `/health.fake_agents` true when on |
| `daemon/tests/perf/test_board_load.py` (`-m perf`) | Seeded 500 tasks; Home "All projects" list for 200 tasks < 500 ms; 8 parallel fake runs finish without errors |
| `scripts/smoke_sidecar.py` (release workflow, 3 OSes) | The frozen sidecar starts, answers `/health` within `SIDECAR_START_MAX_MS`, stops cleanly |
| `desktop/src/lib/__tests__/shortcuts.test.ts` | No duplicate keys per scope; every Search-or-jump action with keys is in the sheet |
| `desktop/src/hooks/__tests__/useShortcuts.test.tsx` | Keys ignored in input / textarea / CodeMirror / xterm |
| `desktop/src/components/states/__tests__/*.test.tsx` | Delayed skeleton (none before 150 ms); ErrorBanner shows `hint`; `AgentError` shows the login command |
| `desktop/src/screens/Setup/__tests__/Setup.test.tsx` | All ok -> `setup2`; missing required tool -> `setup2x` with that tool only; warnings do not block; sets `first_run_done` |
| `desktop/e2e/daily-flow.spec.ts` | FSD 6.1 end to end (starts with `N`, not the global key); ends on Done, fake PR body contains the goal and the checks result |
| `desktop/e2e/parallel-flow.spec.ts` | FSD 6.2: two Working rows in two projects; the one that needs input moves to Needs you; count = 1 |
| `desktop/e2e/bugfix-flow.spec.ts` | FSD 6.3: note, saved instructions, Tests and checks shows the added test and green checks |
| `desktop/e2e/latency.spec.ts` | NF1b p95 < 300 ms |

Before "done": `uv run pytest`, `uv run ruff check .`, `uv run pyright`, `npm run lint`, `npm test`, `npm run e2e` with output shown (rule 9).

---

## 13. Manual verification

1. Clean machines (Ubuntu 24.04 GNOME VM, clean macOS user, Windows 11 VM): run FSD flow 6.1 with a timer. Note each time in the release checklist.
2. Reboot -> log in -> `saarthi daemon status` running (background mode on), app opens to Home.
3. Start a real Claude run, then restart the service (per OS) -> run `interrupted` -> Resume continues.
4. `scripts/measure_startup.py` on each OS -> median < 2 s.
5. Idle 10 min with `seed_scale.py` data -> `scripts/measure_idle_ram.py` -> window < 150 MB, service < 150 MB, on each OS.
6. New task from any app (global shortcut) on GNOME (Wayland and X11 if possible), macOS and Windows.
7. Notifications on each OS.
8. Every command in `docs/USER_GUIDE.md`.
9. The full release checklist (FSD section 9).

---

## 14. Risks

1. **The 40 MB installer target is tight.** Tauri adds ~10 MB; a frozen Python daemon with FastAPI, SQLAlchemy and Pydantic is often 25-35 MB compressed. CI checks every build. Ways out, in order: exclude unused modules in the spec, Nuitka, UPX off/on test.
2. **PyInstaller `--onefile` unpacks on each start** and can be slow. That hurts only a start that must also start the sidecar; the 2 s target is measured with the service running. `SIDECAR_START_MAX_MS` triggers the Nuitka switch.
3. **Antivirus false positives on Windows** for PyInstaller binaries are common. Smoke test on the Windows runner; user guide note; signing (Later) helps most.
4. **WebKit and Chromium in Playwright are not exactly the three webviews.** Some rendering bugs slip through. Manual checklist covers the Tauri window on each OS.
5. **Service environment differs from the shell** (`PATH`, `SSH_AUTH_SOCK`) on Linux and macOS. Decision 3 + `doctor` + `--refresh-env`. Ship push from the service is a manual check.
6. **Flaky e2e tests** from timing. Use Playwright auto-waits on visible text, never sleeps; fixture `delay_ms` is fixed; 3 green runs in a row required.
7. **Effort is 2.5 times the plan** (~25 h vs 10 h). Cut first: perf scripts as manual steps, AppImage (keep `.deb`), the Chromium e2e project on Linux (keep the Windows manual check).
8. **Dogfood slip.** A missing feature found in week 2 restarts the count. That is the point of the gate; plan the calendar for it.
9. **Unsigned installers** scare users (Gatekeeper, SmartScreen). Accepted for v1 (FSD open question 1).

---

## 15. What this milestone does not do

- No auto-update, apt repo, code signing or notarization, app stores, Flatpak/Snap.
- No Windows service (SCM); Windows uses an autostart entry.
- No Intel macOS build unless FSD open question 7 says so.
- No re-attach to running agents across service restarts (Decision 2).
- No new features, tables or events. Bugs found while dogfooding are fixed in the milestone that owns them.
- Nothing from "Later" (FSD section 8).

---

## 16. Effort breakdown

| Task | Hours |
|---|---|
| Background service backends (systemd, launchd, Windows autostart), install / uninstall, `daemon.env` | 3 |
| SIGTERM / SIGBREAK -> clean-stop path + test | 0.5 |
| Sidecar build (PyInstaller, Nuitka switch rule), bundle config (4 targets), icons, version check | 3.5 |
| `check_tools` (+ Gemini, per-OS hints) + `/health` + `doctor` | 1 |
| First-run setup (`setup1`, `setup2`, `setup2x`) + About | 1 |
| Shortcut registry + sheet + tests | 1 |
| State components + inventory pass | 2 |
| Platform layer + e2e harness + fake scenarios + fake `gh` | 2 |
| 3 flow specs + latency spec (2 engines) | 2.5 |
| NF gate scripts (startup, idle RAM, installer size, seed, telemetry, versions) | 2 |
| GitHub Actions release matrix + sidecar smoke test | 2 |
| `docs/USER_GUIDE.md` | 2 |
| Clean machine runs (3 OSes) + rc tag + release | 2.5 |
| **Total** | **25** |

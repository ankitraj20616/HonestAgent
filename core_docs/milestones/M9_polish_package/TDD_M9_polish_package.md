# TDD — M9: Polish + Package (v1.0)

**Document type:** Technical Design Document (TDD)
**Milestone:** M9 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-11
**Estimated effort:** 10 hours planned; breakdown in section 16 says ~19 h (+ 2 weeks calendar for dogfooding)
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. Every decision says *why*.
**Related documents:** `FSD_M9_polish_package.md`, `../../TDD-tech-design-doc.md` (8.6, 10, 12, 13, 14, 16 Q4-Q5), `../../TECH_STACK.md` (1, 2.3, 5), `../M8_safety_cost_rewind/TDD_M8_safety_cost_rewind.md`, `../M3_desktop_ui_v1/TDD_M3_desktop_ui_v1.md`

---

## 1. The goal in one sentence

Make Saarthi install in under 10 minutes on a clean Ubuntu 24.04 machine, start by itself at login, guide the first run, cover the 3 main flows with end-to-end tests, and ship `v1.0.0` only after a release gate that checks NF1-NF6.

---

## 2. Read this first — rules this work must not break

1. **All logic in the daemon** (CLAUDE.md rule 1). The wizard reads `/health`; it does not check tools itself. One exception, on purpose: `saarthi daemon install-service` and `saarthi doctor` must work when the daemon is *not* running, so they call shared Python functions directly (Decision 1, Decision 7). They do not duplicate logic.
2. **CLI first** (rule 2). `saarthi doctor` before the wizard; `saarthi daemon install-service` before any UI button. The shortcut sheet is UI-only by nature.
3. **No agent-specific code outside `agents/`** (rule 3). The e2e fake-agent scenario loader lives in `agents/`.
4. **Never call real agents in tests** (rule 8). Playwright drives a daemon whose adapters are all FakeAdapter.
5. **No hard-coded values** (rule 7). Ports, timeouts, tool list, fix hints, unit names in `config.py`; UI timings in `desktop/src/config.ts`.
6. **Do not build "Later" features** (rule 10). No auto-update, no apt repo, no sidecar unless its trigger fires.

---

## 3. What already exists (do not rebuild)

| Thing | Where | Built in |
|---|---|---|
| `saarthid` foreground entry point (lock, pid, migrations, uvicorn); `saarthi daemon start\|stop\|status` (spawns `saarthid`); `SAARTHI_DATA_DIR` / `SAARTHI_CONFIG_DIR` / `SAARTHI_PORT`; error shape `{error: {code, message, hint}}` | `daemon.py`, `cli/daemon.py`, `config.py` | M1 |
| `/health` (daemon, git, agents found + logged in, `gh`) | `api/health.py`, `core/health.py` | M1 / M3 |
| Run interrupt + resume on daemon restart (core TDD 8.6); clean `daemon stop` marks live runs `interrupted` | `core/runs.py` | M2 |
| Latency samples (p50/p95) in `stores/latency.ts`; `saarthi dev replay` | `desktop/src/stores/`, `cli/` | M3 |
| FakeAdapter replaying JSONL fixtures; spawn mode | `agents/fake.py` | M2 / M8 |
| Tauri shell: start / connect daemon, read token, notifications; Health page; Command Bar; global quick capture | `desktop/src-tauri/`, `desktop/src/` | M3 |
| All features of the 3 main flows | — | M3-M7 |
| Sandbox probe (`bwrap` works?) | `safety/sandbox.py::probe()` | M8 |

---

## 4. Technical decisions

### Decision 1 — systemd user unit runs M1's `saarthid` (new detail)
M1 already has the foreground entry point `saarthid` and says "M9 replaces the spawn with a systemd unit". The unit runs it directly (logs to journald and `daemon.log`). `daemon start` keeps M1's spawn mode for machines without systemd.
Unit template (package data `saarthi/service/saarthid.service.tmpl`):

```ini
[Unit]
Description=Saarthi daemon (saarthid)

[Service]
Type=simple
ExecStart=%h/.local/bin/saarthid
EnvironmentFile=-%h/.config/saarthi/daemon.env
Restart=on-failure
RestartSec=3
KillMode=mixed
TimeoutStopSec=20

[Install]
WantedBy=default.target
```

`saarthi daemon install-service` renders it to `~/.config/systemd/user/saarthid.service`, writes `daemon.env`, runs `systemctl --user daemon-reload` and `systemctl --user enable --now saarthid` (list args). After that, `daemon start|stop|status` call `systemctl --user start|stop|status saarthid` when the unit exists.
No sandboxing options (`ProtectHome=` etc.) in the unit: the daemon must start git, agents and `bwrap` exactly as the user would. Agent isolation is M8's job.

### Decision 2 — `KillMode=mixed`, not `process` (answers core TDD 16 Q5) (new)
`KillMode=process` would leave agents alive when the daemon restarts. But agents write their stream to a pipe the daemon owned. After a restart nobody reads that pipe: events and cost are lost (breaks rule 4 and NF3 "no data loss"), and the agent may block or die on a broken pipe while still spending tokens. Re-attaching would need agents to write to files and the daemon to tail them: a big M2 change, not polish.
So: `KillMode=mixed` sends SIGTERM to the daemon only. SIGTERM runs the same path as M2's clean `daemon stop`: stop each live run through its adapter, checkpoint, mark it `interrupted` (with `agent_session_id` kept), flush the Event Store, exit within `SHUTDOWN_GRACE_SEC = 10`. M9 only makes sure SIGTERM reaches that path. After `TimeoutStopSec`, systemd kills what is left. M8's `bwrap --die-with-parent` agrees with this. On start, flow 8.6 offers Resume.
M0's `spike_detach.py` tested file-based survival. If ADR-001 says it is simple and reliable, revisit after v1.

### Decision 3 — Capture `PATH` into `daemon.env` (new)
A systemd user service gets a short default `PATH`, without `~/.local/bin` or `~/.nvm/.../bin`, where `claude` and `codex` often live. `install-service` writes `~/.config/saarthi/daemon.env` (chmod 600) with only allow-listed variables from the current shell: `DAEMON_ENV_CAPTURE = ["PATH", "SSH_AUTH_SOCK", "EDITOR", "LANG", "DISPLAY", "WAYLAND_DISPLAY"]`. Never API keys. `SSH_AUTH_SOCK` lets the daemon's own `git push` at ship time (M5) work; M8 still hides it from agents. `DISPLAY` / `WAYLAND_DISPLAY` let M3's "open in my editor / terminal" work from the service (M3 flagged this); on a one-seat desktop they are stable.
It also stores the resolved absolute paths of `claude`, `codex`, `gh` into settings (`agents.claude_path`, F21.1) if they are empty. `saarthi daemon install-service --refresh-env` re-captures after installing a new tool.

### Decision 4 — How the desktop app finds the daemon (new detail)
`desktop/src-tauri/src/daemon.rs`, on launch:
1. `GET /health` with the token. OK -> go.
2. Else if `systemctl --user cat saarthid` succeeds -> `systemctl --user start saarthid`, poll health for `DAEMON_START_WAIT_MS = 5000`.
3. Else if `saarthi` is on `PATH` -> `saarthi daemon start` (M1 spawn), poll.
4. Else -> wizard step 1 shows the install command.
All via `std::process::Command` with list args. The "Start daemon" button on the daemon-down screen calls the same Tauri command.

### Decision 5 — Distribution: wheel + `uv tool install`; `install.sh` helper (new)
- `cd daemon && uv build` -> `saarthi-1.0.0-py3-none-any.whl`. Uploaded to the GitHub release.
- `scripts/install.sh` (short, `set -euo pipefail`): checks `git rg bwrap gh` and prints the one `apt` line if any is missing (does not run `sudo`); installs uv with the official installer if missing; `uv tool install --force <wheel url>` (or `gh release download` first if the repo is private — FSD open question 1); runs `saarthi daemon install-service`; prints "open Saarthi from the app menu".
- uv downloads Python 3.12 itself if the system Python is older. Ubuntu 24.04 ships 3.12 anyway.
- **PyInstaller sidecar trigger** (any one): `uv tool install` fails on the clean VM; the daemon part of the install takes > 4 min; or a user without uv must install it. Otherwise no sidecar.

### Decision 6 — Bundle config
`desktop/src-tauri/tauri.conf.json`: `bundle.targets = ["deb", "appimage"]`, product name `Saarthi`, identifier `dev.saarthi.app`, icons in `src-tauri/icons/`, category `Development`. `.deb` depends on what the Tauri bundler adds for WebKitGTK 4.1, plus `git`. `ripgrep`, `bubblewrap`, `gh` go in `recommends` if the Tauri deb config supports it; if not, the wizard covers them. Build on Ubuntu 24.04 (same glibc as the target). AppImage needs `libfuse2t64` on 24.04 (user guide).

### Decision 7 — `saarthi doctor` and `/health` share one check list
`core/health.py::check_tools()` returns `[ToolStatus(name, found, version, logged_in, ok, required, hint)]`. Tools and fix hints come from `config.TOOL_CHECKS`:

| Tool | Required | Check | `hint` |
|---|---|---|---|
| `git` | yes | `git --version` | `sudo apt install git` |
| `claude` | one of claude/codex | adapter `check_ready()` | `curl -fsSL https://claude.ai/install.sh \| bash` then `claude` to log in |
| `codex` | one of claude/codex | adapter `check_ready()` | `npm install -g @openai/codex` then `codex login` |
| `gh` | no | `gh auth status` | `sudo apt install gh && gh auth login` |
| `rg` | no | `rg --version` | `sudo apt install ripgrep` |
| `bwrap` | no (needed for `full`) | M8 `probe()` | `sudo apt install bubblewrap`; if userns blocked: USER_GUIDE "Sandbox on Ubuntu 24.04" |

Agent checks go through `AgentAdapter.check_ready()` (rule 3). `/health` returns the list plus `version`, `api_version`, `service` (`active`/`inactive`/`not_installed`), `fake_agents`. `saarthi doctor` calls `/health`; if the daemon is down it calls `check_tools()` locally and adds `daemon: fail`. Exit code 0 if all required are ok, else 1.

### Decision 8 — Version match between UI and daemon (new)
They install through two channels (`.deb` and `uv`), so they can drift. `config.API_VERSION` (int, bumped on breaking API change) and the package version are in `/health`. The UI is built with the same `API_VERSION` (generated into `desktop/src/api/version.ts` by `scripts/gen-types.sh`). Different `API_VERSION` -> blocking banner with `uv tool upgrade saarthi`. Same API, different package version -> small grey note in About.

### Decision 9 — One shortcut registry
`desktop/src/lib/shortcuts.ts` exports `SHORTCUTS: Shortcut[]` (`id`, `keys`, `label`, `scope`, `action id`). `useShortcuts()` binds them; `ShortcutSheet` and the Command Bar render from the same array. The hook ignores keys when focus is in `input`, `textarea`, `[contenteditable]`, CodeMirror or xterm. A Vitest test checks no two shortcuts in the same scope share keys.

### Decision 10 — Standard state components
`EmptyState`, `ErrorBanner`, `Skeleton`, `DaemonDown`, `VersionBanner`, and `useDelayedLoading(ms)` (`LOADING_SKELETON_DELAY_MS = 150` in `desktop/src/config.ts`). Errors show the daemon's `{error: {code, message, hint}}` body (M1 shape); M9 adds `hint` text where it is missing (tool not found, sandbox unavailable, port busy).

### Decision 11 — Playwright runs in WebKit against the web build, with a test daemon (new)
Playwright cannot drive the Tauri window directly. Core TDD 16 Q4 already names "UI in a normal browser" as plan B, so the React app works outside Tauri.
- `desktop/src/platform/index.ts`: `isTauri ? tauriImpl : webImpl` for notifications, folder picker, open-in-editor, start-daemon. Web versions are simple (folder path as a text input; notifications as toasts). If M3 already has this layer, reuse it.
- Playwright project: `webkit` (Playwright's Linux WebKit is the closest to WebKitGTK). Also `chromium` in CI as a second opinion, not a gate.
- `e2e/global-setup.ts` makes a temp data dir and a temp sample repo (from `e2e/fixtures/sample-repo/`, with a bare repo as `origin`), then starts `saarthid` with `SAARTHI_DATA_DIR=<tmp>`, `SAARTHI_CONFIG_DIR=<tmp>`, `SAARTHI_PORT=7879`, `SAARTHI_FAKE_AGENTS=<scenario.toml>` and `PATH=e2e/bin:$PATH` (a fake `gh` that writes the PR body to a file and prints a URL). Then `vite preview` with `VITE_DAEMON_URL` and the test token.

### Decision 12 — Fake agent scenarios for e2e (new)
`agents/fake_scenario.py` reads a TOML that maps each call to a fixture:
```toml
[[step]]   # first claude build run on any task
agent = "claude"; mode = "build"; nth = 1
fixture = "e2e/daily_build_needs_input.jsonl"
patch   = "e2e/daily_build.patch"     # applied with `git apply` in the worktree before run.finished
```
All adapter names (`claude`, `codex`) resolve to FakeAdapter with the matching step. `delay_ms` per line lets the parallel flow and latency test control timing.
Guard: `SAARTHI_FAKE_AGENTS` is refused unless `SAARTHI_DATA_DIR` is set and is not the default data dir. `/health.fake_agents = true` makes the UI show a red "TEST MODE" bar.

### Decision 13 — How NF1 is measured
- **App open < 2 s:** Tauri `main.rs` logs `startup_t0` (process start, monotonic ms). The React app calls `platform.markReady("board")` on the first board paint; Tauri logs `ready_ms`. `scripts/measure_startup.sh` starts the installed app 5 times (the first launch after login counts as cold), reads the log, prints the median.
- **Event -> UI < 300 ms:** M3 already records latency samples in `stores/latency.ts`. `e2e/latency.spec.ts` replays a fixture of 50 events at 100 ms spacing, then reads p95 from the Health page (or the store, exposed on `window` only when `VITE_E2E=1`). Assert p95 < `LATENCY_TARGET_MS` (300, M3 config).

### Decision 14 — Release via release candidates (new)
`v1.0.0-rc.1` starts the 2-week dogfood. Fixes ship as `rc.N`. `v1.0.0` is tagged on the commit of the last rc when the gate is green. Tags are pushed; nothing is pushed to `main` by Saarthi (rule 6 is about the app; the owner tags by hand).

---

## 5. Modules and files

### 5.1 Daemon
| File | Change |
|---|---|
| `daemon/src/saarthi/service/systemd.py` | **New.** `render_unit()`, `write_daemon_env()`, `install()`, `uninstall()`, `is_installed()`, `systemctl(*args)`. |
| `daemon/src/saarthi/service/saarthid.service.tmpl` | **New.** Unit template (Decision 1). |
| `daemon/src/saarthi/cli/daemon.py` | `install-service [--refresh-env]`, `uninstall-service`; `start/stop/status` delegate to systemd when installed. |
| `daemon/src/saarthi/cli/doctor.py` | **New.** `saarthi doctor [--json]`. |
| `daemon/src/saarthi/cli/main.py` | `--version`. |
| `daemon/src/saarthi/core/health.py`, `api/health.py` | Tool list from `TOOL_CHECKS`, `hint`, `version`, `api_version`, `service`, `fake_agents`. |
| `daemon/src/saarthi/daemon.py` | SIGTERM handler calls M2's clean-stop path (Decision 2). |
| `daemon/src/saarthi/agents/fake_scenario.py` | **New.** Scenario loader (Decision 12). |
| `daemon/src/saarthi/config.py` | Section 10. |
| `daemon/pyproject.toml` | Version `1.0.0`; package data for the unit template (entry points `saarthi`, `saarthid` exist since M1). |

### 5.2 Desktop
| File | Change |
|---|---|
| `desktop/src-tauri/src/daemon.rs` | Decision 4. `startup_t0` / `ready_ms` logging. |
| `desktop/src-tauri/tauri.conf.json`, `Cargo.toml`, `icons/` | Bundle config, version. |
| `desktop/src/platform/index.ts` (+ `tauri.ts`, `web.ts`) | Decision 11. |
| `desktop/src/screens/FirstRun/FirstRunWizard.tsx`, `StepDaemon.tsx`, `StepTools.tsx`, `StepProject.tsx` | **New.** Wizard. |
| `desktop/src/lib/shortcuts.ts`, `hooks/useShortcuts.ts`, `components/ShortcutSheet.tsx` | **New.** Decision 9. |
| `desktop/src/components/states/*.tsx`, `hooks/useDelayedLoading.ts` | **New.** Decision 10. |
| `desktop/src/config.ts` | UI timings. |
| `desktop/src/api/version.ts` | Generated `API_VERSION`. |

### 5.3 Empty / error / loading inventory
| Screen / panel | Empty | Error | Loading |
|---|---|---|---|
| Command Deck | "Add your first project" -> wizard step 3 | DaemonDown | skeleton cards |
| Board | "No tasks. Press N" | banner + retry | skeleton columns |
| Task Room: Runs, Stream | "No runs yet. Press R" | toast | skeleton rows |
| Proof / Review | "Checks run after a build run" / "Review appears when the task reaches Review" | banner | skeleton |
| Checkpoints (M8) | "Checkpoints are made at the end of each run" | toast | skeleton |
| Research, Memory, Playbooks | one line + main button each | banner | skeleton |
| Code Peek search | "No matches" | "ripgrep not found" + fix | spinner in box |
| Global | — | WebSocket reconnecting bar; VersionBanner; TEST MODE bar | — |

### 5.4 Tests, scripts, docs
| Path | What |
|---|---|
| `desktop/e2e/playwright.config.ts`, `global-setup.ts`, `global-teardown.ts` | Harness. |
| `desktop/e2e/daily-flow.spec.ts`, `parallel-flow.spec.ts`, `bugfix-flow.spec.ts`, `latency.spec.ts` | The flows + NF1b. |
| `desktop/e2e/scenarios/*.toml`, `daemon/tests/fixtures/agents/e2e/*.jsonl` + `.patch` | Fake agent data. |
| `desktop/e2e/fixtures/sample-repo/` | Tiny Python repo; checks: `python3 -m unittest` (no uv needed in e2e). |
| `desktop/e2e/bin/gh` | Fake `gh`. |
| `scripts/install.sh`, `check_versions.sh`, `measure_startup.sh`, `seed_scale.py`, `check_no_telemetry.sh` | Install and gate helpers. |
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
| GET | `/health` | Adds `version`, `api_version`, `service`, `fake_agents`, and `tools: [{name, found, version, logged_in, ok, required, hint}]` |

No new endpoints. The wizard uses `/health`, `POST /projects` (M1) and `PUT /settings` (M3).

### 8.2 CLI
| Command | Options | Output |
|---|---|---|
| `saarthi daemon install-service` | `--refresh-env` | Paths written, service status |
| `saarthi daemon uninstall-service` | — | "Removed. Data kept in ~/.local/share/saarthi" |
| `saarthi daemon start\|stop\|status` | — | Unchanged output; uses systemd if installed |
| `saarthi doctor` | `--json` | Table as in FSD 5.3; exit 1 if a required tool fails |
| `saarthi --version` | — | `saarthi 1.0.0 (api 1)` |

`saarthid` (M1) is unchanged; systemd and the e2e harness run it directly.

---

## 9. Key flows

### 9.1 Install
`install.sh` -> `uv tool install` -> `saarthi daemon install-service` -> unit + env written -> `systemctl --user enable --now saarthid` -> health OK -> user opens the app -> Decision 4 step 1 OK -> no projects -> wizard.

### 9.2 Daemon stop with active runs
`systemctl --user stop saarthid` -> SIGTERM -> `shutdown()`: refuse new runs; for each active run `adapter.stop()` -> status `interrupted`, `run.interrupted` event -> task `Failed` "interrupted" (8.6) -> flush -> exit 0. Start later -> UI shows Resume.

### 9.3 E2E run
`npm run e2e` -> global setup (temp dirs, sample repo, bare origin, test daemon on 7879 with scenario, `vite preview`) -> specs in WebKit -> teardown kills daemon and removes temp dirs.

---

## 10. Config added

`config.py`:

| Constant | Default |
|---|---|
| `SERVICE_NAME` | `"saarthid"` |
| `SYSTEMD_USER_DIR` | `~/.config/systemd/user` |
| `DAEMON_ENV_FILE` | `~/.config/saarthi/daemon.env` |
| `DAEMON_ENV_CAPTURE` | `["PATH", "SSH_AUTH_SOCK", "EDITOR", "LANG"]` |
| `SERVICE_STOP_TIMEOUT_SEC` | `20` (goes into the unit) |
| `SHUTDOWN_GRACE_SEC` | `10` |
| `TOOL_CHECKS` | Decision 7 table |
| `API_VERSION` | `1` |
| `FAKE_AGENTS_ENV` | `"SAARTHI_FAKE_AGENTS"` |
| `E2E_DEFAULT_PORT` | `7879` |

`desktop/src/config.ts`: `LOADING_SKELETON_DELAY_MS = 150`, `DAEMON_START_WAIT_MS = 5000`, `DAEMON_DOWN_AFTER_MS = 3000`.
No new `project.toml` keys.

---

## 11. Error handling

| Case | What we do |
|---|---|
| No systemd user session (container, WSL) | `install-service` fails with a clear message; `daemon start` keeps background mode |
| Daemon cannot find `claude` / `codex` under systemd | `doctor` shows it with "run `saarthi daemon install-service --refresh-env`" |
| Port 7878 busy | M1 behaviour (`saarthid` exits with "Port 7878 is in use..."); systemd stops retrying after the start limit; `doctor` shows the message |
| UI / daemon API version mismatch | Blocking VersionBanner with the upgrade command |
| AppImage fails to start (no FUSE) | User guide: `sudo apt install libfuse2t64` |
| bwrap blocked by AppArmor | Wizard row `bwrap: fail` + guide section; `full` profile stays off (M8) |
| Shutdown takes longer than grace | systemd SIGKILL after `TimeoutStopSec` (M8's `--die-with-parent` takes sandboxed agents down too); on start, flow 8.6 marks leftovers `interrupted` |
| `SAARTHI_FAKE_AGENTS` with the default data dir | Daemon refuses to start, exit 2 |
| E2E daemon does not become healthy in 15 s | Global setup fails with the daemon log tail |

---

## 12. Tests to write

| Test file | Proves |
|---|---|
| `daemon/tests/unit/service/test_unit_render.py` | Unit has `KillMode=mixed`, `ExecStart=%h/.local/bin/saarthid`, `EnvironmentFile`, `TimeoutStopSec` from config |
| `daemon/tests/unit/service/test_daemon_env.py` | Only `DAEMON_ENV_CAPTURE` names written; file mode 600; a fake `ANTHROPIC_API_KEY` in env is not written |
| `daemon/tests/unit/service/test_systemctl_calls.py` | `install()` calls `daemon-reload` then `enable --now`, as list args (subprocess mocked) |
| `daemon/tests/integration/test_sigterm_shutdown.py` (marked `slow`) | Real `saarthid` in a subprocess (temp data dir) with a slow FakeAdapter run; SIGTERM -> run `interrupted`, events on disk, exit < `SHUTDOWN_GRACE_SEC`; restart -> resume works |
| `daemon/tests/unit/core/test_health_tools.py` | Stub binaries on a temp `PATH`; missing tools have the right `fix`; required logic (git + one agent) |
| `daemon/tests/unit/cli/test_doctor.py` | Output and exit codes, with daemon up (TestClient) and down |
| `daemon/tests/unit/agents/test_fake_scenario.py` | (agent, mode, nth) -> fixture; patch applied; unknown step -> clear error |
| `daemon/tests/integration/test_fake_agents_guard.py` | Refused with default data dir; `/health.fake_agents` true when on |
| `daemon/tests/perf/test_board_load.py` (`-m perf`) | Seeded 500 tasks; `GET /projects/{id}/tasks` for 200 tasks < 500 ms; 8 parallel fake runs finish without errors |
| `desktop/src/lib/__tests__/shortcuts.test.ts` | No duplicate keys per scope; every Command Bar action with keys is in the sheet |
| `desktop/src/hooks/__tests__/useShortcuts.test.tsx` | Keys ignored in input / textarea / CodeMirror / xterm |
| `desktop/src/components/states/__tests__/*.test.tsx` | Delayed skeleton (none before 150 ms); ErrorBanner shows `fix` |
| `desktop/src/screens/FirstRun/__tests__/FirstRunWizard.test.tsx` | Blocks on missing required tool; continues with warnings; sets `first_run_done` |
| `desktop/e2e/daily-flow.spec.ts` | FSD 6.1 end to end (starts with `N`, not the global quick-capture key); ends with task `Shipped`, fake PR body contains brief + Proof Card |
| `desktop/e2e/parallel-flow.spec.ts` | FSD 6.2: two Running cards, needs-input card glows and is first |
| `desktop/e2e/bugfix-flow.spec.ts` | FSD 6.3: snippet, playbook, Proof Card shows the added test and green checks |
| `desktop/e2e/latency.spec.ts` | NF1b p95 < 300 ms |

Before "done": `uv run pytest`, `uv run ruff check .`, `uv run pyright`, `npm run lint`, `npm test`, `npm run e2e` with output shown (rule 9).

---

## 13. Manual verification

1. Clean Ubuntu 24.04 VM (GNOME, fresh snapshot): run FSD flow 6.1 with a timer. Note the time in the release checklist.
2. Reboot the VM -> log in -> `saarthi daemon status` active, app opens to the board.
3. Start a real Claude run, then `systemctl --user restart saarthid` -> run `interrupted` -> Resume continues.
4. `scripts/measure_startup.sh` on the VM -> median < 2 s.
5. Idle 10 min with `seed_scale.py` data -> `MemoryCurrent` < 200 MB.
6. Global quick capture shortcut on GNOME (Wayland and X11 if possible).
7. Every command in `docs/USER_GUIDE.md`.
8. The full release checklist (FSD section 9).

---

## 14. Risks

1. **WebKit in Playwright is not exactly Tauri's WebKitGTK.** Some rendering bugs slip through. Manual checklist covers the Tauri window.
2. **systemd environment differs from the shell** (`PATH`, `SSH_AUTH_SOCK`). Decision 3 + `doctor` + `--refresh-env`. Ship push from the daemon is a manual check.
3. **Flaky e2e tests** from timing. Use Playwright auto-waits on visible text, never sleeps; fixture `delay_ms` is fixed; 3 green runs in a row required.
4. **Effort is double the plan** (~19 h vs 10 h). Cut first: chromium e2e project, perf scripts as manual steps, AppImage (keep `.deb`).
5. **Dogfood slip.** A missing feature found in week 2 restarts the count. That is the point of the gate; plan the calendar for it.
6. **uv tool install needs network** to fetch dependencies from PyPI. Fine for the VM test; offline install is out of scope.

---

## 15. What this milestone does not do

- No PyInstaller sidecar unless a trigger in Decision 5 fires.
- No auto-update, apt repo, package signing, Flatpak/Snap, other distros (NF6: Ubuntu 24.04+ first).
- No re-attach to running agents across daemon restarts (Decision 2).
- No new features, tables or events. Bugs found while dogfooding are fixed in the milestone that owns them.
- Nothing from "Later" (FSD section 8).

---

## 16. Effort breakdown

| Task | Hours |
|---|---|
| systemd unit, install / uninstall, `daemon.env` | 1.5 |
| SIGTERM -> clean-stop path + test | 0.5 |
| Bundle config, icons, wheel build, `install.sh`, version check | 2.5 |
| `check_tools` + `/health` + `doctor` | 1 |
| First-run wizard | 1 |
| Shortcut registry + sheet + tests | 1 |
| State components + inventory pass | 2 |
| Platform layer + e2e harness + fake scenarios + fake `gh` | 2 |
| 3 flow specs + latency spec | 2.5 |
| NF gate scripts (startup, seed, telemetry, versions) | 1.5 |
| `docs/USER_GUIDE.md` | 2 |
| Clean VM run + rc tag + release | 1.5 |
| **Total** | **19** |

# TDD — M12: Live preview

**Document type:** Technical Design Document (TDD)
**Milestone:** M12 of M0-M12 (built after M11; see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-23
**Updated:** 2026-10-23 - first version, from the Simple UI spec P7 and section 11 (B10)
**Estimated effort:** 15.5 hours (about 1.5 rough weeks at ~10 h/week), including a ~3 h go/no-go spike. About 12.5 h if F25.3 is no-go on every OS.
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. Every decision says *why*.
**Related documents:** `FSD_M12_live_preview.md`, `../../design/2026-10-23-simple-ui-design.md` (P7, section 11, B10), `../../TDD-tech-design-doc.md` (3.2, 4.15, 4.16, 9.2, 15), `../../decisions/ADR-003-browser-testing.md`, `../M11_browser_testing/TDD_M11_browser_testing.md` (browser host, CDP client, dev server), `../M3_desktop_ui_v1/TDD_M3_desktop_ui_v1.md` (Tauri shell, WebSocket client)
**Screens:** prototype views `livePreview`, `liveTest` in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. The goal in one sentence

Stream the agent's Chromium into the task page over CDP, open the task's app in a Tauri preview window that has no IPC, and — only on the OSes where the spike passes — let the agent drive that window. F-numbers: F25.1-F25.3 (FSD section 1).

## 2. Read this first — rules this work must not break

1. **All logic lives in the daemon** (rule 1). The daemon owns the screencast, the dev server and the driver choice. The desktop only shows frames and opens a window the daemon tells it to.
2. **CLI first** (rule 2). `saarthi preview open|close|agent` and `saarthi browser watch` exist before the screens. (Frames themselves are UI only.)
3. **Agents only through `AgentAdapter`** (rule 3). Driving the preview window reuses M11's MCP endpoint; adapters do not change.
4. **Every action is an event** (rule 4). `preview.*` events. Frames are a stream, not events (like `terminal.output`).
5. **No hard-coded values** (rule 7). Section 6.
6. **Tests never start a real browser or agent** (rule 8). Fake CDP socket, fake driver.
7. **No Later features** (rule 10): no macOS driver, no clicking inside the live picture.

## 3. What already exists (do not rebuild)

| Thing | Built in | What M12 does with it |
|---|---|---|
| Browser host, launch mode, temp profile | M11 (Decision 4, spike S5) | Screencast attaches to its CDP target. |
| `browser/cdp.py` | M11 | Screencast commands. |
| Dev server per task | M11 | Started by "Open preview". |
| MCP endpoint, host guard, steps, evidence | M11 | Reused when the agent drives the preview window. |
| WebSocket topics + reconnect | M1 / M3 | New topic `screencast:<task_id>`. |
| Tauri shell, capabilities for the main window | M3 / M9 | One more window, with no capability. |

## 4. Technical decisions

### Decision 1 — Go / no-go spike first (new)
About 3 h, before any F25.3 code. One small script per OS; results and the final table into `../../decisions/ADR-003-browser-testing.md` and `PREVIEW_DRIVE_BY_OS` in `config.py`.

| # | OS | What to try | Go criteria (all must pass) |
|---|---|---|---|
| P1 | Linux | Install `webkit2gtk-driver` (system package). Start the Saarthi app in a **preview-only mode** (`--preview <url>`: no daemon token, no IPC, one window) under WebKitWebDriver. Drive it with a WebDriver-based MCP tool set (`browser/preview_driver.py`). | Open, click, type, screenshot work; the main Saarthi window and the daemon token are not reachable; the preview has no IPC; works on Ubuntu 24.04 CI; installer size unchanged. |
| P2 | Windows | Give the preview window its **own** WebView2 environment (own data folder + `--remote-debugging-port=<free port>` bound to `127.0.0.1`). Attach M11's Playwright MCP with `--cdp-endpoint`. | Same as P1; the main window's WebView2 opens no debugging port (checked by scanning its process args and ports). |
| P3 | macOS | Confirm there is still no WKWebView driver (`safaridriver` drives Safari only). | Always no-go unless a driver exists. |

Result: `PREVIEW_DRIVE_BY_OS = {"linux": "webkitwebdriver" | None, "win32": "webview2_cdp" | None, "darwin": None}`.
**Why:** this is the riskiest part, and the one that could open Saarthi's own window to a driver. Deciding first keeps M12 from building something we must turn off.

### Decision 2 — Screencast over CDP, only while someone watches (F25.1)
- `browser/screencast.py`: on the first subscriber of `screencast:<task_id>`, find the page target of the active browser session (M11 host) and send `Page.startScreencast {format: "jpeg", quality: SCREENCAST_QUALITY, maxWidth: SCREENCAST_MAX_WIDTH, maxHeight: SCREENCAST_MAX_HEIGHT, everyNthFrame: 1}`.
- Each `Page.screencastFrame {data, metadata, sessionId}`: ack with `Page.screencastFrameAck {sessionId}` at once; forward to subscribers as `{frame: <base64 jpeg>, ts}` only if at least `1 / SCREENCAST_MAX_FPS` s passed since the last sent frame (drop the rest).
- Last subscriber gone, or `browser.finished` -> `Page.stopScreencast`.
- Frames are never saved to SQLite or JSONL.
- If M11 spike S5 chose "MCP launches the browser" (no CDP handle), the fallback is: forward each `browser.screenshot` as a frame (low frame rate). The M12 spike re-checks attach mode first.
**Why:** CDP screencast is built into Chromium on every OS, so F25.1 works everywhere. Acking at once and dropping frames keeps Chromium from slowing down. Streaming only on demand keeps idle work at zero (NF5).

### Decision 3 — The preview window has no IPC (F25.2)
- Rust side (`src-tauri`): `WebviewWindowBuilder::new(app, "preview-<task_id>", WebviewUrl::External(url))`.
- Capabilities: every capability file lists `windows: ["main"]` only. No capability uses a wildcard that matches `preview-*`. No `remote.urls` entry. So `invoke` from the preview has no allowed command.
- No init scripts, no `withGlobalTauri` effect on external URLs.
- `on_navigation`: allow only URLs whose host is the `base_url` host or in `allowed_hosts` (+ task OKs); anything else -> open in the system browser through the opener, and cancel.
- A CI test (`desktop/src-tauri/tests/preview_no_ipc.rs` or a WebDriver-free unit test of the capability set) loads a local page that calls `window.__TAURI_INTERNALS__?.invoke(...)` and asserts it fails.
**Why:** the preview loads untrusted app code (written by the agent). It must not reach Saarthi commands, the daemon token or the file system.

### Decision 4 — The daemon decides the URL and the dev server
`GET /tasks/{id}/preview` -> `{url, devserver: {state, port}, drive_supported}`. `POST` starts the dev server (M11) if needed and returns the URL; the desktop opens the window. `DELETE` (or the window's close event, sent by the desktop) -> stop the dev server unless a check batch holds it. Events `preview.opened {url}`, `preview.closed`.
**Why:** rule 1. The desktop never reads `project.toml` or picks a port.

### Decision 5 — Agent drives the preview window: one more host kind, same endpoint (F25.3)
- M11's browser host gets a kind: `chromium` (default) or `preview`. With `preview`, the MCP endpoint forwards to:
  - Windows: Playwright MCP attached to the preview window's CDP port (`--cdp-endpoint`). Same tools as M11.
  - Linux: `browser/preview_driver.py`, a small set of MCP tools (navigate, click, type, snapshot, screenshot) over WebDriver to WebKitWebDriver.
- The host guard, deny list, step limit, screenshots and evidence are the M11 code, unchanged.
- `POST /tasks/{id}/preview/agent` sets "next Live test uses the preview window" for this task. 409 `preview_drive_unsupported` when `PREVIEW_DRIVE_BY_OS[os]` is `None`. Event `preview.agent_attached {driver}`.
- Saved login: loaded into the preview window only for that Live test (Windows: CDP cookies + local storage; Linux: WebDriver cookies), cleared after.
- Video and trace: only where the driver gives them (Windows via Playwright). Else evidence = screenshots + steps, with a note.
**Why:** one endpoint keeps every M11 safety rule in one place. The agent and its adapter see no difference.

### Decision 6 — The main window is never driven
- Windows: the preview window uses its own WebView2 data folder and args. The main window's environment never gets `--remote-debugging-port`. A startup check refuses to start the main window if `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` contains a debugging switch.
- Linux: the driver drives a separate preview-only process (`--preview`), which has no daemon token and no IPC, never the main app process.
**Why:** a debugging port on the main window would let any local program call Saarthi's commands.

## 5. Modules and files

### Daemon (`daemon/src/saarthi/`)

| File | New / changed | What |
|---|---|---|
| `browser/screencast.py` | new | Decision 2. |
| `browser/preview.py` | new | Preview URL, dev server hold / release, `preview.*` events (Decision 4). |
| `browser/preview_driver.py` | new (only if P1 is go) | WebDriver MCP tools for WebKitWebDriver. |
| `browser/host.py` | changed (M11) | Host kind `preview` (Decision 5). |
| `api/preview.py`, `api/ws.py` | new / changed | Section 9; topic `screencast:<task_id>`. |
| `cli/preview.py`, `cli/browser.py` | new / changed | `preview open|close|agent`, `browser watch`. |
| `config.py` | changed | Section 6. |

### Desktop

| File | What |
|---|---|
| `src-tauri/src/preview.rs` | Build the preview window, navigation guard, close event; Windows: own WebView2 environment and debugging port (only if P2 is go); Linux: `--preview` mode (only if P1 is go). |
| `src-tauri/capabilities/*.json` | `windows: ["main"]` only (checked by a test). |
| `src/components/task/LiveBrowser.tsx` | `liveTest`: subscribes to `screencast:<task_id>`, draws frames on a canvas, "Live · N fps" badge. |
| `src/screens/Preview/PreviewBar.tsx` | `livePreview`: Open preview, close, "Let the agent use this window" (only if `drive_supported`). |

## 6. Config added

| Constant | Value |
|---|---|
| `SCREENCAST_MAX_FPS` | `5` |
| `SCREENCAST_QUALITY` | `60` |
| `SCREENCAST_MAX_WIDTH`, `SCREENCAST_MAX_HEIGHT` | `1280`, `800` |
| `PREVIEW_WINDOW_LABEL_PREFIX` | `"preview-"` |
| `PREVIEW_DRIVE_BY_OS` | from the spike, default `{"linux": None, "win32": None, "darwin": None}` until it passes |
| `PREVIEW_DEBUG_PORT_RANGE` | Windows only, inside the task's M7 port block (`SAARTHI_PORT + 9`) |
| `WEBKIT_WEBDRIVER_BIN` | `"WebKitWebDriver"` (Linux) |

No new `project.toml` keys.

## 7. Data model changes

None. The "next Live test uses the preview window" flag lives in memory for the open preview (it ends when the window closes).

## 8. Events added

| Type | When | Payload |
|---|---|---|
| `preview.opened` | Window opened | `{url, port}` |
| `preview.closed` | Window closed | `{reason: "user"\|"task_shipped"\|"error"}` |
| `preview.agent_attached` | Next Live test uses the preview | `{driver: "webkitwebdriver"\|"webview2_cdp"}` |

Screencast frames are not events. Reused: all M11 `browser.*` events.

## 9. API and CLI added

### 9.1 REST and WebSocket (under `/api/v1`)

| Method | Path | Response | Errors |
|---|---|---|---|
| GET | `/tasks/{id}/preview` | `{url, devserver, open, drive_supported}` | 409 `browser_off` |
| POST | `/tasks/{id}/preview` | `{url}` (dev server started if needed) | 502 `devserver_failed` |
| DELETE | `/tasks/{id}/preview` | `204` | - |
| POST | `/tasks/{id}/preview/agent` | `{driver}` | 409 `preview_drive_unsupported`, 409 `preview_not_open` |
| WS | topic `screencast:<task_id>` | frames `{frame, ts}` | no active Live test -> one `{idle: true}` message |

`GET /browser` (M11) gains `preview_drive: {supported: bool, driver?}` for this machine.

### 9.2 CLI

| Command | Output |
|---|---|
| `saarthi preview open <task>` | `Dev server: ... Preview window opened.` (asks the running desktop app to open it; without the app: prints the URL) |
| `saarthi preview close <task>` | `Closed. Dev server stopped.` |
| `saarthi preview agent <task>` | `Next Live test uses the preview window.` or `Not supported on this OS.` (exit 1) |
| `saarthi browser watch <task>` | Steps as they happen (frames are UI only) |

## 10. Key flows

### 10.1 Watch
1. Desktop opens the task page -> subscribes to `screencast:T-0042`.
2. Daemon: Live test active? Start the screencast on its page target. Else send `{idle: true}`.
3. Frames forwarded, capped. Unsubscribe or `browser.finished` -> stop.

### 10.2 Open preview
1. `POST /tasks/T-0042/preview` -> dev server (M11) -> `{url}` -> `preview.opened`.
2. Desktop builds `preview-T-0042` with no capability; navigation guard on.
3. Close -> `DELETE` -> dev server released -> `preview.closed`.

### 10.3 Agent in the preview (only where go)
1. `POST /tasks/T-0042/preview/agent` -> `preview.agent_attached`.
2. Next check batch: M11 Decision 7 runs the Live test with host kind `preview`; everything else as M11.

## 11. Go / no-go table (fill after the spike)

| OS | Driver | P-criteria passed | Result | Date |
|---|---|---|---|---|
| Linux | WebKitWebDriver | - | pending | - |
| Windows | WebView2 CDP | - | pending | - |
| macOS | none | - | **no-go** | 2026-10-23 |

## 12. Error handling

| Case | What we do |
|---|---|
| No active Live test when watching | `{idle: true}`; the panel says "The live browser shows during a Live test". |
| CDP target gone mid-stream | Stop the screencast; panel shows the last frame and "Ended". |
| Dev server fails on Open preview | 502 `devserver_failed` + output lines; no window opens. |
| Navigation to another host in the preview | Cancelled; opened in the system browser. |
| Driver fails mid Live test | Live test `error`; the preview flag is cleared; next run uses Chromium. |
| `preview/agent` on a no-go OS | 409 `preview_drive_unsupported`. |
| Debugging switch found in the main window's env (Windows) | Main window refuses to start with a clear message. |

## 13. Security

- The preview window has no IPC, no capabilities, no init scripts (Decision 3). Tested.
- The main window is never driven (Decision 6).
- Debugging ports bind to `127.0.0.1` only, inside the task's port block, and close with the window.
- The agent still talks only to the M11 MCP endpoint with its session id. Allowed hosts, deny list, step limit, typed-text rule and login secrecy are unchanged.
- Frames are not saved. They may show test data, like the M11 screenshots.

## 14. Tests to write

| Test file | Proves |
|---|---|
| `tests/unit/browser/test_screencast.py` | Fake CDP socket: start on first subscriber, ack every frame, fps cap drops extra frames, stop on last unsubscribe and on `browser.finished`, nothing written to the event store. |
| `tests/unit/browser/test_preview.py` | URL from the dev server; hold / release so a running check batch keeps the server; events. |
| `tests/unit/browser/test_preview_drive.py` | `PREVIEW_DRIVE_BY_OS` -> supported / 409 per OS (pure function); host kind `preview` uses the same guard and step limit (with a fake driver). |
| `tests/unit/browser/test_preview_driver_webdriver.py` (if P1 go) | Recorded WebDriver JSON fixtures -> MCP tool results. |
| `desktop/src-tauri/tests/preview_no_ipc.rs` | Capability set has no entry for `preview-*`; no `remote.urls`; an `invoke` from the preview fails. |
| `desktop/src/components/task/LiveBrowser.test.tsx` | Draws frames, shows idle and ended states. |
| `tests/integration/test_real_browser.py` (marker `real_browser`) | One real headless Chromium screencast frame in CI (optional). |

## 15. How to test by hand

1. Run the FSD QA checklist (section 9) on Linux, macOS and Windows.
2. For P1 / P2, run the spike scripts and keep them in `scripts/spikes/m12_preview_drive_<os>.py`.
3. Windows: check with `netstat` that only the preview's debugging port is open while the preview is open, and none after.

## 16. Risks

| Risk | Mitigation |
|---|---|
| A debugging port exposes Saarthi's own window | Separate WebView2 environment, startup check, spike criterion (Decision 6). |
| WebKitWebDriver needs a whole app process | Preview-only mode with no token and no IPC; else no-go on Linux. |
| Screencast slows the Live test | Ack at once, drop frames, cap fps, stream only on demand. |
| Preview looks different from the Chromium Live test | Said in the UI; the Live test result always comes from Chromium. |
| M11 chose "MCP launches the browser" (no CDP) | Fallback to step screenshots as frames; spike re-checks attach mode. |

## 17. Effort breakdown

| Task | Hours |
|---|---|
| Go / no-go spike P1-P3 + ADR-003 table | 3 |
| Screencast (CDP, ack, fps cap, WS topic, on-demand) + tests | 3 |
| Live browser panel in `liveTest` | 1.5 |
| Preview window: no capability, navigation guard, dev server hold, API, CLI | 2.5 |
| No-IPC tests (Rust + UI) | 1 |
| Agent drives the preview, where go (host kind, Windows CDP attach, Linux WebDriver tools) | 3 |
| `livePreview` UI with "Let the agent use this window" | 1 |
| Manual verification on 3 OSes | 0.5 |
| **Total** | **15.5** |

If both Linux and Windows are no-go: minus the 3 h for driving the preview (about 12.5 h).

## 18. What this milestone does not do

A macOS driver; clicking inside the live picture; saving the screencast; dev tools in the preview; a bundled browser; any change to M11's safety rules.

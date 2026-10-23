# FSD — M12: Live preview

**Document type:** Functional Specification Document (FSD)
**Milestone:** M12 of M0-M12 (built after M11; see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-23
**Updated:** 2026-10-23 - first version, from the Simple UI spec P7 and section 11 (B10)
**Estimated effort:** 15.5 hours (about 1.5 rough weeks at ~10 h/week). Starts with a ~3 h go/no-go spike.
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M12_live_preview.md`, `../../design/2026-10-23-simple-ui-design.md` (P7, section 11, B10), `../../FUNCTIONAL_SPECIFICATIONS.md` (F25), `../../TDD-tech-design-doc.md` (4.16), `../../decisions/ADR-003-browser-testing.md`, `../M11_browser_testing/FSD_M11_browser_testing.md` (before), `../M3_desktop_ui_v1/FSD_M3_desktop_ui_v1.md` (task page)
**Screens:** prototype views `livePreview`, `liveTest` in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. What this document covers

M12 lets me **watch** the agent test my app, and **use** the task's running app, inside Saarthi.

It covers these F-numbers:

- **F25.1** Live browser: a live picture (screencast) of the agent's Chromium inside the task page. All OSes.
- **F25.2** Preview window: a separate Saarthi window on the task's dev server URL, with no access to Saarthi's commands.
- **F25.3** Agent drives the preview window: **spike-gated**. Linux via WebKitWebDriver, Windows via WebView2 remote debugging. Not on macOS.

M12 **starts with a spike**. The spike decides, per OS, if F25.3 is built at all (section 5.4).

## 2. The goal in plain words

In M11 I see the proof after the Live test ends. I cannot watch it, and I cannot quickly try the app myself.

At the end of M12:

1. While a Live test runs, the task page shows the agent's browser live. I see it click.
2. I click **Open preview** and a Saarthi window opens on the task's running app. I click around myself.
3. On Linux and Windows (if the spike passed), I can click **Let the agent use this window**, and the agent tests in that window while I watch.

## 3. Where this milestone sits

- **Needs (already built):**
  - M11: browser finder, browser host, dev server per task, Live test, `browser.*` events.
  - M3: the task page, the Tauri shell, the WebSocket client.
- **M12 adds:** the screencast stream, the preview window, and (where the spike passed) a driver for it.
- **Unlocks next:** nothing depends on M12.

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Screencast** | A stream of small pictures of a browser page, many per second. It looks like a video. |
| **CDP** | Chrome DevTools Protocol. The way a program talks to Chromium (and to Edge's WebView2). |
| **Preview window** | A second Saarthi window that shows the task's app, not Saarthi. |
| **IPC** | The way a Saarthi window calls Saarthi's own commands. The preview window has none. |
| **WebKitWebDriver** | The tool that lets a program drive a WebKitGTK window on Linux. |
| **WebView2 remote debugging** | A switch that lets a program drive a WebView2 window on Windows over CDP. |
| **Go / no-go** | The spike result per OS: build F25.3 there, or turn it off there. |

## 5. Features

### 5.1 F25.1 Live browser

- **What:** While the Live test runs, the task page (`liveTest`) shows a live picture of the agent's Chromium, next to the step list from M11.
- **Why:** Watching the agent work builds trust faster than reading steps after. I can also stop it early when it goes the wrong way.
- **Example:** T-0042 is live testing. The task page shows the step list on the left and the live browser on the right: the login page, then the "Forgot password" click, then "Check your inbox". A small badge says "Live · 5 fps".
  ```
  $ saarthi browser watch T-0042
  Watching T-0042 live: open the task page to see it (the CLI shows steps only).
   3  type 17 characters into "Email"
   4  click "Send reset link"
  ```
- **Rules:**
  - Works on Linux, macOS and Windows: it uses the agent's own Chromium from M11, not the system WebView.
  - It streams only while the task page is open. With no viewer, nothing is sent (no idle work).
  - Frames are not saved. The proof stays the M11 evidence (screenshots, video, trace).
  - Max frame rate `SCREENCAST_MAX_FPS`.
  - Watching never changes the test. **Stop** stops the Live test (like stopping a run).
- **Acceptance criteria:**
  - On all three OSes, the task page shows the live browser during a Live test.
  - With the task page closed, the daemon sends no frames.

### 5.2 F25.2 Preview window

- **What:** **Open preview** on the task page opens a separate Saarthi window (`livePreview`) on the task's dev server URL. Saarthi starts the dev server if it is not running. I click around in my app.
- **Why:** Sometimes I want to try the change myself before I approve it. Today I start the dev server and a browser by hand.
- **Example:**
  ```
  $ saarthi preview open T-0042
  Dev server: http://127.0.0.1:41010 (ready in 3.8 s)
  Preview window opened.
  $ saarthi preview close T-0042
  Closed. Dev server stopped.
  ```
- **Rules:**
  - The window has **no IPC and no capabilities**. It cannot call any Saarthi command, read the token, or reach the daemon through the app. It loads untrusted app code.
  - It only opens `base_url` and `allowed_hosts`. Any other link opens in the system browser.
  - It uses the system WebView (WebKitGTK, WKWebView, WebView2). The Live test result always comes from Chromium; the preview can look a little different.
  - Closing the window stops the dev server, unless a check batch is using it.
  - One preview window per task.
- **Acceptance criteria:**
  - A test page in the preview window that tries to call a Saarthi command fails (test proves it, on every OS).
  - A link to a host outside the list opens in the system browser, not in the preview window.

### 5.3 F25.3 Agent drives the preview window (spike-gated)

- **What:** On the preview window, **Let the agent use this window** makes the next Live test run in that window instead of in the agent's own Chromium. I watch it there.
- **Why:** I see the agent test in the same window I use. On some OSes it also avoids a second browser.
- **Example (Linux, spike passed):** `livePreview` → **Let the agent use this window** → **Run checks again** → the Live test clicks in the preview window.
  On macOS the button is not shown. The agent uses its own Chromium, and I watch it with F25.1.
- **Rules:**
  - Only on the OSes where the M12 spike passed (5.4). Elsewhere the button is not shown, and the API refuses it.
  - The driver may reach **only** the preview window, never the main Saarthi window.
  - Allowed hosts, step limit, evidence and secrets follow M11 exactly. A saved login is loaded into the preview window only for that Live test and cleared after.
  - If driving fails mid-test, the Live test is an error and the next run falls back to the agent's own Chromium.
- **Acceptance criteria:**
  - On an OS that passed, a Live test runs in the preview window with the same evidence as M11.
  - On macOS, and on any OS that failed the spike, the button is not shown and `saarthi preview agent T-0042` says "Not supported on this OS".

### 5.4 The spike (go / no-go per OS)

The spike runs first, about 3 hours. Its result goes into `../../decisions/ADR-003-browser-testing.md`.

| OS | Way to drive the preview window | Go only if all are true | Default before the spike |
|---|---|---|---|
| Linux | WebKitWebDriver (system package, not bundled) drives a preview-only window | (1) the agent can open, click, type and screenshot; (2) the main window is not reachable; (3) the preview window still has no IPC; (4) works on Ubuntu 24.04 in CI; (5) adds nothing to the installer | unknown |
| Windows | WebView2 remote debugging (CDP), attached by the same Playwright MCP as M11 | same (1)-(5); the debugging port is on `127.0.0.1` and on the preview window's own WebView2 setup only | unknown |
| macOS | none: there is no WKWebView driver | - | **no-go** (falls back to F25.1) |

- A no-go on an OS turns F25.3 off there. F25.1 and F25.2 are built on every OS anyway.
- If both Linux and Windows are no-go, M12 drops F25.3 and is about 3 hours shorter.

## 6. Main user flows

### 6.1 Watch a Live test
1. T-0042 finishes its build; checks pass; the Live test starts.
2. Open the task page: the step list and the live browser.
3. It goes wrong (clicks the wrong button). Click **Stop**, then "Let Claude fix it".

### 6.2 Try it myself
1. On Check and ship of T-0042, click **Open preview**.
2. The preview window opens on `http://127.0.0.1:41010`. Try the reset form by hand.
3. Close it. Approve and create pull request.

### 6.3 Agent in my window (Linux or Windows, spike passed)
1. Open preview. Click **Let the agent use this window**.
2. **Run checks again**. The Live test runs in the preview window while I watch.

## 7. Done when

- [ ] The go/no-go result per OS is written in ADR-003.
- [ ] I watch a Live test live in the task page on Linux, macOS and Windows.
- [ ] I open the preview window for a task and use the app by hand.
- [ ] A test proves the preview window cannot call any Saarthi command.
- [ ] "Let the agent use this window" shows only on the OSes that passed, and works there.
- [ ] No test starts a real browser or real agent (except the optional `real_browser` marker test).
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run pyright` pass.

## 8. Not in M12

| Item | Owner |
|---|---|
| Agent drives the preview window on macOS | Later (needs a WKWebView driver) |
| Recording the screencast as evidence | Not planned (M11 video is the proof) |
| Clicking inside the live browser picture to control it | Later |
| Dev tools inside the preview window | Not planned |
| A browser in the installer | Not planned |

## 9. QA checklist

1. Run a Live test with the task page open on each OS → live picture; close the page → no frames sent (log shows the stream stopped).
2. **Open preview** → the app shows; links to other hosts open the system browser.
3. In the preview, open a test page that calls a Saarthi command → it fails.
4. Close the preview → the dev server stops (unless checks are running).
5. Linux / Windows (if go): **Let the agent use this window** → Live test runs there, evidence as in M11.
6. Check that the main window is not reachable from the driver (spike test script).
7. macOS: the button is not shown; the API answers 409 `preview_drive_unsupported`.

## 10. Open questions

1. **Linux:** WebKitWebDriver starts a whole app process. Is a "preview-only" mode of the Saarthi app (no daemon token, no IPC) acceptable, or too heavy?
2. **Windows:** can the preview window use its own WebView2 setup (data folder + debugging switch) so the main window never opens a debugging port?
3. Should the live browser also show outside Live tests (for example while the agent builds)? v1: only during Live tests.
4. If 15.5 hours is not enough, cut first: the `saarthi browser watch` CLI, then F25.3 on Linux.

## 11. Effort

About **15.5 hours**. See TDD section 17 for the breakdown.

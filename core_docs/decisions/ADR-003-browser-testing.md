# ADR-003: Browser testing and live preview

**Status:** Accepted
**Date:** 2026-10-23
**Related:** `design/2026-10-23-simple-ui-design.md` (P6, P7, section 11: B1-B10), `FUNCTIONAL_SPECIFICATIONS.md` (F7.5, F24, F25), `TDD-tech-design-doc.md` (4.6, 4.15, 4.16), `TECH_STACK.md`, `milestones/M11_browser_testing/`, `milestones/M12_live_preview/`, ADR-002 (size budget)

## Context

- Many tasks are only "done" when the app works in a browser: log in, open a page, click, see the result. Unit tests do not prove that.
- Agents must prove UI work live, and show proof the user can check in a few seconds.
- Saarthi must stay light (ADR-002): installer under 40 MB. A Chromium build is 100-200 MB.
- Many projects need a login. The agent must never see a password or a session.
- Saarthi's own window is a Tauri WebView. Only some OSes let a program drive it.

## Decision

From the UI spec, section 11.2:

1. **B1 No browser in the installer.** The size budget stays as it is.
2. **B2 One engine: Chromium, on all three OSes.** Same behaviour everywhere, CDP for the M12 screencast, and the default of Playwright MCP.
3. **B2a Lightest path first:** system Google Chrome -> system Microsoft Edge (built into Windows 10/11) -> system Chromium -> a one-time **browser kit** download into the data folder. The kit holds Playwright's **Chromium headless shell** for Live tests (the smallest build). The full Chromium is downloaded only if the user wants a window (watch a test, save a login) and no system browser exists. Real sizes come from the M11 spike.
4. **B3 Off by default, per project:** `[browser]` in `project.toml` (`enabled`, `base_url`, `dev_server`, `allowed_hosts`, `live_test`, `live_test_required`).
5. **B4 Live test = one more check**, after the required checks pass, on the task's dev server and port. The agent drives the browser through a browser MCP server (Playwright MCP). Optional by default; required with `live_test_required`.
6. **B5 The project's own E2E tests** are checks of kind `e2e`, with the dev server started and artifacts collected.
7. **B6 Saved logins, test accounts only.** The user logs in by hand once in a headed browser. Saarthi saves the Playwright `storageState` (owner-only file in the data folder). Never in the repo, events, the Context Pack or agent text. No password stored.
8. **B7 Allowed hosts only.** Other hosts need a Needs-you OK.
9. **B8 Expired login -> Needs you** ("Log in again").
10. **B9 See it work** on Check and ship: steps with screenshots, a short video, "Open trace". Cleaned up with the worktree.
11. **B10 Live preview (M12):** (a) live browser screencast in the task page, every OS; (b) a preview window with no IPC; (c) the agent drives the preview window only where the M12 spike passes (Linux WebKitWebDriver, Windows WebView2 CDP; never macOS).

One design choice added here (TDD 4.15): **the browser runs with the daemon, not inside the agent.** The daemon starts Playwright MCP and the browser. The agent reaches it through a Saarthi MCP endpoint on `127.0.0.1`, with a per-run session id. So the saved login file never needs to be visible to the agent, and the host guard, step limit, screenshots and events live in one agent-neutral place. Adapters only pass the endpoint through `RunRequest.mcp_servers`.

## Options considered

| Option | Result |
|---|---|
| Bundle Chromium in the installer | Rejected. 100-200 MB breaks the 40 MB budget, and most users already have Chrome or Edge. |
| Firefox or WebKit (also, or instead) | Considered, rejected. No CDP screencast for M12, and two more engines to test on three OSes. Chromium alone is lighter to ship and to test. |
| The Tauri WebView as the test browser | Rejected as the main path. There is no WKWebView driver on macOS, and it would run untrusted app code next to Saarthi's own window. Kept as the spike-gated M12 extra (agent drives a separate preview window with no IPC). |
| Only the project's own E2E tests | Not enough. Many projects have none. Kept as the `e2e` check kind. |
| The user tests by hand | Slow, and leaves no proof. |
| The agent starts Playwright MCP itself (stdio) | Rejected as the main path. The `storageState` path and file would be visible to the agent and inside its sandbox. Kept only as a small stdio bridge to the daemon endpoint if an agent cannot use HTTP MCP. |

## Consequences

- Good: proof of UI work ("See it work") with no size cost in the installer. On Windows, Edge is usually there, so no download.
- Good: one engine, one MCP server, one place for safety rules.
- Cost: Playwright MCP needs Node. Users without `node` get a Node runtime in the kit (size measured in the spike).
- Cost: the kit download needs the network once, from the user's click.
- Cost: evidence uses disk. Capped by `EVIDENCE_MAX_MB`; removed with the worktree.
- Gap: on macOS the agent never drives the preview window. It uses its own Chromium, which the user can still watch (F25.1).
- The preview window uses the system WebView, so it can look a little different from the Live test in Chromium.
- New total plan: M11 about 2 weeks, M12 about 1.5 weeks; about 23.5 weeks in all.

## Open items

- M11 spike: kit packaging (Playwright MCP, Node runtime, headless shell, full Chromium), download source and checksum, real sizes per OS.
- M11 spike: Playwright MCP flags with Claude, Codex and Gemini (HTTP MCP or the stdio bridge; tools allowed in `read_only`).
- M11 spike: launch mode. Daemon starts Chromium and MCP attaches (`--cdp-endpoint`), or MCP launches it. M12 needs a CDP handle, so attach is preferred if video and trace still work.
- M11 spike: `storageState` save over CDP and load in Playwright MCP; video size and length.
- Snap Chromium on Ubuntu may not accept a temp profile outside `$HOME`. Check in the spike; skip it in the finder if needed.
- M12 spike: go / no-go per OS for "agent drives the preview window". Write the table here.

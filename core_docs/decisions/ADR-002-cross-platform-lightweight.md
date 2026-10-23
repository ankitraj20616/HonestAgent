# ADR-002: One light app for Linux, macOS and Windows

**Status:** Accepted
**Date:** 2026-10-23
**Related:** `design/2026-10-23-simple-ui-design.md` (P3, P4), `TECH_STACK.md` (2.3, 2.5), `TDD-tech-design-doc.md` (3.1, 3.2), ADR-001 (agent integration)

## Context

- Saarthi was planned for Linux only (Ubuntu first).
- The owner now wants one app for Linux, macOS and Windows, built from one codebase.
- It must stay very light: installer under 40 MB, app open under 2 s, idle RAM under 150 MB for the window plus under 150 MB for the daemon.
- The daemon is Python (TECH_STACK 2.3). The shell is Tauri 2. Nothing in the UI may depend on the OS.

## Decision

1. **Tauri 2 shell on all three OSes.** It uses the system WebView: WebKitGTK (Linux), WKWebView (macOS), WebView2 (Windows). Same React UI everywhere.
2. **Python daemon as a Tauri sidecar.** One-file binary per OS (PyInstaller or Nuitka, picked in M9 by size). The app starts the daemon, or connects to one that already runs.
3. **One CI pipeline.** A GitHub Actions matrix (Ubuntu, macOS, Windows) runs the tests and builds the installers: `.AppImage` + `.deb`, `.dmg`, `.msi`.
4. **Per-OS details live in small wrappers**, never in the UI:
   - Paths: `platformdirs`.
   - PTY: stdlib `pty` on Linux / macOS, ConPTY via `pywinpty` on Windows (M2).
   - Background service (optional): systemd user service, launchd agent, Tauri autostart plugin / per-user Startup entry (M9).
   - Sandbox (M8): `bwrap` on Linux, a `sandbox-exec` profile on macOS. **Windows v1 has no OS sandbox, so "Full access" is not offered on Windows.**
   - Notifications: Tauri notification plugin on every OS; `notify-send` is only a Linux fallback.
5. **Size budget** as above, measured per OS in M9 (`TECH_STACK.md` 2.5).
6. **When:** M0 proves the window and the daemon start on all three OSes in CI. M2 adds PTY and paths. M8 adds the sandboxes. M9 ships the installers.

## Options considered

| Option | Result |
|---|---|
| Electron | Rejected. Too heavy: a bundled browser breaks the installer and RAM budget. |
| A VS Code fork (Code-OSS, Theia) | Rejected. Heavy, file-first, and against the task-first idea. |
| Rewrite the daemon in Rust or Go now | Not now. Kept as the **fallback** if the size budget is missed in M9. The HTTP + WebSocket API (TECH_STACK 2.4) keeps that port possible without touching the UI. |
| Linux only | Rejected by the owner. |

## Consequences

- Good: one codebase, one release pipeline, a native installer per OS, and still no Electron.
- Cost: the Python sidecar adds about 25-40 MB and some idle RAM. The budget is tight; M9 must measure it.
- Cost: CI runs three times. Tests must not assume POSIX (paths, signals, PTY).
- Gap: no "Full access" on Windows in v1 (FSD Q4).
- M9 grows from 1 to 2 weeks (installers per OS, sidecar, service per OS).

## Open items (decide by M9)

- Code signing and notarization: Apple Developer ID for the `.dmg` (Gatekeeper), a code-signing certificate for the `.msi` (SmartScreen). Without them users see a warning on first open.
- Windows: turn on git long paths (`core.longpaths`) for worktrees under the data folder.
- Windows: project check commands (`uv run pytest`, `npm test`) run through the user's shell; document which shell (PowerShell or Git Bash) and test it in CI.
- macOS: `sandbox-exec` is deprecated by Apple but still works; review it each macOS release.
- Build for Apple Silicon (arm64) first; Intel Macs only if asked.
- Spike 6 in M0 writes its numbers (size, start time, setup steps per OS) into this ADR.

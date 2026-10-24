# TDD — M11: Browser testing

**Document type:** Technical Design Document (TDD)
**Milestone:** M11 of M0-M12 (built after M7; see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-23
**Updated:** 2026-10-23 - first version, from the Simple UI spec section 11 (B1-B9) and the Chromium-only update (B2, B2a)
**Estimated effort:** 21 hours (about 2 rough weeks at ~10 h/week), including a ~2.5 h spike. +~2 h if M7's ports are not built yet.
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. Every decision says *why*.
**Related documents:** `FSD_M11_browser_testing.md`, `../../design/2026-10-23-simple-ui-design.md` (P6, section 11), `../../TDD-tech-design-doc.md` (4.4, 4.6, 4.9, 4.15, 5.7, 5.13, 6.2, 9.1, 10, 12, 13, 15), `../../TECH_STACK.md` (3.4), `../../decisions/ADR-003-browser-testing.md`, `../M4_checks_proof_card/TDD_M4_checks_proof_card.md` (Check Runner, side runs), `../M5_review_ship/TDD_M5_review_ship.md` (cleanup), `../M7_race_mode/TDD_M7_race_mode.md` (ports, Decision 9), `../M8_safety_cost_rewind/TDD_M8_safety_cost_rewind.md` (sandbox), `../M12_live_preview/TDD_M12_live_preview.md` (after)
**Screens:** prototype views `settingsBrowser`, `loginSave`, `liveTest`, `evidence`, `loginExpired`, `check` (the See it work card) in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. The goal in one sentence

Add a `browser/` module that finds a Chromium (system first, else a downloaded kit), starts the task's dev server, runs a **Live test** as one more check (the agent drives Playwright MCP through a Saarthi MCP endpoint), runs `e2e` checks, keeps saved test logins secret, and stores the evidence for **See it work**. F-numbers: F7.5, F24.1-F24.7 (FSD section 1).

## 2. Read this first — rules this work must not break

From `CLAUDE.md`:

1. **All logic lives in the daemon** (rule 1). Finding the browser, the kit, the dev server, the host guard, logins and evidence are daemon code. The UI only calls the API.
2. **CLI first** (rule 2). `saarthi browser ...`, `saarthi devserver ...`, `saarthi evidence ...` exist before the screens.
3. **Agents only through `AgentAdapter`** (rule 3). Adapters only get `RunRequest.mcp_servers` and turn it into their own flags. No browser code in `agents/`, no agent names in `browser/`.
4. **Every action is an event** (rule 4). New events in section 8. Unknown MCP results are kept as raw text in `browser.step`, never dropped.
5. **Stage rules stay in `ALLOWED_MOVES`** (rule 5). M11 adds no move. A required Live test uses M4's gate.
6. **Subprocess with a list of args** (rule 6). Dev server, kit tools and the browser start with list args, never a shell string.
7. **No hard-coded values** (rule 7). Section 6.
8. **Tests first, never a real browser or agent in unit tests** (rule 8). `FakeBrowser` + recorded fixtures (section 14). One optional real-browser test behind a marker.
9. **No Later features** (rule 10): no live screencast or preview window (M12), no API recordings (F7.8), no Firefox / WebKit.

## 3. What already exists (do not rebuild)

| Thing | Built in | What M11 does with it |
|---|---|---|
| Check Runner, batches, `check_results`, `proof_cards`, gate, verdict | M4 | Adds check kinds, the dev server step and the Live test step. |
| Side runs (`SIDE_RUN_MODES`), `RunRequest.output_schema`, `agents/structured.py` | M4 | Live test is a side run `live_test` with a result schema. |
| Coverage side run ("What done looks like") | M4 | Gets the Live test steps as extra input. |
| `failing_checks_markdown()` for fix runs | M4 | A failed required Live test adds its failing steps. |
| Process group kill on timeout (`checks/process.py`) | M4 | Reused for the dev server. |
| Worktree cleanup after `WORKTREE_CLEANUP_DAYS` | M5 | Also removes the task's evidence folder. |
| Check and ship screen | M4 / M5 | Gets the See it work card. |
| Per-workspace ports, `RunRequest.env`, `SAARTHI_PORT` / `PORT` | M7 (Decision 9) | Dev server port, `{port}` in `base_url`. Not built yet -> M11 builds that part first. |
| Stage → status function, `waiting_on_user` | M3 | Expired login and blocked host make the task Needs you. |
| Agent sandbox, network on | M8 | The Live test side run is sandboxed like any run (Decision 4). |
| Secret masking in the Event Bus | M8 | Still runs; M11 also never puts session data in events. |
| `platformdirs` data folder | M2 | Kit, logins and evidence live there. |

## 4. Technical decisions

### Decision 1 — A short spike before anything else (new)
Day 1, about 2.5 h, results into `../../decisions/ADR-003-browser-testing.md`:

| # | Check | Pass when | If it fails |
|---|---|---|---|
| S1 | Kit packaging: Playwright MCP (pinned), Node runtime if no `node`, Chromium headless shell, full Chromium. Download source, checksum, real size per OS. | One command installs and removes it on Linux, macOS, Windows. | Use the user's `node` only; show "install Node" as the fix. |
| S2 | Playwright MCP flags: browser / executable path, headless, temp profile, `storageState`, video, trace, output dir, allowed origins. | A recorded session with video + trace from a scripted MCP client. | Record what is missing; take screenshots by CDP. |
| S3 | Each agent with an **HTTP** MCP server (Claude `--mcp-config`, Codex `-c mcp_servers...`, Gemini settings) and the tools allowed in the `read_only` profile. Record 1 stream per agent. | The agent calls `browser_navigate` through our endpoint. | That agent uses the stdio bridge (Decision 4). |
| S4 | `storageState`: save over CDP (cookies + local storage), load in Playwright MCP, logged in. | The app shows the logged-in page. | Save with Playwright's own `storageState` call inside the host. |
| S5 | Launch mode: daemon starts Chromium with a CDP port and MCP attaches (`--cdp-endpoint`), or MCP starts it. | Video and trace still work when attached. | MCP starts it; M12 must re-check the screencast. |
| S6 | Video size and length for a 10-step test. | Fits `EVIDENCE_MAX_MB` with room. | Lower `LIVE_TEST_VIDEO_SIZE`. |

**Why:** CLI and MCP flags change often (TECH_STACK 3.5). The spike keeps guesses out of the code, like M0 and M7.

### Decision 2 — Chromium only; one pure finder (spec B2, B2a)
`browser/finder.py: pick_browser(os_name, which, exists) -> BrowserInfo | None` walks `BROWSER_SEARCH_ORDER = ("chrome", "msedge", "chromium", "kit")` over `BROWSER_PATHS_BY_OS[os_name]` (names on `PATH` + known install paths) and returns `{kind, path, version, headed_ok}`. The kit's headless shell gives `headed_ok = false`. `which` and `exists` are passed in, so one unit test covers every OS on any runner.
**Why:** one engine = one behaviour, CDP for M12, and Playwright MCP's default. Chrome first because it is the most common; Edge second because Windows always has it.

### Decision 3 — The browser kit: pinned, on demand, in parts
`<data>/browser-kit/<BROWSER_KIT_VERSION>/` with a `manifest.json` (`parts`, versions, checksums). Parts: `mcp` (Playwright MCP + Node if needed; always needed, small), `headless` (Chromium headless shell; only when no system browser), `full` (full Chromium; only when no system browser **and** a window is needed: Save a login, or `browser.show_window`). Install = download to a temp folder, check the checksum, rename. Events `browser.kit_installed {version, parts}` / `browser.kit_removed`.
**Why:** the lightest path first (B2a). Only what is needed is downloaded. A temp folder + rename means a broken download never looks installed.

### Decision 4 — The browser runs with the daemon; the agent reaches it through a Saarthi MCP endpoint (new)
- `browser/host.py` starts Playwright MCP as a stdio child **of the daemon**, with the found browser, a fresh temp profile, the chosen `storageState`, video and trace on, and the allowed origins.
- `browser/mcp_endpoint.py` serves MCP over HTTP at `POST /api/v1/browser-mcp/{session_id}` (JSON responses only: `initialize`, `tools/list`, `tools/call`, notifications). It forwards to the host.
- `RunRequest.mcp_servers = [McpServerSpec(name=BROWSER_MCP_SERVER_NAME, url=...)]`.
- **Stdio fallback:** if the spike shows an agent only starts stdio servers, the spec is `{command: <saarthi>, args: ["mcp-bridge", "--session", id]}`. The bridge only copies JSON-RPC lines to the endpoint.
**Why:** the saved login must never be readable by the agent (B6). If the agent started Playwright MCP, the `storageState` path would be in its MCP config and the file inside its sandbox. Here the agent sees only a URL with a session id. One daemon-side place also gives the host guard, the step limit, screenshots and events for every agent. Inside the M8 sandbox the agent needs only loopback network (already on); the kit, the logins and the temp profile stay outside it.

### Decision 5 — `RunRequest.mcp_servers`; each adapter maps it (new field)
`agents/base.py`: `McpServerSpec {name, url | (command, args)}`, `RunRequest.mcp_servers: list[McpServerSpec] = []`. Each adapter gets `mcp_args(specs, workdir) -> list[str]` (and may write a small config file under `<worktree>/.saarthi/context/`, git-ignored). Tool allow names (for example Claude `mcp__saarthi_browser__*`) are made inside the adapter. Exact flags from spike S3, frozen in golden tests.
**Why:** same pattern as M8 `permission_args(policy)`: the core stays agent-neutral (rule 3).

### Decision 6 — Live test = side run `live_test` + check row of kind `live` (spec B4)
- `SIDE_RUN_MODES` gets `live_test`. Profile `read_only` for files; MCP tools allowed. Agent = the agent of the last build or fix run (M4 coverage rule).
- Prompt (`browser/live_test.py`): numbered "What done looks like" items, `base_url`, "You are logged in as `<name>`" (if a login is used), "Use only the `saarthi_browser` tools. Do not change files. Report each UI item.", `LIVE_TEST_MAX_STEPS`.
- `output_schema = schemas/json/live_test_result.schema.json`: `{status: pass|fail|skip, steps: [{criterion, action, expect, result: pass|fail|skip, note}], blocked_by_login: bool, summary}`.
- Maps to one `check_results` row: `kind = "live"`, `name = LIVE_TEST_CHECK_NAME`, `required = live_test_required`, `output_tail = summary`, `artifacts`. Invalid JSON -> `error` "agent result not valid" (evidence kept).
**Why:** a check row reuses the gate, the verdict, Show output and "Let Claude fix it" with no new paths. A side run reuses cost, limits and the queue (M4).

### Decision 7 — Order inside a check batch
1. `cmd` checks (as M4).
2. Dev server: started **lazily**, once per batch, before the first `e2e` check or the Live test.
3. `e2e` checks, then copy artifacts.
4. Live test, only if every required check passed, `[browser] enabled`, `live_test = "auto"`. Skipped (status `skip` + note) when there is no browser; `error` instead when `live_test_required` (so the gate shows the fix).
5. Stop the dev server, the host and the temp profile.
6. Coverage (M4) with the Live test steps as an extra section; Proof Card; verdict.
**Why:** a Live test on code that fails its required checks wastes time and money. Coverage after the Live test lets a broken UI item become "Not met" ("Take a look") even when the Live test is optional.

### Decision 8 — Dev server: list args, ready by HTTP, process-group stop
`browser/devserver.py`: `{port}` in `dev_server` and `base_url` -> the task's `SAARTHI_PORT`. `shlex.split` + `create_subprocess_exec`, `cwd` = worktree, env = M7 port vars + `SAARTHI_BASE_URL`, new process group. Ready = `GET base_url` answers with status < 500 (poll `DEV_SERVER_READY_POLL_S`, timeout `DEV_SERVER_READY_TIMEOUT_S`). Output to `<data>/checks/<task_id>/<proof_card_id>/devserver.log`. Stop = M4 `kill_group()` with `DEV_SERVER_STOP_GRACE_S`. One dev server per task at a time (task lock). Events `devserver.started {url, port, seconds_to_ready}`, `devserver.failed {reason, output_tail}`, `devserver.stopped`.
**Why:** same safety rules as checks (M4 Decisions 2-3). Any status below 500 counts, because many apps answer `/` with a redirect or a 401.

### Decision 9 — Host guard in the endpoint, plus allowed origins in the browser (spec B7)
- Allowed = host of `base_url` + `allowed_hosts` + `tasks.browser_hosts_ok`.
- The endpoint checks the URL of every `browser_navigate` (and every tab-open tool) before forwarding. Not allowed -> MCP error "host not allowed; Saarthi asked the user", event `browser.host_blocked {host, url}`.
- Playwright MCP also gets the allowed origins (spike S2), so a click on a link to another host is blocked by the browser. The endpoint reads the page URL in each result; a blocked request seen there also emits `browser.host_blocked`.
- A `browser.host_blocked` with no later `browser.host_allowed` for that host makes the task Needs you (Decision 14). Allow = `POST /tasks/{id}/browser/hosts {host}` -> append to `tasks.browser_hosts_ok`, `browser.host_allowed`. The user then runs the checks again.
**Why:** block-then-ask keeps the Live test short and never waits on a person mid-run. Allow per task, because `project.toml` is not written by Saarthi (M1 Decision 6).

### Decision 10 — Tool deny list and secret-safe steps (new)
- `tools/list` from Playwright MCP is filtered by `BROWSER_MCP_TOOLS_DENY` (tools that run page scripts, install browsers, upload files or read storage; exact names from spike S2). A denied tool call gets an MCP error.
- `browser.step` saves `{n, tool, summary, url, ok}`. Typed text is never saved: the summary is "type 17 characters into Email". MCP result text is cut to `BROWSER_STEP_TEXT_MAX` and goes through the M8 masker.
- After each action tool (`BROWSER_ACTION_TOOLS`), the endpoint takes a screenshot through the host (MCP screenshot tool or CDP, by launch mode) into the evidence folder, and emits `browser.screenshot {n, path}`. These screenshots are **not** returned to the agent.
- `LIVE_TEST_MAX_STEPS` reached -> every next call gets an MCP error "step limit", and the run is stopped.
**Why:** a page script could read cookies or local storage and print them into the agent's text, which B6 forbids. Saved typed text could hold a password.

### Decision 11 — Save a login over CDP, never through the agent (spec B6)
`browser/logins.py: start_save(project, name)`: needs a headed browser (`headed_ok`), else 409 `no_window_browser` with the kit `full` fix. Start it with a temp profile, a CDP port on `127.0.0.1`, on `base_url`. If `base_url` has `{port}`, Saarthi first starts the dev server on a temporary port block: in a task's copy when the user picks one (`--task`), else in the main checkout (Saarthi changes no tracked file there; a dev server may write its own ignored cache files). It is stopped after the save. `finish_save()`: over CDP read all cookies (`Storage.getCookies`) and, for each allowed origin that was opened, local storage (`DOMStorage` or `Runtime.evaluate` on that origin). Write Playwright `storageState` JSON `{cookies, origins: [{origin, localStorage}]}` to `LOGINS_DIR/<project_id>/<name>.json` with `os.open(..., 0o600)` into a temp name, then `os.replace` (folder `700`, same as the M10 token file). Origins in the file are saved with the port replaced by `{port}`; at each Live test the daemon writes a filled copy into the run's temp folder (outside the agent sandbox), because local storage is per origin and every task has its own port. Close the browser, delete the profile. Row in `saved_logins`, event `login.saved {project_id, name, host}`. Timeout `LOGIN_SAVE_TIMEOUT_S`.
**Why:** CDP is enough and needs no Playwright Python package in the sidecar. The file format is Playwright's, so Playwright MCP loads it as is.

### Decision 12 — Login expiry: before and after the run (spec B8)
- Before: if every cookie of the login's host that has an `expires` value is in the past -> expired, no Live test (status `error`, note "saved login expired").
- After: the Live test result has `blocked_by_login = true` -> expired.
- Expired -> `saved_logins.expired_at = now`, `login.expired {project_id, name, task_id}`. "Log in again" runs Decision 11 again with the same name; success clears `expired_at`. A pass sets `last_ok_at`.
**Why:** the cookie check is free and catches the common case. The agent check catches servers that end sessions early. No extra project setting is needed.

### Decision 13 — Evidence: files on disk, steps from events
`<data>/evidence/<task_id>/<proof_card_id>/`: `NN-<tool>.png`, `video.webm`, `trace.zip`, `e2e/<check>/...`. `check_results.artifacts` holds relative paths and `session_id`. `GET /tasks/{id}/evidence` joins the files with the `browser.step` events of each session. Cap `EVIDENCE_MAX_MB` per batch: drop the video, then the oldest screenshots, add a note. M5's cleanup also removes `<data>/evidence/<task_id>/`. "Open trace" runs the kit's (or the user's) Playwright trace viewer on the local file, list args.
**Why:** no new table: events already hold the steps (rule 4), files hold the media.

### Decision 14 — Two more Needs-you facts (spec B7, B8)
M3's `status_for(..., waiting_on_user=...)` gets two more facts ORed in: the project's login used by this task has `expired_at` set, or the task has a `browser.host_blocked` with no matching `browser.host_allowed` since the last check batch. `TaskOut` gets `browser_waiting: {kind: "login_expired"|"host_blocked", name?, host?} | null` for the Home row text.
**Why:** same way M5, M7 and M10 add facts (M3 Decision, `waiting_on_user`). The function and the table do not change.

### Decision 15 — `project.toml` `[browser]` is read only in Saarthi
Parsed in `core/project_config.py` (M1) with checks: `live_test` in `("auto", "off")`; `base_url` is `http(s)`; its host is in `allowed_hosts` or `127.0.0.1` / `localhost`; `dev_server` has none of M4's forbidden tokens; `login` matches `CHECK_NAME_PATTERN`. Settings → Browser testing shows the values and **Open project.toml**.
**Why:** M1 Decision 6: the file is the source of truth. The only global switch Saarthi writes is the user setting `browser.show_window`.

## 5. Modules and files

### Daemon (`daemon/src/saarthi/`)

| File | New / changed | What |
|---|---|---|
| `browser/finder.py` | new | Decision 2. |
| `browser/kit.py` | new | Decision 3. |
| `browser/devserver.py` | new | Decision 8. |
| `browser/host.py` | new | Playwright MCP child process, temp profile, launch mode (Decisions 4, S5). |
| `browser/mcp_endpoint.py` | new | MCP over HTTP, forwarding, host guard, deny list, steps, screenshots (Decisions 4, 9, 10). |
| `browser/bridge.py` | new | `saarthi mcp-bridge` stdio fallback (only if spike S3 needs it). |
| `browser/cdp.py` | new | Small CDP client (WebSocket). |
| `browser/logins.py` | new | Decisions 11, 12. |
| `browser/evidence.py` | new | Decision 13. |
| `browser/live_test.py` | new | Decision 6. |
| `agents/base.py` | changed | `McpServerSpec`, `RunRequest.mcp_servers`. |
| `agents/claude.py`, `codex.py`, `gemini.py` | changed | `mcp_args()` from spike S3. |
| `checks/runner.py`, `checks/spec.py` | changed (M4) | Kinds, `artifacts`, Decision 7 order. |
| `checks/coverage.py` | changed (M4) | Live test steps as extra input. |
| `checks/fix_loop.py` | changed (M4) | Failing Live test steps in `failing_checks_markdown()`. |
| `workspace/cleanup.py` | changed (M5) | Remove the evidence folder. |
| `core/status.py` | changed (M3) | Decision 14 facts. |
| `core/project_config.py` | changed (M1) | `[browser]`, check `kind` / `artifacts`. |
| `schemas/browser.py`, `schemas/json/live_test_result.schema.json` | new | Pydantic models, result schema. |
| `api/browser.py` | new | Section 9.1. |
| `cli/browser.py`, `cli/devserver.py`, `cli/evidence.py` | new | Section 9.2. |
| `db/models.py`, `db/migrations/versions/<rev>_m11_browser.py` | changed / new | Section 7. |
| `config.py` | changed | Section 6. |

### Desktop (`desktop/src/`)

| File | What |
|---|---|
| `screens/Settings/BrowserSettings.tsx` | `settingsBrowser`: browser found or Download browser kit (with progress), `[browser]` values, Open project.toml, "Show the browser while it tests", saved logins, Save a login. |
| `screens/Settings/SaveLogin.tsx` | `loginSave`: test-accounts warning, name, the browser opens, **I'm logged in**. |
| `components/task/LiveTestPanel.tsx` | `liveTest`: steps as they come (`browser.step`, `browser.screenshot`), thumbnails. M12 adds the live browser here. |
| `screens/CheckShip/SeeItWorkCard.tsx` | The card on `check`: "6 steps · video 0:31". |
| `screens/CheckShip/Evidence.tsx` | `evidence`: step list with screenshots, video, Open trace. |
| `components/task/LoginExpiredCard.tsx`, `HostBlockedCard.tsx` | `loginExpired` and the host OK card; used on Home Needs-you rows and the task page. |

## 6. Config added

`config.py`:

| Constant | Value |
|---|---|
| `BROWSER_KIT_VERSION`, `BROWSER_KIT_DIR` | `"1"` (bump when any pinned part changes), `<data>/browser-kit` |
| `BROWSER_KIT_MANIFEST_URL` | from spike S1 |
| `BROWSER_SEARCH_ORDER` | `("chrome", "msedge", "chromium", "kit")` |
| `BROWSER_PATHS_BY_OS` | per OS: names on `PATH` (`google-chrome`, `google-chrome-stable`, `microsoft-edge`, `chromium`, `chromium-browser`) and install paths (`/Applications/Google Chrome.app/...`, `%ProgramFiles%\Google\Chrome\Application\chrome.exe`, `%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe`, ...) |
| `PLAYWRIGHT_MCP_PACKAGE`, `NODE_MIN_MAJOR` | pinned in spike S1 |
| `BROWSER_MCP_SERVER_NAME` | `"saarthi_browser"` |
| `BROWSER_MCP_TOOLS_DENY`, `BROWSER_ACTION_TOOLS` | from spike S2 |
| `BROWSER_STEP_TEXT_MAX` | `2000` |
| `DEV_SERVER_READY_TIMEOUT_S`, `DEV_SERVER_READY_POLL_S`, `DEV_SERVER_STOP_GRACE_S` | `90`, `1.0`, `5` |
| `LIVE_TEST_TIMEOUT_S`, `LIVE_TEST_MAX_STEPS` | `600`, `40` |
| `LIVE_TEST_VIDEO_SIZE` | `"1280x720"` (spike S6 may lower it) |
| `LIVE_TEST_CHECK_NAME` | `"Live test"` |
| `EVIDENCE_DIR`, `EVIDENCE_MAX_MB` | `<data>/evidence`, `100` (per check batch) |
| `LOGINS_DIR`, `LOGIN_SAVE_TIMEOUT_S` | `<data>/logins`, `900` |
| `BROWSER_DEFAULT_ALLOWED_HOSTS` | `["127.0.0.1", "localhost"]` |
| `E2E_DEFAULT_ARTIFACT_GLOBS` | `["test-results/**", "playwright-report/**"]` |
| `SIDE_RUN_MODES` | + `"live_test"` |
| `CHECK_KINDS` | `("cmd", "e2e", "live")`; `live` is never accepted in `[[checks]]` |

Global setting (Settings → Browser testing): `browser.show_window = false`.

`<repo>/.saarthi/project.toml` (committed, no secrets):

```toml
[browser]                                  # off by default
enabled = true
base_url = "http://127.0.0.1:{port}"       # {port} = the task's SAARTHI_PORT (M7)
dev_server = "npm run dev -- --port {port}"
allowed_hosts = ["127.0.0.1", "localhost"]
live_test = "auto"                         # "auto" | "off"
live_test_required = false
login = "test-admin"                       # optional, a saved login name

[[checks]]
name = "e2e"
cmd = "npx playwright test"
kind = "e2e"                               # new key, default "cmd"
required = false
timeout_sec = 900
artifacts = ["test-results/**", "playwright-report/**"]   # new key
```

## 7. Data model changes

Migration `<rev>_m11_browser.py` (one migration).

**`saved_logins`** (core TDD 5.13): `id` text PK (ULID), `project_id` FK, `name`, `host`, `path` (never returned by the API), `saved_at`, `last_ok_at` null, `expired_at` null. Unique `(project_id, name)`.

**`check_results`**: + `kind` text not null default `"cmd"`; + `artifacts` json null (`{session_id?, screenshots: [...], video?, trace?, files: [...]}`, paths relative to the batch evidence folder).

**`tasks`**: + `browser_hosts_ok` json null (list of hosts).

## 8. Events added

Also listed in core TDD 6.2.

| Type | When | Payload |
|---|---|---|
| `browser.kit_installed` / `browser.kit_removed` | Kit parts installed / removed | `{version, parts}`; `task_id = null` |
| `devserver.started` | Ready check passed | `{url, port, seconds_to_ready}` |
| `devserver.failed` | Did not start or not ready in time | `{reason, output_tail}` |
| `devserver.stopped` | Stopped | `{reason: "batch_end"\|"user"\|"error"}` |
| `browser.started` | Host ready for a Live test | `{session_id, browser_kind, headless, login: name\|null}` |
| `browser.step` | Each forwarded tool call | `{session_id, n, tool, summary, url, ok, text?}` (`text` cut and masked; never typed text) |
| `browser.screenshot` | After each action | `{session_id, n, path}` |
| `browser.finished` | Host closed | `{session_id, status, steps, seconds, video?, trace?}` |
| `browser.host_blocked` | Host not allowed | `{session_id, host, url}` |
| `browser.host_allowed` | User OK | `{host}` |
| `login.saved` / `login.removed` | Save / forget | `{project_id, name, host}` |
| `login.expired` | Decision 12 | `{project_id, name, task_id?}` |

Reused: `check.started`, `check.finished` (+ `kind`), `proof.ready`, `run.*` for the `live_test` side run. No payload ever holds cookies, local storage, a `storageState` path or typed text (test).

## 9. API and CLI added

### 9.1 REST (all under `/api/v1`)

| Method | Path | Body / query | Response | Errors |
|---|---|---|---|---|
| GET | `/browser` | - | `{browser: {kind, path, version, headed_ok} \| null, kit: {version, parts, installed}, show_window}` | - |
| POST | `/browser/kit` | `{parts?: ["mcp","headless","full"]}` | `202`; progress by events | 502 `kit_download_failed`, 409 `kit_busy` |
| DELETE | `/browser/kit` | - | `204` | - |
| GET | `/projects/{id}/browser` | - | `{config, errors[], browser, logins: [{name, host, saved_at, last_ok_at, expired}]}` | - |
| GET | `/projects/{id}/logins` | - | `[{name, host, saved_at, last_ok_at, expired}]` | - |
| POST | `/projects/{id}/logins` | `{name}` | `{session_id}` (headed browser opens) | 409 `no_window_browser`, 422 `bad_name`, 409 `browser_off` |
| POST | `/projects/{id}/logins/{name}/finish` | - | `{name, host, saved_at}` | 404 `no_save_session`, 408 `login_save_timeout` |
| DELETE | `/projects/{id}/logins/{name}` | - | `204` (file deleted) | 404 |
| GET / POST / DELETE | `/tasks/{id}/devserver` | - | `{state, url, port, pid?}` | 409 `browser_off`, 502 `devserver_failed` |
| POST | `/tasks/{id}/browser/hosts` | `{host}` | `{browser_hosts_ok}` | 422 `bad_host` |
| GET | `/tasks/{id}/evidence` | `proof_card_id?` | `[{proof_card_id, check, status, steps: [{n, tool, summary, url, ok, screenshot}], video?, trace?, files[]}]` | - |
| GET | `/tasks/{id}/evidence/file` | `path` | the file | 400 `bad_path` (outside the evidence folder) |
| POST | `/tasks/{id}/evidence/trace` | `{proof_card_id}` | `204` (trace viewer opens) | 404, 409 `no_trace_viewer` |
| POST | `/browser-mcp/{session_id}` | MCP JSON-RPC | MCP JSON-RPC | 404 unknown or ended session (no API token needed; session id only) |

Changed: `GET /tasks`, `GET /tasks/{id}` return `browser_waiting`; `GET /tasks/{id}/proof` check rows have `kind` and `artifacts`.

### 9.2 CLI

| Command | Options | Output |
|---|---|---|
| `saarthi browser status` | `--project`, `--json` | Browser / Kit / Window lines (FSD 5.1), and the `[browser]` values for a project |
| `saarthi browser kit install` / `remove` | `--part headless\|full` | progress, then the folder |
| `saarthi browser login save <name>` | `--project`, `--task` (use this task's copy for the dev server) | test-account warning, "press Enter when logged in", `Saved login ...` |
| `saarthi browser login list` / `remove <name>` | `--project`, `--json` | NAME / HOST / SAVED / LAST OK |
| `saarthi browser allow-host <task> <host>` | - | `Allowed <host> for <task>.` |
| `saarthi devserver start\|stop\|status <task>` | `--json` | `Ready: http://127.0.0.1:41010 (4.2 s)` |
| `saarthi evidence <task>` | `--open-trace`, `--json` | step list + folder (FSD 5.4) |
| `saarthi checks <task>` | (M4, changed) `--no-live` | rows include `Live test` and `e2e` |
| `saarthi mcp-bridge --session <id>` | internal | stdio bridge (only if spike S3 needs it) |

Exit codes as M1.

## 10. Key flows

### 10.1 Check batch with a Live test
1. M4 batch starts. `cmd` checks run.
2. First `e2e` check or Live test -> `devserver.start(task)` -> `devserver.started` (or `devserver.failed` -> those checks `error`).
3. `e2e` checks run with `SAARTHI_BASE_URL`; artifacts copied.
4. All required passed and `live_test = "auto"`: `pick_browser()`. None -> `skip` (or `error` if required). Login set and expired by cookies -> `error` + `login.expired`.
5. `host.start(session)`: temp profile, login file, video, trace, allowed origins -> `browser.started`.
6. Side run `live_test` with `mcp_servers` + `output_schema`. Agent calls go through the endpoint (10.2).
7. Run ends (or timeout / step limit): host stops -> video, trace saved -> `browser.finished`. Profile deleted.
8. Result -> `check_results` row (kind `live`). `blocked_by_login` -> `login.expired`. Pass with a login -> `last_ok_at`.
9. Dev server stopped. Coverage (with steps), Proof Card, verdict, gate (M4).

### 10.2 One MCP call
1. Agent -> `POST /browser-mcp/{session}` `tools/call browser_navigate {url}`.
2. Session active? Else 404. Step limit? Else MCP error. Tool denied? MCP error.
3. Host guard (Decision 9). Not allowed -> MCP error + `browser.host_blocked`.
4. Forward to the host, get the result. Read the page URL in it.
5. `browser.step`. Action tool -> screenshot into evidence -> `browser.screenshot`.
6. Return the result (without our screenshot) to the agent.

### 10.3 Save a login
1. `POST /projects/P/logins {name}` -> `pick_browser()` with `headed_ok`; none -> 409 with "Download the full browser" fix.
2. `base_url` has `{port}` -> start the dev server on a temporary port (task copy with `--task`, else the main checkout). Start the browser headed, temp profile, CDP on `127.0.0.1:<free port>`, open `base_url`.
3. User logs in, clicks **I'm logged in** -> `finish` -> read cookies + local storage over CDP -> write `storageState` (`600`) -> row -> `login.saved`.
4. Close the browser, delete the profile, stop the temporary dev server.

### 10.4 Kit install
1. `POST /browser/kit` -> choose parts (Decision 3) -> download each to a temp folder -> check checksum -> rename into `<BROWSER_KIT_DIR>/<version>/` -> `browser.kit_installed`.

## 11. Agent and MCP mapping (filled by the spike)

| Agent | How it gets the endpoint | Tools allowed in `read_only` | Fixture |
|---|---|---|---|
| Claude Code | `--mcp-config <file>` (`{"type": "http", "url": ...}`), `--strict-mcp-config` | `--allowedTools mcp__saarthi_browser__*` | `claude_live_test.jsonl` |
| Codex | `-c mcp_servers.saarthi_browser.url=...` (or the stdio bridge) | from spike S3 | `codex_live_test.jsonl` |
| Gemini CLI | settings file with `mcpServers.saarthi_browser.httpUrl` | from spike S3 | `gemini_live_test.jsonl` |

Do not trust this table over the spike (TECH_STACK 3.5).

## 12. Error handling

| Case | What we do |
|---|---|
| No browser, no kit | Live test `skip` "No browser. Download the browser kit in Settings -> Browser testing." Required -> `error` with the same hint. |
| Save a login with only the headless shell | 409 `no_window_browser` + "Download the full browser (kit part `full`)". |
| Kit download fails or checksum wrong | 502 `kit_download_failed`; temp folder deleted; nothing half installed. |
| `node` missing and no Node in the kit | Live test `error` "Node is needed for the browser kit" + fix. |
| Dev server not ready in time | `devserver.failed` + last lines; Live test and `e2e` `error`. |
| Port busy (no M7 port) | Dev server `error` "port <n> in use". |
| Agent cannot reach the endpoint | Run ends; Live test `error` "agent could not use the browser"; hint to check the sandbox network. |
| Timeout / step limit | Stop run and host; `error` "timeout" / "too many steps"; evidence kept. |
| Host not allowed | MCP error to the agent; `browser.host_blocked`; Needs-you card. |
| Login expired | `login.expired`; Needs-you "Log in again"; Live test `error`. |
| Agent result not valid JSON | `error` "agent result not valid"; evidence kept. |
| Evidence over the cap | Drop the video, then oldest screenshots; note on the check. |
| Evidence path outside the folder | 400 `bad_path`. |
| `[browser]` invalid | 422 `bad_project_toml` with the line (M1). |

## 13. Security

- `storageState` file: `LOGINS_DIR/<project>/<name>.json`, file `600`, folder `700`, written to a temp name then renamed. Never in events, logs, API responses, the Context Pack, the repo or agent text. A structlog processor drops `storage_state` and `cookies` keys. No password is ever stored.
- The agent never gets the file or its path (Decision 4). The endpoint needs only the per-run session id; it ends with the run.
- Tool deny list blocks page scripts and storage reads (Decision 10). Typed text is not saved.
- Only `base_url` + `allowed_hosts` + task OKs. Test accounts only; the UI and CLI say so.
- The browser runs outside the agent sandbox, with a fresh temp profile each time, deleted after. Chromium's own sandbox stays on (never `--no-sandbox`).
- Evidence screenshots may show test data; they stay in the data folder and are removed with the worktree.
- Kit downloads: HTTPS, pinned versions, checksum checked.

## 14. Tests to write

Fixtures: `tests/fixtures/browser/` — recorded Playwright MCP JSON-RPC lines (`initialize`, `tools_list`, `navigate_ok`, `click_ok`, `navigate_blocked`, `screenshot`), a `storage_state_sample.json` with fake cookies; `tests/fixtures/agents/<agent>_live_test.jsonl` (one per agent, from spike S3). **`FakeBrowser`** = a tiny stdio MCP server script that replays these lines and writes fake `video.webm` / `trace.zip`.

| Test file | Proves |
|---|---|
| `tests/unit/browser/test_finder.py` | Order Chrome -> Edge -> Chromium -> kit per OS with fake `which` / `exists`; headless shell has `headed_ok = false`. |
| `tests/unit/browser/test_kit.py` | Parts chosen by need; temp folder + rename; bad checksum leaves nothing; remove. (Fake download, no network.) |
| `tests/unit/browser/test_devserver.py` | `{port}` replaced; ready on a tiny local fake server; timeout -> `failed` + no process left; list args. |
| `tests/unit/browser/test_mcp_endpoint.py` | Forwarding with `FakeBrowser`; host guard + `browser.host_blocked`; task OK host passes; deny list; step limit; typed text not in events; our screenshot not returned to the agent; unknown result kept as text. |
| `tests/unit/browser/test_logins.py` | File mode `600`, folder `700`; `storageState` shape; expiry by cookies; `blocked_by_login` -> expired; path never in API output. |
| `tests/unit/browser/test_evidence.py` | Cap drops video then old screenshots; path guard; cleanup removes the folder. |
| `tests/unit/agents/test_mcp_args.py` | Golden flags per adapter for one `McpServerSpec` (HTTP and stdio). |
| `tests/unit/checks/test_batch_order.py` | Decision 7 order; no Live test after a failed required check; required Live test fail -> gate closed; optional fail -> Review. |
| `tests/unit/core/test_status_browser.py` | Expired login / unanswered blocked host -> Needs you; allowed -> back to the stage status. |
| `tests/integration/test_live_test_flow.py` | `FakeAdapter` replays `claude_live_test.jsonl` while a fake MCP client plays its calls against the endpoint with `FakeBrowser`: check row, evidence, events, coverage gets steps. |
| `tests/integration/test_secret_never_leaks.py` | After a full flow with a login, grep events, logs, the Context Pack, API responses and the agent prompt for a fake cookie value -> nothing. |
| `tests/api/test_browser_api.py` | Every endpoint and error code. |
| `tests/integration/test_real_browser.py` | **Marker `real_browser`, off by default.** One real headless Chromium in CI: open a static page, click, screenshot. |
| `desktop/src/components/task/LiveTestPanel.test.tsx` etc. | Steps appear on `browser.step`; See it work card; Log in again card. |

No unit test starts a real browser or a real agent.

## 15. How to test by hand

1. A small web app repo (for example a Vite + simple login app) with `[browser]` set, on Linux, macOS and Windows.
2. Run the FSD QA checklist (section 9).
3. On Windows, confirm Edge is used with no download. On a Linux VM without Chrome, install the kit.
4. Save a test login, run a UI task, check See it work and Open trace.
5. Record new fixtures only when a test needs a new shape; remove real hosts and cookies before committing.

## 16. Risks

| Risk | Mitigation |
|---|---|
| Playwright MCP or agent MCP flags change | Spike, pinned version, golden tests, recorded fixtures. |
| An agent cannot use an HTTP MCP server | Stdio bridge (Decision 4). |
| Snap Chromium refuses temp profiles in `/tmp` | Put the temp profile under the data folder; skip snap Chromium if the spike shows a problem. |
| Agent leaks session data through page scripts | Tool deny list; storage tools blocked; test with a fake cookie. |
| Flaky dev servers | Ready check, clear error with output, optional by default. |
| Big videos fill the disk | `EVIDENCE_MAX_MB`, cleanup with the worktree, spike S6. |
| Users without Node | Node in the kit (spike S1). |

## 17. Effort breakdown

| Task | Hours |
|---|---|
| Spike S1-S6 + ADR-003 | 2.5 |
| Finder, kit, `saarthi browser status / kit`, `/browser` | 2.5 |
| `[browser]` config, dev server, `saarthi devserver` | 2 |
| Browser host + MCP endpoint (forward, host guard, deny list, steps, screenshots, events) | 3.5 |
| `RunRequest.mcp_servers`, adapter `mcp_args()`, bridge if needed, fixtures | 1.5 |
| Live test side run, schema, check row, batch order, coverage input, fix loop | 2 |
| `e2e` kind + artifacts | 1 |
| Saved logins (CDP save, file mode, expiry, Needs you) | 2 |
| Evidence store, cap, cleanup, API, Open trace | 1 |
| UI: `settingsBrowser`, `loginSave`, `liveTest`, `evidence`, `loginExpired`, See it work card on `check` | 2.5 |
| Manual verification on 3 OSes | 0.5 |
| **Total** | **21** |

If M7's ports are not built yet: + ~2 h (M7 TDD Decision 9: `workspace/ports.py`, `tasks.port`, env vars).

## 18. What this milestone does not do

Live screencast, preview window, agent driving the preview window (M12); a bundled browser; Firefox or WebKit; production accounts; storing passwords; API recordings (F7.8); editing `[browser]` from Settings; re-running only the Live test; per-task choice of login.

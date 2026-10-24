# FSD — M11: Browser testing

**Document type:** Functional Specification Document (FSD)
**Milestone:** M11 of M0-M12 (built after M7; see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-23
**Updated:** 2026-10-23 - first version, from the Simple UI spec section 11 (B1-B9) and the Chromium-only update (B2, B2a)
**Estimated effort:** 21 hours (about 2 rough weeks at ~10 h/week). Starts with a ~2.5 h spike.
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M11_browser_testing.md`, `../../design/2026-10-23-simple-ui-design.md` (P6, section 11), `../../FUNCTIONAL_SPECIFICATIONS.md` (F7.5, F24, flow 6.7), `../../TDD-tech-design-doc.md` (4.6, 4.15), `../../decisions/ADR-003-browser-testing.md`, `../M4_checks_proof_card/FSD_M4_checks_proof_card.md`, `../M5_review_ship/FSD_M5_review_ship.md`, `../M7_race_mode/FSD_M7_race_mode.md` (ports, before), `../M12_live_preview/FSD_M12_live_preview.md` (after)
**Screens:** prototype views `settingsBrowser`, `loginSave`, `liveTest`, `evidence`, `loginExpired`, `check` (the See it work card) in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. What this document covers

M11 lets the agent **test the app live in a real browser**, once per build, and show the proof on Check and ship.

It covers these F-numbers:

- **F24.1** Browser on demand: Chromium only. System Chrome, then Edge, then Chromium, else a one-time browser kit download. Never in the installer.
- **F24.2** Project browser settings: `[browser]` in `project.toml`. Off by default.
- **F24.3** Dev server per task, on the task's own port, with a ready check.
- **F24.4** Live test: one more check after the required checks pass.
- **F24.5** `e2e` checks: the project's own E2E command, with artifacts.
- **F24.6** Saved logins of test accounts.
- **F24.7** Allowed hosts.
- **F7.5** Evidence, shown as **See it work** (was Later, now Must).

Screen words follow the Simple UI spec (section 5): E2E / browser check → **Live test**; Evidence → **See it work**; storageState → **Saved login**.

## 2. The goal in plain words

Today the agent says "the reset page works". I open a browser, start the dev server, log in, click through it, and check. Often I skip it.

At the end of M11:

1. I turn on browser testing for a web project in `project.toml`.
2. Saarthi uses the Chrome or Edge I already have. If I have none, it downloads a small browser kit once.
3. I save a login of my **test** account once, by hand.
4. After every build, when the checks pass, the agent opens the app in a real browser, logs in with that saved session, and walks through the UI parts of "What done looks like".
5. Check and ship shows "Live test · passed" and a **See it work** card: every step with a screenshot, a short video, and "Open trace".

## 3. Where this milestone sits

- **Needs (already built):**
  - M4: Check Runner, check results, the gate, the verdict, side runs, `RunRequest.output_schema`, coverage.
  - M5: Check and ship (what changed part), Done, worktree cleanup after 7 days.
  - M7: per-workspace ports (`SAARTHI_PORT`, `PORT`). If M7 is not built yet, M11 builds the port part (M7 TDD Decision 9).
  - M3: the task page, Settings, the stage → status function with `waiting_on_user`.
  - M8: the agent sandbox (network stays on).
- **M11 adds:** the `browser/` module, the browser kit, dev servers, the Live test, `e2e` checks, saved logins, evidence, and five screens.
- **Unlocks next:** M12 (watch the agent's browser live, preview window).

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Live test** | One more check. The agent opens the app in a browser and tries the UI parts of the goal. |
| **See it work** | The proof of a Live test or an `e2e` check: steps with screenshots, a short video, a trace. |
| **Trace** | A Playwright file (`trace.zip`) that replays every step: page, clicks, network. "Open trace" shows it. |
| **Browser kit** | Playwright's Chromium, downloaded once into the Saarthi data folder when no system Chrome, Edge or Chromium is found. |
| **Headless shell** | The smallest Chromium build. It has no window. Enough for Live tests. |
| **Dev server** | The project's own "run the app" command, for example `npm run dev`. |
| **Saved login** | The browser session (cookies + local storage) of a test account. Playwright calls it `storageState`. |
| **MCP server** | A small program that gives an agent tools. Playwright MCP gives "open page", "click", "type", "screenshot". |
| **Allowed hosts** | The only web addresses the agent's browser may open. |

## 5. Features

### 5.1 F24.1 Browser on demand

- **What:** Saarthi needs a Chromium browser for Live tests. It looks in this order: system **Google Chrome**, system **Microsoft Edge**, system **Chromium**. If none is found, Settings → Browser testing shows **Download browser kit**. The kit goes into the Saarthi data folder, once.
- **Why:** A browser is 100-200 MB. The installer must stay under 40 MB. Most people already have Chrome or Edge. Windows 10/11 always has Edge, so Windows usually needs no download.
- **Example:**
  ```
  $ saarthi browser status
  Browser     Google Chrome 131  /usr/bin/google-chrome   (system)
  Kit         not downloaded (not needed)
  Window      yes (can save logins)

  $ saarthi browser status            # a clean Linux box
  Browser     none found (Chrome, Edge, Chromium)
  Kit         not downloaded
  Fix         saarthi browser kit install

  $ saarthi browser kit install
  Downloading browser kit 1 (Playwright MCP + Chromium headless shell) ... done
  Saved to ~/.local/share/saarthi/browser-kit/1/
  ```
  In the UI: Settings → **Browser testing** (`settingsBrowser`) → "Using Google Chrome" or **Download browser kit**.
- **Rules:**
  - Chromium only, on every OS. No Firefox, no WebKit.
  - The kit has the **Chromium headless shell** (smallest, no window). The **full Chromium** is downloaded only when no system browser exists and I want a window: to save a login, or "Show the browser while it tests".
  - Nothing is downloaded without my click (or `saarthi browser kit install`).
  - The kit is pinned to one version (`BROWSER_KIT_VERSION`). `saarthi browser kit remove` deletes it.
  - Exact sizes and packaging are measured in the M11 spike. No size is promised here.
- **Acceptance criteria:**
  - With Chrome and Edge both installed, Chrome is used. With only Edge, Edge is used.
  - With no system browser, the Live test is "skipped: no browser" and shows the fix.
  - The installer size is the same as in M10.

### 5.2 F24.2 Project browser settings

- **What:** A project turns browser testing on with a `[browser]` table in `.saarthi/project.toml`.
  ```toml
  [browser]
  enabled = true
  base_url = "http://127.0.0.1:{port}"     # {port} = this task's port
  dev_server = "npm run dev -- --port {port}"
  allowed_hosts = ["127.0.0.1", "localhost"]
  live_test = "auto"                       # "auto" | "off"
  live_test_required = false
  login = "test-admin"                     # optional, a saved login name
  ```
- **Why:** Only web projects need it. Backend-only projects keep it off. The file is committed, so the whole team gets the same setup. No secret is in it.
- **Example:** Settings → Browser testing for `acme-web` shows: browser "Google Chrome 131", base URL `http://127.0.0.1:41010`, dev server `npm run dev -- --port 41010`, allowed hosts, Live test **Auto**, Required **No**, saved logins `test-admin`.
- **Rules:**
  - Off by default (`enabled = false`, or no `[browser]` table).
  - `project.toml` is the source of truth (M1). Settings shows the values and has **Open project.toml**; it does not write the file.
  - A wrong value (for example `live_test = "maybe"`) gives a clear error with the line number.
  - `login` holds only a name, never a session or a password.
- **Acceptance criteria:**
  - A project without `[browser]` never starts a dev server or a Live test.
  - `saarthi browser status --project acme-web` prints the same values as the Settings page.

### 5.3 F24.3 Dev server per task

- **What:** Before an `e2e` check or a Live test, Saarthi starts the project's `dev_server` in the task's own copy of the repo, on the task's own port. It waits until `base_url` answers.
- **Why:** The app must run from the task's code, not from `main`. Two tasks must not fight for port 3000.
- **Example:**
  ```
  $ saarthi devserver start T-0042
  Starting npm run dev -- --port 41010 in ~/.local/share/saarthi/worktrees/acme-web/T-0042
  Ready: http://127.0.0.1:41010 (4.2 s)

  $ saarthi devserver stop T-0042
  Stopped.
  ```
- **Rules:**
  - The port comes from M7 (`SAARTHI_PORT`, `PORT`). `{port}` in `base_url` and `dev_server` is replaced with it.
  - Ready = `base_url` answers with any status below 500, within `DEV_SERVER_READY_TIMEOUT_S`.
  - Not ready in time → the Live test and `e2e` checks are **error** "dev server did not start", with the last lines of its output.
  - The dev server is stopped when the checks end. Killing it kills its whole process tree.
  - The command runs without a shell (same rule as checks, M4).
- **Acceptance criteria:**
  - Two tasks of the same project run their dev servers at the same time on different ports.
  - A dev server that never answers ends as an error after the timeout, and no process is left running.

### 5.4 F24.4 Live test

- **What:** After the required checks pass, Saarthi starts the dev server and runs the **Live test**. The agent drives the browser through a browser MCP server (Playwright MCP). It walks the UI items of "What done looks like". Saarthi saves a screenshot after every step, a short video and a trace. The result is one more row in Tests and checks: "Live test".
- **Why:** Unit tests do not prove that a page works. A Live test does, and it leaves proof I can check in seconds.
- **Example:** T-0042 "Add a password reset page". What done looks like: (1) `/login` has a "Forgot password" link, (2) the reset form sends an email, (3) the API returns 202.
  ```
  $ saarthi checks T-0042
  tests      pass   41 s
  lint       pass    3 s
  Live test  pass   38 s   6 steps · items 1, 2 checked · item 3 not a UI item
  Verdict: Looks good

  $ saarthi evidence T-0042
  Live test · passed · 6 steps · video 0:31 · trace
   1  open  http://127.0.0.1:41010/login                 01-open.png
   2  click "Forgot password"                           02-click.png
   3  type 17 characters into "Email"                   03-type.png
   4  click "Send reset link"                           04-click.png
   5  see "Check your inbox"                            05-see.png
   6  open http://127.0.0.1:41010/login (back link)     06-open.png
  Folder: ~/.local/share/saarthi/evidence/T-0042/01JD.../
  ```
  In the UI: the task page shows the steps as they happen, each with a thumbnail (`liveTest`). Then Check and ship shows "Live test · passed" and the See it work card (`check`).
- **Rules:**
  - Runs only when `[browser] enabled = true`, `live_test = "auto"`, and every required check passed.
  - **Optional by default.** A failed optional Live test does not stop Review. It still shows on Check and ship, and its steps help the agent judge "What done looks like", so a broken UI item can become "Not met" (verdict "Take a look").
  - With `live_test_required = true` it is a **required** check: a fail sends the task to `Failed` ("Has problems"), and "Let Claude fix it" gets the failing steps.
  - The agent is the one that built the task. It may not change files during the Live test (read only); it can only use the browser.
  - Limits: `LIVE_TEST_MAX_STEPS` steps and `LIVE_TEST_TIMEOUT_S` seconds. Over a limit → error, evidence so far is kept.
  - No UI items in the goal → "skipped: no UI items".
  - The browser has no window by default. Setting "Show the browser while it tests" (Settings → Browser testing) opens a window.
  - Each Live test gets a fresh, empty browser profile. It is deleted after the run.
- **Acceptance criteria:**
  - A build with green checks on a project with `[browser] enabled = true` gets a Live test row and evidence.
  - With `live_test_required = true`, a failed Live test moves the task to `Failed`; with `false`, the task reaches `Review`.
  - A required check that fails means no Live test runs.

### 5.5 F24.5 `e2e` checks

- **What:** The project's own E2E tests are a normal check with `kind = "e2e"`. Saarthi starts the dev server first, gives the tests the URL, and copies their screenshots, videos and traces into See it work.
- **Why:** Some projects already have Playwright or pytest E2E tests. They are better than a Live test when they exist. Saarthi only runs them in the right place.
- **Example:**
  ```toml
  [[checks]]
  name = "e2e"
  cmd = "npx playwright test"
  kind = "e2e"
  required = false
  timeout_sec = 900
  artifacts = ["test-results/**", "playwright-report/**"]
  ```
  ```
  e2e  fail  2m 10s   2 failed · 3 artifacts (screenshot, video, trace)
  ```
- **Rules:**
  - The check gets `SAARTHI_BASE_URL` and the port env vars.
  - Default artifact folders: `E2E_DEFAULT_ARTIFACT_GLOBS`. The project can set its own `artifacts`.
  - The project's own tests use their own browsers. Saarthi does not install them.
- **Acceptance criteria:**
  - An `e2e` check runs after the dev server is ready, and its artifact files show in See it work.

### 5.6 F24.6 Saved logins

- **What:** **Save a login** (`loginSave`) opens a normal browser window on the project's `base_url`. I log in with a **test** account by hand. I click **I'm logged in**. Saarthi saves the session (cookies and local storage) under a name, for example `test-admin`. The Live test then starts already logged in.
- **Why:** Most apps need a login. An agent must never get a password, and it must not type one into a page.
- **Example:**
  ```
  $ saarthi browser login save test-admin --project acme-web
  Opening Google Chrome on http://127.0.0.1:41010 ...
  Use a TEST account only. Never a production account.
  Log in, then press Enter here.
  Saved login test-admin for 127.0.0.1 (owner-only file). The password was not saved.

  $ saarthi browser login list --project acme-web
  NAME        HOST        SAVED        LAST OK
  test-admin  127.0.0.1   2026-10-23   2026-10-23
  ```
  In the UI: Settings → Browser testing → **Save a login** → name → the browser opens → log in → **I'm logged in** → "Saved".
- **Rules:**
  - **Test accounts only.** The dialog and the CLI say so.
  - The session file lives in the data folder (`logins/<project>/<name>.json`), readable only by me. It is never in the repo, in events, in logs, in the Context Pack, or in any text the agent sees. The agent only gets "you are logged in as `test-admin`".
  - Saarthi never stores the password.
  - The Live test uses the login named in `[browser] login`. None → no login.
  - Saving needs a browser with a window: a system browser, or the kit's full Chromium.
  - If the app runs locally, Saarthi starts its dev server for the save, in the main checkout (or in a task's copy with `--task`), and stops it after. The session then works for every task, whatever its port.
  - **Expired:** if the session no longer works (its cookies ran out, or the agent ends up on a login page), the task shows a Needs-you card (`loginExpired`): "Your saved login test-admin expired. Log in again." One click opens the browser again. After that, "Run checks again".
  - `saarthi browser login remove test-admin` deletes the file.
- **Acceptance criteria:**
  - The session file has mode `600`. A search for a cookie value in the events, logs and the Context Pack finds nothing.
  - An expired login puts the task under **Needs you** with "Log in again"; logging in again takes it out.

### 5.7 F24.7 Allowed hosts

- **What:** The agent's browser only opens `base_url` and `allowed_hosts` (default `127.0.0.1`, `localhost`). Any other host is blocked, and a Needs-you card asks me.
- **Why:** The agent must not wander to other sites, or to a production system, with my test session.
- **Example:** During the Live test of T-0042, the page links to `https://accounts.example.com`. The step is blocked. The task page shows: "Claude wanted to open `accounts.example.com`. Allow it for this task? [Allow] [No]". Allow → "Run checks again".
  ```
  $ saarthi browser allow-host T-0042 accounts.example.com
  Allowed accounts.example.com for T-0042.
  ```
- **Rules:**
  - Allow counts for this task only. To allow it for every task, add it to `allowed_hosts` in `project.toml`.
  - Never use production accounts or production hosts.
- **Acceptance criteria:**
  - A navigation to a host not in the list is refused, saved as `browser.host_blocked`, and makes the task **Needs you**.

### 5.8 F7.5 See it work (evidence)

- **What:** A **See it work** card on Check and ship (`check`), and its full view (`evidence`): every step with its screenshot, the short video, and **Open trace**.
- **Why:** I trust a result faster when I see it. One look at the screenshots is enough for most tasks.
- **Example:** Check and ship of T-0042 → See it work: "6 steps · video 0:31" → click → the step list with screenshots, the video player, **Open trace** (opens the local Playwright trace viewer).
- **Rules:**
  - Kept with the task. Removed when the worktree is removed (7 days after ship, M5).
  - Size cap per check batch: `EVIDENCE_MAX_MB`. Over it, the video is dropped first, then the oldest screenshots, with a note.
  - Screenshots of login pages are kept, but never sent to the agent as text.
  - Typed text is never saved. A step says "type 17 characters into Email".
- **Acceptance criteria:**
  - After a Live test, `GET /tasks/{id}/evidence` lists the steps, screenshots, the video and the trace, and the UI shows them.
  - After the worktree cleanup, the evidence folder of that task is gone.

## 6. Main user flows

### 6.1 Live test with a login (core FSD flow 6.7)
1. Set `[browser]` in `acme-web`'s `project.toml`. Settings → Browser testing shows "Using Google Chrome".
2. **Save a login** `test-admin`, log in by hand with the test account, **I'm logged in**.
3. New task "Add a password reset page" → Start. Claude builds. Tests and lint pass.
4. The Live test starts. The task page shows the steps with thumbnails.
5. Check and ship: "Looks good", "Live test · passed", See it work. Approve and create pull request.

### 6.2 Login expired
1. Weeks later, a Live test finds the login page instead of the app.
2. The task is under **Needs you**: "Your saved login test-admin expired. Log in again."
3. Click it, log in again, **I'm logged in**, then **Run checks again**.

### 6.3 No browser on the machine
1. Fresh Linux box, no Chrome. The Live test row says "skipped: no browser".
2. Settings → Browser testing → **Download browser kit**. Next build has a Live test.

## 7. Done when

- [ ] The spike results (kit packaging, MCP flags per agent, `storageState`, video size) are written in `ADR-003`.
- [ ] A real UI task in a web project gets a Live test after green checks, with See it work on Check and ship.
- [ ] The agent logs in through a saved test login without ever seeing the session or a password (test proves it).
- [ ] A host outside `allowed_hosts` is blocked and shows a Needs-you card.
- [ ] An expired login shows "Log in again".
- [ ] An `e2e` check runs against the task's dev server, and its artifacts show in See it work.
- [ ] The installer size does not change.
- [ ] No unit test starts a real browser or calls a real agent.
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run pyright` pass.

## 8. Not in M11

| Item | Owner |
|---|---|
| Watch the agent's browser live in the task page | M12 (F25.1) |
| Preview window for the task's app; agent drives it | M12 (F25.2, F25.3) |
| A browser in the installer | Not planned (B1) |
| Firefox or WebKit Live tests | Not planned (B2) |
| Production accounts or hosts | Not planned |
| Storing passwords, typing passwords by the agent | Not planned |
| API call recordings (F7.8) | Later |
| Editing `[browser]` from the Settings page | Later (open question 2) |
| Re-running only the Live test | Not planned (M4: no subset of checks) |

## 9. QA checklist

1. No `[browser]` → `saarthi checks` runs no dev server and no Live test.
2. `saarthi browser status` with Chrome + Edge → Chrome. Remove Chrome (or point the search at a fake path) → Edge.
3. No system browser → Live test "skipped: no browser"; `saarthi browser kit install` → next run works.
4. `saarthi devserver start` on two tasks → two ports, both ready.
5. A dev server that never answers → error after the timeout; `ps` shows nothing left.
6. Save a login `test-admin`; `stat` on the file shows `600`; `grep` a cookie value in the data folder logs and events → nothing.
7. Build a UI task → Live test passes → See it work shows steps, screenshots, video, trace; Open trace works.
8. Set `live_test_required = true` and break the page → task goes to `Failed`.
9. Link to another host on the page → blocked, Needs-you card; Allow → Run checks again → passes.
10. Delete the session cookies server-side → "Log in again" card.
11. Add an `e2e` check → its artifacts show in See it work.
12. Ship and run the cleanup → the evidence folder is gone.

## 10. Open questions

1. **Kit packaging** (spike): one archive for all parts, or one download per part (MCP server + Node, headless shell, full Chromium)? How to check its checksum?
2. **Edit `[browser]` in Settings?** `project.toml` is the source of truth (M1), so v1 shows the values and opens the file. The prototype may show toggles for Auto / Off and Required. OK to keep it read only?
3. **Which login?** v1 uses one login per project (`[browser] login`). Do some tasks need a different one (admin vs viewer)?
4. **Video size and length** (spike): what keeps See it work useful under `EVIDENCE_MAX_MB`?
5. **Snap Chromium on Ubuntu** may refuse a temp profile outside `$HOME`. Skip it in the finder if the spike shows a problem?
6. **Where to run the app for Save a login?** v1 uses the main checkout by default (a dev server may write ignored cache files there), or a task's copy with `--task`. OK?
7. If 21 hours is not enough, cut first: "Show the browser while it tests", then `saarthi browser allow-host` (keep the Needs-you card).

## 11. Effort

About **21 hours**. See TDD section 17 for the breakdown.

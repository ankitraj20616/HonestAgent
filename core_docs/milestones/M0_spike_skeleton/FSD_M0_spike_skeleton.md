# FSD — M0: Spike + Skeleton

**Document type:** Functional Specification Document (FSD)
**Milestone:** M0 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`), new Spike 6: the window and a daemon stub start on Linux, macOS and Windows (CI matrix)
**Estimated effort:** ~11 hours (1 week at 8-10 h/week; +1 h for Spike 6, cross-platform start)
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M0_spike_skeleton.md`, `../M1_daemon_core_cli/FSD_M1_daemon_core_cli.md`, `../../FUNCTIONAL_SPECIFICATIONS.md`, `../../TDD-tech-design-doc.md` (section 16), `../../TECH_STACK.md` (sections 3-4)
**Screens:** prototype view `cli` in `core_docs/design/Saarthi Prototype.html#cli` (full list in `core_docs/design/README.md`). M0 has no product screen; the spike page is throwaway.

---

## 1. What this document covers

M0 builds **no product feature**. It is a set of short experiments ("spikes") plus an empty repo layout.

It covers:

1. The repo skeleton (`daemon/`, `desktop/`, `scripts/` folders).
2. Six spikes: Claude stream, Codex stream, PTY terminal, Tauri window, git worktree + checkpoint, and cross-platform start (Linux, macOS, Windows).
3. At least 6 recorded agent streams (fixtures) that every later test will replay.
4. One decision record: `core_docs/decisions/ADR-001-agent-integration.md`.

Spike code is throwaway. Fixtures and the ADR are kept forever.

---

## 2. The goal in plain words

Before we spend 15 weeks building, we want to know that the risky parts really work on this machine:

- Can Python start `claude` and `codex`, read every event, and send a follow-up?
- Can we tell when an agent is **waiting for us** ("Needs You")?
- Can a Tauri window on Linux show a live, smooth terminal?
- Do the Tauri window and a small Python service also build and start on macOS and Windows? (Saarthi is one app for all three.)
- Can we make a git checkpoint without touching the task branch?

**What I can use at the end:** a Tauri window that shows a real `claude` session in a live terminal, a folder of real agent recordings, and a written answer to each open technical question.

---

## 3. Where this milestone sits

| Before | This | Next |
|---|---|---|
| Core docs only (FSD, TDD, TECH_STACK, MILESTONES) | **M0** - prove the unknowns, record fixtures | **M1** - daemon core + CLI (no agents yet) |

What M0 unlocks:

- **M1** gets the repo layout to build in.
- **M2** gets the fixtures (for `FakeAdapter` and mapping tests) and the ADR (how to drive each agent, how to detect "needs input").
- **M3** gets proof that xterm.js + CodeMirror run well in Tauri (or a decision to use plan B).
- **M2 / M8** get a tested checkpoint recipe.
- **M9** gets a first Linux / macOS / Windows CI matrix to grow into the release build.

---

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Spike** | A small, quick experiment to answer one question. Code is thrown away after. |
| **Fixture** | A saved file with real agent output. Tests replay it instead of calling the real agent. |
| **Stream (JSONL)** | The agent prints one JSON object per line while it works. We read them one by one. |
| **Needs input** | The agent stops and waits for an answer or a permission from the user. |
| **PTY** | A "pseudo terminal". It makes a program think it runs in a real terminal window. |
| **WebView** | The browser engine Tauri uses to draw the UI: WebKitGTK on Linux, WKWebView on macOS, WebView2 on Windows. |
| **CI matrix** | One GitHub Actions job that runs the same steps on Linux, macOS and Windows machines. |
| **Worktree** | A second working folder of the same git repo, on its own branch. |
| **Checkpoint** | A hidden git commit that saves the state of the folder, without changing the branch. |
| **ADR** | "Architecture Decision Record". A short file that says what we decided and why. |

---

## 5. Spikes and deliverables

### 5.1 Repo skeleton

- **What:** Create the folder layout from TECH_STACK section 4: `daemon/`, `desktop/`, `scripts/`, plus `daemon/tests/fixtures/agents/`.
- **Why:** M1 starts coding on day one without arguing about folders.
- **Example:** `ls` in the repo shows `AGENTS.md  CLAUDE.md  core_docs/  daemon/  desktop/  scripts/`.
- **Rules:** `CLAUDE.md` and `AGENTS.md` already exist; do not rewrite them. No Python package setup yet (that is M1). `desktop/` is a real Tauri 2 + React + TypeScript app, because Spike 4 needs it.
- **Acceptance criteria:**
  - Folder tree matches TECH_STACK section 4 (empty folders hold a `.gitkeep`).
  - `cd desktop && npm install && npm run tauri dev` opens a window.

### 5.2 Spike 1 - Claude stream

- **What:** A Python script runs `claude -p --output-format stream-json --input-format stream-json --verbose` in a fresh temp git repo, sends a prompt through stdin, and prints every event line.
- **Why:** This is how M2's `ClaudeAdapter` will talk to Claude. We must see the real event shapes before we design the mapping.
- **Example:**
  ```
  $ uv run scripts/spikes/spike_claude.py --scenario build_ok \
      --prompt "Add a function add(a, b) to calc.py with a test"
  [0001] system/init      session_id=6f1c...
  [0002] assistant/text   "I'll add the function..."
  [0003] assistant/tool_use Edit calc.py
  [0004] user/tool_result ok
  ...
  [0019] result/success   cost=$0.04 turns=6
  saved daemon/tests/fixtures/agents/claude_build_ok.jsonl (19 lines)
  ```
- **Rules:** Run only in a temp repo, never in a real project. Record raw lines exactly as printed.
- **Acceptance criteria:**
  - 3 Claude fixtures saved: a simple edit, a run that needs input (question or permission), a run that fails.
  - We know what a question / permission request looks like in the stream (written in the ADR).
  - `--resume <session-id>` tested: a second message continues the same session.

### 5.3 Spike 2 - Codex stream

- **What:** Same as Spike 1 with `codex exec --json -C <dir> "<prompt>"`.
- **Why:** M2's `CodexAdapter` and M5's Second Opinion depend on it.
- **Example:**
  ```
  $ uv run scripts/spikes/spike_codex.py --scenario build_ok --prompt "..."
  [0001] thread.started    thread_id=0199...
  [0002] item.completed    agent_message "I will add..."
  ...
  saved daemon/tests/fixtures/agents/codex_build_ok.jsonl (14 lines)
  ```
- **Rules:** Same as Spike 1.
- **Acceptance criteria:**
  - 3 Codex fixtures saved (edit, needs input / ends with a question, fail).
  - `codex exec resume <id> "<answer>"` tested.
  - `--output-schema` tested with a small findings schema; output saved as a fixture.
  - `codex review` tried once; result noted in the ADR.

### 5.4 Spike 3 - PTY to WebSocket

- **What:** A Python script starts interactive `claude` in a PTY and pipes its bytes to and from a WebSocket.
- **Why:** The raw Terminal view (F5.5, M3: task page → More → Terminal) and the `PtyShellAdapter` (M2) need this.
- **Example:** `uv run scripts/spikes/spike_pty_ws.py --cmd claude --port 7879` then a browser page or the Tauri window connects and you can type into Claude.
- **Rules:** Bind to `127.0.0.1` only. Window resize must reach the PTY.
- **Acceptance criteria:** typing, colours, and resize work; closing the socket stops the process.

### 5.5 Spike 4 - Tauri window

- **What:** The `desktop/` app shows one page with an xterm.js terminal (connected to Spike 3) and a CodeMirror 6 viewer.
- **Why:** Answers "does WebKitGTK on Linux (Ubuntu 24.04) run this smoothly?" (TDD 16, Q4). WebKitGTK is the slowest of the three WebViews, so Linux is the hard test.
- **Example:** `npm run tauri dev` -> a window with Claude running live on the left and `calc.py` open in CodeMirror on the right.
- **Rules:** Spike code lives in `desktop/src/spike/`. M3 deletes it.
- **Acceptance criteria:** see the smoothness checks in the TDD (flood output, typing, big file scroll). Result written in the ADR.

### 5.6 Spike 5 - Worktree + checkpoint

- **What:** A Python script creates a worktree and a branch, changes files, makes a checkpoint with a temp index (TDD 4.5.1), restores it to a scratch folder, and removes the worktree.
- **Why:** M2 makes a checkpoint after every run; M8 rewinds. The recipe must be safe.
- **Example:** `uv run scripts/spikes/spike_worktree.py` prints each git command and `OK: branch unchanged, checkpoint has 3 files (1 untracked)`.
- **Rules:** git through subprocess with a list of args (CLAUDE.md rule 6).
- **Acceptance criteria:** the checkpoint holds tracked and untracked files; the branch head and the real index are not changed.

### 5.7 Spike 6 - Cross-platform start

- **What:** One GitHub Actions workflow with a matrix of Linux, macOS and Windows. On each machine it builds the `desktop/` app, starts a tiny Python service (a stand-in for the daemon) with `uv`, and starts the app in a "smoke" mode. The spike page asks the service for `/health` and the app closes itself with exit code 0.
- **Why:** Saarthi is one app for Linux, macOS and Windows (spec rule P3). We must learn early if the build chain, the WebView, or starting a Python process breaks on one OS, before M1-M3 build on top.
- **Example:** push to the spike branch -> the "spike-cross-platform" job shows 3 green runs: `ubuntu-24.04`, `macos-14`, `windows-2022`. Each log ends with `OK: window opened, /health answered in 0.4 s`.
- **Rules:** The stand-in service binds to `127.0.0.1` only. No real agent runs in CI. The Linux run uses a virtual display (`xvfb-run`).
- **Acceptance criteria:**
  - The workflow is green on Linux, macOS and Windows.
  - On each OS, the app opens and gets an answer from the stand-in service's `/health`.
  - The ADR notes, per OS: the build size of the app, the time from start to first page, and any setup step needed (for example WebView2 on Windows).

### 5.8 ADR-001

- **What:** `core_docs/decisions/ADR-001-agent-integration.md` with the answers from all spikes.
- **Why:** M2 and M3 build from this file, not from memory.
- **Acceptance criteria:** every question in TDD section 16 has an answer or a written workaround.

---

## 6. Main flow (one spike session)

1. Create a temp git repo (the script does it).
2. Run the spike script with a scenario name.
3. Watch the printed events.
4. If the run is a good example, keep the recording; else delete and re-run.
5. Open the recording, check that no secret or private path is inside.
6. Write what you learned in the ADR draft.

---

## 7. Done when

- [ ] `daemon/tests/fixtures/agents/` has **6 or more** `.jsonl` recordings: at least `claude_build_ok`, `claude_needs_input`, `claude_fail`, `codex_build_ok`, `codex_needs_input`, `codex_fail`. Each has a `.meta.json` next to it.
- [ ] The ADR says how to detect "needs input" for Claude and for Codex - or gives a written workaround for each.
- [ ] A Tauri window shows a live terminal running `claude`, and I can type into it.
- [ ] The cross-platform workflow (Spike 6) is green on Linux, macOS and Windows.
- [ ] ADR-001 answers TDD section 16 questions 1-5.

---

## 8. Out of scope

| Item | Owner |
|---|---|
| Python package setup (`pyproject.toml`, ruff, pyright, pytest) | M1 |
| Any database, API, or CLI command | M1 |
| `AgentAdapter`, `FakeAdapter`, event mapping code | M2 |
| Real Workspace Manager | M2 |
| Real UI screens, API client | M3 |
| History and Restore (rewind) | M8 |
| Secret masking code | M8 (fixtures are cleaned by hand in M0) |

---

## 9. QA checklist

1. `ls daemon/tests/fixtures/agents/*.jsonl | wc -l` prints 6 or more.
2. Every `.jsonl` has a matching `.meta.json`.
3. `grep -rn "$HOME" daemon/tests/fixtures/agents/` prints nothing.
4. `grep -rniE "api[_-]?key|token|secret" daemon/tests/fixtures/agents/` - every hit is checked by hand and is harmless.
5. Each `.jsonl` line is valid JSON: `for f in daemon/tests/fixtures/agents/*.jsonl; do python3 -c "import json,sys;[json.loads(l) for l in open(sys.argv[1])]" "$f"; done` prints no error.
6. `cd desktop && npm run tauri dev` opens the window; the terminal shows Claude; typing works.
7. Resize the window; Claude's layout follows.
8. `uv run scripts/spikes/spike_worktree.py` ends with `OK`.
9. `core_docs/decisions/ADR-001-agent-integration.md` exists and has a section for each TDD 16 question.
10. The "spike-cross-platform" GitHub Actions run shows 3 green jobs (Linux, macOS, Windows).

---

## 10. Open questions

These are the questions M0 must answer (core TDD section 16). The TDD says how each one is tested.

1. How does Claude show a question or a permission request in `stream-json`? How do we detect "needs input"?
2. Can `codex exec` ask mid-run, or does it only finish? If it only finishes, "Needs You" for Codex = the run ends with a question, and we resume with the answer.
3. Is `codex app-server` stable enough to use instead of `exec`?
4. Does Tauri 2 (WebKitGTK, Ubuntu 24.04) run xterm.js and CodeMirror smoothly? Plan B: open the UI in a normal browser at `http://127.0.0.1:7878`. Spike 6 also checks that the window starts on macOS and Windows.
5. Can agent processes survive a daemon restart, or do we accept "interrupted + resume"?

New questions for the owner:

6. Are we OK to commit real agent recordings to the repo after a manual clean-up? (Assumed yes; they come from a throwaway temp repo.)
7. Agent fixtures are recorded on Linux only. We assume Claude and Codex print the same stream on macOS and Windows. (Assumed yes; M2 re-checks the PTY on Windows.)

---

## 11. Effort

About **11 hours** (10 + 1 for Spike 6). See the TDD section 17 for the breakdown.

# TDD — M0: Spike + Skeleton

**Document type:** Technical Design Document (TDD)
**Milestone:** M0 of M0-M12 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`), Decision 7: cross-platform start spike in a CI matrix
**Estimated effort:** ~11 hours (1 week at 8-10 h/week; +1 h for Spike 6, cross-platform start)
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `FSD_M0_spike_skeleton.md`, `../M1_daemon_core_cli/TDD_M1_daemon_core_cli.md`, `../../TDD-tech-design-doc.md` (sections 4.4, 4.5.1, 13, 16), `../../TECH_STACK.md` (sections 3-4)
**Screens:** prototype view `cli` in `core_docs/design/Saarthi Prototype.html#cli` (full list in `core_docs/design/README.md`). M0 has no product screen.

---

## 1. The goal in one sentence

Prove we can drive Claude and Codex from Python and show a live terminal in Tauri, prove the window and a Python service start on Linux, macOS and Windows, and leave behind real fixtures plus ADR-001 so M2 and M3 build on facts, not guesses.

---

## 2. Read this first — rules this work must not break

1. **Git: subprocess with a list of args** (CLAUDE.md rule 6). Even in spikes. This is the habit M2 copies.
2. **Never call real agents in tests** (rule 8). The fixtures recorded here are *why* tests never need real agents. Spikes are not tests; they run by hand only.
3. **Unknown agent lines are never dropped** (rule 4). The recorder saves every stdout line, even lines that are not JSON.
4. **Do not build "Later" or later-milestone things** (rule 10). No adapter classes, no DB, no API.
5. Agents only run inside a temp repo made by the script. Never inside this repo or a client repo.

---

## 3. What already exists

| Thing | Where |
|---|---|
| Rules for agents | `CLAUDE.md`, `AGENTS.md` (repo root) |
| Core docs | `core_docs/*.md` |
| Installed tools (checked 2026-10-11) | `claude` 2.1.x, `codex` 0.152.x, `git`, `uv`, Node 20 |

Nothing else. No code yet.

---

## 4. Technical decisions

### Decision 1 — Spike scripts are standalone `uv` scripts in `scripts/spikes/` **(new)**

Each spike is one Python file with PEP 723 inline metadata (`# /// script` block listing its deps). Run with `uv run scripts/spikes/<name>.py`.

**Why:** spikes must not depend on the daemon package (it does not exist until M1), and must not add deps to it. When M2 is done, the folder can be deleted without touching anything.

### Decision 2 — Fixtures live in `daemon/tests/fixtures/agents/`

TECH_STACK section 4 puts them under `daemon/tests/`. MILESTONES says `tests/fixtures/agents/`; that path is relative to `daemon/`. Same folder.

**Why:** pytest in `daemon/` finds them with a short relative path.

### Decision 3 — Fixture format: raw stdout JSONL + a small `.meta.json` sidecar **(new)**

- `<agent>_<scenario>.jsonl` — every stdout line of the agent, **byte for byte**, one per line, in order. Nothing added, nothing removed (except path clean-up, Decision 4). Non-JSON lines are kept as they are.
- `<agent>_<scenario>.meta.json` — what produced it:

```json
{
  "agent": "claude",
  "agent_version": "2.1.296",
  "scenario": "needs_input",
  "recorded_at": "2026-10-12T09:14:03Z",
  "argv": ["claude", "-p", "--output-format", "stream-json", "--input-format", "stream-json", "--verbose"],
  "stdin_lines": ["{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"...\"}}"],
  "prompt": "Delete the tests folder",
  "exit_code": 0,
  "duration_sec": 21.4,
  "stderr_tail": [],
  "expect": { "needs_input": true, "final": "success" },
  "notes": "Permission request appears at line 7."
}
```

**Why:** the `.jsonl` must stay a pure replay of what the agent printed, so `FakeAdapter` (M2) can stream it line by line. Everything about *how* it was made goes in the sidecar. The `expect` block tells M2 mapping tests what the fixture should produce.

Naming (scenario names are fixed so M2 tests can find them):

| File | Scenario |
|---|---|
| `claude_build_ok.jsonl` | small edit + test, ends with success |
| `claude_needs_input.jsonl` | a question or permission request |
| `claude_fail.jsonl` | run ends in error (bad flag, max turns, or tool error) |
| `claude_resume.jsonl` | second turn of `--resume` on the `build_ok` session |
| `codex_build_ok.jsonl` | small edit, ends with `turn.completed` |
| `codex_needs_input.jsonl` | run that ends with a question (or a mid-run approval, if one exists) |
| `codex_fail.jsonl` | run that fails |
| `codex_resume.jsonl` | `codex exec resume <id> "<answer>"` |
| `codex_review_schema.jsonl` | `--output-schema` with `review_findings.schema.json` |

Minimum to finish M0: the first three of each agent (6 files). The rest are nice to have.

### Decision 4 — Fixtures are cleaned before commit **(new)**

The recorder replaces the temp repo path with `<WORKDIR>` and `$HOME` with `<HOME>` in every line. Then a manual read-through checks for anything private.

**Why:** fixtures are committed. Real secret masking is M8. A temp repo with a toy file has no secrets, but home paths and usernames would leak. M2's `FakeAdapter` gets a `workdir` argument and puts the real path back.

### Decision 5 — The Tauri spike is built inside the real `desktop/` app **(new)**

Scaffold `desktop/` with `npm create tauri-app@latest` (React + TypeScript + Vite). The spike page lives in `desktop/src/spike/`. M3 deletes that folder.

**Why:** the real unknowns are the Linux build chain (Rust, `webkit2gtk-4.1` dev packages) and WebKitGTK speed. A separate throwaway app would prove less and cost the same.

### Decision 6 — PTY spike speaks a tiny WebSocket protocol **(new)**

- Binary frames = raw terminal bytes, both ways.
- Text frames = JSON control messages. Only one in M0: `{"type": "resize", "cols": 120, "rows": 40}`.

**Why:** this is the protocol M2's `PtyShellAdapter` and M3's Terminal view (task page → More → Terminal) will likely keep. Recorded in the ADR as a proposal, not a final contract.

### Decision 7 — A CI matrix proves the window and a daemon stub start on all 3 OSes **(new)**

`.github/workflows/spike-cross-platform.yml` runs on `ubuntu-24.04`, `macos-14` and `windows-2022`. Each job:

1. Installs Rust, Node and `uv` (and the `webkit2gtk-4.1` packages plus `xvfb` on Linux).
2. Runs `npm ci && npm run tauri build -- --debug` in `desktop/`.
3. Starts `uv run scripts/spikes/spike_hello_daemon.py` in the background: FastAPI on `127.0.0.1:7879` with one route, `GET /health` -> `{"ok": true, "os": "<platform>"}`.
4. Starts the built app with `SAARTHI_SPIKE_SMOKE=1` (on Linux under `xvfb-run`). In smoke mode the spike page fetches `/health`, prints `OK: window opened, /health answered in <n> s` and the app exits with code 0 (Tauri `process` plugin). A 60 s timeout fails the job.
5. Prints the size of the built app bundle.

**Why:** Saarthi ships one app for Linux, macOS and Windows (simple UI spec P3, P4). The Linux build chain and WebKitGTK speed are tested by hand in Spike 4; Spike 6 only checks that the same code builds, opens and reaches a local Python service on the other two OSes. A stub is enough because the daemon does not exist until M1. The PTY spike stays Linux-only (`pty`, `fcntl`, `termios`); Windows ConPTY is M2's job.

---

## 5. Modules and files

```
saarthi/
├── daemon/
│   ├── src/saarthi/.gitkeep                 # M1 fills this
│   └── tests/fixtures/agents/               # recordings (Decision 3)
├── desktop/                                 # Tauri 2 + React + TS scaffold
│   ├── src-tauri/
│   └── src/spike/
│       ├── SpikePage.tsx                    # two panes: terminal | code
│       ├── TerminalSpike.tsx                # xterm.js + fit addon -> ws://127.0.0.1:7879
│       ├── CodeSpike.tsx                    # CodeMirror 6, read-only, big file
│       └── SmokeCheck.ts                    # SAARTHI_SPIKE_SMOKE=1: fetch /health, print OK, exit 0
├── scripts/spikes/
│   ├── _common.py                           # temp repo maker, recorder, path cleaner
│   ├── spike_claude.py                      # Spike 1
│   ├── spike_codex.py                       # Spike 2
│   ├── spike_pty_ws.py                      # Spike 3
│   ├── spike_worktree.py                    # Spike 5
│   ├── spike_detach.py                      # TDD 16 Q5 (process survival)
│   ├── spike_hello_daemon.py                # Spike 6: stand-in service with GET /health
│   └── review_findings.schema.json          # small schema for --output-schema
├── .github/workflows/spike-cross-platform.yml   # Spike 6 (Decision 7)
└── core_docs/decisions/ADR-001-agent-integration.md
```

Script details:

- **`_common.py`**
  - `make_temp_repo() -> Path`: `git init`, add `calc.py` + `test_calc.py`, first commit. Uses `subprocess.run([...], check=True)`.
  - `Recorder(agent, scenario)`: writes each stdout line to `.jsonl`, writes `.meta.json` at the end, applies Decision 4.
  - `--record` flag: without it, the script only prints (so bad runs do not overwrite good fixtures).
- **`spike_claude.py`** — options: `--scenario`, `--prompt`, `--resume <session_id>`, `--permission-mode <mode>`, `--record`. Starts the process with `asyncio.create_subprocess_exec`, writes the prompt as one stream-json user message to stdin, reads stdout line by line, prints `[nnnn] <type>/<subtype> <short summary>`. Keeps stdin open so a follow-up can be typed (tests `--input-format stream-json` mid-run).
- **`spike_codex.py`** — options: `--scenario`, `--prompt`, `--resume <id>`, `--sandbox`, `--output-schema`, `--review`, `--record`. Runs `codex exec --json -C <repo> ...` (or `codex exec resume`, or `codex exec review`).
- **`spike_pty_ws.py`** — FastAPI + uvicorn on `127.0.0.1:<port>` (default 7879, not 7878 so it never clashes with the daemon). `pty.openpty()`, child started with `start_new_session=True`, `os.read` on the master fd via `loop.add_reader`. Resize with `fcntl.ioctl(fd, termios.TIOCSWINSZ, ...)`. Socket close -> SIGTERM the process group.
- **`spike_worktree.py`** — runs the steps in section 9.3 and asserts each result.
- **`spike_detach.py`** — see Q5 in section 9.4.

---

## 6. Data model changes

None.

## 7. Events added

None. The ADR includes a **draft** mapping table from raw agent lines to core TDD 6.2 types (`agent.message`, `agent.tool_call`, `agent.needs_input`, ...). M2 owns the final mapping.

## 8. API and CLI added

None. Only spike scripts (section 5).

---

## 9. Key flows and how each TDD 16 question is answered

### 9.1 Record a Claude fixture
1. `make_temp_repo()`.
2. Start `claude -p --output-format stream-json --input-format stream-json --verbose` with `cwd=<repo>`.
3. Write `{"type":"user","message":{"role":"user","content":"<prompt>"}}` + newline to stdin.
4. Read and print lines until the `result` line, then close stdin and wait for exit.
5. With `--record`: save `.jsonl` + `.meta.json`.

### 9.2 Record a Codex fixture
Same, with `codex exec --json -C <repo> "<prompt>"` (no stdin needed). For resume: read `thread_id` from the first line, then `codex exec resume <thread_id> "<answer>"`.

### 9.3 Worktree + checkpoint recipe (Spike 5)
1. `git worktree add <tmp>/wt/T-0001 -b saarthi/T-0001-demo main`.
2. Edit one tracked file, add one new file.
3. `GIT_INDEX_FILE=<tmp>/idx git read-tree HEAD`, then `git add -A`, then `git write-tree` -> tree id.
4. `git commit-tree <tree> -p HEAD -m "checkpoint 1"` -> commit id.
5. `git update-ref refs/saarthi/checkpoints/T-0001/1 <commit>`.
6. Assert: branch head unchanged; `git status --porcelain` same as before step 3; checkpoint tree lists the new file.
7. Restore check: `git archive <commit> | tar -x -C <tmp>/restore` has both files.
8. `git worktree remove --force <tmp>/wt/T-0001`; branch still exists.

Also time steps 3-5 on a big repo (copy of a client repo) and write the number in the ADR.

### 9.4 How each open question is answered

| # | Question (core TDD 16) | How we test it | Decision rule for the ADR |
|---|---|---|---|
| Q1 | How does Claude show a question / permission request? | (a) Prompt that needs a blocked tool, `--permission-mode default`: look for permission denials in tool results and in the final `result` line. (b) Try `--permission-prompts host` (Claude 2.1.x): check if prompts arrive as control messages on stdout and can be answered on stdin. (c) Prompt that makes Claude ask a question: check whether it uses an ask-user tool or just ends with a question. | Prefer a structured signal (b) if it works. Else: denial in result -> "needs permission", run ends; answer = resume with the permission granted. Write the exact JSON shapes. |
| Q2 | Can `codex exec` ask mid-run? | Prompt that needs a decision, with `--sandbox read-only` and a write task. Watch for approval items mid-stream vs the run just ending. | If it only ends: "Needs You" for Codex = run ends and the last `agent_message` is a question. Detection rule written in the ADR (for example, a marker line we ask for in the prompt). Answer = `codex exec resume`. |
| Q3 | Is `codex app-server` usable? | Time-box 1 hour: start it, send the init JSON-RPC call, run one turn, look for approval requests. | Use `exec` for v1 unless app-server gives a clear "needs input" signal **and** works first try. Note it as "Later" either way. |
| Q4 | Is WebKitGTK smooth enough? | In the Tauri window: (1) `cat` a 10 MB log in the terminal, (2) type for 1 minute in Claude, (3) scroll a 5,000-line file in CodeMirror, (4) try xterm.js WebGL renderer, fall back to canvas/DOM. | "Smooth" = typing has no visible lag, the window never freezes more than 2 s, scrolling is fluid. Else plan B: browser UI at `http://127.0.0.1:7878`. Note any env flags needed (for example `WEBKIT_DISABLE_DMABUF_RENDERER=1`). |
| Q5 | Can agent processes survive a daemon restart? | `spike_detach.py`: start a long `claude` run with `start_new_session=True` and stdout to a **file** (not a pipe), kill the parent, check the child keeps writing; then start a new parent that tails the file. Repeat with a pipe to show it breaks. | If file-based survival is simple and reliable, note it as an option for M8/M9 (`KillMode=process`). For v1 default: accept "interrupted + resume" (core flow 8.6, built in M2). |

Plus from MILESTONES: `--output-schema` result shape, and what `codex exec review` prints (one run, saved if useful).

---

## 10. Config added

None in the product. Spike scripts take everything (port, prompt, paths) as CLI options with defaults in the script.

## 11. Error handling

| Case | What we do |
|---|---|
| Agent not logged in | Script prints the stderr and the login command; nothing is recorded. |
| Run hangs | `--timeout` (default 300 s), then SIGTERM the process group. Not recorded. |
| Non-JSON stdout line | Printed as `[nnnn] RAW ...` and kept in the recording. |
| Tauri build fails (missing system libs) | Write the `apt install` line needed in the ADR "Setup" section. |
| Spike 6 fails on macOS or Windows only | Write the OS, the failing step and the error in the ADR "Open items". M1 does not start until the owner decides: fix now, or note it for M9. |

## 12. Tests to write

No pytest tests in M0 (no package yet). Each spike script ends with simple `assert`s and prints `OK`. The fixtures themselves are the test asset for M2: `tests/unit/test_claude_mapping.py`, `test_codex_mapping.py`, and `FakeAdapter` tests (all M2).

## 13. Manual verification

Follow the QA checklist in the FSD section 9.

---

## 14. Risks

| Risk | What we do |
|---|---|
| CLI output changes in a future version | `agent_version` in every `.meta.json`. M2 adds a health warning if the installed version is newer than the fixtures. |
| No clean "needs input" signal | The ADR documents a workaround (end-and-resume). Product still works, just less live. |
| WebKitGTK is slow | Plan B (browser UI) is cheap because the UI only talks HTTP + WebSocket. |
| Fixture leaks private data | Decision 4 + QA checklist steps 3-4. |
| A macOS or Windows break is found late | Spike 6 runs on every push to the spike branch; M9 turns the same matrix into the release build. |
| Spike code slowly becomes product code | Spikes are not imported anywhere. M2 deletes `scripts/spikes/`. M3 deletes `desktop/src/spike/`. |

---

## 15. ADR-001 outline

File: `core_docs/decisions/ADR-001-agent-integration.md`

1. **Status, date, context** — why we need this (link to TDD 4.4 and 16).
2. **Decision summary** — 5-8 bullets: commands we will use, how "needs input" is detected per agent, PTY protocol, checkpoint recipe, Tauri result.
3. **Claude** — exact command and flags; list of event types seen (with one sample line each); draft mapping to 6.2 types; needs-input detection; resume; permission flags that worked.
4. **Codex** — same as Claude, plus `--output-schema` and `codex exec review` notes, plus app-server result (Q3).
5. **PTY + WebSocket** — protocol (Decision 6), resize, shutdown.
6. **Tauri / WebKitGTK** — test results for Q4, system packages needed, renderer choice, plan B yes/no. Plus Spike 6 per OS: green or not, app size, time to first page, setup steps.
7. **Worktree + checkpoint** — final command list, timing on a big repo.
8. **Process survival (Q5)** — result and v1 choice.
9. **Fixture index** — table of every fixture with scenario, agent version, and what it shows.
10. **Consequences** — what M2 and M3 must do differently from the core TDD, if anything.
11. **Open items** — anything still unknown, with an owner milestone.

---

## 16. What this milestone does not do

No Python package, DB, API, CLI, adapter classes, real UI, rewind, or secret masking. See FSD section 8.

## 17. Effort breakdown

| Task | Hours |
|---|---|
| Repo skeleton + Tauri scaffold (incl. system packages) | 1.5 |
| Spike 1 - Claude (3-4 fixtures, resume, Q1) | 2.5 |
| Spike 2 - Codex (3-5 fixtures, resume, schema, review, Q2, Q3) | 2 |
| Spike 3 - PTY to WebSocket | 1 |
| Spike 4 - Tauri page + smoothness checks (Q4) | 1.5 |
| Spike 5 - Worktree + checkpoint, plus Q5 detach test | 1 |
| Spike 6 - cross-platform CI matrix (Decision 7) | 1 |
| ADR-001 + fixture clean-up | 1 |
| **Total** | **~11.5** |

# FSD — M8: Safety + Cost + Rewind

**Document type:** Functional Specification Document (FSD)
**Milestone:** M8 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`), new labels (What agents may do, Safety and cost, History, Restore), sandbox per OS (Windows has no Full access in v1)
**Estimated effort:** 15 hours planned (1.5 weeks at ~10 h/week). The task list in the TDD adds up to ~21.5 h — see section 11.
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M8_safety_cost_rewind.md`, `../../FUNCTIONAL_SPECIFICATIONS.md` (F14, F15, F16), `../../TDD-tech-design-doc.md` (4.5, 4.9, 15), `../M7_race_mode/FSD_M7_race_mode.md` (previous), `../M9_polish_package/FSD_M9_polish_package.md` (next), `../M2_agent_runs_worktrees/TDD_M2_agent_runs_worktrees.md` (checkpoints, cost per run)
**Screens:** prototype views `safety`, `fullAccess`, `safetyAsk`, `budgetWarn`, `history`, `restoreConfirm` in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. What this document covers

M8 makes it safe to give agents more freedom. It has three parts:

1. **Safety** — permission profiles per task (on screen: **What agents may do**: Read only / Safe / Full access), a blocked list and an "always ask" list, an OS sandbox (`bwrap` on Linux, `sandbox-exec` on macOS), and secret masking.
2. **Cost** — a cost meter per run, per task and per day, plus a budget alert. On screen: **Settings → Safety and cost**, and per task in **More → Details**.
3. **Rewind** — a list of checkpoints per task (on screen: **More → History**, each row an **Undo point**) and a **Restore** button that never loses work.

Owned F-numbers (from `../README.md`): **F14.3, F15.1, F15.2, F15.3, F15.4, F16.2 (cost meter), F16.3 (budget alert)**.

**Screen words.** The engine keeps its names (`permission_profile`, `read_only` / `safe_build` / `full`, checkpoints, `saarthi checkpoint rewind`, `workspace.rewound`). The UI uses the plain labels of the Simple UI spec, section 5:

| Engine name | On screen |
|---|---|
| `read_only` / `safe_build` / `full` | Read only / Safe / Full access |
| Permission profile | What agents may do |
| Cost meter, budget | Safety and cost |
| Checkpoint | Undo point (More → History) |
| Rewind | Restore |
| Safety alert, "always ask" stop | Needs-you card on the task page |

---

## 2. The goal in plain words

Today (after M7) agents run with the `safe_build` profile and can read anything my user can read, including `~/.ssh` and `~/.aws`. Logs can hold API keys from `.env` files. I cannot see what a day of agent work costs. If an agent makes a mess, I fix it with git by hand.

**At the end of M8 I can:**
- Set a task to **Full access** and let the agent work without asking me, knowing it runs in a box that cannot see my keys (Linux and macOS).
- Trust that a secret from `.env` never shows up in the Activity tab, in History, or in the logs on disk.
- See today's spend in **Settings → Safety and cost** and get one warning when a task or the day goes over budget.
- Open **More → History**, restore the task's copy of the repo to an older undo point, look around, and come back to the latest state with nothing lost.

---

## 3. Where this milestone sits

| Before (already built) | M8 adds | Unlocks next |
|---|---|---|
| M1: `tasks.permission_profile` column (always `safe_build`) | "What agents may do" picker + real per-profile agent flags | M9: first-run setup checks the OS sandbox; user guide explains profiles |
| M2: checkpoints as hidden refs at the end of every run; `runs.cost_usd`, tokens | History list (undo points) + Restore; cost totals per day; budget alert | M9: release gate uses these as daily-use features |
| M2: Event Bus saves and sends every event | Secret masking inside the Event Bus | — |
| M3: simple cost totals (per task in More → Details) | Settings → Safety and cost with a breakdown | — |

---

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Permission profile** | How much an agent may do on a task: `read_only`, `safe_build` or `full`. On screen: "What agents may do: Read only / Safe / Full access". |
| **Sandbox** | A box around the agent process. Inside it, the agent sees only what we let it see. On screen: "in a safe box". |
| **bwrap** | Bubblewrap. A small Linux tool that builds the sandbox. No Docker needed. |
| **sandbox-exec** | The macOS tool that runs a program with a sandbox profile (a list of allowed and denied files). Built into macOS. |
| **Bind** | Making one real folder visible inside the sandbox (read-only or read-write). |
| **Blocked list** | Commands or files the agent must never touch. |
| **Always ask list** | Commands where the agent must stop and ask me first. |
| **Enforced vs soft** | *Enforced* = the system stops it. *Soft* = we tell the agent not to, and we flag it if it does. |
| **Secret masking** | Replacing a secret value with `****` before it is saved or shown. |
| **Checkpoint** | A saved snapshot of the task's copy of the repo (a hidden git commit). Made at the end of every run since M2. On screen: "Undo point". |
| **Rewind** | Put the files back to a checkpoint. The current state is saved first. On screen: "Restore". |
| **Budget** | A spend limit in USD for one task or for one day. Going over it gives a warning. |

---

## 5. Features

### 5.1 F15.1 — Permission profiles per task

**What.** Each task has one profile ("What agents may do"). I can change it on the task page (More → Details), from New task → More options → Safety, or from the CLI. The default for new tasks is set in **Settings → Safety and cost**. The profile decides the agent flags and the sandbox for the *next* run.

| Profile (on screen) | Files | Commands | Asks me? | Sandbox |
|---|---|---|---|---|
| `read_only` (Read only) | Read only. Worktree is mounted read-only. | Read tools only | — | On if available |
| `safe_build` (Safe, default) | Edit inside the worktree | Allowed list; blocked list applies | Yes, for the "always ask" list | On if available |
| `full` (Full access) | Anything inside the worktree | Anything inside the sandbox | No | **Required** — so not offered on Windows in v1 (5.3) |

**Why.** Small, clear tasks go faster in `full`. Risky tasks stay in `safe_build`. Research stays `read_only`.

**Example.**
```
$ saarthi task profile T-0042 full
Full lets the agent run any command without asking, inside the OS sandbox (bwrap).
Type the task id to confirm: T-0042
T-0042 profile: safe_build -> full (applies to the next run)
```
In the UI: task page → More → Details → **What agents may do** `Safe ▾` → pick **Full access** → the confirm screen (`fullAccess`) asks me to type the task id → Details shows `Full access · in a safe box`.

**Rules.**
- New tasks start as `safe_build` (setting). `full` can never be a default; it is turned on per task only.
- `full` is refused if the sandbox does not work on this machine (bwrap or sandbox-exec missing or blocked).
- On Windows, v1 has no OS sandbox, so **Full access is not offered**: the picker shows only Read only and Safe, with one line "Full access needs a safe box. Windows does not have one yet." The CLI and API refuse it.
- A change applies to the next run, never to a run in progress.
- `research` and `review` runs are always `read_only`, whatever the task profile (rule kept from M5/M6).
- Every change makes a `task.updated` event with old and new profile.

**Acceptance criteria.**
- Setting `full` without confirmation fails (CLI exits 2, API returns 400).
- Setting `full` when the sandbox check fails returns a clear error with the fix command.
- On Windows, setting `full` fails with `sandbox_unavailable` and reason `no_os_sandbox`; the picker does not list Full access.
- A run started after the change uses the new profile; the run record stores the profile it used.
- Each profile produces the agent flags in the TDD table (unit tests per agent).

### 5.2 F15.2 — Blocked list and "always ask" list

**What.** Two lists of patterns, global with project additions:
- **Blocked:** `git push` by the agent, `rm -rf` outside the worktree, reading `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/gh`, and other secret folders, production DB commands (patterns I set).
- **Always ask:** patterns I set, for example `alembic downgrade`, `docker compose down -v`.

**Why.** Some actions are never OK for an agent. Some are OK only after I say yes.

**Be honest about what is enforced.** Not every rule can be enforced for every agent. Saarthi shows the truth in `saarthi safety show`:

| Rule | Claude | Codex | OS sandbox (bwrap / sandbox-exec) |
|---|---|---|---|
| Agent `git push` | Deny rule (stops the plain command; a wrapped one like `sh -c "git push"` may slip by) | Enforced in `safe_build` (no network for commands). In `full`: push has no credentials | Enforced: no SSH keys, no ssh-agent, no `gh` token inside |
| `rm -rf` outside worktree | Deny rule (weak: patterns can be dodged) | Enforced by Codex sandbox | **Enforced**: everything outside the worktree is read-only or a throwaway copy |
| Read secret folders | Deny rule for the Read tool only | Not enforced by Codex | **Enforced**: folders do not exist inside |
| Prod DB commands | Deny rule (same limit as above) | **Soft only** | Not enforced (network is open) |
| Always ask | Run stops, task goes to `Needs You` (same pattern limit) | **Soft only**: Codex `exec` cannot pause to ask | — |

"Soft" means: the rule is written into the Context Pack ("never run X; stop and ask"), and if Saarthi sees a matching command in the stream, it shows a red **Safety alert** card on the task page and sends a notification. It cannot stop the command in time.

On Windows (no OS sandbox in v1) the sandbox column is "not enforced". `saarthi safety show` says so.

**Example.**
```
$ saarthi safety show T-0042
Profile: safe_build    Sandbox: on (bwrap 0.9.0)
Blocked (8)    git push*  ·  rm -rf /*  ·  Read ~/.ssh/**  ·  psql *prod*  ...
Always ask (2) alembic downgrade*  ·  docker compose down -v*
Enforcement    claude: deny+ask rules (pattern level)   codex: sandbox only, ask = soft
               bwrap: secret folders, writes outside worktree, git credentials
```

**Rules.**
- Lists live in config (global) and `.saarthi/project.toml` `[safety]` (project adds, never removes global items).
- Agents never push. Shipping (M5) is done by the daemon, not the agent.
- An "always ask" hit on Claude moves the task to `Needs You` (status **Needs you**). The task page shows a Needs-you card (`safetyAsk`): "Claude wants to run a command: alembic downgrade -1" with **Allow once** and **Deny**.
- A blocked or soft hit makes a `safety.alert` event (new) and a desktop notification.

**Acceptance criteria.**
- With FakeAdapter fixtures: a recorded Claude permission denial produces a `safety.alert` with `outcome = denied`.
- A recorded Codex tool call running `git push origin main` produces a `safety.alert` with `outcome = seen`.
- An "always ask" fixture moves the task to `Needs You`; answering "Allow once" resumes the run.
- `saarthi safety show` prints which rules are enforced and which are soft, per agent.

### 5.3 F15.3 — OS sandbox (bwrap on Linux, sandbox-exec on macOS)

**What.** Every agent process starts inside the sandbox of its OS. The daemon picks the sandbox from the OS, with one small table:

| OS | Sandbox | Full access offered? |
|---|---|---|
| Linux | `bwrap` (Bubblewrap) | Yes, if the probe passes |
| macOS | `sandbox-exec` with a profile Saarthi writes | Yes, if the probe passes |
| Windows | none in v1 | **No** |

Inside the sandbox (Linux and macOS, same promise):
- **All of `$HOME` is hidden**, then only a short list is put back: toolchains read-only (for example `~/.local/bin`, `~/.nvm`), each agent's own login folder read-write (`~/.claude`, `~/.codex`), and a shared cache folder.
- **The task worktree is the only project folder that is writable.** Other projects, `~/.ssh`, `~/.aws`, `~/.gnupg`, the Saarthi token and database are not visible at all.
- The ssh-agent and keyring sockets are hidden. Secret environment variables are not passed in.
- **Network stays on.** Agents need it to talk to their provider.

**Why.** Rules inside the agent can be dodged. The sandbox is enforced by the OS kernel. It is what makes `full` safe enough. Windows has no small built-in tool that does the same job, so v1 does not pretend: Full access is simply not offered there.

**Example.**
```
$ saarthi safety check          # Linux
os            linux
sandbox       bwrap /usr/bin/bwrap 0.9.0    ok
user ns       allowed                        ok
probe         cat ~/.ssh/* inside sandbox -> No such file or directory   ok

$ saarthi safety check          # macOS
os            macos
sandbox       sandbox-exec /usr/bin/sandbox-exec   ok
probe         cat ~/.ssh/* inside sandbox -> Operation not permitted   ok

$ saarthi safety check          # Windows
os            windows
sandbox       none (v1)       Full access is not offered on Windows
```

**Rules.**
- Setting `safety.sandbox`: `always` (default) or `full_only`. `full` always uses the sandbox, whatever the setting.
- If the sandbox does not work (or the OS has none), `read_only` and `safe_build` still run without it (with a yellow "not in a safe box" badge on the run). `full` refuses to start.
- Writes outside the worktree and the allowed folders either fail or (Linux) go to a throwaway copy that is gone when the run ends.
- The UI never decides this. It asks the daemon which profiles this machine offers (`/safety/check`).

**Acceptance criteria.**
- Test (Linux and macOS CI): a plain command run through the same wrapper cannot read a fake `~/.ssh/id_ed25519` and cannot see its contents in output.
- Test: a file written to `~` inside the sandbox does not exist on the host after the run (Linux: throwaway copy; macOS: the write is refused).
- Test: a file written in the worktree does exist after the run.
- Test: no default bind or allow rule exposes any path in the secret list.
- Test: the OS table picks `bwrap` for Linux, `sandbox-exec` for macOS and none for Windows; for Windows, `full` is not in the offered profiles.
- Each run record shows `sandboxed = true/false`. The run row in More → Details shows a lock icon.

### 5.4 F15.4 — Secret masking

**What.** Before any event is saved (SQLite and JSONL) or sent (WebSocket), secrets are replaced with `****`. Secrets are:
1. Values from the project's `.env` files (`.env`, `.env.local`, `.env.*`, not `.env.example`).
2. Known key shapes: Anthropic and OpenAI keys, GitHub tokens, AWS key ids, Slack tokens, private key blocks, `password=...` style pairs.
3. Values of secret-looking environment variables in the daemon (`*_KEY`, `*_TOKEN`, `*_SECRET`, `*PASSWORD*`).

Check output (Tests and checks, "Show output", and check logs) and terminal output are masked the same way.

**Why.** FSD F15.4 is "Must". Until M8, logs could hold secrets (known gap 2 in `../README.md`).

**Example.** The agent runs `cat .env`. The Activity tab shows:
```
DATABASE_URL=****
STRIPE_KEY=****
DEBUG=true
```
Old data: `saarthi safety scrub` masks events and logs saved before M8.
```
$ saarthi safety scrub
Scanned 18,204 events, 61 run logs, 210 check logs. Masked 37 values.
```

**Rules.**
- Very short values (under 8 characters) are not masked, so `true` or `1` do not become `****`.
- Masking happens once, in the Event Bus, before the event goes to any store or subscriber.
- There is no "reveal" button. The real value is never stored.

**Acceptance criteria.**
- Unit tests for each pattern and for `.env` values, including a value in the middle of a line and a value inside JSON.
- An integration test with a FakeAdapter fixture that prints a `.env` value: the value is in neither SQLite, the JSONL file, nor the WebSocket message.
- Changing `.env` takes effect for the next event (no daemon restart).

### 5.5 F16.2 — Cost meter (per run, per task, per day)

**What.** One meter, three levels:
- **Run:** cost and tokens on each run row in More → Details (from M2), now with a `~` sign when the cost is our estimate from tokens (Codex often reports tokens only).
- **Task:** total in More → Details of the task page.
- **Day:** **Settings → Safety and cost** (`safety`) shows today's total, today by task, and the last 7 days. There is no cost in the top bar (Simple UI spec, section 9).

**Why.** I want to see where the money goes, and compare agent costs (useful after Side by side in M7).

**Example.**
```
$ saarthi cost --days 3
Day          Runs   Cost     Over budget
2026-10-11     9    $4.80
2026-10-10    14    $11.20   day ($10.00)
2026-10-09     6   ~$2.10
Top today: T-0042 $2.40 · T-0051 $1.30 · T-0039 ~$1.10
```

**Rules.**
- Day = local calendar day of the run start.
- A cost reported by the agent wins over our estimate.
- Claude on a subscription still reports a cost. It is shown as reported; it is a "what it would cost" number.

**Acceptance criteria.**
- Totals match the sum of `runs.cost_usd` for the same filters (test with seeded runs).
- Estimated costs are marked `~` in CLI and UI.
- The Safety and cost page and the task's Details update within 1 s after an `agent.cost` event.

### 5.6 F16.3 — Budget alert

**What.** Two limits: per task and per day (global, with project override for task). When a total goes over a limit, Saarthi shows one warning: a desktop notification, the number turns red in Safety and cost, and a warning card on the task page (`budgetWarn`) and a link to Safety and cost.

**Why.** Long runs and fix loops can burn money quietly.

**Note.** The FSD lists F16.3 as "Later". MILESTONES.md puts it in M8. We follow MILESTONES.md (known gap 3 in `../README.md`).

**Example.** Notification: *"T-0042 is over its budget: $3.40 of $3.00."*

**Rules.**
- Warning only. It never stops a run and never changes the task's status.
- One alert per task, and one per day. No spam.
- The number turns amber at 80% of a limit.
- Cost often arrives at the end of a run, so the alert can come late. That is accepted.

**Acceptance criteria.**
- Seeded runs that cross a limit produce exactly one `cost.budget_exceeded` event (new).
- Raising the limit and crossing it again produces a new alert.

### 5.7 F14.3 — Checkpoints list + Rewind (History → Restore)

**What.** Task page → **More → History** (`history`). It lists the task's events, and each checkpoint shows as an **Undo point** row: number, time, label ("end of run 01JA…", "before restore to #2"), files changed. Each undo point has **Restore**. Restore opens a confirm (`restoreConfirm`) that says what will change, then first saves the current state as a new undo point, then puts the files back.

**Why.** Undo anything without git skills, and without fear.

**Example.**
```
$ saarthi checkpoint list T-0042
#  When              Label                        Files
4  10:42             end of run 01JAX3 (claude)   +3 ~2 -0
3  10:15             end of run 01JAW9 (codex)    +1 ~4 -1
2  09:58             end of run 01JAV1 (claude)   +2 ~0 -0
$ saarthi checkpoint rewind T-0042 2
Saved current state as #5 ("before restore to #2").
Workspace now matches #2. Run `saarthi checkpoint rewind T-0042 5` to come back.
```

**Rules.**
- Not allowed while a run is active or checks are running (`Running`, `Needs You`, `Verifying`), or after `Shipped` / `Archived`.
- If the task is in `Review`, rewind moves it to `Ready` (the Tests and checks result no longer matches the files).
- Only files git can see are rewound. Git-ignored files (`.env`, `node_modules`, `.venv`) are not touched.
- The branch history never changes. Rewind only changes files.
- If the current files already equal the latest checkpoint, no new "before restore" checkpoint is made (no duplicates).
- If the checkpoint was made on an older base (for example before "Update from main"), Saarthi warns and asks again, because older files from main come back too.
- After Side by side (M7), checkpoints from both lanes are in the list, marked "side by side". Restoring the other lane's undo point is a way to take its work after all.

**Acceptance criteria.**
- Round trip test: change files, rewind to an older checkpoint, rewind to the "before restore" checkpoint -> every file is byte-equal to the start, including new and deleted files.
- Rewind during an active run returns 409.
- A `workspace.rewound` event is saved with the from/to checkpoint numbers.

---

## 6. Main user flows

### 6.1 Let an agent run free on a small task (Linux or macOS)
1. Open T-0042. More → Details → What agents may do → **Full access**. Type the id on the confirm screen (`fullAccess`).
2. Click **Start**.
3. The run row in Details shows a lock icon (in a safe box). The agent works without asking.
4. The agent tries `cat ~/.ssh/id_ed25519`. The Activity tab shows "No such file or directory".

### 6.2 An "always ask" command (Claude)
1. Task in Safe (`safe_build`). Agent wants to run `alembic downgrade -1`.
2. The task shows under **Needs you**. Notification: "Claude wants to run: alembic downgrade -1".
3. The task page shows the `safetyAsk` card. I click **Deny**. The agent gets "denied" and continues another way.

### 6.3 Over budget
1. A fix loop runs three times. Task total goes from $2.70 to $3.40; task budget is $3.00.
2. Notification and the `budgetWarn` card on the task page: "Over budget". The run is not stopped.
3. I decide: park the task, or raise its limit in Settings → Safety and cost.

### 6.4 Restore and come back
1. The last run made a mess. Open More → History. Click **Restore** on undo point #2 and confirm (`restoreConfirm`).
2. Saarthi saves #5 "before restore to #2", then restores #2. Files shows the old files.
3. I change my mind. Click **Restore** on #5. Everything is back. Nothing lost.

---

## 7. Done when

From `../../MILESTONES.md`, made concrete:

1. **In `Full` profile inside the OS sandbox, an agent cannot read `~/.ssh` (test proves it).**
   - `tests/integration/test_sandbox_secrets.py` runs a plain command through the same wrapper the Run Manager uses, with a fake home that holds `.ssh/id_ed25519`. The command fails and the secret text is in no output. No real agent is needed. It runs in CI on Linux (bwrap) and macOS (sandbox-exec).
   - On the Windows CI runner, a test proves `full` is refused and not offered.
   - `tests/integration/test_full_profile_run.py` starts a `full` run through the real Claude and Codex adapters, pointed at M2's fake agent programs (no real agent). A fixture line makes the fake agent run `cat ~/.ssh/id_ed25519`. The saved `agent.tool_result` shows the failure.
   - Manual: one real `full` Claude run on a scratch task where I ask it to read `~/.ssh`. It cannot.
2. **I rewind a task to a checkpoint and come back to the latest again with no loss.**
   - Round-trip test in section 5.7 passes.
   - Manual: on a real task, rewind to an older checkpoint and back; `git diff` between the start state and the end state is empty.
3. Also (from the Build list): secret masking tests pass; cost meter and budget alert work on seeded data; the "What agents may do" picker works from CLI and UI.

---

## 8. Out of scope

| Item | Where it goes |
|---|---|
| Network sandbox (block all hosts except the provider) | Later (after v1) |
| Hard stop of runs at budget | Not planned (FSD says "warn") |
| Manual "save checkpoint now" button | Open question 5 |
| Replay of a run step by step (F14.4) | Later |
| Packaging bwrap AppArmor fix, first-run check of the sandbox | M9 |
| An OS sandbox on Windows (so Full access works there) | Later |
| Per-workspace ports | M7 |
| Phone glance, team mode | Later |

---

## 9. QA checklist

1. `saarthi safety check` on this machine -> all `ok`.
2. `saarthi task new "qa sandbox"` -> `saarthi task profile T-xxxx full` without typing the id -> refused.
3. Same with the id -> profile is `full`. `saarthi safety show T-xxxx` lists sandbox on and blocked/ask rules.
4. Start a real Claude build run with prompt "print the contents of ~/.ssh". Output says the folder does not exist (or "not permitted" on macOS). Run row has a lock icon.
5. In the worktree, add `.env` with `API_TOKEN=abc123secretvalue`. Ask the agent to `cat .env`. Activity, History and the run log file in the data folder (`<data>/logs/runs/<run>.jsonl`) show `****`, never `abc123secretvalue` (`grep -r abc123secretvalue <data>` finds nothing).
6. Add `alembic downgrade*` to the ask list. Ask a Claude run to run it. Task shows under Needs you with the `safetyAsk` card. Deny. The run continues.
7. Set the task budget to $0.01 in Settings → Safety and cost. Start a small run. After it ends, exactly one "over budget" notification and the `budgetWarn` card. The number is red in Safety and cost.
8. `saarthi cost --days 7` totals match the run list.
9. Make two runs on a task. `saarthi checkpoint list` and More → History show them. Restore the first. Restore the "before restore" one. `git status` and file contents equal the state before step 9.
10. Try Restore while a run is active -> refused with a clear message.
11. Run `saarthi safety scrub` once; run it again -> second run masks 0 values.
12. macOS: steps 1-4 with `sandbox-exec`. Windows: Details lists only Read only and Safe; `saarthi task profile T-xxxx full --yes` is refused with "Windows has no OS sandbox in v1".

---

## 10. Open questions

1. **Codex sandbox inside bwrap.** Codex uses its own Linux sandbox. Nested sandboxing may fail. If it does, `full` uses Codex's "bypass sandbox" flag because bwrap is the outer box. To check on day 1 (TDD Decision 4).
2. **"Always ask" for Codex is soft only.** Is that OK for v1, or should "always ask" rules force Codex tasks to stay in `read_only`?
3. **Default budgets.** Proposed: $3 per task, $10 per day. On a subscription these are notional numbers. Keep, or default to off?
4. **Codex cost estimate.** Showing `~$` from a price table can be wrong. Keep the estimate, or show tokens only?
5. **Manual checkpoint.** A "Save checkpoint now" button is 1 hour of work. Add in M8 or leave out?
6. **Known gap 2** (`../README.md`): logs before M8 may hold secrets. M8 closes it with `saarthi safety scrub`. Accept?
7. **Known gap 3**: F16.3 budget alert is "Later" in the FSD but built here. Update the FSD to "Must (M8)"?
8. **macOS `sandbox-exec` is marked "deprecated" by Apple**, but it still ships and other agent tools use it. Accept for v1, and re-check on each macOS release?
9. **Windows has no Full access in v1.** Is that enough, or should Windows also block `safe_build` until a sandbox exists? Proposed: allow Read only and Safe, with the "not in a safe box" badge.

---

## 11. Effort

| Part | Hours |
|---|---|
| Profiles + agent flag mapping + CLI/UI picker | 3 |
| Blocked / ask lists + `safety.alert` | 3 |
| bwrap wrapper + tests | 4 |
| macOS `sandbox-exec` profile + OS table + Windows refusal + CI on 3 OSes | 2.5 |
| Secret masking + scrub + tests | 3 |
| Cost meter + budget alert | 2.5 |
| Checkpoints list + Rewind + UI | 3 |
| Manual checks | 0.5 |
| **Total** | **21.5** |

This is about 6.5 hours over the 1.5-week plan (2.5 h of it is the per-OS sandbox). If time is short, cut in this order: `safety scrub` (keep the gap open), the 7-day cost view, the amber 80% colour.

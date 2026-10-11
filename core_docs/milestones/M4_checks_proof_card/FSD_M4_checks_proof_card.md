# FSD — M4: Checks + Proof Card

**Document type:** Functional Specification Document (FSD)
**Milestone:** M4 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-11
**Estimated effort:** ~14 hours (1.5 weeks at 8-10 h/week)
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M4_checks_proof_card.md`, `../../FUNCTIONAL_SPECIFICATIONS.md` (F2.5, F7), `../../TDD-tech-design-doc.md` (4.6, 5.7, 7, 8.3), `../M3_desktop_ui_v1/FSD_M3_desktop_ui_v1.md` (before), `../M5_review_ship/FSD_M5_review_ship.md` (next)

---

## 1. What this document covers

This document covers M4 only:

1. The **Check Runner**: run the project's checks (tests, lint, types, build) in the task's worktree.
2. **Auto-run** of checks after every `build` or `fix` run.
3. The **Proof Card**: check results, change size, tests added, and "Brief coverage".
4. The **Review gate**: a task goes to `Review` only with green required checks, or with a typed override reason.
5. **"Fix with agent"**: one click sends the failing output to the agent as a new `fix` run. Max rounds: 3.
6. The **Proof tab** in the Task Room and the **status dot** on board cards.
7. CLI: `saarthi checks <task>` and `saarthi proof <task>`.

The Change Story, Second Opinion and shipping are M5. They are not here.

---

## 2. The goal in plain words

**No task reaches Review without proof.**

Today (after M3) an agent finishes and I have to run `pytest` myself, read the output, and decide. After M4 the app does this by itself. When a run ends, the checks run, and the task moves to `Review` (all green) or to `Failed` (something broke). If it failed, I click "Fix with agent" and the agent gets the exact failing output.

**What I can use at the end of M4:**
- I start a build run and walk away. When I come back, the board shows a green or red dot on the card.
- I open the Proof tab and see what passed, what failed, how big the change is, and which acceptance criteria the agent thinks are met.
- A broken change gets fixed by the agent in 1-3 clicks, without me copying any logs.
- If a check is wrong (flaky, broken upstream), I can still move on, but I must write why. The reason stays on the Proof Card.

---

## 3. Where this milestone sits

| Before (already built) | M4 adds | Unlocks next |
|---|---|---|
| M1: tasks, briefs, events, stage table `ALLOWED_MOVES`, `project.toml` reader | `[[checks]]` in `project.toml`, the `Review` stage rule | M5: Change Story is built when a task enters `Review` |
| M2: runs, worktrees, `fix` mode, checkpoints, `notify-send` | Checks after `build`/`fix` runs, fix runs with failing output | M5: "Send comments to agent" reuses the fix-run path |
| M3: board, Task Room, Settings page | Proof tab, status dot, "Max fix rounds" setting | M5: PR body includes the Proof Card |

---

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Check** | One command that tests the work. Example: `uv run pytest -q`. Set in `.saarthi/project.toml`. |
| **Required check** | A check that must pass before Review. A failing optional check only shows as a warning. |
| **Check batch** | One run of all checks for a task. One batch makes one Proof Card. |
| **Proof Card** | The summary of one check batch plus change size and Brief coverage. |
| **Output tail** | The last 200 lines of a check's output. The full output is saved to a log file. |
| **Brief coverage** | The brief's acceptance criteria, each marked `met` / `not sure` / `not met`. The agent fills it. I confirm it. |
| **Gate** | The rule that decides if a task may enter `Review`. |
| **Override** | Moving to `Review` with failing checks. Needs a typed reason. |
| **Fix round** | One "Fix with agent" run. Counted since the last green Proof Card. |
| **Side run** | A short, read-only agent call that does not move the task's stage. Used here for Brief coverage. |
| **Status dot** | The small coloured dot on a board card that shows the latest proof result. |

---

## 5. Features

### 5.1 F7.1 — Check list per project

**What:** Each project lists its checks in `.saarthi/project.toml`. Each check has a name, a command, required yes/no, and a timeout.

**Why:** Every project has different checks. The app should not guess.

**Example:**
```toml
[[checks]]
name = "tests"
cmd = "uv run pytest -q"
required = true
timeout_sec = 600

[[checks]]
name = "types"
cmd = "uv run pyright"
required = false
timeout_sec = 300
```
```
$ saarthi checks T-0042 --list
NAME    REQUIRED  TIMEOUT  COMMAND
tests   yes       600s     uv run pytest -q
lint    yes       120s     uv run ruff check .
types   no        300s     uv run pyright
```

**Rules:**
- R1. `name` and `cmd` are required. `required` defaults to `true`. `timeout_sec` defaults to 600.
- R2. Names are unique per project. They are used in log file names, so only letters, digits, `-` and `_`.
- R3. A check can be turned off with `enabled = false`. It then shows as `skip` and never blocks.
- R4. The command runs **without a shell**. Shell signs like `&&`, `|`, `;`, `>` are refused with a clear message: "Use a script, or `bash -c '...'`". This keeps the command exact and safe.
- R5. Every check runs inside the task's worktree folder, never in the main repo.
- R6. A bad `[[checks]]` block (missing name, duplicate name, shell signs) is shown as an error in `saarthi checks --list` and on the Proof tab. Checks do not run until it is fixed.

**Acceptance criteria:**
- AC1. A `project.toml` with 3 checks lists 3 checks with the right defaults.
- AC2. A check with `cmd = "pytest && ruff check ."` is refused with the message from R4.
- AC3. A check with `enabled = false` shows as `skip` and does not block Review.

### 5.2 F7.2 — Auto-run checks

**What:** When a `build` or `fix` run finishes, the task moves to `Verifying` and all checks run by themselves. I can also run them by hand.

**Why:** Verifying by hand is easy to skip. The app should never skip it.

**Example:**
```
$ saarthi run T-0042 --agent claude --mode build
... run finished (4m 12s, $0.38)
Checks started (3)...
  tests  required  PASS   41.2s
  lint   required  FAIL    1.3s  exit 1
  types  optional  PASS   12.8s
Required checks failed: lint. T-0042 -> Failed.
Fix it: saarthi run T-0042 --mode fix   (fix round 1 of 3)
```
By hand, after editing a file myself in my editor:
```
$ saarthi checks T-0042
```

**Rules:**
- R1. Checks run only after a run **finishes** in `build` or `fix` mode. Not after `plan`, `research`, a failed run, or a stopped run.
- R2. Checks run one after another by default. `checks_parallel = true` in `[project]` runs them at the same time.
- R3. Each check has a timeout. On timeout, the check and **every process it started** are killed. Status is `error` with the note "timeout after 600s".
- R4. Each check saves: status, exit code, time taken, the last 200 lines, and the full log file.
- R5. Only one check batch per task at a time. A second request says "checks already running".
- R6. Manual checks are allowed when the task has a worktree and no agent run is active. They are refused in `Inbox`, `Research`, or before the first run.
- R7. Manual checks from `Failed` move the task to `Verifying` (I fixed it by hand). Manual checks in `Review` only update the Proof Card; the task stays in `Review`.
- R8. If the daemon restarts during checks, unfinished checks become `error` ("interrupted") and the task goes to `Failed`. I can run checks again.
- R9. A desktop notification says "T-0042: checks passed" or "T-0042: checks failed (lint)". One notification per batch, not per check.

**Acceptance criteria:**
- AC1. A FakeAdapter build run that finishes starts the checks with no user action.
- AC2. A check `sleep 999` with `timeout_sec = 2` ends as `error` after about 2 seconds, and no `sleep` process is left.
- AC3. A check with 5,000 output lines saves the last 200 lines in the card and all 5,000 in the log.
- AC4. A plan run does not start checks.
- AC5. Calling "run checks" twice quickly gives one batch and one "already running" answer.

### 5.3 F7.3 — Proof Card

**What:** One card per check batch. It shows:
- each check: pass / fail / skip / error, time, short output;
- files changed, lines added / removed;
- tests added count;
- Brief coverage: each acceptance criterion with `met` / `not sure` / `not met` and a short note.

**Why:** One place that answers "is this done, and how do I know?". It also goes into the PR body in M5.

**Example:**
```
$ saarthi proof T-0042
Proof Card  T-0042  Add password reset API      (after run 01JA9..., build, claude)
Checks
  tests  required  PASS   41.2s
  lint   required  PASS    1.1s
  types  optional  FAIL   12.8s   (does not block)
Changes   6 files   +214 / -37   tests added: 4
Brief coverage  (agent view - not confirmed yet)
  1. met       User can ask for a reset email
  2. not_sure  Token expires after 30 minutes     "expiry is set, but no test covers it"
  3. met       Old tokens stop working
Gate      all required checks green -> Review
```
Confirm coverage (change item 2, then confirm):
```
$ saarthi proof T-0042 --set 2=met --confirm
Brief coverage confirmed (3 of 3 met).
```

**Rules:**
- R1. Files changed and lines are counted against the base branch, and **include new files that are not yet committed** (agents rarely commit).
- R2. **Tests added** (new rule): count the added lines that **define a test**, in files that look like test files. Test files: `tests/**`, `test_*.py`, `*_test.py`, `*.test.ts(x)`, `*.spec.ts(x)`, `*.test.js`, `*.spec.js`. Test lines: `def test_...`, `async def test_...`, `it(...)`, `test(...)`. Both lists can be changed per project in `[proof]`. A renamed test counts as added. It is a hint, not a promise.
- R3. Brief coverage is filled by a short, **read-only** agent call (a side run). By default it uses the agent of the last build/fix run.
- R4. Coverage is asked for **only when all required checks pass**. When checks fail, the agent's work is not done yet, so the call would waste money. I can still ask by hand: `saarthi proof T-0042 --refresh-coverage`.
- R5. **If the coverage call fails** (agent missing, timeout, bad answer): the Proof Card is still made, the gate still works, and each criterion is set to `not sure` with the note "agent check failed: <reason>". The card says "Coverage: fallback". I can refresh or fill it by hand.
- R6. If the brief has no acceptance criteria, coverage is empty and the card says "Brief has no acceptance criteria". No agent call.
- R7. Coverage **never blocks** the gate. Only required checks do. Coverage is information for me.
- R8. When I confirm, my choices replace the agent's. The card shows "confirmed by you" and the time.
- R9. Old Proof Cards are kept. The Proof tab shows the latest; older ones are in a "History" list.

**Acceptance criteria:**
- AC1. A worktree with 2 changed files and 1 new untracked file shows "3 files".
- AC2. A diff that adds `def test_a` and `def test_b` in `tests/test_x.py` and `def helper` shows "tests added: 2".
- AC3. With a recorded "coverage ok" fixture, the card shows the agent's statuses for each criterion.
- AC4. With a recorded "garbage answer" fixture, every criterion shows `not sure` with "agent check failed", and the task still moves to `Review`.
- AC5. `--set 2=met --confirm` saves, emits an event, and the card shows "confirmed".

### 5.4 F2.5 (Review rule) and F7.6 — The gate and the override

**What:** A task enters `Review` only when the latest Proof Card has every required check at `pass`. Otherwise, I can override with a reason.

**Why:** The whole point of Saarthi is the proof gate. But checks can be wrong, so I need a way out that leaves a trace.

**Example:** Drag the card from `Failed` to `Review`. A dialog asks: "Required checks failed: lint. Why move on?" I type "lint rule E501 broken upstream, fixed in #91" and click Move.
```
$ saarthi task move T-0042 review --reason "lint rule E501 broken upstream, fixed in #91"
T-0042 -> Review (override). Reason saved on Proof Card 01JA9...
```

**Rules:**
- R1. `Verifying -> Review` happens by itself when all required checks pass.
- R2. `Verifying -> Failed` happens by itself when a required check fails or errors.
- R3. Override is a move from `Failed` to `Review`, with a reason of **at least 10 characters**. (New move. The core table only lists `Verifying -> Review`, but after a failed batch the task is already in `Failed`.)
- R4. The reason is saved on the latest Proof Card, shown on the card, and in the `task.stage_changed` event.
- R5. No override while checks are still running. No override when there is no Proof Card yet ("run checks first").
- R6. If the project has **no required checks**, the gate passes, and the Proof Card shows a warning: "No required checks - nothing was proven." (new rule, see open questions)
- R7. The gate is in the daemon. The UI and CLI only ask. A direct API call without a reason is refused.

**Acceptance criteria:**
- AC1. `task move review` on a failed task with no reason is refused with "needs a reason (10+ characters)".
- AC2. With a reason, the move works and `saarthi proof` shows "Override: <reason>".
- AC3. `POST /tasks/{id}/stage {"to":"review"}` from `Failed` without a reason returns 409.
- AC4. The board dot turns amber for an overridden card.

### 5.5 F7.4 — Fix with agent

**What:** When checks fail, a "Fix with agent" button starts a new `fix` run. The agent gets the names, commands and output tails of the failing checks. Max rounds: 3 (setting).

**Why:** Copying logs into a chat is the most boring part of agent work.

**Example:** Click **Fix with agent (round 1 of 3)** on the Proof tab. Or:
```
$ saarthi run T-0042 --agent claude --mode fix
Fix round 1 of 3. Sending 1 failing check (lint) to claude...
```
After the third failed round:
```
$ saarthi run T-0042 --mode fix
Fix rounds used up (3 of 3). Look at it yourself, or add --extra-round to try once more.
```

**Rules:**
- R1. A fix round = one `fix` run started since the last green Proof Card.
- R2. One click is one round. The app does **not** start rounds by itself (new, see open questions).
- R3. When the limit is reached, the button changes to "One more round" and asks for a confirm. The CLI needs `--extra-round`.
- R4. The fix run gets, for each failing required check: name, command, exit code, and output tail (cut to a safe size). Failing optional checks are listed as "also failing, not required".
- R5. The default agent is the one that made the last build/fix run. I can pick the other one.
- R6. After the fix run ends, checks run again (F7.2). The loop continues until green or the limit.
- R7. "Max fix rounds" is a global setting (Settings page, default 3).

**Acceptance criteria:**
- AC1. The fix run's Context Pack (`.saarthi/context/TASK.md`) has a "Failing checks" section with the lint output tail.
- AC2. The 4th fix run is refused with HTTP 409 unless `extra_round_ok` is true.
- AC3. After a green card, the round counter is back to 0.

### 5.6 Proof tab and status dot (UI for F7.3)

**What:** A new **Proof** tab in the Task Room, and a status dot on each board card.

**Proof tab shows:** the check list (expand a row to see the output tail, "Open full log"), change size, tests added, Brief coverage with a status dropdown per item and a **Confirm** button, the override reason (if any), and buttons **Run checks** and **Fix with agent (round N of M)**. A small "History" list shows older cards.

**Status dot colours:**

| Dot | Meaning |
|---|---|
| grey | no Proof Card yet |
| blue, pulsing | checks running |
| green | all required checks pass |
| red | a required check failed |
| amber | moved to Review with an override |

**Acceptance criteria:**
- AC1. The dot changes from blue to green or red without a page reload (live from events).
- AC2. Expanding a failed check shows its last 200 lines in a monospace box.
- AC3. Changing a coverage item and clicking Confirm shows "confirmed by you".

---

## 6. Main user flows

### 6.1 Build -> checks fail -> fix -> Review (the "Done when" flow)
1. Task T-0042 is `Ready`. I start a Claude build run.
2. The run ends. Task -> `Verifying`. The dot pulses blue.
3. `lint` fails. Task -> `Failed`. Dot red. Notification "checks failed (lint)".
4. I open the Proof tab and click **Fix with agent (round 1 of 3)**. Task -> `Running`.
5. The fix run ends. Checks run again. All required pass.
6. The coverage side run fills Brief coverage.
7. Task -> `Review`. Dot green. Notification "checks passed".
8. I read coverage, change one item, click **Confirm**.

### 6.2 Override
1. Task is `Failed` because the `e2e` check is flaky.
2. I drag it to `Review`. The dialog asks for a reason. I type it.
3. Task -> `Review`. Dot amber. The Proof Card shows the reason.

### 6.3 Fix by hand
1. Task is `Failed`. I open the worktree in my editor and fix a typo.
2. `saarthi checks T-0042`. Task -> `Verifying` -> `Review`.

---

## 7. Done when

- [ ] With a real project, a broken build run auto-moves the task to `Failed`. I click "Fix with agent". After the fix run, the task moves to `Review` with all required checks green. (Also covered by an integration test with FakeAdapter.)
- [ ] Moving a failed task to `Review` without a reason is refused in the UI, the CLI, and the API. With a reason, the reason shows on the Proof Card (UI and `saarthi proof`).
- [ ] A check that hangs is killed at its timeout, with no leftover processes.
- [ ] A failing coverage call never blocks the gate (test with a garbage fixture).
- [ ] The 4th fix round needs an explicit confirm.
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run pyright` are clean.

---

## 8. Out of scope

| Item | Owner |
|---|---|
| Change Story, risk flags, comments | M5 |
| Second Opinion | M5 |
| Proof Card in the PR body | M5 |
| "Update from main" | M5 |
| Playbook variable `{{failing_checks}}` | M6 (M4 makes the text it will use) |
| Evidence: screenshots, API recordings (F7.5) | Later |
| Masking secrets in check logs (F15.4) | M8 |
| Running only some checks | Not planned |
| Cost meter for coverage calls | M8 (cost is recorded per run since M2) |

---

## 9. QA checklist

Set up a test project with three checks: `tests` (`uv run pytest -q`), `lint` (`uv run ruff check .`), `types` (`uv run pyright`, `required = false`).

1. [ ] `saarthi checks T-0001 --list` shows 3 checks with the right flags.
2. [ ] Add `cmd = "pytest | tee out"` to a check. `--list` shows an error for it.
3. [ ] Run a build that leaves a lint error. Task ends in `Failed`, dot red, one notification.
4. [ ] Proof tab: `lint` is red; expand it; the ruff error is visible. "Open full log" opens the whole file.
5. [ ] Click "Fix with agent". Button said "round 1 of 3". `.saarthi/context/TASK.md` in the worktree has "Failing checks".
6. [ ] After the fix, task is `Review`, dot green, Brief coverage filled.
7. [ ] Set coverage item 1 to `not met`, click Confirm. Card says "confirmed by you".
8. [ ] Break the code by hand. `saarthi checks T-0001` -> card red, task stays `Review` (R7 of 5.2).
9. [ ] Add a check `cmd = "sleep 999"`, `timeout_sec = 3`. Run checks. It shows `error` "timeout after 3s". `pgrep sleep` finds nothing.
10. [ ] Make a required check fail. Drag to Review. Dialog appears. Try a 5-character reason: refused. Type a real reason: works, dot amber, reason on card.
11. [ ] `curl -X POST .../tasks/T-0001/stage -d '{"to":"review"}'` on a failed task: 409.
12. [ ] Fail 3 fix rounds (FakeAdapter or a check that always fails). 4th click asks "One more round?".
13. [ ] Stop the daemon during a long check. Start it. The check is `error` "interrupted", task `Failed`.
14. [ ] Log out of the coverage agent (or rename the binary). Pass all checks. Task still reaches `Review`; coverage says "agent check failed".

---

## 10. Open questions

- Q1. **Auto fix rounds.** Should the app start fix rounds by itself (up to the max) without a click? Default here: no, one click = one round. The FSD's "auto-fix loop" name suggests it could. Easy to add later.
- Q2. **No required checks.** Is "gate passes with a warning" right, or should a project with no required checks block Review? Default: pass with warning.
- Q3. **Coverage only when green.** Coverage is skipped when checks fail. OK?
- Q4. **Fix rounds and review fixes.** In M5, "Send comments to agent" also starts `fix` runs. With the R1 rule, they count toward the fix rounds. Acceptable, or should rounds count only check fixes?
- Q5. **Tests added** only knows Python and JS/TS patterns by default. Other languages need `[proof]` settings.
- Q6. **Secrets in check logs (milestones README, Known gap 2).** Check output can contain secrets (a test that prints a `.env` value). Until M8, logs are saved as they are, in `~/.local/share/saarthi/checks/`. Accepted risk for a single-user local tool.

---

## 11. Effort

About **14 hours**. Breakdown in `TDD_M4_checks_proof_card.md` section 16.

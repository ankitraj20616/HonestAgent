# FSD — M4: Checks + Proof Card

**Document type:** Functional Specification Document (FSD)
**Milestone:** M4 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`): the old proof view becomes the checks part of **Check and ship**, a verdict instead of a score on screen, goals pre-filled by the agent, new labels
**Estimated effort:** ~14.5 hours (1.5 weeks at 8-10 h/week)
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M4_checks_proof_card.md`, `../../FUNCTIONAL_SPECIFICATIONS.md` (F2.5, F7), `../../TDD-tech-design-doc.md` (4.6, 5.7, 7, 8.3), `../M3_desktop_ui_v1/FSD_M3_desktop_ui_v1.md` (before), `../M5_review_ship/FSD_M5_review_ship.md` (next)
**Screens:** prototype views `checks`, `checkFail`, `fixing`, `fixLimit`, `check` (checks part), `settingsProject` in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. What this document covers

This document covers M4 only:

1. The **Check Runner**: run the project's checks (tests, lint, types, build) in the task's worktree.
2. **Auto-run** of checks after every `build` or `fix` run.
3. The **Proof Card** (engine name): check results, change size, tests added, and goal coverage ("What done looks like", pre-filled by the agent).
4. The **Review gate**: a task goes to `Review` only with green required checks, or with a typed reason ("Review anyway").
5. **"Let Claude fix it"**: one click sends the failing output to the agent as a new `fix` run. Max tries: 3.
6. The **verdict** (F7.7 shown as words): **Looks good** / **Take a look** / **Has problems**. The Trust score number shows only under "How we decided".
7. The **checks part of the Check and ship screen** on the task page, and a **check dot** on Home rows and Board cards.
8. CLI: `saarthi checks <task>` and `saarthi proof <task>`.

"What changed" groups, comments, "Ask Codex to review" and creating the pull request are M5. They are not here. M5 adds them to the same Check and ship screen.

---

## 2. The goal in plain words

**No task reaches Review without proof.**

Today (after M3) an agent finishes and I have to run `pytest` myself, read the output, and decide. After M4 the app does this by itself. When a run ends, the checks run, and the task moves to `Review` (all green) or to `Failed` (something broke). On screen both show as **Needs you**. If it failed, I click **Let Claude fix it** and the agent gets the exact failing output.

**What I can use at the end of M4:**
- I start a task and walk away. When I come back, Home shows the task under **Needs you** with a green or red check dot.
- I open **Check and ship** and see one verdict ("Looks good", "Take a look" or "Has problems"), what passed, what failed, how big the change is, and the goals ("What done looks like") the agent thinks are met.
- I only answer the goals the agent marked **Not sure**.
- A broken change gets fixed by the agent in 1-3 clicks, without me copying any logs.
- If a check is wrong (flaky, broken upstream), I can still go on with **Review anyway**, but I must write why. The reason stays on the Proof Card.

---

## 3. Where this milestone sits

| Before (already built) | M4 adds | Unlocks next |
|---|---|---|
| M1: tasks, briefs, events, stage table `ALLOWED_MOVES`, `project.toml` reader | `[[checks]]` in `project.toml`, the `Review` stage rule | M5: "What changed" groups are built when a task enters `Review` |
| M2: runs, worktrees, `fix` mode, checkpoints, desktop notifications | Checks after `build`/`fix` runs, fix runs with failing output | M5: "Send to Claude" (comments) reuses the fix-run path |
| M3: Home, Board view, task page, statuses, Settings | Checks part of Check and ship, verdict, check dot, "Max fix tries" setting (Settings → Project) | M5: the rest of Check and ship; the PR body includes the Proof Card |

---

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Check** | One command that tests the work. Example: `uv run pytest -q`. Set in `.saarthi/project.toml`. |
| **Required check** | A check that must pass before Review. A failing optional check only shows as a warning. |
| **Check batch** | One run of all checks for a task. One batch makes one Proof Card. |
| **Proof Card** | Engine name for the summary of one check batch plus change size and goal coverage. On screen it is the checks part of **Check and ship**. |
| **Check and ship** | The one task-page screen for checking and shipping. M4 builds its top (verdict, checks, goals). M5 adds the rest. |
| **Verdict** | One of three words at the top of Check and ship: **Looks good**, **Take a look**, **Has problems**. Made by the daemon from the checks, the goals, open findings and the Trust score. |
| **Trust score** | A number 0-100 (F7.7). Shown only under "How we decided". |
| **Output tail** | The last 200 lines of a check's output ("Show output"). The full output is saved to a log file. |
| **Goal coverage** | The goal's "What done looks like" items (engine: the brief's acceptance criteria), each marked **Met** / **Not sure** / **Not met**. The agent pre-fills it. I answer only the "Not sure" ones. |
| **Gate** | The rule that decides if a task may enter `Review`. |
| **Review anyway** | Moving to `Review` with failing checks (engine: override). Needs a typed reason. |
| **Fix try** | One "Let Claude fix it" run (engine: fix round). Counted since the last green Proof Card. |
| **Side run** | A short, read-only agent call that does not move the task's stage. Used here for goal coverage. |
| **Check dot** | The small coloured dot on a Home row or Board card that shows the latest check result. |

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
- R6. A bad `[[checks]]` block (missing name, duplicate name, shell signs) is shown as an error in `saarthi checks --list` and on Check and ship. Checks do not run until it is fixed.

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
Fix it: saarthi run T-0042 --mode fix   (fix try 1 of 3)
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

**What:** One card per check batch (engine name). On screen it is the checks part of **Check and ship**. It shows:
- each check: pass / fail / skip / error, time, and "Show output";
- files changed, lines added / removed;
- tests added count;
- goal coverage ("What done looks like"): each item with **Met** / **Not sure** / **Not met** and a short note, pre-filled by the agent.

**Why:** One place that answers "is this done, and how do I know?". It also goes into the PR body in M5.

**Example:**
```
$ saarthi proof T-0042
Proof Card  T-0042  Add password reset API      (after run 01JA9..., build, claude)
Verdict   Looks good   (1 question for you: item 2 is "Not sure")
Checks
  tests  required  PASS   41.2s
  lint   required  PASS    1.1s
  types  optional  FAIL   12.8s   (does not block)
Changes   6 files   +214 / -37   tests added: 4
What done looks like  (filled by claude)
  1. met       User can ask for a reset email
  2. not_sure  Token expires after 30 minutes     "expiry is set, but no test covers it"
  3. met       Old tokens stop working
Gate      all required checks green -> Review
How we decided   trust score 73 (checks 50, goals 23, second opinion 0)
```
Answer the "Not sure" item ("That's fine"):
```
$ saarthi proof T-0042 --set 2=met --confirm
Goal coverage confirmed (3 of 3 met).
```
Or "Ask Claude to add it" (a fix run for that item):
```
$ saarthi proof T-0042 --add 2
Fix try 1 of 3. Sending 1 goal to claude... T-0042 -> Running
```

On **Check and ship**, a "Not sure" item shows a question with two buttons: **That's fine** (I accept it; it counts as met, "confirmed by you") and **Ask Claude to add it** (starts a `fix` run with that item, see F7.4). Met and Not met items need no answer.

**Rules:**
- R1. Files changed and lines are counted against the base branch, and **include new files that are not yet committed** (agents rarely commit).
- R2. **Tests added** (new rule): count the added lines that **define a test**, in files that look like test files. Test files: `tests/**`, `test_*.py`, `*_test.py`, `*.test.ts(x)`, `*.spec.ts(x)`, `*.test.js`, `*.spec.js`. Test lines: `def test_...`, `async def test_...`, `it(...)`, `test(...)`. Both lists can be changed per project in `[proof]`. A renamed test counts as added. It is a hint, not a promise.
- R3. Goal coverage is pre-filled by a short, **read-only** agent call (a side run). By default it uses the agent of the last build/fix run.
- R4. Coverage is asked for **only when all required checks pass**. When checks fail, the agent's work is not done yet, so the call would waste money. I can still ask by hand: `saarthi proof T-0042 --refresh-coverage`.
- R5. **If the coverage call fails** (agent missing, timeout, bad answer): the Proof Card is still made, the gate still works, and each item is set to `not sure` with the note "agent check failed: <reason>". The card says "Coverage: fallback". I can refresh or answer by hand.
- R6. If the goal has no "What done looks like" items, coverage is empty and the card says "The goal has no 'What done looks like' items". No agent call.
- R7. Coverage **never blocks** the gate. Only required checks do. Coverage is information for me.
- R8. When I answer, my choice replaces the agent's for that item. "That's fine" sets the item to `met`. The card shows "confirmed by you" and the time. In the CLI I may also change Met or Not met items (`--set`); the screen asks only about "Not sure" ones.
- R9. "Ask Claude to add it" starts a `fix` run with the chosen items in a "Goals to finish" section. It counts as one fix try. The task moves `Review -> Running` (core move "user sends comments to the agent").
- R10. Old Proof Cards are kept. Check and ship shows the latest; older ones are under More → History.

**Acceptance criteria:**
- AC1. A worktree with 2 changed files and 1 new untracked file shows "3 files".
- AC2. A diff that adds `def test_a` and `def test_b` in `tests/test_x.py` and `def helper` shows "tests added: 2".
- AC3. With a recorded "coverage ok" fixture, the card shows the agent's statuses for each item.
- AC4. With a recorded "garbage answer" fixture, every item shows `not sure` with "agent check failed", and the task still moves to `Review`.
- AC5. `--set 2=met --confirm` saves, emits an event, and the card shows "confirmed".
- AC6. On Check and ship, only "Not sure" items show "That's fine" / "Ask Claude to add it". Met and Not met items have no buttons.
- AC7. "Ask Claude to add it" on item 2 starts a `fix` run whose `.saarthi/context/TASK.md` has a "Goals to finish" section with item 2's text and note.

### 5.4 F7.7 — The verdict (Trust score shown as words)

**What:** The top of Check and ship shows one verdict: **Looks good**, **Take a look** or **Has problems**. The daemon makes it. Under "How we decided" the screen lists the reasons and the Trust score number (0-100).

**Why:** A new user should not have to read a formula. Three words say what to do next. The number is still there for people who want it.

**Rules (spec section 6):**

| Verdict | When |
|---|---|
| **Has problems** | A required check failed, or a high finding is open. |
| **Take a look** | Every required check passed, but a goal item is "Not met", a medium finding is open, or the score is below `TRUST_GOOD_MIN` (70). |
| **Looks good** | Every required check passed, no goal item is "Not met", no medium or high finding is open, and the score is at least `TRUST_GOOD_MIN`. |

- R1. The verdict comes from the daemon in `saarthi proof` and the proof API. The UI shows it and never works it out.
- R2. A "Not sure" item does not change the verdict by itself. It shows the question from F7.3.
- R3. Findings come from "Ask Codex to review" in M5. In M4 there are none, so only checks, goals and the score count.
- R4. The verdict **never blocks** a move. The stage rules (F2.5) still decide.
- R5. While checks run, or before the first Proof Card, there is no verdict. The screen shows "Checking..." or "Not checked yet".
- R6. `TRUST_GOOD_MIN` lives in `config.py`. It is not a user setting in v1.

**Acceptance criteria:**
- AC1. A card with a failed required check shows **Has problems**, even with all goals met.
- AC2. All required checks pass, item 2 is "Not met": **Take a look**.
- AC3. All required checks pass, all items met, score 85: **Looks good**. "How we decided" shows "85".
- AC4. A unit test covers every row of the table above, with the threshold read from `config.py`.
- AC5. A task with verdict **Has problems** can still go to Review with "Review anyway" and a reason.

### 5.5 F2.5 (Review rule) and F7.6 — The gate and "Review anyway"

**What:** A task enters `Review` only when the latest Proof Card has every required check at `pass`. Otherwise, I can use **Review anyway** with a reason (engine: override).

**Why:** The whole point of Saarthi is the proof gate. But checks can be wrong, so I need a way out that leaves a trace.

**Example:** On Check and ship (view `checkFail`), I click "Think the test is wrong? Review anyway...". A box asks: "Required checks failed: lint. Why go on?" I type "lint rule E501 broken upstream, fixed in #91" and click **Review anyway**.
```
$ saarthi task move T-0042 review --reason "lint rule E501 broken upstream, fixed in #91"
T-0042 -> Review (review anyway). Reason saved on Proof Card 01JA9...
```

**Rules:**
- R1. `Verifying -> Review` happens by itself when all required checks pass.
- R2. `Verifying -> Failed` happens by itself when a required check fails or errors.
- R3. Review anyway is a move from `Failed` to `Review`, with a reason of **at least 10 characters**. (New move. The core table only lists `Verifying -> Review`, but after a failed batch the task is already in `Failed`.)
- R4. The reason is saved on the latest Proof Card, shown on Check and ship, and in the `task.stage_changed` event.
- R5. No Review anyway while checks are still running. Not possible when there is no Proof Card yet ("run checks first").
- R6. If the project has **no required checks**, the gate passes, and Check and ship shows a warning: "No required checks - nothing was proven." (new rule, see open questions)
- R7. The gate is in the daemon. The UI and CLI only ask. A direct API call without a reason is refused.
- R8. Review anyway does not change the verdict. A task with a failed required check still shows **Has problems**.

**Acceptance criteria:**
- AC1. `task move review` on a failed task with no reason is refused with "needs a reason (10+ characters)".
- AC2. With a reason, the move works and `saarthi proof` shows "Review anyway: <reason>".
- AC3. `POST /tasks/{id}/stage {"to":"review"}` from `Failed` without a reason returns 409.
- AC4. The check dot turns amber for a card moved on with Review anyway.

### 5.6 F7.4 — Let Claude fix it

**What:** When checks fail, a **Let Claude fix it** button starts a new `fix` run. The agent gets the names, commands and output tails of the failing checks. Max tries: 3 (setting). "Claude" in the label is the agent that runs the task; with Codex it says "Let Codex fix it".

**Why:** Copying logs into a chat is the most boring part of agent work.

**Example:** On Check and ship (view `checkFail`), click **Let Claude fix it**. Next to it: "Claude gets the failing output. 3 tries left." The task page then shows view `fixing`. Or:
```
$ saarthi run T-0042 --agent claude --mode fix
Fix try 1 of 3. Sending 1 failing check (lint) to claude...
```
After the third failed try (view `fixLimit`):
```
$ saarthi run T-0042 --mode fix
Fix tries used up (3 of 3). Look at it yourself, or add --extra-round to try once more.
```

**Rules:**
- R1. A fix try = one `fix` run started since the last green Proof Card (engine: fix round).
- R2. One click is one try. The app does **not** start tries by itself (new, see open questions).
- R3. When the limit is reached, the task page shows view `fixLimit`. It offers one more try (asks for a confirm), **Review anyway**, or opening Files to fix it myself. The CLI needs `--extra-round`.
- R4. The fix run gets, for each failing required check: name, command, exit code, and output tail (cut to a safe size). Failing optional checks are listed as "also failing, not required".
- R5. The default agent is the one that made the last build/fix run. I can pick the other one.
- R6. After the fix run ends, checks run again (F7.2). The loop continues until green or the limit.
- R7. "Max fix tries" is a global setting, default 3 (settings key `max_fix_rounds`). It shows in Settings → Project (view `settingsProject`).

**Acceptance criteria:**
- AC1. The fix run's Context Pack (`.saarthi/context/TASK.md`) has a "Failing checks" section with the lint output tail.
- AC2. The 4th fix run is refused with HTTP 409 unless `extra_round_ok` is true.
- AC3. After a green card, the try counter is back to 0.

### 5.7 Check and ship (checks part) and the check dot (UI for F7.3, F7.7)

**What:** M4 builds the top of the **Check and ship** screen on the task page, and a check dot on Home rows and Board cards. M5 adds "What changed", comments, "Ask Codex to review" and the ship button below it.

**Check and ship shows (M4 part), top to bottom:**
1. The **verdict** (section 5.4) in big words, with one line why ("All checks passed. 3 of 3 goals met."). "How we decided" opens the reasons and the Trust score number.
2. **Tests and checks**: one row per check (pass / fail / skip / error, time). **Show output** opens the output tail; "Open full log" opens the whole file. When all required checks pass, the rows fold into one line "All checks passed".
3. **What done looks like**: each item with its status from the agent. "Not sure" items show the question with **That's fine** / **Ask Claude to add it**.
4. The "Review anyway" reason, if any.
5. Buttons: **Run checks again**, and when checks failed, **Let Claude fix it** with "N tries left".

**Settings → Project** (view `settingsProject`) lists the project's checks from `project.toml` (read-only, with any config error from F7.1 R6) and the "Max fix tries" field.

While checks run, the task page shows view `checks` ("Running tests and checks", a spinner per check). After a failed batch it shows view `checkFail`. Older cards are under More → History.

**Check dot colours** (on Home rows and Board cards):

| Dot | Meaning |
|---|---|
| grey | no Proof Card yet |
| blue, pulsing | checks running |
| green | all required checks pass |
| red | a required check failed |
| amber | moved to Review with Review anyway |

**Acceptance criteria:**
- AC1. The dot changes from blue to green or red without a page reload (live from events).
- AC2. "Show output" on a failed check shows its last 200 lines in a monospace box.
- AC3. Clicking "That's fine" on a "Not sure" item shows "confirmed by you".
- AC4. The verdict on screen always equals the `verdict` field from `GET /tasks/{id}/proof` (no rule in the UI).
- AC5. The Trust score number appears only inside "How we decided".

---

## 6. Main user flows

### 6.1 Build -> checks fail -> fix -> Review (the "Done when" flow)
1. Task T-0042 is `Ready` (To do). I click **Start**.
2. The run ends. Task -> `Verifying` (Working). The dot pulses blue. The task page shows `checks`.
3. `lint` fails. Task -> `Failed` (Needs you). Dot red. Notification "checks failed (lint)".
4. I open Check and ship and see **Has problems**. I click **Let Claude fix it**. Task -> `Running`.
5. The fix run ends. Checks run again. All required pass.
6. The coverage side run pre-fills "What done looks like".
7. Task -> `Review` (Needs you). Dot green. Notification "checks passed". Verdict **Looks good**.
8. One item is "Not sure". I click **That's fine**.

### 6.2 Review anyway
1. Task is `Failed` because the `e2e` check is flaky.
2. On Check and ship I click "Review anyway...", type a reason, confirm.
3. Task -> `Review`. Dot amber. Check and ship shows the reason. The verdict stays **Has problems**.

### 6.3 Fix by hand
1. Task is `Failed`. I click "Open in my editor" in Files and fix a typo.
2. **Run checks again** (or `saarthi checks T-0042`). Task -> `Verifying` -> `Review`.

---

## 7. Done when

- [ ] With a real project, a broken build run auto-moves the task to `Failed`. I click "Let Claude fix it". After the fix run, the task moves to `Review` with all required checks green. (Also covered by an integration test with FakeAdapter.)
- [ ] Moving a failed task to `Review` without a reason is refused in the UI, the CLI, and the API. With a reason, the reason shows on Check and ship and in `saarthi proof`.
- [ ] A check that hangs is killed at its timeout, with no leftover processes.
- [ ] A failing coverage call never blocks the gate (test with a garbage fixture).
- [ ] The 4th fix try needs an explicit confirm.
- [ ] The verdict comes from one pure daemon function, tested for every row of the verdict table, with `TRUST_GOOD_MIN` from `config.py`.
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run pyright` are clean.

---

## 8. Out of scope

| Item | Owner |
|---|---|
| "What changed" groups, risk tags, comments | M5 |
| Ask Codex to review (findings in the verdict) | M5 |
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
4. [ ] Check and ship: verdict **Has problems**; `lint` is red; "Show output" shows the ruff error. "Open full log" opens the whole file.
5. [ ] Click "Let Claude fix it". The line said "3 tries left". `.saarthi/context/TASK.md` in the worktree has "Failing checks".
6. [ ] After the fix, task is `Review`, dot green, "What done looks like" filled by the agent.
7. [ ] A "Not sure" item: click "That's fine". It says "confirmed by you". Another one: click "Ask Claude to add it". A fix run starts with "Goals to finish".
8. [ ] `saarthi proof T-0001 --set 1=not_met --confirm`. Verdict changes to **Take a look**. "How we decided" shows the score.
9. [ ] Break the code by hand. `saarthi checks T-0001` -> card red, task stays `Review` (R7 of 5.2).
10. [ ] Add a check `cmd = "sleep 999"`, `timeout_sec = 3`. Run checks. It shows `error` "timeout after 3s". `pgrep sleep` finds nothing.
11. [ ] Make a required check fail. Click "Review anyway...". Try a 5-character reason: refused. Type a real reason: works, dot amber, reason on Check and ship, verdict still **Has problems**.
12. [ ] `curl -X POST .../tasks/T-0001/stage -d '{"to":"review"}'` on a failed task: 409.
13. [ ] Fail 3 fix tries (FakeAdapter or a check that always fails). The task page shows `fixLimit`; one more try asks for a confirm.
14. [ ] Stop the daemon during a long check. Start it. The check is `error` "interrupted", task `Failed`.
15. [ ] Log out of the coverage agent (or rename the binary). Pass all checks. Task still reaches `Review`; coverage says "agent check failed".

---

## 10. Open questions

- Q1. **Auto fix tries.** Should the app start fix tries by itself (up to the max) without a click? Default here: no, one click = one try. The FSD's "auto-fix loop" name suggests it could. Easy to add later.
- Q2. **No required checks.** Is "gate passes with a warning" right, or should a project with no required checks block Review? Default: pass with warning.
- Q3. **Coverage only when green.** Coverage is skipped when checks fail. OK?
- Q4. **Fix tries and review fixes.** "Ask Claude to add it" (M4) and "Send to Claude" (M5) also start `fix` runs. With the R1 rule, they count toward the fix tries. Acceptable, or should tries count only check fixes?
- Q5. **Tests added** only knows Python and JS/TS patterns by default. Other languages need `[proof]` settings.
- Q6. **Secrets in check logs (milestones README, Known gap 2).** Check output can contain secrets (a test that prints a `.env` value). Until M8, logs are saved as they are, in the data folder (`<data_dir>/checks/`). Accepted risk for a single-user local tool.
- Q7. **Not sure and the score.** Spec section 6 says a "Not sure" item does not change the verdict. But F7.7 counts "Not sure" as 0 in the score, so many "Not sure" items can push the score under 70 and give **Take a look**. Default here: keep both rules as written (the score part is not about Not sure alone). Owner to confirm.

---

## 11. Effort

About **14.5 hours** (was 14; +0.5 h for the verdict and "Ask Claude to add it"). Breakdown in `TDD_M4_checks_proof_card.md` section 16.

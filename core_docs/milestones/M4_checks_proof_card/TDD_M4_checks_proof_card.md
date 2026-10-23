# TDD — M4: Checks + Proof Card

**Document type:** Technical Design Document (TDD)
**Milestone:** M4 of M0-M12 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`): verdict function (Decision 18), "Ask Claude to add it" for "Not sure" goals, the proof view becomes the checks part of Check and ship
**Estimated effort:** ~14.5 hours (1.5 weeks at 8-10 h/week)
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. Every decision says *why*.
**Related documents:** `FSD_M4_checks_proof_card.md`, `../../TDD-tech-design-doc.md` (4.3, 4.6, 5.7, 6.2, 7, 8.3, 10), `../../TECH_STACK.md`, `../M2_agent_runs_worktrees/TDD_M2_agent_runs_worktrees.md`, `../M3_desktop_ui_v1/TDD_M3_desktop_ui_v1.md`, `../M5_review_ship/TDD_M5_review_ship.md`
**Screens:** prototype views `checks`, `checkFail`, `fixing`, `fixLimit`, `check` (checks part), `settingsProject` in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. The goal in one sentence

After every `build` / `fix` run, run the project's checks in the worktree, save a Proof Card with a verdict (Looks good / Take a look / Has problems), and let the task enter `Review` only with green required checks or a typed override reason ("Review anyway").

---

## 2. Read this first — rules this work must not break

1. **All logic in the daemon** (CLAUDE.md rule 1). The gate, the round counter, coverage parsing, the Trust score and the verdict live in `checks/` and `core/`. The UI only shows.
2. **CLI first** (rule 2). `saarthi checks` and `saarthi proof` work before the Check and ship screen is built.
3. **Agents only through `AgentAdapter`** (rule 3). The coverage call goes through the adapter. No `claude`/`codex` strings outside `agents/`.
4. **Every action is an event** (rule 4). Check start/finish, proof ready, coverage confirm, override.
5. **Stage rules in one table** (rule 5). The new gate and the two new moves go into `ALLOWED_MOVES`. No `if stage == ...` elsewhere.
6. **No hard-coded values** (rule 7). Tail size, timeouts, max rounds, test patterns, `TRUST_GOOD_MIN`: `config.py` or `project.toml`.
7. **Tests first, FakeAdapter only** (rule 8). Checks themselves are real tiny commands (`python -c ...`); agents are never real.

---

## 3. What already exists (do not rebuild)

| Thing | From | What M4 uses it for |
|---|---|---|
| `ALLOWED_MOVES` + move guards in `core/stages.py` | M1 | Add the `Review` guard and two rows |
| `project.toml` reader with defaults (`config.py` / `core/project_config.py`) | M1 | Add `[[checks]]` and `[proof]` parsing |
| Event Bus with in-process listeners (`core/events.py`) | M1/M2 | Listen to `run.finished`; publish `check.*`, `proof.*` |
| `briefs.acceptance` (list of strings) | M1 | Input for goal coverage ("What done looks like") |
| Run Manager, run modes, queue, `RunRequest` | M2 | Start the coverage side run and fix runs |
| `running -> verifying` move at the end of `build`/`fix` runs (TDD 8.1 step 9) | M2 | Trigger for checks. If M2 left the task in `Running`, M4 adds this move in its listener. |
| Context Pack v0 writer (`memory/context_pack.py`) | M2 | Add an extra "Failing checks" section |
| Workspace Manager: `diff`, `checkpoint` (temp-index method, TDD 4.5.1) | M2 | Diff stats, same temp-index trick |
| Safety Guard profile -> flags (`safety/profiles.py`) | M2 | `read_only` for the coverage side run. If M2 only built `safe_build`, add the `read_only` row from TDD 4.9 here. |
| `FakeAdapter` + fixtures in `tests/fixtures/agents/` | M2 | All agent tests |
| Notifier (`core/notify.py`) | M2 | One notification per proof |
| Home, Board view, task page (status from stage), Settings, generated TS client, WS store | M3 | Checks part of Check and ship, check dot, "Max fix tries" field in Settings → Project |

---

## 4. Technical decisions

### Decision 1 — Check Runner listens to `run.finished`; Run Manager does not know about checks (new)
`checks/trigger.py` registers an in-process listener on the Event Bus. On `run.finished` with `mode in CHECK_TRIGGER_MODES` (`build`, `fix`) it schedules a check batch.
**Why:** TDD 4.3 says the Run Manager "triggers" the Check Runner. A listener gives the same result with no import from `core/runs.py` to `checks/`. M5 uses the same pattern for the change story (`change_stories`, "What changed" on screen).

### Decision 2 — Commands run without a shell (new)
`cmd` is split with `shlex.split()` and run with `asyncio.create_subprocess_exec`. Tokens `&&`, `||`, `|`, `;`, `>`, `>>`, `<` are refused at config load.
**Why:** Same spirit as CLAUDE.md rule 6 (list of args). No quoting bugs. If a user needs a pipe, `bash -c '...'` is explicit.

### Decision 3 — Kill the whole process group on timeout
Start with `start_new_session=True`, `stdin=DEVNULL`, stdout+stderr merged. On timeout: `os.killpg(pgid, SIGTERM)`, wait `CHECK_KILL_GRACE_SEC`, then `SIGKILL`. Status `error`, note `timeout after Ns`.
**Why:** `pytest -n` and `npm` start child processes. Killing only the parent leaves orphans (TDD 12).

### Decision 4 — A check batch = one Proof Card; check rows link to it (new column)
Create the `proof_cards` row (status `running`) first, then one `check_results` row per check with a new `proof_card_id` column.
**Why:** Core TDD 5.7 links `check_results` only by `run_id`, but manual batches have no run, and one run can get several batches. `proof_card_id` groups them cleanly.

### Decision 5 — New statuses `pending` / `running` on `check_results`, `running` / `ready` on `proof_cards` (new)
Core statuses `pass` / `fail` / `skip` / `error` stay the final ones.
**Why:** The UI must show "running", and daemon restart recovery must find unfinished rows (FSD 5.2 R8).

### Decision 6 — Full logs per batch: `checks/<task_id>/<proof_card_id>/<name>.log` (new)
Core TDD section 10 says `checks/<task_id>/<check>.log`. We add the batch folder.
**Why:** Keeps history. The old path would overwrite the previous batch. Log size capped at `CHECK_LOG_MAX_BYTES`; after the cap we write one line `[saarthi: log cut at N bytes]` and keep reading (to keep the tail right) but stop writing.

### Decision 7 — Diff stats include untracked files, using a temp index
`workspace.diff_stats(task)`: `GIT_INDEX_FILE=<tmp> git add -A`, then `git diff --cached --numstat <merge-base>` with the same temp index. `merge-base` = `git merge-base HEAD <base_ref>`. Binary files count as 1 file, 0 lines.
`workspace.base_ref()` (from M3, `workspace/changes.py`, Decision 23): `refs/remotes/<remote>/<default_branch>` if that ref exists, else the local `<default_branch>`. Files (M3) and M5 use the same helper for the change story, so the Proof Card and the story always count against the same base.
**Why:** Agents leave new files untracked. Plain `git diff` misses them. The temp index never touches the real index (same trick as checkpoints, TDD 4.5.1). The remote ref avoids counting upstream commits after an "Update from main" (M5) when local `main` is behind.

### Decision 8 — "Tests added" = added test-definition lines in test files (new)
From the same diff (`git diff --cached -U0 <merge-base>`): for files matching `test_globs`, count `+` lines matching any `test_patterns` regex. Defaults in `config.py`, override in `[proof]`.
**Why:** The core docs do not define it. This is cheap, explainable and language-pluggable. It is a hint, so a renamed test counting as "added" is OK.

### Decision 9 — "Side runs": stage-neutral, read-only agent calls (new)
Add run mode `coverage`. `config.SIDE_RUN_MODES = {"coverage"}`. For a side run, the Run Manager: uses profile `read_only`, does **not** move the task stage, does **not** checkpoint, and does **not** trigger checks. It is still a `runs` row (cost is recorded, F16.1) and still counts toward max parallel runs.
**Why:** Coverage needs the agent to read the worktree, but must not change the stage (task is in `Verifying`). M5 adds `story`, `commit_msg` and `review` to this set.

### Decision 10 — Structured output through `RunRequest.output_schema` (new)
Add `output_schema: Path | None` to `RunRequest` and a `structured: dict | None` field on the run result.
- `CodexAdapter`: passes `--output-schema <file>`.
- `ClaudeAdapter`: appends a "Reply with only JSON matching this schema: ..." block to the prompt.
- Both: the final message goes through `agents/structured.py: extract_json(text)` (takes the first `{...}` block, strips a ```json fence), then Pydantic validation in the caller.
**Why:** TDD 4.4 and 8.4 already plan this for the second opinion ("Ask Codex to review" on screen). Building it once here serves coverage now and M5 (story grouping, findings, commit message) later.

### Decision 11 — Coverage only after green checks; failure falls back to `not_sure` (new)
After a batch where all required checks pass, start a `coverage` side run with schema `schemas/json/brief_coverage.schema.json`. Wait up to `COVERAGE_TIMEOUT_SEC`. Then emit `proof.ready` and apply the gate. If the call fails for any reason, set every criterion to `not_sure` with note `agent check failed: <reason>` and `coverage_state = "fallback"`.
**Why:** Matches TDD 4.6 step order (coverage, then card). Skipping it on failure saves money. A failing agent must never block the gate (coverage is information, not a gate).
Agent choice: `[proof] coverage_agent = "same"` (the agent of the last build/fix run) or `"claude"` / `"codex"`.

### Decision 12 — Gate rows in `ALLOWED_MOVES`
| From | To | Guard | Who |
|---|---|---|---|
| verifying | review | `proof_green` | system (Check Runner) |
| verifying | failed | — | system |
| failed | review | `override_reason` **(new row)** | user |
| failed | verifying | `manual_checks` **(new row)** | system, when the user runs checks by hand |
| review | review (no move) | manual checks only update the card | — |

`proof_green`: latest card `status == ready` and `all_required_passed`. `override_reason`: latest card is `ready`, reason length >= `OVERRIDE_REASON_MIN_CHARS`. On success, the reason is saved on that card (`override_reason`, `overridden_at`) and in the `task.stage_changed` payload.
**Why:** FSD F7.6 needs an override, but after a failed batch the task is in `Failed`, not `Verifying` (core table row "Verifying -> Failed"). Without the new row, the override can never happen. `failed -> verifying` lets me fix by hand and re-check.

### Decision 13 — Zero required checks pass the gate with a warning (new)
`all_required_passed = True` when there are no required checks, plus `warnings: ["no_required_checks"]` on the card.
**Why:** New projects start with no checks. Blocking would make Saarthi unusable on day one. Open question in the FSD.

### Decision 14 — Fix rounds are derived, not stored
`rounds_used = count(runs where task_id = T and mode = "fix" and started_at > last_green_card.finished_at)` (or since task creation). A new fix run is allowed if `rounds_used < settings.max_fix_rounds`, or if `extra_round_ok = true`.
**Why:** No new column, no counter to get out of sync. One click = one round; nothing starts by itself.

### Decision 15 — The fix run gets failing output as an extra Context Pack section (new)
`checks/fix_loop.py: failing_checks_markdown(card) -> str` builds a `## Failing checks` section (name, command, exit code, tail cut to `FIX_TAIL_MAX_CHARS` per check). The Context Pack writer gets a new optional `extra_sections: list[str]` argument and appends them to `TASK.md`.
**Why:** TDD 4.8 says the agent reads `.saarthi/context/TASK.md`. Putting the failure there keeps one input file. M6 reuses `failing_checks_markdown()` for the `{{failing_checks}}` playbook variable.
Entry points: `POST /tasks/{id}/proof/fix` and `POST /tasks/{id}/runs` with `mode = "fix"` while the task is in `failed` with a failing card both call `start_check_fix_run()`.

### Decision 16 — One batch per task, two batches at most across tasks (new)
A per-task `asyncio.Lock`; a global `asyncio.Semaphore(MAX_PARALLEL_CHECK_BATCHES)` (default 2).
**Why:** Two `pytest` runs on one worktree fight. Many test suites at once freeze the laptop.

### Decision 17 — Trust score is computed in the daemon from the Proof Card **(new)**
`checks/trust.py: trust_score(card: ProofCard, findings: list[ReviewFinding] | None) -> int` returns 0..100 (FSD F7.7):
`round(50 * passed_required / required_total + 35 * met / criteria_total + second_part)`, where `second_part` is 0 in M4 (M5 fills it).
If a task has no required checks, the checks part counts as full (it matches the `no_required_checks` warning rule).
If the brief has no criteria, the criteria part is 0. `GET /tasks/{id}/proof` returns `trust_score` and `trust_parts: {checks, criteria, second}`.
**Why:** core FSD F7.7; all logic stays in the daemon (CLAUDE.md rule 1). It never gates a move. The UI never shows the number on its own; it shows it only under "How we decided" (spec `../../design/2026-10-23-simple-ui-design.md`, D5).
Test: `tests/unit/checks/test_trust.py` — all green 50+35, half checks 25, not-sure counts 0, no criteria → 0 for that part.

### Decision 18 — The verdict is a pure function in the daemon **(new)**
`checks/verdict.py`:
```python
class Verdict(StrEnum):
    LOOKS_GOOD = "looks_good"
    TAKE_A_LOOK = "take_a_look"
    HAS_PROBLEMS = "has_problems"

def verdict(
    required_checks: list[CheckStatus],   # final statuses of required checks
    goal_states: list[CoverageStatus],    # met / not_sure / not_met
    open_findings: list[Severity],        # severities of open review_findings
    trust_score: int,
    good_min: int,                        # config.TRUST_GOOD_MIN
) -> tuple[Verdict, list[str]]:           # verdict + reason codes for "How we decided"
```
Rules (spec section 6), checked in this order:
1. Any required check not `pass` (`skip` counts as pass, as in the gate), or any `high` open finding -> `has_problems`.
2. Any goal `not_met`, any `medium` open finding, or `trust_score < good_min` -> `take_a_look`.
3. Else -> `looks_good`.
`not_sure` goals never change the result by themselves. Reason codes: `required_failed:<name>`, `high_finding`, `goal_not_met:<index>`, `medium_finding`, `score_below:<min>`, `all_good`.
`checks/repo.py` builds the inputs from the latest card. **M4 passes `open_findings = []`** (findings arrive in M5; M5 passes the real open ones). `GET /tasks/{id}/proof` returns `verdict` and `verdict_reasons` next to `trust_score`; `proof.ready` carries `verdict`. A card with `status = running`, or no card, gives `verdict = null`.
**Why:** CLAUDE.md rule 1 — the UI holds no rule, so it cannot drift from the CLI. A pure function with plain inputs is a one-file table test, and M5 can add findings without changing it. The verdict never gates a move: `ALLOWED_MOVES` guards do not call it.
Test: `tests/unit/checks/test_verdict.py` — one parametrized case per table row and each edge: failed required + all met -> has_problems; skip-only required -> not blocked; not_met -> take_a_look; not_sure only + score >= min -> looks_good; score = min -> looks_good; score = min - 1 -> take_a_look; high finding with green checks -> has_problems; medium finding -> take_a_look; threshold read from `config.TRUST_GOOD_MIN` (monkeypatched).

### Decision 19 — "Ask Claude to add it" is a fix run with chosen goal items **(new)**
`POST /tasks/{id}/proof/fix` takes optional `criteria: [int]`. With `criteria`, the task may be in `review` (core move `review -> running`, "user sends comments / findings to the agent") or `failed`; `checks/fix_loop.py: goals_to_finish_markdown(card, criteria)` adds a `## Goals to finish` section (item text + the agent's note). Without `criteria`, the old rule holds (task `failed` with a failing card). It is one fix try (Decision 14 counts all `fix` runs). "That's fine" is just `PUT /tasks/{id}/proof/coverage` with that item set to `met` and `confirm: true`.
**Why:** Spec D7: the user answers only "Not sure" items. Reusing the fix path means no new run mode, no new table.

---

## 5. Modules and files

```
daemon/src/saarthi/
├── checks/
│   ├── __init__.py
│   ├── spec.py          # CheckSpec, ProofSettings; parse + validate [[checks]] / [proof]
│   ├── process.py       # run_one(spec, cwd, log_path) -> CheckOutcome; process group, timeout, tail
│   ├── runner.py        # run_batch(task, run_id|None) -> ProofCard; lock, semaphore, events, recovery
│   ├── stats.py         # diff stats + tests_added (calls workspace.diff_stats / diff_added_lines)
│   ├── coverage.py      # start coverage side run, parse, fallback, confirm
│   ├── gate.py          # proof_green(), override_reason() guards used by core/stages.py
│   ├── trust.py         # trust_score() (Decision 17)
│   ├── verdict.py       # verdict() pure function (Decision 18)
│   ├── fix_loop.py      # rounds_used(), failing_checks_markdown(), goals_to_finish_markdown(), start_check_fix_run()
│   ├── trigger.py       # Event Bus listener: run.finished -> run_batch
│   └── repo.py          # SQLAlchemy queries for check_results / proof_cards
├── agents/structured.py # extract_json(text) (generic, no agent names)
├── agents/claude.py     # + output_schema prompt block
├── agents/codex.py      # + --output-schema flag
├── agents/base.py       # RunRequest.output_schema, RunResult.structured
├── core/stages.py       # + rows + guards (Decision 12)
├── core/runs.py         # + SIDE_RUN_MODES handling (Decision 9)
├── workspace/git.py     # + diff_stats(), diff_added_lines() (temp index)
├── memory/context_pack.py  # + extra_sections param
├── schemas/checks.py    # Pydantic: CheckResultOut, ProofCardOut, CoverageItem, ...
├── schemas/json/brief_coverage.schema.json
├── api/routes/checks.py # /tasks/{id}/checks*, /tasks/{id}/proof*
├── cli/checks.py        # saarthi checks, saarthi proof
├── db/models.py         # + CheckResult, ProofCard
└── db/migrations/versions/<rev>_m4_checks_and_proof_cards.py

desktop/src/
├── screens/TaskPage/CheckAndShip/index.tsx   # the Check and ship screen; M4 renders the checks part, M5 adds the rest
├── components/check/Verdict.tsx         # verdict words + one line; "How we decided" (reasons, trust score)
├── components/check/CheckRow.tsx        # status, time, "Show output" tail, "Open full log"
├── components/check/GoalList.tsx        # "What done looks like"; "That's fine" / "Ask Claude to add it" on not_sure items only
├── components/check/ReviewAnyway.tsx    # reason box, min length from API error
├── components/check/FixButton.tsx       # "Let Claude fix it" + "N tries left" (agent name from the API)
├── components/check/CheckDot.tsx        # grey / blue / green / red / amber, on Home rows and Board cards
└── screens/Settings/ProjectSettings.tsx # checks list (read-only, `GET /projects/{id}/checks`) + "Max fix tries"
```
The task list/detail schema (M1) gets a computed field `proof_status: "none" | "running" | "passed" | "failed" | "overridden"` so Home and the Board view need no extra call. The task page view (`checks`, `checkFail`, `fixing`, `fixLimit`) is chosen from stage + `proof_status` + `rounds_used`/`max_rounds`, all from the API.

---

## 6. Data model changes

Migration: `<rev>_m4_checks_and_proof_cards.py` (one migration for M4).

**`check_results`** (TDD 5.7 + new columns marked *)
| Field | Type | Note |
|---|---|---|
| id | text | ULID |
| task_id | text | FK tasks |
| run_id | text | nullable (manual batch) |
| proof_card_id* | text | FK proof_cards |
| name, command | text | |
| required | bool | |
| status | text | `pending`*/`running`*/`pass`/`fail`/`skip`/`error` |
| exit_code | int | nullable |
| seconds | real | |
| output_tail | text | last `CHECK_OUTPUT_TAIL_LINES` lines |
| output_path | text | full log |
| note* | text | `timeout after 600s`, `command not found: pytest`, `interrupted` |
| started_at*, finished_at* | datetime | |

**`proof_cards`** (TDD 5.7 + new columns marked *)
| Field | Type | Note |
|---|---|---|
| id | text | ULID |
| task_id | text | FK |
| run_id | text | nullable (manual batch) |
| status* | text | `running` / `ready` |
| all_required_passed | bool | |
| files_changed, lines_added, lines_removed, tests_added | int | |
| coverage | json | `[{criterion, status: met/not_sure/not_met, note, by*: agent/user}]` |
| coverage_state* | text | `none` / `pending` / `agent` / `fallback` / `confirmed` |
| coverage_run_id* | text | the side run |
| brief_version* | int | brief version the coverage was judged on |
| warnings* | json | e.g. `["no_required_checks"]` |
| override_reason | text | nullable |
| overridden_at*, created_at*, finished_at*, confirmed_at* | datetime | |

Index: `(task_id, created_at)` on both tables (latest card per task is the hot query).

No column for the Trust score or the verdict. Both are computed on read (Decisions 17, 18), because M5 findings can change them without a new card. `coverage_state` becomes `confirmed` when no item is still `not_sure` from the agent (each "That's fine" sets one item, `by = user`).

---

## 7. Events added

| Type | Payload |
|---|---|
| `check.started` | `{proof_card_id, check_result_id, name, command, required}` |
| `check.finished` | `{proof_card_id, check_result_id, name, required, status, exit_code, seconds, note}` |
| `proof.ready` | `{proof_card_id, all_required_passed, failed_required: [names], files_changed, lines_added, lines_removed, tests_added, coverage_state, warnings, verdict}` |
| `proof.coverage_confirmed` **(new type)** | `{proof_card_id, coverage: [...]}` |

`proof.ready` can be sent again for the same card after a coverage refresh; the UI reloads the card on every `proof.ready`. The override uses the existing `task.stage_changed` with `{from, to, reason, override: true, proof_card_id}`.

---

## 8. API and CLI added

### 8.1 REST (all under `/api/v1`)
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/tasks/{id}/checks` | `{}` | `202 {proof_card_id}`; `409` if running, no worktree, run active, or config error |
| GET | `/tasks/{id}/checks` | `?proof_card_id=` (default latest) | `{proof_card_id, checks: [CheckResultOut]}`; `?list=1` returns parsed specs + config errors |
| GET | `/projects/{id}/checks` **(new sub-path)** | — | parsed specs + config errors (Settings → Project) |
| GET | `/tasks/{id}/checks/{check_result_id}/log` **(new sub-path)** | — | `text/plain` full log |
| GET | `/tasks/{id}/proof` | `?history=1` | `ProofCardOut` (with checks, `rounds_used`, `max_rounds`, `trust_score`, `trust_parts`, `verdict`, `verdict_reasons`) or list |
| PUT | `/tasks/{id}/proof/coverage` **(new sub-path)** | `{items: [{index, status, note?}], confirm: true}` | `ProofCardOut` |
| POST | `/tasks/{id}/proof/coverage` **(new sub-path)** | `{agent?}` | `202 {run_id}` (re-ask the agent) |
| POST | `/tasks/{id}/proof/fix` **(new sub-path)** | `{agent?, extra_round_ok?: bool, criteria?: [int]}` | `201 RunOut`; `409 {code: "max_rounds", rounds_used, max_rounds}`; `criteria` = "Ask Claude to add it" (Decision 19) |

Changed (owned by M1/M2, small additions): `POST /tasks/{id}/stage` accepts `reason` (already in core API) and returns `409 {code: "gate", failed_required, needs_reason: true}`; `POST /tasks/{id}/runs` with `mode = "fix"` accepts `extra_round_ok`.

### 8.2 CLI
| Command | Options | Output |
|---|---|---|
| `saarthi checks <task>` | `--list`, `--log <name>`, `--no-wait`, `--json` | Live line per check (from WS events), then gate result and next step |
| `saarthi proof <task>` | `--set N=status[:note]` (repeat), `--confirm`, `--add N` (repeat; "Ask Claude to add it"), `--refresh-coverage [--agent X]`, `--history`, `--json` | The card with verdict and "How we decided" (FSD 5.3 example) |
| `saarthi task move <task> review` | `--reason "..."` (M1 command; option already planned) | `T-0042 -> Review (review anyway)` |
| `saarthi run <task> --mode fix` | `--extra-round` (new option on the M2 command) | `Fix try 2 of 3 ...` |

Exit codes for `saarthi checks`: 0 all required pass, 1 a required check failed, 2 could not run (config error, 409).

---

## 9. Key flows

### 9.1 Auto checks after a build run
1. Run Manager publishes `run.finished {mode: "build"}`; task is `verifying` (M2).
2. `trigger.py` calls `runner.run_batch(task, run_id)`.
3. Take the task lock (else skip: a batch is already running) and the global semaphore.
4. Load specs. Config error -> card `ready`, `all_required_passed=false`, warning `config_error`, task -> `failed`.
5. Insert card (`running`) and rows (`pending`). For each spec (or `gather` if `checks_parallel`): `check.started` -> `process.run_one()` -> update row -> `check.finished`.
6. `stats.compute(task)` fills diff numbers and `tests_added`.
7. If all required pass: `coverage.fill(card)` (Decision 11). Else `coverage_state = "none"`.
8. Card -> `ready`, emit `proof.ready`, then `stages.move(task, "review" | "failed", actor="system")`.
9. Notifier sends one desktop notification.

### 9.2 Let Claude fix it
1. `POST /tasks/{id}/proof/fix`. Task must be `failed` with a failing latest card (or, with `criteria`, `review` / `failed`: Decision 19).
2. `rounds_used() >= max` and not `extra_round_ok` -> 409.
3. `failing_checks_markdown(card)` (and `goals_to_finish_markdown()` when `criteria` is set) -> `extra_sections`.
4. Run Manager starts a `fix` run (agent = request or last builder). Task `failed -> running`.
5. On `run.finished`, flow 9.1 runs again.

### 9.3 Review anyway (engine: override)
1. `POST /tasks/{id}/stage {to: "review", reason}`.
2. `ALLOWED_MOVES[(failed, review)]` guard `override_reason`: card ready, reason long enough.
3. Save reason on the card, emit `task.stage_changed {override: true, reason}`.

### 9.4 Daemon start recovery
1. Find cards with `status = running`.
2. Rows `pending`/`running` -> `error`, note `interrupted`.
3. Card -> `ready`, `all_required_passed = false`, emit `proof.ready`; task in `verifying` -> `failed`.

---

## 10. Config added

**`config.py`**
| Constant | Default |
|---|---|
| `CHECK_TRIGGER_MODES` | `{"build", "fix"}` |
| `SIDE_RUN_MODES` | `{"coverage"}` (M5 adds more) |
| `CHECK_DEFAULT_TIMEOUT_SEC` | `600` |
| `CHECK_KILL_GRACE_SEC` | `5` |
| `CHECK_OUTPUT_TAIL_LINES` | `200` |
| `CHECK_LOG_MAX_BYTES` | `20_000_000` |
| `CHECKS_DIR` | `<data_dir>/checks` |
| `MAX_PARALLEL_CHECK_BATCHES` | `2` |
| `CHECK_CMD_FORBIDDEN_TOKENS` | `("&&", "||", "|", ";", ">", ">>", "<")` |
| `CHECK_NAME_PATTERN` | `r"^[A-Za-z0-9_-]{1,40}$"` |
| `COVERAGE_TIMEOUT_SEC` | `180` |
| `FIX_TAIL_MAX_CHARS` | `6000` (per check) |
| `OVERRIDE_REASON_MIN_CHARS` | `10` |
| `TRUST_GOOD_MIN` | `70` (verdict threshold, Decision 18; not a user setting) |
| `DEFAULT_REMOTE` | from M3 (used by `base_ref`) |
| `DEFAULT_MAX_FIX_ROUNDS` | `3` (settings key `max_fix_rounds`, F21.1) |
| `DEFAULT_TEST_GLOBS` | `["tests/**", "**/test_*.py", "**/*_test.py", "**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx", "**/*.test.js", "**/*.spec.js"]` |
| `DEFAULT_TEST_PATTERNS` | `[r"^\s*(async\s+)?def test_\w*", r"^\s*(it|test)(\.\w+)?\("]` |

**`project.toml`**
```toml
[project]
checks_parallel = false        # new

[[checks]]                     # core TDD 10.1 + `enabled` (new)
name = "tests"
cmd = "uv run pytest -q"
required = true
timeout_sec = 600
enabled = true

[proof]                        # new section
coverage_agent = "same"        # "same" | "claude" | "codex"
test_globs = ["tests/**"]      # replaces the default list when set
test_patterns = ['^\s*def test_']
```

---

## 11. Error handling

| Case | What we do |
|---|---|
| `[[checks]]` invalid | Batch not run. Card `ready`, warning `config_error` with the message. Task -> `failed`. `--list` shows the error. |
| Program not found | Row `error`, note `command not found: <prog>`. Blocks if required. |
| Timeout | Kill process group (Decision 3). `error`, note `timeout after Ns`. |
| Worktree folder missing | 409 for manual; for auto, card with warning `worktree_missing`, task -> `failed`. |
| Log disk write fails | Row still saved with the tail; `output_path` null; note `log not saved`. |
| Coverage agent not ready / timeout / bad JSON | Fallback (Decision 11). The raw final message stays in the run log. |
| Coverage answer has the wrong number of items | Match by index; missing -> `not_sure` "agent gave no answer"; extra items dropped. |
| Checks requested while a run is active | 409 `run_active`. |
| Fix requested but latest card is green (and no `criteria`) | 409 `nothing_to_fix`. |
| `criteria` index not in the card's coverage | 422 `unknown_criterion`. |
| Review anyway (override) with short reason / no card / checks running | 409 with `code` `reason_too_short` / `no_proof` / `checks_running`. |
| Daemon restarts mid-batch | Flow 9.4. |

---

## 12. Tests to write

All agent calls use `FakeAdapter`. Checks run real tiny commands (`python -c`, `sleep`) in `tmp_path` git repos.

| File | Proves |
|---|---|
| `tests/unit/checks/test_spec.py` | Defaults, unique names, name pattern, forbidden tokens, `enabled=false` -> skip, `[proof]` overrides |
| `tests/unit/checks/test_process.py` | pass / fail exit codes; timeout kills a grandchild (`python -c` that spawns `sleep`; assert pid gone); tail = last 200 lines; log cap; `stdin` closed; command not found |
| `tests/unit/checks/test_stats.py` | Untracked file counted; numstat sums; binary file; `tests_added` counts only defs in test files; custom `[proof]` patterns |
| `tests/unit/checks/test_coverage_parse.py` | Valid JSON; fenced JSON; garbage -> fallback; count mismatch; empty acceptance -> no call |
| `tests/unit/agents/test_structured.py` | `extract_json` cases; Claude prompt block added; Codex `--output-schema` in args |
| `tests/unit/core/test_stage_review_gate.py` | Every new row: green -> review; red -> blocked; override short/long; no card; checks running; failed -> verifying on manual checks |
| `tests/unit/checks/test_trust.py` | Decision 17 parts |
| `tests/unit/checks/test_verdict.py` | Decision 18: every row of the verdict table and each edge case; threshold from config |
| `tests/unit/checks/test_fix_loop.py` | `rounds_used` resets after green; 4th round 409; `extra_round_ok`; markdown section content and size cut; `criteria` from `review` -> "Goals to finish" section, counts as a try |
| `tests/integration/test_checks_flow.py` | FakeAdapter build (`claude_build_ok.jsonl`) -> checks fail (check reads a marker file) -> fix run (FakeAdapter `on_finish` hook writes the marker) -> checks pass -> coverage (`claude_coverage_ok.jsonl`) -> `review`. This is the "Done when" test. |
| `tests/integration/test_coverage_fallback.py` | `claude_coverage_garbage.jsonl` -> all `not_sure`, task still reaches `review` |
| `tests/integration/test_checks_recovery.py` | Card left `running` in DB -> start-up recovery -> `error` "interrupted", task `failed` |
| `tests/api/test_checks_api.py`, `tests/api/test_proof_api.py` | Each endpoint, status codes, 409 codes, log endpoint |
| `tests/cli/test_cli_checks.py` | `checks`, `--list`, exit codes; `proof --set --confirm`; `task move --reason` (same pattern as M1 CLI tests) |
| `tests/api/test_proof_api.py` (more) | `verdict` and `verdict_reasons` in the response; `verdict = null` while running |
| `desktop/src/components/check/*.test.tsx` (Vitest) | Dot colours per `proof_status`; verdict shows the API value; trust number only inside "How we decided"; buttons only on `not_sure` items; "That's fine" sends PUT; "Ask Claude to add it" sends `criteria`; Review anyway box shows API error |

New fixtures (record once with real agents via the M0 recording script, then commit): `claude_coverage_ok.jsonl`, `codex_coverage_ok.jsonl`, `claude_coverage_garbage.jsonl`. If M2's `FakeAdapter` has no hook to change files at the end of a replay, add an optional `on_finish: Callable[[Path], None]` (tests only).

---

## 13. Manual verification

1. Add the three checks from FSD section 9 to a real project.
2. Run a real Claude build on a small task that breaks lint on purpose (ask it to add a long line). Watch: `Verifying` -> `Failed`, red dot, notification.
3. Click "Let Claude fix it". Open `<worktree>/.saarthi/context/TASK.md`: "Failing checks" is there.
4. After green: goals pre-filled, task `Review`, verdict shown. Answer a "Not sure" item.
5. Run the QA checklist items 9-14 from the FSD.
6. Run `uv run pytest`, `uv run ruff check .`, `uv run pyright` and paste the output in the milestone review note.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Checks need env the daemon lacks (PATH from `.bashrc`, `uv` not found when the daemon runs as a background service in M9) | `command not found` note says which program; Settings → Health (M3) already lists tools. M9 sets PATH for the service on each OS. |
| Coverage call queued behind 4 running agents delays `Review` | Timeout -> fallback; the task does not hang. |
| Agent says `met` when it is not | Coverage never gates; the verdict only informs; I can change any item in the CLI. |
| Users read "Looks good" as "safe to ship" | The verdict never gates; "How we decided" lists the reasons; required checks still gate Review. |
| Heavy test suites slow the laptop | `MAX_PARALLEL_CHECK_BATCHES = 2`. |
| Claude ignores "reply with JSON only" | `extract_json` tolerates fences and text around; fallback otherwise. |
| Secrets in check logs | Accepted until M8 (Known gap 2). |

---

## 15. What this milestone does not do

- No "What changed" groups, risk tags, Ask Codex to review, ship (M5). The verdict takes findings as input, but M4 always passes none.
- No automatic fix rounds without a click.
- No running a subset of checks.
- No screenshots, video or trace (F7.5 is M11) and no API recordings (F7.8, Later).
- Hook for M11: keep the batch as an ordered list of steps and `CheckSpec` easy to extend. M11 adds a `kind` (`cmd` / `e2e` / `live`), an `artifacts` column, a dev server step and a Live test side run (`live_test`) after the required checks. M4 code needs no change now.
- No secret masking of logs (M8).
- No `{{failing_checks}}` playbook variable (M6 uses `failing_checks_markdown()`).

---

## 16. Effort breakdown

| Task | Hours |
|---|---|
| `CheckSpec` parsing, config constants | 0.5 |
| `process.py` (process group, timeout, tail, log) + tests | 2.5 |
| Diff stats + `tests_added` + tests | 1.0 |
| Models, migration, repo, events | 1.0 |
| Gate rows, override, recovery + tests | 1.5 |
| Side runs, `output_schema`, coverage + fallback + fixtures | 2.5 |
| Fix loop + rounds + Context Pack section | 1.5 |
| API + CLI | 1.5 |
| Check and ship (checks part), verdict view, dot, Review anyway box, Settings → Project | 1.5 |
| Verdict function + table tests; "Ask Claude to add it" (`criteria`) | 0.5 |
| Manual verification / dogfood | 0.5 |
| **Total** | **14.5** |

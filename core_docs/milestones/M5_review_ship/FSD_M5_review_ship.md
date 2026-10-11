# FSD — M5: Review + Ship

**Document type:** Functional Specification Document (FSD)
**Milestone:** M5 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux)
**Status:** Draft — awaiting review
**Version:** 0.1
**Date:** 2026-10-11
**Estimated effort:** ~22 hours (2 weeks in MILESTONES.md ≈ 16-20 h; includes ~2.5 h for F6.5 "Update from main", which MILESTONES.md does not list)
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M5_review_ship.md`, `../../FUNCTIONAL_SPECIFICATIONS.md` (F2.5, F6.5, F6.6, F8, F10, F11), `../../TDD-tech-design-doc.md` (4.5, 4.7, 5.8, 8.4, 8.5, 15), `../M4_checks_proof_card/FSD_M4_checks_proof_card.md` (before), `../M6_research_memory_playbooks/FSD_M6_research_memory_playbooks.md` (next)

---

## 1. What this document covers

This document covers M5 only:

1. **Change Story**: the diff grouped by purpose, with short explanations, risk flags, a diff viewer and a plain file list.
2. **Comments** on lines or groups, and "Send comments to agent".
3. **Second Opinion**: the other agent reviews the work, read-only, and returns findings. "Fix these".
4. **Approve / Reject**.
5. **Ship**: commit message draft, commit, push (never to the default branch), PR with `gh`.
6. **Worktree cleanup** prompt after ship or archive.
7. **Update from main** (F6.5): bring the base branch into the task branch; a conflict can become a fix run.
8. The `Shipped` stage rule.
9. CLI: `saarthi review <task>`, `saarthi ship <task>`, `saarthi workspace sync|remove <task>`.

Memory updates on ship are M6. M5 only leaves a place for them in the ship steps.

---

## 2. The goal in plain words

**Review fast and create the PR from Saarthi.**

After M4, a task reaches `Review` with green checks. Then I still read a raw diff file by file, and I open a terminal to commit, push and run `gh pr create`. After M5, the Review tab tells the story of the change ("New API endpoint", "Tests"), points at risky parts (a migration, a new dependency), lets the other agent look for bugs, and ships a PR with one button.

**What I can use at the end of M5:**
- I read a Change Story instead of a raw diff, and leave comments that go straight to the agent.
- I ask Codex to review Claude's work (or the other way round) and send its findings back as a fix run.
- I ship a real client PR from Saarthi: good commit message, branch pushed, PR body with brief, story and proof.
- The app cannot push to `main`, even if I call the API by hand.
- I can update my task branch from `main` and let the agent solve conflicts.

---

## 3. Where this milestone sits

| Before (already built) | M5 adds | Unlocks next |
|---|---|---|
| M2: worktrees, checkpoints, `diff()`, `sync_with_base()` stub, `fix` runs | Change Story from a checkpoint, push guard, sync with conflicts | M6: memory updates hook into the ship steps |
| M3: Task Room tabs, CodeMirror read-only | Review tab with CodeMirror merge view | M7: Race compare shows two Change Stories |
| M4: Proof Card, gate, side runs, `output_schema` | Story, findings and commit-message side runs; Proof Card in PR body | M8: rewind uses the same checkpoints |

---

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Hunk** | One block of changed lines in a diff. A file can have many hunks. |
| **Group** | A set of hunks that serve one purpose, with a 1-2 line explanation. |
| **Change Story** | All groups + risk flags for one exact state of the code. |
| **Risk flag** | An automatic warning on a risky change, found by rules (no AI). |
| **Folder fallback** | When the agent cannot group the changes, we group them by folder instead. |
| **Second Opinion** | A read-only review by the *other* agent. |
| **Finding** | One problem the reviewer found: file, line, severity, reason. |
| **Builder** | The agent that did the last build/fix run on the task. |
| **Default branch** | The project's main branch (`main`, `master` or `develop`). Never pushed to. |
| **Push guard** | Code in the Workspace Manager that refuses any push except the task's own branch. |
| **Sync** | "Update from main": rebase or merge the default branch into the task branch. |

---

## 5. Features

### 5.1 F10.1 — Grouped changes (Change Story)

**What:** When a task enters `Review`, the app builds a Change Story. The builder agent groups the hunks by purpose and writes 1-2 lines per group.

**Why:** A diff sorted by file name hides the "why". Groups let me read the change like a story.

**Example:**
```
$ saarthi review T-0042
Change Story  T-0042  Add password reset API      (grouped by claude, 6 files, +214 / -37)
Risk flags: [migration] alembic/versions/3f2a_reset_tokens.py   [dependency] pyproject.toml

g1  New reset endpoints  (3 hunks)
    Adds POST /auth/reset and POST /auth/reset/confirm. Tokens are hashed before saving.
    app/api/auth.py  +88 -4
g2  Database change  (1 hunk)
    New table reset_tokens with an expiry column.
    alembic/versions/3f2a_reset_tokens.py  +41
g3  Tests  (2 hunks)
    Covers happy path, expired token, reused token.
    tests/test_reset.py  +79
Second Opinion: not asked yet.   Comments: 0.   Decision: none.
```

**Rules:**
- R1. The story is built from a **checkpoint** of the worktree, so it matches one exact state of the code.
- R2. The grouping call is a short **read-only side run** of the builder agent. It does not change the stage.
- R3. Every hunk must be in exactly one group. Hunks the agent forgot go to a group "Other changes".
- R4. If the agent answer is invalid, or it placed fewer than 80% of hunks, or the call fails, the app uses **folder fallback**: one group per folder, explanation "Changes in `app/api/`". The story says "grouped by folder".
- R5. If the diff is too big for the agent (over the size limit), the app uses folder fallback directly and says why.
- R6. A new story is built each time the task enters `Review` again (after a fix run). Old stories are kept.
- R7. I can rebuild the story by hand: `saarthi review T-0042 --rebuild`.

**Acceptance criteria:**
- AC1. With the recorded "story ok" fixture, the story has the agent's groups and every hunk is placed once.
- AC2. With the "garbage" fixture, the story is grouped by folder and says so.
- AC3. A task entering `Review` gets a story without any click.

### 5.2 F10.2 — Risk flags

**What:** Rule-based flags, no AI, on: DB migrations, deleted files, auth/security code, dependency files, config/env/CI files, big files (over 300 changed lines).

**Why:** These are the changes that break production. They must jump out.

**Example:** In the Review tab, the top bar shows chips: `migration (1)`, `dependency (1)`. Clicking a chip scrolls to the file.

**Rules:**
- R1. Patterns have defaults in the app. A project can change them in `.saarthi/project.toml` `[risk]`.
- R2. A project key **replaces** the default list for that kind (so I can remove a false alarm). Missing keys keep the default.
- R3. A file can have more than one flag.
- R4. Flags are shown on the group and on the file, and listed in the PR body.

**Acceptance criteria:**
- AC1. A diff that deletes a file, touches `app/auth/login.py`, edits `package.json`, adds `alembic/versions/x.py`, edits `.github/workflows/ci.yml`, and changes 350 lines in one file gets all six kinds.
- AC2. `[risk] auth_paths = []` in `project.toml` removes the auth flag.

### 5.3 F10.3 and F10.6 — Diff view and plain file list

**What:** In the **Review** tab: groups on the left; on the right, the diff of the selected group or file in a read-only CodeMirror merge view (side by side or unified, a toggle). A **Files** toggle shows a plain "files changed" list with +/- counts.

**Why:** Some changes are easier to read by group, some by file.

**Rules:**
- R1. Read-only. Editing is not part of review.
- R2. New files show as all-added; deleted files as all-removed; binary files as "binary file changed".
- R3. Risk flags and findings show next to the lines they point at.

**Acceptance criteria:**
- AC1. Clicking a group shows only that group's hunks.
- AC2. The Files toggle lists every changed file with counts that match `saarthi review --json`.

### 5.4 F10.4 — Comments and "Send comments to agent"

**What:** I can comment on a line (in the diff gutter) or on a whole group. "Send comments to agent" starts a `fix` run with all selected comments.

**Why:** Review feedback should go to the agent in one click, with file and line attached.

**Example:**
```
$ saarthi review T-0042 --comment app/api/auth.py:57 --text "Use constant-time compare here"
Comment c-01JB... added.
$ saarthi review T-0042 --send --all-open
Sending 2 comments to claude as a fix run... run 01JB... started. T-0042 -> Running
```

**Rules:**
- R1. Line comments are on the **new** side of the diff. For deleted lines, comment on the group.
- R2. Sending starts a `fix` run with the builder agent (I can pick the other). The task moves `Review -> Running`.
- R3. Sent comments show as "sent" with a link to the run. When that run finishes without error, they become "resolved".
- R4. After the fix run, checks run again (M4). If green, the task returns to `Review` and gets a new story.

**Acceptance criteria:**
- AC1. The fix run's `.saarthi/context/TASK.md` has a "Review comments" section with file, line, the code line, and my text.
- AC2. Sending with nothing selected is refused.

### 5.5 F8.1-F8.3 — Second Opinion

**What:** "Get second opinion" starts a read-only review run with the **other** agent. It returns findings: file, line, severity (high / medium / low), short reason. Findings show in the Change Story. I tick some and click "Fix these"; the builder gets them as a new fix run.

**Why:** Two different models catch different bugs. The reviewer must not change code.

**Example:**
```
$ saarthi review T-0042 --second-opinion
Builder: claude. Reviewer: codex (read-only). Run 01JB... started.
...
3 findings:
  f1  high    app/api/auth.py:57    Token compare is not constant-time.
  f2  medium  app/api/auth.py:91    Expired tokens are never deleted.
  f3  low     tests/test_reset.py   No test for a wrong email.
$ saarthi review T-0042 --send --ids f1,f2
```

**Rules:**
- R1. Reviewer = the agent that is **not** the builder. If that agent is not installed or not logged in, the app says so; I may pick the same agent on purpose (`--agent claude`), and the story marks it "same-agent review".
- R2. The reviewer runs with the `read_only` profile. The task stays in `Review`.
- R3. Codex returns findings through a fixed JSON Schema. Claude is asked for the same JSON shape.
- R4. Bad items in the answer are dropped; good items are kept. An answer with no valid JSON shows "Second opinion gave no usable answer" with a link to the run.
- R5. "No findings" is a valid result and shows as "No issues found".
- R6. A finding can be **ignored** (it stays visible, greyed out). Ignored and open counts go in the PR body.
- R7. "Fix these" works like "Send comments" (5.4), and both can be sent together in one run.

**Acceptance criteria:**
- AC1. With builder `claude`, the review run uses `codex`, profile `read_only`, mode `review`.
- AC2. The recorded Codex findings fixture creates 3 findings; the task stays in `Review`.
- AC3. "Fix these" with f1 starts a `claude` fix run with a "Findings to fix" section; f1 shows "sent".

### 5.6 F10.5 — Approve / Reject

**What:** **Approve** the whole task, or **Reject** with a note.

**Rules:**
- R1. Approve is saved on the current story. Ship needs an approved story.
- R2. If the code changes after approval (a fix run, a sync), a new story is built and must be approved again.
- R3. Reject needs a note. The task moves `Review -> Ready`. The worktree and branch stay. The note shows in the Task Room.

**Acceptance criteria:**
- AC1. Ship before approve is refused with "approve the review first".
- AC2. Reject without a note is refused; with a note the task is `Ready`.

### 5.7 F11.1 — Commit

**What:** The agent drafts a commit message (cheap, read-only). I edit and confirm. The app commits in the worktree.

**Example:** Click **Ship**. A dialog shows:
```
feat(auth): add password reset API

- New reset endpoints with hashed, expiring tokens
- New table reset_tokens
- Tests for happy path, expired and reused tokens

Task: T-0042
```
I edit, tick "Create PR", click **Commit and ship**.

**Rules:**
- R1. Style follows `commit_style` in `project.toml` (`conventional` by default, or `plain`).
- R2. If the draft call fails, the app fills a simple template (`feat: <task title>` + group titles) so ship never waits on the agent.
- R3. Saarthi's own files (`.saarthi/context/`) are never committed.
- R4. Git hooks in the repo run as normal. If a hook fails, ship stops and shows the hook output. No `--no-verify`.
- R5. If the agent already made commits on the branch, they are kept; the app commits only what is left. If nothing is left and the branch is ahead, it just pushes.

### 5.8 F11.2 — Push and PR

**What:** Push the task branch to `origin`. Create a PR with `gh pr create`. The PR body = brief + Change Story + Proof Card (+ Second Opinion summary).

**Example:**
```
$ saarthi ship T-0042
Draft commit message (from claude) opened in $EDITOR...
Committed 7c1e9a2  feat(auth): add password reset API
Pushed saarthi/T-0042-password-reset -> origin
PR #118 https://github.com/acme/billing-api/pull/118
T-0042 -> Shipped.
Delete the worktree ~/.local/share/saarthi/worktrees/billing-api/T-0042? Branch is kept. [y/N]
```

**Rules:**
- R1. Ship needs: stage `Review`, an approved story, the code unchanged since that story, no active run, no sync in progress.
- R2. PR base = the default branch, head = the task branch.
- R3. The PR body lists check names and results, not their output (output can hold secrets until M8).
- R4. If `create_pr = false` in `project.toml` (or I untick it), ship stops after push.
- R5. If one step fails (for example `gh` not logged in), the earlier steps stay done. Running ship again continues from the failed step. If a PR for the branch already exists, the app uses it.
- R6. After a rebase sync, a branch that was pushed before needs a forced push. That is only allowed with an explicit `--force-with-lease`, and only for the task branch.

### 5.9 F11.3 and F2.5 (`Shipped` rule) — Never push to the default branch

**What:** The push code refuses any branch that is the default branch, a protected name (`main`, `master`, `develop`), the remote's default branch, or not a `saarthi/` task branch. The `Shipped` stage needs a commit, a push, and a PR when the project uses PRs.

**Why:** The one mistake that must be impossible.

**Rules:**
- R1. The check lives in the Workspace Manager's push function, the only place in the code that runs `git push`. The UI and API do not have their own copy.
- R2. The push always names the branch on both sides (`saarthi/T-0042-x:saarthi/T-0042-x`), so git settings cannot redirect it.
- R3. I cannot drag a card to `Shipped`. Only the ship flow moves it.

**Acceptance criteria:**
- AC1. A test calls the API directly in four ways (task branch set to `main` in the DB; project default branch set to the task branch; the task branch's upstream set to `origin/main`; an extra `branch: "main"` in the ship body). Every time, `main` on the test `origin` is unchanged.
- AC2. A test proves no other file in `daemon/src` passes `"push"` to git.

### 5.10 F6.6 — Worktree cleanup

**What:** After ship (and when a task is archived), the app asks: "Delete the worktree? The branch is kept."

**Rules:**
- R1. Only the worktree folder goes. The branch and checkpoints stay.
- R2. If the worktree has uncommitted changes, the app warns and needs a second confirm.
- R3. Saying "no" is fine; I can delete later with `saarthi workspace remove T-0042`.

### 5.11 F6.5 — Update from main

**What:** "Update from main" brings the latest default branch into the task branch (rebase or merge, from `sync_strategy`). On a conflict, I can start a `fix` run to solve it, or abort.

**Why:** Long tasks fall behind `main`. Shipping a stale branch makes a messy PR.

**Example:**
```
$ saarthi workspace sync T-0042
Checkpoint saved (before-sync). Fetching origin/main... rebasing...
Conflict in 2 files: app/api/auth.py, app/models.py
Next: saarthi workspace sync T-0042 --fix     (agent solves it)
   or saarthi workspace sync T-0042 --abort   (back to how it was)
```

**Rules:**
- R1. A checkpoint is saved first. Nothing can be lost.
- R2. Uncommitted agent work is kept safe during the sync and put back after.
- R3. Not allowed while a run or checks are active.
- R4. On conflict, the task keeps its stage and shows a "Sync conflict" banner. `--fix` starts a `fix` run with the conflict files and the instructions to finish the rebase or merge.
- R5. After a clean sync that changed code, if the task was in `Review` or `Failed`, checks run again (the task goes to `Verifying`), and a new story will be built.
- R6. No remote? The app syncs from the local default branch.

**Acceptance criteria:**
- AC1. Clean rebase: the branch has the new `main` commit; uncommitted changes are still there.
- AC2. Conflict then `--abort`: the worktree is exactly as before (same files, same uncommitted changes).
- AC3. Conflict then `--fix`: a fix run starts with a "Merge conflicts" section listing both files.

---

## 6. Main user flows

### 6.1 Review and ship (the main flow)
1. T-0042 enters `Review` (M4). The story is built. Notification "story ready".
2. I open the Review tab, read groups, check risk flags.
3. Click **Get second opinion**. Codex returns 2 findings.
4. Tick f1, add one line comment. Click **Fix these + send comments**. Task -> `Running`.
5. Fix run ends -> checks green -> `Review` -> new story.
6. Click **Approve**. Click **Ship**. Edit the message. Confirm.
7. Commit, push, PR. Task -> `Shipped`. Dialog: delete worktree? Yes.

### 6.2 Update from main with a conflict
1. Task in `Review` is behind `main` by 5 commits (shown in the workspace panel, M3).
2. Click **Update from main**. Conflict in 1 file.
3. Click **Let agent fix**. Fix run ends -> checks -> `Review` -> new story -> approve -> ship.

### 6.3 Reject
1. Story shows the agent built the wrong thing.
2. Click **Reject**, write "Use the existing email service, not a new one". Task -> `Ready`.
3. I edit the brief and start a new build run.

---

## 7. Done when

- [ ] I ship a real PR for a client project fully from Saarthi (story, approve, commit, push, PR), without a terminal.
- [ ] Second Opinion finds at least one real issue in a test task with a planted bug, and "Fix these" -> checks -> new story works.
- [ ] Pushing to `main` is impossible even from the API directly: the four-way test in 5.9 AC1 passes against a local bare repo as `origin`.
- [ ] All ship tests use a local bare repo and a stub `gh`. No test touches GitHub.
- [ ] Update from main works for clean, conflict + abort, and conflict + fix.
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run pyright` are clean.

---

## 8. Out of scope

| Item | Owner |
|---|---|
| Memory updates on ship (F12.3) | M6 (M5 leaves a hook in the ship steps) |
| Race compare of two stories | M7 |
| Rewind to a checkpoint (F14.3) | M8 |
| Secret masking (F15.4) | M8 |
| PR status, CI, GitHub review comments (F11.4) | Later |
| Squashing agent commits | Not planned |
| Editing code inside the diff view | Not planned (Code Peek small edits are M3) |
| Draft PRs, reviewers, labels on the PR | Later |

---

## 9. QA checklist

Use a test repo with a local bare `origin` (`git init --bare /tmp/origin.git`) and a stub `gh` first, then repeat steps 9-12 on a real client repo.

1. [ ] Move a task to `Review` (M4 flow). Review tab shows groups, explanations, file list.
2. [ ] Rename the agent binary, rebuild the story. It says "grouped by folder".
3. [ ] Add a migration file, delete a file, edit `package.json`. Matching chips appear.
4. [ ] Toggle side-by-side / unified. Toggle Files view. Counts match `saarthi review --json`.
5. [ ] Add a line comment and a group comment. Send. Task `Running`; TASK.md has both.
6. [ ] Plant a bug (`==` on a token). Get second opinion. A finding points at it. "Fix these". After the run, the finding shows "sent", the new story has no such code.
7. [ ] Ignore a finding. It greys out. It is counted as "ignored" in the PR body preview.
8. [ ] Click Ship before Approve: refused. Approve, then edit a file by hand, then Ship: refused "code changed since review".
9. [ ] Approve, Ship. Commit message dialog. `.saarthi/context/` not in the commit (`git show --stat`).
10. [ ] PR body has brief, groups, risk flags, checks table, override reason (if any).
11. [ ] Log out of `gh` (`gh auth logout`). Ship: commit + push done, PR fails with the fix command. Log in, ship again: only the PR step runs.
12. [ ] Cleanup dialog: yes -> folder gone, `git branch` still has the branch.
13. [ ] `curl` the ship endpoint with `{"branch":"main"}`: 422. `git -C /tmp/origin.git log main` unchanged.
14. [ ] Push a new commit to `origin/main`. Update from main (rebase). Branch is up to date; uncommitted work still there.
15. [ ] Make a conflict. Sync -> conflict. Abort -> same as before. Sync again -> `--fix` -> fix run -> checks -> `Review`.

---

## 10. Open questions

- Q1. **F6.5 placement (milestones README, Known gap 1).** "Update from main" is "Must" in the FSD but was in no milestone. It is placed here, adding ~2.5 hours to the MILESTONES.md estimate.
- Q2. **Approval resets** when the code changes (5.6 R2). Right, or too strict for tiny fixes?
- Q3. **Review -> Verifying after sync** is a new stage move (TDD Decision 13). OK?
- Q4. **Forced push after rebase** only with `--force-with-lease` on the task branch. OK, or should sync default to merge once a branch was pushed?
- Q5. **Same-agent second opinion** when the other agent is missing: allowed with a label. OK?
- Q6. **Memory updates and the PR (M6).** Core TDD 8.5 writes memory updates to the task branch *before* the PR. M5 has a "before commit" hook point. M6 must decide whether approvals happen inside the ship dialog or before it.
- Q7. **Secrets (Known gap 2).** The PR body has no check output, only names and results. Comments and findings may quote code; that code is already in the PR.
- Q8. **Coverage not confirmed.** Ship does not require confirmed Brief coverage; the PR body says "agent view, not confirmed" when that is the case. OK?

---

## 11. Effort

About **22 hours**. Breakdown in `TDD_M5_review_ship.md` section 16.

# FSD — M5: Review + Ship

**Document type:** Functional Specification Document (FSD)
**Milestone:** M5 of M0-M12 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`): the old review view becomes the lower part of **Check and ship**, one-click "Approve and create pull request" (no ship dialog), Done screen with cleanup after 7 days, sync conflict as a Needs-you task, new F17.6 and F17.7 in Files
**Estimated effort:** ~25 hours (2 weeks in MILESTONES.md ≈ 16-20 h; includes ~2.5 h for F6.5 "Update from main", which MILESTONES.md does not list, and ~2.5 h for F17.6 / F17.7)
**Written for:** The developer-owner, as product owner
**Language style:** Simple English. Short sentences. No jargon without an explanation.
**Related documents:** `TDD_M5_review_ship.md`, `../../FUNCTIONAL_SPECIFICATIONS.md` (F2.5, F6.5, F6.6, F8, F10, F11, F17), `../../TDD-tech-design-doc.md` (4.5, 4.7, 5.8, 8.4, 8.5, 15), `../M4_checks_proof_card/FSD_M4_checks_proof_card.md` (before), `../M6_research_memory_playbooks/FSD_M6_research_memory_playbooks.md` (next)
**Screens:** prototype views `check`, `comment`, `editPr`, `done`, `conflict`, `files` (why it changed + looked at) in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. What this document covers

This document covers M5 only:

1. **What changed** (engine name: change story): the diff grouped by purpose, with short explanations, risk tags, a diff view and a plain file list. It is the lower part of the **Check and ship** screen (M4 built the top: verdict, checks, goals).
2. **Comments** on lines or groups, and **Send to Claude**.
3. **Ask Codex to review** (optional; engine name: second opinion): the other agent reviews the work, read-only, and returns findings. "Fix these". Open findings now count in the M4 verdict.
4. **Approve / Reject**.
5. **Approve and create pull request**: one click, default commit and PR text, no dialog. Push never goes to the default branch. **Edit pull request text** is optional.
6. The **Done** screen (PR link). The task's copy of the repo is cleaned up after 7 days, with no prompt.
7. **Update from main** (F6.5): Details shows "Behind main". A conflict becomes a **Needs you** task with "Let Claude fix it".
8. In **Files**: **Why Claude changed this** (F17.6), **Mark as looked at** and **Next change** (F17.7).
9. The `Shipped` stage rule.
10. CLI: `saarthi review <task>`, `saarthi ship <task>`, `saarthi workspace sync|remove <task>`.

Lessons learned after shipping are M6. M5 only leaves a place for them in the ship steps and on the Done screen.

"Claude" in labels means the agent that runs the task. With Codex or Gemini, the label uses that name. "Ask Codex to review" names the other agent.

---

## 2. The goal in plain words

**Review fast and create the PR from Saarthi.**

After M4, a task reaches `Review` with green checks and a verdict. Then I still read a raw diff file by file, and I open a terminal to commit, push and run `gh pr create`. After M5, Check and ship tells the story of the change ("New API endpoint", "Tests"), puts a small tag on risky parts (a migration, a new dependency), lets the other agent look for bugs, and creates a PR with one button.

**What I can use at the end of M5:**
- I read "What changed" groups instead of a raw diff, and leave comments that go straight to the agent.
- I ask Codex to review Claude's work (or the other way round) and send its findings back as a fix run.
- I click **Approve and create pull request** and get a real client PR: good commit message, branch pushed, PR body with goal, groups and proof. No dialog.
- In Files, each changed part says why it changed. I mark files as looked at and jump to the next change.
- The app cannot push to `main`, even if I call the API by hand.
- I can update my task branch from `main`, and let the agent solve conflicts.

---

## 3. Where this milestone sits

| Before (already built) | M5 adds | Unlocks next |
|---|---|---|
| M2: worktrees, checkpoints, `diff()`, `sync_with_base()` stub, `fix` runs | "What changed" from a checkpoint, push guard, sync with conflicts | M6: lessons learned hook into the ship steps and the Done screen |
| M3: task page, Files (tree, code view, changes vs main), More → Details, CodeMirror read-only | Lower part of Check and ship with CodeMirror merge view; why notes and looked-at marks in Files; "Behind main" in Details | M7: Side by side compares two sets of groups |
| M4: Proof Card, gate, verdict, side runs, `output_schema` | Story, findings and commit-message side runs; findings in the verdict; Proof Card in PR body | M8: Restore uses the same checkpoints |

---

## 4. Easy glossary

| Word | Simple meaning |
|---|---|
| **Hunk** | One block of changed lines in a diff. A file can have many hunks. |
| **Group** | A set of hunks that serve one purpose, with a 1-2 line explanation. Shown under "What changed". |
| **Change story** | Engine name for all groups + risk tags for one exact state of the code. On screen: "What changed". |
| **Risk tag** | A small tag on a group, like "Migration" or "Login code" (engine: risk flag). Found by rules, no AI. |
| **Folder fallback** | When the agent cannot group the changes, we group them by folder instead. |
| **Ask Codex to review** | An optional, read-only review by the *other* agent (engine: second opinion). |
| **Finding** | One problem the reviewer found: file, line, severity, reason. |
| **Builder** | The agent that did the last build/fix run on the task. |
| **Default branch** | The project's main branch (`main`, `master` or `develop`). Never pushed to. |
| **Push guard** | Code in the Workspace Manager that refuses any push except the task's own branch. |
| **Sync** | "Update from main": rebase or merge the default branch into the task branch. |
| **Copy of the repo** | The task's own worktree. Removed 7 days after shipping; the branch stays. |
| **Looked-at mark** | My tick on a changed file in Files. It goes away by itself when the file changes again. |

---

## 5. Features

### 5.1 F10.1 — Grouped changes ("What changed")

**What:** When a task enters `Review`, the app builds the change story. The builder agent groups the hunks by purpose and writes 1-2 lines per group. Check and ship shows them under **What changed**.

**Why:** A diff sorted by file name hides the "why". Groups let me read the change like a story.

**Example:**
```
$ saarthi review T-0042
What changed  T-0042  Add password reset API      (grouped by claude, 6 files, +214 / -37)
Risk tags: [migration] alembic/versions/3f2a_reset_tokens.py   [dependency] pyproject.toml

g1  New reset endpoints  (3 hunks)
    Adds POST /auth/reset and POST /auth/reset/confirm. Tokens are hashed before saving.
    app/api/auth.py  +88 -4
g2  Database change  (1 hunk)  [Migration]
    New table reset_tokens with an expiry column.
    alembic/versions/3f2a_reset_tokens.py  +41
g3  Tests  (2 hunks)
    Covers happy path, expired token, reused token.
    tests/test_reset.py  +79
Codex review: not asked yet.   Comments: 0.   Decision: none.
```

**Rules:**
- R1. The story is built from a **checkpoint** of the worktree, so it matches one exact state of the code.
- R2. The grouping call is a short **read-only side run** of the builder agent. It does not change the stage.
- R3. Every hunk must be in exactly one group. Hunks the agent forgot go to a group "Other changes".
- R4. If the agent answer is invalid, or it placed fewer than 80% of hunks, or the call fails, the app uses **folder fallback**: one group per folder, explanation "Changes in `app/api/`". The screen says "grouped by folder".
- R5. If the diff is too big for the agent (over the size limit), the app uses folder fallback directly and says why.
- R6. A new story is built each time the task enters `Review` again (after a fix run). Old stories are kept.
- R7. I can rebuild the story by hand: `saarthi review T-0042 --rebuild`.

**Acceptance criteria:**
- AC1. With the recorded "story ok" fixture, the story has the agent's groups and every hunk is placed once.
- AC2. With the "garbage" fixture, the story is grouped by folder and says so.
- AC3. A task entering `Review` gets a story without any click.

### 5.2 F10.2 — Risk tags

**What:** Rule-based tags, no AI, on: DB migrations, deleted files, auth/security code, dependency files, config/env/CI files, big files (over 300 changed lines).

**Why:** These are the changes that break production. They must jump out.

**Example:** On Check and ship, the group "Database change" has a small tag **Migration**. The group with `app/auth/login.py` has **Login code**. Clicking a tag opens that group at the file.

**Rules:**
- R1. Patterns have defaults in the app. A project can change them in `.saarthi/project.toml` `[risk]`.
- R2. A project key **replaces** the default list for that kind (so I can remove a false alarm). Missing keys keep the default.
- R3. A file can have more than one tag.
- R4. Tags are shown on the group and on the file (also in Files), and listed in the PR body.

**Acceptance criteria:**
- AC1. A diff that deletes a file, touches `app/auth/login.py`, edits `package.json`, adds `alembic/versions/x.py`, edits `.github/workflows/ci.yml`, and changes 350 lines in one file gets all six kinds.
- AC2. `[risk] auth_paths = []` in `project.toml` removes the auth tag.

### 5.3 F10.3 and F10.6 — Diff view and plain file list

**What:** On Check and ship, opening a group shows its diff in a read-only CodeMirror merge view (side by side or unified, a toggle). A **Files** toggle shows a plain "files changed" list with +/- counts. "Open in Files" opens the same file in the Files screen.

**Why:** Some changes are easier to read by group, some by file.

**Rules:**
- R1. Read-only. Editing is not part of review (tiny edits are in Files, M3).
- R2. New files show as all-added; deleted files as all-removed; binary files as "binary file changed".
- R3. Risk tags and findings show next to the lines they point at.

**Acceptance criteria:**
- AC1. Opening a group shows only that group's hunks.
- AC2. The Files toggle lists every changed file with counts that match `saarthi review --json`.

### 5.4 F10.4 — Comments and "Send to Claude"

**What:** I can comment on a line (in the diff gutter) or on a whole group (view `comment`). **Send to Claude** starts a `fix` run with all selected comments.

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

### 5.5 F8.1-F8.3 — Ask Codex to review

**What:** An optional card on Check and ship: **Ask Codex to review**. It starts a read-only review run with the **other** agent (with builder Codex, it says "Ask Claude to review"). It returns findings: file, line, severity (high / medium / low), short reason. Findings show on the card and next to their lines. I tick some and click "Fix these"; the builder gets them as a new fix run.

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
Verdict: Has problems (1 high finding open)
$ saarthi review T-0042 --send --ids f1,f2
```

**Rules:**
- R1. Reviewer = the agent that is **not** the builder. If that agent is not installed or not logged in, the app says so; I may pick the same agent on purpose (`--agent claude`), and the card marks it "same-agent review".
- R2. The reviewer runs with the `read_only` profile. The task stays in `Review`.
- R3. Codex returns findings through a fixed JSON Schema. Claude is asked for the same JSON shape.
- R4. Bad items in the answer are dropped; good items are kept. An answer with no valid JSON shows "The review gave no usable answer" with a link to the run.
- R5. "No findings" is a valid result and shows as "No issues found".
- R6. A finding can be **ignored** (it stays visible, greyed out). Ignored and open counts go in the PR body.
- R7. "Fix these" works like "Send to Claude" (5.4), and both can be sent together in one run.
- R8. Open findings count in the **verdict** (M4 F7.7): an open high finding gives **Has problems**, an open medium finding gives **Take a look**. Ignored and sent findings do not count.
- R9. The review is optional. Shipping never needs it.

**Acceptance criteria:**
- AC1. With builder `claude`, the review run uses `codex`, profile `read_only`, mode `review`.
- AC2. The recorded Codex findings fixture creates 3 findings; the task stays in `Review`.
- AC3. "Fix these" with f1 starts a `claude` fix run with a "Findings to fix" section; f1 shows "sent".
- AC4. With all checks green and goals met, one open high finding makes the verdict **Has problems**; ignoring it gives the verdict back without it.

### 5.6 F10.5 — Approve / Reject

**What:** **Approve** the whole task (part of the main button, see 5.7), or **Reject** with a note (a small link on Check and ship).

**Rules:**
- R1. Approve is saved on the current story. Ship needs an approved story.
- R2. If the code changes after approval (a fix run, a sync), a new story is built and must be approved again.
- R3. Reject needs a note. The task moves `Review -> Ready` (To do). The worktree and branch stay. The note shows on the task page.

**Acceptance criteria:**
- AC1. Ship before approve is refused with "approve the review first" (API and CLI without `--approve`).
- AC2. Reject without a note is refused; with a note the task is `Ready`.

### 5.7 F11.1 — Commit (default text, no dialog)

**What:** The main button on Check and ship is **Approve and create pull request**. One click approves the story, commits with the default message, pushes and opens the PR. There is no dialog. The default message is drafted by the agent (cheap, read-only) when the story is ready, so the click does not wait for it.

**Example:** The draft for T-0042:
```
feat(auth): add password reset API

- New reset endpoints with hashed, expiring tokens
- New table reset_tokens
- Tests for happy path, expired and reused tokens

Task: T-0042
```
If I want to change it, I click **Edit pull request text** (view `editPr`) first. It shows the title (= commit subject), the commit body and the PR body. I edit and click **Approve and create pull request** there.

**Rules:**
- R1. Style follows `commit_style` in `project.toml` (`conventional` by default, or `plain`).
- R2. If the draft call fails or is not ready yet, the app uses a simple template (`feat: <task title>` + group titles) so ship never waits on the agent.
- R3. Saarthi's own files (`.saarthi/context/`) are never committed.
- R4. Git hooks in the repo run as normal. If a hook fails, ship stops and shows the hook output. No `--no-verify`.
- R5. If the agent already made commits on the branch, they are kept; the app commits only what is left. If nothing is left and the branch is ahead, it just pushes.
- R6. "Edit pull request text" is optional. Its edits are used for this ship only.

**Acceptance criteria:**
- AC1. One click on **Approve and create pull request** with no edits makes a commit whose message equals the saved draft (or the template when there is no draft).
- AC2. With the draft side run still running, the click uses the template and does not wait.
- AC3. Text changed in `editPr` shows in the commit message and in the PR title and body.

### 5.8 F11.2 — Push and PR

**What:** Push the task branch to `origin`. Create a PR with `gh pr create`. The PR body = goal + "What changed" groups + Proof Card (+ Codex review summary).

**Example:**
```
$ saarthi ship T-0042 --approve
Using the drafted commit message (from claude). Edit it with -e.
Approved.
Committed 7c1e9a2  feat(auth): add password reset API
Pushed saarthi/T-0042-password-reset -> origin
PR #118 https://github.com/acme/billing-api/pull/118
T-0042 -> Shipped.
The copy of the repo is removed in 7 days. Branch is kept. Remove now: saarthi workspace remove T-0042
```

**Rules:**
- R1. Ship needs: stage `Review`, an approved story (or `approve` in the same call), the code unchanged since that story, no active run, no sync in progress.
- R2. PR base = the default branch, head = the task branch.
- R3. The PR body lists check names and results, not their output (output can hold secrets until M8).
- R4. If `create_pr = false` in `project.toml`, ship stops after push. The button then reads **Approve and push**.
- R5. If one step fails (for example `gh` not logged in), the earlier steps stay done. The task stays in **Needs you** with the error and a **Try again** button. Running ship again continues from the failed step. If a PR for the branch already exists, the app uses it.
- R6. After a rebase sync, a branch that was pushed before needs a forced push. That is only allowed with an explicit `--force-with-lease`, and only for the task branch.

### 5.9 F11.3 and F2.5 (`Shipped` rule) — Never push to the default branch

**What:** The push code refuses any branch that is the default branch, a protected name (`main`, `master`, `develop`), the remote's default branch, or not a `saarthi/` task branch. The `Shipped` stage needs a commit, a push, and a PR when the project uses PRs.

**Why:** The one mistake that must be impossible.

**Rules:**
- R1. The check lives in the Workspace Manager's push function, the only place in the code that runs `git push`. The UI and API do not have their own copy.
- R2. The push always names the branch on both sides (`saarthi/T-0042-x:saarthi/T-0042-x`), so git settings cannot redirect it.
- R3. I cannot drag a card to Done (`Shipped`) in the Board view. Only the ship flow moves it.

**Acceptance criteria:**
- AC1. A test calls the API directly in four ways (task branch set to `main` in the DB; project default branch set to the task branch; the task branch's upstream set to `origin/main`; an extra `branch: "main"` in the ship body). Every time, `main` on the test `origin` is unchanged.
- AC2. A test proves no other file in `daemon/src` passes `"push"` to git.

### 5.10 F6.6 — Done screen and cleanup after 7 days

**What:** After ship, the task page shows **Done** (view `done`): the PR link, "Open pull request", and a quiet line: "Claude's working copy for this task is cleaned up in 7 days. The branch stays. **Clean up now**". There is no cleanup prompt. M6 adds the "Lessons learned" card here; M10 adds the Jira write-back card.

**Rules:**
- R1. 7 days after a task moves to `Shipped` or `Archived`, the daemon removes its worktree folder by itself. The branch and checkpoints stay.
- R2. The number of days is a setting (`worktree_cleanup_days`, default 7 from `config.py`; 0 = never clean up by itself).
- R3. If the worktree has uncommitted changes, the daemon does **not** remove it. The Done screen says "Not cleaned up: it has changes that are not in the PR" with **Clean up anyway**.
- R4. **Clean up now** removes it at once (same rules). In the CLI: `saarthi workspace remove T-0042`.

**Acceptance criteria:**
- AC1. A shipped task whose `Shipped` time is 8 days old loses its worktree folder on the next cleanup scan; `git branch` still has the branch.
- AC2. A dirty worktree is kept by the scan, and the Done screen shows "Clean up anyway".
- AC3. With `worktree_cleanup_days = 0`, nothing is removed by itself.

### 5.11 F6.5 — Update from main

**What:** More → Details shows "Behind main by N commits" with **Update from main**. It brings the latest default branch into the task branch (rebase or merge, from `sync_strategy`). On a conflict, the task shows under **Needs you** with "Merge conflict in 2 files" (view `conflict`) and two buttons: **Let Claude fix it** (a `fix` run) or **Undo the update** (abort).

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
- R4. On conflict, the task keeps its engine stage but its status on screen is **Needs you** (M3 F2.9 counts "a conflict waiting for the user" as Needs you). `--fix` / "Let Claude fix it" starts a `fix` run with the conflict files and the instructions to finish the rebase or merge.
- R5. After a clean sync that changed code, if the task was in `Review` or `Failed`, checks run again (the task goes to `Verifying`), and a new story will be built.
- R6. No remote? The app syncs from the local default branch.

**Acceptance criteria:**
- AC1. Clean rebase: the branch has the new `main` commit; uncommitted changes are still there.
- AC2. Conflict then `--abort`: the worktree is exactly as before (same files, same uncommitted changes).
- AC3. Conflict then `--fix`: a fix run starts with a "Merge conflicts" section listing both files.
- AC4. While a conflict waits, the task is in the Needs-you group on Home and is counted in the Needs-you pill.

### 5.12 F17.6 — Why it changed (in Files)

**What:** In Files (view `files`, the task's copy), a changed part of a file shows a strip **Why Claude changed this** with the explanation of the group it belongs to, and its risk tags. It uses the groups of the latest change story. No new agent call.

**Why:** When I read code, I want the reason next to the lines, not on another screen.

**Example:** I open `app/api/auth.py` in Files. Above lines 40-70: "Why Claude changed this: Adds POST /auth/reset and POST /auth/reset/confirm. Tokens are hashed before saving." (group g1). Clicking the group name opens it on Check and ship.

**Rules:**
- R1. The note comes from the latest story's group for that hunk. Folder-fallback groups give their folder line ("Changes in `app/api/`").
- R2. Before the first story (task not yet in Review), the strip says "Notes come when the task reaches Check and ship."
- R3. If the file changed after the story was built, line positions may have moved. The strip then shows the notes of the groups that touched the file, once at the top, and says "Changed after the last review".
- R4. Project files (view `projectFiles`, the main repo) have no why notes.

**Acceptance criteria:**
- AC1. With the "story ok" fixture, each hunk of `app/api/auth.py` in Files shows the explanation of its group.
- AC2. A task with no story shows the "Notes come when..." line and makes no agent call.
- AC3. Editing a file by hand after the story shows "Changed after the last review" with the group notes at the top of the file.

### 5.13 F17.7 — Mark as looked at, and Next change (in Files)

**What:** In Files, each changed file has **Mark as looked at**. The header says "6 files changed vs main · you've looked at 2". **Next change** jumps to the next changed part I have not looked at, in the order of the "What changed" groups.

**Why:** On a big change I lose track of what I already read.

**Example:**
```
$ saarthi review T-0042 --looked-at app/api/auth.py
Marked as looked at: app/api/auth.py   (2 of 6)
$ saarthi review T-0042 --changes
g1  app/api/auth.py                       looked at
g2  alembic/versions/3f2a_reset_tokens.py
g3  tests/test_reset.py
```

**Rules:**
- R1. A mark is per task and per file. It is mine only; it never goes into git or the PR.
- R2. If the file changes after I mark it (a fix run, a hand edit, a sync), the mark goes away by itself.
- R3. **Next change** follows the group order, then hunk order inside a file. Before the first story, it follows file path order.
- R4. I can remove a mark ("Not looked at yet").
- R5. Marks never block Approve or ship. They are a reading aid.

**Acceptance criteria:**
- AC1. Marking a file emits an event and the count goes up by one, live, on Files.
- AC2. A fix run that changes a marked file clears its mark; a fix run that does not touch it keeps it.
- AC3. **Next change** skips files that are marked and goes in group order.
- AC4. `saarthi review T-0042 --changes --json` shows the same order and marks as the screen.

---

## 6. Main user flows

### 6.1 Review and ship (the main flow)
1. T-0042 enters `Review` (M4). The story is built and the commit text is drafted. Notification "T-0042 is ready to check".
2. Home shows T-0042 under **Needs you** with "Review". I open **Check and ship**: verdict **Looks good**, checks passed, goals met.
3. I read "What changed" groups and their tags. In Files I read `auth.py`, see "Why Claude changed this", mark it looked at, and click **Next change**.
4. I click **Ask Codex to review**. Codex returns 2 findings. The verdict turns to **Has problems** (one is high).
5. I tick f1 and add one line comment. Click **Fix these + send comments**. Task -> `Running` (Working).
6. Fix run ends -> checks green -> `Review` -> new story. Verdict **Looks good**.
7. I click **Approve and create pull request**. Commit, push, PR. Task -> `Shipped`.
8. The task page shows **Done** with the PR link and "cleaned up in 7 days".

### 6.2 Update from main with a conflict
1. Task in `Review`. More → Details shows "Behind main by 5 commits".
2. Click **Update from main**. Conflict in 1 file. The task shows under **Needs you** (view `conflict`).
3. Click **Let Claude fix it**. Fix run ends -> checks -> `Review` -> new story -> approve and create pull request.

### 6.3 Reject
1. "What changed" shows the agent built the wrong thing.
2. Click **Reject**, write "Use the existing email service, not a new one". Task -> `Ready` (To do).
3. I edit the goal and click **Start** again.

---

## 7. Done when

- [ ] I ship a real PR for a client project fully from Saarthi (Check and ship, one click on "Approve and create pull request"), without a terminal.
- [ ] Ask Codex to review finds at least one real issue in a test task with a planted bug, the verdict shows it, and "Fix these" -> checks -> new story works.
- [ ] Pushing to `main` is impossible even from the API directly: the four-way test in 5.9 AC1 passes against a local bare repo as `origin`.
- [ ] All ship tests use a local bare repo and a stub `gh`. No test touches GitHub.
- [ ] Update from main works for clean, conflict + abort, and conflict + fix. A conflict shows as Needs you.
- [ ] In Files, why notes come from the story, and looked-at marks clear when a file changes.
- [ ] A shipped task's copy is removed after `worktree_cleanup_days` (test with a fake clock).
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run pyright` are clean.

---

## 8. Out of scope

| Item | Owner |
|---|---|
| Lessons learned after ship (F12.3) | M6 (M5 leaves a hook in the ship steps and a place on Done) |
| Side by side compare of two sets of groups | M7 |
| Restore to an undo point (F14.3) | M8 |
| Secret masking (F15.4) | M8 |
| PR status, CI, GitHub review comments (F11.4) | Later |
| Squashing agent commits | Not planned |
| Editing code inside the diff view | Not planned (tiny edits in Files are M3) |
| Draft PRs, reviewers, labels on the PR | Later |
| Looked-at marks in project files (`projectFiles`) | Not planned |
| See it work card on Check and ship (screenshots, video, trace) | M11 (its evidence folder is removed with the worktree cleanup of 5.10) |

---

## 9. QA checklist

Use a test repo with a local bare `origin` (`git init --bare /tmp/origin.git`) and a stub `gh` first, then repeat steps 9-12 on a real client repo.

1. [ ] Move a task to `Review` (M4 flow). Check and ship shows "What changed" groups, explanations, file list.
2. [ ] Rename the agent binary, rebuild the story. It says "grouped by folder".
3. [ ] Add a migration file, delete a file, edit `package.json`. Matching tags appear on the groups.
4. [ ] Toggle side-by-side / unified. Toggle Files view. Counts match `saarthi review --json`.
5. [ ] Add a line comment and a group comment. Send to Claude. Task `Running`; TASK.md has both.
6. [ ] Plant a bug (`==` on a token). Ask Codex to review. A finding points at it; verdict **Has problems**. "Fix these". After the run, the finding shows "sent", the new story has no such code.
7. [ ] Ignore a finding. It greys out. It is counted as "ignored" in the PR body preview (`editPr`).
8. [ ] `saarthi ship` before approve (no `--approve`): refused. Approve, then edit a file by hand, then ship: refused "code changed since review".
9. [ ] Click **Approve and create pull request**. No dialog. `.saarthi/context/` not in the commit (`git show --stat`). The message is the draft.
10. [ ] PR body has goal, groups, risk tags, checks table, Review anyway reason (if any).
11. [ ] Log out of `gh` (`gh auth logout`). Ship: commit + push done, PR fails with the fix command; task stays Needs you with **Try again**. Log in, try again: only the PR step runs.
12. [ ] Done screen shows the PR link and "cleaned up in 7 days". **Clean up now**: folder gone, `git branch` still has the branch.
13. [ ] `curl` the ship endpoint with `{"branch":"main"}`: 422. `git -C /tmp/origin.git log main` unchanged.
14. [ ] Push a new commit to `origin/main`. Details shows "Behind main". Update from main (rebase). Branch is up to date; uncommitted work still there.
15. [ ] Make a conflict. Update -> task under Needs you (`conflict`). Undo the update -> same as before. Update again -> **Let Claude fix it** -> fix run -> checks -> `Review`.
16. [ ] Files: `auth.py` shows "Why Claude changed this" with the group text. Mark it looked at; count goes up. Send a comment that makes the agent change `auth.py`; after the run the mark is gone. **Next change** goes in group order.
17. [ ] Edit pull request text: change the title. The PR has the new title.

---

## 10. Open questions

- Q1. **F6.5 placement (milestones README, Known gap 1).** "Update from main" is "Must" in the FSD but was in no milestone. It is placed here, adding ~2.5 hours to the MILESTONES.md estimate.
- Q2. **Approval resets** when the code changes (5.6 R2). Right, or too strict for tiny fixes?
- Q3. **Review -> Verifying after sync** is a new stage move (TDD Decision 13). OK?
- Q4. **Forced push after rebase** only with `--force-with-lease` on the task branch. OK, or should sync default to merge once a branch was pushed?
- Q5. **Same-agent review** when the other agent is missing: allowed with a label. OK?
- Q6. **Lessons learned and the PR (M6).** Core TDD 8.5 writes memory updates to the task branch *before* the PR. The new design shows "Lessons learned" as an optional card on Done, **after** shipping. This matches milestones README decision 7 (drafted after Shipped, extra commit on the PR branch). M5 keeps the `before_commit` and `after_ship` hook points.
- Q7. **Secrets (Known gap 2).** The PR body has no check output, only names and results. Comments and findings may quote code; that code is already in the PR.
- Q8. **Coverage not confirmed.** Ship does not require all goals to be confirmed; the PR body says "agent view, not confirmed" when some are still "Not sure". OK?
- Q9. **Reject on screen.** The prototype has no Reject button. Here it is a small "Reject with a note" link on Check and ship. OK, or keep Reject in the CLI only?
- Q10. **Cleanup without asking.** The old prompt asked after each ship. Now the copy goes after 7 days by itself (dirty copies are kept). OK?
- Q11. **Files API names (decided).** F17.6 and F17.7 build on M3's Files endpoints: `GET /projects/{id}/files?task=` (tree, file), `GET /projects/{id}/changes?task=` and `/changes/diff` (diff vs main). Why notes and looked-at marks exist only for a task, so M5 adds them under the task: `/tasks/{id}/files/changes`, `/tasks/{id}/files/why`, `/tasks/{id}/files/looked-at`.

---

## 11. Effort

About **25 hours** (was 22; +2.5 h for F17.6 / F17.7, +0.5 h for the drafted default text, the Done screen and the cleanup scan). Breakdown in `TDD_M5_review_ship.md` section 16.

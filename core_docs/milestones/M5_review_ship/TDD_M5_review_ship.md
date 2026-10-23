# TDD — M5: Review + Ship

**Document type:** Technical Design Document (TDD)
**Milestone:** M5 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`): one-click ship with drafted default text (no dialog), auto cleanup after 7 days, findings feed the M4 verdict, sync conflict counts as Needs you, F17.6 why notes and F17.7 looked-at marks (Decisions 17-20)
**Estimated effort:** ~25 hours (2 weeks in MILESTONES.md; includes ~2.5 h for F6.5, which MILESTONES.md does not list, and ~2.5 h for F17.6 / F17.7)
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. Every decision says *why*.
**Related documents:** `FSD_M5_review_ship.md`, `../../TDD-tech-design-doc.md` (4.5, 4.7, 5.8, 6.2, 7, 8.4, 8.5, 15), `../../TECH_STACK.md`, `../M4_checks_proof_card/TDD_M4_checks_proof_card.md`, `../M6_research_memory_playbooks/TDD_M6_research_memory_playbooks.md`
**Screens:** prototype views `check`, `comment`, `editPr`, `done`, `conflict`, `files` (why it changed + looked at) in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. The goal in one sentence

Turn a task in `Review` into a grouped, flagged change story ("What changed" on Check and ship) with comments and an optional cross-agent review, then commit, push (never to the default branch) and open a PR in one click — plus "Update from main" with conflict fixing, and why notes and looked-at marks in Files.

---

## 2. Read this first — rules this work must not break

1. **All logic in the daemon** (CLAUDE.md rule 1). Grouping validation, the push guard, the PR body, the default commit text, why notes, mark staleness and "Next change" order: all in `review/` and `workspace/`.
2. **CLI first** (rule 2). `saarthi review` (incl. `--changes`, `--looked-at`), `saarthi ship`, `saarthi workspace sync|remove` before the Check and ship and Files parts.
3. **Agents only through `AgentAdapter`** (rule 3). Story grouping, the second opinion ("Ask Codex to review") and commit drafts are side runs through the adapter. `--output-schema` stays inside `agents/codex.py` (M4 Decision 10).
4. **Every action is an event** (rule 4). Story ready, comment, finding, sent, decision, commit, push, PR, sync, remove, looked-at mark.
5. **Stage rules in one table** (rule 5). The `Shipped` guard and the new `Review -> Verifying` row go into `ALLOWED_MOVES`.
6. **Git: list of args, never push to the default branch** (rule 6, TDD 15). One push function, guarded, proven by an API-level test.
7. **No hard-coded values** (rule 7). Risk patterns, limits, remote name, `gh` path, cleanup days: `config.py` / `project.toml` / settings.
8. **Tests: FakeAdapter, local bare repo as `origin`, stub `gh`** (rule 8, TDD 13). No real agents, no GitHub.

---

## 3. What already exists (do not rebuild)

| Thing | From | What M5 uses it for |
|---|---|---|
| `ALLOWED_MOVES` with `who` (system/user) and guards | M1, M4 | Add `Shipped` guard and `review -> verifying` |
| Event Bus listeners | M1/M2 | Build the story on `task.stage_changed -> review` |
| Workspace Manager: `checkpoint()` (temp index, `refs/saarthi/checkpoints/...`), `diff()`, `status()`, `remove_worktree()` | M2 | Story snapshot, sync safety, cleanup |
| `workspace.base_ref()` (M3), `diff_stats()` (M4) | M3, M4 | Same base for Files, story and proof |
| Run Manager, `fix` mode, side runs (`SIDE_RUN_MODES`), `RunRequest.output_schema`, `agents/structured.py` | M2, M4 | Story, review, commit-draft side runs; fix runs |
| Context Pack `extra_sections` | M4 | "Review comments", "Findings to fix", "Merge conflicts" |
| Check Runner `run_batch()` and the Review gate | M4 | Re-check after sync; fix runs loop back through checks |
| Proof Card (`GET /tasks/{id}/proof`), `trust_score()`, `verdict()` | M4 | PR body; M5 fills the second-opinion part and passes open findings to the verdict |
| `CheckAndShip/index.tsx` (top part), generated client, WS store, CodeMirror 6 | M3, M4 | Lower part of Check and ship with `@codemirror/merge` |
| Files screen + task Files API (tree, file, diff vs main), More → Details with ahead/behind from `GET /tasks/{id}/workspace` | M3, M2 | Why strip, looked-at marks, Next change; "Behind main" + Update from main |
| `status_for(stage, *, waiting_on_user)` pure function (F2.9) | M3 | M5 passes `sync_conflict` into `waiting_on_user` (Decision 20) |

---

## 4. Technical decisions

### Decision 1 — The story is built from a checkpoint (new)
On `task.stage_changed` with `to = review` (listener `review/trigger.py`), call `workspace.checkpoint(task, "review")`. The story stores `base_sha = merge-base(head, base_ref)` and `head_sha = <checkpoint commit>`. All diffs, file contents and comments use these two shas.
**Why:** The worktree keeps changing (I can edit by hand). A checkpoint pins the exact state I reviewed, includes untracked files, and lets Ship check "code unchanged since review" (Decision 7).
The checkpoint commit must have `HEAD` as its parent (`git commit-tree -p HEAD`). If M2's checkpoint has no parent, add `-p HEAD` there; it is harmless for Restore (M8).

### Decision 2 — A small own unified-diff parser
`review/diff_parse.py` parses `git diff -M --no-color <base_sha> <head_sha>` into `FileDiff(path, old_path, status, binary, added, removed, hunks[Hunk(id, header, old_start, old_lines, new_start, new_lines, lines)])`. Hunk ids are `h1..hN` in diff order.
**Why:** The format is simple and stable; a library adds a dependency for ~120 lines of code. Short ids are easy for an agent to repeat back.

### Decision 3 — Risk flags are pure functions over the parsed diff (new keys)
`review/risk.py: flags(files, rules) -> list[RiskFlag(kind, path, reason, hunk_ids)]`. Kinds: `migration`, `deleted_file`, `auth`, `dependency`, `config_ci`, `big_file`. Glob match with `fnmatch.fnmatchcase` on both `path` and `"/" + path` (so `**/auth/**` also matches a top-level `auth/`). A `[risk]` key in `project.toml` **replaces** the default list for that kind. New keys beyond core TDD 10.1: `dependency_paths`, `config_paths`, `big_file_lines`.
**Why:** No AI, testable, no new dependency. Replace (not extend) lets me silence a false alarm.

### Decision 4 — Grouping is a `story` side run with strict validation and folder fallback (new)
- Mode `story` added to `SIDE_RUN_MODES`, profile `read_only`, agent = builder (agent of the last `build`/`fix` run).
- Input file `<worktree>/.saarthi/context/REVIEW_DIFF.md`: brief goal, then each hunk as `### h3 app/api/auth.py @@ -40,6 +40,30 @@` plus up to `STORY_HUNK_PREVIEW_LINES` lines. The prompt says "Read `.saarthi/context/REVIEW_DIFF.md`".
- Schema `schemas/json/change_story.schema.json`: `{"groups": [{"title": str, "explanation": str, "hunk_ids": [str]}]}`.
- Validation: drop unknown ids; a hunk in two groups stays in the first; empty groups dropped; titles cut to 80 chars, explanations to 300.
- Placed ratio < `STORY_MIN_PLACED_RATIO` (0.8), invalid JSON, timeout, agent not ready -> **folder fallback**: one group per parent folder (`(root)` for top-level files), explanation `Changes in <folder>/`. Unplaced hunks above the ratio -> group "Other changes".
- Diff text > `STORY_AGENT_MAX_DIFF_CHARS` -> folder fallback without an agent call, `note = "diff too big for grouping"`.
**Why:** TDD 4.7 says "fixed JSON shape, fall back to group by folder". The ratio rule stops a lazy answer from hiding half the diff.

### Decision 5 — Comments and findings share one "send" path
`review/send.py: send_to_agent(task, comment_ids, finding_ids, agent)` builds `extra_sections` (`## Review comments`: `file:line`, the code line, my text; `## Findings to fix`: severity, file, line, reason), starts a `fix` run (task `review -> running`), marks items `sent` with `sent_run_id`, emits `review.sent`. On that run's `run.finished`, its comments become `resolved` (findings stay `sent`; core TDD 5.8 has no `resolved` for findings).
**Why:** One code path for F10.4 and F8.3; both can go in one run. The fix run loops back through M4 checks automatically.

### Decision 6 — Second opinion ("Ask Codex to review"): `review` side run with the other agent
- Reviewer = the agent that is not the builder. `check_ready()` fails -> 409 `reviewer_not_ready` with the fix command; `agent` in the body overrides (same agent allowed, flagged `same_agent: true`).
- Mode `review` (already in core `runs.mode`), added to `SIDE_RUN_MODES`; profile `read_only`; Context Pack = brief + `REVIEW_DIFF.md` (full hunks, not previews).
- Schema `schemas/json/review_findings.schema.json`: `{"findings": [{"file": str, "line": int|null, "severity": "high"|"medium"|"low", "reason": str}]}`. Codex gets it via `--output-schema` (core TDD 8.4), Claude via the prompt block (M4 Decision 10).
- Bad items dropped one by one; no valid JSON -> `review.second_opinion_done {usable: false}`.
- We use `codex exec` with a schema, not `codex review`. **Why:** one shape for both agents, and `codex review` output is free text.

### Decision 7 — Approval is per story; Ship checks "code unchanged" (new)
`change_stories` gets `decision`, `decision_note`, `decided_at`. Ship requires the **latest** story to be `approved`, and the current worktree tree (temp-index `git write-tree`) to equal `head_sha^{tree}`. Otherwise 409 `code_changed_since_review`.
**Why:** Approving and then letting code change unseen would make the approval meaningless. The tree compare is exact and cheap.

### Decision 8 — Ship is a synchronous, resumable list of steps (new)
`workspace/ship.py: ship(task, req) -> ShipResult`. Steps: `approve (if req.approve) -> preconditions -> before_commit hooks -> commit -> push -> pr -> stage -> after_ship hooks`. "Approve and create pull request" is one call with `approve: true` and no text, so the daemon (not the UI) runs both. Each step checks if it is already done (clean tree and branch ahead: skip commit; remote sha == local `HEAD`: skip push; `gh pr view <branch>` finds a PR: reuse). Each step has a timeout (`GIT_NET_TIMEOUT_SEC`). A failure emits `ship.failed {step, code, error}` and stops; earlier steps stay done.
`before_commit` and `after_ship` are lists of callables, empty in M5. **M6 registers memory updates there** (core TDD 8.5 step 5 writes memory files on the task branch before the PR).
**Why:** Push and PR take seconds, not minutes; a sync call is simplest for CLI and tests. Resumable steps make `gh` failures harmless. One call for approve + ship means the one-click button has no rule in the UI (spec D8).

### Decision 9 — Commit details (new)
- Draft: `commit_msg` side run (schema `{"subject": str, "body": str}`), `commit_style` from `project.toml` (`conventional` default / `plain`) in the prompt. It starts right after `review.story_ready` (listener in `review/trigger.py`) and the result is saved in `change_stories.commit_draft`* `{subject, body, source}`. Ship uses, in order: text from the request (`editPr`), the saved draft, the fallback template. It never waits for a running draft. Fallback template: `<COMMIT_FALLBACK_TYPE>: <task title>` + group titles as bullets + `Task: <id>`.
- PR title = commit subject; PR body = `pr_body.build()` (Decision 11), unless the request gives `pr_title` / `pr_body` (from `editPr`).
- Commit: `git add -A -- . ':(exclude).saarthi/context'`, then fail if `git diff --cached --name-only` still lists `.saarthi/context/`. `git commit -F <msgfile>`. Hooks run (no `--no-verify`); hook output goes into the error.
- Author = the user's git config. Missing -> 409 `git_identity_missing`.
**Why:** F11.1; Saarthi files must never reach a PR; project hooks are the project's rules. Drafting at story time is what lets ship have no dialog (spec D8) and still use good text.

### Decision 10 — The push guard: one function, three checks, explicit refspec
`workspace/push.py` is the **only** module that may pass `"push"` to git. 
```python
def push_task_branch(task: Task, project: Project, *, force_with_lease: bool = False) -> PushResult: ...
def assert_pushable(task: Task, project: Project, branch: str) -> None:  # raises PushRefused
```
`assert_pushable` refuses when: (a) the worktree's `git symbolic-ref --short HEAD` fails (detached, rebase in progress) or differs from `task.branch`; (b) `branch` does not start with `BRANCH_PREFIX`; (c) `branch` is in `PROTECTED_BRANCHES`, equals `project.default_branch`, or equals the remote HEAD branch (`git symbolic-ref refs/remotes/<remote>/HEAD`, if present).
Push args: `["git", "push", "--porcelain", "--set-upstream", remote, f"refs/heads/{b}:refs/heads/{b}"]` with `GIT_TERMINAL_PROMPT=0`. `force_with_lease` adds `--force-with-lease=refs/heads/{b}:<sha from ls-remote>`; never `--force`.
The ship request model uses `extra="forbid"`, so a `branch` field is a 422.
**Why:** TDD 15: "checked in Workspace Manager, not only in UI". The explicit `src:dst` refspec means `push.default` or an upstream set to `origin/main` cannot redirect the push. Three independent checks: a bug in one is caught by another.

### Decision 11 — PR with `gh`, body built by the daemon
`review/pr_body.py: build(task) -> str` sections (user-facing words): Goal, What done looks like (with coverage status, "agent view, not confirmed" if not confirmed), What changed (groups, explanations, files), Risk tags, Tests and checks (check name / required / result / seconds, change size, tests added, Review anyway reason), Codex review (reviewer, open / sent / ignored counts; left out when no review ran), footer `Made with Saarthi · T-0042`. **No check output** (secrets, Known gap 2). Cut to `PR_BODY_MAX_CHARS` by dropping explanations first, then files lists.
Saved at `<SHIP_DIR>/<task_id>/pr_body.md`. Command: `[gh, "pr", "create", "--base", default_branch, "--head", branch, "--title", subject, "--body-file", path]` in the worktree. The URL is the last `https://` line of stdout. `gh` path from setting `gh_path` (default `GH_BIN = "gh"`), so tests point it at a stub.
**Why:** F11.2; the stub path keeps tests off GitHub.

### Decision 12 — `tasks.pr_url` and `tasks.shipped_sha` (new columns)
Set by the ship flow after push / PR. Guard `ship_done` on `(review, shipped)`, who = system only: `shipped_sha` set, and `pr_url` set unless `create_pr` is false. A user move to `shipped` -> 409 `use_ship`.
**Why:** F2.5 "Shipped needs a commit (and a PR)". Columns are easier for Home, the Board view, the Done screen and M6 than scanning events. Not in the ownership table's M5 list (which names only tables), so flagged here.

### Decision 13 — "Update from main": checkpoint, clean, rebase/merge, re-apply (new)
`workspace/sync.py`, state kept in git, not the DB:
1. Refuse if a run or check batch is active, or a sync is already in progress (`refs/saarthi/sync/<task-id>` exists).
2. `cp = checkpoint(task, "before-sync")` (parent = `HEAD`, Decision 1). `git update-ref refs/saarthi/sync/<task-id> cp`.
3. `git fetch <remote> <default_branch>` (skip if no remote). Base = `base_ref(task)`.
4. If dirty: `git reset --hard HEAD` and `git clean -fd` (not `-x`, so ignored `.saarthi/context/` stays). Safe: `cp` holds everything.
5. `git rebase <base>` or `git merge --no-edit <base>` (`sync_strategy`, request override). Env `GIT_EDITOR=true`.
6. Conflict (non-zero exit with unmerged paths) -> stop, emit `workspace.synced {result: "conflict", conflict_files, phase: "rebase"|"merge"}`.
7. Clean -> re-apply uncommitted work: `git cherry-pick --no-commit cp`, then `git reset -q` (back to "uncommitted"). Conflict here -> `phase: "reapply"`, same as 6.
8. Success -> delete the sync ref, emit `workspace.synced {result: "ok", changed}`. If `changed` and stage is `review` or `failed`: move to `verifying` (new row `review -> verifying`, who = system; `failed -> verifying` is M4's row) and call `run_batch()`.

**Abort:** `git rebase --abort` / `git merge --abort` if in progress; `git reset --hard cp^`; `git clean -fd`; `git checkout cp -- .`; `git reset -q`; delete the sync ref; `result: "aborted"`. Result = exactly the state before sync.
**Fix:** `fix` run with `## Merge conflicts` (files, phase, and: "resolve the markers, `git add` the files, then `git rebase --continue` / `git commit --no-edit`; for phase reapply, only resolve the markers"). On that run's `run.finished`, the sync listener checks: no unmerged paths and no rebase/merge in progress -> delete the sync ref, `git reset -q`, `result: "finished"`; else the task shows "sync not finished". M4 checks run as for any fix run.
**Why:** Agents leave work uncommitted, and rebase needs a clean tree. `refs/stash` is shared by all worktrees of a repo, so parallel tasks could pop each other's stash; the per-task checkpoint ref cannot clash. Ship refuses while the sync ref exists.

### Decision 14 — Cleanup runs by itself after N days; "Clean up now" is a separate call
`workspace/cleanup.py`: a daemon task runs at start and every `CLEANUP_SCAN_INTERVAL_SEC`. It finds tasks in `shipped` or `archived` with `worktree_path` set, whose move into that stage (latest `task.stage_changed` event) is older than setting `worktree_cleanup_days` (default `WORKTREE_CLEANUP_DAYS = 7`; `0` = off). Clean worktrees are removed; dirty ones are kept (no `force`).
`DELETE /tasks/{id}/workspace` (new path; M2 owns `GET`) is **Clean up now**. Both call `remove_worktree()`, set `tasks.worktree_path = NULL`, keep the branch and checkpoint refs, and emit `workspace.removed {auto}`. Dirty worktree -> 409 `dirty` unless `force=true` ("Clean up anyway"). The Done screen reads `cleanup_at` (computed: stage time + days) and `dirty` from `GET /tasks/{id}/workspace`. No prompt in the UI or the CLI.
**Why:** F6.6 and spec section 9 ("cleaned up after 7 days, link on Done"). No dialog means ship is one click. Never forcing in the scan means no work is lost. The scan is idempotent, so a missed run (laptop asleep) just runs later.

### Decision 15 — Diff view gets file contents from the shas
`GET /tasks/{id}/review/file?path=` returns `git show <base_sha>:<old_path>` and `git show <head_sha>:<path>` (null when added/deleted; `binary: true` if git says so; size cap `REVIEW_FILE_MAX_BYTES`). The UI feeds them to `MergeView` (side by side) or `unifiedMergeView` (unified) from `@codemirror/merge`, read-only.
**Why:** The merge view needs whole files, not hunks. Reading from the shas keeps it in sync with the story.

### Decision 16 — Second-opinion part of the Trust score, and findings in the verdict **(new)**
`second_part` = 15 if no `review_findings` row with severity high or medium is `open`; 8 if only medium ones are open; 0 if a high one is open or no review run exists for the latest story. `ignored` and `sent` findings do not count as open.
The proof API now passes the severities of the **open** findings of the latest story to M4's `verdict()` (M4 passed `[]`). The function does not change. A `review.finding` or `review.finding_updated` event makes the UI reload `GET /tasks/{id}/proof`.
**Why:** core FSD F7.7 and spec section 6 (high open -> Has problems, medium open -> Take a look). Tests: `tests/unit/checks/test_trust.py::test_second_opinion_part` covers all four cases; `tests/api/test_proof_api.py::test_verdict_uses_open_findings` covers high / medium / ignored.

### Decision 17 — Why notes in Files come from the latest story (F17.6) **(new)**
`review/why.py: file_notes(task, path) -> FileNotes`. It reads the latest `change_stories` row. If the worktree file's blob (`git hash-object`) equals the blob at `head_sha`, each hunk of that file maps to its group: `[{hunk_id, new_start, new_lines, group_id, group_title, why, risk_tags}]`. If not, it returns the groups that touched the file once, with `changed_after_review: true`. No story -> `{state: "no_story"}`. No agent call, no new table.
**Why:** The groups already hold the "why" (Decision 4). Mapping by blob equality is exact and cheap; re-matching moved lines would be guesswork.

### Decision 18 — Looked-at marks: one small table, stale by content (F17.7) **(new)**
Table `file_marks(task_id, path, looked_at_sha, marked_at)`, primary key `(task_id, path)`. `looked_at_sha` = `git hash-object <worktree>/<path>` at mark time (empty string for a deleted file). A mark counts only while the current hash equals `looked_at_sha`, so any change (fix run, hand edit, sync) clears it with no listener. Stale rows are deleted lazily on read.
**Why:** The smallest data that meets "reset when the file changes". One `git hash-object` call for all changed paths per list request. A column on an existing table cannot hold per-file data.

### Decision 19 — "Next change" order comes from the daemon **(new)**
`GET /tasks/{id}/files/changes` returns every changed part in review order: groups of the latest story in order, hunks in diff order inside each group, then changed files not in the story (path order). Each item: `{path, hunk_id, group_id, group_title, why, risk_tags, new_start, new_lines, looked_at}` plus `{changed_files, looked_at_count}`. The UI's **Next change** moves to the next item with `looked_at = false`. No story -> path order from the diff vs main (M3).
**Why:** CLAUDE.md rule 1: ordering is a small rule, and the CLI (`saarthi review --changes`) must show the same order.

### Decision 20 — A sync conflict counts as Needs you **(new)**
The task schema gets a computed `sync_conflict: bool` = the latest `workspace.synced` event for the task has `result = "conflict"` (one indexed query; Decision 13 keeps the state in git, the event is its mirror). The task schema passes it to M3's `status_for(stage, waiting_on_user=...)`: `sync_conflict = true` -> `needs_you` for any shown stage. The function itself does not change. The task page shows view `conflict` with **Let Claude fix it** (`action: "fix"`) and **Undo the update** (`action: "abort"`).
**Why:** Spec section 4 lists "conflict waiting for the user" under Needs you. The stage stays as it is (no new `ALLOWED_MOVES` row).

---

## 5. Modules and files

```
daemon/src/saarthi/
├── review/
│   ├── diff_parse.py     # Decision 2
│   ├── risk.py           # Decision 3
│   ├── story.py          # build_story(task): checkpoint, parse, flags, side run, validate, fallback
│   ├── grouping.py       # validate_groups(), folder_fallback()
│   ├── second_opinion.py # pick reviewer, start review run, parse findings
│   ├── send.py           # Decision 5
│   ├── decision.py       # approve / reject
│   ├── pr_body.py        # Decision 11
│   ├── why.py            # Decision 17: why notes for Files
│   ├── marks.py          # Decisions 18-19: file_marks, files/changes order
│   ├── trigger.py        # listeners: stage -> review; run.finished for review/story/fix runs
│   └── repo.py           # change_stories, review_comments, review_findings queries
├── workspace/
│   ├── push.py           # Decision 10 (only git push in the codebase)
│   ├── commit.py         # Decision 9
│   ├── ship.py           # Decision 8 (steps + hook lists)
│   ├── sync.py           # Decision 13
│   ├── cleanup.py        # Decision 14: scan after N days
│   └── gh.py             # pr_create(), pr_view() via gh_path
├── core/stages.py        # + (review, shipped) ship_done, + (review, verifying)
├── schemas/review.py, schemas/ship.py
├── schemas/json/change_story.schema.json, review_findings.schema.json, commit_message.schema.json
├── api/routes/review.py, api/routes/ship.py, api/routes/workspace_sync.py, api/routes/task_files_review.py (files/changes, files/looked-at)
├── cli/review.py, cli/ship.py, cli/workspace.py (+ sync, remove)
└── db/migrations/versions/<rev>_m5_review_and_ship.py

desktop/src/
├── screens/TaskPage/CheckAndShip/WhatChanged.tsx  # lower part of Check and ship: groups, explanations, risk tags
├── components/review/DiffPane.tsx       # @codemirror/merge, side-by-side / unified toggle, gutter comments (view `comment`)
├── components/review/FileList.tsx       # plain file view (F10.6)
├── components/review/AskReviewCard.tsx  # optional "Ask Codex to review" card: findings, Ignore, "Fix these"
├── components/review/CommentsPanel.tsx  # "Send to Claude (N)"
├── components/review/ShipBar.tsx        # "Approve and create pull request", "Edit pull request text", Reject link, step errors + Try again
├── screens/TaskPage/EditPr.tsx          # view `editPr`: title, commit body, PR body (prefilled from /ship/draft)
├── screens/TaskPage/Done.tsx            # view `done`: PR link, "cleaned up in N days", Clean up now / anyway
├── screens/TaskPage/Conflict.tsx        # view `conflict`: files, Let Claude fix it, Undo the update
├── components/details/BehindMain.tsx    # More → Details: "Behind main by N", Update from main
└── screens/Files/ (M3) + WhyStrip.tsx, LookedAtButton.tsx, NextChange.tsx   # F17.6 / F17.7
```

---

## 6. Data model changes

Migration: `<rev>_m5_review_and_ship.py`. Core fields from TDD 5.8; new fields marked *.

**`change_stories`**: id, task_id, run_id (story side run, nullable), groups json `[{id: "g1", title, explanation, hunk_ids}]`, risk_flags json `[{kind, path, reason, hunk_ids}]`, created_at, source* (`agent` / `folder` / `folder_too_big`), note*, base_sha*, head_sha*, files* json `[{path, old_path, status, binary, added, removed, hunks: [{id, header, old_start, old_lines, new_start, new_lines}]}]`, decision* (`approved` / `rejected` / null), decision_note*, decided_at*.

**`review_comments`**: id, task_id, file, line, group_id, body, status (`open`/`sent`/`resolved`), created_at, story_id*, line_text*, sent_run_id*.

**`review_findings`**: id, task_id, reviewer_agent, file, line, severity, reason, status (`open`/`sent`/`ignored`), run_id*, story_id*, sent_run_id*, created_at*.

`change_stories` also gets commit_draft* json null `{subject, body, source: agent/template}` (Decision 9).

**`file_marks`** (new table, Decision 18): task_id (FK tasks), path text, looked_at_sha text, marked_at datetime. Primary key `(task_id, path)`.

**`tasks`** (new columns*): pr_url* text null, shipped_sha* text null.

Indexes: `(task_id, created_at)` on the three review tables. `file_marks` uses its primary key.

---

## 7. Events added

| Type | Payload |
|---|---|
| `review.story_ready` | `{story_id, source, head_sha, groups, hunks, risk_flags: [{kind, path}]}` |
| `review.comment` | `{comment_id, story_id, file, line, group_id, body}` |
| `review.finding` | `{finding_id, run_id, reviewer_agent, file, line, severity, reason}` |
| `review.second_opinion_done` **(new)** | `{run_id, reviewer_agent, same_agent, usable, findings}` |
| `review.finding_updated` **(new)** | `{finding_id, status}` |
| `review.sent` **(new)** | `{run_id, comment_ids, finding_ids}` |
| `review.approved` | `{story_id}` |
| `review.rejected` | `{story_id, note}` |
| `ship.committed` | `{sha, subject}` |
| `ship.pushed` | `{remote, branch, sha, forced}` |
| `ship.pr_created` | `{url, number, reused}` |
| `ship.failed` **(new)** | `{step, code, error}` (`code` e.g. `push_refused`, `hook_failed`, `gh_not_logged_in`) |
| `workspace.synced` **(new)** | `{strategy, base_ref, result: ok/conflict/aborted/finished, phase, conflict_files, changed, checkpoint_ref}` |
| `workspace.removed` | `{path, branch, auto}` (`auto: true` from the cleanup scan) |
| `review.commit_drafted` **(new)** | `{story_id, source}` |
| `review.looked_at` **(new)** | `{path, looked_at_sha, marked}` (`marked: false` when I remove the mark) |

---

## 8. API and CLI added

### 8.1 REST (all under `/api/v1`)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/tasks/{id}/review` | — | `{story, findings, comments, second_opinion: {state, run_id}, can_ship: {ok, reasons}}` |
| POST | `/tasks/{id}/review/rebuild` (new sub-path) | `{}` | `202 {story_run_id}` |
| GET | `/tasks/{id}/review/diff` (new sub-path) | `?story_id&group_id&path` | `text/x-diff` |
| GET | `/tasks/{id}/review/file` (new sub-path) | `?path&story_id` | `{path, old, new, binary}` |
| POST | `/tasks/{id}/review/second-opinion` | `{agent?}` | `202 {run_id, reviewer, same_agent}`; 409 `reviewer_not_ready` |
| POST | `/tasks/{id}/review/comments` | `{file?, line?, group_id?, body}` | `201 Comment` |
| PATCH | `/tasks/{id}/review/findings/{fid}` (new sub-path) | `{status: "ignored"/"open"}` | `Finding` |
| POST | `/tasks/{id}/review/send` | `{comment_ids, finding_ids, agent?}` | `201 RunOut`; 409 `nothing_selected` |
| POST | `/tasks/{id}/review/decision` | `{decision: "approve"/"reject", note?}` | `Story`; 409 `note_required` |
| POST | `/tasks/{id}/ship/draft` (new sub-path) | `{}` | `{subject, body, pr_body, source: "agent"/"template"}` (prefills `editPr`; reads the saved draft) |
| POST | `/tasks/{id}/ship` | `{approve?, commit_message?, pr_title?, pr_body?, create_pr?, force_with_lease?}` (`extra="forbid"`; all text optional = default text) | `{steps: [{name, status, detail}], commit_sha, pr_url, stage}` |
| POST | `/tasks/{id}/workspace/sync` | `{action: "start"/"abort"/"fix", strategy?, agent?}` | `SyncResult` or `RunOut` |
| DELETE | `/tasks/{id}/workspace` (new method) | `?force=` | `204`; 409 `dirty` ("Clean up now" / "Clean up anyway") |
| GET | `/tasks/{id}/files/changes` (new sub-path) | — | Decision 19 list, `{changed_files, looked_at_count, items}` |
| GET | `/tasks/{id}/files/why` (new sub-path) | `?path` | Decision 17 `FileNotes` |
| PUT | `/tasks/{id}/files/looked-at` (new sub-path) | `{path}` | `{path, looked_at_sha}` |
| DELETE | `/tasks/{id}/files/looked-at` (new sub-path) | `?path` | `204` |

Changed (owned by M2/M3): `GET /tasks/{id}/workspace` adds `cleanup_at` and `dirty`; task list/detail adds `sync_conflict` (Decision 20).

### 8.2 CLI
| Command | Options | Output |
|---|---|---|
| `saarthi review <task>` | `--rebuild`, `--diff [--group g2]`, `--json` | Story (FSD 5.1 example) |
| | `--second-opinion [--agent X] [--wait]` | Findings list |
| | `--comment <file>:<line> --text "..."`, `--group-comment g2 --text "..."` | Comment id |
| | `--send (--ids c1,f2 / --all-open) [--agent X]` | Run id, new stage |
| | `--ignore f3`, `--approve`, `--reject "note"` | Result line |
| | `--changes [--json]`, `--looked-at <path>`, `--not-looked-at <path>` | Change list in review order with marks (FSD 5.13 example) |
| `saarthi ship <task>` | `--approve`, `-m "msg"` / `--message-file F`, `-e` / `--edit`, `--no-pr`, `--force-with-lease`, `--cleanup`, `--json` | Step lines (FSD 5.8 example). Without `-m` or `-e`, uses the default text (saved draft or template); `-e` opens it in `$EDITOR` (same as `brief edit`). `--cleanup` removes the copy right after ship. No questions asked. |
| `saarthi workspace sync <task>` | `--strategy rebase/merge`, `--abort`, `--fix [--agent X]` | FSD 5.11 example |
| `saarthi workspace remove <task>` | `--force` | `Worktree removed. Branch kept: saarthi/T-0042-...` |

Action flags on `saarthi review` are mutually exclusive. Exit codes: 0 ok, 1 refused (409), 2 error.

---

## 9. Key flows

### 9.1 Story on entering Review
1. `task.stage_changed {to: "review"}` -> `review/trigger.py`.
2. `checkpoint(task, "review")` -> `head_sha`; `base_sha = merge-base(head_sha, base_ref)`.
3. Parse diff, compute flags, write `REVIEW_DIFF.md`.
4. Too big -> fallback. Else start `story` side run; wait `STORY_TIMEOUT_SEC`; validate (Decision 4).
5. Save the story (`decision = null`), emit `review.story_ready`.

### 9.2 Ask Codex to review -> Fix these
1. `POST .../second-opinion`. Pick reviewer, start `review` side run. Task stays `review`.
2. On `run.finished`: parse `structured`, save findings, one `review.finding` each, then `review.second_opinion_done`.
3. `POST .../send {finding_ids}` -> Decision 5 -> fix run -> M4 checks -> `review` -> flow 9.1.

### 9.3 Ship
1. If `approve`: approve the latest story (`review.approved`). Preconditions: stage `review`; no active run; no sync ref; latest story approved; tree unchanged (Decision 7).
2. `before_commit` hooks (none in M5).
3. Commit with request text, else saved draft, else template (Decision 9) -> `ship.committed`.
4. `push_task_branch()` (Decision 10) -> `tasks.shipped_sha` -> `ship.pushed`.
5. If `create_pr`: `gh pr view` -> reuse, else build body, `gh pr create` -> `tasks.pr_url` -> `ship.pr_created`.
6. `stages.move(review -> shipped, who=system)` (guard `ship_done`).
7. `after_ship` hooks (none in M5). Return steps. The task page shows view `done`; the cleanup scan removes the copy later (Decision 14).

### 9.4 Update from main
See Decision 13. A conflict sets `sync_conflict` (Decision 20); the task shows as Needs you.

### 9.5 Files: why notes, marks, Next change
1. Files opens a changed file: `GET /tasks/{id}/files/why?path` (Decision 17) next to M3's diff vs main.
2. **Mark as looked at**: `PUT /tasks/{id}/files/looked-at` -> row upsert -> `review.looked_at`.
3. **Next change**: from `GET /tasks/{id}/files/changes` (Decision 19), the next item with `looked_at = false`.
4. A fix run changes the file -> next read finds a different hash -> mark gone (Decision 18).

---

## 10. Config added

**`config.py`**
| Constant | Default |
|---|---|
| `SIDE_RUN_MODES` | M4 set + `{"story", "review", "commit_msg"}` |
| `RISK_DEFAULTS` | `auth_paths: ["**/auth/**", "**/security/**", "**/*permission*"]`, `migration_paths: ["**/migrations/**", "**/alembic/**"]`, `dependency_paths: ["pyproject.toml", "uv.lock", "requirements*.txt", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "Cargo.toml", "Cargo.lock", "go.mod", "go.sum"]`, `config_paths: [".env*", ".github/**", ".gitlab-ci.yml", "Dockerfile", "docker-compose*.yml", "**/settings*.py", "*.ini", "*.cfg", ".saarthi/**"]` |
| `BIG_FILE_LINES` | `300` |
| `STORY_HUNK_PREVIEW_LINES` | `60` |
| `STORY_AGENT_MAX_DIFF_CHARS` | `120_000` |
| `STORY_MIN_PLACED_RATIO` | `0.8` |
| `STORY_TIMEOUT_SEC` / `SECOND_OPINION_TIMEOUT_SEC` / `COMMIT_DRAFT_TIMEOUT_SEC` | `300` / `900` / `120` |
| `REVIEW_FILE_MAX_BYTES` | `2_000_000` |
| `PROTECTED_BRANCHES` | `("main", "master", "develop", "trunk")` |
| `GIT_NET_TIMEOUT_SEC` | `120` |
| `GH_BIN` | `"gh"` (setting `gh_path` overrides) |
| `PR_BODY_MAX_CHARS` | `60_000` (GitHub limit is 65,536) |
| `SHIP_DIR` | `<data_dir>/ship` |
| `COMMIT_FALLBACK_TYPE` | `"feat"` |
| `SYNC_REF_PREFIX` | `"refs/saarthi/sync/"` |
| `WORKTREE_CLEANUP_DAYS` | `7` (settings key `worktree_cleanup_days`; `0` = off) |
| `CLEANUP_SCAN_INTERVAL_SEC` | `3600` |

**`project.toml`**
```toml
[project]
sync_strategy = "rebase"       # core 10.1: "rebase" | "merge"
create_pr = true               # core 10.1
commit_style = "conventional"  # new: "conventional" | "plain"
remote = "origin"              # new

[risk]                         # each key replaces the default for its kind
auth_paths = ["**/auth/**"]
migration_paths = ["**/alembic/**"]
dependency_paths = ["pyproject.toml", "uv.lock"]   # new
config_paths = [".github/**"]                      # new
big_file_lines = 300                               # new
```

---

## 11. Error handling

| Case | What we do |
|---|---|
| Story agent fails / bad JSON / low ratio | Folder fallback, `source = "folder"`, `note` says why |
| Reviewer agent not ready | 409 `reviewer_not_ready` with the login command; `--agent` to override |
| Findings JSON unusable | `review.second_opinion_done {usable: false}`; raw message stays in the run log |
| Ship preconditions fail | 409 with `reasons` (`not_approved`, `code_changed_since_review`, `run_active`, `sync_in_progress`, `nothing_to_ship`) |
| `.saarthi/context/` staged | Abort commit, `ship.failed {code: "context_staged"}` (should never happen) |
| Commit hook fails | `ship.failed {step: "commit", code: "hook_failed"}` + hook output |
| Push refused by guard | `ship.failed {step: "push", code: "push_refused", error}`; nothing is sent |
| Push rejected (non-fast-forward) | `code: "push_rejected"`, message suggests `--force-with-lease` |
| Auth prompt / network hang | `GIT_TERMINAL_PROMPT=0` + timeout -> `code: "push_timeout"` |
| `gh` missing / not logged in | `code: "gh_not_logged_in"` with `gh auth login`; commit + push stay done; re-run continues |
| PR already exists | Reuse its URL, `reused: true` |
| Sync conflict | `workspace.synced {result: "conflict"}`; task shows as Needs you (view `conflict`); abort or fix |
| Ship step fails | Task stays in `review` (Needs you) with the step error and **Try again** (same call; resumes) |
| Cleanup scan meets a dirty copy | Kept; Done shows "Clean up anyway"; no event |
| `files/looked-at` for a path that is not changed | 409 `not_changed` |
| Sync while run/checks active | 409 `busy` |
| Remove dirty worktree | 409 `dirty` unless `force` |

---

## 12. Tests to write

Agents: `FakeAdapter` only. Git: `tmp_path` repos with a **local bare repo as `origin`** (`git init --bare`). `gh`: a stub script (records argv and the body file to JSON, prints `https://github.com/test/repo/pull/7`), set through the `gh_path` setting.

| File | Proves |
|---|---|
| `tests/unit/review/test_diff_parse.py` | added / deleted / renamed / binary / no-newline / mode-only; hunk ids |
| `tests/unit/review/test_risk.py` | all six kinds; top-level match; project key replaces default; `big_file_lines` |
| `tests/unit/review/test_grouping.py` | valid answer; unknown ids dropped; duplicates; "Other changes"; ratio < 0.8 -> folder; too big -> folder without call |
| `tests/unit/review/test_findings_parse.py` | Codex schema output; Claude fenced JSON; bad items dropped; zero findings ok |
| `tests/unit/review/test_pr_body.py` | sections present; no check output; cut order at the char limit; "not confirmed" label |
| `tests/unit/workspace/test_push_guard.py` | each refusal (a/b/c); refspec args; `--force-with-lease` with sha; never `--force` |
| `tests/unit/test_only_push_module.py` | Scans `src/saarthi/**/*.py`: the string `"push"` inside a git arg list appears only in `workspace/push.py` |
| `tests/unit/core/test_stage_ship_rules.py` | `review -> shipped` needs `shipped_sha` (+ `pr_url` if `create_pr`); user move -> 409; `review -> verifying` system only |
| `tests/integration/test_review_flow.py` | Task enters review -> story from `claude_story_ok.jsonl`; `claude_story_garbage.jsonl` -> folder; comments -> send -> fix run with sections -> resolved on finish |
| `tests/integration/test_second_opinion.py` | Builder claude -> reviewer codex (`codex_review_findings.jsonl`), read-only, stage stays; "Fix these" -> claude fix run; reviewer not ready -> 409 |
| `tests/integration/test_ship_flow.py` | Approve -> ship -> commit on branch in bare origin; stub `gh` got `--base main --head saarthi/...`; body file has brief/story/proof; stage `shipped`; `.saarthi/context` not committed; `gh` stub exits 1 -> stays `review` -> retry runs only PR step |
| `tests/integration/test_push_guard_api.py` | **The "Done when" test.** Through `TestClient` only: (1) DB `tasks.branch = "main"`; (2) `projects.default_branch` = the task branch; (3) task branch upstream set to `origin/main`; (4) body `{"branch": "main"}` -> 422. Each time `git -C origin.git rev-parse main` is unchanged. |
| `tests/integration/test_sync.py` | clean rebase keeps uncommitted + untracked work; clean merge; conflict (rebase phase) -> abort -> identical tree and files; conflict (reapply phase); `--fix` starts run with "Merge conflicts"; `review -> verifying` + checks after a changing sync; parallel syncs on two tasks do not clash |
| `tests/integration/test_cleanup.py` | remove keeps branch and checkpoint refs; dirty -> 409; `force` works; `workspace.removed`; scan with a fake clock: 6 days kept, 8 days removed (`auto: true`), dirty kept, `worktree_cleanup_days = 0` keeps all |
| `tests/unit/review/test_why.py` | blob equal -> per-hunk notes; changed after review -> file-level notes + flag; folder fallback text; no story -> `no_story` |
| `tests/unit/review/test_marks.py` | mark + same content -> looked at; content change -> cleared; deleted file mark; order = group order, then hunks, then extra files; no story -> path order |
| `tests/integration/test_one_click_ship.py` | `{approve: true}` with no text -> commit message = saved draft; draft still running -> template, no wait; `pr_title`/`pr_body` from `editPr` reach the stub `gh` |
| `tests/api/test_proof_api.py::test_verdict_uses_open_findings` | open high -> `has_problems`; open medium -> `take_a_look`; ignored -> no effect |
| `tests/unit/core/test_status_conflict.py` | `sync_conflict = true` -> `needs_you` for `review`, `failed`, `ready` |
| `tests/api/test_review_api.py`, `tests/api/test_ship_api.py` | each endpoint, status codes, 409 codes, `extra="forbid"` |
| `tests/cli/test_cli_review_ship.py` | flag exclusivity, exit codes, `--json` shapes |
| `desktop/src/components/review/*.test.tsx` (Vitest) | group click filters hunks; findings checkbox -> send body; one click sends `{approve: true}` with no text; `editPr` sends the edited text; conflict view buttons; Next change skips marked items; looked-at count updates on `review.looked_at` |

New fixtures (record once with real agents, commit): `claude_story_ok.jsonl`, `codex_story_ok.jsonl`, `claude_story_garbage.jsonl`, `codex_review_findings.jsonl`, `claude_review_findings.jsonl`, `claude_commit_msg.jsonl`, `codex_commit_msg.jsonl`.

---

## 13. Manual verification

1. Test repo + bare origin + stub `gh`: run FSD QA steps 1-15.
2. Planted-bug task: Claude builds, Codex reviews, finding found, verdict **Has problems**, "Fix these" -> green -> new story. (Done-when item 2.)
3. Real client repo: build a small real task, read it in Files (why notes, marks), click **Approve and create pull request**. Check the PR on GitHub. (Done-when item 1.)
4. Run `uv run pytest`, `uv run ruff check .`, `uv run pyright`; paste the output in the milestone review note.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Agent groups badly but validly | Explanations are short; plain file view is always there; rebuild button. Why notes in Files inherit the same quality. |
| One click ships text I did not read | Default text is shown on Check and ship before the click; "Edit pull request text" is one click away; the PR can still be edited on GitHub |
| Cleanup scan removes a copy I still wanted | Only clean copies, only after N days, branch and checkpoints stay; `worktree_cleanup_days = 0` turns it off |
| Big diffs make grouping slow or expensive | Size limit -> folder fallback |
| Rebase rewrites a pushed branch | Push needs explicit `--force-with-lease` |
| `git clean -fd` in sync deletes something | Checkpoint first; abort restores it; test covers untracked files |
| Agent forgets `rebase --continue` in a conflict fix | Listener detects it; ship refuses while the sync ref exists |
| `gh` output format changes | Only the URL line is parsed; `gh pr view --json url` as backup |
| M6 needs approvals around ship | Hook lists exist; the design puts "Lessons learned" on Done, after ship (FSD Q6) |

---

## 15. What this milestone does not do

- No lessons learned (M6; hooks and a place on Done only).
- No Side by side compare (M7), no Restore UI (M8), no secret masking (M8).
- No looked-at marks or why notes in project files (`projectFiles`).
- No PR status / CI (Later), no draft PRs, reviewers or labels.
- No squash of agent commits; no editing in the diff view.

---

## 16. Effort breakdown

| Task | Hours |
|---|---|
| Diff parser + risk flags + tests | 2.5 |
| Story build, `story` side run, validation, fallback, migration | 2.5 |
| Review API + CLI | 1.5 |
| Check and ship lower part (groups, merge view, file list) | 3.0 |
| Comments + Send to Claude | 1.5 |
| Ask Codex to review (run, parse, card, Fix these, findings in verdict) | 3.0 |
| Approve / Reject | 0.5 |
| Ship: draft at story time, one-click call, `editPr`, commit, push guard, `gh`, PR body, resume + bare-repo tests | 4.25 |
| Update from main (F6.5) + conflict as Needs you | 2.5 |
| Cleanup scan + Clean up now + Done screen | 0.75 |
| F17.6 why notes (API, CLI, strip) | 1.0 |
| F17.7 marks + Next change (table, API, CLI, UI) | 1.5 |
| Manual verification with a real PR | 0.5 |
| **Total** | **25.0** |

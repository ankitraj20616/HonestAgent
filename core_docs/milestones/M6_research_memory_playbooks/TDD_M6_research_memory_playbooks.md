# TDD — M6: Just research + Lessons and notes + Saved instructions

**Document type:** Technical Design Document (TDD)
**Milestone:** M6 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`): desktop files renamed to the new screens; Lessons learned card on Done; no daemon change
**Estimated effort:** 21 hours (2 rough weeks at ~10 h/week)
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. Every decision says *why*.
**Related documents:** `FSD_M6_research_memory_playbooks.md`, `../../TDD-tech-design-doc.md` (4.3, 4.8, 5.4, 5.9, 6.2, 8.5, 9.1, 10), `../../TECH_STACK.md`, `../M5_review_ship/TDD_M5_review_ship.md` (before), `../M7_race_mode/TDD_M7_race_mode.md` (after)
**Screens:** prototype views `research`, `planReview`, `contextPack`, `notes`, `noteEdit`, `playbooks`, `playbookEdit`, `done` (Lessons learned card) in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. The goal in one sentence

Use the research and brief data that M1 already saves, replace the brief-only Context Pack v0 with v1 (research + matched memory + playbook), add file-based playbooks, and draft memory updates after ship that I approve one by one.

## 2. Read this first — rules this work must not break

From `CLAUDE.md`:

1. **All logic lives in the daemon** (rule 1). Keyword scoring, playbook rendering, import parsing and memory writes are daemon code. The UI only calls the API.
2. **CLI first** (rule 2). Every feature below has a `saarthi` command before its screen.
3. **Agents only through `AgentAdapter`** (rule 3). Research runs, brief drafts and memory drafts all go through the adapters. No `claude`/`codex` strings outside `agents/`.
4. **Every action is an event** (rule 4). New events are in section 7.
5. **Git as a list of args, never push to the default branch** (rule 6). The memory commit reuses M5's push guard.
6. **No hard-coded values** (rule 7). Budgets, limits, paths and markers go in `config.py` or `project.toml`.
7. **Tests first, `FakeAdapter` + recorded fixtures** (rule 8). New fixtures are listed in section 12.
8. **Do not build Later features** (rule 10): no embeddings, no ADR suggestions, no attachments.
9. **Screen words are not API words.** The UI says Goal, Just research, What Claude reads, Lessons and notes, Lessons learned, Saved instructions (Simple UI spec section 5). Tables, endpoints, events and CLI keep `brief`, `research`, `context-pack`, `memory_*`, `playbooks`. Only the desktop strings change.

## 3. What already exists (do not rebuild)

| Thing | Built in | What M6 does with it |
|---|---|---|
| `research_items` table + `GET/POST /tasks/{id}/research`, `PATCH/DELETE /research/{id}`, `research.*` events | M1 | Adds the CLI, the UI, link title fetch, `run_id` column. |
| `briefs` table, one row per version, `GET/PUT /tasks/{id}/brief`, `brief.saved` | M1 | Adds a versions list, read of one version, restore, and the draft call. |
| `saarthi brief edit` (opens `$EDITOR`) | M1 | `brief draft` reuses its editor helper. |
| Run Manager, modes incl. `research`, `POST /tasks/{id}/runs`, `run.finished` | M2 | "Research this" is a normal run with mode `research`. |
| Context Pack v0 (brief only) -> `<worktree>/.saarthi/context/TASK.md`, `GET /tasks/{id}/context-pack` | M2 | Replaced by v1. Same file path, same endpoint, richer response. |
| Plan docs (`docs/plans.py`), docs finder (`docs/finder.py`), `GET /tasks/{id}/docs*`, `doc.saved`, Docs (Task page → More → Docs) | M2 / M3 | Plan goes into the Context Pack (Decision 6). Research items join the docs list (Decision 6a). |
| Read-only agent flags (TDD 4.9 "Read-only" row) | M5 (Second Opinion) | Used for research runs and draft calls. |
| Read-only side runs (brief coverage) | M4 | `config.SIDE_RUN_MODES`, `RunRequest.output_schema`, `agents/structured.py: extract_json()` (M4 TDD Decisions 7-8). M6 adds side-run modes `brief_draft` and `memory_draft` and reuses the same path. In this doc, "helper call" means one such side run. |
| JSON answer parsing (Codex `--output-schema`, Claude fenced JSON) | M5 (findings) | Reused for brief draft and memory draft. |
| Proof Card with failing checks + output tails | M4 | Source of `{{failing_checks}}`. |
| Ship flow, `ship.pr_created`, push with default-branch guard, worktree cleanup | M5 | Memory updates hang off `task.stage_changed -> shipped` and reuse the push. |
| Files (IDE view), CodeMirror, react-markdown, merge view, command bar (`Ctrl K`) | M3 / M5 | Reused on Lessons and notes, goal compare, saved-instructions search. |

## 4. Technical decisions

### Decision 1 — "Research this" is a normal M2 run with mode `research`, and it does not move the stage (new)

`saarthi research run` calls the existing `POST /tasks/{id}/runs {mode: "research"}`. Read-only flags, worktree, Context Pack, events, cost and resume all come from M2 for free.

Since M2, the Task Engine skips stage moves for `research` runs (M2 TDD Decision 6); M6 relies on it. They may start in `inbox`, `research`, `ready`, `failed`, `review`. **Why:** core TDD section 7 says "Running -> Ready when a plan / research run ends". For a task still in `Research`, that would jump it to `Ready` without a brief goal, which breaks the F2.5 rule. A research run is a side run, like Second Opinion. Allowed start stages live in `config.RESEARCH_RUN_STAGES`, not in `ALLOWED_MOVES`, because no move happens.

### Decision 2 — The finding text is taken from marked text in the agent's last message (new)

The research prompt (`prompts/research.md`) asks the agent to end with its report between two marker lines:

```
=== SAARTHI FINDING START ===
## Related files
## How the current code works
## Risks
## Suggested approach
=== SAARTHI FINDING END ===
```

On `run.finished` for a `research` run, `core/research.py: extract_finding(run_id)`:

1. Reads the run's `agent.message` events (not `raw`) from the Event Store, newest first. The first one that holds a full marker pair wins. Text between the markers is the finding.
2. No markers -> use `runs.summary` (the last agent message, already saved by M2).
3. Empty after `strip()` -> save nothing. The API and CLI say "No finding text found - see Activity". The run's own `run.finished` event is the record.
4. Missing headings do not block saving. They are listed in `research.added` payload `missing_headings`, and the CLI prints a warning.

**Why markers:** both agents end with free text that may also hold chatter ("Done! Here is..."). Markers are simple, agent-neutral, and testable with fixtures. Read-only runs cannot write a file, so "write findings to a file" is not an option.

### Decision 3 — Link titles are fetched in the background with the standard library (new)

`POST /tasks/{id}/research` with `kind = link` and an empty title saves the item at once (title = host + path) and schedules `core/link_title.py: fetch_title(item_id)` with `asyncio.create_task`. It runs `urllib.request` inside `asyncio.to_thread`, reads at most `RESEARCH_TITLE_FETCH_MAX_BYTES`, follows redirects (urllib default, max 10), stops after `RESEARCH_TITLE_FETCH_TIMEOUT_SEC`, and parses `<title>` with `html.parser`. On success it updates the item and emits `research.updated`. On any error it logs and keeps the fallback title.

**Why:** the POST must stay fast (UI and CLI). No new dependency is needed for one GET. Only `http`/`https` schemes are allowed (checked before the fetch).

### Decision 4 — "Draft brief" ("Make a goal from this" on screen) is a synchronous read-only helper call that returns a draft and saves nothing

`POST /tasks/{id}/brief/draft {agent?}` starts an M4 side run with mode `brief_draft`, waits for it, and uses `prompts/brief_draft.md` and `prompts/brief_draft.schema.json`. Input: task title, latest brief (if any), research items with `send_to_agent = true`. Output: `{goal, acceptance[], notes, focus_paths[]}`. The response is the draft; no `briefs` row is written. The client saves it with the existing `PUT /tasks/{id}/brief`.

If the JSON is invalid, the response has `draft = null`, `raw_text`, and a warning. The CLI then puts `raw_text` under the Notes heading of the editor template. **Why:** F3.2 says "user edits and approves". A draft that saves itself would add noise versions. The call is short (< `BRIEF_DRAFT_TIMEOUT_SEC`), so a plain request is enough; no job queue.

### Decision 5 — Brief versions get two read endpoints and a restore that is just a save (new paths)

`GET /tasks/{id}/brief/versions` (list) and `GET /tasks/{id}/brief?version=N` (one). Restore = the client reads version N and `PUT`s it, which makes a new version. **Why:** F3.4 says nothing is lost. A restore that copies forward keeps the "versions only grow" rule from M1 and needs no new write path.

### Decision 6 — Context Pack v1 has fixed sections and two budgets

`memory/context_pack.py: build(task, run_request) -> ContextPack` returns the markdown and a list of `PackSection` rows (`name`, `source`, `chars`, `state` = `full | cut | listed | off`). The same function serves the preview and the run, so they cannot drift. Sections and order are in FSD 5.8 (header, playbook, brief, plan, research, listed, memory).

- **Plan section** (F22.5, new): for `build` and `fix` runs only, the newest plan doc of the task (`docs.finder`, kind `plan`, M2 Decision 19) is inlined after the brief, header comment removed, at most `CONTEXT_PLAN_MAX_CHARS` (15,000), cut with the same cut marker. No plan doc, or mode `research` / `plan` -> no section. **Why:** the plan I approved should reach the build run without copy and paste; research and plan runs should explore with fresh eyes, not follow an old plan. The cap keeps one long plan from eating the pack.
- **Memory budget** = `[memory] max_chars` (default 20,000), `max_files` (default 5). From core TDD 4.8.
- **Research budget** (new): each item at most `CONTEXT_RESEARCH_ITEM_MAX_CHARS` (8,000); all items together at most `CONTEXT_RESEARCH_MAX_CHARS` (30,000). Items past the budget are listed by title only. **Why:** one pasted log can be 1 MB. The core docs set no limit here.
- **Always-include files are listed, not inlined** (new). F12.2 says "always include FSD, TDD, CLAUDE.md". Core TDD 4.8 says CLAUDE.md / AGENTS.md are only listed because the agent reads them itself. The FSD and TDD are ~30k characters each, so inlining them would break the 20k budget at once. Listing them keeps both docs true.

Cut text ends with `> (cut at N chars - read the full file: <path>)`.

### Decision 6a — Research items are listed as docs (F22.5, new)
`docs/finder.py` (M2) gets one more source: `research_items` of kind `agent_finding` and `note` become docs of kind `research`, `doc_id = research:<item_id>`, `title` = item title, `path` = null, `source = "data"`, `change = null`, `pinned = false`. They come last in the order (after pinned). `GET /tasks/{id}/docs/content?doc=research:<id>` returns the item body as `markdown`. No new endpoint and no new table. Links and snippets are not docs. `research.added`, `research.updated` and `research.deleted` make Docs refresh (M6 adds these three types to the docs refresh list in the M3 `eventRouter`). **Why:** one place to read everything written for a task; the data stays in `research_items`, so there is still one source of truth.

### Decision 7 — Keyword scoring with ripgrep, one call per keyword

`memory/keywords.py: keywords(title, brief) -> list[str]`:
lowercase; split on `[^a-z0-9_]+`; drop words shorter than `CONTEXT_KEYWORD_MIN_LEN` (3) and words in `CONTEXT_STOP_WORDS`; keep first-seen order; dedupe; keep the first `CONTEXT_MAX_KEYWORDS` (20).

`memory/match.py: score_files(memory_dir, keywords) -> list[FileScore]`:

```
for kw in keywords:
    rg --count --ignore-case --fixed-strings --glob '*.md' -- <kw> <memory_dir>
    -> lines "path:N"; score[path] += min(N, CONTEXT_KEYWORD_HIT_CAP)   # cap = 5
```

Drop files in `[memory] always_include` or matching `[memory] exclude`. Drop score < `CONTEXT_MEMORY_MIN_SCORE` (2). Sort by score desc, then path asc (stable for tests). Take `max_files`.

**Why:** "lines that contain the word, capped" rewards files that talk about several brief words, and stops one word repeated 200 times from winning. 20 small `rg` calls on a `core_docs/` folder take well under 100 ms. If `rg` is not found, `match.py` uses a pure-Python line scan with the same rules (same tests run on both). The Health page (M3) already reports `rg`.

### Decision 8 — Which copy of memory is read (new)

- **Context Pack:** the task **worktree** copy (`<worktree>/<memory_path>`), so the agent sees the same files it can open. Falls back to the main checkout when no worktree exists yet (preview before the first run).
- **Lessons and notes screen:** the **main checkout** (`projects.repo_path`). Saarthi never commits these edits.

### Decision 9 — Playbooks are files; the `playbooks` table is an index synced from them (new)

Three folders, highest priority first: project `<repo>/.saarthi/playbooks/`, global `~/.config/saarthi/playbooks/`, built-in `saarthi/playbooks/builtin/` (package data, read with `importlib.resources`).

`playbooks/store.py: sync(project_id | None)` scans the folders, upserts rows (by `id`), and deletes rows whose file is gone. It skips files whose `file_mtime` and size did not change. It runs on daemon start, on every `GET /playbooks`, and before a run resolves a playbook. **Why:** files can be edited by hand, committed with the project, and shared later (team mode). The table (owned by M6 in core TDD 5.9) gives fast lists for the command bar and a stable key for `runs.playbook_id`.

**IDs are readable keys, not ULIDs** (new): `builtin:fix-bug-tdd`, `global:fix-bug-tdd`, `project:<project_id>:fix-bug-tdd`. **Why:** rows are rebuilt from files; a ULID would change on every rebuild and break `runs.playbook_id` history. The API and CLI also accept a bare slug (`fix-bug-tdd`), resolved by priority for the given project (matches core TDD 8.1 `playbook_id: "plan-then-build"`). `runs.playbook_id` stores the resolved full id.

### Decision 10 — Playbook file format: markdown with TOML front matter between `+++` lines (new)

```markdown
+++
name = "Fix bug with TDD (failing test first)"
description = "Write a failing test that shows the bug, then fix it."
default_agent = "claude"
default_mode = "build"
+++
Read `.saarthi/context/TASK.md` first. The bug: {{brief.goal}}
1. Write a test that fails because of this bug. Run it. Show it fails.
...
```

Slug = file name without `.md` (`^[a-z0-9][a-z0-9-]{0,63}$`). No front matter -> name = first `#` heading or the slug; no defaults. Bad TOML -> the playbook is listed with `error` set and cannot be used; the file path is in the message.

**Why TOML:** parsed by stdlib `tomllib` (no new library), same language as `project.toml`. YAML would need PyYAML. (FSD open question 2.)

### Decision 11 — Variables are a fixed list filled by one regex, no template engine (new)

`playbooks/render.py: render(text, ctx) -> Rendered(text, warnings)`. Pattern `\{\{\s*([a-z_.]+)\s*\}\}`. Known names: `PLAYBOOK_VARIABLES` in `config.py` (list in FSD 5.13). Empty value -> `PLAYBOOK_EMPTY_VALUE` (`(none)`). Unknown name -> left as is + a warning. `{{failing_checks}}` = for each failing required check in the latest Proof Card: `- <name>: exit <code>` + the last `PLAYBOOK_FAILING_TAIL_LINES` (30) lines in a code block. **Why:** no logic is needed, and Jinja would add a dependency and a way for prompt files to run code.

### Decision 12 — Prompt templates for our own calls live as package files (new)

`daemon/src/saarthi/prompts/`: `research.md`, `brief_draft.md`, `brief_draft.schema.json`, `memory_draft.md`, `memory_draft.schema.json`. Paths are constants in `config.py`. If M4/M5 already made a prompts folder, add the files there. **Why:** long prompt text in Python strings is hard to review; rule 7 still holds because the location is one constant.

### Decision 13 — Memory updates are drafted after Shipped, append-only, one commit when all are decided (new)

- **Trigger:** `memory/updates.py` subscribes to the Event Bus for `task.stage_changed` with `to = "shipped"` (and `[memory] auto_update_on_ship = true`). It drafts in the background. **Why:** no change to M5's ship code is needed, and my approval never blocks shipping. This moves the memory step after "Task -> Shipped" in core TDD 8.5 (FSD open question 1). The texts still land on the task branch and in the open PR.
- **Drafting:** one M4 side run with mode `memory_draft` and `prompts/memory_draft.md`. Input: brief, Change Story groups, Proof Card summary, fixed review findings, run summaries. Output schema: `{project_memory: str | null, learnings: [{file, text}], timeline_summary: str}`. Learnings file names must match `^[a-z0-9-]+\.md$`; at most `MEMORY_MAX_LEARNINGS` (3); others dropped.
- **Timeline row is made by Saarthi**, not the agent: date, task id, title, `timeline_summary`, PR url (from the latest `ship.pr_created`). If the last non-empty line of `timeline.md` starts with `|`, write a table row (pipes in text escaped); else a `- ` bullet. **Why:** dates and links must be exact; the timeline row exists even when the agent call fails.
- **project_memory** text is put under `## <date> - <task id> <title>`. **Append-only** (`action = append`, or `create` when the file does not exist). **Why:** a full-file rewrite could silently drop my manual edits; a small block is easy to review.
- **Decide:** approve (optionally with edited text -> `final_text`) or reject, per update. When no update for the task is `pending` and at least one is `approved`, `apply()` runs.
- **Apply:** use the task worktree if it exists, else `git worktree add <tmp> <branch>` and remove it after. Write files (paths must stay under `memory_path`), `git add -- <paths>`, `git commit -m <MEMORY_COMMIT_MESSAGE>`, push with M5's guarded push. Mark rows `applied` with `commit_sha`. If `gh pr view <branch> --json state` says `MERGED` or `CLOSED`, the result carries a warning: "PR already merged; memory commit is on the branch only". **Why the temp worktree:** M5 may remove the task copy soon after ship (by hand, or the 7-day cleanup linked on Done); M6 must not block that.

### Decision 14 — Lessons and notes has its own small endpoints with a path guard and a hash check (new)

`GET /projects/{id}/memory/tree`, `GET /projects/{id}/memory/file?path=`, `PUT /projects/{id}/memory/file {path, text, base_hash}`. `path` is relative to the memory folder (`memory/project_memory.md`). `memory/files.py: safe_path()` resolves the path, refuses anything outside `<repo>/<memory_path>`, refuses symlinks that leave it, allows only `MEMORY_EDITABLE_SUFFIXES` for writes and files under `MEMORY_FILE_MAX_BYTES`. `base_hash` (sha256 of the text the client loaded) must match the file on disk, else 409. **Why separate from M3's `/projects/{id}/files`:** that endpoint serves the Files screen (read and tiny edits in a task copy); memory needs the main checkout, a write path and a tighter guard. Keeping them apart keeps each guard simple.

### Decision 15 — Small CLI id prefixes (new)

Research item and memory update commands accept a unique id prefix of at least `CLI_ID_PREFIX_MIN` (6) characters. Ambiguous -> error listing the matches. **Why:** ULIDs are 26 characters; typing them by hand is slow.

## 5. Modules and files

### Daemon (`daemon/src/saarthi/`)

| File | New / changed | What |
|---|---|---|
| `config.py` | changed | Constants in section 10. |
| `core/research.py` | new | `add_item()` hook for links, `extract_finding()`, `on_run_finished()` subscriber. |
| `core/link_title.py` | new | `fetch_title(url) -> str | None` (Decision 3). |
| `core/briefs.py` | changed (M1) | `list_versions()`, `get_version()`. |
| `core/brief_draft.py` | new | `draft_brief(task_id, agent) -> BriefDraftResult`. |
| `core/tasks.py` | no change | Research runs already skip stage moves since M2 (M2 TDD Decision 6). Only add the test below. |
| `memory/keywords.py` | new | Keyword list (Decision 7). |
| `memory/match.py` | new | `score_files()` with `rg` and Python fallback. |
| `memory/context_pack.py` | replaced (M2 v0) | v1 builder + writer (Decision 6). |
| `memory/files.py` | new | Tree, read, guarded write (Decision 14). |
| `memory/updates.py` | new | Draft, decide, apply (Decision 13). |
| `playbooks/format.py` | new | Parse `+++` front matter -> `PlaybookFile`. |
| `playbooks/store.py` | new | `sync()`, `resolve(slug_or_id, project_id)`, create / update / delete files. |
| `playbooks/render.py` | new | Variables (Decision 11). |
| `playbooks/importer.py` | new | `split_quick_prompts(text) -> list[ImportCandidate]` (section 9.7). |
| `playbooks/builtin/*.md` | new | The 5 built-ins (FSD 5.12). |
| `prompts/*.md`, `prompts/*.schema.json` | new | Decision 12. |
| `db/models.py` | changed | `Playbook`, `MemoryUpdate`, `ResearchItem.run_id`. |
| `db/migrations/versions/<rev>_m6_playbooks_memory_updates.py` | new | Section 6. |
| `schemas/research.py`, `schemas/brief.py`, `schemas/context_pack.py`, `schemas/playbook.py`, `schemas/memory.py` | new / changed | Pydantic request / response models. |
| `api/routes/research.py`, `briefs.py`, `context_pack.py` | changed | Title fetch hook, versions, draft, v1 preview. |
| `api/routes/memory.py`, `api/routes/playbooks.py` | new | Section 8. |
| `core/runs.py` | changed (M2) | Resolve `playbook_id`, apply its default agent/mode when the request leaves them empty, pass rendered text to the pack. |
| `cli/research.py`, `cli/context.py`, `cli/memory.py`, `cli/playbook.py` | new | Section 8. |
| `cli/brief.py`, `cli/run.py` | changed | `brief draft|versions|show|restore`; `run --playbook`. |

### Desktop (`desktop/src/`)

| File | What |
|---|---|
| `screens/TaskPage/ResearchView.tsx`, `ResearchItemCard.tsx`, `AddResearchForm.tsx` | View `research`: notes, links, snippets, "Send to Claude" toggle, the finding, **Make a goal from this**. |
| `screens/NewTask/MoreOptions.tsx` (M3) | "Just research, no code" choice (starts `POST /tasks/{id}/runs {mode: "research"}`) and the Saved instructions picker. |
| `screens/TaskPage/GoalHistory.tsx` | Goal card -> Edit -> History: versions list, read-only view, compare (CodeMirror merge from M5), Restore. |
| `screens/TaskPage/GoalCard.tsx` (M3) | **Make a goal from this** fills the editor (calls `POST /tasks/{id}/brief/draft`). |
| `screens/Done/LessonsLearnedCard.tsx` | Optional card on `done`: drafts with a diff-style preview; Save all / Edit first (edit, keep, drop each) / Skip. |
| `screens/TaskPage/More/WhatClaudeReads.tsx` | View `contextPack`: section table + full markdown. |
| `screens/LessonsAndNotes.tsx`, `screens/NoteEdit.tsx` | Views `notes` / `noteEdit`: tree, react-markdown view, CodeMirror markdown edit, "changed on disk" handling. |
| `screens/SavedInstructions.tsx`, `screens/SavedInstructionEdit.tsx` | Views `playbooks` / `playbookEdit`: list by scope, view, edit (non built-in), Copy to edit, "Import from a file" dialog with checkboxes. |
| `components/command-bar/sources.ts` (M3) | Add saved instructions (playbooks) as a source. |
| `components/TopBar/ProjectMenu.tsx` (M3) | Enable the Lessons and notes and Saved instructions entries. |
| `api/` | Regenerate the client from OpenAPI. |

## 6. Data model changes

Migration: `<rev>_m6_playbooks_memory_updates.py` (one migration, core TDD rule).

**`playbooks`** (core TDD 5.9 + index columns, new columns marked):

| Field | Type | Note |
|---|---|---|
| id | text PK | `builtin:<slug>` / `global:<slug>` / `project:<project_id>:<slug>` (Decision 9) |
| scope | text | `builtin` / `global` / `project` (`builtin` is new) |
| project_id | text FK null | set for project scope |
| slug | text | new |
| name, description, prompt | text | |
| default_agent, default_mode | text null | |
| source_path | text | new - absolute file path |
| file_mtime | real, file_size int | new - sync skip check |
| error | text null | new - parse error |
| synced_at | datetime | new |

Unique: (`scope`, `project_id`, `slug`).

**`memory_updates`** (core TDD 5.9 + new columns):

| Field | Type | Note |
|---|---|---|
| id | text PK | ULID |
| task_id | text FK | |
| kind | text | new - `project_memory` / `learning` / `timeline` |
| file_path | text | relative to repo root |
| action | text | new - `append` / `create` |
| proposed_text | text | |
| final_text | text null | new - my edit |
| status | text | `pending` / `approved` / `rejected` / `applied` (`applied` is new) |
| commit_sha | text null | new |
| created_at, decided_at, applied_at | datetime | `decided_at`, `applied_at` new |

**`research_items`:** add `run_id` text null (FK `runs.id`) - the run that made an `agent_finding` (new).

**`events`:** `task_id` must be nullable for `memory.file_saved`. If M1 made it `NOT NULL`, this migration relaxes it (new).

## 7. Events added

| Type | When | Payload |
|---|---|---|
| `memory.update_proposed` | Each draft saved | `{update_id, kind, file_path, action, chars}` |
| `memory.update_decided` (new) | Approve / reject | `{update_id, decision, edited: bool}` |
| `memory.update_applied` | Commit made | `{update_ids[], commit_sha, branch, pushed: bool, warning?}` |
| `memory.file_saved` (new) | Lessons and notes save | `{project_id, path, chars}` (`task_id = null`) |

Existing events reused: `research.added` (gains `run_id`, `missing_headings` for findings), `research.updated` (title fetch), `brief.saved` (restore and draft save), `run.*` (research run and helper calls as M4 records them).

## 8. API and CLI added

### 8.1 REST (all under `/api/v1`)

| Method | Path | Body / query | Response |
|---|---|---|---|
| POST | `/tasks/{id}/research` (M1, changed) | link with empty title | item; title fetched later |
| GET | `/tasks/{id}/brief/versions` | - | `[{version, created_at, goal_first_line}]` |
| GET | `/tasks/{id}/brief?version=N` (M1, changed) | `version` optional | brief |
| POST | `/tasks/{id}/brief/draft` | `{agent?}` | `{draft: Brief | null, raw_text?, warnings[], cost_usd?}` |
| GET | `/tasks/{id}/context-pack` (M2, changed) | `mode, agent, playbook_id?, extra?` | `{markdown, sections[], total_chars, warnings[]}` |
| GET | `/projects/{id}/memory/tree` | - | `[{path, size, mtime}]` |
| GET | `/projects/{id}/memory/file` | `path` | `{path, text, hash}` |
| PUT | `/projects/{id}/memory/file` | `{path, text, base_hash}` | `{path, hash}`; 409 if changed on disk |
| GET | `/tasks/{id}/memory-updates` | - | list |
| POST | `/tasks/{id}/memory-updates` | `{decisions: [{id, decision: approve|reject, text?}]}` | list + `apply` result if it ran |
| POST | `/tasks/{id}/memory-updates/draft` | - | list (re-draft; only when none pending) |
| POST | `/tasks/{id}/memory-updates/apply` | - | apply result (retry after a push error) |
| GET | `/playbooks` | `project_id?` | list (after sync) |
| POST | `/playbooks` | `{scope, project_id?, slug, name, description, prompt, default_agent?, default_mode?}` | playbook; writes the file |
| GET / PUT / DELETE | `/playbooks/{id}` | PUT = same fields | 403 for built-in |
| POST | `/playbooks/{id}/copy` | `{scope, project_id?}` | new playbook (same slug) |
| GET | `/playbooks/{id}/render` | `task_id` | `{text, warnings[]}` |
| POST | `/playbooks/import` | `{path | text, scope, project_id?, dry_run, only?: int[]}` | `{candidates[], created[]}` |

### 8.2 CLI

| Command | Output |
|---|---|
| `saarthi research add <task> --note TEXT \| --link URL [--note] \| --snippet --title T [--file F]` (stdin if no `--file`) | `Added <kind> <id> to <task>` |
| `saarthi research list <task> [--json]` / `show <id>` / `edit <id>` (`$EDITOR`) / `rm <id>` | table / item |
| `saarthi research toggle <id> --send/--no-send` | new state |
| `saarthi research run <task> [--agent A] [--focus TEXT] [--no-watch]` | live stream, then `Finding saved: <id>` |
| `saarthi brief draft <task> [--agent A]` | opens `$EDITOR`; saves on write |
| `saarthi brief versions <task>` / `show <task> [--version N]` / `restore <task> N` | table / brief / new version |
| `saarthi context <task> [--mode M] [--agent A] [--playbook P] [--extra T] [--show] [--json]` | section table (FSD 5.8) |
| `saarthi memory tree` / `show <path>` / `edit <path>` | tree / markdown / `Saved` |
| `saarthi memory updates <task>` / `approve <id> [--edit]` / `reject <id>` / `draft <task>` / `apply <task>` | table / apply result |
| `saarthi playbook list [--json]` / `show <slug>` / `new <slug> --scope global\|project` / `edit <slug>` / `rm <slug>` / `copy <slug> --scope ...` | table / file / `Created` |
| `saarthi playbook render <slug> --task <task>` | filled text + warnings |
| `saarthi playbook import <file> --scope global\|project [--dry-run] [--only 1,3]` | candidates / created |
| `saarthi run <task> --playbook <slug>` (M2, changed) | as M2 |

Project-level commands use the M1 rule for the current project (`--project`, else the repo of the current folder).

## 9. Key flows

### 9.1 Research this
1. `POST /tasks/T-0042/runs {agent: "claude", mode: "research", extra: "<focus>"}`.
2. Task Engine: mode is `research` -> check `RESEARCH_RUN_STAGES`, no stage move.
3. M2 runs it with read-only flags; the pack's playbook slot holds `prompts/research.md`.
4. `run.finished` -> `core/research.on_run_finished()` -> `extract_finding()` (Decision 2).
5. Save `research_items(kind="agent_finding", title="Agent finding (<agent>) - <local time>", body, run_id, send_to_agent=RESEARCH_SEND_TO_AGENT_DEFAULT)` -> `research.added`.

### 9.2 Context Pack v1 build (`build(task, req)`)
1. Resolve and render the playbook (if any) -> section `playbook`.
2. Latest brief -> `brief`. For `build` / `fix`: latest plan doc -> `plan` (cut at `CONTEXT_PLAN_MAX_CHARS`). Research items with `send_to_agent` in `created_at` order, research budget -> `research`.
3. List `CLAUDE.md`, `AGENTS.md` (if present) + `[memory] always_include` -> `listed`.
4. `keywords()` -> `score_files()` -> fill memory budget -> `memory`.
5. Join with fixed headings. Preview returns it; the run writes it to `<worktree>/.saarthi/context/TASK.md` (path from M2).

### 9.3 Ship -> memory
1. `task.stage_changed {to: "shipped"}` -> `updates.draft(task)` (background).
2. Helper call -> parse -> rows `pending` (+ timeline row always) -> `memory.update_proposed` each.
3. User decides -> `memory.update_decided` each.
4. None pending, at least one approved -> `apply()` (Decision 13) -> `memory.update_applied`.

### 9.4 Playbook at run start
1. `POST /tasks/{id}/runs {playbook_id: "fix-bug-tdd"}` -> `store.sync(project)` -> `resolve()` by priority.
2. Missing agent/mode in the request -> take the playbook's defaults, else project defaults.
3. `render()` with task context -> into the pack. Warnings go into `run.queued` payload.

### 9.5 Import (`split_quick_prompts`)
1. If the text has lines starting with `## `: each `##` section is one candidate (name = heading). Text before the first `##` is ignored.
2. Else split on blank lines into blocks. Join: a block whose last line ends with `:` takes the next block; a block whose first stripped line starts with `-`, `*`, `**` or `<digits>.` joins the block before it.
3. Name: first line if it has <= `IMPORT_NAME_MAX_WORDS` (6) words and the block has more lines (and that line is removed from the prompt); else the first 6 words. Slug from the name; clash -> `-2`, `-3`.
4. `dry_run` returns candidates; otherwise write files for `only` (or all) and `sync()`.

## 10. Config added

`config.py`:

| Constant | Value |
|---|---|
| `SIDE_RUN_MODES` | M5 set + `{"brief_draft", "memory_draft"}` |
| `RESEARCH_SEND_TO_AGENT_DEFAULT` | `True` |
| `RESEARCH_TITLE_FETCH_TIMEOUT_SEC` / `_MAX_BYTES` / `RESEARCH_TITLE_MAX_CHARS` | `5` / `262_144` / `200` |
| `FINDING_START_MARKER` / `FINDING_END_MARKER` | `"=== SAARTHI FINDING START ==="` / `"... END ==="` |
| `FINDING_HEADINGS` | the 4 headings |
| `BRIEF_DRAFT_TIMEOUT_SEC`, `MEMORY_DRAFT_TIMEOUT_SEC` | `180`, `180` |
| `CONTEXT_KEYWORD_MIN_LEN`, `CONTEXT_MAX_KEYWORDS`, `CONTEXT_KEYWORD_HIT_CAP`, `CONTEXT_MEMORY_MIN_SCORE`, `CONTEXT_MEMORY_CUT_MIN_CHARS` | `3`, `20`, `5`, `2`, `2_000` |
| `CONTEXT_STOP_WORDS` | small frozenset (the, and, for, with, should, must, when, this, that, from, into, ...) |
| `CONTEXT_RESEARCH_ITEM_MAX_CHARS`, `CONTEXT_RESEARCH_MAX_CHARS` | `8_000`, `30_000` |
| `CONTEXT_PLAN_MAX_CHARS` | `15_000` |
| `CONTEXT_PLAN_MODES` | `("build", "fix")` |
| `MEMORY_FILE_MAX_BYTES`, `MEMORY_EDITABLE_SUFFIXES` | `1_000_000`, `(".md",)` |
| `MEMORY_PROJECT_FILE`, `MEMORY_TIMELINE_FILE`, `MEMORY_LEARNINGS_DIR` | `"memory/project_memory.md"`, `"timeline/timeline.md"`, `"learnings"` (relative to `memory_path`) |
| `MEMORY_MAX_LEARNINGS` | `3` |
| `MEMORY_COMMIT_MESSAGE` | `"docs(memory): {task_id} {title}"` |
| `PLAYBOOK_GLOBAL_DIR`, `PLAYBOOK_PROJECT_DIR`, `PLAYBOOK_BUILTIN_PACKAGE` | `~/.config/saarthi/playbooks`, `.saarthi/playbooks`, `"saarthi.playbooks.builtin"` |
| `PLAYBOOK_VARIABLES`, `PLAYBOOK_EMPTY_VALUE`, `PLAYBOOK_FAILING_TAIL_LINES` | list, `"(none)"`, `30` |
| `IMPORT_NAME_MAX_WORDS`, `CLI_ID_PREFIX_MIN` | `6`, `6` |
| `PROMPTS_PACKAGE` | `"saarthi.prompts"` |

`project.toml` (new `[memory]` table; `memory_path` stays in `[project]`):

```toml
[memory]
always_include = ["core_docs/FUNCTIONAL_SPECIFICATIONS.md", "core_docs/TDD-tech-design-doc.md"]
exclude = ["core_docs/timeline/**"]
max_files = 5
max_chars = 20000
auto_update_on_ship = true
```

Global setting (`settings` table / Settings screen): `research.fetch_titles` (default `true`).

## 11. Error handling

| Case | What we do |
|---|---|
| Research run ends with no finding text | Nothing saved. CLI/UI: "No finding text found - see Activity." |
| Title fetch fails / times out / not HTML | Keep host + path as title. Log only. |
| Link with a non-http(s) scheme | 422 "only http and https links". |
| Draft brief: agent not ready | 409 with the fix command (M2 `check_ready`). |
| Draft brief / memory draft: invalid JSON | Brief: `raw_text` + warning. Memory: timeline row only + warning; `memory draft` can retry. |
| `rg` missing | Python fallback; pack warning "ripgrep not found, slow search used". |
| No memory folder | Memory section says "no memory folder"; no error. |
| Playbook file has bad TOML | Listed with `error`; run start with it -> 422 with the file path. |
| Unknown playbook slug | 404 listing close slugs. |
| Memory file path outside memory folder / symlink escape | 400 "path outside memory folder". |
| Memory file changed on disk since load | 409 "file changed, reload". |
| Apply: task branch missing locally | 409 "branch <name> not found"; rows stay `approved`. |
| Apply: push fails | Commit kept; rows `applied`, `pushed: false`; `memory apply` retries the push only. |
| Apply: branch is the default branch | Refused by M5's guard (test). |
| PR already merged/closed | Apply works; result warning. |

## 12. Tests to write

All with `FakeAdapter` and recorded fixtures. New fixtures (recorded once with the M0 script, then committed): `claude_research_finding.jsonl`, `codex_research_finding.jsonl`, `claude_research_no_markers.jsonl`, `claude_brief_draft.jsonl`, `codex_brief_draft_bad_json.jsonl`, `claude_memory_draft.jsonl`. Plus copies of the 3 real `quick-prompts.md` files in `tests/fixtures/quick_prompts/`.

| Test file | Proves |
|---|---|
| `tests/unit/memory/test_keywords.py` | Stop words, min length, dedupe, order, max 20. |
| `tests/unit/memory/test_match.py` | Scoring and hit cap; min score; max 5; always-include and exclude skipped; `rg` and Python fallback give the same list. |
| `tests/unit/memory/test_context_pack_v1.py` | Section order; toggle respected; research and memory budgets; cut marker; golden-file `TASK.md`; preview == written file. |
| `tests/unit/memory/test_context_pack_plan.py` | Pack for `build` and `fix` includes the latest plan (newest of two); pack for `research` and `plan` does not; no plan doc -> no section; plan over `CONTEXT_PLAN_MAX_CHARS` is cut with the marker and state `cut`; header comment removed; preview == written file. |
| `tests/unit/research/test_research_docs.py` | `agent_finding` and `note` items listed as kind `research` after pinned; link and snippet not listed; `docs/content` returns the body. |
| `tests/unit/research/test_finding_extract.py` | Marker pair, newest wins, fallback to summary, empty -> none, missing headings listed. |
| `tests/unit/research/test_link_title.py` | Title parse, size limit, timeout, non-HTML, bad scheme (local `http.server` thread, no internet). |
| `tests/unit/playbooks/test_format.py` | `+++` parse, no front matter, bad TOML, bad slug. |
| `tests/unit/playbooks/test_store.py` | Priority project > global > builtin; sync add / change / delete; ids stable across syncs. |
| `tests/unit/playbooks/test_render.py` | All variables; `(none)`; unknown kept + warning; `failing_checks` from a Proof Card row. |
| `tests/unit/playbooks/test_importer.py` | The 3 real files give 7, 5, 7 candidates; text kept word for word; slug clash suffix. |
| `tests/unit/core/test_research_run_stage.py` | Research runs never change the stage; refused in `shipped`, `archived`, `parked`. |
| `tests/integration/test_research_this.py` | Fake research run -> `agent_finding` with `run_id`, `research.added`; worktree clean. |
| `tests/integration/test_brief_draft.py` | Good JSON -> draft, no new version; bad JSON -> `raw_text`. |
| `tests/integration/test_memory_updates.py` | Temp repo + bare `origin`: ship -> drafts; approve 2 / reject 1 -> one commit with only approved text on the task branch; `main` untouched; works with the worktree removed; push to default branch refused. |
| `tests/api/test_memory_files_api.py` | Tree, read, write; `../` and symlink escape refused; 409 on hash mismatch. |
| `tests/api/test_playbooks_api.py` | CRUD; built-in 403; copy; render; import dry run writes nothing. |
| `desktop/src/screens/TaskPage/ResearchView.test.tsx` | Toggle calls PATCH; new item appears from a WebSocket event. |
| `desktop/src/screens/Done/LessonsLearnedCard.test.tsx` | Save all sends one `approve` per pending draft; Skip sends `reject` for all; Edit first sends the edited text; card hides when no drafts. |

## 13. Manual verification

1. Run the FSD QA checklist (section 9) on this repo (Saarthi dogfooding Saarthi).
2. `saarthi context <task> --show` on a real Saarthi task: check the picked memory files make sense.
3. One real "Just research" run with Claude and one with Codex: both give a finding with the 4 headings (if not, adjust `prompts/research.md`, re-record fixtures).
4. Ship one real client task and approve the memory updates; open the PR and see the memory commit.
5. Import the 3 real `quick-prompts.md` files.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Agents ignore the finding markers | Fallback to `runs.summary`; tune the prompt in manual step 3. |
| Keyword match picks noisy files (timeline, huge plans) | `exclude` list + hit cap; preview shows scores so I can tune. |
| Memory commit after the PR is merged never reaches main | Warning in the result; FSD open question 1. |
| Secrets in snippets go to the agent (known gap 2) | Accepted until M8 masking. |
| Depends on M4/M5 helper names | Section 3 lists assumed names; adjust at build time. |
| 21 h is tight | Cut order in FSD open question 6. |

## 15. What this milestone does not do

Embeddings, ADR suggestions (F12.4), attachments (F4.5), ticket import (F3.3, M10), team-shared playbooks, secret masking (M8), Side by side (M7), memory edits committed by Saarthi from Lessons and notes, a playbook template language with logic.

## 16. Effort breakdown

| Task | Hours |
|---|---|
| Migration, models, config, prompts folder | 1 |
| Research CLI + link title fetch | 2 |
| Research run stage rule + finding extraction + fixtures | 2 |
| Brief draft + versions (API, CLI) | 2 |
| Context Pack v1: keywords, match, builder, preview | 3 |
| Playbooks: format, store/sync, render, built-ins, API, CLI | 3 |
| Import of `quick-prompts.md` | 1 |
| Lessons and notes API + CLI | 1 |
| Memory updates: draft, decide, apply, push | 2.5 |
| Desktop: research view, goal history, What Claude reads, Lessons and notes, Saved instructions, Lessons learned card | 2.5 |
| Plan in Context Pack + research items in Docs list + tests | 1 |
| **Total** | **21** |

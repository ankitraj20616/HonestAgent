# Quick Reference
## Saarthi - Agentic Development Environment

**One-page summary.**

---

## AT A GLANCE

| | |
|---|---|
| **What** | Task-first desktop app to direct AI coding agents, with a built-in IDE-style file view |
| **For** | Me (Python dev using Claude + Codex daily, on many repos) |
| **Platform** | Linux, macOS and Windows. One codebase, native installers. |
| **Size** | Installer < 40 MB, open < 2 s, idle RAM < 150 MB window + < 150 MB daemon. No Electron. |
| **Backend** | Python 3.12 daemon (FastAPI, SQLite), shipped as a Tauri sidecar |
| **Frontend** | Tauri 2 + React + TypeScript |
| **Agents** | Claude Code CLI (default), Codex CLI, Gemini CLI (M7) |
| **v1 time** | about 20 weeks side-project time (M0-M10) |
| **UI spec** | `design/2026-10-23-simple-ui-design.md` + `design/Saarthi Prototype.html` |

---

## THE LOOP (what the user does)

```
New task -> edit goal, Start -> answer Claude -> (Let Claude fix it) -> Approve and create pull request
```

## STATUSES (UI) AND STAGES (engine)

| On screen | Engine stages |
|---|---|
| **Needs you** | `Needs You`, `Failed`, `Review`, Jira write-back or conflict waiting |
| **Working** | `Running`, `Verifying` |
| **To do** | `Inbox`, `Research`, `Ready` |
| **Done** | `Shipped` |

`Parked` and `Archived` are behind a filter. The engine stages and `ALLOWED_MOVES` do not change:

```
Inbox -> Research -> Ready -> Running -> Verifying -> Review -> Shipped
                                 |            |
                             Needs You      Failed
```

---

## UI WORDS (old -> new)

| Old | New |
|---|---|
| Command Deck | Home |
| Brief / Acceptance criteria | Goal / What done looks like |
| Run agent | Start |
| Task Room / Stream tab | Task page / Activity tab |
| Code tab, Code Peek | Files |
| Proof Card + Change Story | Check and ship |
| Trust score | Verdict: Looks good / Take a look / Has problems |
| Second Opinion | Ask Codex to review |
| Fix with agent | Let Claude fix it |
| Memory / Playbook | Lessons and notes / Saved instructions |
| Race Mode | Side by side |
| Context Pack | What Claude reads |

Full list: Simple UI spec, section 5.

---

## 8 THINGS THAT MAKE IT DIFFERENT

1. **Tasks first, files second** - Home is your work across every repo; Files is one screen.
2. **Many repos, one window** - project tabs + All projects, one "Needs you" count.
3. **Own copy of the repo per task** (git worktree) - parallel agents, zero clashes.
4. **What Claude reads** (Context Pack) - goal + research + core_docs given to the agent in one file.
5. **Check and ship** - checks run by themselves; a verdict, grouped changes, one button to the PR.
6. **Ask Codex to review** - one agent builds, another reviews.
7. **Side by side** - same goal to two agents, pick the better one.
8. **Lessons learned** - core_docs memory / learnings / timeline updated after every ship.

Also: a **Docs** view in every task (plans, changed .md files, pinned docs), and **Jira** tickets (M10): start a task from a ticket, move its status after my OK.

---

## PARTS

| Part | Job |
|---|---|
| `saarthid` | Python daemon (Tauri sidecar). Owns all logic, all projects and agent processes. |
| `saarthi` | CLI. Same power as the UI. |
| Desktop | Tauri window. Home, Board view, Task page, Files, Check and ship, Lessons and notes, Saved instructions. |
| Agent Adapters | Claude / Codex / Gemini / PTY behind one interface. |
| Workspace Manager | git worktrees, undo points, restore. |
| Check Runner | Runs tests / lint / build -> proof + verdict. |
| Review Builder | What changed (groups), risk tags, "why" notes per file. |
| Files | Tree, file content, diff vs main, "looked at" marks. |
| Memory | Reads / updates core_docs, builds the Context Pack. |
| Docs Finder | Lists plans, changed .md files, pinned docs of a task. |
| Ticket Provider | Jira Cloud tickets and write back (M10). |

---

## MILESTONES

| M0 Spike (3 OS) | M1 Core+CLI | M2 Agents+Worktrees | M3 UI + Files | M4 Checks |
|---|---|---|---|---|
| **M5 Check and ship** | **M6 Research+Memory** | **M7 Side by side + Gemini** | **M8 Safety+Undo (per OS)** | **M9 Installers v1.0 (3 OS)** |
| **M10 Jira tickets** (needs M1-M6) | | | | |

---

## KEY PATHS

Paths come from `platformdirs`, so they differ per OS. Linux examples:

- Global config: `~/.config/saarthi/config.toml`
- Data + DB + worktrees: `~/.local/share/saarthi/`
- macOS: both under `~/Library/Application Support/saarthi/`. Windows: both under `%LOCALAPPDATA%\saarthi\`. The exact folders are what `platformdirs` returns.
- Per project: `<repo>/.saarthi/project.toml`
- API: `http://127.0.0.1:7878/api/v1` (token)

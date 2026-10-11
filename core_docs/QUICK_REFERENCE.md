# Quick Reference
## Saarthi - Agentic Development Environment

**One-page summary.**

---

## AT A GLANCE

| | |
|---|---|
| **What** | Task-first desktop app to direct AI coding agents |
| **For** | Me (Python dev using Claude + Codex daily) |
| **Platform** | Linux (Ubuntu first) |
| **Backend** | Python 3.12 daemon (FastAPI, SQLite) |
| **Frontend** | Tauri 2 + React + TypeScript |
| **Agents** | Claude Code CLI, Codex CLI |
| **v1 time** | ~17 weeks side-project time (M0-M10) |

---

## THE LOOP

```
Capture -> Research -> Brief -> Run agent -> Verify -> Review -> Ship -> Remember
```

## TASK STAGES

```
Inbox -> Research -> Ready -> Running -> Verifying -> Review -> Shipped
                                 |            |
                             Needs You      Failed
```

---

## 8 THINGS THAT MAKE IT DIFFERENT

1. **Task Board, not file tree** - home screen is your work, not your files.
2. **Worktree per task** - parallel agents, zero clashes.
3. **Context Pack** - brief + research + core_docs given to the agent in one file.
4. **Proof Card** - checks run by themselves; no proof, no review.
5. **Change Story** - diff grouped by "why", with risk flags.
6. **Second Opinion** - Claude builds, Codex reviews (or the other way round).
7. **Race Mode** - same brief to both agents, pick the winner.
8. **Self-updating memory** - core_docs memory / learnings / timeline updated after every ship.

Also: a **Docs tab** in every Task Room (plans, changed .md files, pinned docs), and **Jira** tickets (M10): start a task from a ticket, move its status after my OK.

---

## PARTS

| Part | Job |
|---|---|
| `saarthid` | Python daemon. Owns all logic and agent processes. |
| `saarthi` | CLI. Same power as the UI. |
| Desktop | Tauri window. Board, Task Room, Memory, Playbooks. |
| Agent Adapters | Claude / Codex / PTY behind one interface. |
| Workspace Manager | git worktrees, checkpoints, rewind. |
| Check Runner | Runs tests / lint / build -> Proof Card. |
| Review Builder | Change Story + risk flags. |
| Memory | Reads / updates core_docs, builds Context Pack. |
| Docs Finder | Lists plans, changed .md files, pinned docs of a task. |
| Ticket Provider | Jira Cloud tickets and write back (M10). |

---

## MILESTONES

| M0 Spike | M1 Core+CLI | M2 Agents+Worktrees | M3 UI | M4 Proof |
|---|---|---|---|---|
| **M5 Review+Ship** | **M6 Research+Memory** | **M7 Race** | **M8 Safety+Rewind** | **M9 Package v1.0** |
| **M10 Jira tickets** (needs M1-M6) | | | | |

---

## KEY PATHS

- Global config: `~/.config/saarthi/config.toml`
- Data + DB + worktrees: `~/.local/share/saarthi/`
- Per project: `<repo>/.saarthi/project.toml`
- API: `http://127.0.0.1:7878/api/v1` (token)

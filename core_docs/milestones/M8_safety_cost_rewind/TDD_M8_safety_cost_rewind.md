# TDD — M8: Safety + Cost + Rewind

**Document type:** Technical Design Document (TDD)
**Milestone:** M8 of M0-M9 (see `../../MILESTONES.md`)
**Product:** Saarthi - Agentic Development Environment (Linux, macOS, Windows)
**Status:** Draft — awaiting review
**Version:** 0.2
**Date:** 2026-10-11
**Updated:** 2026-10-23 - Simple UI design (`../../design/2026-10-23-simple-ui-design.md`), new screen names, sandbox per OS (Decisions 14-15), no Full access on Windows
**Estimated effort:** 15 hours planned; breakdown in section 16 says ~21.5 h
**Written for:** Developers and coding agents (Claude, Codex) building it
**Language style:** Simple English. Short sentences. Every decision says *why*.
**Related documents:** `FSD_M8_safety_cost_rewind.md`, `../../TDD-tech-design-doc.md` (4.5, 4.9, 4.10, 5, 6, 15), `../../TECH_STACK.md`, `../M2_agent_runs_worktrees/TDD_M2_agent_runs_worktrees.md`, `../M7_race_mode/TDD_M7_race_mode.md`, `../M9_polish_package/TDD_M9_polish_package.md`
**Screens:** prototype views `safety`, `fullAccess`, `safetyAsk`, `budgetWarn`, `history`, `restoreConfirm` in `core_docs/design/Saarthi Prototype.html#<id>` (full list in `core_docs/design/README.md`).

---

## 1. The goal in one sentence

Turn the permission profile into real, honest limits (agent flags + an OS sandbox: `bwrap` on Linux, `sandbox-exec` on macOS, none on Windows so no `full` there), mask secrets in one place before anything is stored or sent, add a cost meter with a budget alert, and let the user rewind a workspace to any checkpoint without losing work.

UI words (Simple UI spec, section 5): profile = "What agents may do" (Read only / Safe / Full access); cost and budget = "Safety and cost"; checkpoint = "Undo point" under More → History; rewind = "Restore". Engine, API and CLI names stay as they are.

---

## 2. Read this first — rules this work must not break

1. **All logic in the daemon** (CLAUDE.md rule 1). The "What agents may do" picker, the Safety and cost page and the History list only call the API. Which profiles this OS offers is decided by the daemon (Decision 14), never by the UI.
2. **CLI first** (rule 2). Every feature here has a `saarthi` command before its screen.
3. **No agent-specific code outside `agents/`** (rule 3). Safety Guard builds an agent-neutral policy. Each adapter turns it into its own flags and declares the folders it needs in the sandbox.
4. **Every action is an event** (rule 4). Profile change, safety hits, budget alerts and rewinds are events. Masking never drops an event; it only changes text.
5. **Git through subprocess with a list of args** (rule 6). Rewind uses plumbing commands only. Rewind never moves a branch.
6. **No hard-coded values** (rule 7). Bind lists, secret paths, patterns, prices and budgets live in `config.py` / `project.toml`.
7. **Tests never call real agents** (rule 8). The sandbox is proven with plain commands and FakeAdapter.

---

## 3. What already exists (do not rebuild)

| Thing | Where | Built in |
|---|---|---|
| `tasks.permission_profile` column (always `safe_build`) | `db/models.py` | M1 |
| Mode-to-flags map for `safe_build` (`CLAUDE_SAFE_BUILD_TOOLS`, M2 Decision 10) | config data read by `agents/claude.py`, `agents/codex.py` | M2 |
| Checkpoints: temp index -> `commit-tree` -> `refs/saarthi/checkpoints/<task-id>/<n>`, "no change, no new ref"; `runs.checkpoint_ref`; `workspace.checkpoint` event | `workspace/manager.py` (M2 Decision 13) | M2 |
| `runs.cost_usd`, `tokens_in`, `tokens_out`; `agent.cost` event; `tasks.total_cost_usd` | `core/runs.py` | M2 |
| `agent.needs_input` (path A live, path B on exit incl. `permission_denials`) + resume with `RunRequest.extra_allowed_tools` | `agents/*`, `core/runs.py` | M2 |
| Fake agent binaries `tests/fixtures/bin/fake_claude.py`, `fake_codex.py` (via `CLAUDE_BIN` / `CODEX_BIN`) | `daemon/tests/fixtures/bin/` | M2 |
| Loser snapshots `refs/saarthi/race/<task-id>/<lane>` | `workspace/` | M7 |
| Event Bus: publish -> SQLite + JSONL + WebSocket | `core/events.py` | M1 |
| Notifier (Tauri notification plugin, all 3 OSes) | `core/notify.py` | M2 / M3 |
| Simple cost totals per task in More → Details | `desktop/src/screens/TaskPage/` | M3 |
| Data and config folders from `platformdirs` (per OS) | `config.py` | M2 |
| `/settings`, Health page | `api/settings.py`, `api/health.py` | M3 |
| Read-only runs for `research` / `review` | `core/runs.py` | M5 / M6 |

---

## 4. Technical decisions

### Decision 1 — Safety Guard makes a neutral `PermissionPolicy`; adapters make the flags (new)
Core TDD 4.9 says the Safety Guard "turns a profile into agent flags". Doing that literally puts Claude and Codex flags in `safety/`, which breaks rule 3. So:
- `safety/policy.py` builds `PermissionPolicy(profile, deny: list[Rule], ask: list[Rule], sandbox: SandboxSpec | None)`.
- `AgentAdapter` gets one new method: `permission_args(policy) -> list[str]`, and one new attribute: `sandbox_needs: SandboxNeeds` (folders and env names the agent needs). Both live in `agents/`.
- M2 Decision 10 suggested `safety.flags_for(profile, mode)`. That function would hold Claude and Codex flags inside `safety/`, so M8 does it the other way round: `safety` returns the policy, each adapter maps it. M2's `CLAUDE_SAFE_BUILD_TOOLS` stays as the `safe_build` allowed list.

**Why:** keeps rule 3, and a third agent later only touches `agents/`.

### Decision 2 — Profile to flags table
Flags were checked with `--help` on 2026-10-11 (CLI 2.1.x / codex 0.152.x). Re-check on day 1; CLI flags change often (TECH_STACK 3.3).

| Profile | Claude (`agents/claude.py`) | Codex (`agents/codex.py`) | OS sandbox (Decision 14) |
|---|---|---|---|
| `read_only` | `--permission-mode plan` + `--allowedTools Read Grep Glob` + `--settings <policy.json>` | `--sandbox read-only` | worktree **ro** |
| `safe_build` | `--permission-mode acceptEdits` + M2 allowed list + `--settings <policy.json>` (deny + ask) | `--sandbox workspace-write` (network off for commands, Codex default) | worktree rw |
| `full` | `--dangerously-skip-permissions` + `--settings <policy.json>` (deny only) | `--sandbox workspace-write -c approval_policy="never" -c sandbox_workspace_write.network_access=true`; fallback in Decision 4 | **required** (so never on Windows in v1) |

`<policy.json>` is written by the adapter to `<worktree>/.saarthi/context/claude-settings.json` (git-ignored, next to `TASK.md`) as `{"permissions": {"deny": [...], "ask": [...]}}`. Claude rule syntax: `Bash(git push:*)`, `Read(~/.ssh/**)`.

**Why `full` keeps Codex `workspace-write`:** core TDD 4.9 says so. Network is turned on because "full" must be able to run `uv sync` / `npm install`.

### Decision 3 — What "blocked" and "always ask" really mean per agent (new)
Be honest. Three levels:
- **Enforced by the kernel (bwrap on Linux, sandbox-exec on macOS):** secret folders, writes outside the worktree, git credentials. Works for every agent. On Windows this level does not exist in v1.
- **Enforced by the agent (pattern level):** Claude `deny` / `ask` rules; Codex `--sandbox` mode. Can be dodged by wrapped commands (`sh -c "..."`, `python -c`).
- **Soft:** written into the Context Pack ("Never run: ...; if you need to, stop and explain") + seen in the stream after the fact.

"Always ask" for Claude: the `ask` rule makes Claude raise a permission request; M2 maps it to `agent.needs_input`. In `-p` mode Claude usually denies instead of waiting. M2 already handles that as path B: the run ends with `permission_denials`, the task goes to `Needs You`, and the answer resumes the session with the denied tool in `RunRequest.extra_allowed_tools`. M8 only adds: each denial that matches an `ask` rule also makes `safety.alert{outcome:"denied"}`, and the Needs-you card on the task page (`safetyAsk`) says "Claude wants to run a command: X" with **Allow once** / **Deny**. A denial that matches a `deny` rule gets no "Allow once" button.

"Always ask" for Codex: soft only, because `codex exec` cannot pause mid-run (core TDD 16 Q2).

Watcher: `safety/watch.py` subscribes to `agent.tool_call` events. If a command matches a deny or ask rule, it publishes `safety.alert{outcome:"seen"}` and notifies. It cannot stop the command; it is an alarm.

**Why:** a list that looks enforced but is not is worse than no list. `saarthi safety show` prints the level per rule.

### Decision 4 — Codex inside the OS sandbox (new, verify on day 1)
Codex runs its own sandbox (Landlock on Linux, Seatbelt on macOS). Nested sandboxing inside bwrap or `sandbox-exec` may fail. Day-1 spike (1 h): run `codex exec --sandbox workspace-write "touch x"` inside our wrapper, on Linux and on macOS.
- Works -> keep Decision 2.
- Fails -> inside our sandbox, Codex uses `--dangerously-bypass-approvals-and-sandbox` (its help text says it is "intended solely for running in environments that are externally sandboxed"). Our sandbox is that outer box. For `read_only`, the worktree is read-only inside it, so the guarantee holds.
- On Windows there is no outer box, so this fallback is never used there.
Record the result in `core_docs/decisions/ADR-00x-sandbox.md`.

### Decision 5 — The bwrap bind list (Linux): hide all of `$HOME`, add back a short list (new)
Two ways exist: (a) show everything and hide known secret folders, (b) hide everything and show known good folders. We pick **(b)**. With (a), any secret folder we forget (a new cloud CLI, another client's repo) leaks. With (b), forgetting a folder breaks a tool loudly, which is safe.

Built by `safety/sandbox.py::build_bwrap_args(spec)`. Order matters (later mounts cover earlier ones):

```text
bwrap
  --die-with-parent --unshare-pid --unshare-ipc --unshare-uts --unshare-cgroup-try
  --ro-bind / /                            # system: /usr /etc /opt read-only
  --dev /dev  --proc /proc  --tmpfs /tmp
  --tmpfs /run/user/$UID                   # hides ssh-agent, gnome-keyring, D-Bus sockets
  --tmpfs $HOME                            # hides ~/.ssh ~/.aws ~/.gnupg ~/.config/gh, saarthi token + DB, other repos
  --ro-bind-try $HOME/<p> $HOME/<p>        # each p in SANDBOX_HOME_RO + project [safety].extra_ro
  --bind-try    $HOME/<p> $HOME/<p>        # each p in adapter.sandbox_needs.rw (claude: .claude, .claude.json; codex: .codex)
  --ro-bind-try $HOME/<p> $HOME/<p>        # each p in adapter.sandbox_needs.ro (claude: .local/share/claude)
  --bind $SANDBOX_CACHE_DIR $HOME/.cache   # shared non-secret cache (uv, pip, npm)
  --bind <repo>/.git <repo>/.git           # worktree git metadata lives here
  --ro-bind <repo>/.git/hooks  <repo>/.git/hooks    # no hook planting (runs later outside the box)
  --ro-bind <repo>/.git/config <repo>/.git/config   # no core.hooksPath / core.fsmonitor tricks
  --bind <worktree> <worktree>             # --ro-bind for read_only
  --chdir <worktree>
  --clearenv --setenv <name> <value> ...   # SANDBOX_ENV_ALLOW + adapter.sandbox_needs.env
  -- <agent argv>
```

Defaults in `config.py`:
- `SANDBOX_HOME_RO = [".local/bin", ".local/share/uv", ".nvm", ".cargo/bin", ".rustup", ".pyenv", ".gitconfig", ".config/git"]`
- `SANDBOX_SECRET_PATHS = [".ssh", ".aws", ".gnupg", ".config/gh", ".git-credentials", ".netrc", ".docker", ".kube", ".config/gcloud", ".azure", ".password-store", ".local/share/keyrings", ".config/saarthi", ".local/share/saarthi", "Library/Keychains", "Library/Application Support/saarthi"]`, plus the Saarthi config and data folders that `platformdirs` returns on this OS — used by a test that proves no bind (or macOS allow rule) exposes them, and by `saarthi safety show`.
- `SANDBOX_ENV_ALLOW = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TERM", "COLORTERM", "TZ", "XDG_CACHE_HOME", "TMPDIR"]`
- `SANDBOX_CACHE_DIR = <data dir>/sandbox-cache` (data dir from `platformdirs`)

Notes:
- The real directory of the resolved agent binary (after following symlinks) is always added read-only. So `~/.local/bin/claude -> ~/.local/share/claude/versions/...` works, and so do the M2 fake binaries in tests.
- **Writable inside:** worktree, `<repo>/.git` (minus hooks/config), agent state folders, the cache, and throwaway tmpfs (`/tmp`, `$HOME`). Writes to tmpfs vanish when the run ends. This is "only the worktree is writable" in practice; the agent state folders are the honest exception.
- **Network is shared** (no `--unshare-net`). Agents need their provider API.
- `--die-with-parent`: if the daemon dies, the agent dies. Matches core TDD 8.6 ("interrupted + resume") and M9's background-service choice (`KillMode=mixed` on Linux).
- `<repo>/.git` rw is a known hole: the agent could change refs of other branches. Risk 3.
- The project's own `.git` worktree layout must be read from `git rev-parse --git-common-dir`, not guessed.

### Decision 6 — Sandbox mode setting and the "works here" check
`safety.sandbox = "always" | "full_only"` (default `always`). `full` always needs it. `safety/sandbox.py::probe()` runs once at start and caches the result (also shown in `/health`):
- Linux: `bwrap --ro-bind / / --tmpfs $HOME true`. Ubuntu 24.04 may block user namespaces through AppArmor; the probe catches it and returns the fix hint (M9 user guide has the AppArmor profile).
- macOS: `sandbox-exec -p <tiny profile> /usr/bin/true`, then a read of a fake secret file that must fail.
- Windows: no probe; the result is `ok = false, reason = "no_os_sandbox"`.
**Why probe and not `which bwrap`:** bwrap can be installed and still blocked.

### Decision 7 — Secret masking lives in the Event Bus, once
`safety/secrets.py::SecretMasker`:
- Sources: `.env` values from repo root and worktree (`SECRET_ENV_GLOBS = [".env", ".env.*"]`, minus `SECRET_ENV_EXCLUDE = [".env.example", ".env.sample", ".env.template"]`); regex list `SECRET_PATTERNS`; daemon env vars whose names match `SECRET_ENV_NAME_PATTERNS = ["*_KEY", "*_TOKEN", "*_SECRET", "*PASSWORD*", "*_PAT"]`.
- Values shorter than `SECRET_MIN_LEN = 8` are ignored.
- Literal values are matched with one compiled regex (longest first). Replacement: `SECRET_MASK = "****"`.
- Cache per project, keyed by `.env` file mtimes; rebuilt when they change.
- `core/events.py::publish()` calls `masker.mask_event(event)` **before** the fan-out to SQLite, JSONL and WebSocket. It walks the payload recursively (strings only). So "before save and before send" is one call.
- Same masker used by the Check Runner for `output_tail` and the check log file, and by `runs.summary`.
- `terminal.output` (raw bytes): decode as UTF-8 with `errors="replace"` only for matching, mask, re-encode. A secret split across two chunks can slip by; we keep the last `TERMINAL_MASK_CARRY = 256` bytes of each chunk to match against the next one. Known gap, see Risk 5.

**Why one place:** three sinks, one call; a new sink cannot forget it.

`saarthi safety scrub` (new): re-masks old rows in `events`, `check_results.output_tail`, `runs.summary`, and rewrites JSONL / check log files (write to `.tmp`, then rename). Closes known gap 2.

### Decision 8 — Cost: reported wins, estimate otherwise (new)
- If the agent reports cost (`agent.cost.payload.cost_usd`), use it.
- Else estimate from tokens with `AGENT_TOKEN_PRICES_USD_PER_MTOK = {"codex": {"in": .., "out": ..}, "claude": {...}}` and set `runs.cost_estimated = true`. Empty table -> no estimate (cost stays null).
- Day totals use the local timezone (`COST_DAY_TZ = "local"`), grouped by `runs.started_at`.
- Totals are SQL `SUM` queries, not stored counters (only `tasks.total_cost_usd` from M2 stays, for the board card).

### Decision 9 — Budgets in settings, not a new table (new)
Ownership map says "budget settings (decided in M8 TDD)". Global: `settings` row `budget` = `{"task_usd": 3.0, "day_usd": 10.0}` (defaults from `config.py`, `null` = off). Project override: `.saarthi/project.toml` `[budget] task_usd = 5.0`. Alert de-duplication: before publishing `cost.budget_exceeded`, check for an existing event with the same `scope` + `key` + `limit_usd`. Raising the limit makes a new key, so it can alert again. No extra column.
**Why:** budgets are two numbers. A table is overkill.

### Decision 10 — Checkpoints table as an index; refs stay the truth (new)
Git refs `refs/saarthi/checkpoints/<task-id>/<n>` stay the source of truth (M2). A new `checkpoints` table stores what refs cannot: label, kind, run id, file stats. `workspace/manager.py::sync_checkpoints_from_refs(task)` rebuilds missing rows from `git for-each-ref` (for checkpoints made before M8, or if the DB is restored). Stats come from `git diff --numstat <prev> <this>`.

### Decision 11 — Rewind with a temp index and a two-tree `read-tree` (new detail)
Core TDD 4.5: "checkpoint current state first, then restore". Method (tested by hand on 2026-10-11, git 2.43):
1. Refuse unless the stage is `Ready`, `Failed`, `Review` or `Parked` and no run / check is active.
2. If the target's parent commit is not an ancestor of the current `HEAD` (`git merge-base --is-ancestor <parent> HEAD` fails: history was rewritten, for example by a rebase in "Update from main", M5), refuse with 409 `base_changed` unless the caller sends `confirm_base_change: true`. Rewinding then also brings back older versions of files that came from the base.
3. `pre = checkpoint(task, kind="pre_rewind", label="before restore to #n")`. M2's checkpoint fills a temp index `T` with `git add -A`; M8 makes it return `T` instead of deleting it. If the tree equals the latest checkpoint's tree, M2 already reuses that checkpoint (no duplicate).
4. `GIT_INDEX_FILE=T git read-tree -m -u <pre> <target>` — moves the worktree from `pre` to `target`: writes changed files, deletes files that are in `pre` but not in `target` (including files that were untracked), leaves git-ignored files alone.
5. `git reset -q` — real index = HEAD, so `git status` shows the true picture. Nothing is lost: content is in the worktree and in `pre`.
6. Delete `T`. Publish `workspace.rewound`. If stage was `Review`, move to `Ready` with reason `rewound` (existing Review -> Ready row in `ALLOWED_MOVES`; no new move).
**Why not `git checkout <cp> -- .`:** it does not delete files added after the checkpoint. **Why not `git clean`:** it deletes from the real worktree without a matching tree; `read-tree -m -u` deletes only what `pre` holds, so it is safe by construction. HEAD and the branch never move.

### Decision 12 — Race lanes in the checkpoints list (answers M7 FSD "M8 decides") (new)
The list shows every `refs/saarthi/checkpoints/<task-id>/<n>` row, including run-end checkpoints from both race lanes, labelled with agent and lane (`end of run 01JB… (codex, race lane)`). Rewinding to a loser-lane checkpoint is allowed: it is how I adopt the loser's work later; the pre-rewind checkpoint keeps the winner's state. M7's loser snapshot refs (`refs/saarthi/race/...`) are not listed (they hold the same files as that lane's last run-end checkpoint).
**Why:** one list, one rule, no special case; both lanes start from the same commit, so Decision 11 step 2 passes.

### Decision 13 — Two new event groups: `safety.*` and `cost.*` (new)
The ownership map gives M8 only `workspace.rewound`. Rule 4 needs events for safety hits and budget alerts, and they fit no existing group. M8 adds `safety.alert` and `cost.budget_exceeded`. Flagged for the owner to add to core TDD 6.2.

### Decision 14 — Sandbox per OS: one table, two pure functions (new)
The daemon picks the sandbox from the OS. One table in `config.py`:

```python
SANDBOX_BY_OS = {"linux": "bwrap", "darwin": "sandbox_exec", "win32": None}
```

`safety/sandbox.py`:
- `sandbox_kind(os_name: str) -> SandboxKind | None` — reads the table (`os_name` = `sys.platform`; unknown OS -> `None`).
- `offered_profiles(kind, probe_ok) -> list[Profile]` — `read_only` and `safe_build` always; `full` only when `kind is not None and probe_ok`.
- `wrap(argv, spec)` calls `build_bwrap_args()` (Decision 5) or `build_sbpl_profile()` (Decision 15) by kind. With no kind, it returns `argv` unchanged and the run is `sandboxed = false`.

`PATCH /tasks/{id}` with `full` checks `offered_profiles()` and returns 409 `sandbox_unavailable` with `reason` (`no_os_sandbox` on Windows, `probe_failed` elsewhere) and `hint`. `/safety/check` returns `offered_profiles`, so the UI lists only those and shows one line on Windows: "Full access needs a safe box. Windows does not have one yet."
**Why:** both functions are pure, so one unit test covers every OS on any CI runner. The UI never checks the OS itself (rule 1). Windows has no small built-in tool that hides folders from one process; a real Windows sandbox (AppContainer or similar) is Later.

### Decision 15 — macOS: a `sandbox-exec` profile with "deny by default" (new, verify on day 1)
`safety/sandbox.py::build_sbpl_profile(spec) -> str` writes a Seatbelt profile to `<worktree>/.saarthi/context/sandbox.sb` (git-ignored) and runs `sandbox-exec -f <file> -- <agent argv>` with a cleared environment (`env -i` + `SANDBOX_ENV_ALLOW` + `adapter.sandbox_needs.env`). Same idea as Decision 5 (b): deny everything, allow back a short list.

```text
(version 1)
(deny default)
(allow process-exec process-fork signal sysctl-read mach-lookup ipc-posix-shm)
(allow network*)                                   ; agents need their provider
(allow file-read* (subpath "/usr") (subpath "/bin") (subpath "/System") (subpath "/Library")
                  (subpath "/opt/homebrew") (subpath "/private/etc") (subpath "/dev"))
(allow file-read* (subpath "$HOME/<p>"))           ; each p in SANDBOX_HOME_RO + adapter.sandbox_needs.ro + [safety].extra_ro
(allow file-read* file-write* (subpath "$HOME/<p>"))  ; adapter.sandbox_needs.rw
(allow file-read* file-write* (subpath "<cache>") (subpath "<worktree>") (subpath "<repo>/.git") (subpath "/private/tmp"))
(deny file-write* (subpath "<repo>/.git/hooks") (literal "<repo>/.git/config"))
```

For `read_only`, the worktree line is `file-read*` only. The real folder of the agent binary is added read-only (same rule as Decision 5). Secret folders are never in an allow line, so they cannot be read. Writes to `~` fail instead of going to a throwaway copy (macOS has no tmpfs here).
**Why:** `sandbox-exec` ships with macOS, needs no install, and Claude Code and Codex use the same Seatbelt system. The exact rule list (which `mach-lookup` names the agents need) is checked in the day-1 spike and frozen in golden files. Apple marks `sandbox-exec` as deprecated (Risk 8).

---

## 5. Modules and files

| File | Change |
|---|---|
| `daemon/src/saarthi/safety/policy.py` | **New.** `Profile` enum, `Rule`, `PermissionPolicy`, `build_policy(task, mode, project_cfg)`; forces `read_only` for `research` / `review` modes. |
| `daemon/src/saarthi/safety/sandbox.py` | **New.** `SandboxSpec`, `sandbox_kind()`, `offered_profiles()`, `build_bwrap_args()`, `build_sbpl_profile()`, `wrap(argv, spec)`, `probe()` (Decisions 5, 6, 14, 15). |
| `daemon/src/saarthi/safety/secrets.py` | **New.** `SecretMasker`, `masker_for(project)`, `scrub()`. |
| `daemon/src/saarthi/safety/watch.py` | **New.** Bus subscriber: tool calls vs rules -> `safety.alert`. |
| `daemon/src/saarthi/agents/base.py` | Add `permission_args(policy)`, `sandbox_needs`, `SandboxNeeds` dataclass. |
| `daemon/src/saarthi/agents/claude.py` | Flags per profile, writes `claude-settings.json`, `sandbox_needs` (`.claude`, `.claude.json` rw; `.local/share/claude` ro; env `ANTHROPIC_*`, `CLAUDE_*`), maps permission denials. |
| `daemon/src/saarthi/agents/codex.py` | Flags per profile, Decision 4 fallback, `sandbox_needs` (`.codex` rw; env `OPENAI_API_KEY`, `CODEX_HOME`). |
| `daemon/tests/fixtures/bin/fake_claude.py`, `fake_codex.py` | Add one fixture line kind: `{"_exec": ["cat", "~/.ssh/id_ed25519"]}` runs the command (with `~` expanded) and prints its exit code and output as a tool-result line in that agent's format. Stdlib only, so it runs inside the sandbox. |
| `daemon/src/saarthi/core/runs.py` | Build policy, ask adapter for args, wrap with the OS sandbox, refuse `full` without sandbox, store `permission_profile` / `sandboxed` on the run, call budget check after `agent.cost` and `run.finished`. |
| `daemon/src/saarthi/core/events.py` | Call `SecretMasker` in `publish()` before fan-out. |
| `daemon/src/saarthi/core/cost.py` | **New.** `totals(scope, ...)`, `estimate(run)`, `check_budget(task)`. |
| `daemon/src/saarthi/core/tasks.py` | `set_profile(task, profile, confirm)`. |
| `daemon/src/saarthi/workspace/manager.py` | `checkpoint()` inserts a `checkpoints` row and can return its temp index; `sync_checkpoints_from_refs()`; `rewind()`. |
| `daemon/src/saarthi/checks/runner.py` | Mask `output_tail` and log file. |
| `daemon/src/saarthi/memory/context_pack.py` | Add "Safety rules" section (soft rules) to `TASK.md`. |
| `daemon/src/saarthi/api/safety.py` | **New.** `/tasks/{id}/safety`, `/safety/check`, `/safety/scrub`. |
| `daemon/src/saarthi/api/cost.py` | **New.** `/cost`. |
| `daemon/src/saarthi/api/checkpoints.py` | **New.** List + rewind. |
| `daemon/src/saarthi/api/tasks.py`, `api/health.py` | `permission_profile` in PATCH; `sandbox` block in health. |
| `daemon/src/saarthi/cli/safety.py`, `cli/cost.py`, `cli/checkpoint.py`, `cli/task.py` | CLI in section 8. |
| `daemon/src/saarthi/config.py` | Constants in section 10. |
| `daemon/src/saarthi/db/models.py` + migration | Section 6. |
| `desktop/src/screens/TaskPage/Details/AgentAccessPicker.tsx` | **New.** "What agents may do" picker (lists only `offered_profiles`) + "in a safe box" badge. |
| `desktop/src/screens/TaskPage/FullAccessConfirm.tsx` | **New.** `fullAccess` confirm (type the task id). |
| `desktop/src/screens/TaskPage/More/History.tsx` | **New.** Undo point rows + **Restore** + `restoreConfirm`. |
| `desktop/src/screens/TaskPage/cards/SafetyAskCard.tsx`, `BudgetWarnCard.tsx` | **New.** `safetyAsk` (Allow once / Deny) and red `safety.alert` card; `budgetWarn` card. |
| `desktop/src/screens/Settings/SafetyAndCost.tsx` | **New.** `safety` page: default profile, blocked / ask lists, sandbox mode, budgets (via `/settings`), today's total, today by task, last 7 days (via `/cost`). |

---

## 6. Data model changes

Migration: `daemon/src/saarthi/db/migrations/versions/<NNNN>_m8_checkpoints_and_run_safety.py` (next free number after M7's; M1 is `0001_m1_core_tables`).

**New table `checkpoints`**

| Field | Type | Note |
|---|---|---|
| id | text | ULID |
| task_id | text | FK `tasks.id` |
| n | int | same `n` as the ref; unique with `task_id` |
| ref | text | `refs/saarthi/checkpoints/<task-id>/<n>` |
| commit_sha | text | |
| kind | text | `run_end` / `pre_rewind` |
| run_id | text | nullable |
| label | text | |
| files_added, files_changed, files_deleted | int | vs previous checkpoint |
| created_at | datetime | |

**New columns on `runs`**

| Field | Type | Note |
|---|---|---|
| permission_profile | text | profile actually used (task profile may change later) |
| sandboxed | bool | default false |
| cost_estimated | bool | default false |

No change to `tasks` (the `permission_profile` column exists since M1). Budgets go in `settings` (Decision 9).

---

## 7. Events added

| Type | Payload |
|---|---|
| `workspace.rewound` | `{from_n: 5, to_n: 2, pre_rewind_n: 5, files_written: 4, files_deleted: 1, stage_moved_to: "ready" \| null}` |
| `safety.alert` **(new group)** | `{rule: "Bash(git push:*)", list: "deny" \| "ask", command: "git push origin main", agent: "codex", outcome: "denied" \| "seen", enforced_by: "claude" \| "codex" \| "bwrap" \| "none"}` |
| `cost.budget_exceeded` **(new group)** | `{scope: "task" \| "day", key: "T-0042" \| "2026-10-11", total_usd: 3.40, limit_usd: 3.00}` |

Changed payloads (no new type): `task.updated` gets `{field: "permission_profile", old, new}`; `workspace.checkpoint` gets `kind`; `run.started` gets `permission_profile`, `sandboxed`.

---

## 8. API and CLI added

### 8.1 API (under `/api/v1`)

| Method | Path | Body | Response |
|---|---|---|---|
| PATCH | `/tasks/{id}` | `{permission_profile: "full", confirm: "T-0042"}` | task; 400 if `full` without matching `confirm`; 409 `sandbox_unavailable` with `reason` (`no_os_sandbox` / `probe_failed`) and `hint` (M1 error shape) |
| GET | `/tasks/{id}/safety` | — | `{profile, sandbox: {on, kind, reason, binds: [...]}, deny: [...], ask: [...], enforcement: {claude: {...}, codex: {...}}}` **(new endpoint)** |
| GET | `/safety/check` | — | `{os, kind: "bwrap" \| "sandbox_exec" \| null, path, version, userns_ok, probe_ok, offered_profiles: [...], hint}` **(new endpoint)** |
| POST | `/safety/scrub` | `{dry_run: bool}` | `{events, run_logs, check_logs, masked}` **(new endpoint)** |
| GET | `/cost` | query `from`, `to`, `project_id?`, `task_id?`, `group_by=day\|task\|agent` | `{rows: [{key, runs, cost_usd, estimated}], budget: {...}}` **(new endpoint)** |
| GET | `/tasks/{id}/checkpoints` | — | `[{n, created_at, kind, label, run_id, files_added, files_changed, files_deleted}]` |
| POST | `/tasks/{id}/checkpoints/{n}/rewind` | `{confirm_base_change?: bool}` | `{pre_rewind_n, to_n, stage}`; 409 `run_active` / `wrong_stage` / `base_changed`; 404 unknown n |

`GET /health` gets a `sandbox` block (same shape as `/safety/check`). Lists and budgets use the existing `GET/PUT /settings`.

### 8.2 CLI

| Command | Output |
|---|---|
| `saarthi task profile <task> [read-only\|safe-build\|full] [--yes]` | old -> new; `full` asks to type the task id unless `--yes` |
| `saarthi safety show <task> [--json]` | profile, sandbox, binds, rules with enforcement level |
| `saarthi safety check [--json]` | OS, sandbox kind, path, version, probe result, offered profiles, fix hint; exit 1 if not ok (Windows: exit 0 with "none (v1)", since nothing is broken) |
| `saarthi safety scrub [--dry-run]` | counts |
| `saarthi cost [--task T] [--project P] [--days 7] [--by day\|task\|agent] [--json]` | table, `~` for estimates, budget column |
| `saarthi checkpoint list <task> [--json]` | table |
| `saarthi checkpoint rewind <task> <n> [--yes]` (asks again if `base_changed`) | "Saved current state as #k ... Workspace now matches #n" |
| `saarthi run <task> ...` | existing; now prints `profile: full · sandboxed` on start |

---

## 9. Key flows

### 9.1 Start a run (changes to core TDD 8.1 step 6)
1. `policy = build_policy(task, mode, project_cfg)`.
2. `if policy.profile == full and full not in offered_profiles(sandbox_kind(sys.platform), probe().ok): raise SandboxUnavailable` -> `run.failed` with fix hint.
3. `argv = adapter.build_command(req) + adapter.permission_args(policy)` (adapter-internal).
4. If sandbox on and a kind exists: `argv = sandbox.wrap(argv, SandboxSpec(kind, worktree, repo_git_dir, ro=profile==read_only, needs=adapter.sandbox_needs, project_extra=...))`.
5. Spawn as before. Save `runs.permission_profile`, `runs.sandboxed`. `run.started` carries both.

### 9.2 Event publish
`publish(evt)` -> `evt = masker_for(evt.project).mask_event(evt)` -> SQLite -> JSONL -> WebSocket. `safety/watch.py` and `core/cost.py` are subscribers and see the masked event.

### 9.3 Budget check
On `agent.cost` and `run.finished`: compute task total and today's total; for each scope over its limit and not yet alerted for (key, limit) -> publish `cost.budget_exceeded` -> Notifier.

### 9.4 Rewind
See Decision 11. Runs under the per-task workspace lock (M2's, or a new per-task `asyncio.Lock` in `workspace/manager.py` if M2 has none), so a run cannot start in between.

---

## 10. Config added

`config.py`:

| Constant | Default |
|---|---|
| `DEFAULT_PERMISSION_PROFILE` | `"safe_build"` (validation refuses `"full"`) |
| `SANDBOX_MODE` | `"always"` |
| `SANDBOX_BY_OS` | `{"linux": "bwrap", "darwin": "sandbox_exec", "win32": None}` (Decision 14) |
| `SANDBOX_EXEC_PATH` | `"/usr/bin/sandbox-exec"` (Decision 15) |
| `SANDBOX_MACOS_READ_PATHS` | system folders in the Decision 15 profile (`/usr`, `/bin`, `/System`, `/Library`, `/opt/homebrew`, `/private/etc`, `/dev`) |
| `SANDBOX_HOME_RO`, `SANDBOX_SECRET_PATHS`, `SANDBOX_ENV_ALLOW`, `SANDBOX_CACHE_DIR` | Decision 5 (used by both bwrap and sandbox-exec) |
| `SANDBOX_PROBE_TIMEOUT_SEC` | `5` |
| `SAFETY_DENY_DEFAULT` | `["Bash(git push:*)", "Bash(rm -rf /*)", "Bash(rm -rf ~*)", "Read(~/.ssh/**)", "Read(~/.aws/**)", "Read(~/.gnupg/**)", "Read(~/.config/gh/**)"]` |
| `SAFETY_ASK_DEFAULT` | `[]` |
| `SECRET_ENV_GLOBS`, `SECRET_ENV_EXCLUDE`, `SECRET_ENV_NAME_PATTERNS`, `SECRET_MIN_LEN`, `SECRET_MASK`, `TERMINAL_MASK_CARRY` | Decision 7 |
| `SECRET_PATTERNS` | `sk-ant-[A-Za-z0-9_-]{20,}`, `sk-[A-Za-z0-9_-]{20,}`, `gh[pousr]_[A-Za-z0-9]{36,}`, `github_pat_[A-Za-z0-9_]{40,}`, `AKIA[0-9A-Z]{16}`, `xox[abposr]-[A-Za-z0-9-]{10,}`, `-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----`, `(?i)(password\|passwd\|secret\|api[_-]?key\|token)\s*[:=]\s*["']?([^\s"']{8,})` (mask group 2 only) |
| `AGENT_TOKEN_PRICES_USD_PER_MTOK` | per agent `{in, out}`; owner fills real prices |
| `COST_DAY_TZ` | `"local"` |
| `BUDGET_TASK_USD_DEFAULT` / `BUDGET_DAY_USD_DEFAULT` | `3.0` / `10.0` (open question 3) |
| `BUDGET_WARN_RATIO` | `0.8` (amber only, no alert) |

`project.toml`:
```toml
[safety]
permission_profile = "safe_build"   # read_only | safe_build ("full" is refused here)
sandbox = "always"                  # always | full_only
deny = ["Bash(psql *prod*)"]        # added to global list
ask  = ["Bash(alembic downgrade:*)"]
extra_ro = [".config/pnpm"]         # extra $HOME paths shown read-only in the sandbox

[budget]
task_usd = 5.0
```

---

## 11. Error handling

| Case | What we do |
|---|---|
| bwrap missing / user namespaces blocked, or `sandbox-exec` probe fails | `probe()` fails; `full` refuses (409 `sandbox_unavailable`, reason `probe_failed` + `hint`); other profiles run unsandboxed with a yellow "not in a safe box" badge and a `run.started.sandboxed=false` |
| Windows (no OS sandbox in v1) | `full` not offered (409 reason `no_os_sandbox`); `read_only` / `safe_build` run with `sandboxed=false` and the same badge |
| macOS: agent needs a Mach service or folder not in the profile | Run fails as usual; stderr shows "Operation not permitted" + the path; fix by `[safety].extra_ro` or a golden-file update after the spike |
| A bind path does not exist | `--ro-bind-try` / `--bind-try` skip it; no error |
| Agent tool missing inside sandbox (path not bound) | Run fails as usual; `run.failed` stderr shows the missing path; fix by `[safety].extra_ro` |
| Claude cannot write `~/.claude.json` (atomic rename over a bind mount) | Day-1 spike; fallback: set `CLAUDE_CONFIG_DIR` to a bound folder (in `agents/claude.py`) |
| Codex nested sandbox fails | Decision 4 fallback |
| `.env` unreadable / huge | Log a warning, skip file; patterns still apply |
| Masking regex error from a project pattern | Reject on load of `project.toml` with the bad pattern named |
| Rewind: active run or wrong stage | 409 with the reason |
| Rewind: checkpoint made on an older base | 409 `base_changed` until confirmed |
| Rewind: `read-tree` refuses (file changed during the step) | Abort; worktree untouched or equal to `pre`; tell user to retry; `pre` checkpoint is kept |
| Rewind: worktree removed | 409 "workspace removed" |
| Scrub interrupted | Each file is replaced by rename; DB updates in batches of 500 in a transaction; re-run is safe (idempotent) |

---

## 12. Tests to write

All with FakeAdapter and recorded fixtures. Sandbox tests are marked `@pytest.mark.sandbox`; they skip with a clear reason if `probe()` fails, but the Linux and macOS CI runners set `SAARTHI_REQUIRE_SANDBOX=1`, which turns the skip into a failure (Linux runner step: allow user namespaces for bwrap). The Windows runner runs the unit tests and `test_full_refused_on_windows.py`.

| Test file | Proves |
|---|---|
| `tests/unit/safety/test_policy.py` | Profile from task; `research` / `review` forced to `read_only`; project lists merge, never remove global; `full` refused as default |
| `tests/unit/agents/test_claude_permission_args.py` | Flags + settings JSON per profile (golden files) |
| `tests/unit/agents/test_codex_permission_args.py` | Flags per profile, incl. Decision 4 fallback switch |
| `tests/unit/safety/test_bwrap_args.py` | Mount order (`--tmpfs $HOME` before any home bind; hooks/config ro after `.git` rw); read_only uses `--ro-bind` for worktree; `--clearenv` + only allowed env |
| `tests/unit/safety/test_no_secret_exposed.py` | No bind source and no macOS allow rule equals or is a parent of any `SANDBOX_SECRET_PATHS` entry (for default config and both adapters) |
| `tests/unit/safety/test_os_table.py` | `sandbox_kind("linux") == bwrap`, `("darwin") == sandbox_exec`, `("win32") is None`, unknown OS -> `None`; `offered_profiles()`: `full` only with a kind and a passing probe; Windows -> `[read_only, safe_build]` |
| `tests/unit/safety/test_sbpl_profile.py` | Golden profile per profile kind; starts with `(deny default)`; worktree is read-only for `read_only`; hooks and `.git/config` denied for writes; no secret path in any allow line |
| `tests/integration/test_sandbox_secrets.py` | **Done-when proof** (Linux and macOS runners). Fake `$HOME` in `tmp_path` with `.ssh/id_ed25519` = `SSH-SECRET-123` and `.aws/credentials`. Through `wrap()` with profile `full`: `cat ~/.ssh/id_ed25519` fails and the secret is not in stdout/stderr; `ls -A ~/.ssh` fails; `echo x > ~/leak` leaves no file on host; `touch <worktree>/ok` persists; `printenv SSH_AUTH_SOCK` is empty; write to `<repo>/.git/hooks/x` fails |
| `tests/integration/test_full_refused_on_windows.py` | `sys.platform` patched to `win32` (and run for real on the Windows runner): `PATCH` with `full` -> 409 `no_os_sandbox`; `/safety/check.offered_profiles` has no `full`; `safe_build` run starts with `sandboxed=false` |
| `tests/integration/test_full_profile_run.py` | Real Run Manager + real `ClaudeAdapter` / `CodexAdapter` pointed at M2's fake binaries (`CLAUDE_BIN`, `CODEX_BIN`), profile `full`, fake `$HOME`: spawned argv starts with `bwrap`; fixture line `_exec cat ~/.ssh/id_ed25519` -> saved `agent.tool_result` shows the failure and no secret; `runs.sandboxed = true` |
| `tests/integration/test_full_refused_without_sandbox.py` | `probe()` patched to fail -> `full` run fails with `sandbox_unavailable`; `safe_build` runs with `sandboxed=false` |
| `tests/unit/safety/test_secret_masker.py` | Each pattern; `.env` values mid-line and inside JSON; short values not masked; `.env.example` ignored; reload on mtime change |
| `tests/integration/test_masking_end_to_end.py` | Fixture prints a `.env` value -> value absent from SQLite, JSONL file and WebSocket frames (TestClient WS) and check `output_tail` |
| `tests/unit/safety/test_terminal_carry.py` | Secret split across two `terminal.output` chunks is masked |
| `tests/integration/test_scrub.py` | Seeded old events / logs get masked; second run masks 0 |
| `tests/unit/safety/test_watch.py` | Codex fixture with `git push origin main` -> `safety.alert{outcome:"seen"}`; Claude fixture with permission denial -> `outcome:"denied"` |
| `tests/integration/test_always_ask_claude.py` | Ask fixture -> task `needs_you`; `POST /runs/{id}/input` "allow once" -> resume args include the exact allowed command |
| `tests/unit/core/test_cost.py` | Day / task / agent totals; reported vs estimated; local-day boundary at midnight |
| `tests/unit/core/test_budget.py` | One alert per (scope, key, limit); raising limit re-arms; under limit -> none |
| `tests/integration/test_checkpoints_list.py` | Rows created at run end; `sync_from_refs` rebuilds rows from pre-M8 refs |
| `tests/integration/test_rewind_roundtrip.py` | **Done-when proof.** Temp repo: add/modify/delete files across 2 checkpoints, plus an ignored `.env`; rewind to #1, then to the pre-rewind #; every file byte-equal to the start; `.env` untouched; HEAD and branch unchanged; real index == HEAD |
| `tests/integration/test_rewind_guards.py` | 409 on active run / `Verifying` / `Shipped`; `base_changed` until confirmed; `Review` -> `Ready`; no duplicate pre-rewind checkpoint; race-lane checkpoint is listed and rewindable |
| `tests/api/test_m8_endpoints.py` | Shapes and status codes for section 8.1 |
| `desktop/src/screens/TaskPage/__tests__/AgentAccessPicker.test.tsx`, `History.test.tsx`, `desktop/src/screens/Settings/__tests__/SafetyAndCost.test.tsx` | Vitest: picker lists only `offered_profiles` (no Full access when the API leaves it out); `fullAccess` confirm; `~` for estimates; Restore confirm |

Before "done": `uv run pytest`, `uv run ruff check .`, `uv run pyright` with output shown (rule 9).

---

## 13. Manual verification

1. Day-1 spikes: Codex nested sandbox (Decision 4), Claude config write (section 11), and the macOS profile (Decision 15) on a real Mac. Write the ADR.
2. Real Claude run in `full` on a scratch task: "show me ~/.ssh and ~/.aws". Both missing. Lock icon on the run. Do it on Linux and on macOS.
3. Same with Codex.
3a. On Windows: Details lists only Read only and Safe; a `safe_build` run works and shows "not in a safe box".
4. Real `safe_build` run on a Saarthi task with `uv sync` + `uv run pytest` inside the sandbox: works (toolchain binds are enough).
5. `grep -r <a real .env value> ~/.local/share/saarthi` -> nothing, after a run that printed `.env`.
6. Rewind round trip on a real task (FSD 7.2).

---

## 14. Risks

1. **Toolchains outside the bind list** (pyenv shims, asdf, snap tools under `~/snap`) break inside the sandbox. Mitigation: `[safety].extra_ro`, clear `run.failed` stderr, `saarthi safety show` lists binds.
2. **Agent CLI flags change** (TECH_STACK 3.3). Golden-file tests make a change visible; re-check `--help` at the start.
3. **`<repo>/.git` is writable**, so an agent can move refs of other branches or delete Saarthi checkpoint refs. Hooks and config are read-only, so it cannot plant code that runs outside the box. Accepted for v1.
4. **Network is open.** A `full` agent can still send worktree content anywhere, or reach a production DB. The sandbox protects home secrets, not the network. Documented in the user guide.
5. **Masking is not perfect**: base64 or split secrets, secrets not in `.env` and not matching a pattern. Masking reduces exposure; it is not a guarantee.
6. **Ubuntu 24.04 user-namespace restriction** blocks bwrap on some machines. Probe + fix hint; M9 wizard checks it.
7. **Budget alerts arrive late** because Claude reports cost at the end of a run.
8. **`sandbox-exec` is deprecated by Apple** and its profile language is not documented. It still ships and other agent tools rely on it. Golden files + the macOS CI runner show a break at once.
9. **Windows has no OS sandbox in v1.** Read only and Safe there rely only on agent rules (pattern level). `saarthi safety show` and the badge say so.

---

## 15. What this milestone does not do

- No network sandbox, no per-host allow list.
- No OS sandbox on Windows (Later); so no Full access there.
- No hard budget stop.
- No manual "save checkpoint" button (open question in FSD).
- No packaging, no AppArmor profile install (M9 documents it).
- No new stage or `ALLOWED_MOVES` row.
- No secret store or "reveal" of masked values.

---

## 16. Effort breakdown

| Task | Hours |
|---|---|
| Day-1 spikes (Codex nested sandbox, Claude config write) + ADR | 1 |
| `policy.py` + adapter `permission_args` + golden tests | 2.5 |
| `sandbox.py` (args, wrap, probe) + unit + integration tests | 3 |
| OS table + `offered_profiles` + Windows refusal + tests | 0.5 |
| macOS `sandbox-exec` profile + spike + golden tests + macOS/Windows CI runners | 2 |
| `_exec` in fake binaries + `test_full_profile_run` | 1 |
| Ask / deny handling + `watch.py` + `safety.alert` | 2 |
| `SecretMasker` + bus hook + checks + terminal carry + tests | 2.5 |
| `safety scrub` | 1 |
| Cost queries + estimate + budget check + `/cost` + CLI | 1.5 |
| Checkpoints table + migration + `sync_from_refs` | 1 |
| Rewind + guards + tests | 1.5 |
| UI: AgentAccessPicker, FullAccessConfirm, History + Restore, SafetyAsk / BudgetWarn cards, Safety and cost page | 1.5 |
| Manual verification | 0.5 |
| **Total** | **21.5** |

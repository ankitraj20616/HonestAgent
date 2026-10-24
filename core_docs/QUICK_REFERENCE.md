# Quick Reference
## HonestAgent - test-integrity gate for agent pull requests

**One-page cheat sheet.** Details: `FUNCTIONAL_SPECIFICATIONS.md` (what), `TDD-tech-design-doc.md` (how).

## AT A GLANCE

| | |
|---|---|
| **What** | A deterministic gate that asks: "Are the tests real, or did the agent cheat to make them pass?" |
| **For** | Me first (Python freelancer using Claude Code and Codex), then any team reviewing agent PRs |
| **Form** | One stateless Python CLI, `honestagent`. No server, no database, no UI. |
| **Languages checked** | Python + pytest (v1). JavaScript later. |
| **Stance** | Vendor-neutral. No LLM, no network in the core. Read-only on your repo. |
| **Stack** | Python 3.12+, uv, Typer + Rich, Pydantic v2, stdlib `ast`, PyYAML. mutmut optional. |
| **Ships as** | PyPI `honestagent`, pre-commit hook, GitHub Action, Claude Code hook |
| **v1 time** | about 95-105 hours at about 10 hours a week (M0-M4) |

## RULES

| ID | Name | Flags | Severity |
|---|---|---|---|
| HA000 | honestagent-note | Tool note: allow marker with no reason, Python file that did not parse, file skipped (binary / too large) | low |
| HA001 | test-deleted | Test function / class / file removed, or renamed so it no longer collects | high |
| HA002 | skip-added | New skip / skipif / xfail, `pytest.skip()`, `@unittest.skip*`, `--ignore` / `--deselect` / `collect_ignore` | high |
| HA003 | assertion-weakened | Fewer asserts, trivial assert, wider `pytest.raises`, looser `approx`; expected value rewritten with its source (medium) | high (rewrite: medium) |
| HA004 | coverage-lowered | `fail_under` / `--cov-fail-under` lowered or removed | high |
| HA005 | ci-or-lint-weakened | CI or lint step removed, `continue-on-error: true`, `\|\| true`, new ignores, new `# noqa` / `# type: ignore` / `# pragma: no cover` | medium |
| HA006 | snapshot-rewritten | Snapshot files changed in the same change as source code | medium |
| HA007 | gate-config-weakened | HonestAgent config changed to disable a rule, lower a severity, add an `allow` entry or loosen `fail_on` | medium |
| HA100 | mutant-survived | (M3, `--mutation`) A mutant on a changed source line survived | medium |

- Rules compare before / after with stdlib `ast`. Text checks only for YAML, INI, TOML and comments.
- Each rule can be turned off (`disable`) or get a new severity (`severity`) in config.
- Finding fields: `rule_id`, `name`, `severity`, `file`, `line`, `message`, `before`, `after`, `allowed`, `allow_reason`.

**Allow marker** (on the line or the line above; reason required):
`# honestagent: allow HA002 -- flaky on CI, see issue #12`
One rule ID per marker. A marker with no reason is ignored and reported as an HA000 note (low). Allowed findings still show, but do not change the verdict.

## VERDICT

| Verdict | JSON | When |
|---|---|---|
| **Has problems** | `has_problems` | At least one not-allowed **high** finding |
| **Take a look** | `take_a_look` | No high, at least one not-allowed **medium** finding |
| **Looks good** | `looks_good` | No not-allowed high or medium findings |

Low findings never change the verdict. No 0-100 score in v1.

## CLI

```
honestagent check [--base REF] [--head REF] [--staged | --working]
                  [--format text|markdown|json] [--output FILE]
                  [--fail-on has_problems|take_a_look|never] [--mutation]
honestagent rules                 # all rules, severity, on/off
honestagent explain HA003         # what it catches, an example, how to allow it
honestagent version
```

- Default: base = merge-base of `HEAD` with the default branch (`origin/HEAD`, else `main`, else `master`; none -> exit 2, pass `--base`), head = `HEAD`.
- `--staged` = index vs `HEAD` (pre-commit). `--working` = working tree vs `HEAD` (Claude Code hook).
- `--mutation` works only in `--base/--head` mode.

| Exit | Meaning |
|---|---|
| `0` | Gate passed |
| `1` | Gate failed (verdict at or worse than `--fail-on`, default `has_problems`) |
| `2` | Tool error (not a git repo, bad ref, no default branch, bad config: unknown key or rule ID, `allow` without a reason; `--mutation` without mutmut or with `--staged` / `--working`) |

**Reports:** `text` (Rich, verdict first), `markdown` (PR comment and proof report, hidden marker `<!-- honestagent -->`, verdict emoji 🔴 Has problems / 🟡 Take a look / 🟢 Looks good), `json` (`schema_version: 1`, `honestagent_version`, `verdict`, `mode`, `base`, `head`, `counts` {`high`, `medium`, `low`, `allowed`, `total`}, `findings[]`, `skipped[]`).

## CONFIG KEYS

`[tool.honestagent]` in `pyproject.toml`, or the same keys at the top level of `.honestagent.toml` (it wins if both exist). CLI flags beat config. Config is read from the **base** ref (`HEAD` for `--staged` / `--working`); defaults if the base has none.

| Key | Meaning |
|---|---|
| `test_paths` | Globs for test files (default `["tests/**/*.py", "**/test_*.py", "**/*_test.py", "**/conftest.py"]`) |
| `fail_on` | `has_problems` / `take_a_look` / `never` |
| `disable` | Rule IDs to turn off, e.g. `["HA006"]` |
| `severity` | Per-rule override, e.g. `{ HA005 = "high" }` |
| `allow` | List of `{ rule, path, reason }` |
| `mutation.enabled` | Turn on the mutation check (M3) |
| `mutation.max_mutants` | Cap on mutants (default 50) |
| `mutation.timeout_sec` | Time cap (default 300) |

## INTEGRATIONS (all thin wrappers over the CLI)

- **pre-commit (F9):** hook id `honestagent`, runs `honestagent check --staged --format text`.
- **GitHub Action (F10):** `ankitraj20616/HonestAgent@v0`, inputs `fail-on`, `mutation`, `comment`, `python-version`; one sticky PR comment; needs `pull-requests: write` and `actions/checkout` with `fetch-depth: 0`.
- **Claude Code hook (F11):** `Stop` hook runs `honestagent check --working --format text`. CLI exit 1 -> hook exit 2 on the first stop (blocks; findings go to the agent). `stop_hook_active` true -> hook exit 1 (no block). CLI exit 2 -> hook exit 1.
- **Mutation (F12, M3):** `pip install honestagent[mutation]`; mutmut on changed lines only, in a temp worktree.

## MILESTONES (v1)

- **M0** Evidence check (~15 h): hand-check 30 agent PRs. Kill if fewer than 1 in 30 tamper; go if 3 or more; 1-2 = no clear signal, decide on purpose.
- **M1** Core + CLI (~30 h): `honestagent check`, HA000-HA007, allow markers, verdict, 3 formats, config, exit codes.
- **M2** Integrations (~15 h): pre-commit hook, GitHub Action, Claude Code hook sample.
- **M3** Mutation add-on (~20-30 h): `--mutation`, mutmut on changed lines, HA100.
- **M4** Launch v0.1 (~15 h): PyPI, GitHub Marketplace, Claude Code plugin listing, data post.

## HARD RULES (short)

1. One package, `src/honestagent`. No background service, server, database or UI.
2. CLI first. Integrations only call the CLI.
3. No LLM and no network in the core.
4. Read-only on the user's repo. Mutation runs in a temp worktree.
5. Git via `subprocess` with a list of args.
6. All rules in `RULES`; each rule is a pure function `(ChangeSet, Config) -> list[Finding]`.
7. Settings only in `config.py` and the user's config file.
8. Tests first, on recorded PR fixtures. No network, no real agents.
9. Run `uv run pytest`, `uv run ruff check .`, `uv run pyright` before "done".
10. Simple English. Keep it small. No "Later" features early.

**Later (not v1):** JS / TS rules, hosted GitHub App and team tier, trust score, LLM second opinion, HTML proof report, other agent hooks, web dashboard, SARIF output.

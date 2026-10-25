# Quick Reference
## fastauthz - authorization for FastAPI and SQLAlchemy

**One-page cheat sheet.** Details: `FUNCTIONAL_SPECIFICATIONS.md` (what), `TDD-tech-design-doc.md` (how).

## AT A GLANCE

| | |
|---|---|
| **What** | Write permission rules once. Use them to check objects and to filter SQL queries. |
| **For** | FastAPI backend developers, SaaS teams, security reviewers |
| **Form** | A Python library. No server, no database, no UI. |
| **Stance** | Default deny. Deny wins. Unsure = no. Errors at startup. |
| **Stack** | Python 3.11+. Core: no dependencies. Extras: SQLAlchemy 2.0+, FastAPI 0.115+. |
| **Install** | `pip install "fastauthz[standard]"` |
| **License** | MIT |
| **v1.0 time** | about 125 hours (M0-M5) |

## WRITE RULES

```python
from fastauthz import Policy, R, A, ANYONE

policy = Policy(scope=R.org_id == A.org_id)                 # tenant scope (optional)
policy.roles({"admin": ["editor"], "editor": ["viewer"]})
policy.resource(Post, actions=["read", "create", "edit", "delete"])

policy.allow("read", Post, who=ANYONE, when=R.published.is_(True), bypass_scope=True)  # public
policy.allow("read", Post, roles=["viewer"])
policy.allow(["edit", "delete"], Post, when=R.author_id == A.id)
policy.allow("*", Post, roles=["admin"])
policy.deny("delete", Post, when=R.locked.is_(True))
```

| Write | Means |
|---|---|
| `R.col` / `A.attr` | resource column / actor attribute |
| `R.project.org_id` | follow a "belongs to" link (SQL `has()`) |
| `R.members.any(user_id=A.id)` | some related row matches (SQL `any()`) |
| `== != < <= > >=` | compare |
| `.in_(x)` `.not_in(x)` | in a list (literal list or actor list) |
| `.is_(None)` `.is_not(None)` `.is_(True)` | null / boolean test |
| `&` `\|` `~` | and / or / not. **Never** `and` / `or` / `not`. Use parentheses. |
| `who=ANYONE` | rule also for anonymous users (default for allow: logged-in only) |
| `bypass_scope=True` | allow rule ignores the tenant scope (listed by `fastauthz check`) |
| `check=fn`, `sql=fn` | custom Python check, with optional SQL twin |

## USE RULES

| Call | Gives |
|---|---|
| `policy.can(user, "edit", post)` | `bool` |
| `policy.check(user, "edit", post)` | `None` or raises `Denied` |
| `policy.filter(user, "read", Post)` | SQLAlchemy condition for `.where()` |
| `policy.explain(user, "edit", post)` | every rule and why it was TRUE / FALSE / UNKNOWN |

## FASTAPI

```python
authz = FastAuthz(policy, actor=get_current_user, session=get_session)  # deny_status=404, on_decision=None
authz.install(app)                                                      # 403/404 handler + OpenAPI docs
```

| Dependency | Route gets | Queries |
|---|---|---|
| `authz.query(Post, "read")` | filtered `select(Post)` | 0 (route runs it) |
| `authz.filter(Post, "read")` | condition | 0 |
| `authz.load(Post, "edit")` | the `Post` from `/{post_id}` | 1 (404 if missing or denied) |
| `authz.require("create", Post)` | `None` | 0 (actor-only rules) |
| `authz.guard` | helper: `.can` `.check` `.filter` | as used |

## TRUTH RULES

- Answer is "yes" **only** if `allow_part AND NOT deny_part` is `TRUE`.
- `NULL` column, `None` actor, missing actor attribute -> `UNKNOWN` -> no.
- Kleene logic: `T AND U = U`, `F AND U = F`, `T OR U = T`, `F OR U = U`, `NOT U = U`.
- Through a `None` "belongs to" link -> `FALSE` (same as SQL `has()`).
- Empty `.in_([])` -> `FALSE`.

## STARTUP PROBLEM CODES

| Code | Level | Problem |
|---|---|---|
| FA001 | error | unknown action |
| FA002 | error | unknown resource |
| FA003 | error | column / relationship not on model |
| FA004 | error | dot through a "has many" link (use `.any()`) |
| FA005 | error | relationship depth > 3 |
| FA006 | error | role cycle |
| FA007 | error | undefined role in a rule |
| FA008 | error | scope column missing on resource |
| FA009 | warning | `who=ANYONE` with no condition |
| FA010 | warning | action nobody can do |
| FA011 | warning | rule can never match |
| FA012 | notice | resource with `scope=None` |
| FA013 | notice | non-filterable rule (`check` without `sql`) |
| FA014 | warning | probably missing parentheses |
| FA015 | warning | `== None` (use `.is_(None)`) |
| FA016 | warning | `who=ANYONE` on a scoped resource without `bypass_scope=True` |

## CLI

```
fastauthz check   app.authz:policy [--strict] [--format text|json]     # exit 0 ok, 1 errors, 2 usage
fastauthz matrix  app.authz:policy [--format markdown|json|csv] [--output FILE]
fastauthz explain app.authz:policy --resource Post --action edit
fastauthz version
```

## MILESTONES

| M | What | Hours |
|---|---|---|
| M0 | setup + 3 spikes | 10 |
| M1 | core (rules, truth, roles, can, explain) | 25 |
| M2 | SQL, scope, relationships, property tests | 30 |
| M3 | FastAPI + `0.1.0` on PyPI | 25 |
| M4 | test helpers, CLI, examples, docs site | 20 |
| M5 | security review + `1.0.0` | 15 |

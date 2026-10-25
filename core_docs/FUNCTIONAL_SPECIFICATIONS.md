# Functional Specifications (FSD)
## fastauthz v1.0 - who can do what, for FastAPI apps

**Version:** 1.0 (draft)
**Date:** 2026-10-25
**Scope:** v1.0 (tasks M0 to M5 in `TASKS.md`)
**How it is built:** `TDD-tech-design-doc.md`. **With what:** `TECH_STACK.md`.

> This file says WHAT fastauthz does. It does not say how.
> The English is kept very simple on purpose.
> "Must" = needed for v1.0. "Should" = v1.0 if there is time. "Later" = not in v1.0.
> Every point has an ID (like F6.2). Tests and PRs can point at it.

---

## 1. The problem

### 1.1 What hurts today
- Almost every app has users. Users may only do some things.
  - Example: Alice can edit her own posts. She cannot edit Bob's posts.
  - Example: a user in company A must never see data of company B.
- In FastAPI, people write these checks by hand:
  - `if user.role != "admin": raise 403` in many routes.
  - `WHERE org_id = ...` added by hand to every list query.
- If one route or one query forgets the check, private data leaks.
- Django has ready tools for this. FastAPI does not have a good, maintained one:
  - `oso` did this well. It is now archived and gets no fixes.
  - `fastapi-permissions` has had no release since 2020.
  - Other tools need a separate server, or cost money.
- Proof and links: `decisions/ADR-001-build-fastauthz.md`.

### 1.2 What fastauthz is
- A Python library. You install it with `pip install "fastauthz[standard]"`.
- You write your permission rules **once**, in normal Python.
- fastauthz uses the same rules in three places:
  - **Check one thing:** "Can Alice edit post 7?" -> yes or no.
  - **Filter a list:** "Show only the posts Alice may read." -> it adds the right `WHERE` to the SQL.
  - **Guard a route:** a FastAPI dependency. It loads the object and checks it. If not allowed, it returns 404 or 403.

### 1.3 Our promises
- **Safe by default.** If no rule says "yes", the answer is "no".
- **One rule, same answer.** The check in Python and the filter in SQL always agree. We test this.
- **Mistakes show up early.** A typo in a rule stops the app at start, not later in production.
- **No server, no subscription.** It runs inside your app. Free and open source (MIT).
- **Plain Python.** No YAML files. No special policy language.

---

## 2. Who uses it

| User | What they need |
|---|---|
| **FastAPI backend developer** (main user) | Stop writing permission checks by hand in every route. |
| **SaaS team with many customers** | Make sure one customer never sees another customer's data. |
| **Security reviewer / auditor** | See all rules in one table. Know who can do what. |
| **Tech lead** | Be sure new routes cannot forget the check. |

---

## 3. Goals and non-goals

### 3.1 Goals (v1.0)
- G1. Write permission rules in plain Python, in one place.
- G2. Use the same rule to check one object and to filter a list in SQL.
- G3. Plug into FastAPI with a few lines.
- G4. Be safe by default: deny when unsure.
- G5. Find rule mistakes when the app starts.
- G6. Be easy to test and easy to debug.
- G7. Be fast. Add almost no time to a request.

### 3.2 Non-goals (v1.0)
- Not login. fastauthz does not check passwords or tokens.
  - You already have a "current user" dependency. fastauthz uses it.
- Not a server. Not a database. Not a web UI.
- No YAML or policy files.
- No ORMs other than SQLAlchemy (and SQLModel, which is built on SQLAlchemy).
- No unlimited-depth trees (like folders inside folders inside folders). That is Later.

---

## 4. Words we use

| Word | Meaning |
|---|---|
| **Actor** | The person (or service) doing something. Usually your `User` object. Can be `None` if not logged in. |
| **Resource** | The thing being used. Usually a SQLAlchemy model, like `Post`. |
| **Action** | What the actor wants to do. A short word, like `"read"` or `"edit"`. |
| **Rule** | One line that says "allow" or "deny" an action on a resource, maybe with a condition. |
| **Condition** | The "when" part of a rule. Example: `R.author_id == A.id`. |
| **`R`** | Means "the resource" inside a condition. `R.author_id` = the post's author id. |
| **`A`** | Means "the actor" inside a condition. `A.id` = the user's id. |
| **Role** | A name given to users, like `"admin"` or `"editor"`. |
| **Scope** | A condition added to every rule of a resource. Used to keep each customer's data apart. |
| **Policy** | All your rules together. One `Policy` object. |
| **Decision** | The result of one check: allowed or not, plus who, what and when. |
| **Filter** | A SQL condition made from the rules, to get only allowed rows. |

---

## 5. Features

| ID | Feature | Priority | Milestone |
|---|---|---|---|
| F1 | Write rules in Python | Must | M1 |
| F2 | Safe answers (deny when unsure) | Must | M1 |
| F3 | Roles | Must | M1 |
| F4 | Check one object | Must | M1 |
| F5 | Startup checks | Must | M1 |
| F6 | Explain a decision | Must | M1 |
| F7 | Filter lists in SQL | Must | M2 |
| F8 | Tenant scope (keep customers apart) | Must | M2 |
| F9 | Rules that follow relationships | Must | M2 |
| F10 | Custom checks (escape hatch) | Must | M2 |
| F11 | FastAPI dependencies | Must | M3 |
| F12 | Clear HTTP errors | Must | M3 |
| F13 | Permissions shown in API docs | Must | M3 |
| F14 | Decision log | Must | M3 |
| F15 | Test helpers | Must | M4 |
| F16 | Command line tool | Must | M4 |
| F17 | Example apps and docs site | Must | M4 |

---

### F1. Write rules in Python (Must, M1)
- F1.1 The user makes one policy:
  - `policy = Policy()`
- F1.2 The user lists each resource and its actions:
  - `policy.resource(Post, actions=["read", "create", "edit", "delete"])`
- F1.3 The user adds "allow" rules:
  - `policy.allow("read", Post, when=R.published.is_(True))`
  - `policy.allow(["edit", "delete"], Post, when=R.author_id == A.id)`
- F1.4 The user adds "deny" rules:
  - `policy.deny("delete", Post, when=R.locked.is_(True))`
- F1.5 The action can be one word, a list of words, or `"*"` (all actions).
- F1.6 A condition can use:
  - compare: `==`, `!=`, `<`, `<=`, `>`, `>=`
  - lists: `.in_([...])`, `.not_in([...])`
  - empty check: `.is_(None)`, `.is_not(None)`, `.is_(True)`, `.is_(False)`
  - join conditions: `&` (and), `|` (or), `~` (not)
- F1.7 If the user writes `and` / `or` / `not` instead of `&` / `|` / `~`:
  - fastauthz stops with a clear error message.
  - (Python `and` would silently drop part of the rule. That is dangerous.)
- F1.8 Who a rule is for:
  - By default, a rule is only for **logged-in** users.
  - `who=ANYONE` makes it work for not-logged-in users too.
- F1.9 Rules can have a name: `name="authors-edit-own-posts"`.
  - Names show up in logs and in "explain".

### F2. Safe answers (Must, M1)
- F2.1 **Default deny.** No allow rule matches -> "no".
- F2.2 **Deny wins.** Any deny rule matches -> "no", even if allow rules match.
- F2.3 **Unsure means no.** The answer is "no" when:
  - the actor is `None` and the rule needs the actor;
  - the actor has no such field;
  - the database value is empty (`NULL`);
  - a custom check crashes.
- F2.4 Python checks and SQL filters follow the same rules.
  - So they always give the same answer for the same data.

### F3. Roles (Must, M1)
- F3.1 A rule can need a role:
  - `policy.allow("delete", Post, roles=["admin"])`
- F3.2 Roles can include other roles:
  - `policy.roles({"admin": ["editor"], "editor": ["viewer"]})`
  - Here an admin can do everything an editor and a viewer can.
- F3.3 By default, fastauthz reads roles from `user.roles`.
  - The user can change this: `Policy(actor_roles=lambda user: user.role_names)`.
- F3.4 A loop in roles (admin -> editor -> admin) is an error at start.
- F3.5 A rule that uses an unknown role (typo like `"admn"`) is an error at start.

### F4. Check one object (Must, M1)
- F4.1 `policy.can(user, "edit", post)` returns `True` or `False`.
- F4.2 `policy.check(user, "edit", post)` does nothing if allowed. If not allowed, it raises `Denied`.
- F4.3 It works with any Python object, not only database models.
- F4.4 It never loads data from the database by itself.
  - If needed data is not loaded, the answer is "no" and a warning is logged.

### F5. Startup checks (Must, M1)
- F5.1 When the app starts, fastauthz checks all rules. It finds:
  - actions that were never declared (typo like `"eidt"`);
  - resources that were never declared;
  - columns that do not exist on the model;
  - unknown roles and role loops;
  - scope columns missing on a resource.
- F5.2 It shows **all** problems at once, each with the file and line of the rule.
- F5.3 Any error stops the app from starting.
- F5.4 Warnings do not stop the app. Examples:
  - "Anyone, even not logged in, can do this."
  - "Nobody can ever do this action."
  - "You wrote `== None`. Did you mean `.is_(None)`?"
- F5.5 After the check, the policy is locked. No one can change it while the app runs.

### F6. Explain a decision (Must, M1)
- F6.1 `policy.explain(user, "edit", post)` shows every rule and its result.
  - Example line: `Post.edit#1  allow  FALSE  R.author_id (7) == A.id (3)`
- F6.2 It shows the file and line of each rule.
- F6.3 It is for developers (debugging and tests). It is not shown to end users.

### F7. Filter lists in SQL (Must, M2)
- F7.1 `policy.filter(user, "read", Post)` returns a SQLAlchemy condition.
  - Use it like: `select(Post).where(policy.filter(user, "read", Post))`.
- F7.2 The database returns only the rows the user may see.
- F7.3 Values are always sent as safe SQL parameters. Never as raw text.
- F7.4 Parts that depend only on the user are worked out before the query.
  - Example: for an admin, the filter often becomes simply "true".
- F7.5 It works with normal and async SQLAlchemy sessions.
- F7.6 It works on SQLite and PostgreSQL.

### F8. Tenant scope (Must, M2)
- F8.1 The user can set one scope for the whole policy:
  - `Policy(scope=R.org_id == A.org_id)`
  - Now every allow rule also needs "same organisation".
- F8.2 A resource can have its own scope, or no scope:
  - `policy.resource(Org, actions=[...], scope=R.id == A.org_id)`
  - `policy.resource(Country, actions=["read"], scope=None)`
- F8.3 If a resource does not have the scope column, the app does not start.
  - The user must set `scope=None` or a different scope for it. This must be a clear choice.
- F8.4 An allow rule can skip the scope only with `bypass_scope=True`.
  - Example: platform staff who support all customers.
  - The command line tool lists every rule that does this.
- F8.5 Deny rules apply in every scope.
- F8.6 A not-logged-in user has no organisation. So they never pass a scope like `R.org_id == A.org_id`.
  - For public things (like published posts), add `bypass_scope=True` to that rule.
  - fastauthz warns at start if a `who=ANYONE` rule would never work because of the scope.

### F9. Rules that follow relationships (Must, M2)
- F9.1 Follow a "belongs to" link with a dot:
  - `R.project.org_id == A.org_id` -> "the post's project is in my organisation".
- F9.2 Check a "has many" link with `.any()`:
  - `R.members.any(user_id=A.id)` -> "I am one of the members".
  - `R.members.any(user_id=A.id, role="editor")` -> "I am an editor member".
- F9.3 Check a "belongs to" link with a condition using `.has()`:
  - `R.owner.has(R.is_active.is_(True))`
- F9.4 Max depth is 3 links. This keeps queries fast.
- F9.5 These work in both Python checks and SQL filters, with the same answers.

### F10. Custom checks (Must, M2)
- F10.1 For rules that cannot be written with `R` and `A`:
  - `policy.allow("publish", Post, check=my_function)`
- F10.2 Such a rule works for one-object checks only.
- F10.3 If the user also gives `sql=...`, it can be used in filters too.
- F10.4 If a route tries to filter with a rule that has no SQL form:
  - the app stops at start with a clear error.
- F10.5 If the custom function crashes, the answer is "no" and the error is logged.

### F11. FastAPI dependencies (Must, M3)
- F11.1 Setup in 2 lines:
  - `authz = FastAuthz(policy, actor=get_current_user, session=get_session)`
  - `authz.install(app)`
- F11.2 **List route:** `Depends(authz.query(Post, "read"))`
  - Gives the route a `select(Post)` that is already filtered.
  - The route can still add `limit`, `order_by`, pagination.
- F11.3 **One-object route:** `Depends(authz.load(Post, "edit"))`
  - Reads the id from the URL (like `/posts/{post_id}`).
  - Loads the post and checks permission in **one** query.
  - Not found or not allowed -> 404 (by default).
- F11.4 **Create route:** `Depends(authz.require("create", Post))`
  - Checks rules that need only the user (like roles).
  - The scope is not used here, because the new object does not exist yet.
  - To check the new object itself (like its organisation), build it and use `guard.check("create", new_post)`.
- F11.5 **Many checks in one route:** `Depends(authz.guard)`
  - Gives a helper with `.can()`, `.check()` and `.filter()` for the current user.
- F11.6 Works with `async def` and normal `def` routes.
- F11.7 Works with async and normal SQLAlchemy sessions.
- F11.8 Wrong action names or resources in a route stop the app at start.

### F12. Clear HTTP errors (Must, M3)
- F12.1 Not allowed -> HTTP 403. For `load()`, 404 by default.
  - 404 hides whether the object exists. This is safer.
  - The app can choose 403 instead: `FastAuthz(..., deny_status=403)`.
- F12.2 The error body uses the standard "problem details" format (RFC 9457):
  - `{"type": "about:blank", "title": "Forbidden", "status": 403, "detail": "You do not have permission to edit this Post."}`
- F12.3 The error never shows rule names or data values.

### F13. Permissions shown in API docs (Must, M3)
- F13.1 After `authz.install(app)`, Swagger UI shows for each guarded route:
  - which permission it needs (like "`edit` on `Post`");
  - the 403 / 404 responses.
- F13.2 The OpenAPI file gets an extra field `x-fastauthz` with the resource and action.
- F13.3 It must keep working on new FastAPI versions. CI tests this.

### F14. Decision log (Must, M3)
- F14.1 Every check makes a decision record: allowed or not, action, resource type, ids, time taken.
- F14.2 The app can get each record: `FastAuthz(..., on_decision=my_function)`.
- F14.3 Records hold ids only. Never full user objects or private data.
- F14.4 Records also go to the Python logger `fastauthz.decisions`.
- F14.5 If `my_function` crashes, the decision does not change. The error is logged.

### F15. Test helpers (Must, M4)
- F15.1 `assert_allowed(policy, user, "edit", post)` and `assert_denied(...)`.
  - On failure they print the full explanation.
- F15.2 `check_cases(policy, [...])` tests a table of cases and reports all failures at once.
- F15.3 `assert_filter_consistent(...)` proves the Python check and the SQL filter agree on the user's own test data.
- F15.4 `override_actor(app, authz, user)` lets a test act as any user.

### F16. Command line tool (Must, M4)
- F16.1 `fastauthz check app.authz:policy`
  - Checks all rules. Prints problems with file and line.
  - Exit code 0 = fine, 1 = errors, 2 = could not run.
  - `--strict` also fails on warnings. Good for CI.
- F16.2 `fastauthz matrix app.authz:policy --format markdown`
  - Prints a table: resource, action, and who can do it, in plain words.
  - Good for security reviews and audits.
- F16.3 `fastauthz explain app.authz:policy --resource Post --action edit`
  - Prints every rule for that action.
- F16.4 `fastauthz version`

### F17. Example apps and docs site (Must, M4)
- F17.1 Three example apps, all tested in CI:
  - **blog** - authors edit their own posts.
  - **saas_multitenant** - many companies, roles per company.
  - **hospital** - doctors see only patients in their ward; deny rules.
- F17.2 A docs website with:
  - a 5-minute start guide;
  - concepts, every operator, roles, relationships, FastAPI guide, testing, CLI;
  - the security model in simple words;
  - recipes and FAQ;
  - a fair comparison with other tools.
- F17.3 Every code example in the docs is run in CI.

---

## 6. Quality needs (non-functional)

### 6.1 Safety
- N1. No known way for a mistake in data (empty values, missing fields) to give access.
- N2. Values never go into SQL as text.
- N3. Security issues can be reported privately (see `SECURITY.md`).

### 6.2 Speed
- N4. Checking one object takes less than 20 microseconds (normal laptop).
- N5. Building a filter takes less than 100 microseconds.
- N6. `load()` uses one query. `query()` adds no extra queries.

### 6.3 Works with
- N7. Python 3.11 to 3.15.
- N8. FastAPI 0.115 and newer. SQLAlchemy 2.0 and newer.
- N9. SQLite and PostgreSQL.
- N10. The core part needs no other packages at all.

### 6.4 Trust
- N11. Test coverage: 100% for the core, at least 95% overall.
- N12. Special random tests prove Python checks and SQL filters agree.
- N13. Releases come only from CI, with signed proof of where they were built.
- N14. Version numbers follow SemVer. After 1.0, nothing breaks without a major version.
  - Old features warn for at least two releases before removal.

---

## 7. User stories (end to end)

### 7.1 A blog: authors edit only their own posts
1. Dev writes: `policy.allow(["edit", "delete"], Post, when=R.author_id == A.id)`.
2. Dev adds `Depends(authz.load(Post, "edit"))` to `PATCH /posts/{post_id}`.
3. Alice edits her post -> 200.
4. Alice tries Bob's post -> 404. She cannot even tell it exists.

### 7.2 A SaaS app: companies never see each other
1. Dev writes: `Policy(scope=R.org_id == A.org_id)`.
2. `GET /invoices` uses `Depends(authz.query(Invoice, "read"))`.
3. A user of company A gets only company A's invoices. The SQL has `WHERE org_id = ...` added for them.
4. Later, a new dev adds a `Report` model without `org_id`.
   - The app does not start. The error says: "Report has no org_id. Set scope=None or a custom scope."
   - The leak is stopped before it ships.

### 7.3 A hospital: doctors see patients in their ward
1. Rule: `policy.allow("read", Patient, when=R.ward.doctors.any(id=A.id))`.
2. A doctor opens the patient list. They see only patients in their wards.
3. Rule: `policy.deny("read", Patient, when=R.is_vip.is_(True) & ~A.is_senior.is_(True))`.
4. A junior doctor does not see VIP patients, even in their ward.

### 7.4 A security review
1. The reviewer runs `fastauthz matrix app.authz:policy --format markdown`.
2. They get one table with every resource, action and rule in plain words.
3. They see one rule with `bypass_scope=True` and ask why. Good review, in minutes.

---

## 8. Later (not v1.0)
- Hide single fields (like `salary`) from some users.
- Trees of unlimited depth (folders inside folders).
- "Who can access this object?" reverse search.
- Rules stored in the database or changed while the app runs.
- Other ORMs: Tortoise, Beanie (MongoDB), Piccolo.
- MySQL / MariaDB in CI.
- Adapters for Litestar and Django Ninja.
- A web UI to edit rules.

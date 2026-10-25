# M3 - FastAPI: Functional Spec (FSD)

> This file says WHAT M3 gives. Very simple words.
> Main spec: `../../FUNCTIONAL_SPECIFICATIONS.md` (F11 to F14).
> How it is built: `TDD.md` in this folder. Steps: `TASKS.md` in this folder.
> IDs look like `M3-F11.2`. They point to the main F-number (here F11).

---

## 1. Goal of this milestone

- Make fastauthz easy to use in a FastAPI app.
- A route gets safe with one line: `Depends(authz.load(Post, "edit"))`.
- Lists are filtered for you. You do not write `WHERE` by hand.
- Errors are clear and safe. They never show your rules or your data.
- At the end, we put version `0.1.0` on PyPI so people can try it.

---

## 2. What we get at the end

- **FastAPI developer**
  - Adds 2 lines of setup.
  - Protects a list route, a detail route and a create route, one line each.
  - Does not write permission `if` checks in routes anymore.
- **SaaS team**
  - List routes show only their own company's rows.
  - A detail route for another company's row gives 404. It looks like the row does not exist.
- **Security reviewer**
  - Opens Swagger UI and sees which permission each route needs.
  - Gets a log record for every check (ids only, no private data).
- **Tech lead**
  - A typo in an action name, or a wrong URL name, stops the app at start.
  - Not in a user's request at 2 a.m.

---

## 3. Features in this milestone

### M3-F11.1 Setup (main F11.1)
- You make one `FastAuthz` object:
  - `authz = FastAuthz(policy, actor=get_current_user, session=get_session)`
- `actor` is your own "who is logged in" dependency.
  - fastauthz does not log people in. It only uses what you give.
  - It may return `None` (not logged in). That is fine.
- `session` is your own database session dependency.
  - Normal (`Session`) or async (`AsyncSession`). Both work.
  - It is needed only for `load()`.
- Making `FastAuthz` checks your whole policy.
  - Any rule mistake stops the app here.
  - After this, the policy is locked.
- Then you call `authz.install(app)` once. It:
  - turns "not allowed" into a clean 403 or 404 answer;
  - adds the permissions to the API docs;
  - checks your routes for mistakes.

### M3-F11.2 List route: `authz.query(Model, action)` (main F11.2)
- It gives your route a ready query: `select(Post)` with the right `WHERE`.
- You can still add `.limit()`, `.order_by()`, pagination.
- It does not run the query. Your route runs it.
- Example:
  - Alice is an author. `GET /posts` shows only posts she may read.
  - An admin gets all posts of their company.
  - A not-logged-in user gets only public posts (or none).

### M3-F11.2b Only the condition: `authz.filter(Model, action)` (main F11.2)
- It gives only the `WHERE` part.
- Good when you write your own joins or a special query.

### M3-F11.3 One-object route: `authz.load(Model, action)` (main F11.3)
- It reads the id from the URL.
  - `/posts/{post_id}` -> it uses `post_id` by default.
  - `/posts/{id}` -> it uses `id` if that is the only URL part.
  - You can choose: `authz.load(Post, "edit", param="pid")`.
- It loads the object and checks the permission in **one** database query.
- Found and allowed -> your route gets the `Post`.
- Not found, or not allowed -> 404 (by default).
  - The user cannot tell "does not exist" from "not allowed".
- A bad id (like `/posts/abc` for a number id) -> 422, like normal FastAPI.
- The object comes from the same session your route uses.
  - So you can change it and commit.

### M3-F11.4 Create route: `authz.require(action, Model)` (main F11.4)
- For actions with no object yet. Usually `"create"`.
- It checks only rules about the user: logged in or not, roles, user fields.
  - Example: `policy.allow("create", Post, roles=["editor"])` works.
- The tenant scope is not used here. The new object does not exist yet.
- A rule that needs the object (`R.org_id == ...`) says "no" here.
  - To check the new object, build it and use `guard.check("create", new_post)`.
- If a `require()` route can never say "yes", you get a warning at start.

### M3-F11.5 Many checks in one route: `authz.guard` (main F11.5)
- `Depends(authz.guard)` gives a small helper for the current user.
- It has 3 methods:
  - `guard.can("feature", post)` -> `True` / `False`.
  - `guard.check("publish", post)` -> nothing, or 403.
  - `guard.filter("read", Comment)` -> a `WHERE` condition.

### M3-F11.6 / F11.7 Sync and async (main F11.6, F11.7)
- Works in `async def` routes and normal `def` routes.
- Works with async and normal SQLAlchemy sessions.
- fastauthz picks the right way at start. You do nothing.

### M3-F11.8 Mistakes stop the app (main F11.8)
- These stop the app at start, with a clear message:
  - an action that was not declared (typo like `"eidt"`);
  - a model that was not declared;
  - `query`, `filter` or `load` on a rule that has no SQL form;
  - `load()` on a route whose URL has no matching id part;
  - `load()` without a `session`.

### M3-F12 Clear HTTP errors (main F12)
- Not allowed -> 403.
- `load()` not found or not allowed -> 404 (default).
- You can choose 403 for `load()`: `FastAuthz(..., deny_status=403)`.
  - Then: row exists in your company, not allowed -> 403.
  - Row does not exist -> 404.
  - Row of another company -> still 404. Other companies' ids stay hidden.
- The error body uses the standard "problem details" format (RFC 9457):
  - `{"type": "about:blank", "title": "Forbidden", "status": 403, "detail": "You do not have permission to edit this Post."}`
- The body never shows rule names, values or the explanation.
- If your app already handles `Denied`, we keep your handler.

### M3-F13 Permissions in API docs (main F13)
- After `install()`, Swagger UI shows for each protected route:
  - a line like "**Permission:** `edit` on `Post`";
  - the 403 / 404 answers it can give.
- The OpenAPI file gets a field `x-fastauthz`, like
  `[{"resource": "Post", "action": "edit"}]`.
- Tools and reviewers can read this field.

### M3-F14 Decision log (main F14)
- Every check makes a small record (a "decision"):
  - allowed or not;
  - action, resource type;
  - the object id and the user id (ids only);
  - which rules said yes or no (for single checks);
  - time taken, in microseconds.
- You can get every record: `FastAuthz(..., on_decision=my_function)`.
- If `my_function` crashes:
  - the answer does not change;
  - the error is written to the log.
- Records also go to the Python logger `fastauthz.decisions`.
- Records never hold the full user object or private data.

---

## 4. Safety promises touched here

- **Default deny** stays. Unsure -> no -> 403 or 404.
- **One query for `load()`.** The check and the load happen together.
  - No gap where the data can change between "check" and "load".
- **404 hides ids.** By default you cannot learn which ids exist.
- **Other tenants stay hidden.** Even with `deny_status=403`, another company's row gives 404.
- **No leaks in errors.** Error bodies use a fixed text. No rule names. No values.
- **No leaks in logs.** Decision records hold ids, not objects.
- **No SQL from values.** All values go to the database as bound parameters.
- **Not logged in is not a hole.** A `None` user fails every rule that needs a user.
- **fastauthz never returns 401.** Logging in is your `actor` dependency's job.

---

## 5. What is NOT in this milestone

- Test helpers (`assert_allowed`, `override_actor`, ...) -> M4.
- The command line tool -> M4.
- Example apps and the docs website -> M4.
- Speed benchmarks in CI -> M4.
- Security review, mutation tests, 1.0 -> M5.
- Later items (not in v1.0 at all):
  - hiding single fields;
  - deep trees;
  - "who can see this?";
  - Litestar or Django Ninja;
  - GraphQL.
- Login, tokens, passwords: never. That is not our job.

---

## 6. Done when

- [ ] `FastAuthz(...)` and `install(app)` work.
- [ ] `query`, `filter`, `load`, `require`, `guard` work.
- [ ] They work with sync and async routes and sessions.
- [ ] `load()` uses one query when allowed.
- [ ] Not allowed gives 403 / 404 with a problem-details body.
- [ ] Swagger shows the permission of each route.
- [ ] Every check makes a decision record.
- [ ] HTTP tests pass on SQLite and PostgreSQL.
- [ ] One test with SQLModel models passes.
- [ ] The full CI matrix is green.
- [ ] `0.1.0` is on PyPI.

---

## 7. Words used

| Word | Meaning |
|---|---|
| **Dependency** | A FastAPI function that runs before your route and gives it a value (`Depends(...)`). |
| **Session** | The SQLAlchemy object that talks to the database. |
| **Path parameter** | The part of the URL in `{ }`, like `post_id` in `/posts/{post_id}`. |
| **403** | HTTP "Forbidden": you may not do this. |
| **404** | HTTP "Not Found": we show this so nobody learns which ids exist. |
| **422** | HTTP "bad input": the id in the URL has the wrong type. |
| **Problem details** | A standard JSON shape for errors (RFC 9457). |
| **OpenAPI** | The file that describes your API. Swagger UI shows it. |
| **Guard** | A small helper bound to the current user, with `can`, `check`, `filter`. |
| **Decision** | One record of one check: who, what, yes or no, how long. |
| **Handler** | A function that turns an error into an HTTP answer. |
| **PyPI** | The place where Python packages are published. |

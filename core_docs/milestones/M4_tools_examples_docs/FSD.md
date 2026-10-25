# M4 - Tools, examples, docs
## Functional spec (FSD) for this milestone

**Milestone:** M4 (about 20 hours)
**Main FSD:** F15 (test helpers), F16 (command line tool), F17 (examples and docs site), N4-N6 (speed)
**Main TDD:** sections 13, 14.4, 14.5, 16, 19
**How it is built:** `TDD.md` in this folder. **Steps:** `TASKS.md` in this folder.
**Needs first:** M1, M2 and M3 are done.

> Very simple English. Short points.
> This file says WHAT we build in M4. It does not say how.
> IDs like `M4-F15.2` point to the main FSD feature `F15`.

---

## 1. Goal of this milestone

- Help people **test their own rules** with a few lines.
- Give a **command line tool**:
  - for CI (find rule mistakes before merge);
  - for security reviews (one table of who can do what).
- Show **three real example apps** that people can copy.
- Write a **docs website**, so a new person can start in 5 minutes.
- **Measure speed**, and warn us when the library gets slower.

---

## 2. What we get at the end

- **App developer**
  - Writes a rule test in one line: `assert_allowed(policy, alice, "edit", post)`.
  - When a test fails, sees **why**: every rule, its result, and its file and line.
  - Can test a whole table of cases at once.
  - Can prove that the Python check and the SQL filter agree on their own data.
  - Can act as any user in API tests.
- **Tech lead**
  - Adds `fastauthz check --strict app.authz:policy` to CI.
  - A typo in a rule makes CI red. It never reaches production.
- **Security reviewer**
  - Runs `fastauthz matrix app.authz:policy`.
  - Gets one table: every resource, every action, who may do it, who is stopped.
- **New user**
  - Reads the docs website.
  - Copies one example app.
  - Protects a list route and a detail route in about 5 minutes.
- **Maintainers (us)**
  - Benchmarks run every night.
  - If something gets 20% slower, the nightly job fails.

---

## 3. Features in this milestone

### M4-F15. Test helpers (main FSD F15)

- **M4-F15.1 `assert_allowed(policy, user, action, thing)`**
  - The test passes if the user may do the action.
  - If not, the test fails.
  - The failure message shows:
    - what we expected ("ALLOWED") and what we got ("DENIED");
    - who the user is (type and id only);
    - the full explanation: every rule, its result, the reason, and its file and line.
  - Example:
    - `assert_allowed(policy, alice, "edit", alices_post)` -> passes.
    - `assert_allowed(policy, bob, "edit", alices_post)` -> fails and prints the explanation.

- **M4-F15.2 `assert_denied(policy, user, action, thing)`**
  - The opposite of `assert_allowed`.
  - Passes if the user may **not** do the action.
  - On failure, it prints the same kind of explanation.

- **M4-F15.3 A table of cases: `PolicyCase` and `check_cases`**
  - You write many cases in one list:
    - `PolicyCase(alice, "edit", post, True)`
    - `PolicyCase(bob, "edit", post, False)`
    - `PolicyCase(None, "read", draft, False)` (None = not logged in)
  - `check_cases(policy, cases)` runs **all** of them.
    - It does not stop at the first failure.
    - At the end it shows **one** report with **every** failure.
  - A case can have a short label, like `label="bob cannot edit"`. The label shows in the report.
  - An empty list is an error. (A test that checks nothing must not pass.)
  - A case with an unknown action is shown as a failure in the report. The other cases still run.

- **M4-F15.4 Same-answer check on your data: `assert_filter_consistent`**
  - It proves that the Python check and the SQL filter give the same answer, on **your** test data.
  - You give it: the policy, a database session, a model, a list of users, and (if you want) a list of actions.
    - No list of actions = all actions of that model.
  - For each user and each action:
    - it finds the rows that Python says "yes" to;
    - it finds the rows that SQL says "yes" to;
    - the two lists must be the same.
  - If they differ, the test fails. It shows:
    - the action, the user, and the row id;
    - what Python said and what SQL said;
    - the explanation for that row.
  - It loads the related data that the rules need (for example the post's project). You do not have to.
    - For custom checks, it cannot know what they read. You can give extra load options.
  - It is safe:
    - it only **reads**; it never changes data;
    - more than 10,000 rows -> it stops with an error and asks for smaller test data;
    - zero rows -> the test fails (it proves nothing).
  - It works with a normal session.
    - For an async session, call it inside `session.run_sync(...)`. The docs show how.
  - Main use: prove that a `check=` function and its `sql=` twin agree.

- **M4-F15.5 Act as any user in API tests: `override_actor`**
  - `with override_actor(app, authz, alice): ...`
  - Inside the `with` block, every request runs as `alice`.
  - `override_actor(app, authz, None)` = act as a not-logged-in user.
  - After the block, the old setting comes back.
    - Also when the test fails inside the block.
    - Also when two blocks are inside each other.

- **M4-F15.6 Light to use**
  - `assert_allowed`, `assert_denied` and `check_cases` work with the core install only.
    - No SQLAlchemy and no FastAPI needed.
  - `assert_filter_consistent` needs the SQLAlchemy extra.
  - `override_actor` needs the FastAPI extra.

### M4-F16. Command line tool (main FSD F16)

- **M4-F16.1 How you point to your policy**
  - You write `module:name`, like `app.authz:policy`.
  - fastauthz looks in the **current folder** first (like `uvicorn` does).
  - Mistakes give a clear message and exit code `2`:
    - no `:` in the text;
    - the module cannot be found or crashes on import;
    - the name is not a fastauthz `Policy`.

- **M4-F16.2 `fastauthz check app.authz:policy`**
  - Checks all rules (the same checks as at app start, FA001-FA016).
  - Prints one line per problem:
    - file and line, problem code, level (error, warning, notice), message.
    - Errors first, then warnings, then notices.
  - Prints a list of rules that **skip the tenant scope** (`bypass_scope=True`), so a reviewer sees them.
  - Ends with a short count, like `Result: 1 error, 0 warnings, 2 notices. FAILED.`
  - `--strict`: warnings also fail. Good for CI.
  - Notices never fail, even with `--strict`.
  - `--format json`: the same result as JSON, for other tools.
  - Exit codes:
    - `0` = fine;
    - `1` = errors (or warnings with `--strict`);
    - `2` = could not run (bad input, import failed).
  - Example:
    ```
    app/authz.py:14  FA001  error    Rule 'Post.eidt#3' uses action 'eidt', which Post does not declare.
    Result: 1 error, 0 warnings, 0 notices. FAILED.
    ```

- **M4-F16.3 `fastauthz matrix app.authz:policy`**
  - Prints one table. One row per resource and action.
  - Each row says, in plain words:
    - who **may** do it (each allow rule);
    - who is **stopped** (each deny rule);
    - the tenant scope of that resource.
  - It clearly marks:
    - rules for not-logged-in users ("anyone");
    - rules that skip the scope ("bypasses scope");
    - custom checks, and if they have no SQL form;
    - actions that **nobody** can do.
  - Formats: `--format markdown` (default), `json`, `csv`.
  - `--output FILE` writes the table to a file.
  - The order is always the same (sorted). So a change in the table shows clearly in git.
  - Example (one row):
    ```
    | Post | edit | R.author_id == A.id (`authors-edit-own-posts`)<br>role admin (`admins-do-anything`, `*`) | - | none |
    ```

- **M4-F16.4 `fastauthz explain app.authz:policy --resource Post --action edit`**
  - Lists every rule for that resource and action, with its file and line.
  - Shows the full combined condition (allow part AND NOT deny part).
  - It does not need a user. It shows the rules, not one decision.
    - To see one decision for one user and one object, use `policy.explain(user, action, obj)` in Python.
  - Unknown resource or action -> clear message, exit code `2`.

- **M4-F16.5 `fastauthz version`**
  - Prints the fastauthz version.
  - Also prints the Python, SQLAlchemy and FastAPI versions (or "not installed").
  - Good for bug reports.

- **M4-F16.6 `python -m fastauthz ...`** works the same as `fastauthz ...`.

- **M4-F16.7 Light to use**
  - The tool needs no extra packages (it uses Python's own `argparse`).
  - `check` and `matrix` work with the core install only, for policies on plain Python classes.

### M4-F17. Example apps (main FSD F17.1)

- **Same for all three examples**
  - A small FastAPI app with a SQLite database.
  - Login is **fake**: the user id comes from a header `X-User-Id`.
    - This is only for the demo. It is **not** safe login. The code and docs say this loudly.
  - Each example has its own tests. CI runs them.
  - `fastauthz check --strict` passes on each example policy.
  - You can run each one: `uv run uvicorn examples.blog.app:app`.

- **M4-F17.1 `blog` - authors edit their own posts**
  - Anyone (even not logged in) can read published posts.
  - Authors can read, edit and delete their own posts (also drafts).
  - Editors can create posts.
  - Admins can do everything.
  - Nobody can delete a locked post. Not even an admin. (Deny wins.)
  - Shows: `query`, `load`, `require`, a deny rule, 404 for other people's posts.

- **M4-F17.2 `saas_multitenant` - companies never see each other**
  - Every rule stays inside the user's company (tenant scope).
  - Roles **per company**, from a members table: owner, editor, viewer.
  - Owners approve pending invoices. Nobody approves their own invoice.
  - Support staff can read invoices of every company (`bypass_scope=True`, shown in the matrix).
  - A public list of currencies, with no scope (`scope=None`).
  - Shows: tenant scope, per-company roles, `guard.check` on a new object, 403 when you try to create an invoice for another company.
  - Shows the "missing org_id" startup error from user story 7.2.

- **M4-F17.3 `hospital` - doctors see patients in their ward**
  - A doctor sees only patients in their own wards.
  - Junior doctors do not see VIP patients. Senior doctors do. (Deny rule.)
  - If we do not know if a doctor is senior, they do not see VIP patients. (Unsure = no.)
  - A discharged patient cannot be changed.
  - Chief doctors can see all patients and discharge them.
  - Shows: relationships (patient -> ward -> doctors), deny rules, role that includes another role.

### M4-F17D. Docs website (main FSD F17.2, F17.3)

- **M4-F17D.1 Pages**
  - Home: what fastauthz is, in one screen.
  - Get started: protect a list route and a detail route in 5 minutes.
  - Concepts: actor, resource, action, rule, scope, decision.
  - Rules reference: every operator, with the SQL it makes.
  - Roles.
  - Relationships (`R.project.org_id`, `.any()`, `.has()`).
  - FastAPI guide (`query`, `load`, `require`, `guard`, errors, OpenAPI).
  - Testing your policy (the helpers above).
  - Command line tool.
  - Security model, in simple words. Also what fastauthz **cannot** protect.
  - Recipes: owner only, many companies (SaaS), roles per company, soft delete, public and private.
  - FAQ.
  - A fair comparison with other tools. It also says when another tool is the better choice.
  - API reference, made from the code's docstrings.
  - Changelog.
- **M4-F17D.2 Every code example on the website runs in CI.** A broken example makes CI red.
- **M4-F17D.3 The site is built from `main` and published on GitHub Pages.**
- **M4-F17D.4 A broken link in the docs makes the build fail.**

### M4-N. Speed (main FSD N4-N6)

- **M4-N4** `policy.can()` on one object: less than 20 microseconds.
- **M4-N5** Building a SQL filter: less than 100 microseconds.
- **M4-N6** `load()` uses one query. `query()` adds no extra queries.
- We measure this with benchmarks, on a policy with 50 rules.
- The nightly job fails if a benchmark gets more than 20% slower than the last run.

---

## 4. Safety promises touched here

- The test helpers use the **same** engines as the app. They never change the rules or the truth rules.
- `assert_filter_consistent` is a second guard for the main promise: Python and SQL give the same answer.
- `fastauthz check --strict` in CI stops typos before they are merged.
- `fastauthz matrix` shows **every** rule. Nothing is hidden.
  - Rules that skip the scope are always marked.
  - Rules for not-logged-in users are always marked.
- The output of `explain`, `matrix` and the test helpers can show rule names and values.
  - It is for developers, tests and CI only.
  - It is never sent to end users. HTTP errors still show no rule names and no values.
- The command line tool **runs your code** when it imports your policy (like `uvicorn`).
  - Only run it on your own code.
  - Keep the policy in a module with no side effects (no database connection at import).
- `assert_filter_consistent` only reads. It never writes to the database.
- The fake login in the examples is **not** safe for real apps. The docs say so on every example page.

---

## 5. What is NOT in this milestone

- No new rule features. No new operators.
- No change to the truth rules (main TDD 6).
- No web page or UI to view the matrix.
- No "who can access this object?" search. (Later)
- No colors, no Typer, no Click, no Rich in the command line tool.
- `fastauthz check` checks the policy only. It does not start your app or check your routes.
  (Route checks run when the app starts, from M3.)
- No MySQL or MariaDB. (Later)
- No 1.0 release. (That is M5.)

---

## 6. Done when

- [ ] `assert_allowed`, `assert_denied`, `check_cases`, `assert_filter_consistent` and `override_actor` work and have tests.
- [ ] `fastauthz check`, `matrix`, `explain` and `version` work and have tests.
- [ ] The exit codes are 0, 1 and 2, as above.
- [ ] The three example apps work, and CI runs their tests.
- [ ] `fastauthz check --strict` passes on all three example policies.
- [ ] The docs website is live on GitHub Pages.
- [ ] Every code example in the docs runs in CI.
- [ ] Benchmarks meet the speed targets. The nightly job checks for slowdowns.
- [ ] A new person can protect a list route and a detail route in 5 minutes, using only the docs.
- [ ] `uv run pytest`, `uv run ruff check .` and `uv run pyright` pass.
- [ ] Version `0.2.0` is on PyPI.

---

## 7. Words used

| Word | Meaning |
|---|---|
| **Test helper** | A small function you call in your own tests, like `assert_allowed`. |
| **Case** | One line in a test table: user, action, thing, expected answer. |
| **Consistent** | The Python check and the SQL filter give the same answer. |
| **Override** | Replace something for a short time, then put it back. |
| **CLI** | Command line tool. You run it in a terminal: `fastauthz ...`. |
| **Exit code** | A number a program returns when it ends. `0` = fine. CI reads it. |
| **Strict** | Also fail on warnings, not only on errors. |
| **Matrix** | A table of resource x action -> who may do it. |
| **Notice** | A note for a reviewer. Never an error. |
| **Snapshot** | A saved copy of an output. A test checks the output did not change. |
| **Benchmark** | A test that measures speed. |
| **p50 / median** | The middle time of many runs. Half the runs are faster. |
| **Docstring** | The text at the top of a Python function that explains it. |

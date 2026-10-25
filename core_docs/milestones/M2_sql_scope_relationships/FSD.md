# M2 - Functional Spec (FSD)
## SQL filters, tenant scope, relationships, custom checks

**Milestone:** M2 (30 hours). **Main FSD:** F2.4, F7, F8, F9, F10, N2, N9, N12.
**How it is built:** `TDD.md` in this folder. **Steps:** `TASKS.md` in this folder.

> Very simple English on purpose.
> Each point has an ID like `M2-F7.2`. The number after `F` is the main FSD feature.
> This file adds detail to the main FSD. It never changes it.

---

## 1. Goal of this milestone

- 1.1 The rules from M1 can now **filter database lists**.
  - You get only the rows you may see.
- 1.2 Python and SQL give **the same answer** for the same data.
  - Random tests check this on SQLite and PostgreSQL.
- 1.3 One line keeps **each customer's data apart** (tenant scope).
- 1.4 Rules can **follow links** between tables (post -> project -> organisation).
- 1.5 You can write **your own check** when `R` and `A` are not enough.

---

## 2. What we get at the end

- 2.1 **A FastAPI / SQLAlchemy developer** can:
  - write `select(Post).where(policy.filter(user, "read", Post))`;
  - get back only allowed rows, from the database, in one query;
  - use it with normal and async sessions.
- 2.2 **A SaaS team** can:
  - write `Policy(scope=R.org_id == A.org_id)` once;
  - be sure no rule forgets "same organisation";
  - see the app refuse to start if a model has no `org_id`.
- 2.3 **A security reviewer** can:
  - trust that Python checks and SQL filters agree (random tests prove it);
  - see that no user value is ever pasted into SQL text.
- 2.4 **Still not here:** FastAPI dependencies (M3), CLI (M4).
  - In M2 you call `policy.filter()` yourself.

---

## 3. Features in this milestone

### M2-F7. Filter lists in SQL (main F7)
- M2-F7.1 `policy.filter(user, "read", Post)` gives a SQL condition.
  - Use it in `.where(...)`.
  - Example: `select(Post).where(policy.filter(alice, "read", Post))`.
- M2-F7.2 The database returns only rows where the rule is "yes".
  - A row with "no" is dropped.
  - A row with "unsure" is dropped too.
- M2-F7.3 Values always go to the database as **parameters**.
  - Example: `A.id` is 3. The SQL says `author_id = :param_1`. The `3` is sent apart.
  - A user name like `'; DROP TABLE posts` is just data. It can do no harm.
- M2-F7.4 Parts that need only the user are worked out first, in Python.
  - Admin with rule `roles=["admin"]` -> filter is just "true". No extra SQL.
  - Not logged in, rule needs login -> filter is just "false".
  - User has no `org_id` -> the scope part is "unsure" -> no rows.
- M2-F7.5 Works with `Session` and `AsyncSession`.
  - `filter()` only builds the condition. It does not run anything.
- M2-F7.6 Works on SQLite and PostgreSQL.
- M2-F7.7 Clear errors when you call `filter()` wrong:
  - resource not declared -> `UnknownResourceError`;
  - action not declared -> `UnknownActionError`;
  - a rule for this action has only a Python check -> `NotFilterableError`;
  - the class is not a SQLAlchemy model -> `NotFilterableError`.
- M2-F7.8 `filter()` needs the `sqlalchemy` extra.
  - Without it, you get a clear message: install `fastauthz[sqlalchemy]`.
  - The core still imports fine without it.
- M2-F7.9 Use the filter as it is. Do not put `~` (not) in front of it.
  - `~policy.filter(...)` is **not** "the rows I may not see".

### M2-F8. Tenant scope (main F8)
- M2-F8.1 One scope for the whole policy:
  - `Policy(scope=R.org_id == A.org_id)`.
  - Every **allow** rule now also needs "same organisation".
- M2-F8.2 A resource can change it:
  - its own scope: `policy.resource(Org, actions=["read"], scope=R.id == A.org_id)`;
  - no scope: `policy.resource(Country, actions=["read"], scope=None)`;
  - say nothing: it uses the policy scope.
- M2-F8.3 A resource without the scope column stops the app.
  - Example: `Report` has no `org_id`.
  - Error **FA008**: "Report has no column org_id used by the scope. Set scope=None or a custom scope."
- M2-F8.4 An allow rule can skip the scope with `bypass_scope=True`.
  - Example: support staff who help every customer.
- M2-F8.5 Deny rules are never mixed with the scope.
  - A deny rule works in every organisation.
- M2-F8.6 Not logged in = no organisation.
  - So a scoped rule never matches for them.
  - For public rows, add `bypass_scope=True`.
  - Warning **FA016** if a `who=ANYONE` rule would never work because of the scope.
- M2-F8.7 Notice **FA012** when a resource says `scope=None` but the policy has a scope.
  - So a reviewer sees which tables are not split by customer.

### M2-F9. Rules that follow relationships (main F9)
- M2-F9.1 Follow a "belongs to" link with a dot:
  - `R.project.org_id == A.org_id`
  - Means: "the post's project is in my organisation".
- M2-F9.2 Check a "has many" link with `.any()`:
  - `R.members.any(user_id=A.id)` -> "I am one of the members".
  - Inside `.any(...)`, `R` means **the member row**, not the post.
- M2-F9.3 Check a "belongs to" link with a condition, using `.has()`:
  - `R.owner.has(R.is_active.is_(True))`.
- M2-F9.4 No linked row = "no".
  - Post has no project -> `R.project.org_id == 5` is "no".
- M2-F9.5 Linked row exists but the value is empty (`NULL`) = "unsure".
  - Unsure in an allow rule -> no access.
  - Unsure in a deny rule -> still blocked.
- M2-F9.6 Max 3 links deep (main F9.4).
- M2-F9.7 Mistakes stop the app at start:
  - **FA003** the column or link does not exist on the model;
  - **FA004** a dot goes through a "has many" link (use `.any()`);
  - **FA005** more than 3 links deep.
- M2-F9.8 Python checks and SQL filters give the same answers for links too.

### M2-F10. Custom checks (main F10)
- M2-F10.1 For rules that `R` and `A` cannot say:
  - `policy.allow("publish", Post, check=lambda user, post: spam_score(post.body) < 0.5)`.
- M2-F10.2 Such a rule works for one object (`can`, `check`).
- M2-F10.3 Add `sql=` to make it work in filters too:
  - `policy.allow("read", Doc, check=is_shared_with, sql=shared_with_sql)`.
  - `sql` gets the user and the model. It returns a SQLAlchemy condition.
- M2-F10.4 No `sql=` -> `filter()` for that action gives `NotFilterableError`.
  - Notice **FA013** at start lists these actions.
  - This also counts for **deny** rules. A deny rule is never skipped.
- M2-F10.5 Your `sql` function crashes -> the answer is "unsure" -> no rows. The error is logged.
- M2-F10.6 `sql=` without `check=` is not allowed. You get an error at once.
- M2-F10.7 You must make sure `check` and `sql` agree.
  - M4 gives a helper to test it (`assert_filter_consistent`).

### M2-F2.4. Same answer, proved (main F2.4, N12)
- M2-F2.4.1 Random tests make random rules, random rows and random users.
  - Rows have empty (`NULL`) values.
  - Users can be `None`, or miss some fields, or be a dict.
- M2-F2.4.2 For each case: rows Python allows == rows SQL returns.
- M2-F2.4.3 Runs on SQLite every time. Runs on PostgreSQL with `-m postgres`.
- M2-F2.4.4 Any bug found is saved as a fixed example. It is tested forever.

---

## 4. Safety promises touched here

- 4.1 **Default deny** stays. No allow rule -> filter is "false".
- 4.2 **Deny wins** stays in SQL: `allow AND NOT deny`.
- 4.3 **Unsure means no** in SQL too:
  - `NULL` column -> unsure -> row dropped;
  - user field missing -> unsure -> no rows;
  - unsure **deny** -> row dropped (not shown).
- 4.4 **Values are never SQL text.** Only parameters.
- 4.5 **Scope is on by default** for allow rules. Skipping it must be written down (`bypass_scope=True`).
- 4.6 **A missing scope column stops the app.** It does not leak in production.
- 4.7 **A rule that cannot become SQL is never dropped.** You get an error instead.

---

## 5. What is NOT in this milestone

- 5.1 FastAPI dependencies `query`, `load`, `require`, `guard` (M3).
- 5.2 Decision records and the `on_decision` hook (M3).
- 5.3 The test helper `assert_filter_consistent` for users (M4).
- 5.4 The CLI `fastauthz check` / `matrix` (M4).
- 5.5 Benchmarks in `benchmarks/` (M4). M2 only keeps the code fast.
- 5.6 Trees of unlimited depth, field-level rules, MySQL (Later).
- 5.7 Filters on `aliased(Post)` or on joined copies of a table (not in v1).

---

## 6. Done when

- [ ] `policy.filter()` works for every operator, on SQLite and PostgreSQL.
- [ ] It works with sync and async sessions.
- [ ] Scope works: policy-wide, per resource, `None`, `bypass_scope`.
- [ ] FA003, FA004, FA005, FA008, FA012, FA013, FA016 each have a "yes" test and a "no" test.
- [ ] Links work: dots, `.any()`, `.has()`, up to 3 deep.
- [ ] Custom checks work: `check=`, `sql=`, `NotFilterableError`.
- [ ] A test proves no value appears as text in the SQL.
- [ ] SQL snapshot files exist for the example policies.
- [ ] The random "same answer" test passes 500 cases on SQLite and 2,000 on PostgreSQL.
- [ ] `uv run pytest`, `uv run pytest -m postgres`, `uv run ruff check .` and `uv run pyright` pass.
- [ ] Main TDD and FSD are updated where M2 found gaps (see TDD.md section 10).

---

## 7. Words used

| Word | Meaning |
|---|---|
| **Filter** | A SQL condition. Put it in `.where()` to keep only allowed rows. |
| **Bound parameter** | A value sent to the database apart from the SQL text. Safe. |
| **Fold** | Work out the user-only parts in Python before making SQL. |
| **Scope** | A condition added to every allow rule. Keeps customers apart. |
| **`bypass_scope`** | An allow rule that skips the scope. Must be written on purpose. |
| **"Belongs to" link** | Many-to-one. A post has one project. Follow it with a dot. |
| **"Has many" link** | One-to-many or many-to-many. A project has many members. Use `.any()`. |
| **`EXISTS`** | SQL for "is there at least one linked row that matches". |
| **Custom check** | Your own Python function as a rule (`check=`). |
| **SQL twin** | The `sql=` function that says the same thing as `check=`, in SQL. |
| **Property test** | A test that makes many random cases and checks one rule holds for all. |
| **Snapshot** | A saved copy of the SQL text. A change shows up in review. |

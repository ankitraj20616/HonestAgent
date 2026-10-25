# M1 - The core: Functional Spec (FSD)

**Milestone:** M1 (about 25 hours)
**Main docs:** `../../FUNCTIONAL_SPECIFICATIONS.md` (F1-F6), `../../TDD-tech-design-doc.md` (sections 5-8, 10.2, 11)
**How it is built:** `TDD.md` in this folder. **Steps:** `TASKS.md` in this folder.

> This file says WHAT M1 gives. Very simple English on purpose.
> IDs like `M1-F1.2` belong to this milestone. The main F-number is shown next to each one.

---

## 1. Goal of this milestone

- Rules work in plain Python.
- No database is needed. No FastAPI is needed.
- Answers are safe. When we are not sure, the answer is "no".
- Mistakes in rules are found when the policy is locked, not later.
- A developer can ask "why yes?" or "why no?" and get a clear answer.

---

## 2. What we get at the end

- **Who gets something:**
  - The FastAPI developer. They can write rules and test them now, before SQL and FastAPI support exist.
  - The project itself. M2 (SQL) and M3 (FastAPI) are built on top of this core.
- **What they can do:**
  - Make a policy: `policy = Policy()`.
  - Say which things exist and what can be done to them: `policy.resource(Post, actions=["read", "edit"])`.
  - Write allow and deny rules with `R` and `A`.
  - Ask `policy.can(alice, "edit", post)` and get `True` or `False`.
  - Ask `policy.check(alice, "edit", post)`. If the answer is no, it raises `Denied`.
  - Ask `policy.explain(alice, "edit", post)`. They see every rule and its result.
- **Small example that must work at the end of M1:**
  ```python
  from fastauthz import Policy, R, A

  policy = Policy()
  policy.roles({"admin": [], "viewer": []})
  policy.resource(Post, actions=["read", "edit", "delete"])
  policy.allow("read", Post, roles=["viewer"])
  policy.allow(["edit", "delete"], Post, when=R.author_id == A.id)
  policy.allow("*", Post, roles=["admin"])
  policy.deny("delete", Post, when=R.locked.is_(True))

  policy.can(alice, "edit", alices_post)    # True
  policy.can(alice, "edit", bobs_post)      # False
  print(policy.explain(alice, "edit", bobs_post))
  ```

---

## 3. Features in this milestone

### M1-F1. Write rules in Python (main F1)
- M1-F1.1 Make one policy.
  - `policy = Policy()`
  - You can also give a scope here: `Policy(scope=R.org_id == A.org_id)`.
    - In M1 the scope is stored and used in Python checks.
    - SQL use of the scope comes in M2.
- M1-F1.2 Say each resource and its actions.
  - `policy.resource(Post, actions=["read", "edit"])`
  - An action is a short word, like `"read"`.
  - `"*"` is not a real action name. You cannot declare it.
- M1-F1.3 Add allow rules.
  - `policy.allow("read", Post, when=R.published.is_(True))`
  - `policy.allow(["edit", "delete"], Post, when=R.author_id == A.id)`
- M1-F1.4 Add deny rules.
  - `policy.deny("delete", Post, when=R.locked.is_(True))`
- M1-F1.5 The action can be:
  - one word: `"edit"`;
  - a list: `["edit", "delete"]`;
  - all actions: `"*"`.
- M1-F1.6 Conditions you can write:
  - compare: `R.score > 3`, `R.author_id == A.id`, `R.status != "draft"`;
  - in a list: `R.status.in_(["open", "closed"])`, `R.status.not_in(["spam"])`;
  - in the actor's list: `R.org_id.in_(A.org_ids)`;
  - empty or yes/no: `R.deleted_at.is_(None)`, `R.published.is_(True)`;
  - join: `&` (and), `|` (or), `~` (not).
- M1-F1.7 Follow links to other objects.
  - "belongs to" with a dot: `R.project.org_id == A.org_id`.
  - "has many" with `.any()`: `R.members.any(user_id=A.id)`.
  - "belongs to, with a test" with `.has()`: `R.owner.has(R.is_active.is_(True))`.
  - Inside `.any()` and `.has()`, `R` means the linked object.
  - Max 3 links deep.
- M1-F1.8 Clear errors when a rule is written wrong. The error comes right away, on the line you wrote:
  - `and` / `or` / `not` instead of `&` / `|` / `~`;
  - a name that starts with `_`, like `R._secret`;
  - a value of a strange type, like a whole object;
  - a compare with no `R` and no `A` at all;
  - `when=R.published` (a value, not a test). Write `R.published.is_(True)`.
- M1-F1.9 Who a rule is for.
  - Allow rules are for logged-in users by default.
  - `who=ANYONE` makes an allow rule work for not-logged-in users too.
  - Deny rules are for everyone by default. So a deny also stops not-logged-in users.
- M1-F1.10 Rule names.
  - You can give a name: `name="authors-edit-own-posts"`.
  - If you do not, fastauthz makes one, like `Post.edit#2`.
  - Two rules cannot have the same name.
- M1-F1.11 fastauthz remembers the file and line of each rule.
  - Example: `authz.py:21`.
  - It is shown in errors and in explain.

### M1-F2. Safe answers (main F2)
- M1-F2.1 Default deny. No allow rule says yes -> the answer is no.
- M1-F2.2 Deny wins. A deny rule says yes -> the answer is no.
- M1-F2.3 Unsure means no. The answer is no when:
  - the user is not logged in (`None`) and the rule needs the user;
  - the user has no such field;
  - the value is empty (`None`);
  - a custom check crashes;
  - a linked object was not loaded from the database.
- M1-F2.4 An unsure deny also blocks. This is on purpose.
- M1-F2.5 Every answer is one of three: TRUE, FALSE, UNKNOWN.
  - Only TRUE gives access.
  - This is the same way SQL works. So M2 can give the same answers in SQL.

### M1-F3. Roles (main F3)
- M1-F3.1 A rule can need a role: `policy.allow("delete", Post, roles=["admin"])`.
- M1-F3.2 Roles can include other roles.
  - `policy.roles({"admin": ["editor"], "editor": ["viewer"]})`
  - An admin can do all that an editor and a viewer can do.
- M1-F3.3 Every role used in a rule must be listed in `policy.roles(...)`.
  - A role with no included roles is written like this: `{"viewer": []}`.
- M1-F3.4 By default, roles come from `user.roles`.
  - You can change it: `Policy(actor_roles=lambda user: user.role_names)`.
- M1-F3.5 A role loop (admin -> editor -> admin) is an error.
- M1-F3.6 A role used in a rule but never listed (typo like `"admn"`) is an error.

### M1-F4. Check one object (main F4)
- M1-F4.1 `policy.can(user, "edit", post)` gives `True` or `False`.
- M1-F4.2 `policy.check(user, "edit", post)` does nothing if allowed. If not allowed, it raises `Denied`.
- M1-F4.3 It works with any Python object, and with dicts.
- M1-F4.4 It never loads data from the database by itself.
  - Not loaded -> the answer is no, and a warning is logged.
- M1-F4.5 Asking for an action that was never declared is an error (`UnknownActionError`).
- M1-F4.6 Asking about an object whose type was never declared is an error (`UnknownResourceError`).

### M1-F5. Startup checks (main F5)
- M1-F5.1 `policy.validate()` lists all problems. It does not stop anything.
- M1-F5.2 `policy.freeze()` checks all rules.
  - Any error -> it raises `PolicyError` with **all** errors at once.
  - Each problem shows a code (like `FA001`), what is wrong, and the file and line.
- M1-F5.3 After `freeze()`, the policy is locked. Adding rules raises `PolicyFrozenError`.
- M1-F5.4 If you call `can()` first, fastauthz calls `freeze()` for you.
- M1-F5.5 Problems found in M1 (they need no database):
  - unknown action (FA001), unknown resource (FA002);
  - too many links deep (FA005);
  - role loop (FA006), unknown role (FA007);
  - "anyone can do this" (FA009), "nobody can do this" (FA010);
  - "this rule can never match" (FA011);
  - "this resource has no scope" (FA012), "this rule cannot become SQL" (FA013);
  - "missing parentheses?" (FA014), "you wrote `== None`" (FA015);
  - "this public rule can never work because of the scope" (FA016).
- M1-F5.6 Problems that wait for M2 (they need SQLAlchemy models):
  - column not on the model (FA003);
  - dot through a "has many" link (FA004);
  - scope column missing on the model (FA008).

### M1-F6. Explain a decision (main F6)
- M1-F6.1 `policy.explain(user, "edit", post)` shows every rule for that action.
- M1-F6.2 For each rule it shows:
  - the name, allow or deny, and the result (TRUE / FALSE / UNKNOWN);
  - why, with the real values: `R.author_id (7) == A.id (3) -> FALSE`;
  - the file and line.
- M1-F6.3 `print(explanation)` shows a neat table.
- M1-F6.4 Explain always gives the same yes/no as `can()`.
- M1-F6.5 It is for developers only. It shows real values. Never show it to end users.

### M1-F7. Clear errors (main TDD 11)
- M1-F7.1 All fastauthz errors come from one base class: `FastAuthzError`.
- M1-F7.2 `Denied` holds a small decision record. It never holds the explanation or values.
- M1-F7.3 Every error message says what is wrong and how to fix it.

### M1-F8. The core needs nothing else (main N10)
- M1-F8.1 The core works with only Python itself. No other packages.
- M1-F8.2 A test proves this. It runs with SQLAlchemy and FastAPI blocked.

---

## 4. Safety promises touched here

- Default deny (F2.1). No rule -> no.
- Deny wins (F2.2).
- Unsure means no (F2.3): missing user, missing field, `None` value, crash, not loaded.
- `and` / `or` / `not` in a rule is an error, not a silent hole.
- The policy is locked after `freeze()`. No one can add a rule while the app runs.
- `Denied` and its message never show rule names or data values.
- The truth rules here are the same as SQL. M2 must keep them.

---

## 5. What is NOT in this milestone

- No SQL. `policy.filter()` comes in M2.
- No checks that need the database model (FA003, FA004, FA008). They come in M2.
- No FastAPI. `FastAuthz`, `load()`, `query()`, `require()`, `guard` come in M3.
- No decision log or `on_decision` callback. They come in M3.
- No CLI. It comes in M4.
- No test helpers like `assert_allowed`. They come in M4.
- Nothing from the "Later" list (field permissions, deep trees, rules in a database, ...).

---

## 6. Done when

- [ ] A small script can make a blog policy, call `can()` and print `explain()`.
- [ ] Every condition type from M1-F1.6 and M1-F1.7 works on plain objects and dicts.
- [ ] Every safe-answer case in M1-F2.3 gives "no", with a test.
- [ ] Every problem code in M1-F5.5 has one test that finds it and one that does not.
- [ ] `freeze()` shows all errors at once and then locks the policy.
- [ ] `explain()` always agrees with `can()`.
- [ ] The core imports with SQLAlchemy and FastAPI blocked.
- [ ] 100% branch test coverage on the core files.
- [ ] `uv run pytest`, `uv run ruff check .` and `uv run pyright` pass.

---

## 7. Words used

| Word | Meaning |
|---|---|
| **Tree** | How fastauthz stores a rule. `R.a == A.b` is a small tree with one "compare" in it. |
| **Node** | One piece of the tree, like "compare" or "and". |
| **TRUE / FALSE / UNKNOWN** | The three possible results. Only TRUE gives access. |
| **UNKNOWN** | "We cannot tell." For example, the value is empty. It counts as no. |
| **MISSING** | A value that does not exist at all. Example: a not-logged-in user has no `id`. |
| **NO_ROW** | A link that points to nothing. Example: a post with no project. A test through it is FALSE. |
| **Freeze** | Check the policy and lock it. |
| **Source** | The file and line where a rule was written, like `authz.py:21`. |
| **Problem code** | A short code for one kind of mistake, like `FA001`. |
| **Custom check** | Your own Python function used as a rule: `check=my_function`. |

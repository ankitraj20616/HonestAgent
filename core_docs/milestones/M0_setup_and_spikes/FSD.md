# M0 - Functional Spec (FSD)
## Setup and quick tries (spikes)

**Milestone:** M0 (about 10 hours)
**Main docs:** `../../FUNCTIONAL_SPECIFICATIONS.md` (what), `../../TDD-tech-design-doc.md` (how), `../../TASKS.md` (plan).
**Design for this milestone:** `TDD.md`. **Steps:** `TASKS.md`.

> Very simple English. Short points.
> M0 builds no user feature yet. It builds the base, and it tries the 3 hardest ideas first.
> IDs look like `M0-F1.2`. They point back to the main FSD where it makes sense.

---

## 1. Goal of this milestone

- Make a clean, empty Python project called `fastauthz`.
- Make the checks run on every push: lint, types, tests.
- Try the 3 risky ideas in small throw-away code ("spikes").
  - Can a rule become SQL?
  - Do Python and SQL give the same answer?
  - Can a FastAPI dependency load and check in one query?
- Learn the facts we need, and write them down.
- Pick the oldest FastAPI version we will support.

---

## 2. What we get at the end

- **The builder (us):**
  - can run `uv sync --all-extras` and get a working setup;
  - can run `uv run pytest`, `uv run ruff check .`, `uv run pyright`, and all pass;
  - gets a red mark in GitHub if a push breaks something.
- **Future contributors:**
  - get the same tools and settings as us, from one file (`pyproject.toml`);
  - get ruff checks before each commit (pre-commit).
- **The design:**
  - is proven, or fixed early, before we spend 100+ hours on it;
  - has a report (`core_docs/reports/M0_spikes.md`) with real numbers and facts.
- **Users of the library:**
  - nothing to use yet. Nothing goes to PyPI in M0.

---

## 3. Features in this milestone

### M0-F1. A clean project (setup)
Main docs: TDD 3, TDD 18, TECH_STACK.
- M0-F1.1 One package named `fastauthz`.
  - Code lives in `src/fastauthz/`.
  - Example: `import fastauthz` works after `uv sync`.
- M0-F1.2 The package has a version.
  - Example: `fastauthz.__version__` gives `"0.0.0"`.
- M0-F1.3 The package says "I have types" (`py.typed` file).
- M0-F1.4 The core needs nothing extra to install.
  - `pip install fastauthz` installs no other packages.
- M0-F1.5 Extras exist, but are empty of our code for now:
  - `fastauthz[sqlalchemy]` adds SQLAlchemy.
  - `fastauthz[fastapi]` adds FastAPI.
  - `fastauthz[standard]` adds both.
- M0-F1.6 One place for settings: `config.py`.
  - In M0 the file is there, but empty.
  - Later example: `config.MAX_RELATION_DEPTH` is `3` (added in M1).

### M0-F2. Checks on every change
Main docs: TDD 14.5, TDD 15.2.
- M0-F2.1 Lint with ruff. Format check with ruff.
- M0-F2.2 Type check with pyright, strict mode.
- M0-F2.3 Tests with pytest.
  - One first test: "the package imports".
  - One test: "the core imports even when SQLAlchemy and FastAPI are not there".
- M0-F2.4 The same checks run in GitHub Actions on:
  - Python 3.11 (oldest we support);
  - Python 3.15 (newest).
- M0-F2.5 CI also has a PostgreSQL database for tests that need it.
- M0-F2.6 pre-commit runs ruff and small file checks before each commit.
  - Example: a file with trailing spaces is fixed before commit.

### M0-F3. Try 1: rule -> SQL
Main docs: F7, F9, TDD 9.
- M0-F3.1 Build a tiny rule tree for `R.owner_id == A.id`.
- M0-F3.2 Turn it into a SQL `WHERE`.
  - Example: actor id 3 -> `WHERE items.owner_id = :p1`, with `p1 = 3`.
- M0-F3.3 Run it on SQLite and on PostgreSQL.
- M0-F3.4 Run it with a normal session and with an async session.
- M0-F3.5 Try one "belongs to" link (`has()`).
  - Example: `R.group.org_id == A.org_id`.
- M0-F3.6 Try one "has many" link (`any()`).
  - Example: `R.tags.any(name="red")`.
- M0-F3.7 The value never shows up as text in the SQL.

### M0-F4. Try 2: same answer
Main docs: F2.4, TDD 6, TDD 14.3.
- M0-F4.1 Make 1,000 random rows. Some columns are empty (`NULL`).
- M0-F4.2 For each row, ask Python: "does the rule match?"
- M0-F4.3 Ask the database the same question with the SQL filter.
- M0-F4.4 Both must give the same set of rows.
  - Also with `NOT` around the rule.
  - Also with a missing actor (`None`).
- M0-F4.5 If they differ, write down the row and why.

### M0-F5. Try 3: FastAPI
Main docs: F11.3, F12, F13, TDD 12.
- M0-F5.1 Make a small dependency like `authz.load(Post, "edit")`.
- M0-F5.2 It reads `post_id` from the URL.
- M0-F5.3 It loads the post and checks permission in **one** query.
  - Allowed -> the route gets the post.
  - Not allowed or not found -> 404.
- M0-F5.4 Swagger shows the permission for that route.
  - Example: the route text says "**Permission:** `edit` on `Post`".
  - The OpenAPI file has `x-fastauthz`.
- M0-F5.5 Find how to list all routes of an app.
  - On FastAPI 0.115 (old).
  - On the newest FastAPI (routes became a tree in 0.137).
  - Also routes inside sub-routers.

### M0-F6. A written report
- M0-F6.1 One file: `core_docs/reports/M0_spikes.md`.
- M0-F6.2 For each try: what we did, what worked, what failed, numbers.
- M0-F6.3 If a try shows the design is wrong:
  - change the main TDD;
  - write a decision file (ADR) in `core_docs/decisions/`.
- M0-F6.4 Write the oldest FastAPI version we support in `TECH_STACK.md`.
- M0-F6.5 At the end, delete the `spikes/` folder. The report stays.

---

## 4. Safety promises touched here

- **Values never become SQL text.** (N2, F7.3)
  - Try 1 checks the SQL text has no actor values in it.
- **Python and SQL give the same answer.** (F2.4)
  - Try 2 checks this for the first time, with `NULL`s.
- **Unsure means no.** (F2.3)
  - Try 2 checks: empty column -> no, missing actor -> no, also under `NOT`.
- **404 hides what exists.** (F12.1)
  - Try 3 checks: "not found" and "not allowed" look the same.
- **No surprises with FastAPI upgrades.** (TDD 2.8)
  - Try 3 checks that route walking works on old and new FastAPI.

---

## 5. What is NOT in this milestone

- No real `R`, `A`, `Policy` code in `src/`. Spikes only. (That is M1.)
- No real SQL compiler in `src/`. (That is M2.)
- No real FastAPI layer in `src/`. (That is M3.)
- No release to PyPI. (First release is `0.1.0` in M3.)
- No docs website. (M4.)
- No benchmarks, no mutation tests, no nightly job. (M4, M5.)
- No "Later" features (FSD section 8).
- Spike code is not kept. It is not reviewed like real code.

---

## 6. Done when

- [ ] `uv sync --all-extras` works on a fresh clone.
- [ ] `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run pyright` pass.
- [ ] GitHub Actions is green on Python 3.11 and 3.15.
- [ ] pre-commit is set up and works.
- [ ] Try 1 works on SQLite and PostgreSQL, sync and async, with `has()` and `any()`.
- [ ] Try 2 gives the same rows in Python and SQL for 1,000 random rows.
- [ ] Try 3 loads and checks in one query, shows the permission in Swagger, and lists routes on FastAPI 0.115 and the newest.
- [ ] The oldest FastAPI version is written in `TECH_STACK.md`.
- [ ] `core_docs/reports/M0_spikes.md` is written.
- [ ] Any design change is in the main TDD, with an ADR.
- [ ] `spikes/` is deleted.

---

## 7. Words used

| Word | Meaning |
|---|---|
| **Spike** ("quick try") | Small throw-away code to learn if an idea works. |
| **CI** | Checks that GitHub runs by itself on every push. |
| **Lint** | A tool that finds style problems and small bugs in code. |
| **Type check** | A tool that checks types (like `int`, `str`) match. |
| **pre-commit** | A tool that runs checks before each `git commit`. |
| **Extra** | An optional part of a package, like `fastauthz[fastapi]`. |
| **Floor version** | The oldest version of a library we promise to support. |
| **Sync / async session** | Two ways to talk to the database in SQLAlchemy. Async uses `await`. |
| **`has()` / `any()`** | SQLAlchemy ways to check a linked row ("belongs to" / "has many"). |
| **Bound parameter** | A value sent to the database next to the SQL, not inside the SQL text. Safe. |
| **Route tree** | Since FastAPI 0.137, routes are kept in a tree, not a flat list. |
| **ADR** | "Architecture Decision Record". A short file that says what we decided and why. |

# M5 - Security review and 1.0
## Functional spec (what we get)

> Very simple English on purpose.
> This file adds detail to the main FSD (`../../FUNCTIONAL_SPECIFICATIONS.md`). It never changes it.
> IDs like `M5-F2.1` belong to this milestone. They point at the main FSD (N-numbers in FSD 6).
> How it is built: `TDD.md` in this folder. The steps: `TASKS.md` in this folder.

---

## 1. Goal of this milestone

- Make fastauthz safe enough to use in real apps (production).
- Prove every safety promise with a test. Not only with words.
- Let outside people try to break it. Fix what they find.
- Make releases that people can trust: built by CI, with proof of where they came from.
- Release version `1.0.0`. After that, nothing breaks without a new major version.

---

## 2. What we get at the end

- **App developers** (main users)
  - can use fastauthz in production;
  - know that `1.0.x` and `1.x` will not break their code;
  - can check that the package on PyPI was really built from our GitHub code.
- **Security reviewers and auditors**
  - get one test for each risk in our risk list (threat model);
  - can read a short security page and the test names, and see what is covered.
- **Tech leads**
  - see a green nightly job. It tests many Python, FastAPI and SQLAlchemy versions.
  - see an OpenSSF Scorecard badge in the README.
- **Maintainers (us)**
  - get an issue opened by a robot when the nightly job fails;
  - get Dependabot pull requests for tool updates;
  - have a release checklist, so a release is boring and safe.

---

## 3. Outcomes in this milestone

### M5-F1. One test for each risk (main FSD N1, N2; main TDD 17.1)
- M5-F1.1 Our risk list (TDD 17.1) has 14 rows. Each row gets an ID: `TM01` to `TM14`.
- M5-F1.2 Each row gets at least one test. The test name starts with the ID.
  - Example: `test_tm03_null_column_is_denied_in_python_and_sql`.
- M5-F1.3 Some risks cannot be fully tested.
  - Example: a developer writes a raw `select(Post)` by hand, without our filter. We cannot see that.
  - These risks are written in the docs, on the security page. A test checks the page says it.
- M5-F1.4 A test checks that every row has a test. If someone adds a new row, the suite fails until a test exists.
- M5-F1.5 Tests run on SQLite always, and on PostgreSQL in CI.

### M5-F2. Tests that catch bugs for real (main FSD N11, N12)
- M5-F2.1 We use **mutation testing** on the three most important files: `truth.py`, `evaluate.py`, `sql.py`.
  - A tool makes small bugs on purpose. Example: it changes `and` to `or`.
  - Our tests must fail. If they fail, the bug is "killed".
- M5-F2.2 At least 90 out of 100 bugs must be killed.
- M5-F2.3 Every bug that lives ("survivor") is looked at by a person.
  - Either we add a test.
  - Or we write down why the change makes no difference (an "equivalent" change).
- M5-F2.4 Coverage gates stay: 100% for the core, at least 95% for the whole package.

### M5-F3. A nightly safety net (main FSD N7, N8, N12; main TDD 15.2)
- M5-F3.1 Every night, CI runs:
  - all Python versions: 3.11, 3.12, 3.13, 3.14, 3.15;
  - free-threaded Python 3.14t (it may fail without making the whole job red);
  - the newest test (pre-release) versions of FastAPI;
  - the newest SQLAlchemy code (main branch);
  - the long random test: 20,000 examples;
  - mutation testing;
  - speed tests (benchmarks).
- M5-F3.2 If the nightly job fails, a robot opens a GitHub issue.
  - If an issue is already open, it adds a comment instead. No spam.
- M5-F3.3 This way, a new FastAPI release that breaks us is found before our users find it.

### M5-F4. Releases you can trust (main FSD N13)
- M5-F4.1 Only CI can publish to PyPI. No person uploads by hand.
- M5-F4.2 CI uses **Trusted Publishing**. No PyPI password or token is saved anywhere.
- M5-F4.3 Each release has **attestations**: signed proof that says "this file was built by this GitHub workflow, from this commit".
- M5-F4.4 A release starts only from a version tag like `v1.0.0`.
  - Only maintainers can make these tags.
  - A maintainer must click "approve" before the upload to PyPI.
- M5-F4.5 Every GitHub Action we use is pinned to an exact commit (a long SHA), not a name like `v4`.
  - A test checks this.
- M5-F4.6 Dependabot opens pull requests when our tools or Actions have new versions.
  - It does not change the lowest versions we support for users.
- M5-F4.7 The OpenSSF Scorecard runs every week. Its badge is in the README.

### M5-F5. A stable public API (main FSD N14; main TDD 15.3)
- M5-F5.1 We write down the exact list of public names. Example: `Policy`, `R`, `A`, `FastAuthz`.
- M5-F5.2 Everything else is private. Private names start with `_`, or live in modules the docs call "internal".
- M5-F5.3 A test keeps a snapshot of the public API (names and signatures).
  - If a pull request changes the public API, this test fails.
  - The author must update the snapshot **and** the changelog. So a change is never by accident.
- M5-F5.4 Type tests (pyright) check the types users see.
  - Example: `policy.can(...)` gives a `bool`.
- M5-F5.5 After `1.0.0`:
  - no breaking change without a new major version (`2.0.0`);
  - an old feature first warns (`FastAuthzDeprecationWarning`) for at least two minor releases;
  - only then it can be removed.

### M5-F6. Outside review (main TDD 17)
- M5-F6.1 We ask 2 or 3 outside developers to read the design and try to break it.
- M5-F6.2 We give them a short brief: what to read, what to try, how to report.
- M5-F6.3 We give them a "try to break it" list.
  - Example: "Make the Python check say no but the SQL filter say yes."
  - Example: "Get a value into the SQL text."
- M5-F6.4 Security problems are reported privately (see `SECURITY.md`).
- M5-F6.5 Every finding gets fixed, or gets a clear written reason why not.
- M5-F6.6 Every real bug they find gets a test, so it never comes back.

### M5-F7. Release 1.0.0 and tell people (main TASKS M5)
- M5-F7.1 First a release candidate (`1.0.0rc1`). People can try it.
- M5-F7.2 Then `1.0.0`, from CI, with attestations.
- M5-F7.3 The changelog lists every change since the first release.
- M5-F7.4 GitHub release notes say what it does, what it does not do, and how to upgrade from `0.x`.
- M5-F7.5 Short, honest launch posts:
  - FastAPI GitHub Discussions ("Show and tell");
  - r/FastAPI;
  - r/Python;
  - Hacker News ("Show HN").
- M5-F7.6 The posts are honest:
  - no hype words;
  - they say what fastauthz cannot do;
  - they say when another tool (like Cerbos) is a better choice.

---

## 4. Safety promises checked here

- **Default deny.** No rule says yes -> the answer is no. (TM01, TM03)
- **Deny wins.** A deny rule beats every allow rule. (TM08, TM09)
- **Unsure means no.** Empty values, missing fields, no user, crashes -> no. (TM03, TM09, TM10)
- **Same answer.** The Python check and the SQL filter agree. (TM03, the long random test)
- **No SQL injection.** Values never go into SQL as text. (TM06)
- **No hints in errors.** Errors never show rule names or data. (TM07, TM12)
- **No personal data in logs.** Logs hold ids only. (TM13)
- **Customers stay apart.** A tenant scope cannot be skipped by accident. (TM08)
- **Mistakes show at start.** Typos stop the app. (TM02, TM04, TM05, TM11)
- **Rules cannot change while the app runs.** (TM14)
- **Fast reply to reports.** We reply to a private security report in 3 days. We fix or plan a fix for a high-severity problem in 14 days. (`SECURITY.md`)

---

## 5. What is NOT in this milestone

- No new features. M5 only tests, hardens and releases.
- No "Later" items (see main FSD 8). Examples:
  - no hiding of single fields;
  - no unlimited-depth trees;
  - no MySQL in CI;
  - no Litestar or Django Ninja adapters.
- No paid security audit. The review is by volunteers.
- No promise of a perfect Scorecard score. We aim high, but some checks need many maintainers.

---

## 6. Done when

- [ ] Every risk row `TM01`-`TM14` has a test or a docs note checked by a test.
- [ ] Mutation testing kills at least 90% on `truth.py`, `evaluate.py`, `sql.py`.
- [ ] The nightly job runs every night and opens an issue when it fails.
- [ ] Every GitHub Action is pinned by SHA. Dependabot is on.
- [ ] The Scorecard badge is in the README.
- [ ] The public API list is written, and its snapshot test passes.
- [ ] 2-3 outside people reviewed it. Their findings are fixed or answered.
- [ ] `1.0.0` is on PyPI, built by CI, with attestations.
- [ ] No open high-severity bugs.
- [ ] Docs, FSD and TDD match the code.
- [ ] Launch posts are out.

---

## 7. Words used

| Word | Meaning |
|---|---|
| **Threat model** | A list of things that can go wrong, and what stops each one. Ours is in main TDD 17.1. |
| **Mutation testing** | A tool adds small bugs to the code on purpose. Good tests catch them. |
| **Killed / survived** | A "killed" bug made a test fail (good). A "survived" bug did not (a test is missing). |
| **Equivalent mutant** | A change that does not change behavior. No test can catch it. We write it down. |
| **Nightly job** | CI tests that run every night, not on every pull request. They are long. |
| **Pre-release** | A test version of a library, before the real release (like `0.140.0rc1`). |
| **Free-threaded Python** | A Python build without the GIL (`3.14t`). Many threads run at the same time. |
| **SemVer** | Version numbers like `1.4.2` = major.minor.patch. A new major means something may break. |
| **Deprecation** | A warning that a feature will be removed later. |
| **Public API** | The names users are allowed to import and use. |
| **Snapshot test** | A test that saves output in a file, and fails if the output changes. |
| **Trusted Publishing** | PyPI trusts our GitHub workflow directly. No password or token is saved. |
| **Attestation** | Signed proof of where and how a file was built. |
| **SHA pin** | Using a GitHub Action by its exact commit id, so nobody can change it under us. |
| **Dependabot** | A GitHub robot that opens pull requests to update tools. |
| **OpenSSF Scorecard** | A free tool that scores how safe a project's setup is (pins, reviews, policy...). |
| **Release candidate (rc)** | A version for testing just before the real release (`1.0.0rc1`). |

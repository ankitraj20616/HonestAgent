# Security Policy

fastauthz is an authorization library. A bug in it can let people see or change data they
should not. We take reports seriously.

## Supported versions

fastauthz is in the design stage. No version is released yet.
After 1.0, the latest minor release gets security fixes.

| Version | Supported |
|---|---|
| not released yet | - |

## Report a problem privately

**Please do not open a public issue for a security problem.**

Use GitHub's private reporting:
1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability**.
3. Tell us:
   - what the problem is;
   - a small policy and data example that shows it;
   - the versions of fastauthz, FastAPI, SQLAlchemy and the database.

## What happens next

- We reply within **3 days**.
- For high-severity problems, we share a fix or a plan within **14 days**.
- We credit you in the release notes, if you want.
- We publish a GitHub Security Advisory when the fix is released.

## What counts as a security problem

Examples:
- A rule gives access when the docs say it must not (for example a `NULL` value or a missing
  actor attribute turns into "allowed").
- The Python check and the SQL filter give different answers for the same data.
- Values from users end up as SQL text instead of bound parameters.
- Error messages or logs leak rule details or private data.
- A tenant scope can be skipped without `bypass_scope=True`.

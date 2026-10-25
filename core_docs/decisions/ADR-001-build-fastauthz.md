# ADR-001: Build fastauthz, an in-process authorization library for FastAPI

**Status:** Accepted
**Date:** 2026-10-25
**Replaces:** the HonestAgent plan (test-integrity gate) and, before it, Saarthi. Both were dropped
before any code was written. Their docs are still in git history (`git log` before this commit).

---

## Context

### What we wanted
An open-source Python library that:
1. solves a real, repeated pain for FastAPI developers;
2. has little or no good competition;
3. needs no paid service or AI subscription to build or to run;
4. teaches deep Python (not only glue code).

### How we chose
On 2026-10-25 we looked at three kinds of evidence:
- **FastAPI's own sources:** all 6,093 fastapi/fastapi GitHub Discussions (via GraphQL), the top
  issues and PRs, the roadmap (issue #10370), the docs, and `full-stack-fastapi-template`.
- **Library health:** about 100 FastAPI ecosystem packages, checked on PyPI (last release) and
  GitHub (stars, last push, archived, "maintenance mode" notes).
- **Community:** 2,392 r/FastAPI posts (Jan 2025 - Oct 2026), Hacker News, Stack Overflow, and
  the 12 most-starred FastAPI starter templates.

Then for the best ideas we checked competitors by hand on GitHub and PyPI.

### What we found about authorization
**Demand is high.**
- "Authorization" is the most discussed topic in fastapi/fastapi Discussions (about 296 threads).
- About 74 r/FastAPI posts are about permissions, RBAC or ABAC. One quote: "RBAC is easy. ABAC is tricky."
- Teams ask for "Org -> groups -> users" style rules and for multi-tenant isolation.
- Most starter templates and tutorials hand-write role checks. Tutorial list endpoints often run
  an unfiltered query, so the "permission" only guards single objects.

**The good tools are gone, and what is left does not fit.**

| Tool | State on 2026-10-25 | Why it does not solve the problem |
|---|---|---|
| oso (open-source library, with `sqlalchemy-oso`) | **Archived.** README: "no longer maintained... there won't be new releases or bug fixes." Last PyPI release 2024-01 (`sqlalchemy-oso` 2024-06). | It was the best fit (rules -> SQL filters). It is dead. |
| fastapi-permissions (652 stars) | Last release **2020-10-05**. | Dead. No SQL filtering. |
| casbin / pycasbin + FastAPI adapter (26 stars) | Maintained. | String policy files. No SQLAlchemy row filtering. |
| Cerbos + `cerbos-sqlalchemy` | Maintained (0.4.0, 2026-08). | Does SQL filtering, but needs a separate Cerbos server and YAML policies. |
| OpenFGA, Permify | Maintained. | Separate server. Relationship-graph model. |
| Permit.io, Oso Cloud | Maintained. | Paid services. |
| fastapi-rbac | 0.1.1, about 3 days of activity (Nov 2025). | Too new and small to rely on. |
| Kludex/fastapi-authorization (21 stars) | 0.1.0 (2021). | Not developed. |

**The gap:** a pure-Python, in-process, FastAPI-native library where one rule both checks a
single object and filters SQLAlchemy queries. Nothing maintained does this today. Django has
django-rules, django-guardian and DRF permissions. FastAPI has nothing like them.

**Roadmap risk is low.** FastAPI's roadmap (#10370) lists authentication items (OAuth2 with
third parties, cookie auth). It does not list authorization.

### Other ideas we looked at and did not pick
| Idea | Why not |
|---|---|
| Free-threaded Python readiness checker | Clones already exist (Threadcheck, ftaudit), plus Quansight/Meta tools nearby. |
| DPDP (India privacy law) PII scanner + middleware | Real gap, but India-only demand, and the law's deadline (May 2027) may move. DPDPStack, Promiz and bharat-pii cover nearby parts. |
| Lazy-import safety checker (Python 3.15) | `flake8-lazy` covers part. A small, new niche. |
| Generate Create/Update/Patch schemas from SQLAlchemy | Very high demand, but SQLModel (by FastAPI's author), pydantic-sqlalchemy, advanced-alchemy and fastcrud overlap. FastAPI's author may solve it himself. |
| New rate limiter (slowapi is broken on FastAPI >= 0.137, issue #281) | Quick win, but the gap closes the day slowapi merges a fix. Less to learn. |
| pytest helpers for FastAPI (DB rollback, factories) | Real but medium demand. Possible future side project. |
| Another boilerplate / template / admin panel / task queue | The space is crowded. r/FastAPI calls new templates "AI slop". |

---

## Decision

Build **fastauthz**: an open-source (MIT) Python library for authorization in FastAPI apps.

- Rules are written once in plain Python using `R` (resource) and `A` (actor) expressions.
- The same rule is evaluated in Python (one object) and compiled to SQLAlchemy (list filters),
  with the same three-valued logic, proven by property-based tests.
- Default deny, deny wins, fail closed, errors at startup.
- FastAPI dependencies: `query`, `load`, `require`, `guard`. RFC 9457 errors. Permissions in OpenAPI.
- Zero runtime dependencies in the core. SQLAlchemy and FastAPI as extras.
- No server, no subscription, no LLM.

Name: `fastauthz` (free on PyPI on 2026-10-25). The GitHub repo and local folder are renamed to match.

---

## Consequences

**Good**
- Clear, measured pain with dead or ill-fitting competitors.
- Strong Python learning: expression trees, operator overloading, three-valued logic, partial
  evaluation, SQLAlchemy internals, FastAPI dependency injection, OpenAPI, property-based testing.
- Fits the author's daily stack (FastAPI backends).

**Risks and how we handle them**
- **It is a security library, so bugs are costly.** Mitigation: fail-closed logic, 100% core
  coverage, differential property tests, mutation testing, outside review before 1.0 (TASKS M5).
- **Cerbos already filters SQL.** Mitigation: be clearly different: no server, plain Python,
  FastAPI-native. Write a fair comparison page that says when Cerbos is the better choice.
- **FastAPI internals change** (0.137 broke many extensions). Mitigation: all internals in
  `_compat.py`, version-matrix CI, nightly tests on FastAPI pre-releases.
- **oso's authors could revive the open-source library.** Low chance (they moved to Oso Cloud).
  If it happens, our FastAPI-native design still differs.
- **Adoption is not guaranteed.** Mitigation: great docs, real example apps, honest launch.

---

## Sources
- oso archived: https://github.com/osohq/oso
- fastapi-permissions: https://github.com/holgi/fastapi-permissions , https://pypi.org/project/fastapi-permissions/
- casbin FastAPI adapter: https://github.com/apache/casbin-python-fastapi-casbin-auth
- cerbos-sqlalchemy: https://pypi.org/project/cerbos-sqlalchemy/
- fastapi-rbac: https://pypi.org/project/fastapi-rbac/
- Kludex/fastapi-authorization: https://github.com/Kludex/fastapi-authorization
- FastAPI roadmap: https://github.com/fastapi/fastapi/issues/10370
- slowapi breakage on FastAPI >= 0.137: https://github.com/laurentS/slowapi/issues/281
- Reddit, RBAC vs ABAC: https://www.reddit.com/r/FastAPI/comments/1jn1203/
- Reddit, nested org permissions: https://www.reddit.com/r/FastAPI/comments/1kwg55d/
- Tutorial with unfiltered list endpoint: https://chanhle.dev/en/blog/authorization-in-fastapi-rbac-permissions
- Threadcheck: https://github.com/ChidcGithub/Threadcheck , ftaudit: https://github.com/Meet-1010/ftaudit

# fastauthz

**Authorization for FastAPI and SQLAlchemy. Write each permission rule once. Use it to check one object and to filter every list query.**

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Status: design stage](https://img.shields.io/badge/status-design%20stage-orange)
![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue)

> **Status: design stage.** The design is written (see [`core_docs/`](core_docs/)). No code
> yet, and nothing on PyPI yet. Follow progress in [`core_docs/TASKS.md`](core_docs/TASKS.md).
> Design feedback is welcome in Issues and Discussions.

---

## The problem

Almost every FastAPI app has rules like "authors can edit their own posts" or "users only see
their own company's data". Today, everyone writes these by hand:

```python
@app.patch("/posts/{post_id}")
async def edit_post(post_id: int, user: CurrentUser, session: SessionDep):
    post = await session.get(Post, post_id)
    if post is None or (post.author_id != user.id and "admin" not in user.roles):
        raise HTTPException(404)
    ...

@app.get("/posts")
async def list_posts(user: CurrentUser, session: SessionDep):
    # Did we remember the same rule here? And the tenant filter?
    stmt = select(Post).where(Post.org_id == user.org_id)
    ...
```

Each route repeats the rule. One forgotten check is a data leak. Django has `django-rules`,
`django-guardian` and DRF permissions. FastAPI has no maintained, in-process equivalent:
`oso` is archived and `fastapi-permissions` has had no release since 2020
([details](core_docs/decisions/ADR-001-build-fastauthz.md)).

## The idea

```python
from fastauthz import Policy, R, A, ANYONE
from fastauthz.fastapi import FastAuthz

policy = Policy(scope=R.org_id == A.org_id)          # every rule stays inside the user's org
policy.roles({"admin": ["editor"]})
policy.resource(Post, actions=["read", "create", "edit", "delete"])

policy.allow("read", Post, who=ANYONE, when=R.published.is_(True), bypass_scope=True)  # public posts
policy.allow(["edit", "delete"], Post, when=R.author_id == A.id)
policy.allow("*", Post, roles=["admin"])
policy.deny("delete", Post, when=R.locked.is_(True))

authz = FastAuthz(policy, actor=get_current_user, session=get_session)
authz.install(app)


@app.get("/posts")
async def list_posts(stmt: Annotated[Select[tuple[Post]], Depends(authz.query(Post, "read"))],
                     session: SessionDep):
    return (await session.scalars(stmt.limit(50))).all()      # only rows this user may read


@app.patch("/posts/{post_id}")
async def edit_post(post: Annotated[Post, Depends(authz.load(Post, "edit"))]):
    ...                                                        # loaded + checked in one query, else 404
```

The same rule `R.author_id == A.id` is used in two ways:
- **in Python**, to check one object: `policy.can(user, "edit", post)`;
- **in SQL**, as a `WHERE` clause for lists: `policy.filter(user, "read", Post)`.

Both give the same answer, including for `NULL`s and missing values. Property-based tests
prove this.

## Planned features (v1.0)

- **Rules in plain Python**: `R` (resource) and `A` (actor) expressions. No YAML, no policy language.
- **Safe by default**: no rule means no access, deny rules win, and an unclear case is a "no".
- **SQL filtering** for SQLAlchemy 2.0 (sync and async), with relationships (`has()` / `any()`).
- **Tenant scope**: one line keeps every customer's data apart. A resource that cannot be
  scoped stops the app from starting.
- **Roles** that include other roles.
- **Checks at startup**: typos in actions, roles or columns stop the app, not a user request.
- **FastAPI dependencies**: `query`, `load`, `require`, `guard`. RFC 9457 error bodies.
- **Permissions in OpenAPI**: Swagger shows what each route needs.
- **Explain**: see why a request was allowed or denied, rule by rule.
- **Test helpers and a CLI**: `fastauthz check` in CI, and `fastauthz matrix` for security reviews.
- **No server, no subscription.** Zero runtime dependencies in the core.

## How it compares

| | fastauthz (planned) | Hand-written checks | casbin | Cerbos | oso OSS |
|---|---|---|---|---|---|
| Runs inside your app | ✅ | ✅ | ✅ | ❌ separate server | ✅ |
| Rules in plain Python | ✅ | ✅ | ❌ policy files | ❌ YAML | ❌ Polar language |
| Filters SQLAlchemy lists | ✅ | by hand | ❌ | ✅ | ✅ |
| FastAPI dependencies + OpenAPI | ✅ | by hand | small adapter | ❌ | ❌ |
| Maintained (Oct 2026) | in progress | - | ✅ | ✅ | ❌ archived |

Cerbos is a good choice when many services in different languages need one central policy
server. fastauthz is for Python teams that want rules next to their FastAPI code, with no
extra infrastructure.

## Docs

| Doc | What |
|---|---|
| [Functional spec (FSD)](core_docs/FUNCTIONAL_SPECIFICATIONS.md) | What it does, in simple words |
| [Technical design (TDD)](core_docs/TDD-tech-design-doc.md) | How it works, in detail |
| [Tasks](core_docs/TASKS.md) | The build plan, M0 to M5 |
| [Tech stack](core_docs/TECH_STACK.md) | Tools and why |
| [ADR-001](core_docs/decisions/ADR-001-build-fastauthz.md) | Why this project, with evidence |

## Contributing

Ideas, design feedback and bug reports are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md).
Report security problems privately: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

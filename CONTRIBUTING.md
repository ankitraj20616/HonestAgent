# Contributing to fastauthz

Thanks for wanting to help. fastauthz is in the design stage, so design feedback is the most
useful thing right now.

## Ways to help

- **Design feedback:** read the [FSD](core_docs/FUNCTIONAL_SPECIFICATIONS.md) and the
  [TDD](core_docs/TDD-tech-design-doc.md). Open a Discussion or an Issue if something is
  unclear, unsafe or missing.
- **Real use cases:** tell us a permission rule from your app that you think fastauthz cannot
  express. These shape the design.
- **Code:** pick an unticked task in [TASKS.md](core_docs/TASKS.md). Comment on its issue first,
  so two people do not do the same work.

## Before you open a pull request

1. Read [CLAUDE.md](CLAUDE.md). Its rules apply to humans too.
2. Write the tests first. Every behavior change needs a test.
3. If you change `truth.py`, `evaluate.py` or `sql.py`, the property tests must pass on SQLite
   and PostgreSQL (`uv run pytest -m postgres`).
4. Run and pass:
   ```bash
   uv sync --all-extras
   uv run pytest
   uv run ruff check .
   uv run ruff format --check .
   uv run pyright
   ```
5. If your change makes code and docs disagree, update the docs in the same PR.
6. Keep PRs small. One topic per PR.

## Commit messages

Short and clear, in this style: `type: what changed`. Types: `feat`, `fix`, `docs`, `test`,
`refactor`, `chore`, `ci`.

## Security problems

Do not open a public issue. See [SECURITY.md](SECURITY.md).

## Code of conduct

Be kind. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

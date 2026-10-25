# M1 - The core: Tasks

> Very simple English. One small task per line (2 hours or less).
> Tests first: the test task comes before its code task. Run the test and see it fail first.
> Tick `[x]` only when the task is done **and** its tests pass.
> Each task points to `FSD.md` (M1-F...) and `TDD.md` (section numbers) in this folder.
> Do the sections in order. Do not start M2 work or "Later" items.

**Total:** 25 hours (same as M1 in `../../TASKS.md`).

| Section | What | Hours |
|---|---|---|
| A | Base: config, errors | 1.5 |
| B | Truth values | 2 |
| C | Expression tree | 5 |
| D | Python evaluator | 4.5 |
| E | Roles | 1.5 |
| F | Policy | 6 |
| G | Explain | 2.5 |
| H | Quality and wrap-up | 2 |

---

## A. Base: config and errors (1.5 h)

- [ ] **M1-T1** Write `tests/unit/test_errors.py`: every error comes from `FastAuthzError`; `PolicyError` keeps all problems; `str(Denied)` has no rule names or values. (FSD M1-F7, TDD 3.8, tests 128-130)
- [ ] **M1-T2** Add the M1 constants to `config.py`. (TDD 4)
- [ ] **M1-T3** Write `errors.py`: all error classes and `PolicyProblem`. Make M1-T1 pass. (TDD 3.8)

## B. Truth values (2 h)

- [ ] **M1-T4** Write `tests/unit/test_truth.py`: all 9 pairs for and / or, 3 for not, empty and / or, `bool()` raises. (FSD M1-F2.5, TDD 3.2, 3.3.5, tests 31-35)
- [ ] **M1-T5** Write `truth.py`: `Truth`, `and_`, `or_`, `not_`, `MISSING`, `NO_ROW`. `bool()` on them raises. Make M1-T4 pass. (TDD 3.2)
- [ ] **M1-T6** Write `tests/property/test_kleene_laws.py` part 1: P1 and P2 (all cases, no Hypothesis needed). See them pass. (TDD 6.2)

## C. Expression tree (5 h)

- [ ] **M1-T7** Write tests for `R` / `A` paths, `_` names, `R["name"]`, compare operators, reflected compare, `repr`, `hash`. (FSD M1-F1.6, M1-F1.8, TDD 3.1.5, tests 1-5, 26, 27, 30)
- [ ] **M1-T8** Write `_Ref`, `R`, `A`, `ResourceAttr`, `ActorAttr`, `Literal` (typed equality), `Compare`. Make M1-T7 pass. (TDD 3.1.3, 3.1.3.1, 3.1.5)
- [ ] **M1-T9** Write tests for value types: allowed types, lists to tuples, sets in a fixed order, NaN refused, strange types refused, `Literal == Literal` refused, two dotted paths refused, condition as operand refused. (TDD 3.1.3, 3.1.3.2, tests 7, 16-21)
- [ ] **M1-T10** Write `_check_literal` and the `__post_init__` checks. Make M1-T9 pass. (TDD 3.1.3.2)
- [ ] **M1-T11** Write tests for `.in_()`, `.not_in()`, `.is_()`, `.is_not()`, and `In` with an actor list. (tests 6, 8-10)
- [ ] **M1-T12** Write `In`, `Is` and the four methods. Make M1-T11 pass. (TDD 3.1.3, 3.1.5)
- [ ] **M1-T13** Write tests for `&`, `|`, `~`: flattening, `~~a` is `a`, and `and` / `or` / `not` / chained compare give the clear error. (FSD M1-F1.8, tests 11-15)
- [ ] **M1-T14** Write the `_Condition` mixin, `And`, `Or`, `Not`, `Const`, `TRUE_`, `FALSE_`, `all_of`, `any_of`, `negate`. Make M1-T13 pass. (TDD 3.1.2, 3.1.6)
- [ ] **M1-T15** Write tests for `.any()` and `.has()` (with a condition, with `key=value`, with nothing) and for `depth()` (the 7 table cases). (FSD M1-F1.7, tests 22-25)
- [ ] **M1-T16** Write `Related`, `.any()`, `.has()`, `depth()`, `iter_nodes()`, `reads_actor()`. Make M1-T15 pass. (TDD 3.1.5, 3.1.7, 3.1.8)
- [ ] **M1-T17** Write tests for internal nodes, then write `ActorPresent`, `RolesMatch`, `CustomCheck` and `contains_internal()`. (TDD 3.1.4 / D1, tests 28, 29)

## D. Python evaluator (4.5 h)

- [ ] **M1-T18** Write tests for reading values: objects, dicts, missing, `None`, `NO_ROW` on `R`, `MISSING` on `A`, a property that raises. (FSD M1-F2.3, M1-F4.3, TDD 3.3.1, 3.4.2, tests 37, 38, 46, 47)
- [ ] **M1-T19** Write `read_path` and the warn-once helper. Make M1-T18 pass. (TDD 3.4.2, 3.4.5)
- [ ] **M1-T20** Write tests for `Compare`: each step of the order of checks, `NO_ROW` with `!=`, TypeError, NaN in data. (TDD 3.3.2, tests 36, 39-43)
- [ ] **M1-T21** Write tests for every row of the `In` table and every cell of the `Is` table. (TDD 3.3.3, 3.3.4, tests 44, 45)
- [ ] **M1-T22** Write `evaluate()`, `EvalContext`, `_compare`, `_in`, `_is`, and `And` / `Or` / `Not` with short-circuit. Make M1-T20 and M1-T21 pass. (TDD 3.4.1, 3.4.3, 3.4.4)
- [ ] **M1-T23** Write tests for `any` / `has` on objects, short-circuit, internal nodes, custom check results and crashes, trace entries. (FSD M1-F2.3, TDD 3.3.6, 3.3.7, tests 48-57)
- [ ] **M1-T24** Write `_related`, `_custom`, the `ActorPresent` / `RolesMatch` cases and tracing. Make M1-T23 pass. (TDD 3.4.3, 3.4.4)
- [ ] **M1-T25** Write the lazy-load tests (`tests/unit/test_evaluate_lazy.py`, `tests/compat/test_compat_is_loaded.py`, test 58). (FSD M1-F4.4, TDD 3.4.6, tests 58-64, C1-C5)
- [ ] **M1-T26** Write `_compat.is_loaded` (no import at the top of the file) and the lazy guard in `evaluate.py`. Make M1-T25 pass. (TDD 3.4.6 / D2)

## E. Roles (1.5 h)

- [ ] **M1-T27** Write `tests/unit/test_roles.py`: expand, diamond, unknown actor roles, cycles, bad input, merge, cache. (FSD M1-F3, TDD 3.5, tests 65-72)
- [ ] **M1-T28** Write `roles.py`: `RoleGraph` with `add`, `defined`, `find_cycles`, `freeze`, `expand` (cached). Make M1-T27 pass. (TDD 3.5)

## F. Policy (6 h)

- [ ] **M1-T29** Write tests for the policy methods: chaining, every argument check, `who` defaults, actions, source file and line, auto names, duplicate names. (FSD M1-F1.1-M1-F1.5, M1-F1.9-M1-F1.11, TDD 3.6.1-3.6.5, 3.6.7, tests 73-81)
- [ ] **M1-T30** Write `Who`, `Rule`, `ResourceSpec`, `Policy.__init__`, `roles()`, `resource()`, `allow()`, `deny()`, `_caller_source()`, auto names. Make M1-T29 pass. (TDD 3.6.1-3.6.5, 3.6.7)
- [ ] **M1-T31** Write tests for the built condition: exact tree, scope place, `bypass_scope`, deny without scope, `"*"`, no allow rules, custom check last, cache. (TDD 3.6.6, tests 82-88)
- [ ] **M1-T32** Write `_rule_term`, `_build_condition`, `_condition`, `scope_for`, `rules_for`. Make M1-T31 pass. (TDD 3.6.6)
- [ ] **M1-T33** Write `tests/unit/test_validate.py` part 1: FA001, FA002, FA005, FA006, FA007 (one test that finds it, one that does not). (FSD M1-F5.5, TDD 3.6.8, tests 89-93)
- [ ] **M1-T34** Write `validate()` for the error codes and `PolicyError` message. Make M1-T33 pass. (TDD 3.6.8)
- [ ] **M1-T35** Write `tests/unit/test_validate.py` part 2: FA009-FA016, "no M2 codes in M1", order of problems. (tests 94-103)
- [ ] **M1-T36** Write the warning and notice checks and `_static()` for FA011. Make M1-T35 pass. (TDD 3.6.8)
- [ ] **M1-T37** Write `tests/unit/test_freeze.py`: all errors at once, lock after freeze, freeze twice, failed freeze, first-use freeze, 8 threads. (FSD M1-F5.2-M1-F5.4, TDD 3.6.9, tests 104-110)
- [ ] **M1-T38** Write `freeze()` with the lock and the condition cache. Make M1-T37 pass. (TDD 3.6.9)
- [ ] **M1-T39** Write `tests/unit/test_can_check.py`: blog cases, deny wins, unclear deny blocks, scope, errors for unknown action / type / `None`, subclass, bad `actor_roles`, `Denied` content. (FSD M1-F2, M1-F4, TDD 3.6.10, tests 111-120)
- [ ] **M1-T40** Write `Decision` (in `decision.py`), `_resolve_model`, `_context`, `can()`, `check()`, `_decision()`. Make M1-T39 pass. (TDD 3.6.10, 3.7.1)

## G. Explain (2.5 h)

- [ ] **M1-T41** Write `tests/unit/test_explain.py`: rows, `because` text, agrees with `can()`, cut long values, `MISSING` / `NO_ROW` names, no rules line, golden `str()` output, custom check crash. (FSD M1-F6, TDD 3.7.3, 3.7.4, tests 121-127)
- [ ] **M1-T42** Write `RuleResult`, `Explanation`, `render_entry`, `render_because` and `Policy.explain()`. Make M1-T41 pass. (TDD 3.7.2, 3.7.3)
- [ ] **M1-T43** Write `Explanation.__str__` (padded plain table). Make the golden test pass. (TDD 3.7.4)

## H. Quality and wrap-up (2 h)

- [ ] **M1-T44** Write `__init__.py` exports and the typing test `tests/typing/test_public_api_types.py`. (FSD M1-F8, TDD 3.9, 6.3)
- [ ] **M1-T45** Write `tests/unit/test_imports.py` (block SQLAlchemy and FastAPI two ways, plus the import scan). See it pass. (FSD M1-F8.2, TDD 6.1 tests 131-133)
- [ ] **M1-T46** Finish `tests/property/test_kleene_laws.py`: P3-P6 with the shared strategies in `tests/property/strategies.py`. (TDD 6.2)
- [ ] **M1-T47** Add the blog script test `tests/examples/test_m1_blog_script.py`. (FSD section 2, TDD 6.4)
- [ ] **M1-T48** Add the CI steps: core coverage gate at 100%, and the "core without extras" job. (TDD 7)
- [ ] **M1-T49** Copy design decisions D1-D10 into the main TDD and FSD, as listed in TDD 11. Tick the M1 boxes in `../../TASKS.md`. Add a line to `../../timeline/timeline.md`. (CLAUDE.md rule 13)
- [ ] **M1-T50** Run `uv run pytest`, `uv run ruff check .`, `uv run pyright`. Show the output in the PR.

---

## Done when

- [ ] All tasks above are ticked.
- [ ] A small script can make a blog policy, call `can()` and print `explain()`.
- [ ] Every M1 problem code (FA001, FA002, FA005, FA006, FA007, FA009-FA016) has a test that finds it and one that does not.
- [ ] The core works with SQLAlchemy and FastAPI blocked.
- [ ] 100% branch coverage on the core files.
- [ ] `uv run pytest`, `uv run ruff check .` and `uv run pyright` pass.

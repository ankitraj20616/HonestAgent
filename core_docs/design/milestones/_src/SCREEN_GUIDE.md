# How to write a milestone screen

Look: **The Wheel**, dark only. Spec: `core_docs/design/2026-10-11-wheel-ui-design.md`. Mockups: `core_docs/design/wheel_mockups/`.

## Files
- One fragment per screen: `_src/screens/<milestone folder>/<NN>_<slug>.html` (`01_`, `02_`, ... in user-flow order).
- Output is flat (never edit by hand): `<milestone folder>/<NN>_<slug>.html` and `index.html`. No light/dark folders.
- Build all (also makes `index.html`): `python3 core_docs/design/milestones/_src/build.py`
- Build one milestone (does not rebuild `index.html`): `python3 core_docs/design/milestones/_src/build.py M4_checks_proof_card`
- Screenshots: `python3 core_docs/design/milestones/_src/shoot.py OUT_DIR [milestone...]`
- Tests: `python3 -m pytest core_docs/design/milestones/_src/tests -q`
- Do not edit `base.css` or `build.py` for one screen. Add a small `<style>` block at the top of the fragment, or put rules for the whole milestone in `_src/screens/<milestone>/_shared.css`.

## Front matter (first line of the fragment)
```html
<!-- {"title": "Home", "note": "The Wheel. F1.3, F16.2", "shell": "app", "nav": "home", "dock": "full"} -->
```
- `shell`: `app` adds the top bar and the agents dock/rail. `bare` adds nothing (spike windows, CLI terminals, first-run wizard).
- `nav`: `home` | `board` | `memory` | `playbooks` | `settings`.
- `dock`: `full` (Home only) or `rail` (default).
- Other keys: `project`, `needs`, `cost`, `agents`, `slots`, `daemon`, `after_topbar`. See the docstring at the top of `_src/build.py`.
- `note`: shown in the gallery. End it with the FSD F-numbers.

## Drawing tags
Use open and close tags. For `<x-wheel>`, `data=` must be the first attribute. The build stops otherwise.
```html
<x-wheel data='{"beads": [...], "counts": {...}, "hub": {...}, "lit": [...], "size": 520}'></x-wheel>
<x-journey stage="run" tone="road" size="46" notches="0.2,0.6"></x-journey>
<x-trust checks="50" criteria="28" second="8" size="250" label="TRUST SCORE"></x-trust>
```
Bead keys: `n` (number shown), `stage`, `tone` (`road` `ok` `bad` `info` `idle`), `r` (size), `halo`, `dim` (opacity),
`link` (beads on one spoke with the same `link` sit 24° apart and get a joining arc, e.g. a race), `gap` (extra degrees before this bead).
A Wheel smaller than 300px gets bigger text by itself (`.wheel.sm`). Use `"capture_plus": false` to hide the dashed `+` bead.

## Copy a pattern from a reference screen
| Page | Copy from | Classes in `base.css` |
|---|---|---|
| Home (dock full) | M3 `01_home` | `.bar-head` `.h-title` `.side-r` `.ask-card` (`.who`, `.q`) `.rv-row` `.mem-note` |
| Board | M3 `02_task_board` | `.rim` `.seg8` `.cols8` `.col8` `.bcard` `.bead` |
| Task Room | M3 `03_task_room_stream` | `.room-head` `.journey-box` `.room` `.room-side` `.tabs` `.tl` `.tl-ev` `.tool-row` `.qa` |
| Proof | M4 `03_proof_green` | `.proof` `.proof-l` `.proof-r` `.gate` `.stats4` `.crit-row` |
| Review | M5 `01_change_story` | `.review-tab` `.review-l` `.review-r` `.chap` `.risk` |

Some rules only work inside a container:
- `.legend` in `.proof-l`
- `.ck-row` in `.proof-r`
- `.diff` in `.tl-ev` or `.chap`
- `.so`, `.fd`, `.decide` in `.review-r`
- `.tl` only with `.tl-ev` children

Before you add a new shared class name, search the older fragments for it. Clashes have happened (`.rail`, `.review`).

## Rules
1. **No color values** (`#hex`, `rgb()`, `oklch()`, `hsl()`) in CSS. Use tokens like `var(--accent)` or classes. The build lints this.
2. **One sample world.** Demo task **T-0012 "Add password reset API"** in `acme-billing`. Other tasks: T-0009, T-0018, T-0024, T-0027, T-0031.
3. **A screen shows only features of its milestone.** No Trust ring before M4. No second-opinion part before M5.
4. **English UI names:** The Wheel, Beads, Agents, Needs You, Trust score.
5. **Simple English**, short labels, real commands and numbers.
6. Design at **1440x900**. No sideways overflow. Long lists scroll inside their panel.
7. **Check every PNG** made by `shoot.py`. Fix overlap, cut-off text, low contrast, and empty space.

# How to write a milestone screen

Source of the look: `core_docs/design/Saarthi Prototype.html` (dark only). Every screen here must look like it belongs to that prototype, in both light and dark mode.

## Files
- Write one fragment per screen: `_src/screens/<milestone folder>/<NN>_<slug>.html` (`01_`, `02_`, ... in user-flow order).
- Build: `python3 _src/build.py <milestone folder>` (one milestone) or `python3 _src/build.py` (all + `index.html`).
- Output (never edit by hand): `<milestone folder>/dark/<NN>_<slug>.html` and `<milestone folder>/light/<NN>_<slug>.html`.
- Do not edit `theme.css`, `base.css` or `build.py` for one screen. If a style is missing, add a small `<style>` block at the top of the fragment that uses only `var(--...)` tokens.
- Styles needed by **every** screen of one milestone may go in `_src/screens/<milestone folder>/_shared.css` (added to all screens of that milestone, after `base.css`). Only move a rule there if every screen of that milestone already has it, in the same order. Otherwise it can restyle screens that never had it.

## Front matter (first line of the fragment)
```html
<!-- {"title": "Proof Card - failed", "note": "What the screen shows, in one line. F7.3, F7.4", "shell": "app",
      "nav": "room", "crumb": "T-0012 · Add password reset API", "needs": 0, "cost": "$4.12", "slots": "1 of 4"} -->
```
- `shell`: `app` = sidebar + top bar are added for you. `bare` = nothing added (spike windows, CLI terminals, first-run screens, notifications over a desktop).
- `nav`: `deck` | `board` | `room` | `memory` | `playbooks` | `settings`.
- `note`: shown in the gallery; end with the FSD F-numbers the screen covers.

## Rules
1. **No color literals.** No `#hex`, `rgb()`, `oklch()`, `hsl()` in `style=""` or `<style>`. Use theme variables (`var(--accent)`, `var(--line)`, ...) or classes. The build fails otherwise.
2. **Use `base.css` classes first**: `page`, `card` (`hot`/`ok`/`bad`/`info`/`dashed`), `list-row`, `btn` (`primary`/`danger`/`ok`/`ghost`/`sm`/`xs`), `chip`, `seg`, `tag`, `agent cl|cx`, `dot amber|green|red|blue pulse`, `stage running|needs|verifying|review|failed|...`, `toggle on`, `check on`, `radio on`, `field`/`input`/`textarea`, `table`, `kv`, `stat`, `banner warn|err|ok|info`, `empty`, `board`/`lane`/`tcard`, `room-head`/`room`/`room-side`/`room-main`/`tabs`/`tab on`/`tab-body`/`composer`, `crit` + `box met|notsure|notmet`, `run-row`, `stream`/`ev`/`ev-card msg|think|user|needs|err|ok`/`ev-out`, `code` + `ln add|del|hl` + `tk-k|s|c|f|n`, `term`/`term-bar`/`term-body` + `p|c|g|r|y|d|b`, `scrim`/`modal`/`modal-head|body|foot`, `cmd-input`/`cmd-item`, `toast`, `notify`, `bare`/`window`/`window-bar`, `annot`.
3. **Overlays** (dialogs, Command Bar): draw the screen under it, then a `.scrim` with the `.modal` on top, in the same fragment.
4. **One world of sample data** (keep it the same everywhere):
   - Projects: `acme-billing` (main demo), `saarthi`, `clinic-portal`.
   - Demo task: **T-0012 "Add password reset API"** in `acme-billing`, Claude, branch `saarthi/T-0012-add-password-reset-api`, worktree `~/.local/share/saarthi/worktrees/acme-billing-3f9k2a/T-0012`.
   - Other tasks: T-0009 Rate-limit the login endpoint, T-0018 Invoice PDF export with line-item totals (Claude, running), T-0024 Show task cost on board cards (saarthi), T-0027 Event replay after WebSocket reconnect (saarthi, Codex), T-0031 Upgrade Alembic to 1.14 (saarthi, Codex, needs you).
   - Checks: `tests` = `uv run pytest -q`, `lint` = `uv run ruff check .`, `types` = `uv run pyright` (not required).
   - Daemon: `127.0.0.1:7878`, version `v0.9`. Date: Sunday, 11 October 2026.
5. **Simple English** in all UI text. Short labels. Real commands, real file paths, real numbers.
6. Design at **1440 x 900**. Nothing may overflow sideways. Long lists scroll inside their panel.
7. Light and dark come from the same fragment, so check **both** screenshots.

## Check your screens
```bash
google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars --window-size=1440,900 \
  --virtual-time-budget=3000 --screenshot=/tmp/x.png "file://$PWD/<milestone>/<theme>/<file>.html"
```
Look at the PNG. Fix overlap, cut-off text, low contrast, empty space, and anything that does not match the prototype.

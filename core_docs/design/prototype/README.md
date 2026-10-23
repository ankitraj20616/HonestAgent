# Prototype source

The whole Saarthi product as one clickable HTML file with dummy data.
Output: `../Saarthi Prototype.html`. Design rules: `../2026-10-23-simple-ui-design.md`.

```bash
python3 core_docs/design/prototype/build.py --test      # build + static checks + ?selftest in headless Chrome
python3 core_docs/design/prototype/shoot.py OUT_DIR     # PNG of every screen (1440x900); --size 1366x768 --theme light
```

## Files
| File | What |
|---|---|
| `styles.css` | Tokens (dark + light) and every shared class. Add a class here before you repeat a long inline style. |
| `core.js` | State, router, click handling, shared parts (`btn`, `chip`, `page`, `head`, `dialog`, `md`, `hl`, …), the top bar and the prototype bar. |
| `data.js` | Shared dummy data (`D.projects`, `D.tasks`, `D.task`, `D.files`, `D.groups`, `D.tickets`, …). |
| `views/main.js` | Main flow, plus the builders `taskPage()`, `filesView()`, `checkPage()`, `verdict()`, `homeList()`, `agentMenu()`. |
| `views/*.js` | The other screens, one file per area. Loaded in name order after `main.js`. |
| `build.py`, `shoot.py` | Build the one-file HTML; take screenshots. `views.json` is generated. |

## Writing a screen
```js
view('safetyAsk', {title: 'Task: agent asks to run a command', area: 'Task page', ms: 'M8'}, () => taskPage({...}));
```
- `view(id, meta, render)`. The `meta` keys must start with `title`, `area`, `ms` in that order, because `build.py` reads them with a regex.
  - `area` is one of `AREAS` in `core.js`.
  - `ms` lists the milestones, separated by spaces, e.g. `'M4 M5'`.
  - Optional keys:
    - `chrome: 'bare'` hides the top bar;
    - `needs: n` sets the Needs-you count in the top bar;
    - `base: 'home', overlay: 'commandBar'` draws an overlay on top of another view;
    - `banner: () => html` draws a strip under the top bar.
- `render()` returns an HTML string. Use `page(body, 'narrow'|'wide'|'xwide')` and `head({title, eyebrow, sub, right, backTo, backLabel})`.
- Clicks use data attributes. Never write inline JS or `onclick`:
  - `data-go="id"` opens a view;
  - `data-act="name" data-arg="x"` runs `A.name(el)`;
  - `data-tog="key"` flips `S.ui[key]`;
  - `data-set='{"k":1}'` merges into `S.ui`;
  - `data-model="key"` on an input stores its value; add `data-live` to re-render on every key.
- `btn(label, {kind: 'primary'|'soft'|'surface'|'ghost'|'danger', size: 'lg'|'sm'|'xs', go, act, arg, set, tog, disabled})`.
- `ui(key, default)` reads the state of the current screen. `S.ui` resets when the view changes. `go(id, init)` opens a view with a starting state.
- `toast(html)` shows a short message. `A.toast` with `data-arg` does the same from a button, for actions the prototype does not simulate.

## Rules
1. **Colours only through tokens** (`var(--accent)`, …). `build.py` fails on a colour literal in `views/`. The one exception is the logo amber `#E9A23B`.
2. **Plain words** from the spec (section 5). Never show Wheel, bead, Task Room, Proof Card, Trust score number (except under "How we decided"), Change Story, Playbook, Race, Context Pack, worktree, or daemon on a default screen.
3. **One main action per screen.** Exactly one `primary` button in view, unless it is a list of rows.
4. **Every link goes to a real view.** `build.py` checks `data-go`, `go:`, `to:`, `linked:`; `?selftest` checks every rendered `data-go` and `data-act`.
5. **Same story everywhere:**
   - project `acme-billing`, task T-0012 "Add password reset API", branch `saarthi/T-0012-add-password-reset-api`, Jira `ACME-142`, PR #118;
   - other tasks from `D.tasks`;
   - agents Claude (default), Codex (not logged in yet), Gemini.
6. Works at 1366×768 and 1440×900, in dark and light, with no sideways scroll.

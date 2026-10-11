# UI design by milestone

Screens for every milestone (M0-M9) in the **Wheel** look. Dark only.

Spec: `../2026-10-11-wheel-ui-design.md`. Mockups: `../wheel_mockups/`.

**Start here:** open `index.html` in a browser. It lists every screen.

## Folder layout
```
design/milestones/
├── index.html                  # gallery of all screens (generated)
├── M3_desktop_ui_v1/
│   ├── 01_home.html            # one HTML file per screen (generated)
│   └── ...
├── M0_ ... M9_ (same shape)
└── _src/                       # the source; edit here, never the generated files
    ├── build.py  base.css  theme.css  wheel_svg.py  shoot.py  proto.py
    ├── SCREEN_GUIDE.md         # rules for writing a screen
    ├── tests/
    └── screens/<milestone>/NN_slug.html  (+ optional _shared.css)
```
- Folder names match `core_docs/milestones/`.
- Each HTML file is self-contained. Double-click to open. Fonts load from Google Fonts.
- M0-M2 have no desktop app yet, so their screens are the spike window and the `saarthi` CLI.

## Build and check
```bash
python3 core_docs/design/milestones/_src/build.py                      # everything + index.html
python3 core_docs/design/milestones/_src/build.py M5_review_ship       # one milestone (no index.html)
python3 core_docs/design/milestones/_src/shoot.py OUT_DIR [milestone...]   # PNG screenshots
python3 -m pytest core_docs/design/milestones/_src/tests -q
```
Rules are in `_src/SCREEN_GUIDE.md`.

## Clickable prototype
`../Saarthi Prototype.html` is one file you can click through, made from these screens. Open it in a browser.
- It starts at Home. Click the main flow: Home → Board → Task Room → Proof → Review → Ship → Shipped.
- Keys: `Esc` back, `Ctrl K` Command Bar, `G` then `H`/`B`/`M`/`P` for Home/Board/Memory/Playbooks, `?` shortcuts.
- The slim **Prototype** tab on the right edge opens a panel with the view name, a Back button, every view and the size toggle.
- Size: **Fit** (default) scales the 1440×900 screen down so all of it fits the window; **100%** shows real size with scrolling. The browser remembers the choice.
- A link like `Saarthi Prototype.html#review` opens one view. `?selftest` clicks through the flow and writes PASS or FAIL in the tab title.
- Which click goes where is one table in `_src/proto.py`. After you change screens or that table, build it again:
```bash
python3 core_docs/design/milestones/_src/proto.py
```
The old prototype (old look) is kept in `../archive/Saarthi Prototype - old look.html`.

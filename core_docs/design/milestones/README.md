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
    ├── build.py  base.css  theme.css  wheel_svg.py  shoot.py
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

# UI design by milestone

Light and dark screens for every milestone (M0-M9), based on `../Saarthi Prototype.html`.

**Start here:** open `index.html` in a browser. It lists every screen with a Light and a Dark link.

## Folder layout

```
design/milestones/
├── index.html                    # gallery of all screens (generated)
├── M3_desktop_ui_v1/
│   ├── light/01_command_deck.html   # one HTML file per screen, light mode
│   └── dark/01_command_deck.html    # the same screen, dark mode
├── M0_ ... M9_ (same shape)
└── _src/                         # the single source; edit here, never in light/ or dark/
    ├── theme.css                 # color tokens: one dark block, one light block
    ├── base.css                  # shared components (cards, board, task room, terminal, dialogs)
    ├── build.py                  # builds light/ + dark/ + index.html
    ├── SCREEN_GUIDE.md           # rules for writing a screen
    └── screens/<milestone>/NN_slug.html  (+ optional _shared.css for that milestone)
```

- Folder names match `core_docs/milestones/` (the FSD and TDD for each milestone).
- Every HTML file is self-contained (styles inline). Double-click to open. Fonts load from Google Fonts.
- M0-M2 have no desktop app yet, so their screens are the spike window and the `saarthi` CLI in a terminal.
- Hover the small tag in the bottom-left corner of any screen to go to prev / next screen or switch light / dark. That tag is a review aid, not part of the product.

## Change a screen

```bash
# edit core_docs/design/milestones/_src/screens/<milestone>/<NN_slug>.html, then:
python3 core_docs/design/milestones/_src/build.py                  # everything + index.html
python3 core_docs/design/milestones/_src/build.py M5_review_ship   # one milestone
```

Rules (full list in `_src/SCREEN_GUIDE.md`):
1. Screens use only theme variables. The build fails on a hard-coded color, so light and dark never drift apart.
2. Change a color for the whole app in `_src/theme.css` only.
3. Same sample data everywhere: demo task **T-0012 "Add password reset API"** in `acme-billing`.

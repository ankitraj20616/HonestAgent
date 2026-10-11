"""Build the per-milestone UI designs (light + dark) from one source.

    python3 core_docs/design/milestones/_src/build.py                    # all milestones + index.html
    python3 core_docs/design/milestones/_src/build.py M4_checks_proof_card  # one milestone only

Input:  _src/screens/<milestone folder>/<NN_slug>.html   (one fragment per screen)
Output: <milestone folder>/dark/<NN_slug>.html and <milestone folder>/light/<NN_slug>.html
        index.html (gallery of all screens)

A fragment starts with one JSON comment (front matter), then plain HTML:

    <!-- {"title": "Command Deck", "note": "Home screen. F1.3, F16.2", "shell": "app",
          "nav": "deck", "crumb": "Command Deck"} -->
    <div class="page"> ... </div>

shell = "app"  -> wrapped in sidebar + top bar. Optional keys:
                  nav, crumb, project, needs, cost, slots,
                  projects     [[name, open_count, "amber|green|red|"], ...]  ([] = no projects yet)
                  daemon       {"dot": "green", "pulse": false, "label": "saarthid running",
                                "sub": "127.0.0.1:7878 · v0.9", "note": "Agents: 2 of 4 slots in use",
                                "note_class": "muted"}   (any key may be left out; label/sub/note may hold HTML)
                  after_topbar HTML placed between the top bar and the content (status bars)
shell = "bare" -> no app chrome (spike windows, CLI terminals, first-run screens)

Optional: _src/screens/<milestone folder>/_shared.css holds styles used by several screens of
that milestone. It is added after base.css on every screen of that milestone.

Fragments must use only CSS variables from theme.css (no hex / rgb / oklch colors), so
light and dark stay in sync. The build fails if it finds a color literal in a fragment.
"""

from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent
ROOT = SRC.parent
SCREENS = SRC / "screens"
THEMES = ("dark", "light")

MILESTONES = {
    "M0_spike_skeleton": ("M0", "Spike + skeleton"),
    "M1_daemon_core_cli": ("M1", "Daemon core + CLI"),
    "M2_agent_runs_worktrees": ("M2", "Agent runs + worktrees"),
    "M3_desktop_ui_v1": ("M3", "Desktop UI v1"),
    "M4_checks_proof_card": ("M4", "Checks + Proof Card"),
    "M5_review_ship": ("M5", "Review + Ship"),
    "M6_research_memory_playbooks": ("M6", "Research + Memory + Playbooks"),
    "M7_race_mode": ("M7", "Race Mode + parallel polish"),
    "M8_safety_cost_rewind": ("M8", "Safety + cost + rewind"),
    "M9_polish_package": ("M9", "Polish + package (v1.0)"),
}

NAV = [
    ("deck", "Command Deck", "D"),
    ("board", "Task Board", "B"),
    ("room", "Task Room", "T"),
    ("memory", "Memory", "M"),
    ("playbooks", "Playbooks", "P"),
    ("settings", "Settings", ","),
]
# (name, open tasks, status dot class)
PROJECTS = [("acme-billing", 9, "amber"), ("saarthi", 4, "green"), ("clinic-portal", 2, "")]

FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700'
    '&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">'
)
COLOR_LITERAL = re.compile(r"#[0-9a-fA-F]{3,8}\b(?![\w-])|\brgba?\(|\boklch\(|\bhsla?\(")
FRONT = re.compile(r"\A\s*<!--\s*(\{.*?\})\s*-->", re.S)


def theme_css(theme: str) -> str:
    text = (SRC / "theme.css").read_text()
    block = re.search(rf"/\*@{theme}\*/(.*?)/\*@end\*/", text, re.S)
    if not block:
        sys.exit(f"theme.css has no @{theme} block")
    return block.group(1).strip()


def parse(path: Path) -> tuple[dict, str]:
    raw = path.read_text()
    m = FRONT.match(raw)
    if not m:
        sys.exit(f"{path}: missing front matter comment")
    meta = json.loads(m.group(1))
    body = raw[m.end():].strip()
    # Only CSS can carry colors: check style="" attributes and <style> blocks.
    css_bits = re.findall(r'style="([^"]*)"', body) + re.findall(r"<style>(.*?)</style>", body, re.S)
    for bit in css_bits:
        bad = COLOR_LITERAL.search(bit)
        if bad:
            sys.exit(f"{path}: color literal '{bad.group(0)}' in CSS '{bit[:60]}'. Use theme variables.")
    for key in ("title", "note", "shell"):
        if key not in meta:
            sys.exit(f"{path}: front matter needs '{key}'")
    return meta, body


def app_shell(meta: dict, body: str) -> str:
    nav = meta.get("nav", "deck")
    project = meta.get("project", "acme-billing")
    needs = int(meta.get("needs", 0))
    slots = meta.get("slots", "2 of 4")
    items = []
    for key, label, kbd in NAV:
        badge = f'<span class="badge">{needs}</span>' if key == "deck" and needs else ""
        on = " on" if key == nav else ""
        items.append(
            f'<button class="nav-item{on}"><span class="mark"></span>'
            f'<span class="label nowrap">{label}</span>{badge}<span class="mono faint" style="font-size:10.5px">{kbd}</span></button>'
        )
    projs = []
    for name, open_count, dot in meta.get("projects", PROJECTS):
        on = " on" if name == project else ""
        projs.append(
            f'<button class="side-proj{on}"><span class="grow mono" style="font-size:12.5px">{name}</span>'
            f'<span class="muted" style="font-size:11.5px">{open_count}</span><span class="dot {dot}"></span></button>'
        )
    d = {
        "dot": "green",
        "label": "saarthid running",
        "sub": "127.0.0.1:7878 · v0.9",
        "note": f"Agents: {slots} slots in use",
        "note_class": "muted",
        **meta.get("daemon", {}),
    }
    needs_pill = (
        f'<button class="needs-pill"><span class="dot amber pulse"></span>'
        f'{needs} task{"s" if needs != 1 else ""} need{"" if needs != 1 else "s"} you</button>'
        if needs
        else ""
    )
    return f"""<div class="app">
<aside class="side">
  <div class="brand"><div class="logo">S</div><div class="col gap-4" style="gap:0">
    <span class="brand-name">Saarthi</span><span class="brand-sub">Agentic Dev Environment</span></div></div>
  <button class="capture-btn"><span>+ Quick capture</span><span class="kbd">Ctrl Alt N</span></button>
  <nav class="nav">{''.join(items)}</nav>
  <div class="col" style="gap:2px"><div class="upper" style="padding:0 10px 6px">Projects</div>{''.join(projs) or '<div class="small faint" style="padding:2px 10px">No projects yet</div>'}</div>
  <div class="daemon-box">
    <div class="row small"><span class="dot {d['dot']}{' pulse' if d.get('pulse') else ''}"></span><span>{d['label']}</span></div>
    <div class="mono xs faint">{d['sub']}</div>
    <div class="small {d['note_class']}">{d['note']}</div>
  </div>
</aside>
<main class="main">
  <header class="topbar">
    <div class="crumb">{f'<span class="mono nowrap">{project}</span><span class="faint">/</span>' if project else ''}
      <span class="here ellipsis">{html.escape(meta.get('crumb', meta['title']))}</span></div>
    <div class="grow"></div>
    {needs_pill}
    <button class="search-btn"><span class="ellipsis">Search tasks or run a command</span><span class="kbd">Ctrl K</span></button>
    <div class="col" style="gap:0;align-items:flex-end;line-height:1.15">
      <span class="xs faint">Today</span><span class="mono" style="font-size:13px">{meta.get('cost', '$4.12')}</span></div>
  </header>
  {meta.get('after_topbar', '')}
  <div class="content">
{body}
  </div>
</main>
</div>"""


def proto_nav(code: str, title: str, files: list[str], i: int, theme: str) -> str:
    other = "light" if theme == "dark" else "dark"
    prev_link = f'<a href="{files[i - 1]}">&larr; prev</a>' if i > 0 else '<span class="faint">&larr; prev</span>'
    next_link = (
        f'<a href="{files[i + 1]}">next &rarr;</a>' if i < len(files) - 1 else '<span class="faint">next &rarr;</span>'
    )
    return (
        f'<div class="proto-nav"><span class="handle" title="Design navigator">{code} {i + 1}/{len(files)}</span>'
        f'<span class="more"><a href="../../index.html">All screens</a><span class="sep">|</span>'
        f'<span>{code} · {i + 1}/{len(files)} · {html.escape(title)}</span><span class="sep">|</span>'
        f'{prev_link}{next_link}<span class="sep">|</span><a href="../{other}/{files[i]}">{other} mode</a></span></div>'
    )


def shared_css(folder: str) -> str:
    path = SCREENS / folder / "_shared.css"
    if not path.exists():
        return ""
    text = path.read_text()
    bad = COLOR_LITERAL.search(re.sub(r"/\*.*?\*/", "", text, flags=re.S))
    if bad:
        sys.exit(f"{path}: color literal '{bad.group(0)}'. Use theme variables.")
    return text


def page(meta: dict, body: str, theme: str, code: str, nav_html: str, extra_css: str = "") -> str:
    inner = app_shell(meta, body) if meta["shell"] == "app" else body
    base = (SRC / "base.css").read_text() + extra_css
    return f"""<!doctype html>
<html lang="en" data-theme="{theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Saarthi {code} · {html.escape(meta['title'])} ({theme})</title>
<meta name="description" content="{html.escape(meta['note'])}">
{FONTS}
<style>
{theme_css(theme)}
{base}
</style>
</head>
<body>
{inner}
{nav_html}
</body>
</html>
"""


def gallery(entries: dict[str, list[tuple[str, dict]]]) -> str:
    sections = []
    for folder, (code, name) in MILESTONES.items():
        rows = entries.get(folder, [])
        if not rows:
            continue
        lis = "".join(
            f'<tr><td class="mono faint">{i + 1:02d}</td><td><b>{html.escape(m["title"])}</b>'
            f'<div class="small muted">{html.escape(m["note"])}</div></td>'
            f'<td class="nowrap"><a href="{folder}/light/{f}">Light</a> · <a href="{folder}/dark/{f}">Dark</a></td></tr>'
            for i, (f, m) in enumerate(rows)
        )
        sections.append(
            f'<section class="card"><div class="card-head"><h2>{code} · {name}</h2>'
            f'<span class="small muted">{len(rows)} screens · <span class="mono">{folder}/</span></span></div>'
            f'<table class="table"><tbody>{lis}</tbody></table></section>'
        )
    css = (
        f"{theme_css('light')}\n@media (prefers-color-scheme: dark) {{ {theme_css('dark')} }}\n"
        + (SRC / "base.css").read_text()
    )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Saarthi Milestone Screens</title>{FONTS}<style>{css}</style></head>
<body><div class="page narrow">
<div class="page-head"><div class="row gap-12"><div class="logo">S</div><div>
<h1 class="title">Saarthi · UI by milestone</h1>
<div class="muted">Every screen in light and dark mode, built from <span class="mono">_src/</span>.
Based on <span class="mono">core_docs/design/Saarthi Prototype.html</span>.</div></div></div></div>
{''.join(sections)}
</div></body></html>
"""


def main() -> None:
    entries: dict[str, list[tuple[str, dict]]] = {}
    total = 0
    only = sys.argv[1] if len(sys.argv) > 1 else None
    if only and only not in MILESTONES:
        sys.exit(f"unknown milestone folder {only!r}; use one of {list(MILESTONES)}")
    for folder, (code, _name) in MILESTONES.items():
        if only and folder != only:
            continue
        src_dir = SCREENS / folder
        if not src_dir.is_dir():
            continue
        files = sorted(p.name for p in src_dir.glob("*.html"))
        parsed = [parse(src_dir / f) for f in files]
        extra_css = shared_css(folder)
        entries[folder] = [(f, meta) for f, (meta, _b) in zip(files, parsed)]
        for theme in THEMES:
            out = ROOT / folder / theme
            out.mkdir(parents=True, exist_ok=True)
            for old in out.glob("*.html"):
                if old.name not in files:
                    old.unlink()
            for i, (f, (meta, body)) in enumerate(zip(files, parsed)):
                nav_html = proto_nav(code, meta["title"], files, i, theme)
                (out / f).write_text(page(meta, body, theme, code, nav_html, extra_css))
                total += 1
    if not only:
        (ROOT / "index.html").write_text(gallery(entries))
    print(f"built {total} files in {len(entries)} milestones -> {ROOT}")


if __name__ == "__main__":
    main()

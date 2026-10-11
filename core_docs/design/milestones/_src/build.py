"""Build the Saarthi milestone screens ("The Wheel" look, dark only) from one source.

    python3 core_docs/design/milestones/_src/build.py                    # all milestones + index.html
    python3 core_docs/design/milestones/_src/build.py M4_checks_proof_card  # one milestone only

Input:  _src/screens/<milestone folder>/<NN_slug>.html   (one fragment per screen)
Output: <milestone folder>/<NN_slug>.html and index.html (gallery of all screens)
Spec:   core_docs/design/2026-10-11-wheel-ui-design.md

A fragment starts with one JSON comment (front matter), then plain HTML:

    <!-- {"title": "Home", "note": "The Wheel. F1.3, F16.2", "shell": "app", "nav": "home", "dock": "full"} -->
    <div class="wheel-wrap"> ... </div>

shell = "app"  -> top bar + agents dock/rail are added. Optional keys:
    nav           home | board | memory | playbooks | settings   (old names: deck = home, room = board)
    dock          "full" (Home only) or "rail" (default)
    project       name shown in the project picker ("" shows "Add a project")
    needs         Needs You count (default 0)
    cost          today's cost (default "$4.12")
    agents        [{"tag": "cl|cx", "task": "T-0012", "title": "Reset API", "state": "needs you",
                    "tone": "road|bad|ok|muted", "line": "build · 18m", "cost": "$0.62"}, ...]
    slots         agent slots, a number (old text like "2 of 4" also works); default 4
    daemon        {"dot": "green", "pulse": false, "label": "saarthid running", "sub": "127.0.0.1:7878 · v0.9",
                   "note": "..."}   (label/sub/note may hold HTML)
    after_topbar  HTML placed under the top bar (status bars)
shell = "bare" -> nothing added (spike windows, CLI terminals, first-run wizard)

Drawings, expanded at build time by wheel_svg.py:
    <x-wheel data='{"beads": [...], "counts": {...}, "hub": {...}, "lit": [...], "size": 520}'></x-wheel>
    <x-journey stage="run" tone="road" size="46" notches="0.2,0.6"></x-journey>
    <x-trust checks="50" criteria="28" second="8" size="250" label="TRUST SCORE"></x-trust>

Optional _src/screens/<folder>/_shared.css is added to every screen of that milestone.
Fragments must not hold color values (hex, rgb, oklch, hsl) in CSS. The build stops if they do.
"""

from __future__ import annotations

import html
import json
import re
import shutil
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))
import wheel_svg  # noqa: E402

ROOT = SRC.parent
SCREENS = SRC / "screens"

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

NAV = [("home", "Home"), ("board", "Board"), ("memory", "Memory"), ("playbooks", "Playbooks")]
NAV_ALIASES = {"deck": "home", "room": "board"}
DEFAULT_AGENTS = [
    {"tag": "cl", "task": "T-0018", "title": "Invoice PDF", "state": "writing tests", "tone": "muted",
     "line": "build · 12m", "cost": "$0.38"},
    {"tag": "cx", "task": "T-0027", "title": "Event replay", "state": "running", "tone": "muted",
     "line": "fix · 4m", "cost": "$0.11"},
]
DEFAULT_DAEMON = {"dot": "green", "pulse": False, "label": "saarthid running", "sub": "127.0.0.1:7878 · v0.9"}

FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700'
    '&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">'
)
COLOR_LITERAL = re.compile(r"#[0-9a-fA-F]{3,8}\b(?![\w-])|\brgba?\(|\boklch\(|\bhsla?\(")
FRONT = re.compile(r"\A\s*<!--\s*(\{.*?\})\s*-->", re.S)
X_WHEEL = re.compile(r"<x-wheel\s+data='(.*?)'\s*>\s*</x-wheel>", re.S)
X_JOURNEY = re.compile(r"<x-journey\s+([^>]*)>\s*</x-journey>")
X_TRUST = re.compile(r"<x-trust\s+([^>]*)>\s*</x-trust>")
ATTR = re.compile(r'([\w-]+)="([^"]*)"')
X_LEFT = re.compile(r"<x-(wheel|journey|trust)\b")
LOGO = (
    '<svg class="logo-w" width="30" height="30" viewBox="0 0 34 34" aria-hidden="true">'
    '<circle class="lw-rim" cx="17" cy="17" r="14"/>'
    '<g class="lw-spoke"><line x1="17" y1="3" x2="17" y2="31"/><line x1="3" y1="17" x2="31" y2="17"/>'
    '<line x1="7.1" y1="7.1" x2="26.9" y2="26.9"/><line x1="26.9" y1="7.1" x2="7.1" y2="26.9"/></g>'
    '<circle class="lw-hub" cx="17" cy="17" r="4.5"/></svg>'
)


def _e(value: object) -> str:
    return html.escape(str(value))


def slot_count(value: object) -> int:
    numbers = re.findall(r"\d+", str(value))
    if not numbers:
        sys.exit(f"slots must hold a number, got {value!r}")
    return int(numbers[-1])


def parse(path: Path) -> tuple[dict, str]:
    raw = path.read_text()
    m = FRONT.match(raw)
    if not m:
        sys.exit(f"{path}: missing front matter comment")
    try:
        meta = json.loads(m.group(1))
    except json.JSONDecodeError as err:
        sys.exit(f"{path}: front matter is not valid JSON: {err}")
    body = raw[m.end():].strip()
    css_bits = re.findall(r'style="([^"]*)"', body) + re.findall(r"<style>(.*?)</style>", body, re.S)
    for bit in css_bits:
        bad = COLOR_LITERAL.search(bit)
        if bad:
            sys.exit(f"{path}: color literal '{bad.group(0)}' in CSS '{bit[:60]}'. Use theme variables.")
    for key in ("title", "note", "shell"):
        if key not in meta:
            sys.exit(f"{path}: front matter needs '{key}'")
    return meta, body


def expand(body: str, where: str) -> str:
    """Replace <x-wheel>, <x-journey> and <x-trust> with SVG."""

    def attrs(text: str) -> dict:
        return {k: html.unescape(v) for k, v in ATTR.findall(text)}

    def do_wheel(m: re.Match) -> str:
        return wheel_svg.wheel(json.loads(html.unescape(m.group(1))))

    def do_journey(m: re.Match) -> str:
        a = attrs(m.group(1))
        notches = tuple(float(x) for x in a.get("notches", "").split(",") if x.strip())
        return wheel_svg.journey(a["stage"], int(a.get("size", 46)), a.get("tone", "road"), notches)

    def do_trust(m: re.Match) -> str:
        a = attrs(m.group(1))
        return wheel_svg.trust_ring(float(a.get("checks", 0)), float(a.get("criteria", 0)),
                                    float(a.get("second", 0)), int(a.get("size", 250)),
                                    a.get("label", "TRUST SCORE"))

    try:
        body = X_WHEEL.sub(do_wheel, body)
        body = X_JOURNEY.sub(do_journey, body)
        body = X_TRUST.sub(do_trust, body)
    except (ValueError, KeyError, TypeError, AttributeError, json.JSONDecodeError) as err:
        sys.exit(f"{where}: bad drawing tag: {err}")
    left = X_LEFT.search(body)
    if left:
        sys.exit(f"{where}: <x-{left.group(1)}> was not expanded. "
                 f"Use <x-{left.group(1)} ...></x-{left.group(1)}> and put data= first.")
    return body


def _spark(seed: str) -> str:
    n = int(re.sub(r"\D", "", seed) or 7)
    points = []
    for i in range(11):
        n = (n * 1103515245 + 12345) % 2**31
        points.append(f"{i * 20},{3 + n % 13}")
    return " ".join(points)


def _agent_card(a: dict) -> str:
    tone = a.get("tone", "muted")
    return (
        f'<div class="ag-card{" wait" if tone == "road" else ""}">'
        f'<span class="agent {a["tag"]}">{a["tag"].upper()}</span>'
        f'<span class="ag-t ellipsis">{_e(a["task"])} · {_e(a.get("title", ""))}</span>'
        f'<span class="ag-s tone-{tone}">{_e(a.get("state", ""))}</span>'
        f'<svg class="spark spark-{a["tag"]}" viewBox="0 0 200 18" preserveAspectRatio="none">'
        f'<polyline points="{_spark(a["task"])}"/></svg>'
        f'<div class="ag-m"><span>{_e(a.get("line", ""))}</span><span>{_e(a.get("cost", ""))}</span></div></div>'
    )


def _rail_item(a: dict) -> str:
    tone = a.get("tone", "muted")
    return (
        f'<div class="ra{" wait" if tone == "road" else ""}" title="{_e(a["task"])} · {_e(a.get("state", ""))}">'
        f'<span class="agent {a["tag"]}">{a["tag"].upper()}</span><i class="ra-dot tone-bg-{tone}"></i></div>'
        f'<small>{_e(a["task"][-2:])}</small>'
    )


def app_shell(meta: dict, body: str) -> str:
    nav = NAV_ALIASES.get(meta.get("nav", "home"), meta.get("nav", "home"))
    dock = meta.get("dock", "rail")
    project = meta.get("project", "acme-billing")
    needs = int(meta.get("needs", 0))
    agents = meta.get("agents", DEFAULT_AGENTS)
    free = max(0, slot_count(meta.get("slots", 4)) - len(agents))
    d = {**DEFAULT_DAEMON, **meta.get("daemon", {})}

    links = "".join(f'<a class="on">{label}</a>' if key == nav else f"<a>{label}</a>" for key, label in NAV)
    if needs:
        pill = f'<button class="needs-pill"><span class="dot road pulse"></span>{needs} need{"s" if needs == 1 else ""} you</button>'
    else:
        pill = '<button class="needs-pill zero">0 need you</button>'
    dot = f'<span class="dot {d["dot"]}{" pulse" if d.get("pulse") else ""}"></span>'
    if dock == "full":
        note = f'<div class="note">{d["note"]}</div>' if d.get("note") else ""
        side = (
            f'<aside class="dock"><div class="dock-h"><span>Agents</span><span>{len(agents)} of {len(agents) + free}</span></div>'
            + "".join(_agent_card(a) for a in agents)
            + '<div class="ag-card free">+ Free slot · start a run</div>' * free
            + f'<div class="grow"></div><div class="daemon">{dot}<div><b>{d["label"]}</b><small>{d["sub"]}</small>{note}</div></div></aside>'
        )
    else:
        side = (
            '<aside class="rail">'
            + "".join(_rail_item(a) for a in agents)
            + '<div class="ra free">+</div>' * free
            + f'<div class="grow"></div><div class="daemon mini" title="{_e(re.sub("<[^>]+>", "", d["label"]))}">{dot}</div></aside>'
        )
    return f"""<div class="app">
<header class="topbar">
  <div class="brand">{LOGO}<span>Saarthi</span></div>
  <button class="proj-pick"><span class="mono">{_e(project) if project else 'Add a project'}</span><span class="faint">▾</span></button>
  <nav class="navs">{links}</nav>
  <div class="grow"></div>
  {pill}
  <button class="search-btn"><span class="ellipsis">Search or run a command…</span><span class="kbd">Ctrl K</span></button>
  <button class="gear{' on' if nav == 'settings' else ''}" title="Settings">⚙</button>
  <div class="cost-box"><span class="mono">{_e(meta.get('cost', '$4.12'))}</span><small>today</small></div>
</header>
<div class="after-top">{meta.get('after_topbar', '')}</div>
<div class="frame {'full' if dock == 'full' else 'rail'}">
{side}
<div class="content">
{body}
</div>
</div>
</div>"""


def proto_nav(code: str, title: str, files: list[str], i: int) -> str:
    prev_link = f'<a href="{files[i - 1]}">&larr; prev</a>' if i > 0 else '<span class="faint">&larr; prev</span>'
    next_link = f'<a href="{files[i + 1]}">next &rarr;</a>' if i < len(files) - 1 else '<span class="faint">next &rarr;</span>'
    return (
        f'<div class="proto-nav"><span class="handle" title="Design navigator">{code} {i + 1}/{len(files)}</span>'
        f'<span class="more"><a href="../index.html">All screens</a><span class="sep">|</span>'
        f'<span>{code} · {i + 1}/{len(files)} · {_e(title)}</span><span class="sep">|</span>{prev_link}{next_link}</span></div>'
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


def css() -> str:
    return (SRC / "theme.css").read_text() + "\n" + (SRC / "base.css").read_text()


def page(meta: dict, body: str, code: str, nav_html: str, extra_css: str = "") -> str:
    inner = app_shell(meta, body) if meta["shell"] == "app" else body
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Saarthi {code} · {_e(meta['title'])}</title>
<meta name="description" content="{_e(meta['note'])}">
{FONTS}
<style>
{css()}
{extra_css}
.after-top:empty {{ display: none; }}
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
        trs = "".join(
            f'<tr><td class="mono faint">{i + 1:02d}</td><td><a href="{folder}/{f}"><b>{_e(m["title"])}</b></a>'
            f'<div class="small muted">{_e(m["note"])}</div></td></tr>'
            for i, (f, m) in enumerate(rows)
        )
        sections.append(
            f'<section class="card"><div class="card-head"><h2>{code} · {name}</h2>'
            f'<span class="small muted">{len(rows)} screens · <span class="mono">{folder}/</span></span></div>'
            f'<table class="table"><tbody>{trs}</tbody></table></section>'
        )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Saarthi Milestone Screens</title>{FONTS}<style>{css()}</style></head>
<body><div class="page narrow">
<div class="page-head"><div class="row gap-12">{LOGO}<div>
<h1 class="title">Saarthi · UI by milestone</h1>
<div class="muted">"The Wheel" look, dark only. Built from <span class="mono">_src/</span>.
Spec: <span class="mono">core_docs/design/2026-10-11-wheel-ui-design.md</span>.</div></div></div></div>
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
        out = ROOT / folder
        out.mkdir(parents=True, exist_ok=True)
        for old_theme_dir in ("light", "dark"):
            if (out / old_theme_dir).is_dir():
                shutil.rmtree(out / old_theme_dir)
        for old in out.glob("*.html"):
            if old.name not in files:
                old.unlink()
        for i, (f, (meta, body)) in enumerate(zip(files, parsed)):
            body = expand(body, str(src_dir / f))
            (out / f).write_text(page(meta, body, code, proto_nav(code, meta["title"], files, i), extra_css))
            total += 1
    if not only:
        (ROOT / "index.html").write_text(gallery(entries))
    print(f"built {total} files in {len(entries)} milestones -> {ROOT}")


if __name__ == "__main__":
    main()

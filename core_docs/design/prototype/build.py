"""Build the one-file prototype: core_docs/design/Saarthi Prototype.html

    python3 core_docs/design/prototype/build.py           # build + static checks
    python3 core_docs/design/prototype/build.py --test    # also run ?selftest in headless Chrome

Sources (this folder): styles.css, core.js, data.js, views/main.js, then the other views/*.js
in name order. Output is one self-contained HTML file (fonts load from Google Fonts, with
system-font fallback when offline). views.json lists every screen for shoot.py and the docs.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "Saarthi Prototype.html"
CHROME = "google-chrome"
FONTS = (
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700"
    "&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap"
)
VIEW_RE = re.compile(r"view\('([A-Za-z0-9]+)',\s*\{title:\s*'((?:[^'\\]|\\.)*)',\s*area:\s*'([^']*)'(?:,\s*ms:\s*'([^']*)')?")
GO_RE = re.compile(r"""data-go="([A-Za-z0-9]+)"|\bgo:\s*'([A-Za-z0-9]+)'|\bgo\('([A-Za-z0-9]+)'|\bto:\s*'([A-Za-z0-9]+)'|\blinked:\s*'([A-Za-z0-9]+)'""")
COLOR_RE = re.compile(r"[:(,]\s*(#[0-9a-fA-F]{3,8})\b")


def sources() -> list[Path]:
    views = sorted(p for p in (HERE / "views").glob("*.js") if p.name != "main.js")
    return [HERE / "core.js", HERE / "data.js", HERE / "views" / "main.js", *views]


def check(js: dict[Path, str]) -> tuple[list[dict], list[str]]:
    errors: list[str] = []
    views: list[dict] = []
    for path, text in js.items():
        for m in VIEW_RE.finditer(text):
            views.append({"id": m[1], "title": m[2].replace("\\'", "'"), "area": m[3], "ms": m[4] or "", "file": path.name})
    ids = [v["id"] for v in views]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        errors.append(f"duplicate view ids: {dupes}")
    known = set(ids)
    for path, text in js.items():
        for m in GO_RE.finditer(text):
            target = next(g for g in m.groups() if g)
            if target not in known:
                errors.append(f"{path.name}: link to missing view '{target}'")
        if path.parent.name == "views":
            # colours come from tokens in styles.css; the only literal allowed is the logo amber
            for c in COLOR_RE.findall(text):
                if c.upper() not in {"#E9A23B"}:
                    errors.append(f"{path.name}: colour literal {c} (use a token from styles.css)")
    return views, errors


def build() -> list[dict]:
    js = {p: p.read_text() for p in sources()}
    views, errors = check(js)
    if "--stubs" in sys.argv:  # while screens are being written: placeholder views for missing links
        missing = sorted({e.split("'")[1] for e in errors if "missing view" in e})
        js[HERE / "stubs.js"] = "\n".join(
            f"view('{m}', {{title: 'TODO {m}', area: 'Notes'}}, () => page('<h1>TODO: {m}</h1>'));" for m in missing)
        errors = [e for e in errors if "missing view" not in e]
    if errors:
        sys.exit("build failed:\n  " + "\n  ".join(errors))
    css = (HERE / "styles.css").read_text()
    script = "\n".join(f"/* ---- {p.relative_to(HERE)} ---- */\n{t}" for p, t in js.items())
    html = f"""<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Saarthi Prototype</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="{FONTS}">
<!-- Built by core_docs/design/prototype/build.py. Do not edit by hand; edit the sources in prototype/. -->
<style>
{css}
</style>
</head>
<body>
<div id="app"></div>
<script>
{script}
boot();
</script>
</body>
</html>
"""
    OUT.write_text(html)
    (HERE / "views.json").write_text(json.dumps(views, indent=1) + "\n")
    if "--stubs" not in sys.argv:
        write_screen_table(views)
    print(f"built {OUT.name}: {len(views)} screens, {len(html) // 1024} KB")
    return views


def write_screen_table(views: list[dict]) -> None:
    """Fill the "Screens per milestone" table in ../README.md from the views."""
    readme = HERE.parent / "README.md"
    rows = ["| Milestone | Screens (open as `Saarthi Prototype.html#<id>`) |", "|---|---|"]
    for m in [f"M{i}" for i in range(13)]:
        ids = [f"`{v['id']}` {v['title']}" for v in views if m in v["ms"].split()]
        rows.append(f"| {m} | {' · '.join(ids) or '-'} |")
    text = readme.read_text()
    start, end = "<!-- screens:start -->", "<!-- screens:end -->"
    head, rest = text.split(start, 1)
    readme.write_text(head + start + "\n" + "\n".join(rows) + "\n" + end + rest.split(end, 1)[1])


def selftest() -> None:
    with tempfile.TemporaryDirectory() as profile:
        r = subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", f"--user-data-dir={profile}",
             "--virtual-time-budget=8000", "--dump-dom", OUT.as_uri() + "?selftest"],
            capture_output=True, text=True, timeout=180, check=False,
        )
    m = re.search(r'<h1 id="selftest">([^<]*)</h1>.*?<div class="codebox">(.*?)</div>', r.stdout, re.S)
    if not m:
        sys.exit("selftest did not run:\n" + r.stdout[-2000:] + r.stderr[-2000:])
    print("selftest:", m[1])
    if not m[1].startswith("PASS"):
        sys.exit(m[2].replace("&quot;", '"'))


if __name__ == "__main__":
    build()
    if "--test" in sys.argv:
        selftest()

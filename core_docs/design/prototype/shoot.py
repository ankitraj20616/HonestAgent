"""Screenshot every prototype screen with headless Chrome.

    python3 core_docs/design/prototype/shoot.py OUT_DIR                 # all screens, 1440x900, dark
    python3 core_docs/design/prototype/shoot.py OUT_DIR home check      # some screens
    python3 core_docs/design/prototype/shoot.py OUT_DIR --size 1366x768 --theme light

Run build.py first. PNG names: <id>.png
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROTO = HERE.parent / "Saarthi Prototype.html"
CHROME = "google-chrome"


def shoot(view_id: str, png: Path, size: str, theme: str) -> None:
    png.unlink(missing_ok=True)
    url = f"{PROTO.as_uri()}?noproto&theme={theme}#{view_id}"
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
             f"--user-data-dir={profile}", f"--window-size={size.replace('x', ',')}",
             "--virtual-time-budget=5000", f"--screenshot={png}", url],
            capture_output=True, timeout=120, check=False,
        )


def main() -> None:
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    size = args[args.index("--size") + 1] if "--size" in args else "1440x900"
    theme = args[args.index("--theme") + 1] if "--theme" in args else "dark"
    rest = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] not in ("--size", "--theme"))]
    out = Path(rest[0]).resolve()
    out.mkdir(parents=True, exist_ok=True)
    ids = rest[1:] or [v["id"] for v in json.loads((HERE / "views.json").read_text())]
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda i: shoot(i, out / f"{i}.png", size, theme), ids))
    missing = [i for i in ids if not (out / f"{i}.png").exists()]
    print(f"{len(ids) - len(missing)} of {len(ids)} screenshots in {out}")
    if missing:
        sys.exit(f"missing: {missing}")


if __name__ == "__main__":
    main()

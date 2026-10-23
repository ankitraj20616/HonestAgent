"""Screenshot built screens with headless Chrome at 1440 x 900.

    python3 core_docs/design/milestones/_src/shoot.py OUT_DIR                     # every milestone
    python3 core_docs/design/milestones/_src/shoot.py OUT_DIR M3_desktop_ui_v1    # some milestones

PNG names: <milestone folder>__<screen>.png
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME = "google-chrome"


def shoot(html_file: Path, png: Path) -> None:
    png.unlink(missing_ok=True)  # an old PNG must not count as a new screenshot
    with tempfile.TemporaryDirectory() as profile:
        try:
            subprocess.run(
                [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
                 f"--user-data-dir={profile}", "--window-size=1440,900", "--virtual-time-budget=4000",
                 f"--screenshot={png}", html_file.as_uri()],
                capture_output=True, timeout=120, check=False,
            )
        except subprocess.TimeoutExpired:
            print(f"timeout: {html_file}", file=sys.stderr)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = Path(sys.argv[1]).resolve()
    out.mkdir(parents=True, exist_ok=True)
    folders = sys.argv[2:] or sorted(p.name for p in ROOT.iterdir() if p.is_dir() and p.name[:1] == "M")
    jobs = [(h, out / f"{f}__{h.stem}.png") for f in folders for h in sorted((ROOT / f).glob("*.html"))]
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda job: shoot(*job), jobs))
    missing = [str(png) for _h, png in jobs if not png.exists()]
    print(f"{len(jobs) - len(missing)} of {len(jobs)} screenshots in {out}")
    if missing:
        sys.exit(f"missing: {missing[:5]}")


if __name__ == "__main__":
    main()

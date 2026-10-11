"""Shared SVG drawings for Saarthi screens: The Wheel, the journey Wheel, the Trust ring.

All colors come from CSS classes in base.css. This module never writes a color value.
Spec: core_docs/design/2026-10-11-wheel-ui-design.md (sections 6 and 7).
"""

from __future__ import annotations

import html
import math

STAGES = ("capture", "research", "brief", "run", "verify", "review", "ship", "remember")
BEAD_TONES = ("road", "ok", "bad", "info", "idle")

_VIEW = 520  # the big Wheel is drawn in a 520 x 520 box
_C = _VIEW / 2
_RIM = 190.0
_LABEL_R = 232.0
_BEAD_STEP = 9.0  # degrees between beads that share a spoke


def _e(value: object) -> str:
    return html.escape(str(value))


def stage_angle(stage: str) -> float:
    """SVG angle in degrees (0 = 3 o'clock, clockwise). Capture sits at 12 o'clock."""
    if stage not in STAGES:
        raise ValueError(f"unknown stage {stage!r}; use one of {STAGES}")
    return -90.0 + 45.0 * STAGES.index(stage)


def point(cx: float, cy: float, r: float, deg: float) -> tuple[float, float]:
    a = math.radians(deg)
    return round(cx + r * math.cos(a), 1), round(cy + r * math.sin(a), 1)


def spread(n: int, step: float = _BEAD_STEP) -> list[float]:
    """Centered angle offsets for n beads on one spoke."""
    return [round((i - (n - 1) / 2) * step, 2) for i in range(n)]


def trust_tone(total: float) -> str:
    if total >= 70:
        return "ok"
    if total >= 40:
        return "road"
    return "bad"


def _arc(cls: str, center: float, r: float, start_deg: float, length: float) -> str:
    """A circle stroke that only shows `length` units, starting at `start_deg`."""
    circ = 2 * math.pi * r
    return (
        f'<circle class="{cls}" cx="{center}" cy="{center}" r="{r}" '
        f'stroke-dasharray="{length:.1f} {circ - length:.1f}" '
        f'transform="rotate({start_deg:.1f} {center} {center})"/>'
    )


def _spokes(cls: str, center: float, r: float) -> list[str]:
    out = []
    for k in range(4):
        x1, y1 = point(center, center, r, -90 + 45 * k)
        x2, y2 = point(center, center, r, 90 + 45 * k)
        out.append(f'<line class="{cls}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>')
    return out


def _beads(beads: list[dict]) -> list[str]:
    by_stage: dict[str, list[dict]] = {}
    for bead in beads:
        stage_angle(bead["stage"])
        if bead.get("tone", "idle") not in BEAD_TONES:
            raise ValueError(f"bead tone must be one of {BEAD_TONES}, got {bead.get('tone')!r}")
        by_stage.setdefault(bead["stage"], []).append(bead)

    out: list[str] = []
    for stage, group in by_stage.items():
        base = stage_angle(stage)
        placed = []
        for bead, offset in zip(group, spread(len(group))):
            deg = base + offset
            x, y = point(_C, _C, _RIM, deg)
            placed.append((bead, x, y, deg))
        links: dict[str, list[float]] = {}
        for bead, _x, _y, deg in placed:
            if bead.get("link"):
                links.setdefault(bead["link"], []).append(deg)
        for degs in links.values():
            if len(degs) > 1:
                start, end = min(degs), max(degs)
                out.append(_arc("b-link", _C, _RIM, start, 2 * math.pi * _RIM * (end - start) / 360))
        for bead, x, y, _deg in placed:
            tone = bead.get("tone", "idle")
            size = float(bead.get("r", 14))
            dim = f' opacity="{float(bead["dim"])}"' if "dim" in bead else ""
            if bead.get("halo"):
                out.append(f'<circle class="b-halo" cx="{x}" cy="{y}" r="{size + 9}"/>')
            out.append(f'<circle class="b-{tone}" cx="{x}" cy="{y}" r="{size}"{dim}/>')
            if bead.get("n"):
                out.append(
                    f'<text class="b-txt b-txt-{tone}" x="{x}" y="{y + 3.5}" text-anchor="middle"{dim}>'
                    f"{_e(bead['n'])}</text>"
                )
    return out


def wheel(data: dict) -> str:
    """The big Wheel. data keys: beads, counts, hub, lit, size, capture_plus."""
    size = int(data.get("size", _VIEW))
    c = _C
    out = [
        f'<svg class="wheel" width="{size}" height="{size}" viewBox="0 0 {_VIEW} {_VIEW}" '
        f'role="img" aria-label="The Wheel">',
        f'<circle class="w-ring" cx="{c}" cy="{c}" r="238"/>',
        f'<circle class="w-rim" cx="{c}" cy="{c}" r="{_RIM}"/>',
    ]
    segment = 2 * math.pi * _RIM / 8
    for stage in data.get("lit", []):
        out.append(_arc("w-lit", c, _RIM, stage_angle(stage) - 22.5, segment))
    out += _spokes("w-spoke", c, _RIM)
    out.append(f'<circle class="w-hubglow" cx="{c}" cy="{c}" r="96"/>')
    out.append(f'<circle class="w-hub" cx="{c}" cy="{c}" r="70"/>')
    hub = data.get("hub") or {}
    if hub:
        out.append(f'<text class="w-big" x="{c}" y="{c - 4}" text-anchor="middle">{_e(hub.get("big", ""))}</text>')
        out.append(f'<text class="w-sub" x="{c}" y="{c + 19}" text-anchor="middle">{_e(hub.get("sub", ""))}</text>')
    counts = data.get("counts", {})
    for stage in STAGES:
        x, y = point(c, c, _LABEL_R, stage_angle(stage))
        out.append(f'<text class="w-lbl" x="{x}" y="{y + 4}" text-anchor="middle">{stage.upper()}</text>')
        if stage in counts:
            out.append(f'<text class="w-n" x="{x}" y="{y + 18}" text-anchor="middle">{_e(counts[stage])}</text>')
    beads = data.get("beads", [])
    if data.get("capture_plus", True):
        n_capture = sum(1 for b in beads if b.get("stage") == "capture")
        offset = (n_capture - 1) / 2 * _BEAD_STEP + 11 if n_capture else 0
        x, y = point(c, c, _RIM, stage_angle("capture") + offset)
        out.append(f'<circle class="b-plus" cx="{x}" cy="{y}" r="12"/>')
        out.append(f'<text class="b-plus-t" x="{x}" y="{y + 4.5}" text-anchor="middle">+</text>')
    out += _beads(beads)
    out.append("</svg>")
    return "".join(out)


def journey(stage: str, size: int = 46, tone: str = "road", notches: tuple[float, ...] = ()) -> str:
    """Small Wheel for one task: the arc is filled up to the current stage."""
    angle = stage_angle(stage)
    if tone not in BEAD_TONES:
        raise ValueError(f"tone must be one of {BEAD_TONES}, got {tone!r}")
    index = STAGES.index(stage)
    c, r = 23, 19
    done = 2 * math.pi * r * index / 8
    out = [
        f'<svg class="journey" width="{size}" height="{size}" viewBox="0 0 46 46" '
        f'role="img" aria-label="Stage {index + 1} of 8">',
        f'<circle class="j-rim" cx="{c}" cy="{c}" r="{r}"/>',
    ]
    if done:
        out.append(_arc("j-done", c, r, -90, done))
    out += _spokes("j-spoke", c, r)
    for f in notches:
        if not 0 <= f <= 1:
            raise ValueError(f"notch must be between 0 and 1, got {f}")
        deg = -90 + 360 * f
        x1, y1 = point(c, c, 15, deg)
        x2, y2 = point(c, c, 22.5, deg)
        out.append(f'<line class="j-notch" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>')
    out.append(f'<circle class="j-hub" cx="{c}" cy="{c}" r="3.5"/>')
    x, y = point(c, c, r, angle)
    out.append(f'<circle class="j-now j-now-{tone}" cx="{x}" cy="{y}" r="5"/>')
    out.append("</svg>")
    return "".join(out)


def trust_ring(checks: float, criteria: float, second: float, size: int = 250, label: str = "TRUST SCORE") -> str:
    """Trust score ring. checks 0..50, criteria 0..35, second opinion 0..15 (spec section 7)."""
    for name, value, top in (("checks", checks, 50), ("criteria", criteria, 35), ("second", second, 15)):
        if not 0 <= value <= top:
            raise ValueError(f"{name} must be between 0 and {top}, got {value}")
    total = round(checks + criteria + second)

    if size >= 120:
        c, r = 125, 100
        circ = 2 * math.pi * r
        out = [
            f'<svg class="trust" width="{size}" height="{size}" viewBox="0 0 250 250" '
            f'role="img" aria-label="Trust score {total}">',
            f'<circle class="tr-bg" cx="{c}" cy="{c}" r="{r}"/>',
        ]
        start = -90.0
        for cls, value in (("tr-c", checks), ("tr-k", criteria), ("tr-s", second)):
            if value > 0:
                out.append(_arc(cls, c, r, start, circ * value / 100))
            start += 360 * value / 100
        out.append(f'<text class="tr-num" x="{c}" y="{c + 12}" text-anchor="middle">{total}</text>')
        out.append(f'<text class="tr-lbl" x="{c}" y="{c + 36}" text-anchor="middle">{_e(label)}</text>')
        out.append("</svg>")
        return "".join(out)

    tone = trust_tone(total)
    if size >= 40:
        c, r, view, text = 26, 21, 52, True
    else:
        c, r, view, text = 10, 7, 20, False
    circ = 2 * math.pi * r
    out = [
        f'<svg class="trust-sm" width="{size}" height="{size}" viewBox="0 0 {view} {view}" '
        f'role="img" aria-label="Trust score {total}">',
        f'<circle class="tr-bg{"-mini" if not text else ""}" cx="{c}" cy="{c}" r="{r}"/>',
        _arc(f"tr-{tone}", c, r, -90, circ * total / 100),
    ]
    if text:
        out.append(f'<text class="tr-num-sm" x="{c}" y="{c + 5}" text-anchor="middle">{total}</text>')
    out.append("</svg>")
    return "".join(out)

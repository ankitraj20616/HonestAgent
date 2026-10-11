import re

import pytest

import wheel_svg as w

COLOR = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(|hsla?\(")


def test_stage_order_starts_at_top_and_goes_clockwise():
    assert w.STAGES[0] == "capture"
    assert w.stage_angle("capture") == -90.0
    assert w.stage_angle("brief") == 0.0
    assert w.stage_angle("verify") == 90.0
    assert w.stage_angle("remember") == 225.0


def test_unknown_stage_is_an_error():
    with pytest.raises(ValueError):
        w.stage_angle("inbox")


def test_point_on_circle():
    assert w.point(260, 260, 190, -90) == (260.0, 70.0)
    assert w.point(260, 260, 190, 0) == (450.0, 260.0)


def test_spread_centers_beads_on_a_spoke():
    assert w.spread(1) == [0.0]
    assert w.spread(2) == [-4.5, 4.5]
    assert w.spread(3) == [-9.0, 0.0, 9.0]


def test_wheel_draws_labels_hub_and_beads():
    svg = w.wheel({
        "beads": [{"n": "12", "stage": "run", "tone": "road", "halo": True}],
        "counts": {"run": "2"},
        "hub": {"big": "1", "sub": "NEEDS YOU"},
        "lit": ["run"],
    })
    assert svg.startswith("<svg")
    for stage in w.STAGES:
        assert f">{stage.upper()}<" in svg
    assert ">NEEDS YOU<" in svg
    assert 'class="b-road"' in svg and ">12<" in svg
    assert 'class="b-halo"' in svg
    assert 'class="w-lit"' in svg


def test_beads_on_the_same_spoke_do_not_overlap():
    svg = w.wheel({"beads": [{"n": "12", "stage": "run", "tone": "road"},
                             {"n": "18", "stage": "run", "tone": "road"}]})
    centers = re.findall(r'class="b-road" cx="([\d.]+)" cy="([\d.]+)"', svg)
    assert len(centers) == 2 and centers[0] != centers[1]


def test_linked_beads_get_an_arc():
    svg = w.wheel({"beads": [{"n": "12", "stage": "run", "tone": "road", "link": "race"},
                             {"n": "12", "stage": "run", "tone": "info", "link": "race"}]})
    assert 'class="b-link"' in svg


def test_bad_bead_tone_is_an_error():
    with pytest.raises(ValueError):
        w.wheel({"beads": [{"n": "1", "stage": "run", "tone": "purple"}]})


def test_journey_fills_the_stages_before_the_current_one():
    svg = w.journey("run")
    # 3 of 8 stages done: 3/8 of 2*pi*19 = 44.8; the rest is 74.6
    assert 'stroke-dasharray="44.8 74.6"' in svg
    assert 'aria-label="Stage 4 of 8"' in svg
    assert "j-now-road" in svg


def test_journey_at_capture_has_no_done_arc_and_draws_notches():
    svg = w.journey("capture", notches=(0.25, 0.5))
    assert "j-done" not in svg
    assert svg.count('class="j-notch"') == 2


def test_journey_rejects_notch_outside_0_1():
    with pytest.raises(ValueError):
        w.journey("run", notches=(1.5,))


def test_trust_ring_sums_the_three_parts():
    svg = w.trust_ring(50, 28, 8)
    assert ">86<" in svg
    assert 'class="tr-c"' in svg and 'class="tr-k"' in svg and 'class="tr-s"' in svg
    assert 'stroke-dasharray="314.2 314.2"' in svg  # checks = half the ring


def test_trust_ring_skips_empty_parts():
    svg = w.trust_ring(50, 28, 0)
    assert 'class="tr-s"' not in svg
    assert ">78<" in svg


def test_trust_ring_rejects_out_of_range_parts():
    with pytest.raises(ValueError):
        w.trust_ring(51, 0, 0)
    with pytest.raises(ValueError):
        w.trust_ring(0, 36, 0)
    with pytest.raises(ValueError):
        w.trust_ring(0, 0, 16)


def test_small_trust_rings_use_one_arc_colored_by_score():
    assert w.trust_tone(86) == "ok"
    assert w.trust_tone(55) == "road"
    assert w.trust_tone(41) == "road"
    assert w.trust_tone(39) == "bad"
    medium = w.trust_ring(50, 28, 8, size=52)
    assert 'class="tr-ok"' in medium and ">86<" in medium
    mini = w.trust_ring(20, 10, 0, size=18)
    assert 'class="tr-bad"' in mini and ">30<" not in mini


def test_no_drawing_contains_a_color_value():
    for svg in (w.wheel({"beads": [{"n": "1", "stage": "ship", "tone": "ok"}]}),
                w.journey("review", tone="ok"), w.trust_ring(50, 35, 15), w.trust_ring(10, 5, 0, size=18)):
        assert not COLOR.search(svg)

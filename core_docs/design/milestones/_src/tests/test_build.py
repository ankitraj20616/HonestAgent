import pytest

import build


def test_slots_accepts_number_or_old_text():
    assert build.slot_count(4) == 4
    assert build.slot_count("2 of 4") == 4
    assert build.slot_count("1 of 6 slots") == 6


def test_expand_replaces_drawing_tags():
    body = ('<x-journey stage="run"></x-journey>'
            '<x-trust checks="50" criteria="28" second="8" size="250"></x-trust>'
            """<x-wheel data='{"beads": [{"n": "12", "stage": "run", "tone": "road"}]}'></x-wheel>""")
    out = build.expand(body, "test")
    assert "<x-" not in out
    assert 'class="journey"' in out and 'class="trust"' in out and 'class="wheel"' in out


def test_expand_reads_notches():
    out = build.expand('<x-journey stage="review" tone="ok" notches="0.25,0.5"></x-journey>', "test")
    assert out.count('class="j-notch"') == 2


def test_bad_drawing_stops_the_build():
    with pytest.raises(SystemExit):
        build.expand('<x-journey stage="inbox"></x-journey>', "test")


def test_lint_stops_on_color_in_css(tmp_path):
    f = tmp_path / "01_x.html"
    f.write_text('<!-- {"title": "X", "note": "n", "shell": "bare"} -->\n<div style="color:#ff0000">x</div>')
    with pytest.raises(SystemExit):
        build.parse(f)


def test_lint_allows_hash_in_text(tmp_path):
    f = tmp_path / "01_x.html"
    f.write_text('<!-- {"title": "X", "note": "n", "shell": "bare"} -->\n<p>PR #142 opened</p>')
    meta, body = build.parse(f)
    assert meta["title"] == "X" and "#142" in body


def test_frame_full_dock_lists_agents_and_free_slots():
    html = build.app_shell({"title": "Home", "nav": "home", "dock": "full", "slots": 4,
                            "agents": [{"tag": "cl", "task": "T-0012", "title": "Reset API",
                                        "state": "needs you", "tone": "road", "line": "build · 18m", "cost": "$0.62"}]},
                           "<p>body</p>")
    assert 'class="frame full"' in html
    assert html.count('class="ag-card wait"') == 1
    assert html.count('class="ag-card free"') == 3
    assert '<a class="on">Home</a>' in html
    assert "<p>body</p>" in html


def test_frame_rail_and_old_nav_names():
    html = build.app_shell({"title": "Room", "nav": "room", "needs": 0}, "")
    assert 'class="frame rail"' in html
    assert '<a class="on">Board</a>' in html
    assert 'class="needs-pill zero"' in html


def test_settings_nav_lights_the_gear():
    html = build.app_shell({"title": "S", "nav": "settings"}, "")
    assert 'class="gear on"' in html


def test_m10_is_last_milestone():
    assert build.MILESTONES["M10_jira_tickets"] == ("M10", "Jira tickets")
    assert list(build.MILESTONES)[-1] == "M10_jira_tickets"


def test_tickets_link_only_when_asked():
    on = build.app_shell({"nav": "tickets"}, "")
    assert '<a class="on">Tickets</a>' in on
    flag = build.app_shell({"tickets": True, "nav": "board"}, "")
    assert "<a>Tickets</a>" in flag
    assert '<a class="on">Board</a>' in flag
    assert "Tickets" not in build.app_shell({"nav": "board"}, "")


@pytest.mark.parametrize("tag", [
    '<x-journey stage="run"/>',
    """<x-wheel size="300" data='{"beads": []}'></x-wheel>""",
    '<x-trust checks="50">',
])
def test_unexpanded_drawing_tag_stops_the_build(tag):
    with pytest.raises(SystemExit) as err:
        build.expand(tag, "screens/M0/01_x.html")
    assert "screens/M0/01_x.html" in str(err.value) and "data= first" in str(err.value)


@pytest.mark.parametrize("tag", [
    """<x-wheel data='[1, 2]'></x-wheel>""",
    """<x-wheel data='{"beads": [1]}'></x-wheel>""",
])
def test_wrong_drawing_data_shape_stops_the_build(tag):
    with pytest.raises(SystemExit):
        build.expand(tag, "test")


def test_bad_front_matter_json_names_the_file(tmp_path):
    f = tmp_path / "01_x.html"
    f.write_text('<!-- {"title": "X", "note": "n",} -->\n<p>x</p>')
    with pytest.raises(SystemExit) as err:
        build.parse(f)
    assert str(f) in str(err.value)


def test_drawing_attribute_values_are_unescaped():
    out = build.expand('<x-trust checks="50" label="Q&amp;A"></x-trust>', "test")
    assert ">Q&amp;A<" in out and "&amp;amp;" not in out

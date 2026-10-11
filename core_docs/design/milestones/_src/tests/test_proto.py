import json
import re

import pytest

import build
import proto


@pytest.fixture(scope="module")
def out() -> str:
    return proto.render()


def views_json(text: str) -> dict:
    m = re.search(r'<script type="application/json" id="views">(.*?)</script>', text, re.S)
    assert m, "views JSON block missing"
    return json.loads(m.group(1))


def outer_only(text: str) -> str:
    """The outer page without the views JSON and without the theme copy."""
    text = re.sub(r'<script type="application/json" id="views">.*?</script>', "", text, flags=re.S)
    return re.sub(r'<style id="theme">.*?</style>', "", text, flags=re.S)


def all_rules() -> list:
    rules = list(proto.GLOBAL_RULES) + list(proto.ROOM_RULES) + list(proto.DIALOG_RULES)
    for own in proto.CLICKS.values():
        rules += own
    return rules


def test_first_view_is_home():
    assert next(iter(proto.VIEWS)) == "home"


@pytest.mark.parametrize("view", list(proto.VIEWS))
def test_every_view_has_a_source_fragment(view):
    folder, stem = proto.VIEWS[view]
    assert folder in build.MILESTONES
    assert (build.SCREENS / folder / f"{stem}.html").is_file()


def test_every_click_rule_target_is_a_known_view():
    targets = {r.go for r in all_rules()} | set(proto.KEYS.values())
    unknown = targets - set(proto.VIEWS) - {proto.BACK}
    assert not unknown


def test_click_table_and_groups_name_only_known_views():
    assert set(proto.CLICKS) <= set(proto.VIEWS)
    assert proto.ROOM_VIEWS <= set(proto.VIEWS)
    assert proto.DIALOG_VIEWS <= set(proto.VIEWS)


def test_selftest_steps_expect_known_views():
    for step in proto.SELFTEST:
        assert step["expect"] in proto.VIEWS
    # the main flow comes first and ends at Shipped
    flow = [s["expect"] for s in proto.SELFTEST[:proto.MAIN_FLOW_STEPS]]
    assert flow == ["board", "room", "proof", "review", "ship", "shipped"]


def test_own_rules_name_classes_and_text_found_in_the_view():
    for view, rules in proto.CLICKS.items():
        page = proto.view_page(view)
        classes = set()
        for value in re.findall(r'class="([^"]*)"', page):
            classes.update(value.split())
        text = re.sub(r"<[^>]+>", " ", page)
        for rule in rules:
            for cls in re.findall(r"\.([\w-]+)", rule.sel):
                assert cls in classes, f"{view}: class .{cls} of {rule.sel!r} not in the page"
            if rule.text:
                assert rule.text in text, f"{view}: text {rule.text!r} not in the page"


def test_output_holds_every_view_and_no_proto_nav(out):
    pages = views_json(out)
    assert list(pages) == list(proto.VIEWS)
    assert "proto-nav" not in out


def test_every_view_page_is_the_built_page_plus_the_script(out):
    pages = views_json(out)
    for view, page in pages.items():
        assert page.startswith("<!doctype html>")
        assert 'id="pz-click"' in page and "parent.postMessage" in page
        assert build.FONTS in page
        assert view in page  # rules carry the view name


def test_outer_page_has_no_color_values_outside_the_theme_copy(out):
    theme = re.search(r'<style id="theme">(.*?)</style>', out, re.S)
    assert theme and (build.SRC / "theme.css").read_text().strip() in theme.group(1)
    bad = build.COLOR_LITERAL.search(outer_only(out))
    assert not bad, f"color value {bad.group(0)!r} in the outer page"


def test_outer_page_has_chip_hash_and_selftest(out):
    rest = outer_only(out)
    assert 'id="chip"' in rest
    assert "location.hash" in rest
    assert "selftest" in rest


def test_json_block_cannot_close_early(out):
    m = re.search(r'<script type="application/json" id="views">(.*?)</script>', out, re.S)
    assert m
    assert "</" not in m.group(1) and "<!--" not in m.group(1)


@pytest.mark.parametrize("view", list(proto.VIEWS))
def test_view_page_matches_the_built_screen(view):
    folder, stem = proto.VIEWS[view]
    built = (build.ROOT / folder / f"{stem}.html").read_text()
    built = re.sub(r'<div class="proto-nav">.*?</div>', "", built, flags=re.S)  # no nested div inside
    built = proto.PROTO_NAV_CSS.sub("", built)
    page = proto.view_page(view)
    page = page.replace(page[page.index('<style id="pz-click">'):page.index("</body>")], "")
    assert page == built


def test_hover_style_draws_no_box():
    css = proto.VIEW_SCRIPT[:proto.VIEW_SCRIPT.index("</style>")]
    assert "outline" not in css and "border" not in css and "box-shadow" not in css
    assert "cursor: pointer" in css
    assert ":not(svg):not(svg *):hover" in css  # the Wheel (SVG) gets the cursor only


def test_chip_sits_on_the_right_edge_and_has_fit_toggle(out):
    rest = outer_only(out)
    chip_css = re.search(r"#chip \{[^}]*\}", rest)
    assert chip_css and "right: 0" in chip_css.group(0) and "top: 50%" in chip_css.group(0)
    assert 'id="chip-fit"' in rest
    assert 'data-fit="fit"' in rest and 'data-fit="real"' in rest
    assert "localStorage" in rest and "resize" in rest


def test_docs_and_tickets_views_are_wired():
    for view in ("room-docs", "tickets", "ticket-start", "room-ticket", "ticket-confirm"):
        assert view in proto.VIEWS
    assert proto.Rule(".tab", "room-docs", "Docs") in proto.GLOBAL_RULES
    assert proto.Rule(".navs a", "tickets", "Tickets") in proto.GLOBAL_RULES
    assert "ticket-start" in proto.DIALOG_VIEWS
    assert {"room-docs", "room-ticket", "ticket-confirm"} <= proto.ROOM_VIEWS
    assert any(r.go == "ticket-start" for r in proto.CLICKS["tickets"])
    assert any(r.go == "ticket-confirm" for r in proto.CLICKS["ticket-start"])

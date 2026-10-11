"""Build the clickable Saarthi prototype ("The Wheel" look) from the approved milestone screens.

    python3 core_docs/design/milestones/_src/proto.py

Output: core_docs/design/Saarthi Prototype.html  (one self-contained file; fonts load from Google Fonts)

How it works
- Each view is one approved screen, rendered by build.py exactly like the built screen, without the review aid.
- The outer page keeps every view page as a string and shows one at a time in a full-window iframe (srcdoc),
  so the screens' own styles never clash.
- A small script is added to every view page. On a click it finds the first click rule that matches
  (CSS selector + optional text) and asks the outer page to go to that view.
- Keys: Esc = back, Ctrl+K = command bar, G then H/B/M/P = Home/Board/Memory/Playbooks, ? = shortcut sheet.
- URL: "#review" opens a view. "?selftest" walks the main flow with real clicks and writes PASS/FAIL in the
  page title; "?selftest&steps=3" stops after 3 steps (for screenshots).

Edit the tables below (VIEWS, GLOBAL_RULES, ROOM_RULES, DIALOG_RULES, CLICKS, KEYS) to change the prototype.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import NamedTuple

SRC = Path(__file__).resolve().parent
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))
import build  # noqa: E402

OUT = SRC.parent.parent / "Saarthi Prototype.html"

M3, M4, M5 = "M3_desktop_ui_v1", "M4_checks_proof_card", "M5_review_ship"
M6, M7, M8, M9 = "M6_research_memory_playbooks", "M7_race_mode", "M8_safety_cost_rewind", "M9_polish_package"

# view name -> (milestone folder, screen file stem). The first view opens first.
VIEWS: dict[str, tuple[str, str]] = {
    "home": (M3, "01_home"),
    "board": (M3, "02_task_board"),
    "room": (M3, "03_task_room_stream"),
    "room-terminal": (M3, "04_task_room_terminal"),
    "room-timeline": (M3, "05_task_room_timeline"),
    "room-code": (M3, "06_code_peek"),
    "start-run": (M3, "08_start_run_dialog"),
    "cmdk": (M3, "09_command_bar"),
    "capture": (M3, "10_quick_capture"),
    "settings": (M3, "11_settings_health"),
    "proof-failed": (M4, "02_proof_failed"),
    "proof": (M4, "03_proof_green"),
    "override": (M4, "05_override_dialog"),
    "review": (M5, "01_change_story"),
    "diff": (M5, "02_diff_comments"),
    "second-opinion": (M5, "03_second_opinion"),
    "ship": (M5, "04_ship_dialog"),
    "shipped": (M5, "05_shipped_cleanup"),
    "research": (M6, "01_research_desk"),
    "memory": (M6, "06_memory_screen"),
    "memory-updates": (M6, "08_memory_updates_on_ship"),
    "playbooks": (M6, "09_playbooks_library"),
    "race": (M7, "02_race_running"),
    "compare": (M7, "03_compare"),
    "safety": (M8, "03_safety_alert"),
    "cost": (M8, "04_cost_meter"),
    "rewind": (M8, "06_rewind_confirm"),
    "shortcuts": (M9, "09_shortcut_sheet"),
    "empty-home": (M9, "07_empty_deck"),
}

BACK = "back"  # special target: go back one view


class Rule(NamedTuple):
    """Click the closest element matching `sel` (and holding `text`, if set) -> go to view `go`.
    self_only: only a click right on that element counts (the dimmed area around a dialog)."""
    sel: str
    go: str
    text: str = ""
    self_only: bool = False


# ---------------------------------------------------------------------------------------------------
# Click rules. For one click the first matching rule wins, in this order:
#   CLICKS[view]  ->  DIALOG_RULES (dialog views)  ->  ROOM_RULES (task views)  ->  GLOBAL_RULES (app shell)
# ---------------------------------------------------------------------------------------------------

GLOBAL_RULES = [  # top bar, agents dock / rail, Task Room tabs: on every "app" screen
    Rule(".navs a", "home", "Home"),
    Rule(".navs a", "board", "Board"),
    Rule(".navs a", "memory", "Memory"),
    Rule(".navs a", "playbooks", "Playbooks"),
    Rule(".brand", "home"),
    Rule(".gear", "settings"),
    Rule(".search-btn", "cmdk"),
    Rule(".needs-pill:not(.zero)", "room"),
    Rule(".cost-box", "cost"),
    Rule(".dock .daemon", "settings"),
    Rule(".rail .daemon", "settings"),
    Rule(".dock .ag-card.free", "start-run"),
    Rule(".rail .ra.free", "start-run"),
    Rule(".dock .ag-card", "room"),
    Rule(".rail .ra", "room"),
    Rule(".tab", "room", "Stream"),
    Rule(".tab", "room-terminal", "Terminal"),
    Rule(".tab", "room-code", "Code"),
    Rule(".tab", "room-timeline", "Timeline"),
    Rule(".tab", "proof", "Proof"),
    Rule(".tab", "review", "Review"),
    Rule(".tab", "research", "Research"),
    Rule(".tab", "memory-updates", "Memory updates"),
]

ROOM_RULES = [  # task screens (Task Room and its tabs)
    Rule(".btn", "start-run", "Run agent"),
    Rule(".ws .btn", "room-terminal", "Terminal"),
    Rule(".ws .btn", "room-code", "Editor"),
    Rule(".run-row", "room-timeline"),
]

DIALOG_RULES = [  # dialogs and sheets over a screen
    Rule(".btn", BACK, "Cancel"),
    Rule(".btn", BACK, "Esc"),
    Rule(".scrim", BACK, self_only=True),
]

CLICKS: dict[str, list[Rule]] = {
    "home": [
        Rule(".ask-card", "room"),
        Rule(".rv-row", "review"),
        Rule(".mem-note", "memory"),
        Rule(".wheel .b-plus", "capture"),
        Rule(".wheel", "board"),
    ],
    "board": [
        Rule(".bcard.lifted", "start-run"),
        Rule(".bcard.failed", "proof-failed"),
        Rule(".bcard", "review", "Rate-limit the login endpoint"),
        Rule(".bcard", "research", "Upgrade Alembic"),
        Rule(".bcard", "memory-updates", "memory notes"),
        Rule(".bcard", "room"),
    ],
    "room": [
        Rule(".qa .btn", "proof"),  # answer the agent -> it finishes -> Proof Card
    ],
    "room-terminal": [],
    "room-timeline": [
        Rule(".tl-ev", "rewind", "Checkpoint"),
    ],
    "room-code": [],
    "start-run": [
        Rule(".btn", "room", "Start run"),
    ],
    "cmdk": [
        Rule(".cmd-item", "room", "Add password reset API"),
        Rule(".cmd-item", "room", "Invoice PDF"),
        Rule(".cmd-item", "proof-failed", "Event replay"),
        Rule(".cmd-item", "capture", "New task"),
        Rule(".cmd-item", "start-run", "Start run"),
        Rule(".cmd-item", "home", "Go to Home"),
        Rule(".cmd-item", "board", "Go to Board"),
        Rule(".cmd-item", "settings", "Go to Settings"),
        Rule(".cmd-input .kbd", BACK),
    ],
    "capture": [
        Rule(".cap-foot span", "board", "Enter"),
        Rule(".cap-foot span", BACK, "Esc"),
        Rule(".dimmer", BACK, self_only=True),
    ],
    "settings": [
        Rule(".btn", BACK, "Save"),
    ],
    "proof-failed": [
        Rule(".btn", "room", "Fix with agent"),
        Rule(".btn", "override", "Move to Review"),
        Rule(".btn", "room-terminal", "Open full log"),
        Rule(".btn", "proof", "Run checks"),
    ],
    "proof": [
        Rule(".btn", "review", "Confirm coverage"),
        Rule(".gate", "review"),  # "Gate passed · moved to Review"
    ],
    "override": [
        Rule(".btn", "review", "Move to Review"),
    ],
    "review": [
        Rule(".btn", "second-opinion", "Fix these"),
        Rule(".btn", "ship", "Approve"),
        Rule(".seg span", "diff", "Files"),
    ],
    "diff": [
        Rule(".btn", "room", "Send comments to agent"),
        Rule(".btn", "second-opinion", "Ask Codex"),
        Rule(".btn", "ship", "Approve"),
        Rule(".seg span", "review", "Story"),
    ],
    "second-opinion": [
        Rule(".btn", "room", "Fix these"),
        Rule(".btn", "ship", "Approve"),
    ],
    "ship": [
        Rule(".btn", "shipped", "Commit and ship"),
    ],
    "shipped": [
        Rule(".btn", "memory-updates", "Delete worktree"),
        Rule(".btn", "memory-updates", "Keep worktree"),
    ],
    "research": [
        Rule(".btn", "room", "Draft brief"),
        Rule(".btn", "room", "Research this"),
    ],
    "memory": [],  # top bar only; Home "Remembered this week" and memory updates lead here
    "memory-updates": [
        Rule(".btn.ok", "memory", "Approve"),
    ],
    "playbooks": [
        Rule(".btn", "start-run", "Use in a run"),
    ],
    "race": [
        Rule(".tab", "compare", "Compare"),
        Rule(".lane-col .btn", "compare"),  # answer the codex lane -> both lanes finish
        Rule(".btn", "room", "Cancel race"),
    ],
    "compare": [
        Rule(".tab", "race", "Stream"),
        Rule(".btn", "review", "Pick Claude"),
        Rule(".btn", "review", "Pick Codex"),
        Rule(".btn", "room", "Cancel race"),
    ],
    "safety": [
        Rule(".btn", "room", "Allow once"),
        Rule(".btn", "room", "Deny"),
        Rule(".btn", "room", "Stop run"),
    ],
    "cost": [
        Rule(".btn", "ship", "Ship"),
    ],
    "rewind": [
        Rule(".btn", "room-timeline", "Save and rewind"),
    ],
    "shortcuts": [],
    "empty-home": [
        Rule(".btn", "capture", "Capture your first task"),
        Rule(".btn", "settings", "Add project"),
    ],
}

ROOM_VIEWS = {"room", "room-terminal", "room-timeline", "room-code", "proof-failed", "proof", "review", "diff",
              "second-opinion", "research", "memory-updates", "race", "compare", "safety", "cost"}
DIALOG_VIEWS = {"start-run", "cmdk", "override", "ship", "rewind", "shortcuts"}

KEYS = {  # key or key sequence -> view
    "Escape": BACK,
    "Ctrl+K": "cmdk",
    "G H": "home",
    "G B": "board",
    "G M": "memory",
    "G P": "playbooks",
    "?": "shortcuts",
}

# ?selftest: real clicks and keys inside the views. The first MAIN_FLOW_STEPS steps are the main flow.
MAIN_FLOW_STEPS = 6
SELFTEST: list[dict] = [
    {"click": [".navs a", "Board"], "expect": "board"},
    {"click": [".bcard.needs", ""], "expect": "room"},
    {"click": [".qa .btn", "New table"], "expect": "proof"},
    {"click": [".btn", "Confirm coverage"], "expect": "review"},  # M4 has no Review tab yet
    {"click": [".btn", "Approve"], "expect": "ship"},
    {"click": [".btn", "Commit and ship"], "expect": "shipped"},
    {"key": ["Escape"], "expect": "ship"},
    {"click": [".btn", "Cancel"], "expect": "review"},
    {"click": [".btn", "Fix these"], "expect": "second-opinion"},
    {"key": ["g", "h"], "expect": "home"},
    {"click": [".ask-card .btn", "New table"], "expect": "room"},
    {"click": [".btn", "Run agent"], "expect": "start-run"},
    {"click": [".scrim", ""], "expect": "room"},
    {"key": ["Ctrl+k"], "expect": "cmdk"},
    {"key": ["?"], "expect": "shortcuts"},
    {"key": ["Escape"], "expect": "cmdk"},
    {"click": [".cmd-item", "Go to Board"], "expect": "board"},
    {"click": [".bcard.lifted", ""], "expect": "start-run"},
    {"hash": "rewind", "expect": "rewind"},
    {"chip_back": True, "expect": "start-run"},
]


def rules_for(view: str, meta: dict) -> list[dict]:
    """All click rules of one view, in match order, as plain dicts for the page script."""
    groups: list[tuple[list[Rule], bool]] = [(CLICKS.get(view, []), True)]
    if view in DIALOG_VIEWS:
        groups.append((DIALOG_RULES, False))
    if view in ROOM_VIEWS:
        groups.append((ROOM_RULES, False))
    if meta["shell"] == "app":
        groups.append((GLOBAL_RULES, False))
    return [{"sel": r.sel, "go": r.go, "text": r.text, "self": r.self_only, "own": own}
            for rules, own in groups for r in rules]


VIEW_SCRIPT = """<style id="pz-click">
.pz-click { cursor: pointer; }
.pz-click:hover { outline: 1px solid var(--road); outline-offset: 2px; }
</style>
<script>
(function () {
  var VIEW = __VIEW__;
  var RULES = __RULES__;
  function txt(el) { return (el.textContent || "").replace(/\\s+/g, " "); }
  function hit(el, r) { return !r.text || txt(el).indexOf(r.text) >= 0; }
  function find(t) {
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      var el = r.self ? (t.matches(r.sel) ? t : null) : t.closest(r.sel);
      if (el && hit(el, r)) return r;
    }
    return null;
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest("a")) e.preventDefault();
    var r = find(t);
    if (r) { e.preventDefault(); e.stopPropagation(); parent.postMessage({go: r.go, from: VIEW}, "*"); }
  }, true);
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if ((e.ctrlKey || e.metaKey) && (e.key || "").toLowerCase() === "k") e.preventDefault();
    parent.postMessage({key: e.key, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, from: VIEW}, "*");
  }, true);
  RULES.forEach(function (r) {
    if (r.self) return;
    document.querySelectorAll(r.sel).forEach(function (el) { if (hit(el, r)) el.classList.add("pz-click"); });
  });
  window.__pz = {
    view: VIEW,
    dead: function () {
      return RULES.filter(function (r) {
        return r.own && !Array.prototype.some.call(document.querySelectorAll(r.sel), function (el) { return hit(el, r); });
      }).map(function (r) { return r.sel + (r.text ? " '" + r.text + "'" : ""); });
    }
  };
})();
</script>
"""

PROTO_NAV_CSS = re.compile(r"/\* -+ prototype navigator.*?\*/\n|^\.proto-nav[^\n]*\n", re.M)


def source(view: str) -> tuple[str, dict, str]:
    folder, stem = VIEWS[view]
    meta, body = build.parse(build.SCREENS / folder / f"{stem}.html")
    return folder, meta, body


def view_page(view: str) -> str:
    """One view: the built screen page (no review aid) plus the click script."""
    folder, meta, body = source(view)
    path = build.SCREENS / folder / f"{VIEWS[view][1]}.html"
    body = build.expand(body, str(path))
    page = build.page(meta, body, build.MILESTONES[folder][0], "", build.shared_css(folder))
    page = PROTO_NAV_CSS.sub("", page)
    script = (VIEW_SCRIPT.replace("__VIEW__", json.dumps(view))
              .replace("__RULES__", json.dumps(rules_for(view, meta), ensure_ascii=False)))
    if page.count("</body>") != 1:
        sys.exit(f"{path}: expected one </body>")
    return page.replace("</body>", script + "</body>")


def script_json(data: object) -> str:
    """JSON that is safe inside <script type="application/json">: it can never close the block."""
    return json.dumps(data, ensure_ascii=False).replace("</", "<\\/").replace("<!--", "<\\u0021--")


OUTER_CSS = """
html, body { margin: 0; height: 100%; overflow: hidden; background: var(--bg); color: var(--text);
  font-family: 'Inter', system-ui, sans-serif; }
#stage iframe { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; background: var(--bg); }
#stage iframe.loading { visibility: hidden; }
#chip { position: fixed; left: 4px; bottom: 4px; z-index: 10; font-size: 11.5px; }
#chip button { font: inherit; color: inherit; cursor: pointer; }
#chip-handle { display: flex; align-items: center; gap: 6px; padding: 2px 7px; border-radius: 6px;
  background: var(--surface); border: 1px solid var(--line2); box-shadow: var(--shadow-sm);
  color: var(--faint); font-size: 10.5px; opacity: .55; }
#chip-handle:hover, #chip.open #chip-handle { opacity: 1; color: var(--text2); }
#chip-handle b { color: var(--road-text); font-weight: 600; }
#chip-panel { display: none; position: absolute; left: 0; bottom: calc(100% + 6px); width: 340px;
  max-height: calc(100vh - 60px); flex-direction: column; background: var(--surface);
  border: 1px solid var(--line2); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
#chip.open #chip-panel { display: flex; }
.ph { padding: 12px 14px 10px; border-bottom: 1px solid var(--line); }
.ph .k { font-family: 'Space Grotesk', sans-serif; font-size: 10.5px; letter-spacing: 1.4px; color: var(--muted); }
.ph .now { margin-top: 4px; font-size: 13.5px; color: var(--text); font-weight: 600; }
.ph .now span { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--road-text); font-weight: 500; }
.pr { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--line); }
.pr button { padding: 4px 10px; border-radius: 7px; background: var(--surface2); border: 1px solid var(--line2); }
.pr button:hover { background: var(--surface3); }
.pr button:disabled { opacity: .45; cursor: default; }
.pr .hint { margin-left: auto; color: var(--faint); font-size: 10.5px; }
#chip-list { overflow-y: auto; padding: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px; }
#chip-list button { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 5px 8px;
  border: 0; border-radius: 7px; background: transparent; text-align: left; color: var(--text2); min-width: 0; }
#chip-list button:hover { background: var(--surface2); }
#chip-list button.on { background: var(--surface3); box-shadow: inset 2px 0 0 var(--road); color: var(--text); }
#chip-list small { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--faint);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
"""

OUTER_JS = r"""
(function () {
  var PAGES = JSON.parse(document.getElementById("views").textContent);
  var CFG = JSON.parse(document.getElementById("proto-config").textContent);
  var stage = document.getElementById("stage");
  var chip = document.getElementById("chip");
  var cur = null, frame = null, stack = [], seq = 0, gWait = 0, navWaiters = [];
  var titles = {};
  CFG.views.forEach(function (v) { titles[v.id] = v; });

  function setHash(view) {
    try { history.replaceState(null, "", "#" + view); } catch (e) { location.replace("#" + view); }
  }
  function render() {
    var v = titles[cur];
    document.title = "Saarthi Prototype · " + v.title;
    document.getElementById("chip-cur").textContent = cur;
    document.getElementById("chip-now").innerHTML = "";
    document.getElementById("chip-now").appendChild(document.createTextNode(v.title + " "));
    var code = document.createElement("span"); code.textContent = v.code; document.getElementById("chip-now").appendChild(code);
    document.getElementById("chip-back").disabled = !stack.length;
    Array.prototype.forEach.call(document.querySelectorAll("#chip-list button"), function (b) {
      b.classList.toggle("on", b.dataset.view === cur);
    });
  }
  function show(view) {
    var my = ++seq;
    cur = view;
    setHash(view);
    render();
    var f = document.createElement("iframe");
    f.className = "loading";
    f.title = titles[view].title;
    f.srcdoc = PAGES[view];
    f.addEventListener("load", function () {
      if (my !== seq) { f.remove(); return; }
      var old = frame;
      frame = f;
      f.classList.remove("loading");
      if (old) old.remove();
      try { f.contentWindow.focus(); } catch (e) {}
      var w = navWaiters; navWaiters = [];
      w.forEach(function (fn) { fn(view); });
    });
    stage.appendChild(f);
  }
  function go(view) {
    if (view === "back") return back();
    if (!PAGES[view] || view === cur) return;
    stack.push(cur);
    show(view);
  }
  function back() {
    if (stack.length) show(stack.pop());
  }
  function key(k, ctrl, alt) {
    if (k === "Escape") {
      if (chip.classList.contains("open")) { chip.classList.remove("open"); return; }
      return go(CFG.keys.Escape);
    }
    if (ctrl && (k || "").toLowerCase() === "k") return go(CFG.keys["Ctrl+K"]);
    if (ctrl || alt || !k) return;
    var low = k.toLowerCase();
    if (gWait && CFG.keys["G " + k.toUpperCase()]) { gWait = 0; return go(CFG.keys["G " + k.toUpperCase()]); }
    if (low === "g") { gWait = 1; setTimeout(function () { gWait = 0; }, 1500); return; }
    gWait = 0;
    if (CFG.keys[k]) go(CFG.keys[k]);
  }

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.go) go(d.go);
    else if (d.key) key(d.key, d.ctrl, d.alt);
  });
  document.addEventListener("keydown", function (e) {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") e.preventDefault();
    key(e.key, e.ctrlKey || e.metaKey, e.altKey);
  });
  window.addEventListener("hashchange", function () {
    var v = decodeURIComponent(location.hash.slice(1));
    if (PAGES[v] && v !== cur) go(v);
  });
  document.getElementById("chip-handle").addEventListener("click", function () { chip.classList.toggle("open"); });
  document.getElementById("chip-back").addEventListener("click", back);
  Array.prototype.forEach.call(document.querySelectorAll("#chip-list button"), function (b) {
    b.addEventListener("click", function () { go(b.dataset.view); });
  });

  // ---------- ?selftest: real clicks and keys inside the views ----------
  function nextNav(ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      navWaiters.push(function (v) { if (!done) { done = true; resolve(v); } });
      setTimeout(function () { if (!done) { done = true; reject(new Error("no navigation")); } }, ms);
    });
  }
  function act(step) {
    var doc = frame.contentDocument, win = frame.contentWindow;
    if (step.click) {
      var els = Array.prototype.filter.call(doc.querySelectorAll(step.click[0]), function (el) {
        return !step.click[1] || el.textContent.replace(/\s+/g, " ").indexOf(step.click[1]) >= 0;
      });
      if (!els.length) throw new Error("no element " + step.click.join(" "));
      els[0].dispatchEvent(new win.MouseEvent("click", {bubbles: true, cancelable: true, view: win}));
    } else if (step.key) {
      step.key.forEach(function (k) {
        var ctrl = /^Ctrl\+/.test(k);
        doc.dispatchEvent(new win.KeyboardEvent("keydown", {key: k.replace(/^Ctrl\+/, ""), ctrlKey: ctrl, bubbles: true, cancelable: true}));
      });
    } else if (step.hash) {
      location.hash = "#" + step.hash;
    } else if (step.chip_back) {
      document.getElementById("chip-back").click();
    }
  }
  function selftest(limit) {
    var steps = CFG.selftest.slice(0, limit || CFG.selftest.length);
    var log = [];
    var p = new Promise(function (resolve) { if (frame) resolve(); else navWaiters.push(function () { resolve(); }); });
    steps.forEach(function (step, i) {
      p = p.then(function () {
        var from = cur, wait = nextNav(4000);
        act(step);
        return wait.then(function (v) {
          if (v !== step.expect) throw new Error("step " + (i + 1) + " from " + from + ": got " + v + ", want " + step.expect);
          log.push(from + " -> " + v);
        }, function (err) { throw new Error("step " + (i + 1) + " from " + from + ": " + err.message + ", want " + step.expect); });
      });
    });
    var dead = [];
    if (!limit) {
      CFG.views.forEach(function (v) {
        p = p.then(function () {
          if (cur === v.id) return;
          var wait = nextNav(4000);
          stack = [];
          show(v.id);
          return wait;
        }).then(function () {
          frame.contentWindow.__pz.dead().forEach(function (r) { dead.push(v.id + ": " + r); });
        });
      });
      p = p.then(function () { if (dead.length) throw new Error("rules that match nothing: " + dead.join("; ")); });
    }
    p.then(function () {
      done("PASS selftest: " + steps.length + " steps" + (limit ? "" : ", " + CFG.views.length + " views checked") + " | " + log.join(" | "));
    }, function (err) { done("FAIL selftest: " + err.message + " | " + log.join(" | ")); });
    function done(msg) {
      var out = document.getElementById("selftest-out");
      out.textContent = msg;
      if (!limit) document.title = msg;
      else document.title = msg.slice(0, 4) + " " + steps.length + " steps";
    }
  }

  var params = new URLSearchParams(location.search);
  var start = decodeURIComponent(location.hash.slice(1));
  if (params.has("selftest") || !PAGES[start]) start = CFG.first;
  show(start);
  if (params.has("selftest")) selftest(parseInt(params.get("steps") || "0", 10));
})();
"""


def render() -> str:
    pages: dict[str, str] = {}
    views_cfg = []
    for view, (folder, stem) in VIEWS.items():
        _folder, meta, _body = source(view)
        pages[view] = view_page(view)
        views_cfg.append({"id": view, "title": meta["title"], "code": f"{build.MILESTONES[folder][0]} {stem[:2]}"})
    cfg = {"first": next(iter(VIEWS)), "views": views_cfg, "keys": KEYS, "selftest": SELFTEST}
    items = "".join(
        f'<button type="button" data-view="{v["id"]}"><span>{build._e(v["id"])}</span>'
        f'<small>{build._e(v["code"])} · {build._e(v["title"])}</small></button>'
        for v in views_cfg
    )
    theme = (SRC / "theme.css").read_text().strip()
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Saarthi Prototype</title>
<meta name="description" content="Clickable Saarthi prototype in The Wheel look, built from the approved milestone screens by core_docs/design/milestones/_src/proto.py.">
{build.FONTS}
<style id="theme">
{theme}
</style>
<style id="proto">{OUTER_CSS}</style>
</head>
<body>
<div id="stage"></div>
<div id="chip">
  <div id="chip-panel">
    <div class="ph"><div class="k">PROTOTYPE · {len(VIEWS)} VIEWS</div><div class="now" id="chip-now"></div></div>
    <div class="pr"><button type="button" id="chip-back">&larr; Back</button>
      <span class="hint">Esc back · Ctrl K · G H/B/M/P · ?</span></div>
    <div id="chip-list">{items}</div>
  </div>
  <button type="button" id="chip-handle" title="Prototype: views and Back"><b>Prototype</b><span id="chip-cur"></span></button>
</div>
<pre id="selftest-out" hidden></pre>
<script type="application/json" id="views">{script_json(pages)}</script>
<script type="application/json" id="proto-config">{script_json(cfg)}</script>
<script>{OUTER_JS}</script>
</body>
</html>
"""


def main() -> None:
    text = render()
    OUT.write_text(text)
    size = OUT.stat().st_size
    print(f"wrote {OUT} · {len(VIEWS)} views · {size / 1e6:.2f} MB")
    if size > 6_000_000:
        print("warning: the prototype is over 6 MB; think about storing the shared CSS once", file=sys.stderr)


if __name__ == "__main__":
    main()

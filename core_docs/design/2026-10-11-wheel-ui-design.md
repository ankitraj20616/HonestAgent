# The Wheel — Saarthi UI redesign (spec)

**Date:** 2026-10-11
**Status:** Approved in brainstorming, waiting for written-spec review
**Replaces:** the look of `core_docs/design/milestones/` (a port of `Saarthi Prototype.html`)
**Approved mockups:** `core_docs/design/wheel_mockups/` (`wheel-home.html`, `wheel-board-room.html`, `wheel-proof-review.html`). They are fragments made for the brainstorm viewer, so a few frame styles are missing when opened alone.
**Related:** `core_docs/design/2026-10-12-task-docs-and-jira-design.md` (Docs tab, Tickets page, Jira).
**Clickable prototype:** `core_docs/design/Saarthi Prototype.html`, built from the milestone screens by `milestones/_src/proto.py`. The old-look prototype is in `core_docs/design/archive/`.

---

## 1. Why

The first screen set worked, but it looked like any other dark dev tool. Saarthi is "the one who drives the chariot": you choose the road, the agents drive, and every task goes round the same loop. The new design makes that idea the main thing on screen.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | Direction **C · The Wheel**: the 8-stage loop drawn as a chariot wheel is the heart of the UI. |
| D2 | **Dark only.** No light theme. One set of color tokens. |
| D3 | Product name stays **Saarthi**. Every name inside the app is plain English (The Wheel, Beads, Agents, Needs You, Trust score). |
| D4 | **The Wheel is the navigation** (approach 1): big Wheel on Home, a small Wheel as logo, the Board is the Wheel unrolled, each Task Room has its own small "journey" Wheel. |
| D5 | Rollout: first the 5 key screens (Home, Board, Task Room, Proof, Review), then every other milestone screen in the same style. |

## 3. Names (English UI labels)

| UI label | Meaning | FSD stage it shows |
|---|---|---|
| The Wheel | The loop: Capture → Research → Brief → Run → Verify → Review → Ship → Remember | — |
| Capture | New task, not looked at yet | `Inbox` |
| Research | Research is going on | `Research` |
| Brief | Brief written, ready to run | `Ready` |
| Run | An agent is working | `Running` (and the side state `Needs You`) |
| Verify | Checks are running or failed | `Verifying` (and the side state `Failed`) |
| Review | Proof is green, waiting for you | `Review` |
| Ship | Committed, PR opened | `Shipped` |
| Remember | Shipped tasks with memory updates still to approve | `Shipped` + pending `memory_updates` (not a new stage) |
| Bead | A task drawn on the Wheel or on a Board card | — |
| Agents | Claude, Codex. Each live agent has a card in the dock | — |
| Needs You | An agent is waiting for an answer or permission | `Needs You` |
| Trust score | One number (0–100) that sums up the proof | new, see section 7 |

`Parked` and `Archived` tasks are not on the Wheel. The Board shows them with a filter.
Stage names in code, API and docs do not change. Only the labels on screen change.

## 4. Look

### 4.1 Color tokens (dark only)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0A09` | page |
| `--glow` | `#1D1813` | soft radial light behind the main area |
| `--surface` / `--surface2` / `--surface3` | `#14110E` / `#1B1713` / `#221D18` | cards, buttons, selected |
| `--line` / `--line2` | `#2A241E` / `#3A3229` | borders, Wheel rim, spokes |
| `--text` / `--text2` / `--muted` / `--faint` | `#EDE6DA` / `#D2C8B8` / `#9A8F80` / `#6B6257` | text levels |
| `--road` / `--road-text` / `--road-soft` / `--on-road` | `#E9A23B` / `#F0B055` / `rgba(233,162,59,.10)` / `#140F08` | "the road": what is moving and what needs you; primary button |
| `--claude` / `--codex` | `#E9A23B` / `#6FB7FF` | agent tags |
| `--ok` / `--bad` / `--info` | `#5ED39C` / `#FF7A6B` / `#6FB7FF` | proof green, failed, info |
| `--ok-soft` / `--bad-soft` / `--info-soft` | 9–10% tints of the above | backgrounds of status boxes |

Page background: `radial-gradient(… at 50% 40–58%, var(--glow), var(--bg) 72–75%)`.

### 4.2 Type

- **Space Grotesk** — headings, Wheel labels, big numbers (Trust score), section labels (uppercase, `letter-spacing .14em`).
- **Inter** — body text and buttons (13px base).
- **JetBrains Mono** — task IDs, code, diffs, cost, times.

## 5. App frame

- **Top bar (56px):** small Wheel logo + "Saarthi", page links (Home, Board, Memory, Playbooks, and Tickets from M10 only for projects with Jira), Needs You pill (pulses when > 0), search box ("Search or run a command…", `Ctrl K`), today's cost. Settings opens from the Command Bar and from a gear in the top bar.
- **Agents dock (left):**
  - On Home: full width (250px). One card per live agent: agent tag, task, state (needs you / fixing / writing tests…), a small live activity line, mode + time, cost. A dashed "+ Free slot · start a run" card for each empty slot.
  - On every other page: a thin rail (64px). Agent tag + status dot + task number. Empty slots are dashed "+".
- **No sidebar.** Projects move to a project picker in the top bar (next to the logo).

## 6. Key screens

### 6.1 Home (M3)
- **Left:** Agents dock (full).
- **Center:** The Wheel (about 520px).
  - 8 spokes, stage labels round the outside, clockwise from the top: Capture, Research, Brief, Run, Verify, Review, Ship, Remember. Each label has a count under it.
  - The rim arc is lit in `--road` over stages with live work.
  - **Beads:**
    - colored by state: road = running, bad = failed, ok = review, info = research, empty ring = idle;
    - the task number is written inside the bead;
    - a bead that needs you gets a halo;
    - shipped tasks show as faded beads at Ship.
  - A dashed "+" bead at Capture = quick capture.
  - **Hub:** the Needs You count.
  - Click a spoke → Board filtered to that stage. Click a bead → Task Room.
- **Right:**
  - the Needs You card: the agent's question, with answer buttons;
  - "Ready for review": the tasks in Review. From M4 each one has a Trust ring, and the title becomes "Trust before review";
  - "Remembered this week": the newest learnings.

### 6.2 Board (M3, check dots from M4)
- **Rim strip:** the Wheel unrolled into 8 segments. Each segment has the stage label and count, plus a bottom bar colored live / ok / bad.
- **8 columns** under it, in Wheel order.
- **Cards:**
  - bead with the task number, title;
  - footer: agent tag, time, cost (and a mini Trust ring from M4).
  - A "Needs you" card glows. A Failed card has a red border and the line "1 check red · fix 1/3".
- **Dragging:** the allowed column lights up in `--road`, and a refused column turns red. Only moves the daemon allows (`next_stages`) can light up.
- Filter box and agent chips (All / Claude / Codex).

### 6.3 Task Room (M3)
- **Header:** ID, title, stage pill, the **journey Wheel** (46px, arc filled up to the current stage, current stage dot), the label "Run · 4 of 8" with the path so far, time, cost, Run agent.
- **Left (300px):** Brief (goal + criteria), Workspace (branch, ahead, files, checkpoint, Open folder / Editor / Terminal), Runs.
- **Tabs:**
  - M3: Stream, Terminal, Code, Docs, Timeline.
  - M4 adds Proof.
  - M5 adds Review.
- **Stream** is a timeline:
  - each event has a time, a node on a vertical line, and a body (message, tool row, diff, command result);
  - the Needs You question is a large card with answer buttons;
  - the message box with Send / Stop sits at the bottom.

### 6.4 Proof (M4; second-opinion part from M5)
- **Left:**
  - big **Trust ring** with three colored arcs: checks (ok), criteria (road), second opinion (info). The number is in the middle.
  - Below the ring, a legend with the points for each part, then a gate box: "Gate passed · moved to Review by itself", or the failed state with Fix with agent.
- **Right:** 4 stats (files changed, lines +/−, tests added, fix rounds), the check list (status, name, command, required/optional, time), the brief criteria with a Met / Not sure / Not met switch and "Confirm all".

### 6.5 Review (M5)
- **Change Story as chapters:**
  - one numbered node per group, joined by a line;
  - each chapter has a title, risk flag, size, and a 1–2 line explanation;
  - an open chapter shows its diff with comments inside it;
  - risk flags for the whole story sit at the top.
- **Right:**
  - Second opinion card: agent, read-only, cost. Each finding has a severity, a file:line and a tick box, then "Fix these + N comments".
  - Decision card: Approve / Reject. Ship stays off until approved; the card explains that Saarthi never pushes to `main`.

## 7. Trust score (new)

- **Formula:**
  - **Required checks: 50 points**, by the share that pass.
  - **Brief criteria: 35 points**, by the share marked Met. "Not sure" counts as 0 until confirmed.
  - **Second opinion: 15 points** if no high or medium finding is open, 8 if only medium findings are open, 0 if a high finding is open or no second opinion has run.
- The **daemon** computes it (CLAUDE.md rule 1) from data that already exists (`check_results`, `proof_cards.coverage`, `review_findings`). The UI only shows it.
- It **never blocks** anything. The stage rules stay as they are: Review needs green required checks, or an override with a reason.
- It shows on: Proof (big ring), Home right panel, Board cards (mini ring), Task Room header label.
- **Docs to update:**
  - FSD: new **F7.7 Trust score** (Must, M4).
  - M4 TDD: score function + `trust_score` on the Proof Card response.
  - M5 TDD: the second-opinion part.

## 8. Screens per milestone

Every existing screen in `core_docs/design/milestones/` is redone in the Wheel style. The list of screens and what each one shows stay the same. Only the look and the frame change, plus these additions:

| Milestone | What changes |
|---|---|
| M0–M2 | Spike window and CLI terminals take the new colors and fonts. No app frame (there is no app yet). |
| M2 | Plan docs in the CLI (`saarthi docs`). |
| M3 | The Docs tab in the Task Room. Home becomes the Wheel. Board becomes rim + 8 columns. Task Room gets the journey Wheel and the timeline Stream. Overlays (Run dialog, Command Bar, quick capture) and Settings + Health use the new frame. |
| M4 | Proof gets the Trust ring (checks + criteria parts). Board cards get the mini ring. |
| M5 | Review becomes chapters + Second opinion card. The Trust ring adds the second-opinion part. |
| M6 | Research, Memory, Playbooks in the new frame. Memory updates show as the Remember stage. |
| M7 | A race shows **two beads on one spoke**, joined by a short arc. Compare uses two Trust rings side by side. |
| M8 | Cost meter and budget use the same ring style. Checkpoints show as small notches on the journey Wheel. |
| M9 | First-run wizard: the Wheel draws itself one spoke per step. Empty Home: an empty Wheel with "Capture your first task". |
| M10 | Tickets page, start-from-ticket dialog, ticket chip in the Task Room, write-back card, Jira settings. |

A screen must only show features that exist in its milestone. For example, there is no Trust ring before M4, and no second-opinion part before M5.

## 9. Files and build

- `core_docs/design/milestones/_src/theme.css` → one dark token block (section 4.1). The light block is removed.
- `_src/base.css` → rewritten for the Wheel components: top bar, agents dock + rail, Wheel SVG classes, rim strip, card + bead, journey Wheel, timeline Stream, Trust ring, chapters, second-opinion card.
- `_src/build.py`:
  - `THEMES = ("dark",)`; output goes straight into `<milestone>/<NN>_<slug>.html`, and the `light/` and `dark/` folders are deleted;
  - the app shell becomes the new frame (top bar + dock/rail), with front-matter keys `dock: "full" | "rail"` and `agents: [...]`;
  - the color-literal lint stays.
- `_src/SCREEN_GUIDE.md` and `milestones/README.md` → updated for dark only and the Wheel parts.
- A shared SVG helper (a Python function in `build.py`) draws the Wheel, the journey Wheel and the Trust ring from front-matter data, so the geometry is the same on every screen.

## 10. Done when

- The 5 key screens match the approved mockups. The owner checks them first.
- All other milestone screens are rebuilt in the new style (same screen list as now).
- `python3 core_docs/design/milestones/_src/build.py` passes, including the color-literal lint.
- Every screen was screenshotted at 1440×900 and checked: no sideways overflow, no cut-off text, nothing overlapping.
- FSD F7.7 and the M4/M5 TDD notes for the Trust score are added.

## 11. Out of scope

- Light theme.
- A new product name.
- Natural-language commands in the search box (it stays the Command Bar, F18.1).
- Building the real React UI. This work makes the design screens only.

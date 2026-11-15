# Roadmap (big plan)

Updated 15 Nov 2026. Branches: `big-plan-roadmap` (baseline at the old `p2d-data-quality` tip) and `phase-a` (active work). New phases get a branch from `big-plan-roadmap` after the previous phase is merged back.

## Spine

One instrument + scoring engine. Two doors later: **Import** (now) and **Form builder** (Phase C). History/provenance is part of the spine.

## Phase A — Quant spine (in progress on `phase-a`)

| Slice | What | State |
|-------|------|--------|
| A1a | Source-sheet lock, readiness line, first provenance events (split, reverse, range confirm, proration) | pushed (`7769d8c`) |
| A1b | History as specified below (every meaningful action, one-step Undo, quiet save) | next, after this design |
| A2 | Proration explanation: who/what is missing, what fill-in will do, highlight prorated scores | later in A |
| A3 | P4c only if still needed (edit organization in place) | later |
| A4 | APA-style report (F11) once provenance can cite the decisions | later |

Parked inside A: pixel polish, full tutorial, dark mode, ConfigScreen split.

## Phase B — Shared instrument contract

Document and code the one model (items, demos, subscales, reverse, response map, proration) that import and the future builder both read and write. History events name those same objects.

## Phase C — Form builder MVP

Author instrument → collect responses into the same engine. Keep the import door. No full Qualtrics parity.

## Phase D — Selective analysis

Methods-ready summary from provenance. Deeper descriptives/reliability only as needed. EFA/CFA/SEM parked.

## Phase E — Later modules

Longitudinal, content validity, Rpb, EMA, qualitative, institutional cloud and cross-transfer, accounts/billing. Market-research dashboards stay deprioritised. Second beta UI pass after the builder exists.

## History (design, 15 Nov 2026)

History is the audit trail of **meaningful decisions** on the active sheet. It is not a keystroke log and not a second copy of autosave.

**Record (one event when the decision is committed):** import; organize / remove organized sheets; demographic add/remove or mark-all-items; subscale create, rename, delete, item assign/remove; reverse on/off; response decision (number, Not scored, Counts as, widen) and range confirm / flip / start-at-0; row exclude/include; proration on/off and threshold; score run; template save/apply.

**Do not record:** autosave ticks, focus changes, opening a panel, typing inside a box before commit.

**Undo:** one arrow next to History. It undoes the **latest undoable** event on this sheet only (not a full timeline of undos). Older rows stay visible and are not individually undoable. Undo itself is recorded ("Undid …") so the trail stays honest.

**Saved line:** "Saving…" only while a write is in flight. "Saved on this device" shows once, briefly, then disappears. It must not repeat on every autosave. A history row appearing is the confirmation that a decision was kept. No history event is written unless the stored config or data actually changed.

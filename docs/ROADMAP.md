# Roadmap (big plan)

Updated 15 Nov 2026. Branches: `big-plan-roadmap` (baseline at the old `p2d-data-quality` tip) and `phase-a` (active work). New phases get a branch from `big-plan-roadmap` after the previous phase is merged back.

## Spine

One instrument + scoring engine. Two doors later: **Import** (now) and **Form builder** (Phase C). History/provenance is part of the spine.

## Phase A — Quant spine (in progress on `phase-a`)

| Slice | What | State |
|-------|------|--------|
| A1a | Source-sheet lock, readiness line, first provenance events (split, reverse, range confirm, proration) | pushed (`7769d8c`) |
| A1b | History: meaningful actions, one-step undo and redo, quiet save | done on `phase-a` |
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

## History (built 16 Nov 2026)

History is the audit trail of meaningful decisions on the active sheet.

**Toolbar (every screen):** Undo, Redo, History. Undo reverts the latest undoable change on this sheet. Redo puts it back. A new change clears redo. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl/Cmd+Y) do the same when focus is not in a text field. The panel is newest-first and is not a per-row undo list.

**Undoable:** demographics, subscale create/delete, scale setup saved from the workbench (including reverse, range confirm, response decisions, bands), proration, row exclude and include (including bulk), data-quality threshold edits, template apply.

**Audit only:** import, organize / remove organized sheets, delete sheet, score run, template save/update, downloads. Undo and redo themselves are recorded as "Undid …" / "Redid …" and are not undoable.

**Saved line:** "Saving…" only while a write is in flight. "Saved on this device" shows briefly, then disappears.


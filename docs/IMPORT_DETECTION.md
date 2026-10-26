# Import v2: detect, don't ask (spec)

**Updated 26 Oct 2026** — layout detection (Layer A) plus optional multi-scale structure in the **ID step** (Layer B). Owner-approved direction on branch `p2d-data-quality`.

**Problem:** users must say which rows are headers, where data starts, and what to do with empty rows and columns; the preview lists every column, which gets long when cells hold long text. Real users often bring a **single master sheet** (demographics on the left, then several instruments side by side) and expect the app to help organize it — not only parse a grid.

**Goal:** the app works out the **file layout** itself, always shows a compact preview, confirms with one click, and reports quietly what it ignored. **Organizing demos and multiple scales** happens in the existing **ID step**, not in a second import wizard.

## Two layers (do not mix in one form)

| Layer | Where | Job | User effort |
|-------|--------|-----|-------------|
| **A. Read the file** | Import modal | Header/data start, empty rows/cols, junk title/ImportId/trailing summary rows | **Zero** by default; **Adjust** only if preview is wrong |
| **B. Structure the study** | Configure → **ID step** | Demographics/ID (existing) + optional **several scales** → paint column groups, name them, **create one sheet per instrument** with shared demos | Only when the user chooses "Several scales" |

Content-validity and other project types later share **Layer A**; **Layer B** is project-type specific.

## Principles
1. **Detect, then confirm:** always show a **compact data preview** (header highlighted). Primary action: **Import N rows**. No confirm without a visible grid.
2. **Never change data silently:** everything ignored or renamed is counted and shown in a quiet summary line.
3. Detection is a **pure function** over the first ~200 rows of the cell grid, with synthetic fixtures and a confidence score.
4. **Do not auto-split scales.** Multiple instruments require an explicit user action (paint ranges + names). Soft hints are OK; silent multi-sheet creation is not.
5. **Subscales ≠ import groups.** Import/ID groups become **sheets (instruments)**. Factor/subscale split stays in **Scale Groups**.
6. **Defaults are safe:** empty rows/columns removed by default; header detection applied automatically; Adjust is the escape hatch.

## Layer A — Output of detection
`{ headerRows, labelRow?, importIdRow?, dataStartRow, dataEndRow, ignoredRows[], ignoredCols[], orientation, confidence: high|medium|low, warnings[], summary }`
- **high:** apply and show the summary + preview.
- **medium:** apply, preview, mild "please check."
- **low:** open Adjust (or emphasize header choice); preview still visible.

### Layouts to detect
| # | Layout | How it is recognised |
|---|--------|---------------------|
| L1 | One header row, then data | Unique short text header; rows below more numeric |
| L2 | Qualtrics: names / question text / ImportId JSON | Row matching `{"ImportId":…}`; data after |
| L3 | Short code row + long label row | Row 1 short codes, row 2 long text |
| L4 | Two-level grouped header | Upper mostly blank with span labels; lower item names *(later)* |
| L5 | Title/notes + leading blank rows/cols | Single-cell title rows; blank leading cols |
| L6 | Trailing summary (Mean, SD, Total) | First-column labels Mean/SD/Total or type shift at bottom |
| L7 | Blank rows/cols inside table | Fully empty rows/cols |
| L8–L11 | Content-validity matrix, transpose, etc. | Phase 2 / project-type specific |

### Import modal UI (required)
```
Summary line (what was detected + counts of ignored empties)
Compact preview: ~6 rows × ~8 columns, cells cut ~30 chars + tooltip, header row highlighted
[ Adjust layout ]  ← collapsed unless confidence low
[ Cancel ]                    [ Import N rows ]
```
- **Adjust:** existing controls (header row, label row, data start, empty row/col toggles, presets).
- Do **not** hide the preview behind Adjust.

### Implementation status (26 Oct 2026)
- Pure module `src/lib/importLayoutDetection.ts` + tests for L1–L3, L5–L7 core: **started**.
- Modal: **P4a done** (always-visible preview, Adjust, Import primary).
- ID multi-scale split: **P4b done** (source vs instrument hierarchy).
- L4, L8–L11, CSV dialect edge cases, 100k-row stress: **later**.

---

## Layer B — ID step: demos + optional multi-scale split

### Why here
The ID step already auto-detects demographics. Expanding it avoids a second wizard and matches the journey: *first say what columns are, then score.*

### Modes
1. **One scale (default)** — Current behavior: Demo vs Item; all items stay on this sheet.
2. **Several scales** — User paints **contiguous** item column blocks, names each block, then **Create N sheets**. Each sheet = shared demographics/ID columns + that block's items. Same respondent row order and stable row IDs across sheets.

### Several-scales UI (owner direction, 26 Oct 2026)
- **Primary control:** horizontal **column map** (headers + 1–2 sample values), not typing `Q1 → Q10`.
- **Active target:** Demographics | Scale 1 | Scale 2 | …
- **Assign:** click first/last column or click–drag to paint a contiguous range; name field per scale.
- **Typing from/to:** optional advanced disclosure only.
- **Unassigned** item columns are not copied to new sheets; **demos are copied to every new sheet.**
- **Do not auto-paint** multiple scales. Demo suggestions remain one-click accept (existing detection).

### After split
- N dataset tabs (existing multi-sheet model).
- Each sheet's Scale Groups defaults to **One scale**.
- Subscales still configured per sheet in Scale Groups if needed.

### What not to ask at import or ID
- Response scale mapping, reverse items, bands, proration, DQ thresholds.
- Subscale structure inside an instrument (Scale Groups).

---

## Build phases
| Phase | Deliver |
|-------|---------|
| **P4a** | Always-visible preview; silent Layer A; quiet summary; Adjust; primary **Import N rows**; fix current modal |
| **P4b** | ID step: One scale / Several scales; column map paint; Create N sheets with shared demos |
| **P4c** | Hints, undo split, advanced type-in ranges, L4 detection, more real-world fixtures |

## Tests
- Pure detection: synthetic grids L1–L7 (extend L4+ as built).
- Modal: preview visible without opening Adjust; Import uses detected fields.
- P4b: split produces N sheets; each has demos + correct items; row ids align; single-scale path unchanged.

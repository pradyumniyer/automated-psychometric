# Owner fix list (from hands-on testing, 15 Oct 2026)

Order = priority. These are owner-approved changes to the frozen UI (see `UI_FREEZE.md`). Each item: problem → required behavior → tests. Math stays per `scientific-spec.md`.

## Batch 1: correctness (F2, F3, F4, F5 first; F1 follows as Response Scales v2)
**F1. Response Scales v2** (owner items 2-3 of the scales discussion; moved to Batch 2, a bigger step). Replaces the numeric/categorical choice: detected range plus an "other responses" table; empty number = not scored; out-of-range defaults to missing; the separate allowed non-response editor is removed (each scale card's table replaces it). Full spec: `RESPONSE_SCALES.md`, ADR 0015.

**F2. Why some rows are blank, and unassigned items** (owner item 5). *Finding:* of 30 rows, 26 match the owner's Excel check exactly; the 4 that differ (P25, P26, P29, P30) have a missing, "N/A", "Prefer not to say" or out-of-range item. Excel's `SUM` silently skips blanks/text and included the out-of-range 7; the app follows the spec (strict scoring). *Required:* after scoring, show one line in the existing status area: "N rows have no score because an item is missing, N/A or outside the scale: P25, P26, P29, P30" (first 5 IDs, then "and N more"). Also a warning before scoring when subscales exist and some items are in none ("12 items are not in any subscale and will not be scored"). The opt-in proration control (Scoring panel, default off) is Batch 2.

**F3. Export matches the live grid** (owner item 6). *Required:* one function builds the ordered column list used by BOTH the LiveGrid and the "Scored data" export: ID/demographics, items grouped by subscale in subscale order, each subscale followed by ONE score column (calculated by that subscale's own method)  and interpretation, then the Overall (per its toggles). Excluded-row handling stays as it is today. Numeric-looking values export as **numbers** (Age and items are currently text in the XLSX); IDs and real text stay text; CSV likewise. Formula-injection protection stays. *Tests:* column order equals grid order for Fixture A with sum only, mean only, both, Overall on/off; numeric cells are numeric in XLSX.

**F4. Reload keeps your place** (owner item 8). *Problem:* after an idle reload the app returns to the project list, opens the Configure tab, and loses the sum/mean toggles. *Required:* hash routes `#/project/:id/:tab`; active dataset, tab, and the display toggles (sum, mean, Overall) persisted (settings / survey_configs) and restored; DQ thresholds persisted. *Tests:* reload restores project, tab, dataset and toggles. An invalid hash falls back to the project list.

**F5. Row-number (#) column always opaque** (item 4). Fix the alternating transparency of the sticky column.

## Batch 2: UX
*(F5 moved up into Batch 1.)*

**Toggles decision (owner, 17 Oct 2026):** the existing footer Sum/Mean toggles stay unchanged; F3/F4 use new separate persisted "Score columns" toggles (Sum, Mean, Overall) whose defaults reproduce today's grid and export.
**F6. Subscale builder** (item 2). Click **Add subscale** as many times as needed. Click a subscale card → popup with the **unassigned item pool** (search, multi-select, select all/none) → **Add**. A **×** on an item chip in the card removes it back to the pool. Above the cards, an "Unassigned items" strip shows what is left (count + chips). The old "select subscale" box goes away. Reverse toggle and reordering inside a subscale are unchanged.
**F7. Data-quality normality panel** (item 7, from the owner's screenshot; numbers verified correct: W 0.9804, p 0.8356, skew −0.2906, kurtosis −0.2038, 1 outlier). Replace "Verdict: Normal" and "Parametric analyses are appropriate" with the neutral wording in spec §2.6; format Q–Q axis labels to 2 decimals and stop them clipping; add the Lilliefors KS line next to Shapiro–Wilk; add the reliability section (approved addition).
**F8. Proration control** in the Scoring panel (opt-in, default off, 20/25/50%).

## Batch 3: import
**F9. Import v2** (item 1): see `IMPORT_DETECTION.md`.

## Not yet checked by owner
Templates, history/undo, the rest of Data Quality, Export (other cards), Report.

## Batch 1b: scoring UI streamlining (owner, 17 Oct 2026, after hand-testing P1)
**F2 correction.** The status line must list every included row with at least one missing score (any subscale score, or Overall when on), not only rows with no score at all. Fixture A: P25, P26, P29, P30. Without an ID column, show "row N" (the grid's # number), not an internal ID.
**F10. One place for each decision** (owner design, 17 Oct 2026; built in P1b, P1c, P1d).
- Subscale scores: each subscale card in the Response Scales step has "Show: Sum, Mean, Custom formula" (any combination, at least one). Per subscale the grid and export show, in the order Sum, Mean, Custom, each score column followed by its own interpretation column.
- Interpretation per column: shown only when bands exist for that output; bands are stored per output (Bands step lets you pick which shown output you are editing); existing bands move to the first shown output; no guessing or converting cut-offs. Header "Interpretation" when one output is shown, otherwise "Sum interpretation" etc.; export headers carry the subscale name and are unique.
- Overall score: an "Overall scale" switch next to "Apply first to all" adds an Overall card above the subscale cards. "Based on" subscale Sums | Means | Custom scores (Custom only when every subscale has a custom formula); "Combine by" Sum | Mean | Custom formula. One Overall column, strict (blank if any subscale value is blank), plus an "Overall interpretation" column once Overall bands are set in the Bands step.
- Summary rows (toolbar group, was "Bottom rows"): Sum and Mean now; later SD, Min, Max, Median. They cover item columns, every score column and the Overall column. In the export they are never mixed into the data: the XLSX gets a second sheet "Summary", the CSV gets a second file `<name>_summary.csv`, only when a Summary rows toggle is on. The Summary has rows for each statistic, "N used" and "N not counted" per column, and a Notes block saying that blank, N/A, Prefer-not-to-say, other text and out-of-range cells were not counted (with per-column counts when any), that excluded respondents are not counted, and that a subscale or Overall score is blank when any of its items is missing. After Response Scales v2 (P2b) the counts are broken down by kind.
- Removed: the "Score columns" toolbar group added in P1, and the CSV/XLSX buttons on the Configure toolbar (the Export tab remains).
- Left-rail labels: "Subscales" (Scale Groups step) and "Response scales".
- Templates save the Show toggles, the Overall settings and the bands per output.
- Vocabulary: item = raw question column; subscale score = calculated from items; overall score = calculated from subscale scores; summary rows = statistics across respondents.
- Sum of means and mean of sums are allowed but unusual; mean of subscale means weights each subscale equally, not each item.

**F11. Report rework (later, not specced).** The Report screen should produce a publication-ready, APA-formatted section (tables for descriptives, reliability, normality; wording; export), not the current format. To be specced after the scoring UI work. P1c only keeps the Report working with the new columns.

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
**F6. Subscale builder** (item 2). Click **Add subscale** as many times as needed. Click a subscale card → popup with the **unassigned item pool** (search, multi-select, select all/none) → **Add**. A **×** on an item chip in the card removes it back to the pool. Above the cards, an "Unassigned items" strip shows what is left (count + chips). The old "select subscale" box goes away. Reverse toggle and reordering inside a subscale are unchanged. **Owner-found bug (17 Oct 2026):** with two empty subscale cards added first, selecting items and assigning them through the popup to Subscale 1 put them in Subscale 2; after deleting Subscale 2, assigning to Subscale 1 did nothing. Adding one card at a time works. F6 must assign to the card that was clicked (by id, not by position or a shared 'selected' state) and needs a test with 2-3 empty cards, deleting cards, and assigning to each. **Design addition (owner, 19 Oct 2026):** the step starts with a choice between "One scale" (default; shows the single "Overall scale" card with all items and Rev toggles, no item pool, no Add subscale) and "Subscales" (item pool, Add subscale, cards). Switching to One scale asks first because the subscales are removed; switching to Subscales returns the items to the pool and keeps the reverse flags.
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

## Small fixes backlog (owner, 17 Oct 2026; do in bulk, ideally after P2b because the per-cell reasons come from `resolveResponse`)
1. UI alert that summary rows and subscale scores omitted missing, out-of-range, N/A or similar cells.
2. Summary sheet: values must start at cell A1 (no title row) so jamovi can import it; move the notes elsewhere (for example a "Notes" sheet and a `_notes` CSV). Notes must name each excluded cell precisely: Excel address on the data sheet (for example A34), respondent, column, value, reason. In the app, the same message with a link to the cell in the grid.
3. The Summary rows tooltip becomes a small (i) icon with hover.
4. Summary rows must cover only item columns, score columns and Overall, not Age or other demographics.
5. Check after P1c: grid/export headers now say Sum / Mean (not "Score"); confirm this is what the owner wants.

**F12. Bands for decimal scores** (owner finding, 17 Oct 2026; built in P1c2, reused by P1d for Overall).
- Bug: Suggest produced whole-number Mean bands (0-2, 3-3, 4-5); means such as 3.6 fell in the gaps and showed a blank interpretation with no warning.
- Rules: integer outputs (Sum of integer items) keep inclusive whole-number ranges; continuous outputs (Mean, Custom, decimals, most Overall) use lower limit included / upper limit not included (last band includes its upper limit), contiguous, decimals allowed, classified on the unrounded score. The Bands step validates gaps, overlaps, inverted bands and range coverage. Suggest builds 3 equal contiguous bands over the output's possible range (Sum 5-11, 12-18, 19-25 for five 1-5 items; Mean 1-2.33, 2.33-3.67, 3.67-5); disabled for Custom. A score outside every band shows "No band" (never blank) and the status line names the affected column and respondents. One shared classification function everywhere (grid, export, Report).
6. Overall transparency (owner chose option 1, 17 Oct 2026): the Overall card shows one plain sentence such as "Overall = Sum of subscale Means (Subscale 1 Mean + Subscale 2 Mean). Means are calculated even though their columns are hidden." plus a "Show these columns" button that switches on the matching Show toggles for every subscale; the Overall column header says how it was calculated. Sum and Mean stay calculated in the background for every subscale.

**F13. Clarity pass** (owner, 18 Oct 2026): follow `UX_PRINCIPLES.md`. Card pattern first (P2c-1b, P2c-2), then C1 and C2 after P2d. Absorbs backlog items 1 and 2 (unified checks and precise per-cell reasons) and item 3 ((i) tips).
7. Collapsed Response scales cards need a visible open affordance (a small "show full" button or a down arrow). Built as part of P2c-2.
8. Reword "Confirmed" in the card's one-line summary to something more direct (wording to be chosen with the owner).

**F14. No subscales = one automatic subscale** (owner, 18 Oct 2026; P2c-U). The old separate "Overall Scale" path lacked the Show toggles, bands per output, Confirm range, out-of-range decision, collapsed card and cell links. The dataset is treated as one automatic subscale ("Overall scale") that uses the normal code path; headers follow the subscale pattern; no migration of old projects.

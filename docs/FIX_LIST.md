# Owner fix list (from hands-on testing, 15 Oct 2026)

Order = priority. These are owner-approved changes to the frozen UI (see `UI_FREEZE.md`). Each item: problem → required behavior → tests. Math stays per `scientific-spec.md`.

## Batch 1: correctness (F2, F3, F4, F5 first; F1 follows as Response Scales v2)
**F1. Response Scales v2** (owner items 2-3 of the scales discussion; moved to Batch 2, a bigger step). Replaces the numeric/categorical choice: detected range plus an "other responses" table; empty number = not scored; out-of-range defaults to missing; the separate allowed non-response editor is removed (each scale card's table replaces it). Full spec: `RESPONSE_SCALES.md`, ADR 0015.

**F2. Why some rows are blank, and unassigned items** (owner item 5). *Finding:* of 30 rows, 26 match the owner's Excel check exactly; the 4 that differ (P25, P26, P29, P30) have a missing, "N/A", "Prefer not to say" or out-of-range item. Excel's `SUM` silently skips blanks/text and included the out-of-range 7; the app follows the spec (strict scoring). *Required:* after scoring, show one line in the existing status area: "N rows have no score because an item is missing, N/A or outside the scale: P25, P26, P29, P30" (first 5 IDs, then "and N more"). Also a warning before scoring when subscales exist and some items are in none ("12 items are not in any subscale and will not be scored"). The opt-in proration control (Scoring panel, default off) is Batch 2.

**F3. Export matches the live grid** (owner item 6). *Required:* one function builds the ordered column list used by BOTH the LiveGrid and the "Scored data" export: ID/demographics, items grouped by subscale in subscale order, each subscale followed by its score (sum and/or mean per the new "Score columns" toggles) and interpretation, then the Overall (per its toggles). Excluded-row handling stays as it is today. Numeric-looking values export as **numbers** (Age and items are currently text in the XLSX); IDs and real text stay text; CSV likewise. Formula-injection protection stays. *Tests:* column order equals grid order for Fixture A with sum only, mean only, both, Overall on/off; numeric cells are numeric in XLSX.

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

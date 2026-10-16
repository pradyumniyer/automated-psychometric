# Owner fix list (from hands-on testing, 15 Oct 2026)

Order = priority. These are owner-approved changes to the frozen UI (see `UI_FREEZE.md`). Each item: problem → required behavior → tests. Math stays per `scientific-spec.md`.

## Batch 1: correctness
**F1. Missing-value codes before scale detection** (owner item 3). *Problem:* in Fixture A, Q3 and Q5 contain "N/A" / "Prefer not to say", so Response Scales auto-detects them as categorical (1→1, 2→2…). *Required:* (a) the allowed-non-response list is one **dataset-level setting** (default = current defaults) used by detection, scoring, data quality and reliability, persisted in `survey_configs.allowed_nonresponse`; the DQ screen's existing editor reads and writes that same value. (b) Scale-type detection ignores blanks and allowed non-response values: a column whose remaining values are all numeric is numeric. (c) Numeric range suggestion: per column observed min/max over valid numeric values; dataset default = the most common min and max across item columns (ties → wider); cells outside the chosen range are reported next to the suggestion ("1 value outside 1–5"), never silently widening the range. *Tests:* Fixture A (Q3, Q5 numeric; range 1–5; P26's 7 reported; P25/P30 codes ignored); an A–D column stays categorical; a column of only "N/A" and blanks.

**F2. Why some rows are blank** (owner item 5). *Finding:* of 30 rows, 26 match the owner's Excel check exactly; the 4 that differ (P25, P26, P29, P30) have a missing, "N/A", "Prefer not to say" or out-of-range item. Excel's `SUM` silently skips blanks/text and included the out-of-range 7; the app follows the spec (strict scoring). *Required:* after scoring, show one line in the existing status area: "N rows have no score because an item is missing, N/A or outside the scale: P25, P26, P29, P30" (first 5 IDs, then "and N more"). The opt-in proration control (Scoring panel, default off) is Batch 2.

**F3. Export matches the live grid** (owner item 6). *Required:* one function builds the ordered column list used by BOTH the LiveGrid and the "Scored data" export: ID/demographics, items grouped by subscale in subscale order, each subscale followed by its score (sum and/or mean per the toggles) and interpretation, then the Overall (per its toggles). Excluded-row handling as chosen. Numeric-looking values export as **numbers** (Age and items are currently text in the XLSX); IDs and real text stay text; CSV likewise. Formula-injection protection stays. *Tests:* column order equals grid order for Fixture A with sum only, mean only, both, Overall on/off; numeric cells are numeric in XLSX.

**F4. Reload keeps your place** (owner item 8). *Problem:* after an idle reload the app returns to the project list, opens the Configure tab, and loses the sum/mean toggles. *Required:* hash routes `#/project/:id/:tab`; active dataset, tab, and the display toggles (sum, mean, Overall) persisted (settings / survey_configs) and restored; DQ thresholds persisted. *Tests:* reload restores project, tab, dataset and toggles.

## Batch 2: UX
**F5. Row-number (#) column always opaque** (item 4). Fix the alternating transparency of the sticky column.
**F6. Subscale builder** (item 2). Click **Add subscale** as many times as needed. Click a subscale card → popup with the **unassigned item pool** (search, multi-select, select all/none) → **Add**. A **×** on an item chip in the card removes it back to the pool. Above the cards, an "Unassigned items" strip shows what is left (count + chips). The old "select subscale" box goes away. Reverse toggle and reordering inside a subscale are unchanged.
**F7. Data-quality normality panel** (item 7, from the owner's screenshot; numbers verified correct: W 0.9804, p 0.8356, skew −0.2906, kurtosis −0.2038, 1 outlier). Replace "Verdict: Normal" and "Parametric analyses are appropriate" with the neutral wording in spec §2.6; format Q–Q axis labels to 2 decimals and stop them clipping; add the Lilliefors KS line next to Shapiro–Wilk; add the reliability section (approved addition).
**F8. Proration control** in the Scoring panel (opt-in, default off, 20/25/50%).

## Batch 3: import
**F9. Import v2** (item 1): see `IMPORT_DETECTION.md`.

## Not yet checked by owner
Templates, history/undo, the rest of Data Quality, Export (other cards), Report.

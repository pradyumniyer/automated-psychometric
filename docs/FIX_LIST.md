# Owner fix list (from hands-on testing; last updated 21 Oct 2026)

Order = priority. These are owner-approved changes to the frozen UI (see `UI_FREEZE.md`). Each item: problem -> required behavior -> tests. Math stays per `scientific-spec.md`.

## Status board (21 Oct 2026)
| Item | What | State |
|---|---|---|
| F2, F3, F4, F5 | Unscored rows line, shared columns, reload keeps place, opaque # column | done, merged |
| F10, F12, F14 | Scoring UI streamlining, bands for decimals, no subscales = automatic subscale | done, merged |
| F1, F15 | Response scales v2 and answers table (numeric scales) | done on branch `p2c2-codex` (5fa8d4c); hand-tested Fixture A, B, template; merge pending |
| F16 | Word scales v3 (display not saved, legacy numbering, uneditable words, dead link, no variants); redesigned by the owner as a labels-left / numbers-right table with preset fill, "+" and Counts as (RESPONSE_SCALES 17.2) | NEXT: prompt P2c-4 |
| F17 | Autosave never loses an edit (flush on leave) | NEXT: in P2c-4 |
| F7 | Normality panel and reliability section | after P2d (P2d-2) |
| F6 | Subscale builder rework | P3a |
| F8 | Proration control | P3b |
| F9 | Import v2 | P4 |
| F11 | Report rework (APA section) | later, not specced |
| F13 | Clarity pass | C1, C2 |
| F27, F28 | Scoring waits for decisions; card-wide Reset to detected | in P2c-4 |
| F23 to F26 | Numbered labels ("5 - Strongly agree"), typo suggestions, notice for two scales in one subscale, drag-to-order helper | in P2c-4 (first three); helper later |
| F18 | Preset library expansion (PHQ-9, GAD-7, PSS, BSI, PANAS, GSE) | P6 |
| F19 | Real-world fixtures and robustness | P2e |
| Small fixes S1 to S5 | Summary rows, Summary sheet A1, (i) tip, Overall transparency | S1 prompt ready; rest in the backlog below |
| Cosmetic polish | Response scales card visuals | deferred by owner to an end-of-project list (see the end of this file) |

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
Checked: Fixture A, Fixture B and the template apply path for numeric scales (21 Oct 2026). Not yet checked: history/undo, the rest of Data Quality, Export (other cards), Report, templates with word scales (after P2c-4).

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
8. Reword "Confirmed" in the card's one-line summary (handled by the P2c-3 design: the status appears only for subscales with reverse items).

**F14. No subscales = one automatic subscale** (owner, 18 Oct 2026; P2c-U). The old separate "Overall Scale" path lacked the Show toggles, bands per output, Confirm range, out-of-range decision, collapsed card and cell links. The dataset is treated as one automatic subscale ("Overall scale") that uses the normal code path; headers follow the subscale pattern; no migration of old projects.

**F15. Answers table** (owner, 20 Oct 2026): one scale line and one answers table per card, presets detected automatically, Flip order and Start at 0 only in word mode; see RESPONSE_SCALES section 15 and prompt P2c-3. Mockup approved 20 Oct 2026 (`docs/mockups/response_scale_card_five_scenarios.html`); P2c-3 queued.

## Cosmetic backlog for the Response scales card (owner hand test, 20 Oct 2026; DEFERRED on 21 Oct 2026 to the end-of-project polish list at the bottom of this file; original wording kept)
1. Dropdown and option font size too small (all screens).
2. The (i) tip text is clipped.
3. The "or number" placeholder in the box under the dropdown is cut off.
4. Uneven spacing between Answer, Found and Counts as.
5. After Confirm range, show a quiet "Confirmed" text instead of the button vanishing.
6. Remove the "Not confirmed" chip (the Confirm button, the amber status bar and the card opening itself already say it); the agent also noted the chip sits in the collapsed header rather than beside the open scale line.
7. Word mode shows its note inside the scale line, not on the separate "Detected" line of section 15.

## P2e. Robustness pass (owner request, 20 Oct 2026; runs before the first public deployment; extended on 21 Oct 2026 by F19 and F20)
The app must handle ANY dataset, not only Fixture A. Run Fixture B (`docs/fixtures/fixture_B.csv` with `fixture_B_expected.json`: three subscales, ranges 1-5, 0-4, 1-7, reverse items in two, an item in no subscale, a blank, an N/A, an out-of-range 8) and further synthetic shapes through the whole pipeline: import, subscales, response scales, scoring, bands, data quality, export, template apply, reload. Extra shapes: 10 or more subscales, custom formulas, no ID column, duplicate IDs, an all-blank column, word scales mixed with numbers, decimals, one-item subscales, very wide files. Expected numbers are computed independently of the app. Every new prompt must also forbid fixture literals in non-test source.


## Findings of 20-21 Oct 2026 (new items; owner hand tests plus architect probes on the real screen)

**F16. Word scales v3** (owner hand test of `fixture_words.csv`, 21 Oct 2026; design in `RESPONSE_SCALES.md` section 17; prompt P2c-4). Subscale 1 = Q1+Q2, Subscale 2 = Q3+Q4+Q5, nothing reversed: nothing could be edited and the links did nothing. Architect findings (reproduced): W1 preset numbers are displayed but not saved, so every score is blank after Run Scoring; W2 legacy first-seen numbering still exists in `buildAutomaticSubscale` and the Auto button, so datasets with no subscales get silently wrong scores (W02 17 instead of 16, W03 and W05 scored instead of blank); W3 a word without a number cannot be numbered (two stale state updates, the second overwrites the first); W4 "Wrong scale? Change" is dead; W5 no word variants ("Neither agree nor disagree" does not match "Neutral"); W6 the status line blames the wrong cause and amber rows have no cell links. Expected numbers are in `RESPONSE_SCALES.md` 17.3. **Design revised by the owner (21 Oct 2026, late):** the app lists the labels found in the data on the left with empty number boxes on the right; if the labels (including variants such as "Neither agree nor disagree") match a preset the numbers are filled in, and only then do "Wrong scale? Change", Flip order and Start at 0 appear; an odd label such as "Maybe" stays blank and amber with a message and actions; all numbers stay editable; "+" adds labels. Architect refinements: a per-row "Counts as..." (fixes typos and unusual spellings without touching the data), a per-row "Not scored", detected label text is not editable (it mirrors the file) while manual labels are, scale points nobody chose are listed with "0 found" or added with "+" so reverse scoring uses the full range, Flip and Start at 0 shown only when a preset is recognised and every label has a decision, "Reset to detected", stable row order, and the raw data is never changed.

**F17. Autosave loses edits** (architect probe, verified on the real screen): saves run 1 second after the last change and unmounting cancels the timer, so editing and switching screens within a second discards the edit. Fix: flush on unmount, tab or step switch, pagehide and visibilitychange (in P2c-4).

**F18. Preset library expansion.** Only generic presets exist (agreement, frequency, satisfaction, quality, importance, likelihood, severity). Psychology exports use PHQ-9/GAD-7 words (0-3), Perceived Stress Scale (0-4), BSI-style (0-4), PANAS (1-5), General Self-Efficacy (1-4) and more. Add with native numbering, aliases and a native-zero flag (P6).

**F27. Scoring waits for decisions** (owner, 21 Oct 2026; part of P2c-4): a row that still says "Choose…" blocks scoring for words, unknown text and out-of-range numbers alike; "Not scored" must always be available because any number would be invented data; Fixture A and Fixture B hand tests now need the decision step (the numbers do not change). Flip order and Start at 0 appear only when a preset is recognised and every label has a decision.
**F28. Reset to detected, whole card** (owner, 21 Oct 2026; part of P2c-4): appears only when the card differs from what the app first showed; restores range, source, decisions, word numbers, Counts as, added labels, preset, Flip, Start at 0 and confirmed state (not reverse ticks, Show toggles, bands, formulas).
**F23. Numbered labels** (architect, part of P2c-4): exports often contain "5 - Strongly agree", "(2) Disagree", "3=Neutral"; when every label carries a distinct leading number the numbers are read from the data.
**F24. Typo suggestions** (part of P2c-4): a label that is a near-spelling of another label ("Agre") gets a one-click "Counts as Agree" suggestion; never applied silently.
**F25. Two scales in one subscale** (part of P2c-4): message "These items look like two different scales. Consider separate subscales." (message only).
**F26. Drag-to-order helper** (later): drag rows into order and a "Number 1 to n" button for no-preset scales.

**F19. Real-world fixtures and robustness (P2e).** Fixtures so far are small, clean and hand-made (A: 30 respondents; B: 12; words: 20). Real exports are messy: Qualtrics extra header rows, Google Forms long headers, mixed numeric and word columns, duplicate or missing IDs, decimal commas, 2,000 columns, 5,000 rows, 6 respondents, 10 or more subscales, one-item subscales. Generate synthetic fixtures with independent expected values and run the whole pipeline (import to export, reload, template).

**F20. Leftovers from the state-fix prompts** (agent report 21 Oct 2026, accepted as follow-up): template-apply through the real preview/confirm UI is not tested; the exhaustive short action sequences do not re-check storage and template round trips after every action or compare app scores after every sequence step; negative ranges (-3 to 3) not confirmed in the range boxes; autosave on unmount (F17). Cleaning-log rule: typed-number decisions are not logged (differs from RESPONSE_SCALES 15).

**F21. Decisions still to take (owner):** (a) show again the reverse-widening explanation note under an out-of-range row (RESPONSE_SCALES 12 and 15), or drop it; (b) log typed-number decisions or not; (c) RESOLVED (owner, 21 Oct 2026, late): scoring WAITS until every flagged answer, word or number, has a decision (number, Counts as, Widen, or Not scored); waiting status bar with a Go to button and "Treat all N as not scored"; included respondents only.

**F22. Range detection for small samples** (owner hand test of Fixture B, 21 Oct 2026; built): weak-end check, see `RESPONSE_SCALES.md` 16.3. Fixture B Subscale 3 = Q10-Q12 (not Q13) detects 1-7 with the 8 flagged; Confirm range never appears for a subscale without reverse items (by design).

**Hand-test recipe Fixture B (corrected 21 Oct 2026).** Import `fixture_B.csv`; add subscales ONE card at a time (known builder bug with several empty cards): Subscale 1 = Q1-Q5 with Q2 and Q4 reversed; Subscale 2 = Q6-Q9 with Q8 reversed; Subscale 3 = Q10-Q12 (do NOT add Q13); leave Q13 and Age unassigned; Overall on. Expected ranges 1-5, 0-4, 1-7; Confirm only for Subscales 1 and 2; Subscale 3 shows "8 (outside 1 to 7)" with "Choose…". R01 17 / 4 / 18 / Overall 39; R02 19 / 8 / 17 / 44; R04 Subscale 3 and Overall blank; R07 Subscale 2 and Overall blank; R09 Subscale 3 and Overall blank; status line R04, R07, R09 (scoring first waits for the 8: choose Not scored, or Widen). Widen the 8: R09 Subscale 3 = 20, Overall 43, status line R04, R07.

## End-of-project polish list (deferred by the owner on 21 Oct 2026: "no need to waste time on beautifying it now")
Response scales card, from the owner's hand test of 20 Oct (E1 to E7 were attempted by the agent; the owner reports the visual problems still persist, so treat all as NOT DONE except where the DOM can be asserted):
1. Dropdown and option font size too small (agent set text-sm; owner says still small; check actual rendered size).
2. The (i) tip text is clipped (shared `Tooltip` in `src/components/ui.tsx`).
3. The "or number" placeholder is cut off.
4. Uneven spacing between Answer, Found and Counts as.
5. After Confirm range a quiet "Confirmed" text (built, DOM-asserted; visual check pending).
6. "Not confirmed" chip removed from the collapsed header (built, DOM-asserted).
7. Word mode shows its note inside the scale line (built; visual check pending).
8. Empty "Answer / Found / Counts as" header when there are no rows (fixed in the follow-up).
Plus everything C1 and C2 will not cover. Do this list in one pass, with screenshots, shortly before the first public release.

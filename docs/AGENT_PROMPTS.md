# Agent prompts (copy one at a time into a NEW Copilot Agent chat)

Rules: one prompt per chat unless noted; paste the agent's final report to Claude for review before moving on; push only after approval (agents never push). The standing rules live in `.github/copilot-instructions.md`. Prompts may be refined after a review. Before each run, check `git status` is clean so the report's `git diff --stat` shows only the agent's work.

## P1. Batch 1 (F2, F3, F4, F5)
```
Follow the working agreement in `.github/copilot-instructions.md`. Read only `docs/FIX_LIST.md` (items F2, F3, F4 and F5; skip F1 and everything else) plus the source files you need; do not re-read other docs. Implement test-first, one separate local commit per item, running test, typecheck and build after each. Do NOT push. These UI changes are owner-approved. Do not touch the import flow, the Response Scales step or the subscale builder. Do not fix lint issues beyond lines you change anyway.

Toggles (owner decision): the existing footer Sum/Mean toggles stay exactly as they are. Add separate score-column toggles (Sum, Mean, Overall) in the same area and style, labelled "Score columns". Their defaults must make the grid and the export look the same as today until the user changes them.

F3 (export matches the live grid): create one column-builder function used by both the LiveGrid and the "Scored data" export. Order: ID/demographics, items grouped by subscale in subscale order, each subscale followed by its score (sum and/or mean per the score-column toggles) and its interpretation, then Overall (per its toggle). Numeric-looking values export as numeric cells in XLSX and numbers in CSV; IDs and real text stay text. Keep the formula-injection protections. Keep today's handling of excluded rows exactly as it is now (including the yellow fill for kept excluded rows in XLSX). Tests: column order equals grid order for Fixture A with sum only, mean only, both, Overall on and off; numeric cells are numeric in the XLSX.

F2 (unscored rows and unassigned items): after scoring, show one line in the existing status area: "N rows have no score because an item is missing, N/A or outside the scale: P25, P26, P29, P30" (first 5 IDs, then "and N more"). Do not list rows the user has already excluded. Before scoring, if subscales exist and some items are in none, show a warning: "12 items are not in any subscale and will not be scored". Tests: Fixture A gives exactly P25, P26, P29, P30; more than 5 rows gives "and N more"; the unassigned-items warning appears and disappears correctly.

F4 (reload keeps your place): hash routes `#/project/:id/:tab`. Persist and restore after a reload: active dataset, active tab, the score-column toggles (Sum, Mean, Overall), and the data-quality thresholds (use the existing Dexie settings / survey_configs fields). An unknown project id, tab or dataset in the hash must fall back to the project list (or the first valid tab) without errors. Browser Back/Forward must move between tabs. Tests: reload restores project, tab, dataset and toggles; an invalid hash falls back safely.

F5: make the sticky `#` row-number column fully opaque on every row (fix the alternating transparency). Verify odd and even rows; a small unit or style test is enough if practical.

Report: the visible behavior changes (plain language), test/typecheck/build results, `git status` and `git diff --stat`, and anything you were unsure about. Commit locally and stop for review.
```

## P2a. Response Scales v2, part 1: pure logic only
```
Follow the working agreement in `.github/copilot-instructions.md`. Read only `docs/RESPONSE_SCALES.md` (all sections, including §10), `docs/decisions/0015-response-scale-v2.md` and `docs/FIX_LIST.md` F1, plus source files you need. Do NOT push. Do not change any screen in this step.

In `src/scientific/`, implement test-first (show the tests failing first, then passing), as separate local commits: (1) `resolveResponse()` (§3); (2) conventional-range detection (§4) including the `confirmed` rule and the "one step beyond a detected end" rule; (3) preset matching, word-variant normalization and the more-than-15-words rule (§5). Cover every test in §9 and §10 that belongs to these functions, with Fixture A (Q3/Q5, P26's 7 on Q4), numeric -99 codes, 0-start, flip, decimals/slider, mixed ranges, a 1–4 detection where nobody chose 5, and 3 stray 5s in 300 responses (suggest widen). Run test, typecheck and build after each commit. Report test/typecheck/build results, `git status` and `git diff --stat`; stop for review.
```

## P2b. Response Scales v2, part 2: use the one resolution function everywhere
```
Follow the working agreement. Read only `docs/RESPONSE_SCALES.md` §2, §3, §7, §9, §10 and the source files you need. Do NOT push. No visible UI change in this step except where noted.

Test-first, separate local commits: (a) make scoring, data quality, reliability and item analysis all use `resolveResponse()`, keeping existing exported names via adapters; Fixture A numbers must not change (add a test that proves it). (b) Write out-of-range actions (treat as missing / widen) and their counts to the history/cleaning log; cells are never altered. (c) Add `confirmed` to the stored scale record; migrate existing saved `response_scale` records (old numeric and old categorical) and mark migrated records `confirmed: true`. (d) A subscale with reverse items whose range is not confirmed is not scored; the status area shows "Confirm the range for <subscale> (it has reverse items)". Run test, typecheck and build after each. Report; stop for review.
```

## P2c. Response Scales v2, part 3: the Response Scales step UI
```
Follow the working agreement. Read only `docs/RESPONSE_SCALES.md` (all, especially §6 and §10) and the source files you need. Do NOT push. These UI changes are owner-approved.

Rebuild the Response Scales step per §6, using existing components and styles: "Apply first to all" at the top; then one combined card per subscale: detected range with editable min/max and a Confirm range button and status; out-of-range message with links to the cells and the two actions; "Other responses found" table; word-labels section (preset, Flip order, Start at 0, mapping rows); scoring method. Implement every UI-related item of the §10 checklist. Separate local commits; test where logic is involved; run test, typecheck and build after each. Report visible behavior changes, results, `git status` and `git diff --stat`; stop for review.
```

## P2d. Response Scales v2, part 4: Data Quality screen
```
Follow the working agreement. Read only `docs/RESPONSE_SCALES.md` §7 and the source files you need. Do NOT push. These UI changes are owner-approved.

Remove the allowed-non-response editor from the Data Quality screen (no replacement editor; built-in codes pre-fill each scale card's table). Data Quality shows counts for special_missing, special_scored, out_of_range, unmapped and blank; thresholds go under an "Advanced" disclosure; add a plain-language summary at the top. Test-first where logic changes; run test, typecheck and build. Report; stop for review.
```

## P3. Batch 2 (F6, F7, F8)
Follow the working agreement. Do NOT push. Read only `docs/FIX_LIST.md` F6, F7, F8 and the source files you need. Separate local commits, test-first where logic changes. F6: subscale builder popup flow exactly as specified (Add subscale; click a card → popup with the unassigned pool, search, multi-select, select all/none, Add; × on item chips returns items to the pool; "Unassigned items" strip above the cards; remove the old "select subscale" box; reverse and reorder unchanged). F7: neutral normality wording (spec §2.6), Q-Q axis labels rounded to 2 decimals and not clipped, add the Lilliefors KS line beside Shapiro-Wilk, add the reliability section (alpha, alpha-if-deleted, corrected item-total r per scale, per spec §3, with the "no verbal labels" rule and the negative item-total note). F8: opt-in proration control in the Scoring panel (default off; 20/25/50% choices; spec 1.3). Report and stop for review.

## P4. Import v2
Follow the working agreement. Do NOT push. Read only `docs/IMPORT_DETECTION.md` and the source files you need. (a) Pure detection function plus synthetic fixtures and expected-layout JSON for layouts L1-L7 (L8-L11 later), generated by a script; tests first and ambiguity returns low confidence. (b) Integrate into the existing import modal: one summary line and "Looks right", the old controls behind "Adjust", compact preview (6 rows x 8 columns, cells cut at 30 characters with tooltip, horizontal scroll), empty rows and columns ignored by default with counts. Keep the parity corpus tests passing. Separate commits; report; stop for review.

## P5. Cleanup
Follow the working agreement. Do NOT push. Fix remaining lint errors and warnings mechanically; make `npm run lint` and `npm audit --omit=dev --audit-level=high` blocking in `.github/workflows/ci.yml`; list (do not delete) dead code and unused files. One commit; report; stop.

## Later (not yet written)
Templates and history checks, error boundary, delete-all-data, backup/restore, deployment, accounts/billing/cloud resume, ConfigScreen split, content validity and the other project types.

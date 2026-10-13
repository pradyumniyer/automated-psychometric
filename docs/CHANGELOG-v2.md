# Changes from v1 → v2 (final)

## Final decisions at a glance
Local-first grids with accounts, billing, server-side plans (Phase 1h) · cloud resume T2 + opt-in encrypted T3 · UI frozen to the Bolt app, re-platformed not redesigned · project-type registry · corrected math (spec Appendix A) with Fixture A confirmed against jamovi · Cronbach's α in Phase 1 · **Overall = combine subscale scores (default) or from all items, optional flip; sum/mean/both outputs** · **Shapiro–Wilk + Lilliefors KS** · **Quick Run + diagnostics report + cleaning log** · **no removing data to improve normality** · Pro ₹300/month or ₹3,000/year (configurable placeholders) · Phase 2 content validity + item analysis (with answer-key scoring) · Phase 4 longitudinal · Phase 5 EMA · qualitative later.

## Detailed change list (history)

## A. Things I changed that you should confirm (they alter earlier decisions or wording)
1. **Proration now counts all missing items** (blank, "N/A"/"Prefer not to say", out-of-range). v1/ADR 0001 said "unexpected missing only". Reason: prorating is about how many items are unavailable, not why. (ADR 0007)
2. **Strict scoring when proration is off**: any missing item ⇒ that scale's score is missing. The old app silently skipped missing items, which under-counts Sums. (ADR 0007)
3. **Prorated Sum = observed mean × number of items** (not the sum of observed items).
4. **Cronbach's α moved into Phase 1** (the code exists but isn't wired to the UI). v1 deferred it. (ADR 0009)
5. **Longstring: a missing value breaks a run.** The old code let runs span gaps.
6. **DQ row means use reverse-coded values** once a config exists.
7. **z-score outliers are opt-in**, Tukey (IQR) fences are the default.
8. **MAD / Mahalanobis** are not shown in v1. **Kolmogorov–Smirnov is shown, Lilliefors-corrected only** (plain KS with estimated parameters is not valid).
9. ~~Overall computed from all items~~ **Superseded by ADR 0012:** Overall = combine subscale scores (default, sum or mean, optional flip) or from all items; sum/mean/both outputs.
10. **Interpretation bands** are matched after rounding to the bounds' precision. (ADR 0008)
11. **Backup/restore and "delete all my data"** added to Phase 1 (v1 acceptance required a backup file but no feature existed).
12. **Client-side Free caps** are accepted as bypassable in Phase 1. (ADR 0004)

13. **UI is frozen to the Bolt app** (`UI_FREEZE.md`): Phase 1 is now a re-platforming (keep components, swap data layer, split `ConfigScreen`, fix math) rather than a screen-by-screen rebuild. The earlier Figma-style wireframes I drew were not based on your app and should be disregarded.

14. **Project-type registry** added as a foundation decision (ADR 0010) so later features are additive; `DECISIONS.md` now has a "decide now, build when needed" foundation checklist. Screenshots are no longer required for the UI freeze.

15. **Accounts, billing and server-side entitlements are now part of Phase 1** (step 1h), by your decision; Content validity + Rpb/item analysis are Phase 2, then reporting, longitudinal, EMA. Qualitative stays later.

16. **Cloud resume** proposed (ADR 0011): settings/history sync for all accounts plus an opt-in end-to-end-encrypted project copy, so work survives a browser wipe. Awaiting your confirmation.
17. **`PROJECT_TYPES.md` and spec §6–§8 drafted** from your flow descriptions, with [D] defaults and [Q] questions for you.

18. **Cloud resume accepted** (ADR 0011). Feature defaults for content validity, item analysis (now with answer-key scoring, discrimination index, distractor analysis), longitudinal (multi-file, composite key, ID-match suggestions) and EMA (lags) **decided by SME recommendation** (you delegated); new `PAINPOINT_BACKLOG.md` and pre-processing add-ons (cleaning log, codebook, import presets, extra DQ flags, export pack).

## B. Conflicts fixed
- `data-model.md` vs `DATABASE.md` (proration unit, field names, template scope/kind, project types, "encrypted backup") → one `DATABASE.md`; proration stored as an integer percent.
- IndexedDB/OPFS vs Dexie → Dexie.
- "Free account" wording in acceptance (Phase 1 has no accounts).
- DQ default threshold: the old docs said 20, the code said 0 → 20, flagged when strictly greater.
- Low-variance rule: spec said SD ≈ 0, code used 5% of scale range → 5% of range.
- 20% boundary: a row at exactly 20% is now prorate-eligible and **not** DQ-flagged.
- Undefined estimators (skewness, kurtosis, quantiles, longstring scope) → defined to match jamovi/SPSS/R.

## C. Added
`PHASE1_BRIEF.md` · `TEST_FIXTURES.md` + `fixtures/` (30-row dataset, generator script, expected results) · `FORMULA_SPEC.md` · `DECISIONS.md` + ADRs 0002–0009 · root `CLAUDE.md` · repo audit (`AS_BUILT.md` §12) · security checklist and threat-model additions (zip-bomb guard, export formula injection, no-eval test, CI audit, review before launch, backup-file import safety).

## D. Removed (content folded elsewhere)
`system-design.md`, `architecture.md`, `data-model.md`, `user-flows.md`. Original copies are in your v1 zip.

## E. What is NOT verified yet
- Fixture A is **confirmed against jamovi** (raw run and reverse-coded run: descriptives, α, α-if-dropped, item–rest r, row-mean skewness/kurtosis/Shapiro–Wilk all matched). jamovi does not cover proration, response-bias flags or Tukey fences; those rest on the spec and the hand-checkable cases.
- Citations in the spec are for provenance; verify authors/years/journals before putting them in user-facing text.
- The Lawshe critical-value table and Aiken exact table must be copied from the published sources in Phase 2.
- I audited the repo's code by reading it, not by running the app. Behavior claims in `AS_BUILT.md` §12 come from the source.

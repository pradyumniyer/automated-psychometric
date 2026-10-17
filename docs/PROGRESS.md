# Build progress log (current state; read this to know where the build stands)

Branch: `local-first-rebuild`. Updated 15 Oct 2026. Rules for agents: `PROJECT_RULES.md`. One step at a time, tests first.

## Done (commits)
| Step | What | Commit |
|------|------|--------|
| 0a | Repo hygiene: package renamed `psychometric-prep`, `.env.example`, real README | 4647c06 |
| 0b | CI (typecheck, build, lint + audit non-blocking), Dependabot, Copilot instructions | a0bf164 |
| 0c-1 | Vitest 3.2.7 harness + fixture-shape tests (blocking `npm test` in CI) | 6e04e85 |
| 0c-2a | Scoring per spec §0–1: normalized matrix, strict scoring, opt-in proration, Overall options | 61d5ffb |
| 0c-2a+ | Default Overall follows subscale methods (all mean → mean) | dbde5c7 |
| 0c-2b | Data quality per spec §2: row-ID keyed flags, 20% missingness, longstring, row means, Tukey, z opt-in | c8924db |
| 0c-2c | Reliability on the normalized matrix (Fixture A α, α-if-deleted, item-total r) | 1e80f0e |
| 0c-2d | Accurate pnorm/qnorm/pt/qt, fixed Shapiro–Wilk and Lilliefors | a549c1f |
| 0d | Replaced vulnerable `xlsx` with papaparse + read-excel-file + write-excel-file; import limits (20 MB, 100 MB uncompressed, 100:1, 25 sheets, 100k rows, 2,000 cols, 5M cells); `.xls` dropped; formula-injection neutralization; yellow XLSX fill for kept excluded rows | fe12aee, 00ffdf1 |
| 0d+ | XLSX dates as ISO text (UTC); CI tests under 3 time zones; working agreement in `.github/copilot-instructions.md` | 2f048d9 |
| 1a (1–4) | Dexie storage layer: schema, atomic import with stable row IDs, config/template repositories, row-ID exclusions, hashed score cache, row-ID history | 0e6e117, d06dfb6, 81526c0, df93acd, 2707eb4, ec4056e |
| 1a (5) | All screens wired to local storage; Supabase removed from the app (client, SDK, env); production audit clean | 1d5bc53, 8f7d10c, 7e86c32, 4bffbeb |
| P1 | F2 unscored-rows line and unassigned warning, F3 shared column builder and numeric export, F4 hash routes and reload persistence, F5 opaque # column, score-cache identity ignores DQ thresholds, cache invalidation tests (full suite 744 tests pass; lint 5 errors/3 warnings, down from 10/4) | 4477067, af989db, e264fc8, 7732db1, 9829418, e1f8c01 |
| P1b | F2 status-line fix (P25, P26, P29, P30), "Score columns" group and Configure CSV/XLSX buttons removed, "Summary rows" label, rail labels, Summary sheet / `_summary.csv` export (753 tests) | 9089cbd, 9f1ff2b, a5d0f4e, 34ce453 |
| P1c | Per-subscale Show Sum/Mean/Custom toggles, bands and interpretation per output, templates keep them, Report/Export use the first shown output (770 tests) | e666693, a1ef586, bd1bae4 |
| P1c2 | F12 bands for decimal scores: continuous bands (lower limit included), gap/overlap validation, range-aware Suggest, "No band" label and status line, shared classification (779 tests) | 28cc33c, db97d86, a67b658 |

## Findings that changed numbers users saw in the old app
- Shapiro–Wilk was broken (W ≈ 0.002 instead of 0.98) because of a `qnorm` sign bug; Q–Q plot theoretical quantiles were also wrong.
- 95% confidence intervals used a wrong t-critical value (0.89 at n = 5; should be 2.78): intervals were far too narrow.
- Lilliefors p-value was wrong (0.010 vs 0.459 for Fixture A); KS is not shown in the UI yet.
- Scores silently under-counted with missing items; default missingness threshold was 0, not 20.

## Known open items (not yet done)
- UI shows binary "normal / not normal" wording (DataQualityScreen: `status`, `mainText`, `Verdict StatBox`); needs an approved text change (spec §2.6).
- No UI switch yet for z-score outliers, proration, Overall options, or the KS line (approved additions, step 1e).
- Lint: 10 errors, 4 warnings in existing UI/library files; make lint blocking in CI after cleanup.
- Dev-only audit advisories (Vitest 3 tree; fixes need Vite 6 + plugin-react upgrade): schedule as its own toolchain-upgrade step.
- Production audit is now clean (0 vulnerabilities). Respondent data no longer goes to any server.
- `distributions` `pchisq` `_logP` argument removed; `pnorm`/`qnorm` honour `logP`.

- `ConfigScreen.tsx` is still ~1,700+ lines (split deferred). `supabase/migrations/` kept as history only. No Supabase data was migrated (prototype data).
- DQ thresholds, allowed non-responses and `last_tab` are in the schema but not yet persisted from the screens.
- Math has been verified by tests; UI/UX was hand-checked by the owner after the storage wiring. A hand check of the Fixture A numbers through the UI is recommended (see owner checklist).

## Current work: owner fix list (`FIX_LIST.md`), prompts in `AGENT_PROMPTS.md`
P1, P1b and P1c done and hand-tested (17 Oct 2026). P1c test found that bands leave gaps for decimal scores (F12) and a subscale-builder assignment bug (added to F6). Cache invalidation on band edits works. P1c2 done and hand-tested. Next: P1d (Overall scale card, Overall bands and interpretation) → P2a-P2d Response Scales v2 (`RESPONSE_SCALES.md`, detection is a suggestion until confirmed) → small-fixes backlog (`FIX_LIST.md`) → P3 Batch 2 (F6 subscale popup, F7 normality panel, F8 proration) → P4 Import v2 → owner checks templates, history, rest of DQ, Export, Report → P5 cleanup (lint blocking in CI) → deploy → accounts/billing/cloud resume. Later, not specced: F11 Report rework (publication-ready APA-formatted section). Builder: Copilot Free (student plan sign-ups paused by GitHub). Lint baseline: 5 errors, 3 warnings (all pre-existing).

## Next (revised for credit budget)
1. Lint cleanup + CI gates (lint and production audit blocking).
2. Error boundary, "delete all my data", backup/restore (approved UI additions in the existing style).
3. First free deployment (static host) for a few real users.
4. Accounts, billing, server-side plan, cloud resume (Phase 1h/1i); then launch page, Privacy Policy and Terms review.
5. Later: `ConfigScreen` split, dark mode, toolchain upgrade (Vite 6), Phase 2 features.

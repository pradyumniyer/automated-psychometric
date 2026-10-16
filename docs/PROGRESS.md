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
No fix prompt has been run yet (last agent work = commit 4bffbeb, Supabase removal). Order: Batch 1 (F2 unscored-rows notice and unassigned warning, F3 export = grid and numeric cells, F4 reload persistence, F5 opaque `#` column) → Response Scales v2 (F1, `RESPONSE_SCALES.md`) → Batch 2 (F6 subscale popup, F7 normality panel, F8 proration control) → Import v2 (`IMPORT_DETECTION.md`) → owner checks templates, history, rest of DQ, Export, Report → cleanup (lint blocking in CI) → deploy → accounts/billing/cloud resume. Scoring check: 26 of 30 Fixture A rows match the owner's Excel; the 4 that differ have missing/invalid items (Excel's SUM skips them).

## Next (revised for credit budget)
1. Lint cleanup + CI gates (lint and production audit blocking).
2. Error boundary, "delete all my data", backup/restore (approved UI additions in the existing style).
3. First free deployment (static host) for a few real users.
4. Accounts, billing, server-side plan, cloud resume (Phase 1h/1i); then launch page, Privacy Policy and Terms review.
5. Later: `ConfigScreen` split, dark mode, toolchain upgrade (Vite 6), Phase 2 features.

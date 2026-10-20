# Build progress log (current state; read this to know where the build stands)

Branch: `local-first-rebuild`. Updated 20 Oct 2026. Rules for agents: `PROJECT_RULES.md`. One step at a time, tests first.

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
| P1d | Overall scale switch and card (Based on Sums/Means/Custom, Combine by Sum/Mean/Custom), Overall bands and interpretation column, templates, cache tests (785 tests) | 962465d, d82bf67 |
| P2a | Response Scales v2 pure logic: `resolveResponse()`, conventional range detection (unconfirmed until confirmed, one-step-beyond rule, `canReverseScore`), preset matching and variants, >15 words rule (800 tests, no UI) | d0bf13b, 81776ac, c513b10 |
| P2a+ | Unicode variant test and widen-range action (`applyOutOfRangeAction`) (804 tests) | f316232, e3390ba |
| P2b | One resolution function for scoring, DQ, reliability, item analysis; `confirmed` flag and migration; cleaning-log payloads; per-column reasons in the Summary notes; fix for a persisted-path regression found by hand test (813 tests) | f8bee26, 08aea0f, 904e537, 3275066, 880c832, 2f16c66, 7fac692 |
| P2c-1 | Response Scales cards: detected range, editable min/max, Confirm range, out-of-range actions with cleaning log, apply first to all, templates keep confirmed state (815 tests) | 1a3f26b, 046f9a6, 59897e4 |
| P2c-1b | Cell highlight, respondent IDs in links, outside-share rule for different-scale items, reverse-widening text, collapsed cards with summary line, waiting status (821 tests) | 21b1802, a526ca0, fbdbfd3, 71f6a79 |
| P2c-1c | Persisted out-of-range decisions, reverse-widening warning always shown with reverse items, waiting status wording and Go-to button (822 tests) | a485379, 5610f2e, 6c2ab58 |
| P2c-U | No subscales = one automatic subscale (F14): scoring, Response Scales, Bands, templates, export on the normal path (827 tests) | 3dc19a9, 9131059, 613ac09 |
| P2c-U1 | Automatic subscale card with Rev toggles in the Subscales step; starts not confirmed | 9b544c9, 9e05570 |
| P2c-2 | Other responses table, word-label presets, templates keep them, Show details control (833 tests). On branch `p2c2-codex`, not merged; hand test found duplicate mapping UI, a 0-0 range collapse, no confirmation reset, widen decision not shown; superseded by the P2c-3 design | 50784f9, 530e9a9, 8b50b2c, 2774fd4 (docs commit 77b5db5 on top) |
| P2c-3 | Answers table redesign of the Response scales card (RESPONSE_SCALES section 15). Mockup approved by the owner 20 Oct 2026 (`docs/mockups/response_scale_card_five_scenarios.html`). Prompt ready; to run on `p2c2-codex`. | not started |

## Findings that changed numbers users saw in the old app
- Shapiro–Wilk was broken (W ≈ 0.002 instead of 0.98) because of a `qnorm` sign bug; Q–Q plot theoretical quantiles were also wrong.
- 95% confidence intervals used a wrong t-critical value (0.89 at n = 5; should be 2.78): intervals were far too narrow.
- Lilliefors p-value was wrong (0.010 vs 0.459 for Fixture A); KS is not shown in the UI yet.
- Scores silently under-counted with missing items; default missingness threshold was 0, not 20.

## Known open items (not yet done)
- UI shows binary "normal / not normal" wording (DataQualityScreen: `status`, `mainText`, `Verdict StatBox`); needs an approved text change (spec §2.6).
- No UI switch yet for z-score outliers, proration, Overall options, or the KS line (approved additions, step 1e).
- Lint: 3 errors, 4 warnings, all pre-existing (ConfigScreen, ImportPreviewModal, ProjectList, ui), per the 20 Oct handoff (earlier notes said 5 and 3; run `npm run lint` before each prompt to confirm). Make lint blocking in CI after cleanup (P5).
- Dev-only audit advisories (Vitest 3 tree; fixes need Vite 6 + plugin-react upgrade): schedule as its own toolchain-upgrade step.
- Production audit is now clean (0 vulnerabilities). Respondent data no longer goes to any server.
- `distributions` `pchisq` `_logP` argument removed; `pnorm`/`qnorm` honour `logP`.

- `ConfigScreen.tsx` is still ~1,700+ lines (split deferred). `supabase/migrations/` kept as history only. No Supabase data was migrated (prototype data).
- DQ thresholds, allowed non-responses and `last_tab` are in the schema but not yet persisted from the screens.
- Math has been verified by tests; UI/UX was hand-checked by the owner after the storage wiring. A hand check of the Fixture A numbers through the UI is recommended (see owner checklist).

## Current work: owner fix list (`FIX_LIST.md`), prompts in `AGENT_PROMPTS.md`
Done and hand-tested: P1, P1b, P1c, P1c2, P1d (to 17 Oct), P2a, P2b (Fixture A: status line P25, P26, P29, P30; Q4 out of range 1; Q3 and Q5 special missing), P2c-1, P2c-1b, P2c-1c, P2c-U, P2c-U1. Lesson: hand-test with a freshly uploaded dataset AND the template-applied path AND a reload. Note: scientific-spec.md also defines an Overall calculated from all items directly (Source A) and optional subscale flipping; the Overall card does not expose them yet.

P2c-2 (branch `p2c2-codex`, not merged, exists only on the owner's computer) failed the owner's hand test: duplicate mapping UI, typing 0 for "Prefer not to say" collapsed the range to 0-0, the Confirmed state did not reset, the widen decision did not show. The planned fix P2c-2b was never run. The owner approved the new card mockup on 20 Oct 2026 (`docs/mockups/response_scale_card_five_scenarios.html`; design in `RESPONSE_SCALES.md` section 15). Next: run P2c-3 on `p2c2-codex`, hand-test with Fixture A and the word fixture, then `git merge --ff-only` into `local-first-rebuild` and push.

Order after that: P2d (Data Quality) -> clarity passes C1 and C2 (`UX_PRINCIPLES.md`) -> small-fixes backlog (`FIX_LIST.md`, S1 first) -> P3 (F6 subscale builder, F7 normality panel, F8 proration) -> P4 Import v2 -> owner checks templates, history, rest of Data Quality, Export, Report -> P5 cleanup (lint blocking in CI) -> deploy -> accounts/billing/cloud resume. Later, not specced: F11 Report rework (publication-ready APA section). Specs for Report (APA, F11) and Import can be written while the builder allowance renews.

Builders: Codex in VS Code (GPT-5.6 Luna at medium reasoning; 6.1 Sol is not available on the owner's Go plan; model guidance at the top of `AGENT_PROMPTS.md`) and GitHub Copilot student plan (151 of 200 AI credits used on 19 Oct 2026; renews 1 Nov). Rules for both: `.github/copilot-instructions.md`; every prompt runs on its own branch (see the top of `AGENT_PROMPTS.md`). Test suite: 833 tests at the last P2c-2 commit.

## Next (revised for credit budget)
1. Lint cleanup + CI gates (lint and production audit blocking).
2. Error boundary, "delete all my data", backup/restore (approved UI additions in the existing style).
3. First free deployment (static host) for a few real users.
4. Accounts, billing, server-side plan, cloud resume (Phase 1h/1i); then launch page, Privacy Policy and Terms review.
5. Later: `ConfigScreen` split, dark mode, toolchain upgrade (Vite 6), Phase 2 features.

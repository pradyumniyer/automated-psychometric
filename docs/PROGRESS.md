# Build progress log (current state; read this to know where the build stands)

Branch: `local-first-rebuild` (public remote at 061526d = P2c-U1). Updated 21 Oct 2026. Work in progress sits on branch `p2c2-codex` (local; a temporary copy at 3d42520 may exist on GitHub). Rules for agents: `PROJECT_RULES.md`. One step at a time, tests first.

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
| P2c-3 | Answers table redesign of the Response scales card (RESPONSE_SCALES section 15). Mockup approved 20 Oct 2026. Rounds P2c-3, 3a, 3b (mappings, range draft, widen/restore, jsdom card tests) | d3966e1, b1e8214, 4e60d60, 0c1452b, 71fa925, f5edfae, 33d106e, df12e7d |
| State fix | Architect reproduced the glitch on the real `ConfigScreen` and proved the cause: an effect re-detected the range whenever a subscale became not confirmed and overwrote Widen, typed ranges and (on every reload) saved ranges. Fix: pure state module `src/lib/responseScaleState.ts`, rangeSource, base range, per-value decisions with `reviewed`, effective range function, detection only seeds the base, three legacy `legacyUiEnabled()` blocks removed, real-screen tests (874 tests) | cc025f5, 3d42520 |
| Follow-up | Dropdown shows one "Choose…"/"Not scored"/"Widen…" list (no duplicate no-op option), empty table header removed, small-sample range detection (weak-end check, RESPONSE_SCALES 16.3), Fixture B and several-out-of-range-values real-screen tests, template and reload tests, "Confirmed" text, chip removed, cosmetic CSS attempts (visually unverified); 887 tests, lint 3 errors / 3 warnings | 7b0d349, 5cc2b28, 5fa8d4c |

## Findings that changed numbers users saw in the old app
- Shapiro–Wilk was broken (W ≈ 0.002 instead of 0.98) because of a `qnorm` sign bug; Q–Q plot theoretical quantiles were also wrong.
- 95% confidence intervals used a wrong t-critical value (0.89 at n = 5; should be 2.78): intervals were far too narrow.
- Lilliefors p-value was wrong (0.010 vs 0.459 for Fixture A); KS is not shown in the UI yet.
- Scores silently under-counted with missing items; default missingness threshold was 0, not 20.
- (21 Oct 2026) Word scales were silently wrong or blank: preset numbers were displayed but not saved (all scores blank), and datasets with no subscales used first-seen numbering (wrong sums with no warning). Fix in P2c-4.
- (21 Oct 2026) With 35 answers one stray 8 made detection pick 1-9 and score the 8; fixed by the weak-end check (RESPONSE_SCALES 16.3).
- (21 Oct 2026) Autosave dropped an edit made within 1 second of leaving the screen. Fix in P2c-4.

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

## Current work (21 Oct 2026)
Hand-tested and approved by the owner: Fixture A (all flows), Fixture B (ranges, Confirm only for reverse subscales, Widen to 1-8, Not scored, reload) and the template-apply path for numeric scales. Test suite on `p2c2-codex`: 887 tests; typecheck and build pass; lint 3 errors and 3 warnings (all pre-existing; no new findings).

**Merge status:** `p2c2-codex` (5fa8d4c) is approved for numeric scales and is to be merged into `local-first-rebuild` with `--ff-only` and pushed (steps in the handoff). The word fixture hand test then found word scales broken (FIX_LIST F16, F17); P2c-4 fixes it on a new branch `p2c4-words` created after the merge. The owner then specified the word-scale table he wants and the architect refined it (RESPONSE_SCALES 17.2); prompt P2c-4 was rewritten for it, including his later decisions (scoring waits for every flagged answer, words and numbers; Flip and Start at 0 only after all decisions; Reset to detected for the whole card). The owner decided cosmetic polish of the Response scales card waits for an end-of-project list (FIX_LIST).

**Order from here:** merge `p2c2-codex` -> P2c-4 (word scales v3 + autosave flush) -> P2d (Data Quality) -> P2d-2 (normality and reliability, F7) -> P3a (subscale builder F6, known bug with several empty cards) -> P3b (proration F8) -> C1 and C2 clarity passes -> S1 and the small-fixes backlog -> P4 Import v2 -> P2e robustness with real-world fixtures (before the first public deployment) -> P6 preset library -> P5 cleanup -> owner checks templates (with words), history/undo, Export cards, Report -> first free deployment and closed beta -> accounts/billing/cloud resume -> F11 Report rework -> end-of-project polish list. Details and prompts: `docs/AGENT_PROMPTS.md`.

**Not hand-checked yet:** word fixture after P2c-4, history/undo, the rest of Data Quality, other Export cards, Report, templates with word scales.

Builders: Codex in VS Code (GPT-5.6 Luna; high reasoning for fixes and state work; 6.1 Sol not available on the owner's Go plan) and GitHub Copilot student plan as backup (151 of 200 credits used on 19 Oct; renews 1 Nov 2026). Rules for both: `.github/copilot-instructions.md`; every prompt runs on its own branch (top of `docs/AGENT_PROMPTS.md`).

## Next (revised for credit budget)
1. Merge and push the approved work; commit the updated docs first.
2. P2c-4, then P2d (see the order above).
3. Lint cleanup + CI gates (lint and production audit blocking) (P5).
4. Error boundary, "delete all my data", backup/restore (approved UI additions in the existing style).
5. First free deployment (static host) for a few real users; accounts, billing, server-side plan, cloud resume (Phase 1h/1i); then launch page, Privacy Policy and Terms review.
6. Later: `ConfigScreen` split (about 2,000 lines; splitting also cuts agent credit use), dark mode, toolchain upgrade (Vite 6), Phase 2 features.

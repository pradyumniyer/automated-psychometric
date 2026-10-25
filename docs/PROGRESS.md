# Build progress log (current state; read this to know where the build stands)

Branch: work is on `p2d-data-quality` (merge back into `local-first-rebuild` when ready). Updated **25 Oct 2026**. Rules for agents: `PROJECT_RULES.md`. One step at a time, tests first.

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


| P2c-4 / words | Response scales: word + numeric, assign-by-label, empty = not scored, rare labels → Other answers (1%+2 threshold), range preserved for specials, scale-complete Flip/Start at 0, backspace blocks scoring, numbers-only inputs | on `p2c4-words-grok` → merged into work leading to `p2d-data-quality` |
| P2d | Data Quality uses subscale scale resolution (no allowed-non-response editor); item answer counts (Valid / Not scored / Scored special / Outside range / No number / Blank); summary strip + Advanced thresholds | `688c5b6` and follow-ups on `p2d-data-quality` |
| P2d-2 (F7) | Neutral normality wording (no Normal/Non-normal verdict, no parametric gatekeeping); Lilliefors KS beside Shapiro–Wilk; Reliability panel (α, α-if-deleted, corrected item–total r); Q–Q ticks to 2 decimals | same branch (hand-checked Fixture A: W 0.9804, p 0.8356) |
| P3a (F6) | Subscale builder: One scale / Subscales; assign by **card id** (fixes empty-card cross-wiring); assign dialog (search, multi-select); unassigned strip; unit tests `tests/subscaleBuilder.test.ts` | `d637328` |
| P3b (F8) | Proration opt-in in Scoring panel (default off; 20/25/50%); persisted on survey config; count of prorated scores in result card and status | applied on `p2d-data-quality` (safe merge with P3a ConfigScreen) |

## Known open items (not yet done)
- **Proration UX polish (backlog, cosmetic):** explain what proration will do before Run Scoring; after scoring list which respondents/scales/items were unavailable; link to rows/cells; highlight prorated **score** cells in the grid (items stay unchanged); richer Scoring-panel result card; drop redundant CSV/XLSX from that card (Export owns export). Core F8 control is done.
- Z-score outliers UI switch still optional (engine exists).
- Overall options UI polish if any remain beyond current Overall settings.
- Lint: pre-existing errors/warnings — make lint blocking in CI after cleanup (**P5**). Run `npm run lint` before each prompt.
- Dev-only audit advisories (Vitest 3 tree; fixes need Vite 6 + plugin-react): toolchain-upgrade step.
- Production audit clean; respondent data stays local.
- `ConfigScreen.tsx` still large (split deferred).
- DQ thresholds **are** persisted from Data Quality Advanced; allowed-non-response editor removed (resolution is via response scales).
- Merge `p2d-data-quality` → `local-first-rebuild` when ready; push remote.


## Current work (25 Oct 2026)

Active branch: **`p2d-data-quality`**. Owner hand-checked: response scales (words + numeric), Data Quality (counts, neutral normality, reliability, Fixture A stats), subscale builder (One scale / Subscales, assign-by-id), proration control (opt-in 20/25/50%, prorated count).

**Next (order):** C1 and C2 clarity passes → S1 / small-fixes backlog → P4 Import v2 → P2e real-world fixtures → P6 preset library → P5 cleanup → owner checks (templates with words, history/undo, Export, Report) → first free deployment. Details: `docs/AGENT_PROMPTS.md`.

**Backlog (not blocking):** proration informativeness (see Known open items); end-of-project polish list in `FIX_LIST.md`.


## Next (revised for credit budget)
1. Merge and push the approved work; commit the updated docs first.
2. P2c-4, then P2d (see the order above).
3. Lint cleanup + CI gates (lint and production audit blocking) (P5).
4. Error boundary, "delete all my data", backup/restore (approved UI additions in the existing style).
5. First free deployment (static host) for a few real users; accounts, billing, server-side plan, cloud resume (Phase 1h/1i); then launch page, Privacy Policy and Terms review.
6. Later: `ConfigScreen` split (about 2,000 lines; splitting also cuts agent credit use), dark mode, toolchain upgrade (Vite 6), Phase 2 features.

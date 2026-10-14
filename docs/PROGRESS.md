# Build progress log (current state; read this to know where the build stands)

Branch: `local-first-rebuild`. Updated 14 Oct 2026. Rules for agents: `PROJECT_RULES.md`. One step at a time, tests first.

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

## Findings that changed numbers users saw in the old app
- Shapiro–Wilk was broken (W ≈ 0.002 instead of 0.98) because of a `qnorm` sign bug; Q–Q plot theoretical quantiles were also wrong.
- 95% confidence intervals used a wrong t-critical value (0.89 at n = 5; should be 2.78): intervals were far too narrow.
- Lilliefors p-value was wrong (0.010 vs 0.459 for Fixture A); KS is not shown in the UI yet.
- Scores silently under-counted with missing items; default missingness threshold was 0, not 20.

## Known open items (not yet done)
- UI shows binary "normal / not normal" wording (DataQualityScreen: `status`, `mainText`, `Verdict StatBox`); needs an approved text change (spec §2.6).
- No UI switch yet for z-score outliers, proration, Overall options, or the KS line (approved additions, step 1e).
- Lint: 11 errors, 4 warnings in untouched UI/library files (cleanup during the ConfigScreen split).
- Dev-only audit advisories (Vitest 3 tree; fixes need Vite 6 + plugin-react upgrade): schedule as its own toolchain-upgrade step.
- Production audit: `ws` and `xlsx` (high). `xlsx` replacement is step 0d (ADR 0005, options need owner approval).
- `distributions` `pchisq` `_logP` argument removed; `pnorm`/`qnorm` honour `logP`.

## Next
0d `xlsx` replacement (plan first, owner approves) → 0e shell/tokens → 0f Dexie storage → Phase 1a onward (`IMPLEMENTATION_PLAN.md`).

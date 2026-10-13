# IMPLEMENTATION_PLAN — Build sequence (v2)

**Read first:** HANDOFF, PHASE1_BRIEF, AS_BUILT, APP_FLOW, PRD, scientific-spec, TEST_FIXTURES, DATABASE, TRD, ui-design-brief, PROJECT_RULES.
**Working rule:** one step at a time. After each step: show lint, typecheck and test output, list changed files, list anything stubbed or assumed, then **stop and wait for approval.**

## Phase 0: Safety net and foundation
**0a Repo hygiene.** Make the repo private. Rename the package from `vite-react-typescript-starter`. Add `.env.example`, a real README, `CLAUDE.md` at the root. Remove `.bolt/` once nothing needs it. Branch `local-first-rebuild`.
**0b CI.** GitHub Actions: lint, typecheck, test, `npm audit --omit=dev` (fail on high). Dependabot.
**0c Test harness + fixtures.** Add Vitest. Add `docs/fixtures/` loader test. Port existing `src/scientific/` modules and fix each Appendix A item **test-first** against `fixture_A`. Remove KS/MAD/Mahalanobis from the UI path.
**0d Spreadsheet library.** Replace `xlsx` per ADR 0005 (present options, get approval). Add upload caps and formula-injection neutralization with tests.
**0e Shell.** Tailwind tokens (light/dark), router, shared primitives (Button, Tabs, Table, Banner, EmptyState, Modal).
**0f Local store.** Dexie schema (`DATABASE.md`), repositories, migrations, project list with create/open/delete.
**Verify:** all tests green; `npm audit` clean for high; create/open/delete projects persist after refresh; no network call carries grid data.

## Phase 1: Re-platform the existing app (UI frozen)
Each step is behavior-preserving unless it says otherwise. Capture before/after screenshots for every screen touched (`UI_FREEZE.md`).

**1a Data layer swap.** Put all persistence behind repository interfaces; implement them with Dexie; remove Supabase from the grid path. Same screens, same behavior; data now survives refresh locally. Shared exclusions persisted (`exclusion_state`).
**1b Split `ConfigScreen.tsx`.** Break into focused components and hooks (no file over ~400 lines) without changing a pixel or interaction. Fix the known state-sync bugs (exclusions across tabs, sum/mean persistence, sheet stability) as part of the split, each with a test.
**1c Math corrections.** Replace scoring/DQ logic with the spec versions (Appendix A items), screens unchanged except the visible numbers that were previously wrong, and explicit messages where scoring is blocked (missing min/max).
**1d Formula fixes F1–F3** (`FORMULA_SPEC.md`).
**1e Approved additions, one at a time, in the existing visual language:** proration control (Scoring panel), reliability section (Data Quality), backup/restore/delete-all, Free-limit messages, visible error/empty states, dark mode, light first-run tour, accessibility pass.
**1f Fix sweep.** Run the acceptance checklist and APP_FLOW §8 against the existing app's behavior; fix every failure (known and unknown) test-first, no UI redesign. The owner has no separate fix list.
**1e-2 Quick Run + diagnostics report workbook + cleaning log** (ADR 0013; APP_FLOW §9; needs UI approval). Can slip to Phase 1.1 without blocking launch.
**1g Launch page, Privacy Policy, Terms** (outside the app shell).
**1h Accounts and billing (decided in Stage 1).** Auth via a proven provider; subscription billing (provider per O1); webhook verification + idempotency; server `GET /api/license`; Free vs Pro entitlements enforced server-side for gated features (the client still enforces row caps because grids never reach the server). Tests for webhooks, entitlement checks, and cross-user access. Account holds email + plan only.
**Verify:** `APP_FLOW.md` §8 end to end against the live Bolt app; `acceptance-phase1.md`; all Fixture A tests.

**1i Cloud resume (ADR 0011).** T2 settings/history sync, then the opt-in encrypted project copy (T3) with restore flow, version-conflict handling, plan quotas and the tests listed in the ADR.

## Phase 1j: Pre-launch gate
Run `security/checklist.md` pre-launch minimum. Obtain an independent security review of upload handling, XSS, headers and dependencies. Confirm Fixture A cross-check in jamovi/R is done. Set billing alerts on the host.

## Fixtures for later phases
Before each of Phases 2, 4 and 5 starts, generate Fixture B (item analysis with answer key), C (longitudinal) and D (EMA) the way Fixture A was made: reference script, expected JSON, cross-check in jamovi/R. Content validity fixtures use the published Lawshe/Aiken tables.

## Later phases
2 Content validity + Rpb / item analysis (first, as fast as specs allow) · 3 Reporting (APA tables, results blurb, curated template library) · 4 Longitudinal · 5 EMA helpers · 6 Expansion. Longitudinal and EMA may start earlier than 3 if their specs are ready. Qualitative later. Do not start a phase until the previous one is stable.

## Rules
One phase green before the next. Never reintroduce a server-side matrix warehouse. Survey paths stay green when types are added. Math matches `scientific-spec.md`. Open decisions in `DECISIONS.md` must be asked, not guessed.

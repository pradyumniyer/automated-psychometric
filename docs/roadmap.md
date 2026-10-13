# Roadmap (v2)

Phased so each phase is shippable and trustworthy. Full vision: `COMPLETE_PRODUCT.md`.

> **Two stages.** Stage A (Phases 0–1): recreate the Bolt app on the new foundation, UI unchanged, corrected math, free to use. Stage B (Phases 2+): new project types through the project-type registry. Accounts and billing are **built in Stage A** (step 1h), so paid plans can exist as soon as the first Pro feature ships.

## Phase 0: Safety net and foundation
Repo private and tidy · CI with `npm audit` · Vitest + fixtures · scientific modules ported and corrected (spec Appendix A) · spreadsheet library replaced · Dexie schema · design tokens. **Exit:** all tests green, no high advisories, local project CRUD works.

## Phase 1: Survey prep excellence (Free + accounts and billing)
Import (simple data-start control, empty row/column handling, multi-sheet) · Configure workbench · scoring (strict default, opt-in proration 20/25/50) · data quality (with defaults in the spec) · **reliability (Cronbach's α)** · exports (drop or yellow-keep) · reports · templates (2 free) · backup/restore + delete-all · dark mode · launch page, Privacy Policy, Terms · security review. **Exit:** thesis-sized workflow works end to end without support, accounts and billing live, Fixture A cross-checked in jamovi/R (done).

## Phase 2: Content validity + item analysis (first after Stage A)
Project-type entry (ADR 0010) · Lawshe (Ayre & Scally) · Aiken V (verified table) · mapping, dimension tags, drop items, exclude experts, expert DQ · exports · **Rpb / item analysis helpers** (spec to be written). **Exit:** usable for a real expert panel and a real item analysis. Open decisions in spec §4.3 resolved first.

## Phase 3: Reporting and Pro depth
APA 7 tables → Word · results-draft blurb · curated template library. **Exit:** clear reason to pay beyond "more rows".

## Phase 4: Longitudinal · Phase 5: EMA helpers · Phase 6: Expansion (qualitative, HR packs)
As in `COMPLETE_PRODUCT.md`. Not started until previous phases are stable. Never market "EMA platform".

## Explicit backlog (parked)
Cloud LLM default on raw grids · full SEM/IRT · real-time collaboration on matrices · commercial test-item piracy · McDonald's ω and CIs for α (consider after Phase 2).

## Metrics (simple, privacy-safe)
Completed export events (local or privacy-safe) · Pro conversion after CV/APA · import/DQ support burden · zero incidents of leaked grids.

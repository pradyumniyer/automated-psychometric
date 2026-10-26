# Dead code / unused inventory (P5 — list only; do not delete without review)

Generated 26 Oct 2026 during P5 cleanup.

## Removed in P5
- `DemographicsPanel` in `ConfigScreen.tsx` — superseded by `SheetIdPanel` (P4b). Deleted in this cleanup (was lint-dead).

## Possibly unused / low-traffic (review later)
- `supabase/migrations/` — history only; not used by the local-first app.
- Import presets in `fileParser.detectHeaderLayout` overlapping `importLayoutDetection.ts` — both still referenced; consolidation later.
- DevDependency audit noise (Vitest tree) — requires Vite 6 upgrade (toolchain step).

## Intentionally kept
- Template apply / history paths used in production flows.
- Multiple fixture expected JSON files used by tests.

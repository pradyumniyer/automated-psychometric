# ADR 0009: Cronbach's α in Phase 1

**Status:** Accepted.
**Decision:** Phase 1 includes a reliability panel: α, α-if-item-deleted, corrected item–total correlation per scale (spec §3). Listwise-complete cases among included rows, reverse-coded, no proration. No verbal labels. Standardized α, ω and CIs are out of scope.
**Why:** it is the most expected statistic for questionnaire users; the engine already exists in the prototype but is not wired to the UI. It must pass Fixture A and be cross-checked in jamovi/R.

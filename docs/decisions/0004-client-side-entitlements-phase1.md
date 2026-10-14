# ADR 0004: Entitlements: client-side caps, server-side plan

**Status:** Amended: accounts and billing are now built in Phase 1 (step 1h), so plan/feature entitlements are server-side from launch.
**Decision:** Free limits (≤500 rows/dataset, ≤2 projects, 2 templates) are enforced in client code with hardcoded Free defaults.
**Why:** no accounts or paid features exist in Phase 1; there is nothing to protect server-side.
**Known limitation:** these limits can be bypassed by a technical user via browser dev tools. Accepted.
**Now (Phase 1h):** plan and entitlements come from a server `GET /api/license`; Pro-only features are gated by that response. Row/project/template caps remain a client concern (data never reaches the server), so a determined user can bypass numeric caps; that is accepted.

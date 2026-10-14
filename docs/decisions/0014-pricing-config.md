# ADR 0014: Pricing and plan configuration

**Status:** Accepted (placeholders).
**Decision:** Plans: **Free**, **Pro monthly (₹300)**, **Pro yearly (₹3,000)**; lab/university licences and international prices later. Amounts and plan limits live in billing-provider and server configuration, never hardcoded in the client. The server returns the plan and entitlements via `GET /api/license`.
**Why:** prices will change after real-user testing; changes must not require a rebuild.

# ADR 0007: Proration counts all missing items; strict by default

**Status:** Accepted. Amends ADR 0001.
**Decision:**
1. A scale item is "missing" if blank, an allowed non-response, or out-of-range.
2. Proration OFF (default): any missing item ⇒ scale score missing.
3. Proration ON (threshold t ∈ {20, 25, 50}): allowed iff at least one item observed and `missing × 100 ≤ t × k` (inclusive, integer arithmetic). Mean = observed mean; **Sum = observed mean × k.**
4. DQ still distinguishes unexpected blanks from allowed non-response.
**Why:** prorating addresses how many items are unavailable, not why; the existing code silently under-counts Sums when items are missing; strict default avoids silent partial scores.
**Check with owner:** this changes the earlier wording "unexpected missing only".

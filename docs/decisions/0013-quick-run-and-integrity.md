# ADR 0013: Quick Run mode and data-integrity policy

**Status:** Accepted.
**Decision:**
1. Add a **Quick Run** mode (upload → template → rule-based cleaning → scored file + diagnostics report + cleaning log) alongside the guided workbench; both use the same engine.
2. **No feature may remove or alter observations merely to improve a statistical test result** (e.g. deleting cases until normality passes). Exclusions are rule-based, logged, and user-approved.
3. Every automatic exclusion, recode and ID match is written to the cleaning log.
**Why:** it serves the product's core promise (less manual work) without enabling questionable research practices and supports reproducibility.

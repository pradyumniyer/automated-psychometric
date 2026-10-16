# ADR 0015: Response Scales v2

**Status:** Accepted (owner approved).
**Decision:** One response-scale model per scale: a detected numeric range plus a table of other responses (special responses and word labels). Empty number = not scored; number = scored (not reversed by default). Out-of-range defaults to "treat as missing", never altered; range detection uses conventional ranges at ≥ 99% coverage, so stray values stay detectable. The separate allowed non-response editor is removed from Data Quality; a built-in list of usual missing codes pre-fills each scale card's table, where the user can change any response. Details: `RESPONSE_SCALES.md`.
**Why:** the old numeric/categorical split could not express "1–5 plus optional N/A", detection misclassified such columns, and out-of-range was undetectable for word scales.

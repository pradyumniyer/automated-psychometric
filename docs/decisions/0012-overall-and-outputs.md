# ADR 0012: Overall composition and optional sum/mean outputs

**Status:** Accepted (owner confirmed).
**Decision:** An Overall score is built either by **combining subscale scores** (default; sum or mean; a subscale may be flipped) or **from all items** (per scientific-spec 1.4). Sum, mean, or both may be output per subscale; only enabled outputs are generated.
**Why:** the owner's workflow (e.g. Positive + Negative Coping → Overall Coping); the old code summed subscale scores even when they were means, which is wrong.
**Consequence:** results schema stores the overall's `source`, `method` and flipped subscales; export provenance states them.

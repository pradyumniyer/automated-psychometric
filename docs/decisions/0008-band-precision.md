# ADR 0008: Interpretation bands at the bounds' precision

**Status:** Accepted.
**Decision:** Before matching a score to a band, round it half-up to the number of decimals used in the band bounds (whole numbers if all bounds are whole). Display and export the unrounded score. Band validation (overlap/gap) uses the same precision. Note the rounding in export provenance.
**Why:** prorated sums and mean scores can be fractional; integer-bounded bands (e.g. 10–14, 15–19) otherwise leave gaps.

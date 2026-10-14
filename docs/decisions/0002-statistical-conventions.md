# ADR 0002: Statistical conventions

**Status:** Accepted. **Details:** `scientific-spec.md`.

**Decision:** Match jamovi/SPSS/R defaults so users can cross-check results.
- Sample variance/SD (n−1). Quantiles: linear interpolation (R type 7).
- Skewness G1 and excess kurtosis G2 (bias-corrected).
- Outliers: Tukey fences (1.5×IQR) on row means by default; |z| > 3 opt-in.
- Normality: Shapiro–Wilk (Royston AS R94, 3 ≤ n ≤ 5000) **and** Lilliefors-corrected KS (never plain KS) + descriptives. Never used to delete observations.
- Response bias: longstring (missing breaks runs) ≥ 6, extreme ≥ 80%, midpoint ≥ 70% (odd-option scales only), SD < 5% of range.
- DQ missingness flag: strictly greater than 20%.
- Row means use reverse-coded values once a config exists.

- Lilliefors p-values follow R's `nortest::lillie.test` exactly (R is the reference); statsmodels is used for comparison only below p = 0.1.

**Why:** reproducibility, standard practice, and testability against reference software.
**Consequence:** the existing code differs in several places (spec Appendix A); fixtures decide.

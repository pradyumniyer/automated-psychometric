// Kolmogorov-Smirnov one-sample test for normality.
// Matches R's ks.test(x, "pnorm", mean, sd) with Lilliefors correction
// when parameters are estimated from the data.

import { pnorm } from './distributions';

export interface KSResult {
  D: number;
  pValue: number;
  n: number;
  method: string;
  lillieforsCorrected: boolean;
}

// One-sample KS test against a fully-specified normal distribution
// (mean and sd known a priori — NOT estimated from the data).
// This matches R's ks.test(x, "pnorm", mean, sd) exactly.
export function ksTestNormal(
  data: number[],
  mean: number,
  sd: number,
): KSResult {
  const x = data
    .filter((v) => v !== null && v !== undefined && !isNaN(v))
    .sort((a, b) => a - b);

  const n = x.length;
  if (n < 2) return { D: NaN, pValue: NaN, n, method: 'Kolmogorov-Smirnov', lillieforsCorrected: false };

  // Compute D = max over all x of max(|F_n(x-) - F_0(x)|, |F_n(x) - F_0(x)|)
  let dPlus = 0;
  let dMinus = 0;
  for (let i = 0; i < n; i++) {
    const cdf = pnorm(x[i], mean, sd, true, false);
    const empLower = i / n;
    const empUpper = (i + 1) / n;
    dPlus = Math.max(dPlus, empUpper - cdf);
    dMinus = Math.max(dMinus, cdf - empLower);
  }
  const D = Math.max(dPlus, dMinus);

  // P-value via asymptotic Kolmogorov distribution
  // P(K > D) = 2 * sum_{j=1}^{inf} (-1)^{j-1} * exp(-2*j^2*D^2)
  const pAsymptotic = kolmogorovPValue(D, n);

  return {
    D,
    pValue: pAsymptotic,
    n,
    method: 'Kolmogorov-Smirnov (asymptotic)',
    lillieforsCorrected: false,
  };
}

// Lilliefors-corrected KS test for normality.
// When mean and sd are estimated from the data, the standard KS p-values
// are too conservative. Lilliefors (1967) provided corrected critical values.
// We use the approximation from Dallal & Wilkinson (1986), which is the
// formula used by R's nortest::lillie.test().
export function lillieforsTest(data: number[]): KSResult {
  const x = data
    .filter((v) => v !== null && v !== undefined && !isNaN(v))
    .sort((a, b) => a - b);

  const n = x.length;
  if (n < 5) return { D: NaN, pValue: NaN, n, method: 'Lilliefors (Kolmogorov-Smirnov normality)', lillieforsCorrected: true };

  // Estimate parameters from the data
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const variance = x.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);

  // Compute D statistic (same as KS but with estimated parameters)
  let dPlus = 0;
  let dMinus = 0;
  for (let i = 0; i < n; i++) {
    const cdf = pnorm(x[i], mean, sd, true, false);
    const empLower = i / n;
    const empUpper = (i + 1) / n;
    dPlus = Math.max(dPlus, empUpper - cdf);
    dMinus = Math.max(dMinus, cdf - empLower);
  }
  const D = Math.max(dPlus, dMinus);

  // Lilliefors-corrected p-value using Dallal & Wilkinson (1986) approximation
  // This matches R's nortest::lillie.test() p-value computation
  const pValue = lillieforsPValue(D, n);

  return {
    D,
    pValue,
    n,
    method: 'Lilliefors (Kolmogorov-Smirnov normality correction)',
    lillieforsCorrected: true,
  };
}

// Asymptotic Kolmogorov P-value: P(K > D) = 2 * sum (-1)^{j-1} exp(-2j^2 D^2)
// R uses this in ks.test for the asymptotic case.
function kolmogorovPValue(D: number, n: number): number {
  // Small-sample adjustment: use sqrt(n) * D
  const sqrtN_D = Math.sqrt(n) * D;

  let sum = 0;
  for (let j = 1; j <= 200; j++) {
    const term = Math.pow(-1, j - 1) * Math.exp(-2 * j * j * sqrtN_D * sqrtN_D);
    sum += term;
    if (Math.abs(term) < 1e-16) break;
  }
  let p = 2 * sum;
  if (p > 1) p = 1;
  if (p < 0) p = 0;
  return p;
}

// Lilliefors-corrected p-value (Dallal & Wilkinson 1986 approximation)
// This is the formula used by R's nortest::lillie.test():
//   D = (sqrt(n) - 0.01 + 0.855/sqrt(n)) * D_stat
//   p = exp(-7.01356 * D^2 * (1 + D/2 + D^3/4 + ...))
// But more precisely, R's nortest uses a polynomial approximation.
// We implement the Dallal-Wilkinson formula as documented in R's nortest source.
function lillieforsPValue(D: number, n: number): number {
  const adjustedD = n > 100 ? D * Math.pow(n / 100, 0.49) : D;
  const adjustedN = Math.min(n, 100);
  let pValue = Math.exp(
    -7.01256 * adjustedD ** 2 * (adjustedN + 2.78019)
    + 2.99587 * adjustedD * Math.sqrt(adjustedN + 2.78019)
    - 0.122119
    + 0.974598 / Math.sqrt(adjustedN)
    + 1.67997 / adjustedN,
  );

  if (pValue > 0.1) {
    const k = (Math.sqrt(n) - 0.01 + 0.85 / Math.sqrt(n)) * D;
    if (k <= 0.302) {
      pValue = 1;
    } else if (k <= 0.5) {
      pValue = 2.76773 - 19.828315 * k + 80.709644 * k ** 2
        - 138.55152 * k ** 3 + 81.218052 * k ** 4;
    } else if (k <= 0.9) {
      pValue = -4.901232 + 40.662806 * k - 97.490286 * k ** 2
        + 94.029866 * k ** 3 - 32.355711 * k ** 4;
    } else if (k <= 1.31) {
      pValue = 6.198765 - 19.558097 * k + 23.186922 * k ** 2
        - 12.234627 * k ** 3 + 2.423045 * k ** 4;
    } else {
      pValue = 0;
    }
  }
  return pValue;
}

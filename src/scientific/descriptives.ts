// Descriptive statistics — matching R's output conventions.
// Skewness/kurtosis default to e1071 type=2 (SPSS/SAS compatible).

import { pnorm } from './distributions';

export interface DescriptiveStats {
  n: number; validN: number; missing: number;
  mean: number; sd: number; variance: number; se: number;
  min: number; max: number; range: number; median: number; mode: number | null;
  sum: number; skewness: number; kurtosis: number;
  q1: number; q3: number; iqr: number; ci95Lower: number; ci95Upper: number;
}

export function mean(x: number[]): number {
  const v = x.filter((v) => v != null && !isNaN(v));
  if (!v.length) return NaN;
  return v.reduce((s, v) => s + v, 0) / v.length;
}

export function variance(x: number[]): number {
  const v = x.filter((v) => v != null && !isNaN(v));
  if (v.length < 2) return NaN;
  const m = mean(v);
  return v.reduce((s, v) => s + (v - m) ** 2, 0) / (v.length - 1);
}

export function sd(x: number[]): number { return Math.sqrt(variance(x)); }

export function se(x: number[]): number {
  const v = x.filter((v) => v != null && !isNaN(v));
  return sd(v) / Math.sqrt(v.length);
}

export function median(x: number[]): number { return quantile(x, 0.5); }

export function quantile(x: number[], p: number): number {
  const v = x.filter((v) => v != null && !isNaN(v));
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const h = (s.length - 1) * p;
  const lo = Math.floor(h), hi = Math.ceil(h);
  return lo === hi ? s[lo] : s[lo] + (h - lo) * (s[hi] - s[lo]);
}

export function mode(x: number[]): number | null {
  const v = x.filter((v) => v != null && !isNaN(v));
  if (!v.length) return null;
  const counts = new Map<number, number>();
  let maxC = 0, result: number | null = null;
  for (const val of v) {
    const c = (counts.get(val) || 0) + 1;
    counts.set(val, c);
    if (c > maxC) { maxC = c; result = val; }
  }
  return result;
}

export function skewness(x: number[], type: 1 | 2 | 3 = 2): number {
  const v = x.filter((v) => v != null && !isNaN(v));
  const n = v.length;
  if (n < 3) return NaN;
  const m = mean(v);
  const m2 = v.reduce((s, val) => s + (val - m) ** 2, 0) / n;
  const m3 = v.reduce((s, val) => s + (val - m) ** 3, 0) / n;
  if (m2 === 0) return 0;
  const g1 = m3 / m2 ** 1.5;
  if (type === 1) return g1;
  if (type === 2) return g1 * Math.sqrt(n * (n - 1)) / (n - 2);
  return g1 * ((n - 1) / n) ** 1.5;
}

export function kurtosis(x: number[], type: 1 | 2 | 3 = 2): number {
  const v = x.filter((v) => v != null && !isNaN(v));
  const n = v.length;
  if (n < 4) return NaN;
  const m = mean(v);
  const m2 = v.reduce((s, val) => s + (val - m) ** 2, 0) / n;
  const m4 = v.reduce((s, val) => s + (val - m) ** 4, 0) / n;
  if (m2 === 0) return 0;
  const g2 = m4 / m2 ** 2 - 3;
  if (type === 1) return g2;
  if (type === 2) return ((n + 1) * g2 + 6) * (n - 1) / ((n - 2) * (n - 3));
  return (g2 + 3) * (1 - 1 / n) ** 2 - 3;
}

export function descriptiveStats(x: number[]): DescriptiveStats {
  const v = x.filter((v) => v != null && !isNaN(v));
  const n = x.length, validN = v.length;
  const m = mean(v), s = sd(v), seVal = se(v);
  const min = v.length ? Math.min(...v) : NaN;
  const max = v.length ? Math.max(...v) : NaN;
  const tCrit = validN > 30 ? 1.959963985 : tCritical(0.975, validN - 1);
  return {
    n, validN, missing: n - validN,
    mean: m, sd: s, variance: variance(v), se: seVal,
    min, max, range: max - min, median: median(v), mode: mode(v),
    sum: v.reduce((s, v) => s + v, 0),
    skewness: skewness(v, 2), kurtosis: kurtosis(v, 2),
    q1: quantile(v, 0.25), q3: quantile(v, 0.75), iqr: quantile(v, 0.75) - quantile(v, 0.25),
    ci95Lower: m - tCrit * seVal, ci95Upper: m + tCrit * seVal,
  };
}

function tCritical(p: number, df: number): number {
  if (df <= 0) return NaN;
  const z = pnorm(p, 0, 1, true);
  const g1 = 1 / (4 * df), g2 = 1 / (96 * df * df);
  return z + (z * z + 1) * g1 / 2 + (z ** 3 + 3 * z) * g2 * 2;
}

export function pearsonCorrelation(x: number[], y: number[]): number {
  const pairs: [number, number][] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] != null && !isNaN(x[i]) && y[i] != null && !isNaN(y[i])) pairs.push([x[i], y[i]]);
  }
  if (pairs.length < 2) return NaN;
  const mx = mean(pairs.map((p) => p[0])), my = mean(pairs.map((p) => p[1]));
  let num = 0, dx2 = 0, dy2 = 0;
  for (const [xi, yi] of pairs) {
    const dx = xi - mx, dy = yi - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  return num / Math.sqrt(dx2 * dy2);
}

export function covariance(x: number[], y: number[]): number {
  const pairs: [number, number][] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] != null && !isNaN(x[i]) && y[i] != null && !isNaN(y[i])) pairs.push([x[i], y[i]]);
  }
  if (pairs.length < 2) return NaN;
  const mx = mean(pairs.map((p) => p[0])), my = mean(pairs.map((p) => p[1]));
  return pairs.reduce((s, [xi, yi]) => s + (xi - mx) * (yi - my), 0) / (pairs.length - 1);
}

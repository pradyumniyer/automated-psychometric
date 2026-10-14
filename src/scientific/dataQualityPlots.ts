import { mean, sd, quantile } from './descriptives';
import { qnorm } from './distributions';

export function qqPlotData(values: number[]): { theoretical: number; sample: number }[] {
  const sorted = [...values].filter((v) => v != null && !isNaN(v)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 2) return [];
  const m = mean(sorted);
  const s = sd(sorted);
  if (s === 0 || isNaN(s)) return [];
  const result: { theoretical: number; sample: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i + 0.5) / n;
    const theoretical = qnorm(p, 0, 1);
    const sample = (sorted[i] - m) / s;
    result.push({ theoretical, sample });
  }
  return result;
}

// ── Histogram bins + normal curve overlay ──
export function histogramData(values: number[], bins = 20): { bin: string; count: number; normalCurve: number }[] {
  const valid = values.filter((v) => v != null && !isNaN(v));
  if (valid.length < 2) return [];
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (min === max) return [{ bin: min.toFixed(2), count: valid.length, normalCurve: valid.length }];
  const binWidth = (max - min) / bins;
  const m = mean(valid);
  const s = sd(valid);
  const counts = new Array(bins).fill(0);
  for (const v of valid) {
    let binIdx = Math.floor((v - min) / binWidth);
    if (binIdx >= bins) binIdx = bins - 1;
    counts[binIdx]++;
  }
  const result: { bin: string; count: number; normalCurve: number }[] = [];
  for (let i = 0; i < bins; i++) {
    const binStart = min + i * binWidth;
    const binEnd = binStart + binWidth;
    const binMid = (binStart + binEnd) / 2;
    const binLabel = `${binStart.toFixed(1)}–${binEnd.toFixed(1)}`;
    // Normal curve: expected count = N * P(X in bin) ≈ N * f(mid) * binWidth
    let normalCurve = 0;
    if (s > 0 && !isNaN(s)) {
      const pdf = (1 / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((binMid - m) / s) ** 2);
      normalCurve = valid.length * pdf * binWidth;
    }
    result.push({ bin: binLabel, count: counts[i], normalCurve });
  }
  return result;
}

// ── Boxplot data ──
export interface BoxplotData {
  min: number; q1: number; median: number; q3: number; max: number;
  outliers: number[];
}

export function boxplotData(values: number[]): BoxplotData | null {
  const valid = values.filter((v) => v != null && !isNaN(v));
  if (valid.length < 4) return null;
  const q1 = quantile(valid, 0.25);
  const q3 = quantile(valid, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const withinFence = valid.filter((v) => v >= lowerFence && v <= upperFence);
  const outliers = valid.filter((v) => v < lowerFence || v > upperFence);
  return {
    min: Math.min(...withinFence),
    q1,
    median: quantile(valid, 0.5),
    q3,
    max: Math.max(...withinFence),
    outliers,
  };
}

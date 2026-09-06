// Data Quality engine — missingness, out-of-range, response bias, outliers, normality.
// Reuses verified statistical utilities from the codebase.

import { mean, sd, skewness, kurtosis, quantile, descriptiveStats } from './descriptives';
import { shapiroWilk, ShapiroWilkResult } from './shapiroWilk';
import { qnorm } from './distributions';
import { detectScale } from './detection';

// ── Types ──

export interface AllowedNonResponse {
  textValues: string[];   // e.g. "N/A", "Prefer not to say"
  numericSentinels: number[]; // e.g. -99, 99, 999
}

export interface QualityThresholds {
  unexpectedMissingPct: number;   // person-level, default 20
  longstringMin: number;          // consecutive identical, default 6
  extremeRate: number;            // fraction at scale endpoints, default 0.80
  midpointRate: number;           // fraction at midpoint, default 0.70
  lowVarianceFraction: number;    // fraction of scale range, default 0.05
  zscoreThreshold: number;        // default 3.0
  minValidItemFrac: number;       // min valid items for stable row-mean, default 0.50
}

export const DEFAULT_THRESHOLDS: QualityThresholds = {
  unexpectedMissingPct: 20,
  longstringMin: 6,
  extremeRate: 0.80,
  midpointRate: 0.70,
  lowVarianceFraction: 0.05,
  zscoreThreshold: 3.0,
  minValidItemFrac: 0.50,
};

export const DEFAULT_ALLOWED_NON_RESPONSE: AllowedNonResponse = {
  textValues: ['N/A', 'Not applicable', 'Prefer not to say', 'Refused', 'NA', 'n/a', 'na'],
  numericSentinels: [-99, 99, 999, -999, 77, 88],
};

export type Severity = 'mild' | 'moderate' | 'severe';

export interface RowFlag {
  rowIndex: number;
  reasons: string[];
  severity: Severity;
  categories: Set<FlagCategory>;
}

export type FlagCategory = 'missingness' | 'outOfRange' | 'responseBias' | 'outlier';

export interface ItemMissingness {
  column: string;
  unexpectedMissingPct: number;
  allowedNonResponsePct: number;
  totalMissingPct: number;
}

export interface MissingnessSummary {
  respondentsAboveThreshold: number;
  itemsWithHighMissing: ItemMissingness[];
  totalRows: number;
  includedRows: number;
}

export interface OutOfRangeSummary {
  rowsWithOutOfRange: number;
  outOfRangeCells: number;
  rangeSource: 'configured' | 'inferred';
  scaleMin: number | null;
  scaleMax: number | null;
}

export interface ResponseBiasSummary {
  straightLining: number;
  extremeResponding: number;
  midpointResponding: number;
  lowVariance: number;
  totalFlagged: number;
}

export interface OutlierSummary {
  iqrCount: number;
  zscoreCount: number;
  combinedCount: number;
}

export interface NormalitySummary {
  n: number;
  W: number | null;
  pValue: number | null;
  skewness: number | null;
  excessKurtosis: number | null;
  isNormal: boolean | null;
  interpretation: string;
  insufficientData: boolean;
}

export interface QualityResult {
  rowMeans: (number | null)[];
  flags: RowFlag[];
  missingness: MissingnessSummary;
  outOfRange: OutOfRangeSummary;
  responseBias: ResponseBiasSummary;
  outliers: OutlierSummary;
  normality: NormalitySummary;
  itemMissingness: ItemMissingness[];
  rowMeanValues: number[];
  rowMeanIndices: number[];
}

// ── Helpers ──

function isBlank(val: unknown): boolean {
  return val == null || val === '' || (typeof val === 'string' && val.trim() === '');
}

function isAllowedNonResponse(val: unknown, allowed: AllowedNonResponse): boolean {
  if (val == null) return false;
  const str = String(val).trim();
  if (allowed.textValues.some((t) => t.toLowerCase() === str.toLowerCase())) return true;
  const num = Number(val);
  if (!isNaN(num) && isFinite(num) && allowed.numericSentinels.includes(num)) return true;
  return false;
}

function toNumeric(val: unknown): number | null {
  if (val == null || val === '') return null;
  const num = Number(val);
  if (!isNaN(num) && isFinite(num)) return num;
  return null;
}

function severityRank(s: Severity): number {
  return s === 'severe' ? 3 : s === 'moderate' ? 2 : 1;
}

function maxSeverity(a: Severity, b: Severity): Severity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

// ── Main computation ──

export function computeDataQuality(
  rows: Record<string, unknown>[],
  headers: string[],
  itemColumns: string[],
  excludedRowIndices: number[],
  scaleMin: number | null,
  scaleMax: number | null,
  allowedNonResponse: AllowedNonResponse,
  thresholds: QualityThresholds = DEFAULT_THRESHOLDS,
): QualityResult {
  const excludedSet = new Set(excludedRowIndices);
  const totalRows = rows.length;
  const includedIndices: number[] = [];
  for (let i = 0; i < totalRows; i++) {
    if (!excludedSet.has(i)) includedIndices.push(i);
  }

  // Determine scale range
  let rangeSource: 'configured' | 'inferred' = 'configured';
  let effectiveMin = scaleMin;
  let effectiveMax = scaleMax;
  if (effectiveMin == null || effectiveMax == null) {
    const detection = detectScale(headers, rows, itemColumns);
    if (detection.scaleType === 'numeric') {
      effectiveMin = effectiveMin ?? detection.minValue;
      effectiveMax = effectiveMax ?? detection.maxValue;
      rangeSource = 'inferred';
    }
  }
  const hasRange = effectiveMin != null && effectiveMax != null;
  const scaleRange = hasRange ? (effectiveMax! - effectiveMin!) : null;
  const midpoint = hasRange ? (effectiveMin! + effectiveMax!) / 2 : null;

  // ── Row means + item-level missingness ──
  const rowMeans: (number | null)[] = new Array(totalRows).fill(null);
  const itemMissingnessMap: Record<string, { unexpected: number; allowed: number; total: number; validN: number }> = {};
  for (const col of itemColumns) itemMissingnessMap[col] = { unexpected: 0, allowed: 0, total: 0, validN: 0 };

  for (const idx of includedIndices) {
    const row = rows[idx];
    const numericValues: number[] = [];
    for (const col of itemColumns) {
      const val = row[col];
      const blank = isBlank(val);
      const allowed = isAllowedNonResponse(val, allowedNonResponse);
      const num = toNumeric(val);

      if (blank) {
        itemMissingnessMap[col].unexpected++;
        itemMissingnessMap[col].total++;
      } else if (allowed) {
        itemMissingnessMap[col].allowed++;
        itemMissingnessMap[col].total++;
      } else if (num !== null) {
        itemMissingnessMap[col].validN++;
      } else {
        // Non-numeric, non-allowed, non-blank → unexpected missing
        itemMissingnessMap[col].unexpected++;
        itemMissingnessMap[col].total++;
      }

      if (num !== null && !allowed) numericValues.push(num);
    }

    const minValid = Math.ceil(itemColumns.length * thresholds.minValidItemFrac);
    if (numericValues.length >= minValid) {
      rowMeans[idx] = mean(numericValues);
    }
  }

  // Item missingness summary
  const itemMissingness: ItemMissingness[] = itemColumns.map((col) => {
    const m = itemMissingnessMap[col];
    const denom = includedIndices.length || 1;
    return {
      column: col,
      unexpectedMissingPct: (m.unexpected / denom) * 100,
      allowedNonResponsePct: (m.allowed / denom) * 100,
      totalMissingPct: ((m.unexpected + m.allowed) / denom) * 100,
    };
  }).sort((a, b) => b.unexpectedMissingPct - a.unexpectedMissingPct);

  // ── Build flags per included row ──
  const flagsMap = new Map<number, RowFlag>();

  function getOrCreate(idx: number): RowFlag {
    if (!flagsMap.has(idx)) {
      flagsMap.set(idx, { rowIndex: idx, reasons: [], severity: 'mild', categories: new Set() });
    }
    return flagsMap.get(idx)!;
  }

  function addReason(idx: number, reason: string, category: FlagCategory, severity: Severity) {
    const flag = getOrCreate(idx);
    if (!flag.reasons.includes(reason)) flag.reasons.push(reason);
    flag.categories.add(category);
    flag.severity = maxSeverity(flag.severity, severity);
  }

  // ── Missingness flags ──
  let respondentsAboveThreshold = 0;
  for (const idx of includedIndices) {
    const row = rows[idx];
    let unexpectedMissing = 0;
    for (const col of itemColumns) {
      const val = row[col];
      if (isBlank(val)) unexpectedMissing++;
      else if (!isAllowedNonResponse(val, allowedNonResponse) && toNumeric(val) === null) unexpectedMissing++;
    }
    const pct = (unexpectedMissing / Math.max(itemColumns.length, 1)) * 100;
    if (pct > thresholds.unexpectedMissingPct) {
      respondentsAboveThreshold++;
      const sev: Severity = pct >= 50 ? 'severe' : pct >= 35 ? 'moderate' : 'mild';
      addReason(idx, `High unexpected missingness (${pct.toFixed(0)}%)`, 'missingness', sev);
    }
  }

  // ── Out-of-range flags ──
  let outOfRangeCells = 0;
  const outOfRangeRows = new Set<number>();
  if (hasRange) {
    for (const idx of includedIndices) {
      const row = rows[idx];
      let rowOutOfRange = 0;
      for (const col of itemColumns) {
        const val = row[col];
        if (isBlank(val) || isAllowedNonResponse(val, allowedNonResponse)) continue;
        const num = toNumeric(val);
        if (num !== null && (num < effectiveMin! || num > effectiveMax!)) {
          outOfRangeCells++;
          rowOutOfRange++;
        }
      }
      if (rowOutOfRange > 0) {
        outOfRangeRows.add(idx);
        const sev: Severity = rowOutOfRange >= 3 ? 'severe' : rowOutOfRange >= 2 ? 'moderate' : 'moderate';
        addReason(idx, `Out-of-range value(s) detected (${rowOutOfRange})`, 'outOfRange', sev);
      }
    }
  }

  // ── Response bias flags ──
  let straightLiningCount = 0, extremeCount = 0, midpointCount = 0, lowVarCount = 0;
  for (const idx of includedIndices) {
    const row = rows[idx];
    const nums: number[] = [];
    for (const col of itemColumns) {
      const val = row[col];
      if (isBlank(val) || isAllowedNonResponse(val, allowedNonResponse)) continue;
      const num = toNumeric(val);
      if (num !== null) nums.push(num);
    }
    if (nums.length < 3) continue;

    // Straight-lining: longest run of consecutive identical values
    let maxRun = 1, currentRun = 1;
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] === nums[i - 1]) { currentRun++; if (currentRun > maxRun) maxRun = currentRun; }
      else currentRun = 1;
    }
    const longStringSevere = maxRun >= 12 || maxRun >= nums.length * 0.5;
    if (maxRun >= thresholds.longstringMin) {
      straightLiningCount++;
      const sev: Severity = longStringSevere ? 'severe' : maxRun >= thresholds.longstringMin + 4 ? 'moderate' : 'mild';
      addReason(idx, `Straight-lining (run of ${maxRun} identical)`, 'responseBias', sev);
    }

    // Extreme responding
    if (hasRange) {
      const extremeVals = nums.filter((v) => v === effectiveMin || v === effectiveMax);
      const extremeRate = extremeVals.length / nums.length;
      if (extremeRate >= thresholds.extremeRate) {
        extremeCount++;
        const sev: Severity = extremeRate >= 0.90 ? 'severe' : 'moderate';
        addReason(idx, `Extreme responding (${(extremeRate * 100).toFixed(0)}% at endpoints)`, 'responseBias', sev);
      }

      // Midpoint responding
      if (midpoint != null) {
        const midVals = nums.filter((v) => v === midpoint);
        const midRate = midVals.length / nums.length;
        if (midRate >= thresholds.midpointRate) {
          midpointCount++;
          const sev: Severity = midRate >= 0.85 ? 'severe' : 'moderate';
          addReason(idx, `Midpoint responding (${(midRate * 100).toFixed(0)}% at midpoint)`, 'responseBias', sev);
        }
      }

      // Low within-person variance
      if (scaleRange && scaleRange > 0) {
        const wpSd = sd(nums);
        const lowVarThreshold = scaleRange * thresholds.lowVarianceFraction;
        if (!isNaN(wpSd) && wpSd < lowVarThreshold) {
          lowVarCount++;
          const sev: Severity = wpSd < lowVarThreshold * 0.5 ? 'severe' : 'mild';
          addReason(idx, `Low within-person variance (SD ${wpSd.toFixed(2)} < ${(lowVarThreshold).toFixed(2)}, ${(thresholds.lowVarianceFraction * 100).toFixed(0)}% of scale range)`, 'responseBias', sev);
        }
      }
    }
  }

  // ── Outliers on row means ──
  const rowMeanValues: number[] = [];
  const rowMeanIndices: number[] = [];
  for (const idx of includedIndices) {
    if (rowMeans[idx] != null && !isNaN(rowMeans[idx]!)) {
      rowMeanValues.push(rowMeans[idx]!);
      rowMeanIndices.push(idx);
    }
  }

  let iqrOutlierIndices = new Set<number>();
  let zscoreOutlierIndices = new Set<number>();

  if (rowMeanValues.length >= 4) {
    // IQR
    const q1 = quantile(rowMeanValues, 0.25);
    const q3 = quantile(rowMeanValues, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    for (let i = 0; i < rowMeanValues.length; i++) {
      if (rowMeanValues[i] < lowerFence || rowMeanValues[i] > upperFence) {
        const idx = rowMeanIndices[i];
        iqrOutlierIndices.add(idx);
        const sev: Severity = (rowMeanValues[i] < q1 - 3 * iqr || rowMeanValues[i] > q3 + 3 * iqr) ? 'severe' : 'moderate';
        addReason(idx, `Outlier (IQR: row mean ${rowMeanValues[i].toFixed(2)} outside fences)`, 'outlier', sev);
      }
    }

    // Z-score
    const m = mean(rowMeanValues);
    const s = sd(rowMeanValues);
    if (s > 0 && !isNaN(s)) {
      for (let i = 0; i < rowMeanValues.length; i++) {
        const z = Math.abs((rowMeanValues[i] - m) / s);
        if (z > thresholds.zscoreThreshold) {
          const idx = rowMeanIndices[i];
          zscoreOutlierIndices.add(idx);
          // Only add reason if IQR didn't already flag it
          if (!iqrOutlierIndices.has(idx)) {
            addReason(idx, `Outlier (z-score: |z| = ${z.toFixed(2)})`, 'outlier', z > 4 ? 'severe' : 'moderate');
          }
        }
      }
    }
  }

  const combinedOutlierIndices = new Set([...iqrOutlierIndices, ...zscoreOutlierIndices]);

  // ── Normality ──
  let normality: NormalitySummary;
  const validMeans = rowMeanValues.filter((v) => v != null && !isNaN(v));
  const n = validMeans.length;

  if (n < 3) {
    normality = {
      n,
      W: null, pValue: null, skewness: null, excessKurtosis: null,
      isNormal: null,
      interpretation: `Insufficient data (n=${n}). At least 3 valid row means required for normality testing.`,
      insufficientData: true,
    };
  } else {
    const sw: ShapiroWilkResult = n <= 5000 ? shapiroWilk(validMeans) : { W: NaN, pValue: NaN, n, ifault: 2, method: 'n > 5000' };
    const skew = skewness(validMeans, 2);
    const exKurt = kurtosis(validMeans, 2);
    const isNormal = !isNaN(sw.pValue) ? sw.pValue > 0.05 : null;

    let interpretation: string;
    if (isNaN(sw.pValue)) {
      interpretation = n > 5000
        ? `Shapiro-Wilk not supported for n > 5000. Sample size: n=${n}. Consider visual inspection (histogram, Q-Q plot) or a Lilliefors-corrected KS test. Skewness=${skew.toFixed(3)}, excess kurtosis=${exKurt.toFixed(3)}.`
        : `Normality test could not be completed (n=${n}). Inspect the histogram and Q-Q plot visually.`;
    } else if (isNormal) {
      interpretation = `Data appears normally distributed (Shapiro-Wilk W=${sw.W.toFixed(4)}, p=${sw.pValue.toFixed(4)} > 0.05). Skewness=${skew.toFixed(3)}, excess kurtosis=${exKurt.toFixed(3)}. Parametric analyses are appropriate.`;
    } else {
      interpretation = `Data significantly deviates from normality (Shapiro-Wilk W=${sw.W.toFixed(4)}, p=${sw.pValue.toFixed(4)} ≤ 0.05). Skewness=${skew.toFixed(3)}, excess kurtosis=${exKurt.toFixed(3)}. Note: in large samples, even tiny deviations can be statistically significant — always inspect the Q-Q plot and histogram before deciding on transformations or non-parametric methods.`;
    }

    normality = {
      n,
      W: isNaN(sw.W) ? null : sw.W,
      pValue: isNaN(sw.pValue) ? null : sw.pValue,
      skewness: isNaN(skew) ? null : skew,
      excessKurtosis: isNaN(exKurt) ? null : exKurt,
      isNormal,
      interpretation,
      insufficientData: false,
    };
  }

  // ── Assemble flags array ──
  const flags = Array.from(flagsMap.values()).sort((a, b) => {
    if (severityRank(a.severity) !== severityRank(b.severity)) return severityRank(b.severity) - severityRank(a.severity);
    return a.rowIndex - b.rowIndex;
  });

  return {
    rowMeans,
    flags,
    missingness: {
      respondentsAboveThreshold,
      itemsWithHighMissing: itemMissingness.filter((m) => m.unexpectedMissingPct > thresholds.unexpectedMissingPct),
      totalRows,
      includedRows: includedIndices.length,
    },
    outOfRange: {
      rowsWithOutOfRange: outOfRangeRows.size,
      outOfRangeCells,
      rangeSource,
      scaleMin: effectiveMin,
      scaleMax: effectiveMax,
    },
    responseBias: {
      straightLining: straightLiningCount,
      extremeResponding: extremeCount,
      midpointResponding: midpointCount,
      lowVariance: lowVarCount,
      totalFlagged: flags.filter((f) => f.categories.has('responseBias')).length,
    },
    outliers: {
      iqrCount: iqrOutlierIndices.size,
      zscoreCount: zscoreOutlierIndices.size,
      combinedCount: combinedOutlierIndices.size,
    },
    normality,
    itemMissingness,
    rowMeanValues,
    rowMeanIndices,
  };
}

// ── Q-Q plot data ──
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

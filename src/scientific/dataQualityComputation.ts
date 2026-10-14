import { mean, sd, skewness, kurtosis, quantile } from './descriptives';
import { shapiroWilk, ShapiroWilkResult } from './shapiroWilk';
import { detectScale } from './detection';
import { AllowedNonResponse, DEFAULT_THRESHOLDS, FlagCategory, ItemMissingness, NormalitySummary, PerRowQuality, QualityComputationOptions, QualityResult, QualityThresholds, RowFlag, Severity } from './dataQualityTypes';
import { createLegacyNormalizedMatrix, maxSeverity, resolveRowIds, severityRank, validateNormalizedMatrix } from './dataQualityHelpers';

export function computeDataQuality(
  rows: Record<string, unknown>[],
  headers: string[],
  itemColumns: string[],
  excludedRowIndices: number[],
  scaleMin: number | null,
  scaleMax: number | null,
  allowedNonResponse: AllowedNonResponse,
  thresholds: QualityThresholds = DEFAULT_THRESHOLDS,
  options: QualityComputationOptions = {},
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
  const rowIds = resolveRowIds(rows, options.rowIds);
  const normalizedMatrix = options.normalizedMatrix
    ?? createLegacyNormalizedMatrix(rows, itemColumns, effectiveMin, effectiveMax, allowedNonResponse);
  validateNormalizedMatrix(normalizedMatrix, totalRows, itemColumns, rowIds);
  const optionCount = options.responseOptionCount
    ?? (hasRange && Number.isInteger(effectiveMin) && Number.isInteger(effectiveMax)
      ? effectiveMax! - effectiveMin! + 1
      : null);
  const hasOddOptionMidpoint = optionCount != null && optionCount % 2 === 1;

  // ── Row means + item-level missingness ──
  const rowMeans: (number | null)[] = new Array(totalRows).fill(null);
  const itemMissingnessMap = Object.create(null) as Record<
    string,
    { unexpected: number; allowed: number; outOfRange: number; valid: number }
  >;
  for (const col of itemColumns) itemMissingnessMap[col] = { unexpected: 0, allowed: 0, outOfRange: 0, valid: 0 };
  const perRow = Object.create(null) as Record<string, PerRowQuality>;

  for (const idx of includedIndices) {
    const rowId = rowIds[idx];
    const normalizedValues: number[] = [];
    const rowNumbers: number[] = [];
    let blank = 0;
    let allowed = 0;
    let outOfRange = 0;
    for (const col of itemColumns) {
      const state = normalizedMatrix.states[idx][col];
      const value = normalizedMatrix.values[idx][col];
      if (state === 'blank') {
        blank++;
        itemMissingnessMap[col].unexpected++;
      } else if (state === 'allowed') {
        allowed++;
        itemMissingnessMap[col].allowed++;
      } else if (state === 'out_of_range') {
        outOfRange++;
        itemMissingnessMap[col].outOfRange++;
      } else {
        itemMissingnessMap[col].valid++;
        if (value === null || !Number.isFinite(value)) {
          throw new Error(`Normalized valid item "${col}" has no finite value in row ${rowId}.`);
        }
        rowNumbers.push(value);
        const reverseRange = options.reverseRangesByColumn?.[col];
        normalizedValues.push(reverseRange ? reverseRange.min + reverseRange.max - value : value);
      }
    }

    const minValid = Math.ceil(itemColumns.length * thresholds.minValidItemFrac);
    if (itemColumns.length > 0 && rowNumbers.length >= minValid) {
      rowMeans[idx] = mean(normalizedValues);
    }
    perRow[rowId] = {
      rowIndex: idx,
      unexpectedMissingRate: blank / Math.max(itemColumns.length, 1),
      blank,
      allowedNonresponse: allowed,
      outOfRange,
      longstringRaw: 0,
      extremeRate: 0,
      midpointRate: 0,
      withinPersonSdRaw: rowNumbers.length >= 2 ? sd(rowNumbers) : null,
      rowMeanScored: rowMeans[idx],
      flags: {
        high_missingness_gt_20pct: false,
        straightline_ge_6: false,
        extreme_ge_80pct: false,
        midpoint_ge_70pct: false,
        low_variance_sd_lt_5pct_range: false,
        outlier_iqr: false,
        outlier_z_gt_3: false,
      },
    };
  }

  // Item missingness summary
  const itemMissingness: ItemMissingness[] = itemColumns.map((col) => {
    const m = itemMissingnessMap[col];
    const denom = includedIndices.length || 1;
    return {
      column: col,
      unexpectedMissingCount: m.unexpected,
      allowedNonResponseCount: m.allowed,
      outOfRangeCount: m.outOfRange,
      validCount: m.valid,
      unexpectedMissingPct: (m.unexpected / denom) * 100,
      allowedNonResponsePct: (m.allowed / denom) * 100,
      outOfRangePct: (m.outOfRange / denom) * 100,
      validPct: (m.valid / denom) * 100,
      totalMissingPct: ((m.unexpected + m.allowed) / denom) * 100,
    };
  }).sort((a, b) => b.unexpectedMissingPct - a.unexpectedMissingPct);

  // ── Build flags per included row ──
  const flagsMap = new Map<string, RowFlag>();

  function getOrCreate(idx: number): RowFlag {
    const rowId = rowIds[idx];
    if (!flagsMap.has(rowId)) {
      flagsMap.set(rowId, { rowId, rowIndex: idx, reasons: [], severity: 'mild', categories: new Set() });
    }
    return flagsMap.get(rowId)!;
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
    let unexpectedMissing = 0;
    for (const col of itemColumns) {
      if (normalizedMatrix.states[idx][col] === 'blank') unexpectedMissing++;
    }
    const pct = (unexpectedMissing / Math.max(itemColumns.length, 1)) * 100;
    if (pct > thresholds.unexpectedMissingPct) {
      respondentsAboveThreshold++;
      const sev: Severity = pct >= 50 ? 'severe' : pct >= 35 ? 'moderate' : 'mild';
      addReason(idx, `High unexpected missingness (${pct.toFixed(0)}%)`, 'missingness', sev);
      perRow[rowIds[idx]].flags.high_missingness_gt_20pct = true;
    }
  }

  // ── Out-of-range flags ──
  let outOfRangeCells = 0;
  const outOfRangeRows = new Set<number>();
  for (const idx of includedIndices) {
    const rowOutOfRange = perRow[rowIds[idx]].outOfRange;
    outOfRangeCells += rowOutOfRange;
    if (rowOutOfRange > 0) {
      outOfRangeRows.add(idx);
      const sev: Severity = rowOutOfRange >= 3 ? 'severe' : 'moderate';
      addReason(idx, `Out-of-range value(s) detected (${rowOutOfRange})`, 'outOfRange', sev);
    }
  }

  // ── Response bias flags ──
  let straightLiningCount = 0, extremeCount = 0, midpointCount = 0, lowVarCount = 0;
  for (const idx of includedIndices) {
    const rowId = rowIds[idx];
    const nums: number[] = [];
    let maxRun = 0;
    let currentRun = 0;
    let previousValue: number | null = null;
    for (const col of itemColumns) {
      if (normalizedMatrix.states[idx][col] !== 'valid') {
        previousValue = null;
        currentRun = 0;
        continue;
      }
      const value = normalizedMatrix.values[idx][col];
      if (value === null || !Number.isFinite(value)) continue;
      nums.push(value);
      currentRun = value === previousValue ? currentRun + 1 : 1;
      maxRun = Math.max(maxRun, currentRun);
      previousValue = value;
    }
    perRow[rowId].longstringRaw = maxRun;
    if (nums.length < 3) continue;

    const longStringSevere = maxRun >= 12 || maxRun >= nums.length * 0.5;
    if (maxRun >= thresholds.longstringMin) {
      straightLiningCount++;
      const sev: Severity = longStringSevere ? 'severe' : maxRun >= thresholds.longstringMin + 4 ? 'moderate' : 'mild';
      addReason(idx, `Straight-lining (run of ${maxRun} identical)`, 'responseBias', sev);
      perRow[rowId].flags.straightline_ge_6 = true;
    }

    // Extreme responding
    if (hasRange) {
      const extremeVals = nums.filter((v) => v === effectiveMin || v === effectiveMax);
      const extremeRate = extremeVals.length / nums.length;
      perRow[rowId].extremeRate = extremeRate;
      if (extremeRate >= thresholds.extremeRate) {
        extremeCount++;
        const sev: Severity = extremeRate >= 0.90 ? 'severe' : 'moderate';
        addReason(idx, `Extreme responding (${(extremeRate * 100).toFixed(0)}% at endpoints)`, 'responseBias', sev);
        perRow[rowId].flags.extreme_ge_80pct = true;
      }

      // Midpoint responding
      if (midpoint != null && hasOddOptionMidpoint) {
        const midVals = nums.filter((v) => v === midpoint);
        const midRate = midVals.length / nums.length;
        perRow[rowId].midpointRate = midRate;
        if (midRate >= thresholds.midpointRate) {
          midpointCount++;
          const sev: Severity = midRate >= 0.85 ? 'severe' : 'moderate';
          addReason(idx, `Midpoint responding (${(midRate * 100).toFixed(0)}% at midpoint)`, 'responseBias', sev);
          perRow[rowId].flags.midpoint_ge_70pct = true;
        }
      }

      // Low within-person variance
      if (scaleRange && scaleRange > 0) {
        const wpSd = perRow[rowId].withinPersonSdRaw ?? NaN;
        const lowVarThreshold = scaleRange * thresholds.lowVarianceFraction;
        if (!isNaN(wpSd) && wpSd < lowVarThreshold) {
          lowVarCount++;
          const sev: Severity = wpSd < lowVarThreshold * 0.5 ? 'severe' : 'mild';
          addReason(idx, `Low within-person variance (SD ${wpSd.toFixed(2)} < ${(lowVarThreshold).toFixed(2)}, ${(thresholds.lowVarianceFraction * 100).toFixed(0)}% of scale range)`, 'responseBias', sev);
          perRow[rowId].flags.low_variance_sd_lt_5pct_range = true;
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

  const iqrOutlierIndices = new Set<number>();
  const zscoreOutlierIndices = new Set<number>();
  const q1 = rowMeanValues.length ? quantile(rowMeanValues, 0.25) : null;
  const q3 = rowMeanValues.length ? quantile(rowMeanValues, 0.75) : null;
  const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;
  const fenceLow = q1 !== null && iqr !== null ? q1 - 1.5 * iqr : null;
  const fenceHigh = q3 !== null && iqr !== null ? q3 + 1.5 * iqr : null;

  if (rowMeanValues.length >= 4) {
    // Tukey fences use the type-7 quantile convention shared by quantile().
    for (let i = 0; i < rowMeanValues.length; i++) {
      if (rowMeanValues[i] < fenceLow! || rowMeanValues[i] > fenceHigh!) {
        const idx = rowMeanIndices[i];
        iqrOutlierIndices.add(idx);
        const sev: Severity = (rowMeanValues[i] < q1! - 3 * iqr! || rowMeanValues[i] > q3! + 3 * iqr!) ? 'severe' : 'moderate';
        addReason(idx, `Outlier (IQR: row mean ${rowMeanValues[i].toFixed(2)} outside fences)`, 'outlier', sev);
        perRow[rowIds[idx]].flags.outlier_iqr = true;
      }
    }

    if (options.enableZScoreOutliers === true) {
      const m = mean(rowMeanValues);
      const s = sd(rowMeanValues);
      if (s > 0 && !isNaN(s)) {
        for (let i = 0; i < rowMeanValues.length; i++) {
          const z = Math.abs((rowMeanValues[i] - m) / s);
          if (z > thresholds.zscoreThreshold) {
            const idx = rowMeanIndices[i];
            zscoreOutlierIndices.add(idx);
            perRow[rowIds[idx]].flags.outlier_z_gt_3 = true;
            if (!iqrOutlierIndices.has(idx)) {
              addReason(idx, `Outlier (z-score: |z| = ${z.toFixed(2)})`, 'outlier', z > 4 ? 'severe' : 'moderate');
            }
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
  const flagsByRowId = Object.fromEntries(flagsMap.entries());

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
    perRow,
    flagsByRowId,
    groupRowMeans: {
      nRowMeans: rowMeanValues.length,
      q1,
      q3,
      iqr,
      fenceLow,
      fenceHigh,
    },
  };
}

// ── Q-Q plot data ──

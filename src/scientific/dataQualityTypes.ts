import type { NormalizedMatrix } from './scoring';

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
  rowId: string;
  rowIndex: number;
  reasons: string[];
  severity: Severity;
  categories: Set<FlagCategory>;
}

export type FlagCategory = 'missingness' | 'outOfRange' | 'responseBias' | 'outlier';

export interface ItemMissingness {
  column: string;
  unexpectedMissingCount: number;
  allowedNonResponseCount: number;
  outOfRangeCount: number;
  validCount: number;
  unexpectedMissingPct: number;
  allowedNonResponsePct: number;
  outOfRangePct: number;
  validPct: number;
  totalMissingPct: number;
}

export interface PerRowQuality {
  rowIndex: number;
  unexpectedMissingRate: number;
  blank: number;
  allowedNonresponse: number;
  outOfRange: number;
  longstringRaw: number;
  extremeRate: number;
  midpointRate: number;
  withinPersonSdRaw: number | null;
  rowMeanScored: number | null;
  flags: Record<string, boolean>;
}

export interface GroupRowMeanSummary {
  nRowMeans: number;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  fenceLow: number | null;
  fenceHigh: number | null;
}

export interface QualityComputationOptions {
  rowIds?: string[];
  normalizedMatrix?: NormalizedMatrix;
  reverseRangesByColumn?: Record<string, { min: number; max: number }>;
  responseOptionCount?: number;
  enableZScoreOutliers?: boolean;
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
  perRow: Record<string, PerRowQuality>;
  flagsByRowId: Record<string, RowFlag>;
  groupRowMeans: GroupRowMeanSummary;
}

// ── Helpers ──

import type { SurveyConfigRecord } from '@/storage/schema';

export type HistorySlice = {
  config: Omit<SurveyConfigRecord, 'updated_at'>;
  excludedRowIds: string[];
};

export function historySlice(
  config: SurveyConfigRecord,
  excludedRowIds: string[],
): HistorySlice {
  const copy = { ...config };
  delete (copy as { updated_at?: number }).updated_at;
  return {
    config: copy,
    excludedRowIds: [...excludedRowIds].sort(),
  };
}

export function sameHistorySlice(left: HistorySlice, right: HistorySlice): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function describeExclusionChange(
  beforeIds: string[],
  afterIds: string[],
  rowIds: string[],
): string {
  const before = new Set(beforeIds);
  const after = new Set(afterIds);
  const excluded = afterIds.filter((id) => !before.has(id));
  const included = beforeIds.filter((id) => !after.has(id));
  const label = (id: string) => {
    const index = rowIds.indexOf(id);
    return index >= 0 ? `row ${index + 1}` : 'a row';
  };
  if (excluded.length === 1 && included.length === 0) return `Excluded ${label(excluded[0])}`;
  if (included.length === 1 && excluded.length === 0) return `Included ${label(included[0])}`;
  if (excluded.length > 0 && included.length === 0) return `Excluded ${excluded.length} rows`;
  if (included.length > 0 && excluded.length === 0) return `Included ${included.length} rows`;
  return `Updated exclusions (${excluded.length} excluded, ${included.length} included)`;
}

const THRESHOLD_LABELS: Record<string, string> = {
  unexpectedMissingPct: 'unexpected missing',
  longstringMin: 'longstring',
  extremeRate: 'extreme responding',
  midpointRate: 'midpoint responding',
  lowVarianceFraction: 'low variance',
  zscoreThreshold: 'z-score',
};

export function describeThresholdChange(
  before: Record<string, number>,
  after: Record<string, number>,
): string {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => before[key] !== after[key]);
  if (keys.length === 0) return 'Updated data quality thresholds';
  if (keys.length === 1) {
    const key = keys[0];
    const name = THRESHOLD_LABELS[key] ?? key;
    return `Data quality: ${name} ${before[key] ?? '—'} → ${after[key] ?? '—'}`;
  }
  const names = keys.map((key) => THRESHOLD_LABELS[key] ?? key);
  return `Updated data quality thresholds (${names.join(', ')})`;
}

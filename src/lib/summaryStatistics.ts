import type { ScoredColumn } from './scoredColumns';

export interface SummaryColumnStatistics {
  sum: number | null;
  mean: number | null;
  nUsed: number;
  nNotCounted: number;
}

export interface SummaryStatistics {
  includedCount: number;
  numericColumns: ReadonlySet<string>;
  columns: Record<string, SummaryColumnStatistics>;
}

function numericCell(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildSummaryStatistics(
  columns: readonly Pick<ScoredColumn, 'key' | 'type'>[],
  rows: Record<string, unknown>[],
  excludedRows: ReadonlySet<number>,
  idColumns: ReadonlySet<string>,
): SummaryStatistics {
  const includedRows = rows.filter((_, index) => !excludedRows.has(index));
  const numericColumns = new Set<string>();
  const summaries: Record<string, SummaryColumnStatistics> = {};

  for (const column of columns) {
    if (column.type === 'interpretation' || idColumns.has(column.key)) continue;
    const values = includedRows
      .map((row) => numericCell(row[column.key]))
      .filter((value): value is number => value !== null);
    if (column.type === 'demo' && values.length === 0) continue;

    numericColumns.add(column.key);
    const sum = values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
    summaries[column.key] = {
      sum,
      mean: sum === null ? null : sum / values.length,
      nUsed: values.length,
      nNotCounted: includedRows.length - values.length,
    };
  }

  return { includedCount: includedRows.length, numericColumns, columns: summaries };
}

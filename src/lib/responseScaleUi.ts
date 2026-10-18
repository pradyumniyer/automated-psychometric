import type { DemographicColumn } from '@/types/domain';

export const MIXED_RANGE_OUTLIER_SHARE = 0.1;

export interface ResponseScaleCardSummary {
  name: string;
  itemCount: number;
  min: number | null;
  max: number | null;
  confirmed: boolean;
  outputs: string[];
}

export interface WaitingSubscale {
  name: string;
  hasReverseItems: boolean;
  rangeConfirmed: boolean;
}

export function responseScaleSummaryLine(summary: ResponseScaleCardSummary): string {
  const range = summary.min === null || summary.max === null
    ? 'range not set'
    : `scale ${summary.min}-${summary.max}`;
  const status = summary.confirmed ? 'Confirmed' : 'Not confirmed';
  return `${summary.itemCount} items - ${range} - ${status} - shows ${summary.outputs.join(', ')}`;
}

export function shouldOpenResponseScaleCard(
  rangeConfirmed: boolean,
  hasReverseItems: boolean,
  hasDifferentScaleItem: boolean,
): boolean {
  return (!rangeConfirmed && hasReverseItems) || hasDifferentScaleItem;
}

export function waitingSubscaleStatus(names: string[]): string | null {
  if (names.length === 0) return null;
  return `Scoring is waiting: confirm the scale range for ${names[0]} (it has reverse items).${names.length > 1 ? ` and ${names.length - 1} more.` : ''}`;
}

export function getDisplayIds(
  rows: Record<string, unknown>[],
  demographicColumns: Pick<DemographicColumn, 'column_name' | 'detected_by'>[],
): string[] {
  const idColumn = demographicColumns.find((column) => /\bID\b/i.test(column.detected_by))?.column_name;
  return rows.map((row, index) => {
    const value = idColumn ? row[idColumn] : undefined;
    return value == null || String(value).trim() === '' ? `row ${index + 1}` : String(value);
  });
}

export function hasDifferentScaleItem(
  itemValues: Record<string, unknown[]>,
  min: number,
  max: number,
): { item: string; min: number; max: number }[] {
  return Object.entries(itemValues).flatMap(([item, values]) => {
    const numeric = values
      .map((value) => typeof value === 'number' ? value : Number(value))
      .filter((value) => Number.isFinite(value));
    if (numeric.length === 0) return [];
    const outside = numeric.filter((value) => value < min || value > max).length;
    if (outside / numeric.length <= MIXED_RANGE_OUTLIER_SHARE) return [];
    return [{ item, min: Math.min(...numeric), max: Math.max(...numeric) }];
  });
}


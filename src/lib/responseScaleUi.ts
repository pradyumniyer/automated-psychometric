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

export interface OutOfRangeDecision {
  action: 'missing' | 'widen';
  cells: string[];
  values: number[];
  originalMin?: number;
  originalMax?: number;
}

export interface OutOfRangeDecisionCell {
  column: string;
  rowIndex: number;
  value: number;
  cellKey: string;
  displayId?: string;
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
  if (names.length === 1) {
    return `Scoring is waiting: confirm the scale range for ${names[0]} (it has reverse items).`;
  }
  return `Scoring is waiting: confirm the scale ranges for ${names[0]} and ${names.length - 1} more (they have reverse items).`;
}

export function waitingSubscaleTarget(
  subscales: { id: string; name: string }[],
  waitingIds: string[],
): { id: string; name: string } | null {
  const firstId = waitingIds[0];
  return firstId ? subscales.find((subscale) => subscale.id === firstId) ?? null : null;
}

export function outOfRangeDecisionMatches(
  decision: OutOfRangeDecision | undefined,
  cells: Pick<OutOfRangeDecisionCell, 'cellKey'>[],
): boolean {
  if (!decision) return false;
  const current = cells.map((cell) => cell.cellKey).sort();
  const previous = [...decision.cells].sort();
  return current.length === previous.length && current.every((cell, index) => cell === previous[index]);
}

export function outOfRangeDecisionSummary(
  decision: OutOfRangeDecision,
  cells: OutOfRangeDecisionCell[],
  widenedRange?: { min: number; max: number },
): string {
  const widenTarget = widenedRange
    ? `${widenedRange.min}-${widenedRange.max}`
    : `${Math.min(...decision.values)}-${Math.max(...decision.values)}`;
  const action = decision.action === 'widen'
    ? `Widen range to ${widenTarget}`
    : `Treat as missing for ${cells.map((cell) => `${cell.column}: ${cell.displayId ?? `row ${cell.rowIndex + 1}`}`).join(', ')}`;
  return `Decision: ${action} (Change)`;
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

export function reverseWideningExplanation(
  items: { column: string; reverse: boolean }[],
  oldMin: number,
  oldMax: number,
  newMin: number,
  newMax: number,
): string | null {
  const reverseItems = items.filter((item) => item.reverse);
  if (reverseItems.length === 0) return null;
  const changes = reverseItems.map((item) =>
    `${item.column} becomes ${newMin + newMax} minus the answer instead of ${oldMin + oldMax} minus the answer`,
  );
  return `Widening changes how reverse-scored items are calculated (${changes.join('; ')}) and changes scores for every respondent.`;
}

export function hasReverseWideningImpact(
  items: { column: string; reverse: boolean }[],
  outOfRangeCount: number,
): boolean {
  return outOfRangeCount > 0 && items.some((item) => item.reverse);
}

export function entryErrorGuidance(suggestedAction: 'missing' | 'widen'): string | null {
  return suggestedAction === 'missing'
    ? 'These values look like entry errors; Treat as missing is usually the right choice.'
    : null;
}

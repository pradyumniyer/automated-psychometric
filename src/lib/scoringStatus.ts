import type { ScoringResult } from '@/scientific/scoring';

export function getUnscoredRowSummary(result: ScoringResult, displayIds?: string[]): string | null {
  const excluded = new Set(result.excludedRowIndices);
  const unscoredIds = result.rowIds.flatMap((rowId, index) => {
    const hasScore = Object.values(result.subscaleScores).some((scores) =>
      typeof scores[index] === 'number' && Number.isFinite(scores[index]),
    );
    if (excluded.has(index) || hasScore) return [];
    const displayId = displayIds?.[index]?.trim();
    return [displayId || rowId];
  });
  if (unscoredIds.length === 0) return null;

  const preview = unscoredIds.slice(0, 5).join(', ');
  const remainder = unscoredIds.length > 5 ? ` and ${unscoredIds.length - 5} more` : '';
  return `${unscoredIds.length} rows have no score because an item is missing, N/A or outside the scale: ${preview}${remainder}`;
}

export function getUnassignedItemCount(
  itemColumns: string[],
  subscales: { items: { column: string }[] }[],
): number {
  const assigned = new Set(subscales.flatMap((subscale) => subscale.items.map((item) => item.column)));
  return itemColumns.filter((column) => !assigned.has(column)).length;
}

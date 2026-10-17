import type { ScoringResult } from '@/scientific/scoring';

export function getUnscoredRowSummary(
  result: ScoringResult,
  displayIds?: (string | undefined)[],
): string | null {
  const excluded = new Set(result.excludedRowIndices);
  const scoreColumns = [
    ...Object.values(result.subscaleScores),
    ...(result.overallScaleScore ? [result.overallScaleScore] : []),
  ];
  if (scoreColumns.length === 0) return null;

  const unscoredIds = result.rowIds.flatMap((_, index) => {
    const hasMissingScore = scoreColumns.some((scores) =>
      typeof scores[index] !== 'number' || !Number.isFinite(scores[index]),
    );
    if (excluded.has(index) || !hasMissingScore) return [];
    const displayId = displayIds?.[index]?.trim();
    return [displayId || `row ${index + 1}`];
  });
  if (unscoredIds.length === 0) return null;

  const preview = unscoredIds.slice(0, 5).join(', ');
  const remainder = unscoredIds.length > 5 ? ` and ${unscoredIds.length - 5} more` : '';
  const noun = unscoredIds.length === 1 ? 'row has' : 'rows have';
  return `${unscoredIds.length} ${noun} at least one score missing because an item is missing, N/A or outside the scale: ${preview}${remainder}`;
}

export function getUnassignedItemCount(
  itemColumns: string[],
  subscales: { items: { column: string }[] }[],
): number {
  const assigned = new Set(subscales.flatMap((subscale) => subscale.items.map((item) => item.column)));
  return itemColumns.filter((column) => !assigned.has(column)).length;
}

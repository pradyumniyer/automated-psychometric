import type { ScoringResult } from '@/scientific/scoring';

export function getOutOfBandSummary(
  result: ScoringResult,
  displayIds?: (string | undefined)[],
): string | null {
  const details: { label: string; ids: string[] }[] = [];
  for (let headerIndex = 1; headerIndex < result.headers.length; headerIndex += 1) {
    const interpretationHeader = result.headers[headerIndex];
    if (!interpretationHeader.toLowerCase().endsWith('interpretation')) continue;
    const scoreHeader = result.headers[headerIndex - 1];
    const ids = result.rows.flatMap((row, rowIndex) => {
      const score = row[scoreHeader];
      const interpretation = row[interpretationHeader];
      if (typeof score !== 'number' || !Number.isFinite(score)
        || (interpretation !== null && interpretation !== 'No band')) return [];
      return [displayIds?.[rowIndex]?.trim() || `row ${rowIndex + 1}`];
    });
    if (ids.length > 0) details.push({ label: scoreHeader.replace(/ Score$/, ''), ids });
  }
  if (details.length === 0) return null;

  const count = details.reduce((total, detail) => total + detail.ids.length, 0);
  const preview = details
    .map((detail) => `${detail.label} (${detail.ids.slice(0, 5).join(', ')}${detail.ids.length > 5 ? ` and ${detail.ids.length - 5} more` : ''})`)
    .join('; ');
  return `${count} scores fall outside every band: ${preview}`;
}

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

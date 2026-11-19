/**
 * Plain-language proration preview and report.
 * Does not change scores; only explains who would be / was filled in.
 */

export type ProrationItemGap = {
  rowIndex: number;
  rowId: string;
  displayId: string;
  scaleName: string;
  missingColumns: string[];
  answeredCount: number;
  itemCount: number;
  missingPct: number;
  /** True when missing share is within the allowed threshold (would prorate). */
  withinThreshold: boolean;
};

export type ProrationExplainInput = {
  scales: { name: string; items: string[] }[];
  rows: Record<string, unknown>[];
  rowIds: string[];
  displayIds?: (string | undefined)[];
  excludedRowIndices: Set<number> | number[];
  maxMissingPercent: number;
  /** Optional: treat these cell values as not answered (in addition to blank). */
  isMissing?: (value: unknown, column: string) => boolean;
};

function defaultMissing(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (typeof value === 'number' && !Number.isFinite(value)) return true;
  return false;
}

function asExcludedSet(excluded: Set<number> | number[]): Set<number> {
  return excluded instanceof Set ? excluded : new Set(excluded);
}

/**
 * Before scoring: which respondents have gaps that proration could fill.
 */
export function buildProrationPreview(input: ProrationExplainInput): {
  candidates: ProrationItemGap[];
  tooMuchMissing: ProrationItemGap[];
  summaryLine: string;
} {
  const excluded = asExcludedSet(input.excludedRowIndices);
  const isMissing = input.isMissing ?? ((v) => defaultMissing(v));
  const candidates: ProrationItemGap[] = [];
  const tooMuchMissing: ProrationItemGap[] = [];

  for (let rowIndex = 0; rowIndex < input.rows.length; rowIndex++) {
    if (excluded.has(rowIndex)) continue;
    const row = input.rows[rowIndex];
    const rowId = input.rowIds[rowIndex] ?? `row-${rowIndex}`;
    const displayId = input.displayIds?.[rowIndex]?.trim()
      || `Row ${rowIndex + 1}`;

    for (const scale of input.scales) {
      const items = scale.items.filter(Boolean);
      if (items.length === 0) continue;
      const missingColumns = items.filter((col) => isMissing(row[col], col));
      if (missingColumns.length === 0) continue;
      const answeredCount = items.length - missingColumns.length;
      const missingPct = (missingColumns.length / items.length) * 100;
      const gap: ProrationItemGap = {
        rowIndex,
        rowId,
        displayId,
        scaleName: scale.name,
        missingColumns,
        answeredCount,
        itemCount: items.length,
        missingPct,
        withinThreshold: missingPct <= input.maxMissingPercent && answeredCount > 0,
      };
      if (gap.withinThreshold) candidates.push(gap);
      else tooMuchMissing.push(gap);
    }
  }

  const summaryLine = summarizePreview(candidates, tooMuchMissing, input.maxMissingPercent);
  return { candidates, tooMuchMissing, summaryLine };
}

function summarizePreview(
  candidates: ProrationItemGap[],
  tooMuchMissing: ProrationItemGap[],
  maxMissingPercent: number,
): string {
  if (candidates.length === 0 && tooMuchMissing.length === 0) {
    return 'No missing item cells on included rows. Proration will not change any scores.';
  }
  const parts: string[] = [];
  if (candidates.length > 0) {
    const people = new Set(candidates.map((c) => c.rowId)).size;
    parts.push(
      `${candidates.length} scale score${candidates.length === 1 ? '' : 's'} across ${people} respondent${people === 1 ? '' : 's'} ` +
      `have missing items within the ${maxMissingPercent}% limit. When you score, those empty cells are filled with that respondent’s average of their answered items on that scale, then the scale score is computed.`,
    );
  }
  if (tooMuchMissing.length > 0) {
    parts.push(
      `${tooMuchMissing.length} scale gap${tooMuchMissing.length === 1 ? '' : 's'} exceed the ${maxMissingPercent}% limit and will stay unscored for that scale.`,
    );
  }
  return parts.join(' ');
}

export type ProratedScoreHit = {
  rowIndex: number;
  rowId: string;
  displayId: string;
  scaleName: string;
};

/**
 * After scoring: list scores marked prorated by the engine.
 * scaleScores: scaleName → rowId → { prorated?: boolean }
 */
export function buildProrationReport(input: {
  scaleScores: Record<string, Record<string, { prorated?: boolean }>>;
  rowIds: string[];
  displayIds?: (string | undefined)[];
}): { hits: ProratedScoreHit[]; summaryLine: string } {
  const hits: ProratedScoreHit[] = [];
  const rowIndexById = new Map(input.rowIds.map((id, index) => [id, index]));

  for (const [scaleName, byRow] of Object.entries(input.scaleScores)) {
    for (const [rowId, detail] of Object.entries(byRow)) {
      if (!detail?.prorated) continue;
      const rowIndex = rowIndexById.get(rowId) ?? -1;
      const displayId = (rowIndex >= 0 ? input.displayIds?.[rowIndex] : undefined)?.trim()
        || (rowIndex >= 0 ? `Row ${rowIndex + 1}` : rowId);
      hits.push({ rowIndex, rowId, displayId, scaleName });
    }
  }

  hits.sort((a, b) => a.rowIndex - b.rowIndex || a.scaleName.localeCompare(b.scaleName));

  const summaryLine = hits.length === 0
    ? 'No scores used proration on this run.'
    : `${hits.length} score${hits.length === 1 ? '' : 's'} used proration (empty items filled with that person’s answered average on the scale, then scored).`;

  return { hits, summaryLine };
}

/** Short line for the readiness / status area. */
export function prorationStatusLine(
  enabled: boolean,
  maxMissingPercent: number,
  candidateCount: number,
  proratedAfterScore: number | null,
): string {
  if (!enabled) return 'Proration is off. Missing items stay blank and can leave a scale unscored.';
  if (proratedAfterScore != null) {
    return proratedAfterScore > 0
      ? `${proratedAfterScore} score${proratedAfterScore === 1 ? '' : 's'} were prorated (≤${maxMissingPercent}% missing).`
      : `Proration was on (≤${maxMissingPercent}%); nothing needed it.`;
  }
  if (candidateCount === 0) return `Proration on (≤${maxMissingPercent}% missing). Nothing currently eligible.`;
  return `Proration on: ${candidateCount} score${candidateCount === 1 ? '' : 's'} eligible to fill missing items before scoring.`;
}

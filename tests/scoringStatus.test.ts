import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import type { ScoringResult } from '../src/scientific/scoring';
import { scoreDataset } from '../src/scientific/scoring';
import { getUnassignedItemCount, getUnscoredRowSummary } from '../src/lib/scoringStatus';

function scoringResult(
  rowIds: string[],
  scores: Record<string, (number | null)[]>,
  excludedRowIndices: number[] = [],
  overallScaleScore?: (number | null)[],
): ScoringResult {
  return {
    headers: [],
    rows: [],
    subscaleScores: scores,
    overallScaleScore,
    scaleScores: {},
    interpretationLabels: {},
    rowIds,
    normalizedMatrix: { values: [], states: [] },
    excludedRowIndices,
    configSnapshot: { subscales: [], bands: {} },
  };
}

describe('scoring status', () => {
  it('lists every included row with any missing subscale or overall score', () => {
    const result = scoringResult(
      ['P1', 'P2', 'P3', 'P4'],
      { Stress: [null, 2, 3, 4], Coping: [1, null, 3, 4] },
      [],
      [null, 2, 6, null],
    );

    expect(getUnscoredRowSummary(result, ['P1', 'P2', 'P3', 'P4'])).toBe(
      '3 rows have at least one score missing because an item is missing, N/A or outside the scale: P1, P2, P4',
    );
  });

  it('uses singular wording and lists at most five IDs with the remaining count', () => {
    const single = scoringResult(['P25', 'P26'], { Stress: [null, 2] });
    expect(getUnscoredRowSummary(single, ['P25', 'P26'])).toBe(
      '1 row has at least one score missing because an item is missing, N/A or outside the scale: P25',
    );

    const multiple = scoringResult(
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'],
      { Stress: [null, null, 1, null, null, null, null, null] },
      [7],
    );
    expect(getUnscoredRowSummary(multiple)).toBe(
      '6 rows have at least one score missing because an item is missing, N/A or outside the scale: row 1, row 2, row 4, row 5, row 6 and 1 more',
    );
  });

  it('returns no status line when every included row has a score', () => {
    expect(getUnscoredRowSummary(scoringResult(['P1', 'P2'], { Stress: [1, null] }, [1]))).toBeNull();
  });

  it('uses grid row numbers instead of internal IDs when no respondent ID is available', () => {
    const result = scoringResult(['internal-row-1', 'internal-row-2'], { Stress: [null, 2] });

    expect(getUnscoredRowSummary(result)).toBe(
      '1 row has at least one score missing because an item is missing, N/A or outside the scale: row 1',
    );
  });

  it('scores the real Fixture A data and reports exactly its four affected respondents', () => {
    const csv = readFileSync(new URL('../docs/fixtures/fixture_A.csv', import.meta.url), 'utf8');
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
    const rows = parsed.data;
    const headers = parsed.meta.fields;
    if (!headers) throw new Error('Fixture A has no header row.');

    const result = scoreDataset(
      rows,
      headers,
      [
        {
          id: 'stress',
          name: 'Stress',
          items: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'].map((column, order) => ({ column, order, reverse: false })),
          scoringMethod: 'sum',
          responseScale: { scaleType: 'numeric', minValue: 1, maxValue: 5 },
        },
        {
          id: 'coping',
          name: 'Coping',
          items: ['Q6', 'Q7', 'Q8', 'Q9', 'Q10'].map((column, order) => ({ column, order, reverse: false })),
          scoringMethod: 'sum',
          responseScale: { scaleType: 'numeric', minValue: 1, maxValue: 5 },
        },
      ],
      {},
      [],
      {
        rowIds: rows.map((row) => row.ID),
        overall: { enabled: true, source: 'subscales', method: 'sum' },
      },
    );

    expect(getUnscoredRowSummary(result, rows.map((row) => row.ID))).toBe(
      '4 rows have at least one score missing because an item is missing, N/A or outside the scale: P25, P26, P29, P30',
    );
  });

  it('counts unassigned item columns without changing subscale definitions', () => {
    expect(getUnassignedItemCount(
      ['Q1', 'Q2', 'Q3', 'Q4'],
      [{ items: [{ column: 'Q1' }, { column: 'Q3' }] }],
    )).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import type { ScoringResult } from '../src/scientific/scoring';
import { getUnassignedItemCount, getUnscoredRowSummary } from '../src/lib/scoringStatus';

function scoringResult(
  rowIds: string[],
  scores: Record<string, (number | null)[]>,
  excludedRowIndices: number[] = [],
): ScoringResult {
  return {
    headers: [],
    rows: [],
    subscaleScores: scores,
    scaleScores: {},
    interpretationLabels: {},
    rowIds,
    normalizedMatrix: { values: [], states: [] },
    excludedRowIndices,
    configSnapshot: { subscales: [], bands: {} },
  };
}

describe('scoring status', () => {
  it('summarizes only included rows with no score and shows at most five IDs', () => {
    const result = scoringResult(
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'],
      { Stress: [null, null, 2, null, null, null, null, null] },
      [7],
    );

    expect(getUnscoredRowSummary(result)).toBe(
      '6 rows have no score because an item is missing, N/A or outside the scale: P1, P2, P4, P5, P6 and 1 more',
    );
  });

  it('returns no status line when every included row has a score', () => {
    expect(getUnscoredRowSummary(scoringResult(['P1', 'P2'], { Stress: [1, null] }, [1]))).toBeNull();
  });

  it('counts unassigned item columns without changing subscale definitions', () => {
    expect(getUnassignedItemCount(
      ['Q1', 'Q2', 'Q3', 'Q4'],
      [{ items: [{ column: 'Q1' }, { column: 'Q3' }] }],
    )).toBe(2);
  });
});

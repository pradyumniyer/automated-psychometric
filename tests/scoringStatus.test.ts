import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import type { ScoringResult } from '../src/scientific/scoring';
import { scoreDataset } from '../src/scientific/scoring';
import { getOutOfBandSummary, getUnassignedItemCount, getUnscoredRowSummary } from '../src/lib/scoringStatus';
import {
  getDisplayIds,
  hasDifferentScaleItem,
  entryErrorGuidance,
  reverseWideningExplanation,
  responseScaleSummaryLine,
  shouldOpenResponseScaleCard,
  waitingSubscaleStatus,
  outOfRangeDecisionMatches,
  outOfRangeDecisionSummary,
  hasReverseWideningImpact,
} from '../src/lib/responseScaleUi';

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

  it('uses detected respondent IDs and row numbers without exposing internal IDs', () => {
    expect(getDisplayIds(
      [{ ID: 'P26' }, { ID: '' }, { value: 3 }],
      [{ column_name: 'ID', detected_by: 'ID column' }],
    )).toEqual(['P26', 'row 2', 'row 3']);
  });

  it('builds the response-scale card summary line', () => {
    expect(responseScaleSummaryLine({
      name: 'Subscale 1',
      itemCount: 5,
      min: 1,
      max: 5,
      confirmed: true,
      outputs: ['Sum', 'Mean'],
    })).toBe('5 items - scale 1-5 - Confirmed - shows Sum, Mean');
  });

  it('opens only cards that need a range or mixed-scale decision', () => {
    expect(shouldOpenResponseScaleCard(true, true, false)).toBe(false);
    expect(shouldOpenResponseScaleCard(false, true, false)).toBe(true);
    expect(shouldOpenResponseScaleCard(true, false, true)).toBe(true);
  });

  it('names one or several waiting subscales', () => {
    expect(waitingSubscaleStatus(['Subscale 1'])).toBe(
      'Scoring is waiting: confirm the scale range for Subscale 1 (it has reverse items).',
    );
    expect(waitingSubscaleStatus(['Subscale 1', 'Subscale 2'])).toBe(
      'Scoring is waiting: confirm the scale ranges for Subscale 1 and 1 more (they have reverse items).',
    );
  });

  it('keeps an out-of-range decision only while the same cells remain out of range', () => {
    const decision = { action: 'missing' as const, cells: ['Q4:row-26'], values: [7] };
    expect(outOfRangeDecisionMatches(decision, [
      { column: 'Q4', rowIndex: 25, value: 7, cellKey: 'Q4:row-26', displayId: 'P26' },
    ])).toBe(true);
    expect(outOfRangeDecisionMatches(decision, [
      { column: 'Q4', rowIndex: 25, value: 7, cellKey: 'Q4:row-26', displayId: 'P26' },
      { column: 'Q5', rowIndex: 4, value: 0, cellKey: 'Q5:row-5' },
    ])).toBe(false);
    expect(outOfRangeDecisionSummary(decision, [
      { column: 'Q4', rowIndex: 25, value: 7, cellKey: 'Q4:row-26', displayId: 'P26' },
    ])).toBe('Decision: Treat as missing for Q4: P26 (Change)');
    expect(outOfRangeDecisionSummary(
      { action: 'widen', cells: ['Q4:row-26'], values: [7] },
      [{ column: 'Q4', rowIndex: 25, value: 7, cellKey: 'Q4:row-26', displayId: 'P26' }],
      { min: 1, max: 7 },
    )).toBe('Decision: Widen range to 1-7 (Change)');
  });

  it('flags only item ranges with more than ten percent outside the scale', () => {
    expect(hasDifferentScaleItem({
      Q7: [...Array(19).fill(3), 0],
      Q8: [1, 2, 3, 4, 5, 6, 7],
    }, 1, 5)).toEqual([
      { item: 'Q8', min: 1, max: 7 },
    ]);
  });

  it('explains how widening changes reverse-scored items', () => {
    expect(hasReverseWideningImpact([{ column: 'Q3', reverse: true }], 1)).toBe(true);
    expect(hasReverseWideningImpact([{ column: 'Q4', reverse: false }], 1)).toBe(false);
    expect(reverseWideningExplanation(
      [{ column: 'Q3', reverse: true }, { column: 'Q4', reverse: false }],
      1, 5, 1, 7,
    )).toBe(
      'Widening changes how reverse-scored items are calculated (Q3 becomes 8 minus the answer instead of 6 minus the answer) and changes scores for every respondent.',
    );
    expect(entryErrorGuidance('missing')).toBe(
      'These values look like entry errors; Treat as missing is usually the right choice.',
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

  it('reports scored values outside every band without treating missing scores as No band', () => {
    const result = scoringResult(['P01', 'P02', 'P03'], {
      'Subscale 1 Mean': [3.6, null, 2],
    });
    result.headers = [
      'Subscale 1 Mean',
      'Subscale 1 Mean interpretation',
    ];
    result.rows = [
      { 'Subscale 1 Mean': 3.6, 'Subscale 1 Mean interpretation': null },
      { 'Subscale 1 Mean': null, 'Subscale 1 Mean interpretation': null },
      { 'Subscale 1 Mean': 2, 'Subscale 1 Mean interpretation': 'Low' },
    ];
    expect(getOutOfBandSummary(result, result.rowIds)).toBe(
      '1 scores fall outside every band: Subscale 1 Mean (P01)',
    );
    expect(getOutOfBandSummary({
      ...result,
      rows: result.rows.map((row) => ({
        ...row,
        'Subscale 1 Mean interpretation': row['Subscale 1 Mean'] === 3.6 ? 'Moderate' : row['Subscale 1 Mean interpretation'],
      })),
    }, result.rowIds)).toBeNull();
  });
});

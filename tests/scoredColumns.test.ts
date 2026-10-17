import { describe, expect, it } from 'vitest';
import { createCsvContent, createXlsxSheetData } from '../src/lib/fileParser';
import { buildScoredColumnData, type ScoreColumnSettings } from '../src/lib/scoredColumns';
import { scoreDataset } from '../src/scientific/scoring';

const rawHeaders = ['Participant', 'Age', 'Q1', 'Q2', 'Q3'];
const rows = [
  { Participant: 'P1', Age: '34', Q1: '4', Q2: '2', Q3: '3' },
  { Participant: 'P2', Age: '41', Q1: '5', Q2: '1', Q3: '4' },
];
const subscales = [
  {
    id: 'stress',
    name: 'Stress',
    items: [{ column: 'Q1', order: 0, reverse: false }, { column: 'Q2', order: 1, reverse: false }],
    scoringMethod: 'sum' as const,
    responseScale: { scaleType: 'numeric' as const, minValue: 1, maxValue: 5 },
  },
  {
    id: 'coping',
    name: 'Coping',
    items: [{ column: 'Q3', order: 0, reverse: false }],
    scoringMethod: 'mean' as const,
    responseScale: { scaleType: 'numeric' as const, minValue: 1, maxValue: 5 },
  },
];
const result = scoreDataset(rows, rawHeaders, subscales, {}, [], {
  rowIds: ['P1', 'P2'],
  overall: { enabled: true, source: 'subscales', method: 'sum' },
});

function columns(settings: ScoreColumnSettings): string[] {
  return buildScoredColumnData({
    result,
    rawHeaders,
    rawRows: rows,
    demographicColumns: ['Participant', 'Age'],
    idColumns: ['Participant'],
    subscales,
    settings,
  }).headers;
}

describe('shared scored columns', () => {
  it('uses the same configured order for sum-only, mean-only, both, and Overall on/off', () => {
    expect(columns({ sum: true, mean: false, overall: true })).toEqual([
      'Participant', 'Age', 'Q1', 'Q2', 'Stress Sum', 'Stress Interpretation',
      'Q3', 'Coping Sum', 'Coping Interpretation', 'Overall Scale Score',
    ]);
    expect(columns({ sum: false, mean: true, overall: true })).toEqual([
      'Participant', 'Age', 'Q1', 'Q2', 'Stress Mean', 'Stress Interpretation',
      'Q3', 'Coping Mean', 'Coping Interpretation', 'Overall Scale Score',
    ]);
    expect(columns({ sum: true, mean: true, overall: true })).toEqual([
      'Participant', 'Age', 'Q1', 'Q2', 'Stress Sum', 'Stress Mean', 'Stress Interpretation',
      'Q3', 'Coping Sum', 'Coping Mean', 'Coping Interpretation', 'Overall Scale Score',
    ]);
    expect(columns({ sum: true, mean: true, overall: false })).not.toContain('Overall Scale Score');
  });

  it('preserves today’s score columns when score metric toggles are off', () => {
    expect(columns({ sum: false, mean: false, overall: true })).toEqual([
      'Participant', 'Age', 'Q1', 'Q2', 'Stress Score', 'Stress Interpretation',
      'Q3', 'Coping Score', 'Coping Interpretation', 'Overall Scale Score',
    ]);
  });

  it('keeps matching cells numeric in CSV and XLSX while preserving IDs, text, and formula protection', () => {
    const data = buildScoredColumnData({
      result,
      rawHeaders,
      rawRows: rows,
      demographicColumns: ['Participant', 'Age'],
      idColumns: ['Participant'],
      subscales,
      settings: { sum: false, mean: false, overall: true },
    });
    const csv = createCsvContent(data.headers, data.rows, { numericColumns: data.numericColumns });
    expect(csv.split('\r\n')[1]).toBe(
      'P1,34,4,2,6,,3,3,,9',
    );
    expect(createCsvContent(['Text'], [{ Text: '=1+1' }])).toBe('Text\r\n\'=1+1');

    const sheet = createXlsxSheetData(data.headers, data.rows, {
      numericColumns: data.numericColumns,
    });
    expect(sheet[1][0]).toMatchObject({ value: 'P1', type: String });
    expect(sheet[1][1]).toMatchObject({ value: 34, type: Number });
    expect(sheet[1][2]).toMatchObject({ value: 4, type: Number });
  });
});

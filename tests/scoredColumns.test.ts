import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { createCsvContent, createXlsxSheetData } from '../src/lib/fileParser';
import { buildScoredColumnData } from '../src/lib/scoredColumns';
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

function columns(): string[] {
  return buildScoredColumnData({
    result,
    rawHeaders,
    rawRows: rows,
    demographicColumns: ['Participant', 'Age'],
    idColumns: ['Participant'],
    subscales,
  }).headers;
}

describe('shared scored columns', () => {
  it('uses one method-driven score column per subscale and always includes available Overall', () => {
    expect(columns()).toEqual([
      'Participant', 'Age', 'Q1', 'Q2', 'Stress Score', 'Stress Interpretation',
      'Q3', 'Coping Score', 'Coping Interpretation', 'Overall Scale Score',
    ]);
  });

  it('keeps grid and export order aligned and matching cells numeric in CSV and XLSX', () => {
    const data = buildScoredColumnData({
      result,
      rawHeaders,
      rawRows: rows,
      demographicColumns: ['Participant', 'Age'],
      idColumns: ['Participant'],
      subscales,
    });
    const gridHeaders = data.groups.flatMap((group) => group.columns.map((column) => column.key));
    expect(gridHeaders).toEqual(data.headers);

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

  it('preserves Fixture A scores, including the P01 Overall score of 37', () => {
    const csv = readFileSync(new URL('../docs/fixtures/fixture_A.csv', import.meta.url), 'utf8');
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
    const rows = parsed.data;
    const headers = parsed.meta.fields;
    if (!headers) throw new Error('Fixture A has no header row.');

    const fixtureSubscales = [
      {
        id: 'sub1',
        name: 'Sub1',
        items: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'].map((column, order) => ({
          column,
          order,
          reverse: column === 'Q3',
        })),
        scoringMethod: 'sum' as const,
        responseScale: { scaleType: 'numeric' as const, minValue: 1, maxValue: 5 },
      },
      {
        id: 'sub2',
        name: 'Sub2',
        items: ['Q6', 'Q7', 'Q8', 'Q9', 'Q10'].map((column, order) => ({
          column,
          order,
          reverse: column === 'Q6' || column === 'Q9',
        })),
        scoringMethod: 'sum' as const,
        responseScale: { scaleType: 'numeric' as const, minValue: 1, maxValue: 5 },
      },
    ];
    const fixtureResult = scoreDataset(rows, headers, fixtureSubscales, {}, [], {
      rowIds: rows.map((row) => row.ID),
      overall: { enabled: true, source: 'subscales', method: 'sum' },
    });
    const data = buildScoredColumnData({
      result: fixtureResult,
      rawHeaders: headers,
      rawRows: rows,
      demographicColumns: ['ID', 'Age'],
      idColumns: ['ID'],
      subscales: fixtureSubscales,
    });

    expect(data.rows[0]['Overall Scale Score']).toBe(37);
    expect(data.headers).toEqual([
      'ID', 'Age', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Sub1 Score', 'Sub1 Interpretation',
      'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Sub2 Score', 'Sub2 Interpretation', 'Overall Scale Score',
    ]);
  });
});

import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { createCsvContent, createXlsxSheetData } from '../src/lib/fileParser';
import { buildScoredColumnData } from '../src/lib/scoredColumns';
import { buildSummaryExportContent } from '../src/lib/summaryStatistics';
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
  it('migrates legacy method configs to their matching score output', () => {
    expect(columns()).toEqual([
      'Participant', 'Age', 'Q1', 'Q2', 'Stress Sum',
      'Q3', 'Coping Mean', 'Overall Scale Score',
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
      'P1,34,4,2,6,3,3,9',
    );
    expect(createCsvContent(['Text'], [{ Text: '=1+1' }])).toBe('Text\r\n\'=1+1');

    const sheet = createXlsxSheetData(data.headers, data.rows, {
      numericColumns: data.numericColumns,
    });
    expect(sheet[1][0]).toMatchObject({ value: 'P1', type: String });
    expect(sheet[1][1]).toMatchObject({ value: 34, type: Number });
    expect(sheet[1][2]).toMatchObject({ value: 4, type: Number });
  });

  it('preserves Fixture A scores and orders Sum, Mean and Custom outputs in the grid and export', () => {
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
        showOutputs: ['sum', 'mean'],
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
      'ID', 'Age', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Sub1 Sum', 'Sub1 Mean',
      'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Sub2 Sum', 'Overall Scale Score',
    ]);
    expect(data.groups.flatMap((group) => group.columns.map((column) => column.key))).toEqual(data.headers);
    expect(data.rows[0]['Sub1 Sum']).toBeTypeOf('number');
    expect(data.rows[0]['Sub1 Mean']).toBeTypeOf('number');
    expect(data.rows[0]['Sub2 Sum']).toBeTypeOf('number');
    expect(data.rows[0]['Overall Scale Score']).toBe(37);
    const summary = buildSummaryExportContent(
      data.headers,
      data.groups.flatMap((group) => group.columns),
      data.rows,
      new Set(),
      new Set(['ID']),
      { sum: true, mean: true },
    );
    expect(summary?.rows[2]).toEqual(data.headers);
    expect(summary?.rows[3]).toHaveLength(data.headers.length);
  });

  it.each([
    { name: 'Sum only', method: 'sum' as const, outputs: ['sum'] as const, expected: 'Fixture Sum' },
    { name: 'Mean only', method: 'mean' as const, outputs: ['mean'] as const, expected: 'Fixture Mean' },
    { name: 'both', method: 'sum' as const, outputs: ['sum', 'mean'] as const, expected: 'Fixture Sum' },
    { name: 'Custom', method: 'custom' as const, outputs: ['custom'] as const, expected: 'Fixture Custom' },
  ])('supports Fixture A $name selection', ({ method, outputs, expected }) => {
    const fixtureCsv = readFileSync(new URL('../docs/fixtures/fixture_A.csv', import.meta.url), 'utf8');
    const fixture = Papa.parse<Record<string, string>>(fixtureCsv, { header: true, skipEmptyLines: true });
    if (fixture.errors.length > 0) throw new Error(fixture.errors[0].message);
    if (!fixture.meta.fields) throw new Error('Fixture A has no header row.');
    const subscale = {
      id: 'fixture',
      name: 'Fixture',
      items: ['Q1', 'Q2'].map((column, order) => ({ column, order, reverse: false })),
      scoringMethod: method,
      showOutputs: [...outputs],
      customFormula: 'Q1 + Q2',
      responseScale: { scaleType: 'numeric' as const, minValue: 1, maxValue: 5 },
    };
    const fixtureResult = scoreDataset(fixture.data, fixture.meta.fields, [subscale], {});
    const data = buildScoredColumnData({
      result: fixtureResult,
      rawHeaders: fixture.meta.fields,
      rawRows: fixture.data,
      demographicColumns: ['ID', 'Age'],
      idColumns: ['ID'],
      subscales: [subscale],
    });
    expect(data.headers).toContain(expected);
    expect(data.headers.filter((header) => header.startsWith('Fixture '))).toEqual(
      outputs.map((output) => `Fixture ${output === 'sum' ? 'Sum' : output === 'mean' ? 'Mean' : 'Custom'}`),
    );
  });
});

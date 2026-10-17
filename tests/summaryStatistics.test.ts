import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { buildScoredColumnData } from '../src/lib/scoredColumns';
import { scoreDataset } from '../src/scientific/scoring';
import { buildSummaryExportContent, buildSummaryStatistics } from '../src/lib/summaryStatistics';
import { createCsvExportFiles, createXlsxSheetData } from '../src/lib/fileParser';

const columns = [
  { key: 'ID', label: 'ID', group: 'ID', type: 'demo' as const },
  { key: 'Age', label: 'Age', group: 'ID', type: 'demo' as const },
  { key: 'Q1', label: 'Q1', group: 'Subscale 1', type: 'data' as const },
  { key: 'Q2', label: 'Q2', group: 'Subscale 1', type: 'data' as const },
  { key: 'Subscale 1 Score', label: 'Score', group: 'Subscale 1', type: 'score' as const },
  { key: 'Subscale 1 Interpretation', label: 'Interpretation', group: 'Subscale 1', type: 'interpretation' as const },
  { key: 'Overall Scale Score', label: 'Overall Score', group: 'Overall Scale', type: 'score' as const },
];

describe('summary statistics', () => {
  it('summarizes numeric item and score columns only, ignoring blanks and invalid cells', () => {
    const result = buildSummaryStatistics(columns, [
      {
        ID: '1',
        Age: '20',
        Q1: '4',
        Q2: 'N/A',
        'Subscale 1 Score': 6,
        'Subscale 1 Interpretation': 'High',
        'Overall Scale Score': 7,
      },
      {
        ID: '2',
        Age: '30',
        Q1: 2,
        Q2: '5',
        'Subscale 1 Score': 7,
        'Subscale 1 Interpretation': 'Low',
        'Overall Scale Score': 8,
      },
      {
        ID: '3',
        Age: '',
        Q1: '',
        Q2: '2',
        'Subscale 1 Score': null,
        'Subscale 1 Interpretation': null,
        'Overall Scale Score': null,
      },
    ], new Set([1]), new Set(['ID']));

    expect(result.includedCount).toBe(2);
    expect(result.numericColumns).toEqual(new Set([
      'Age', 'Q1', 'Q2', 'Subscale 1 Score', 'Overall Scale Score',
    ]));
    expect(result.columns).toEqual({
      Age: { sum: 20, mean: 20, nUsed: 1, nNotCounted: 1 },
      Q1: { sum: 4, mean: 4, nUsed: 1, nNotCounted: 1 },
      Q2: { sum: 2, mean: 2, nUsed: 1, nNotCounted: 1 },
      'Subscale 1 Score': { sum: 6, mean: 6, nUsed: 1, nNotCounted: 1 },
      'Overall Scale Score': { sum: 7, mean: 7, nUsed: 1, nNotCounted: 1 },
    });
  });

  it('builds Fixture A export statistics independently and excludes a respondent from counts', () => {
    const csv = readFileSync(new URL('../docs/fixtures/fixture_A.csv', import.meta.url), 'utf8');
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
    const rows = parsed.data;
    const headers = parsed.meta.fields;
    if (!headers) throw new Error('Fixture A has no header row.');
    const subscales = [
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
    const result = scoreDataset(rows, headers, subscales, {}, [], {
      rowIds: rows.map((row) => row.ID),
      overall: { enabled: true, source: 'subscales', method: 'sum' },
    });
    const data = buildScoredColumnData({
      result,
      rawHeaders: headers,
      rawRows: rows,
      demographicColumns: ['ID', 'Age'],
      idColumns: ['ID'],
      subscales,
    });
    const columns = data.groups.flatMap((group) => group.columns);
    const excludedRows = new Set([24]);
    const idColumns = new Set(['ID']);
    const statistics = buildSummaryStatistics(
      columns,
      data.rows,
      excludedRows,
      idColumns,
      result.normalizedMatrix.states,
    );
    const summary = buildSummaryExportContent(
      data.headers,
      columns,
      data.rows,
      excludedRows,
      idColumns,
      { sum: true, mean: true },
      result.normalizedMatrix.states,
    );
    if (!summary) throw new Error('Fixture A summary content was not generated.');

    expect(statistics.includedCount).toBe(29);
    expect(summary.rows[0]).toEqual(['Summary statistics (29 included respondents)']);
    expect(summary.rows[1]).toEqual([]);
    expect(summary.rows[2]).toEqual(data.headers);

    const sumRow = summary.rows.find((row) => row[0] === 'Sum');
    const meanRow = summary.rows.find((row) => row[0] === 'Mean');
    const usedRow = summary.rows.find((row) => row[0] === 'N used');
    const notCountedRow = summary.rows.find((row) => row[0] === 'N not counted');
    if (!sumRow || !meanRow || !usedRow || !notCountedRow) throw new Error('Summary statistic rows are missing.');
    expect(data.headers).not.toContain('Sub1 Interpretation');
    expect(data.headers).not.toContain('Sub2 Interpretation');
    expect([...statistics.numericColumns]).toEqual(expect.arrayContaining(['Sub1 Sum', 'Sub2 Sum']));
    expect(sumRow[data.headers.indexOf('Sub1 Sum')]).not.toBe('');
    expect(meanRow[data.headers.indexOf('Sub2 Sum')]).not.toBe('');

    for (const header of statistics.numericColumns) {
      const values = data.rows
        .map((row, rowIndex) => {
          if (excludedRows.has(rowIndex)) return null;
          const itemState = result.normalizedMatrix.states[rowIndex][header];
          if (itemState && itemState !== 'valid') return null;
          const value = row[header];
          if (typeof value === 'number') return Number.isFinite(value) ? value : null;
          if (typeof value !== 'string' || value.trim() === '') return null;
          const parsedValue = Number(value);
          return Number.isFinite(parsedValue) ? parsedValue : null;
        })
        .filter((value): value is number => value !== null);
      const index = data.headers.indexOf(header);
      const expectedSum = values.reduce((total, value) => total + value, 0);
      const expectedMean = expectedSum / values.length;

      expect(sumRow[index]).toBe(expectedSum);
      expect(meanRow[index]).toBe(expectedMean);
      expect(typeof sumRow[index]).toBe('number');
      expect(usedRow[index]).toBe(values.length);
      expect(notCountedRow[index]).toBe(statistics.includedCount - values.length);
      expect((usedRow[index] as number) + (notCountedRow[index] as number)).toBe(29);
    }

    const q5Index = data.headers.indexOf('Q5');
    expect(notCountedRow[q5Index]).toBe(0);
    const notesStart = summary.rows.findIndex((row) => row[0] === 'Notes');
    const notes = summary.rows.slice(notesStart + 1).flat().filter((value): value is string => typeof value === 'string');
    expect(notes[0]).toContain('Statistics use included respondents only');
    expect(notes[1]).toContain('N/A, Prefer not to say, other text, or values outside the scale');
    expect(notes.find((note) => note.startsWith('Not counted in this file:'))).toContain('Q4 (1)');
    const notCountedNote = notes.find((note) => note.startsWith('Not counted in this file:'));
    expect(notCountedNote).toContain('Overall Scale Score (3)');
    expect(notCountedNote).toContain('Q4 (1) [out_of_range: 1]');
    expect(notCountedNote).toContain('Q1 (1) [blank: 1]');
    expect(notCountedNote).not.toContain('Q5');
    expect(notes.at(-1)).toContain('Sum and Mean ignore not-counted cells');

    const fullSummary = buildSummaryExportContent(
      data.headers,
      columns,
      data.rows,
      new Set(),
      idColumns,
      { sum: true, mean: true },
      result.normalizedMatrix.states,
    );
    if (!fullSummary) throw new Error('Fixture A full-data summary was not generated.');
    const files = createCsvExportFiles(data.headers, data.rows, 'fixture_scored.csv', {
      numericColumns: data.numericColumns,
      summary: fullSummary,
    });
    expect(files[0].content.split(/\r?\n/)).toHaveLength(rows.length + 1);
    expect(files[0].content.split(/\r?\n/)[0]).toBe(data.headers.join(','));
    expect(files[1].fileName).toBe('fixture_scored_summary.csv');

    const dataSheet = createXlsxSheetData(data.headers, data.rows, {
      numericColumns: data.numericColumns,
    });
    expect(dataSheet).toHaveLength(rows.length + 1);
    expect(dataSheet[0].map((cell) => typeof cell === 'object' && cell ? cell.value : cell)).toEqual(data.headers);
  });

  it('omits export summary content when both summary toggles are off', () => {
    const headers = ['ID', 'Q1'];
    const candidateColumns = [columns[0], columns[2]];
    const rows = [{ ID: 'P1', Q1: 2 }];
    const excludedRows = new Set<number>();
    const idColumns = new Set(['ID']);
    expect(buildSummaryExportContent(
      headers, candidateColumns, rows, excludedRows, idColumns, { sum: false, mean: false },
    )).toBeNull();
    const sumOnly = buildSummaryExportContent(
      headers, candidateColumns, rows, excludedRows, idColumns, { sum: true, mean: false },
    );
    if (!sumOnly) throw new Error('Sum-only summary content was not generated.');
    expect(sumOnly.rows.some((row) => row[0] === 'Sum')).toBe(true);
    expect(sumOnly.rows.some((row) => row[0] === 'Mean')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { buildMethodsReport, reportFilename } from '../src/lib/reportFromProvenance';

describe('reportFromProvenance', () => {
  it('includes scales, reverse, proration, and exclusions', () => {
    const text = buildMethodsReport({
      projectName: 'Demo',
      sheetName: 'Anxiety',
      sourceFileName: 'fixture-a.xlsx',
      rowCount: 30,
      excludedCount: 2,
      demographics: ['ID', 'Age'],
      scales: [
        {
          name: 'Anxiety',
          itemColumns: ['Q1', 'Q2', 'Q3'],
          reversedColumns: ['Q2'],
          scoreType: 'sum',
        },
      ],
      prorationEnabled: true,
      prorationMaxMissingPct: 20,
      scored: true,
      scoredRowCount: 28,
      proratedScoreCount: 3,
      scoreColumnNames: ['Anxiety_sum'],
      generatedAt: new Date('2026-01-15T12:00:00Z'),
    });
    expect(text).toContain('Demo');
    expect(text).toContain('Anxiety');
    expect(text).toContain('Reverse-scored: Q2');
    expect(text).toContain('Proration was **enabled**');
    expect(text).toContain('2 excluded');
    expect(text).toContain('Prorated scale scores: 3');
    expect(text).toContain('2026-01-15');
  });

  it('states when scoring was not run', () => {
    const text = buildMethodsReport({
      projectName: 'P',
      sheetName: 'S',
      rowCount: 10,
      excludedCount: 0,
      demographics: [],
      scales: [],
      prorationEnabled: false,
      scored: false,
    });
    expect(text).toContain('has not been run');
    expect(text).toContain('Proration was **off**');
  });

  it('builds a safe filename', () => {
    expect(reportFilename('My Project!', 'Scale 1')).toMatch(/My_Project/);
  });
});

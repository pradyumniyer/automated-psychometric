import { describe, expect, it } from 'vitest';
import {
  buildProrationPreview,
  buildProrationReport,
  prorationStatusLine,
} from '../src/lib/prorationExplain';

describe('prorationExplain', () => {
  const scales = [{ name: 'Anxiety', items: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'] }];
  const rows = [
    { Q1: 2, Q2: 2, Q3: 2, Q4: 2, Q5: 2 },
    { Q1: 1, Q2: '', Q3: 2, Q4: 2, Q5: 2 }, // 20% missing → eligible at 20%
    { Q1: '', Q2: '', Q3: '', Q4: 1, Q5: 1 }, // 60% missing → not eligible at 20%
  ];
  const rowIds = ['r0', 'r1', 'r2'];

  it('lists eligible and over-threshold gaps in plain language', () => {
    const preview = buildProrationPreview({
      scales,
      rows,
      rowIds,
      displayIds: ['P1', 'P2', 'P3'],
      excludedRowIndices: new Set(),
      maxMissingPercent: 20,
    });
    expect(preview.candidates).toHaveLength(1);
    expect(preview.candidates[0].displayId).toBe('P2');
    expect(preview.candidates[0].missingColumns).toEqual(['Q2']);
    expect(preview.tooMuchMissing).toHaveLength(1);
    expect(preview.tooMuchMissing[0].displayId).toBe('P3');
    expect(preview.summaryLine).toContain('average');
    expect(preview.summaryLine).toContain('20%');
  });

  it('ignores excluded rows', () => {
    const preview = buildProrationPreview({
      scales,
      rows,
      rowIds,
      excludedRowIndices: [1, 2],
      maxMissingPercent: 50,
    });
    expect(preview.candidates).toHaveLength(0);
    expect(preview.tooMuchMissing).toHaveLength(0);
  });

  it('reports prorated scores after scoring', () => {
    const report = buildProrationReport({
      scaleScores: {
        Anxiety: {
          r0: { prorated: false },
          r1: { prorated: true },
        },
      },
      rowIds,
      displayIds: ['P1', 'P2', 'P3'],
    });
    expect(report.hits).toEqual([
      { rowIndex: 1, rowId: 'r1', displayId: 'P2', scaleName: 'Anxiety' },
    ]);
    expect(report.summaryLine).toContain('proration');
  });

  it('status line covers off / before / after', () => {
    expect(prorationStatusLine(false, 20, 0, null)).toContain('off');
    expect(prorationStatusLine(true, 25, 3, null)).toContain('3');
    expect(prorationStatusLine(true, 20, 0, 2)).toContain('were prorated');
  });
});

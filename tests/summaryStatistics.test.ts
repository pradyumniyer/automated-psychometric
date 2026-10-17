import { describe, expect, it } from 'vitest';
import { buildSummaryStatistics } from '../src/lib/summaryStatistics';

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
});

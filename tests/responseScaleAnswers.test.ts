import { describe, expect, it } from 'vitest';
import {
  buildAnswerTable,
  countReviewAnswers,
  detectResponseMode,
  resetConfirmationAfterScaleChange,
  type AnswerTableInput,
} from '../src/lib/responseScaleAnswers';

const base: AnswerTableInput = {
  rows: [
    { Q1: 1, Q2: 5 },
    { Q1: 2, Q2: 4 },
    { Q1: 'N/A', Q2: 'Prefer not to say' },
    { Q1: 7, Q2: 'abc' },
  ],
  columns: ['Q1', 'Q2'],
  min: 1,
  max: 5,
  labels: [],
};

describe('response-scale answer table logic', () => {
  it('uses one table for special answers, out-of-range numbers, and unknown text', () => {
    const result = buildAnswerTable(base);
    expect(result.rows.map((row) => row.answer)).toEqual([
      'N/A', 'Prefer not to say', '7 (outside 1 to 5)', 'abc',
    ]);
    expect(result.rows.find((row) => row.answer === 'N/A')).toMatchObject({ kind: 'special', countsAs: null, review: false });
    expect(result.rows.find((row) => row.answer === '7 (outside 1 to 5)')).toMatchObject({ kind: 'out_of_range', review: true });
    expect(result.rows.find((row) => row.answer === 'abc')).toMatchObject({ kind: 'unknown', review: true });
  });

  it('uses word mode at exactly half text answers and numeric mode below half', () => {
    expect(detectResponseMode(['Agree', 'Disagree', 1, 2])).toBe('word');
    expect(detectResponseMode(['Agree', 1, 2, 3])).toBe('numeric');
  });

  it('shows unused preset words at zero and does not show word controls in numeric mode', () => {
    const result = buildAnswerTable({
      rows: [{ Q1: 'Agree' }, { Q1: 'Strongly agree' }],
      columns: ['Q1'], min: 1, max: 5, labels: [],
      preset: {
        name: '5-point agreement',
        labels: [
          { label: 'Strongly disagree', value: 1 }, { label: 'Disagree', value: 2 },
          { label: 'Neither agree nor disagree', value: 3 }, { label: 'Agree', value: 4 },
          { label: 'Strongly agree', value: 5 },
        ],
      },
    });
    expect(result.mode).toBe('word');
    expect(result.rows.find((row) => row.answer === 'Strongly disagree')).toMatchObject({ found: 0, countsAs: 1, grey: true });
    expect(result.rows.find((row) => row.answer === 'Agree')).toMatchObject({ found: 1, countsAs: 4 });
  });

  it('treats special typed values as scores without changing the range', () => {
    const result = buildAnswerTable({ ...base, labels: [{ label: 'Prefer not to say', value: 0, kind: 'special' }] });
    expect(result.rows.find((row) => row.answer === 'Prefer not to say')).toMatchObject({ countsAs: 0, reversed: false, review: false });
    expect(result.range).toEqual({ min: 1, max: 5 });
  });

  it('counts amber rows only and resets confirmation for scale changes', () => {
    const result = buildAnswerTable(base);
    expect(countReviewAnswers(result.rows)).toBe(2);
    expect(resetConfirmationAfterScaleChange({ confirmed: true, hasReverseItems: true })).toBe(false);
    expect(resetConfirmationAfterScaleChange({ confirmed: true, hasReverseItems: false })).toBe(true);
  });

  it('keeps a widened out-of-range row visible with its saved choice', () => {
    const result = buildAnswerTable({ ...base, min: 1, max: 7, baseMin: 1, baseMax: 5,
      outOfRangeDecisions: { '7': { action: 'widen', reviewed: true } } });
    expect(result.rows.find((row) => row.kind === 'out_of_range')).toMatchObject({ answer: '7 (outside 1 to 5)', review: false });
  });

  it('exposes a single unreviewed choice state and the saved decision for widened rows', () => {
    const fresh = buildAnswerTable(base).rows.find((row) => row.kind === 'out_of_range');
    expect(fresh).toMatchObject({ decision: '', review: true });
    const widened = buildAnswerTable({ ...base, min: 1, max: 7, baseMin: 1, baseMax: 5,
      outOfRangeDecisions: { '7': { action: 'widen', reviewed: true } } }).rows.find((row) => row.kind === 'out_of_range');
    expect(widened).toMatchObject({ decision: 'widen', review: false });
  });

  it('restores the base range and clears review after choosing Not scored', () => {
    const restored = buildAnswerTable({ ...base, min: 1, max: 5, baseMin: 1, baseMax: 5,
      outOfRangeDecisions: { '7': { action: 'missing', reviewed: true } } });
    expect(restored.rows.find((row) => row.kind === 'out_of_range')).toMatchObject({
      answer: '7 (outside 1 to 5)', review: false, decision: 'missing',
    });
  });
});

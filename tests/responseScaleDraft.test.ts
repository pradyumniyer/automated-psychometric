import { describe, expect, it } from 'vitest';
import { commitScaleRangeDraft, escapeScaleRangeDraft, type CommittedRange } from '../src/lib/responseScaleDraft';

const committed: CommittedRange = { min: 1, max: 5 };

describe('response-scale range drafts', () => {
  it.each([
    ['empty minimum', '', '5'],
    ['dash minimum', '-', '5'],
    ['non-number maximum', '1', 'abc'],
    ['minimum is not less than maximum', '5', '5'],
    ['minimum is greater than maximum', '6', '5'],
  ])('reverts %s without changing the committed range', (_name, min, max) => {
    expect(commitScaleRangeDraft(min, max, committed)).toEqual({ range: committed, changed: false });
  });

  it('commits valid whole-number drafts from blur or Enter', () => {
    expect(commitScaleRangeDraft('2', '7', committed)).toEqual({ range: { min: 2, max: 7 }, changed: true });
  });

  it('Escape restores both boxes to the last committed values', () => {
    expect(escapeScaleRangeDraft({ min: '2', max: '' }, committed)).toEqual({ min: '1', max: '5' });
  });

  it('does not treat the same range as a change', () => {
    expect(commitScaleRangeDraft('1', '5', committed)).toEqual({ range: committed, changed: false });
  });
});

import { describe, expect, it } from 'vitest';
import { validateBands } from '../src/scientific/bandValidation';

describe('interpretation band validation', () => {
  it('skips maximum-range warnings when a custom formula has no known range', () => {
    expect(validateBands([
      { name: 'High', minScore: 50, maxScore: 100 },
    ], null)).toEqual([]);
  });
});

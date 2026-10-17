import { describe, expect, it } from 'vitest';
import { primaryScoreColumnKeys } from '../src/lib/scoreOutputs';

describe('primary score column selection', () => {
  it.each([
    {
      outputs: ['mean'] as const,
      legacyMethod: 'mean' as const,
      expected: { output: 'mean', scoreKey: 'Stress Mean', interpretationKey: 'Stress Interpretation' },
    },
    {
      outputs: ['sum', 'mean'] as const,
      legacyMethod: 'sum' as const,
      expected: { output: 'sum', scoreKey: 'Stress Sum', interpretationKey: 'Stress Sum interpretation' },
    },
    {
      outputs: ['custom'] as const,
      legacyMethod: 'custom' as const,
      expected: { output: 'custom', scoreKey: 'Stress Custom', interpretationKey: 'Stress Interpretation' },
    },
  ])('selects the first shown output and its interpretation', ({ outputs, legacyMethod, expected }) => {
    expect(primaryScoreColumnKeys('Stress', outputs, legacyMethod)).toEqual(expected);
  });
});

import { describe, expect, it } from 'vitest';
import { COMMON_LIKERT_SCALES } from '../src/scientific/detection';
import { chooseResponsePreset, togglePresetStartAtZero } from '../src/lib/responseScaleState';
import type { ScaleRangeState } from '../src/lib/responseScaleState';

const base: ScaleRangeState = {
  minValue: 1,
  maxValue: 5,
  baseMin: 1,
  baseMax: 5,
  rangeSource: 'detected',
  labelSource: 'detected',
  labelMap: [
    { label: 'Not at all', value: null, kind: 'scale' },
    { label: 'Several days', value: null, kind: 'scale' },
    { label: 'More than half the days', value: null, kind: 'scale' },
    { label: 'Nearly every day', value: null, kind: 'scale' },
  ],
  flipped: false,
  startsAtZero: false,
};

describe('P6 preset library', () => {
  const required = [
    'PHQ-9 / GAD-7 (0-3)',
    'Perceived Stress Scale (0-4)',
    'BSI-style (0-4)',
    'PANAS (1-5)',
    'General Self-Efficacy (1-4)',
  ];

  it('includes all clinical presets from F18', () => {
    for (const name of required) {
      expect(COMMON_LIKERT_SCALES.some((p) => p.name === name)).toBe(true);
    }
  });

  it('PHQ-9/GAD-7 maps labels to 0-3 and sets native zero', () => {
    const next = chooseResponsePreset(base, 'PHQ-9 / GAD-7 (0-3)');
    expect(next.minValue).toBe(0);
    expect(next.maxValue).toBe(3);
    expect(next.startsAtZero).toBe(true);
    const byLabel = Object.fromEntries((next.labelMap ?? []).map((e) => [e.label, e.value]));
    expect(byLabel['Not at all']).toBe(0);
    expect(byLabel['Nearly every day']).toBe(3);
  });

  it('native-zero presets ignore Start at 0 toggle', () => {
    const next = chooseResponsePreset(base, 'PHQ-9 / GAD-7 (0-3)');
    const toggled = togglePresetStartAtZero(next);
    expect(toggled).toEqual(next);
  });

  it('PANAS stays 1-5', () => {
    const labels = [
      { label: 'Very slightly or not at all', value: null, kind: 'scale' as const },
      { label: 'A little', value: null, kind: 'scale' as const },
      { label: 'Moderately', value: null, kind: 'scale' as const },
      { label: 'Quite a bit', value: null, kind: 'scale' as const },
      { label: 'Extremely', value: null, kind: 'scale' as const },
    ];
    const next = chooseResponsePreset({ ...base, labelMap: labels }, 'PANAS (1-5)');
    expect(next.minValue).toBe(1);
    expect(next.maxValue).toBe(5);
    expect(next.startsAtZero).toBe(false);
  });

  it('GSE is 1-4', () => {
    const labels = [
      { label: 'Not at all true', value: null, kind: 'scale' as const },
      { label: 'Hardly true', value: null, kind: 'scale' as const },
      { label: 'Moderately true', value: null, kind: 'scale' as const },
      { label: 'Exactly true', value: null, kind: 'scale' as const },
    ];
    const next = chooseResponsePreset({ ...base, labelMap: labels }, 'General Self-Efficacy (1-4)');
    expect(next.minValue).toBe(1);
    expect(next.maxValue).toBe(4);
  });
});

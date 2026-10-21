import { describe, expect, it } from 'vitest';
import {
  buildTemplateDefinition,
  matchTemplateToHeaders,
  templateSubscaleScoreSettings,
} from '../src/lib/templates';

describe('template score output settings', () => {
  it('saves and matches the automatic subscale without a separate Overall definition', () => {
    const template = buildTemplateDefinition([{
      name: 'Overall scale',
      items: [
        { column: 'Q1', order: 0, reverse: false },
        { column: 'Q2', order: 1, reverse: false },
      ],
      scoringMethod: 'sum',
      showOutputs: ['sum', 'mean'],
      customFormula: '',
      scaleType: 'numeric',
      minValue: 1,
      maxValue: 5,
      labelMap: [],
      confirmed: true,
    }], {}, {});

    expect(template.overall).toBeUndefined();
    expect(matchTemplateToHeaders('Automatic', template, ['ID', 'Q1', 'Q2']).matchedCount).toBe(2);
    expect(matchTemplateToHeaders('Automatic', template, ['ID', 'Other']).unmatchedCount).toBe(2);
  });

  it('round-trips shown outputs and cut-offs for each output', () => {
    const template = buildTemplateDefinition([{
      name: 'Stress',
      items: [{ column: 'Q1', order: 0, reverse: false }],
      scoringMethod: 'sum',
      showOutputs: ['sum', 'mean'],
      customFormula: 'Q1',
      scaleType: 'numeric',
      minValue: 1,
      maxValue: 5,
      labelMap: [],
      confirmed: true,
    }], {}, {
      Stress: {
        sum: [{ name: 'High sum', minScore: 20, maxScore: 25, color: '#ff0000' }],
        mean: [{ name: 'Low mean', minScore: 1, maxScore: 2, color: '#0000ff' }],
      },
    });

    expect(template.subscales[0].showOutputs).toEqual(['sum', 'mean']);
    expect(template.responseScales[0].confirmed).toBe(true);
    expect(template.interpretationBands.map(({ output }) => output)).toEqual(['sum', 'mean']);
    expect(templateSubscaleScoreSettings(template, 'Stress')).toEqual({
      showOutputs: ['sum', 'mean'],
      bandsByOutput: {
        sum: [{ name: 'High sum', minScore: 20, maxScore: 25, color: '#ff0000' }],
        mean: [{ name: 'Low mean', minScore: 1, maxScore: 2, color: '#0000ff' }],
      },
    });
  });

  it('round-trips a widened range decision with its original range', () => {
    const template = buildTemplateDefinition([{
      name: 'Stress',
      items: [{ column: 'Q4', order: 0, reverse: true }],
      scoringMethod: 'sum',
      customFormula: '',
      scaleType: 'numeric',
      minValue: 1,
      maxValue: 7,
      baseMin: 1,
      baseMax: 5,
      rangeSource: 'detected',
      outOfRangeDecisions: { '7': { action: 'widen', reviewed: true } },
      labelMap: [],
      confirmed: false,
    }], {}, {});

    expect(template.responseScales[0]).toMatchObject({
      minValue: 1,
      maxValue: 7,
      baseMin: 1,
      baseMax: 5,
      rangeSource: 'detected',
      outOfRangeDecisions: { '7': { action: 'widen', reviewed: true } },
      confirmed: false,
    });
  });

  it('migrates legacy template bands to its first shown output without conversion', () => {
    const settings = templateSubscaleScoreSettings({
      subscales: [{
        name: 'Legacy',
        description: '',
        scoringMethod: 'mean',
        items: [],
      }],
      responseScales: [],
      interpretationBands: [{
        subscaleName: 'Legacy',
        bands: [{ name: 'Legacy band', minScore: 4, maxScore: 8, color: '#ff0000' }],
      }],
      demographicRules: { patterns: [], contentHeuristics: [] },
    }, 'Legacy');

    expect(settings.showOutputs).toEqual(['mean']);
    expect(settings.bandsByOutput).toEqual({
      mean: [{ name: 'Legacy band', minScore: 4, maxScore: 8, color: '#ff0000' }],
    });
  });

  it('round-trips word values, flags, and an unmatched value as needs a number', () => {
    const template = buildTemplateDefinition([{
      name: 'Mood', items: [], scoringMethod: 'mean', customFormula: '', scaleType: 'categorical',
      minValue: 0, maxValue: 4, labelMap: [
        { label: 'Never', value: 0 },
        { label: 'Maybe', value: null },
      ], confirmed: true, flipped: true, startsAtZero: true,
    }], {}, {});
    expect(template.responseScales[0]).toMatchObject({
      minValue: 0, maxValue: 4, confirmed: true,
      labelMap: [{ label: 'Never', value: 0 }, { label: 'Maybe', value: null }],
      flipped: true, startsAtZero: true,
    });
  });
});

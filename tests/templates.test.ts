import { describe, expect, it } from 'vitest';
import {
  buildTemplateDefinition,
  templateSubscaleScoreSettings,
} from '../src/lib/templates';

describe('template score output settings', () => {
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
    }], {}, {
      Stress: {
        sum: [{ name: 'High sum', minScore: 20, maxScore: 25, color: '#ff0000' }],
        mean: [{ name: 'Low mean', minScore: 1, maxScore: 2, color: '#0000ff' }],
      },
    });

    expect(template.subscales[0].showOutputs).toEqual(['sum', 'mean']);
    expect(template.interpretationBands.map(({ output }) => output)).toEqual(['sum', 'mean']);
    expect(templateSubscaleScoreSettings(template, 'Stress')).toEqual({
      showOutputs: ['sum', 'mean'],
      bandsByOutput: {
        sum: [{ name: 'High sum', minScore: 20, maxScore: 25, color: '#ff0000' }],
        mean: [{ name: 'Low mean', minScore: 1, maxScore: 2, color: '#0000ff' }],
      },
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
});

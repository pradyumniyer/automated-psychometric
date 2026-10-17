import { describe, expect, it } from 'vitest';
import { fromSurveyConfigRecord, toSurveyConfigRecord } from '../src/storage/viewAdapters';

describe('screen and storage config adapters', () => {
  it('round-trips all UI-editable survey configuration', () => {
    const screenConfig = {
      datasetId: 'dataset-1',
      projectId: 'project-1',
      headers: ['Age', 'Q1'],
      demographicColumns: [{
        id: 'demo-1',
        project_id: 'project-1',
        dataset_id: 'dataset-1',
        column_name: 'Age',
        detected_by: 'header',
        confidence: 0.9,
        confirmed: true,
        created_at: '2026-10-15T00:00:00.000Z',
      }],
      subscales: [{
        id: 'sub-1',
        name: 'Stress',
        items: [{ column: 'Q1', order: 0, reverse: true }],
        scoringMethod: 'mean' as const,
        customFormula: '',
        scaleType: 'categorical' as const,
        minValue: 1,
        maxValue: 5,
        labelMap: [{ label: 'Often', value: 4 }],
        displayOrder: 2,
      }],
      bands: { Stress: [{ name: 'High', minScore: 4, maxScore: 5, color: '#ff0000' }] },
      overallScale: null,
      linkedTemplateId: 'template-1',
    };
    const stored = toSurveyConfigRecord(screenConfig);

    expect(stored.item_columns).toEqual(['Q1']);
    expect(stored.demographic_columns).toEqual(screenConfig.demographicColumns);
    expect(stored.subscales[0]).toMatchObject({
      id: 'sub-1',
      name: 'Stress',
      items: screenConfig.subscales[0].items,
      scoring_method: 'mean',
      custom_formula: null,
      display_order: 2,
      response_scale: {
        scale_type: 'categorical',
        min_value: 1,
        max_value: 5,
        label_map: [{ label: 'Often', value: 4 }],
      },
      bands: [{ name: 'High', min_score: 4, max_score: 5, color: '#ff0000' }],
    });
    expect(fromSurveyConfigRecord(stored).subscales[0]).toMatchObject({
      id: 'sub-1',
      scoringMethod: 'mean',
      scaleType: 'categorical',
      minValue: 1,
      maxValue: 5,
      labelMap: [{ label: 'Often', value: 4 }],
    });
    expect(fromSurveyConfigRecord(stored).bands).toEqual(screenConfig.bands);
  });

  it('migrates a legacy method and its bands to the matching shown output', () => {
    const stored = toSurveyConfigRecord({
      datasetId: 'dataset-legacy',
      projectId: 'project-1',
      headers: ['Q1'],
      demographicColumns: [],
      subscales: [{
        id: 'sub-legacy',
        name: 'Legacy scale',
        items: [{ column: 'Q1', order: 0, reverse: false }],
        scoringMethod: 'mean',
        customFormula: '',
        scaleType: 'numeric',
        minValue: 1,
        maxValue: 5,
        labelMap: [],
        displayOrder: 0,
      }],
      bands: {
        'Legacy scale': [{ name: 'High', minScore: 4, maxScore: 5, color: '#ff0000' }],
      },
      overallScale: null,
    });

    expect(stored.subscales[0].score_outputs).toEqual(['mean']);
    expect(stored.subscales[0].bands?.map((band) => band.score_output)).toEqual(['mean']);
    const restored = fromSurveyConfigRecord(stored);
    expect(restored.subscales[0].showOutputs).toEqual(['mean']);
    expect(restored.bandsByOutput).toEqual({
      'Legacy scale': {
        mean: [{ name: 'High', minScore: 4, maxScore: 5, color: '#ff0000' }],
      },
    });
  });

  it('round-trips output-specific bands without changing their cut-offs', () => {
    const input = {
      datasetId: 'dataset-output-bands',
      projectId: 'project-1',
      headers: ['Q1'],
      demographicColumns: [],
      subscales: [{
        id: 'sub-output-bands',
        name: 'Output scale',
        items: [{ column: 'Q1', order: 0, reverse: false }],
        scoringMethod: 'sum' as const,
        showOutputs: ['sum', 'mean'] as const,
        customFormula: '',
        scaleType: 'numeric' as const,
        minValue: 1,
        maxValue: 5,
        labelMap: [],
        displayOrder: 0,
      }],
      bands: {},
      bandsByOutput: {
        'Output scale': {
          sum: [{ name: 'High sum', minScore: 20, maxScore: 25, color: '#ff0000' }],
          mean: [{ name: 'Low mean', minScore: 1, maxScore: 2, color: '#0000ff' }],
        },
      },
      overallScale: null,
    };
    const stored = toSurveyConfigRecord(input);
    const restored = fromSurveyConfigRecord(stored);

    expect(restored.bandsByOutput).toEqual(input.bandsByOutput);
    expect(stored.subscales[0].bands?.map((band) => [band.score_output, band.min_score, band.max_score])).toEqual([
      ['sum', 20, 25],
      ['mean', 1, 2],
    ]);
  });

  it('round-trips explicit Overall settings and Overall bands', () => {
    const stored = toSurveyConfigRecord({
      datasetId: 'dataset-overall',
      projectId: 'project-1',
      headers: ['Q1'],
      demographicColumns: [],
      subscales: [{
        id: 'sub-overall',
        name: 'Scale',
        items: [{ column: 'Q1', order: 0, reverse: false }],
        scoringMethod: 'sum' as const,
        customFormula: '',
        scaleType: 'numeric' as const,
        minValue: 1,
        maxValue: 5,
        labelMap: [],
        displayOrder: 0,
      }],
      bands: {
        'Overall Scale': [{ name: 'High', minScore: 5, maxScore: 10, color: '#ff0000' }],
      },
      overallScale: {
        id: 'overall',
        name: 'Overall Scale',
        items: [],
        scoringMethod: 'sum',
        customFormula: '',
        scaleType: 'numeric',
        minValue: 1,
        maxValue: 5,
        labelMap: [],
        displayOrder: 0,
      },
      overallSettings: {
        enabled: true,
        basedOn: 'means',
        combineBy: 'mean',
        customFormula: '',
      },
    });

    expect(stored.overall_settings).toEqual({
      enabled: true,
      based_on: 'means',
      combine_by: 'mean',
      custom_formula: null,
    });
    expect(stored.overall_scale?.bands?.[0]).toMatchObject({
      name: 'High',
      min_score: 5,
      max_score: 10,
    });
    expect(fromSurveyConfigRecord(stored).overallSettings).toEqual({
      enabled: true,
      basedOn: 'means',
      combineBy: 'mean',
      customFormula: '',
    });
  });
});

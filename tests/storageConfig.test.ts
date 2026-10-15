import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/storage/db';
import {
  datasetRepository,
  projectRepository,
  surveyConfigRepository,
  templateRepository,
} from '../src/storage/repositories';
import type { SurveyConfigRecord } from '../src/storage/schema';
import type { TemplateDefinition } from '../src/types/domain';

const definition: TemplateDefinition = {
  subscales: [{
    name: 'Stress',
    description: 'Stress scale',
    scoringMethod: 'mean',
    customFormula: null,
    items: [{ name: 'Q1', aliases: ['question one'], order: 0, reverse: true }],
  }],
  responseScales: [{
    subscaleName: 'Stress',
    scaleType: 'categorical',
    minValue: 1,
    maxValue: 5,
    labelMap: [{ label: 'Often', value: 4 }],
  }],
  interpretationBands: [{
    subscaleName: 'Stress',
    bands: [{ name: 'High', minScore: 4, maxScore: 5, color: '#ff0000' }],
  }],
  demographicRules: { patterns: ['age'], contentHeuristics: ['birth year'] },
};

function fullConfig(datasetId: string): SurveyConfigRecord {
  return {
    dataset_id: datasetId,
    id_columns: ['Participant'],
    demographic_columns: [{
      id: 'demo-1',
      project_id: 'project-1',
      dataset_id: datasetId,
      column_name: 'Age',
      detected_by: 'header-rule',
      confidence: 0.91,
      confirmed: true,
      created_at: '2026-10-15T00:00:00.000Z',
    }],
    item_columns: ['Q1'],
    response_scale: { type: 'categorical', min: 1, max: 5, label_map: [{ label: 'Often', value: 4 }] },
    subscales: [{
      id: 'sub-1',
      project_id: 'project-1',
      dataset_id: datasetId,
      name: 'Stress',
      description: 'Stress scale',
      items: [{ column: 'Q1', order: 0, reverse: true }],
      scoring_method: 'mean',
      custom_formula: null,
      display_order: 0,
      created_at: '2026-10-15T00:00:00.000Z',
      response_scale: {
        id: 'scale-1',
        project_id: 'project-1',
        dataset_id: datasetId,
        subscale_id: 'sub-1',
        scale_type: 'categorical',
        min_value: 1,
        max_value: 5,
        label_map: [{ label: 'Often', value: 4 }],
        created_at: '2026-10-15T00:00:00.000Z',
      },
      bands: [{
        id: 'band-1',
        project_id: 'project-1',
        dataset_id: datasetId,
        subscale_id: 'sub-1',
        name: 'High',
        min_score: 4,
        max_score: 5,
        color: '#ff0000',
        display_order: 0,
        created_at: '2026-10-15T00:00:00.000Z',
      }],
    }],
    overall_scale: undefined,
    bands: [{
      id: 'band-1',
      project_id: 'project-1',
      dataset_id: datasetId,
      subscale_id: 'sub-1',
      name: 'High',
      min_score: 4,
      max_score: 5,
      color: '#ff0000',
      display_order: 0,
      created_at: '2026-10-15T00:00:00.000Z',
    }],
    allowed_nonresponse: ['N/A', '-99'],
    proration_enabled: true,
    proration_max_missing_pct: 25,
    dq_thresholds: { unexpectedMissingPct: 12 },
    linked_template_id: 'template-1',
    updated_at: 1_792_003_200_000,
  };
}

describe('survey config and template repositories', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterAll(() => {
    db.close();
  });

  it('round-trips demographic, subscale, scale, band, and config fields', async () => {
    const config = fullConfig('dataset-1');

    await surveyConfigRepository.save('dataset-1', config);
    const loaded = await surveyConfigRepository.get('dataset-1');

    expect(loaded).toMatchObject({ ...config, updated_at: expect.any(Number) });
  });

  it('preserves the prior config when an atomic config save fails', async () => {
    const existing = fullConfig('dataset-1');
    const changed = { ...existing, id_columns: ['Changed'] };
    await db.survey_configs.add(existing);
    vi.spyOn(db.survey_configs, 'put').mockRejectedValueOnce(new Error('config write failed'));

    await expect(
      surveyConfigRepository.save('dataset-1', changed),
    ).rejects.toThrow('config write failed');

    expect(await db.survey_configs.get('dataset-1')).toEqual(existing);
    vi.restoreAllMocks();
  });

  it('round-trips all template fields and definition payload', async () => {
    const saved = await templateRepository.save({
      name: 'Stress scale',
      description: 'Clinical instrument',
      instrument: 'SS-1',
      kind: 'instrument',
      definition,
      version: 3,
    });
    const loaded = await templateRepository.get(saved.id);

    expect(loaded).toMatchObject({
      id: saved.id,
      name: 'Stress scale',
      description: 'Clinical instrument',
      instrument: 'SS-1',
      definition,
      version: 3,
    });
    expect(loaded?.created_at).toBe(saved.created_at);
    expect(loaded?.updated_at).toBe(saved.updated_at);
  });

  it('rolls back template application when its history event cannot be written', async () => {
    const project = await projectRepository.create({ name: 'Template study', description: '' });
    const dataset = await datasetRepository.import({
      projectId: project.id,
      fileName: 'study.csv',
      sheetName: 'Sheet1',
      headers: ['Q1'],
      rows: [{ Q1: 4 }],
      columnMeta: {},
      headerRow: 0,
      dataStartRow: 1,
    });
    const template = await templateRepository.save({
      name: 'Stress scale',
      description: '',
      instrument: 'SS-1',
      definition,
    });
    const existing = (await db.survey_configs.get(dataset.id))!;
    const changed = { ...existing, id_columns: ['Participant'] };
    vi.spyOn(db.history, 'add').mockRejectedValueOnce(new Error('history write failed'));

    await expect(
      templateRepository.applyToDataset(template.id, dataset.id, changed),
    ).rejects.toThrow('history write failed');

    expect(await db.survey_configs.get(dataset.id)).toEqual(existing);
    expect(await db.history.where('dataset_id').equals(dataset.id).count()).toBe(1);
    vi.restoreAllMocks();
  });
});

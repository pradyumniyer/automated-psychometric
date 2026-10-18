import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/storage/db';
import { migrateSurveyConfigRecord } from '../src/storage/viewAdapters';
import { buildSubscaleConfigs } from '../src/storage/scoreHashes';
import { scoreDataset } from '../src/scientific/scoring';
import { buildSummaryExportContent } from '../src/lib/summaryStatistics';
import { getUnscoredRowSummary } from '../src/lib/scoringStatus';
import { datasetRepository, surveyConfigRepository, templateRepository } from '../src/storage/repositories';
import { computeDataQuality } from '../src/scientific/dataQuality';
import { DEFAULT_ALLOWED_NON_RESPONSE, DEFAULT_THRESHOLDS } from '../src/scientific/dataQualityTypes';
import type { SurveyConfigRecord } from '../src/storage/schema';

const fixtureDirectory = new URL('../docs/fixtures/', import.meta.url);
const csv = readFileSync(new URL('fixture_A.csv', fixtureDirectory), 'utf8');
const [headerLine, ...dataLines] = csv.trim().split(/\r?\n/);
const headers = headerLine.split(',');
const rows = dataLines.map((line) =>
  Object.fromEntries(line.split(',').map((value, index) => [headers[index], value])),
);
const expected = JSON.parse(readFileSync(new URL('fixture_A_expected.json', fixtureDirectory), 'utf8')) as {
  per_row: Record<string, { scores_no_proration: Record<string, { sum: number | null }> }>;
};

function oldConfig(datasetId: string): SurveyConfigRecord {
  const subscale = (id: string, name: string, columns: string[], reversed: string[]) => ({
    id,
    project_id: 'fixture-project',
    dataset_id: datasetId,
    name,
    description: '',
    items: columns.map((column, order) => ({ column, order, reverse: reversed.includes(column) })),
    scoring_method: 'sum' as const,
    custom_formula: null,
    display_order: id === 'sub1' ? 0 : 1,
    created_at: new Date(0).toISOString(),
    response_scale: {
      id: `${id}-scale`,
      project_id: 'fixture-project',
      dataset_id: datasetId,
      subscale_id: id,
      scale_type: 'numeric' as const,
      min_value: 1,
      max_value: 5,
      label_map: [],
      created_at: new Date(0).toISOString(),
    },
  });
  return {
    dataset_id: datasetId,
    id_columns: ['ID'],
    demographic_columns: [],
    item_columns: headers.filter((header) => header !== 'ID'),
    response_scale: { type: 'numeric', min: 1, max: 5 },
    subscales: [
      subscale('sub1', 'Sub1', ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'], ['Q3']),
      subscale('sub2', 'Sub2', ['Q6', 'Q7', 'Q8', 'Q9', 'Q10'], ['Q6', 'Q9']),
    ],
    bands: [],
    allowed_nonresponse: ['N/A', 'Prefer not to say', '-99'],
    proration_enabled: false,
    proration_max_missing_pct: 20,
    dq_thresholds: {},
    linked_template_id: null,
    updated_at: 0,
  };
}

function scorePersisted(config: SurveyConfigRecord) {
  const migrated = migrateSurveyConfigRecord(config);
  return scoreDataset(rows, headers, buildSubscaleConfigs(migrated), {}, [], {
    rowIds: rows.map((row) => row.ID),
    overall: { enabled: false },
  });
}

describe('Fixture A persisted response resolution', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterAll(() => db.close());

  it('keeps P25 and P26 unscored after migrating an old stored config', async () => {
    const old = oldConfig('fixture-a');
    await db.survey_configs.put(old);
    const migrated = await (await import('../src/storage/repositories')).surveyConfigRepository.get(old.dataset_id);
    if (!migrated) throw new Error('Fixture configuration was not migrated.');
    const result = scoreDataset(rows, headers, buildSubscaleConfigs(migrated), {}, [], {
      rowIds: rows.map((row) => row.ID), overall: { enabled: true },
    });
    expect(result.scaleScores.sub1.P25.sum).toBeNull();
    expect(result.scaleScores.sub1.P25.mean).toBeNull();
    expect(result.scaleScores.sub1.P26.sum).toBeNull();
    expect(result.scaleScores.sub1.P26.mean).toBeNull();
    expect(result.normalizedMatrix.states[24]).toMatchObject({
      Q5: 'allowed',
      Q4: 'valid',
    });
    expect(result.normalizedMatrix.states[25]).toMatchObject({
      Q4: 'out_of_range',
    });
  });

  it('keeps the same resolution through template application and a second dataset tab', async () => {
    const project = await (await import('../src/storage/repositories')).projectRepository.create({
      name: 'Fixture A project',
      description: '',
    });
    const first = await datasetRepository.import({
      projectId: project.id, fileName: 'fixture-a.csv', sheetName: 'Sheet 1', headers, rows, columnMeta: {},
    });
    const second = await datasetRepository.import({
      projectId: project.id, fileName: 'fixture-a.csv', sheetName: 'Sheet 2', headers, rows, columnMeta: {},
    });
    const config = oldConfig(first.id);
    await surveyConfigRepository.save(first.id, config);
    const template = await templateRepository.save({
      name: 'Fixture A template', description: '', instrument: 'Fixture A', kind: 'instrument',
      definition: {
        subscales: [], responseScales: [], interpretationBands: [],
        demographicRules: { patterns: [], contentHeuristics: [] },
      },
    });
    await templateRepository.applyToDataset(template.id, second.id, { ...config, dataset_id: second.id });

    for (const datasetId of [first.id, second.id]) {
      const loaded = await surveyConfigRepository.get(datasetId);
      if (!loaded) throw new Error(`Missing config for ${datasetId}`);
      const result = scoreDataset(rows, headers, buildSubscaleConfigs(loaded), {}, [], {
        rowIds: rows.map((row) => row.ID), overall: { enabled: true },
      });
      expect(result.scaleScores.sub1.P25.sum).toBeNull();
      expect(result.scaleScores.sub1.P26.sum).toBeNull();
      expect(getUnscoredRowSummary(result, rows.map((row) => row.ID))).toContain('P25, P26, P29, P30');
      for (const row of rows.filter((candidate) => !['P25', 'P26', 'P29', 'P30'].includes(candidate.ID))) {
        expect(result.scaleScores.sub1[row.ID].sum).toBe(expected.per_row[row.ID].scores_no_proration.Sub1.sum);
      }
    }
  });

  it('uses the same cell kinds for scoring, Summary, and Data Quality', () => {
    const result = scorePersisted(oldConfig('fixture-a'));
    const summary = buildSummaryExportContent(
      headers,
      headers.map((key) => ({ key, type: key === 'ID' ? 'demo' as const : 'data' as const })),
      rows,
      new Set(),
      new Set(['ID']),
      { sum: true, mean: true },
      result.normalizedMatrix.states,
    );
    const summaryText = summary?.rows.flat().filter((value): value is string => typeof value === 'string').join('\n') ?? '';
    expect(summaryText).toContain('Q3 (1) [special missing: 1]');
    expect(summaryText).toContain('Q4 (1) [out of range: 1]');
    expect(summaryText).toContain('Q5 (1) [special missing: 1]');
  });

  it('matches resolved kinds cell by cell in scoring, Summary input, and Data Quality counts', () => {
    const result = scorePersisted(oldConfig('fixture-a'));
    const quality = computeDataQuality(
      rows,
      headers,
      headers.filter((header) => /^Q\d+$/.test(header)),
      [],
      1,
      5,
      DEFAULT_ALLOWED_NON_RESPONSE,
      DEFAULT_THRESHOLDS,
      { normalizedMatrix: result.normalizedMatrix, rowIds: rows.map((row) => row.ID) },
    );
    const expectedStates = {
      Q3: 'allowed',
      Q4: 'out_of_range',
      Q5: 'allowed',
    } as const;
    for (const [column, state] of Object.entries(expectedStates)) {
      const scoreStates = result.normalizedMatrix.states.map((row) => row[column]);
      expect(scoreStates.filter((candidate) => candidate === state)).toHaveLength(1);
      const item = quality.itemMissingness.find((candidate) => candidate.column === column);
      expect(item).toBeDefined();
      expect(item?.allowedNonResponseCount).toBe(state === 'allowed' ? 1 : 0);
      expect(item?.outOfRangeCount).toBe(state === 'out_of_range' ? 1 : 0);
    }
  });
});

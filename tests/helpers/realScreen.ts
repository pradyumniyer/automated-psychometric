import React from 'react';
import Papa from 'papaparse';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ConfigScreen } from '../../src/components/ConfigScreen';
import { datasetRepository, projectRepository, surveyConfigRepository } from '../../src/storage/repositories';
import { toSurveyConfigRecord } from '../../src/storage/viewAdapters';
import { detectDemographics } from '../../src/scientific/detection';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface RealScreenScale {
  id: string;
  name: string;
  columns: string[];
  reversed: string[];
  min?: number;
  max?: number;
}

export interface RealScreenData {
  headers: string[];
  rows: Record<string, string>[];
}

export interface RealScreenOptions {
  fileName?: string;
  data?: RealScreenData;
  scales?: RealScreenScale[];
  overall?: boolean;
  mutateRows?: (rows: Record<string, string>[]) => void;
  demographicColumns?: string[];
  idColumns?: string[];
}

export function parseCsv(text: string): RealScreenData {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (parsed.errors.length > 0 || !parsed.meta.fields) {
    throw new Error(`Could not parse test CSV: ${parsed.errors.map((error) => error.message).join('; ')}`);
  }
  return { headers: parsed.meta.fields, rows: parsed.data };
}

export function fixtureData(fileName = 'fixture_A.csv'): RealScreenData {
  return parseCsv(readFileSync(resolve(process.cwd(), 'docs/fixtures', fileName), 'utf8'));
}

export const screenProps = (project: Awaited<ReturnType<typeof projectRepository.create>>, datasetId: string) => ({
  project, highlightRowIndex: null, onClearHighlight: () => {}, excludedRows: new Set<number>(),
  onToggleRowExclusion: async () => {}, onSetExcludedRows: async () => {}, onGoToQuality: () => {},
  sharedDatasetId: datasetId, onDatasetChange: () => {}, showSummarySum: false, showSummaryMean: false,
  onToggleSummarySum: () => {}, onToggleSummaryMean: () => {},
});

export async function setupRealScreen(options: RealScreenOptions = {}) {
  const { headers, rows } = options.data ?? fixtureData(options.fileName);
  options.mutateRows?.(rows);
  const project = await projectRepository.create({ name: 'Screen test', description: '' });
  const detectedDemographics = detectDemographics(headers, rows);
  const demographicNames = new Set(options.demographicColumns ?? detectedDemographics.map(({ column }) => column));
  const demographicColumns = headers.filter((column) => demographicNames.has(column)).map((column_name) => ({
    column_name,
    detected_by: detectedDemographics.find((suggestion) => suggestion.column === column_name)?.rule ?? 'test',
    confidence: 1,
    confirmed: true,
  }));
  const dataset = await datasetRepository.import({
    projectId: project.id,
    fileName: 'screen-test.csv',
    sheetName: 'Sheet 1',
    headers,
    rows,
    columnMeta: {},
    demographicColumns,
  });
  const configuredScales = options.scales ?? [
    { id: 's1', name: 'Subscale 1', columns: headers.slice(2, 7), reversed: ['Q3'] },
    { id: 's2', name: 'Subscale 2', columns: headers.slice(7), reversed: ['Q6', 'Q9'] },
  ];
  const scales = configuredScales.map((scale, displayOrder) => ({
    id: scale.id,
    name: scale.name,
    items: scale.columns.map((column, order) => ({ column, order, reverse: scale.reversed.includes(column) })),
    scoringMethod: 'sum' as const,
    showOutputs: ['sum' as const],
    customFormula: '',
    scaleType: 'numeric' as const,
    minValue: scale.min ?? 1,
    maxValue: scale.max ?? 5,
    baseMin: scale.min ?? 1,
    baseMax: scale.max ?? 5,
    rangeSource: 'detected' as const,
    labelMap: [],
    confirmed: false,
    outOfRangeDecisions: {},
    displayOrder,
  }));
  await surveyConfigRepository.save(dataset.id, toSurveyConfigRecord({
    datasetId: dataset.id,
    projectId: project.id,
    headers,
    demographicColumns,
    subscales: scales,
    bands: {},
    overallSettings: { enabled: options.overall ?? false, basedOn: 'sums', combineBy: 'sum', customFormula: '' },
  }));
  return { project, dataset };
}

export async function openResponseScaleCard(project: Awaited<ReturnType<typeof projectRepository.create>>, datasetId: string, name = 'Subscale 1') {
  const view = render(React.createElement(ConfigScreen, screenProps(project, datasetId)));
  fireEvent.click(await screen.findByText('Response scales'));
  if (!screen.queryByLabelText(`${name} maximum`)) fireEvent.click(await screen.findByLabelText(`Show details for ${name}`));
  const input = await screen.findByLabelText(`${name} maximum`);
  const card = input.closest('[data-response-scale-id]') as HTMLElement;
  return { view, card, user: within(card) };
}

export const openScales = (project: Awaited<ReturnType<typeof projectRepository.create>>, datasetId: string) =>
  openResponseScaleCard(project, datasetId, 'Subscale 1');


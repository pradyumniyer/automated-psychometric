// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConfigScreen } from '../src/components/ConfigScreen';
import { db } from '../src/storage/db';
import { datasetRepository, projectRepository, surveyConfigRepository } from '../src/storage/repositories';
import { toSurveyConfigRecord } from '../src/storage/viewAdapters';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const csv = readFileSync(resolve(process.cwd(), 'docs/fixtures/fixture_A.csv'), 'utf8').trim().split(/\r?\n/);
const headers = csv[0].split(',');
const rows = csv.slice(1).map((line) => Object.fromEntries(line.split(',').map((value, index) => [headers[index], value])));
const props = (project: Awaited<ReturnType<typeof projectRepository.create>>, datasetId: string) => ({
  project, highlightRowIndex: null, onClearHighlight: () => {}, excludedRows: new Set<number>(),
  onToggleRowExclusion: async () => {}, onSetExcludedRows: async () => {}, onGoToQuality: () => {},
  sharedDatasetId: datasetId, onDatasetChange: () => {}, showSummarySum: false, showSummaryMean: false,
  onToggleSummarySum: () => {}, onToggleSummaryMean: () => {},
});

describe('response scale behavior on ConfigScreen', () => {
  beforeEach(async () => { cleanup(); await db.delete(); await db.open(); Element.prototype.scrollIntoView = () => {}; });
  afterAll(() => db.close());

  async function setup() {
    const project = await projectRepository.create({ name: 'Screen test', description: '' });
    const dataset = await datasetRepository.import({ projectId: project.id, fileName: 'fixture.csv', sheetName: 'Sheet 1', headers, rows, columnMeta: {}, demographicColumns: headers.slice(0, 2).map((column_name) => ({ column_name, detected_by: 'test', confidence: 1, confirmed: true })) });
    const makeScale = (id: string, name: string, columns: string[], reversed: string[]) => ({ id, name, items: columns.map((column, order) => ({ column, order, reverse: reversed.includes(column) })), scoringMethod: 'sum' as const, showOutputs: ['sum' as const], customFormula: '', scaleType: 'numeric' as const, minValue: 1, maxValue: 5, baseMin: 1, baseMax: 5, rangeSource: 'detected' as const, labelMap: [], confirmed: false, outOfRangeDecisions: {}, displayOrder: id === 's1' ? 0 : 1 });
    await surveyConfigRepository.save(dataset.id, toSurveyConfigRecord({ datasetId: dataset.id, projectId: project.id, headers, demographicColumns: [], subscales: [makeScale('s1', 'Subscale 1', headers.slice(2, 7), ['Q3']), makeScale('s2', 'Subscale 2', headers.slice(7), ['Q6', 'Q9'])], bands: {}, overallSettings: { enabled: false, basedOn: 'sums', combineBy: 'sum', customFormula: '' } }));
    return { project, dataset };
  }

  async function openScales(project: Awaited<ReturnType<typeof projectRepository.create>>, datasetId: string) {
    const view = render(React.createElement(ConfigScreen, props(project, datasetId)));
    fireEvent.click(await screen.findByText('Response scales'));
    const card = await screen.findByLabelText('Subscale 1 maximum').then((input) => input.closest('[data-response-scale-id]') as HTMLElement);
    return { view, card, user: within(card) };
  }

  it('keeps Widen, typed ranges and their choice through confirmation and reload', async () => {
    const { project, dataset } = await setup();
    const { view, card, user } = await openScales(project, dataset.id);
    const max = user.getByLabelText('Subscale 1 maximum');
    // Confirm, then Widen: the effect used to replace this with the detected range.
    fireEvent.click(user.getByRole('button', { name: 'Confirm range' }));
    const choice = user.getByRole('combobox');
    fireEvent.change(choice, { target: { value: 'widen' } });
    await waitFor(() => expect(max.value).toBe('7'));
    fireEvent.click(user.getByRole('button', { name: 'Confirm range' }));
    fireEvent.change(choice, { target: { value: 'missing' } });
    await waitFor(() => expect(max.value).toBe('7'));
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const restored = await openScales(project, dataset.id);
    expect((restored.user.getByLabelText('Subscale 1 maximum') as HTMLInputElement).value).toBe('7');
    expect(restored.user.queryByRole('button', { name: 'Confirm range' })).toBeTruthy();
  });
});

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
    if (!screen.queryByLabelText('Subscale 1 maximum')) {
      fireEvent.click(await screen.findByLabelText('Show details for Subscale 1'));
    }
    const card = await screen.findByLabelText('Subscale 1 maximum').then((input) => input.closest('[data-response-scale-id]') as HTMLElement);
    return { view, card, user: within(card) };
  }

  it('a: Confirm then Widen to 1-7, then reload keeps the widened range', async () => {
    const { project, dataset } = await setup();
    const { view, user } = await openScales(project, dataset.id);
    const max = user.getByLabelText('Subscale 1 maximum');
    // Confirm, then Widen: the effect used to replace this with the detected range.
    fireEvent.click(user.getByRole('button', { name: 'Confirm range' }));
    const choice = user.getByRole('combobox');
    fireEvent.change(choice, { target: { value: 'widen' } });
    await waitFor(() => expect(max.value).toBe('7'));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    view.unmount();
    const restored = await openScales(project, dataset.id);
    expect((restored.user.getByLabelText('Subscale 1 maximum') as HTMLInputElement).value).toBe('7');
    expect(restored.user.queryByRole('button', { name: 'Confirm range' })).toBeTruthy();
  });

  it('b: typing max 6 after confirmation keeps 1-6 and resets confirmation', async () => {
    const { project, dataset } = await setup();
    const { user } = await openScales(project, dataset.id);
    fireEvent.click(user.getByRole('button', { name: 'Confirm range' }));
    const max = user.getByLabelText('Subscale 1 maximum') as HTMLInputElement;
    fireEvent.change(max, { target: { value: '6' } });
    fireEvent.blur(max);
    await waitFor(() => expect(max.value).toBe('6'));
    expect(user.getByRole('button', { name: 'Confirm range' })).toBeTruthy();
  });

  it('d: Not scored restores the base range after Confirm, Widen, Confirm', async () => {
    const { project, dataset } = await setup();
    const { user, view } = await openScales(project, dataset.id);
    fireEvent.click(user.getByRole('button', { name: 'Confirm range' }));
    fireEvent.change(user.getByRole('combobox'), { target: { value: 'widen' } });
    const max = user.getByLabelText('Subscale 1 maximum') as HTMLInputElement;
    await waitFor(() => expect(max.value).toBe('7'));
    fireEvent.click(user.getByRole('button', { name: 'Confirm range' }));
    fireEvent.change(user.getByRole('combobox'), { target: { value: 'missing' } });
    await waitFor(() => expect((user.getByRole('combobox') as HTMLSelectElement).value).toBe('missing'));
    await waitFor(() => expect(max.value).toBe('5'));
    expect(user.getByRole('button', { name: 'Confirm range' })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    view.unmount();
    const restored = await openScales(project, dataset.id);
    expect((restored.user.getByLabelText('Subscale 1 maximum') as HTMLInputElement).value).toBe('5');
    expect((restored.user.getByRole('combobox') as HTMLSelectElement).value).toBe('missing');
  });

  it('c: runs twelve seeded six-action sequences on ConfigScreen and reloads each result', async () => {
    const { project, dataset } = await setup();
    const actions = ['widen', 'missing', 'confirm', 'range', 'invalid'] as const;
    const min = 1;
    let baseMax = 5;
    let max = 5;
    let confirmed = false;
    let decision: '' | 'missing' | 'widen' = '';
    let reviewed = false;
    for (let seed = 11; seed < 23; seed += 1) {
      let random = seed;
      const sequence = Array.from({ length: 6 }, () => {
        random = (random * 48271) % 2147483647;
        return actions[random % actions.length];
      });
      let viewAndCard = await openScales(project, dataset.id);
      try {
        for (const action of sequence) {
          const { user } = viewAndCard;
          if (action === 'widen' && decision !== 'widen') {
            fireEvent.change(user.getByRole('combobox'), { target: { value: 'widen' } });
            decision = 'widen'; reviewed = true; max = Math.max(baseMax, 7); confirmed = false;
          } else if (action === 'missing' && decision !== 'missing') {
            fireEvent.change(user.getByRole('combobox'), { target: { value: 'missing' } });
            if (decision === 'widen') confirmed = false;
            decision = 'missing'; reviewed = true; max = baseMax;
          } else if (action === 'confirm' && !confirmed) {
            const button = user.queryByRole('button', { name: 'Confirm range' });
            if (button) { fireEvent.click(button); confirmed = true; }
          } else if (action === 'range') {
            const nextMax = max === 6 ? 5 : 6;
            const maxInput = user.getByLabelText('Subscale 1 maximum') as HTMLInputElement;
            fireEvent.change(maxInput, { target: { value: String(nextMax) } });
            fireEvent.blur(maxInput);
            if (max !== nextMax) {
              max = nextMax; baseMax = nextMax; confirmed = false;
              if (decision === 'widen') decision = 'missing';
            }
          } else if (action === 'invalid') {
            const maxInput = user.getByLabelText('Subscale 1 maximum') as HTMLInputElement;
            fireEvent.change(maxInput, { target: { value: 'bad' } });
            fireEvent.blur(maxInput);
          }
          await waitFor(() => expect((user.getByLabelText('Subscale 1 minimum') as HTMLInputElement).value).toBe(String(min)));
          await waitFor(() => expect((user.getByLabelText('Subscale 1 maximum') as HTMLInputElement).value).toBe(String(max)));
          expect(Boolean(user.queryByRole('button', { name: 'Confirm range' }))).toBe(!confirmed);
          expect((user.getByRole('combobox') as HTMLSelectElement).value).toBe(decision);
          const outOfRangeRow = user.getByText(`7 (outside 1 to ${baseMax})`).closest('tr') as HTMLTableRowElement;
          expect(outOfRangeRow.className.includes('bg-warning-50')).toBe(!reviewed);
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
        viewAndCard.view.unmount();
        viewAndCard = await openScales(project, dataset.id);
        const { user } = viewAndCard;
        expect((user.getByLabelText('Subscale 1 maximum') as HTMLInputElement).value).toBe(String(max));
        expect((user.getByRole('combobox') as HTMLSelectElement).value).toBe(decision);
        expect(Boolean(user.queryByRole('button', { name: 'Confirm range' }))).toBe(!confirmed);
      } catch (error) {
        throw new Error(`Seed ${seed}, sequence ${sequence.join(' → ')}: ${String(error)}`);
      } finally {
        viewAndCard.view.unmount();
      }
    }
  }, 90000);
});

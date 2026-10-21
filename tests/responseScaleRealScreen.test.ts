// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConfigScreen } from '../src/components/ConfigScreen';
import { db } from '../src/storage/db';
import { datasetRepository, projectRepository, scoreRepository, surveyConfigRepository, templateRepository } from '../src/storage/repositories';
import { fromSurveyConfigRecord, toSurveyConfigRecord } from '../src/storage/viewAdapters';
import { buildTemplateDefinition } from '../src/lib/templates';
import { migrateRangeState } from '../src/lib/responseScaleState';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fixtureData(fileName = 'fixture_A.csv') {
  const lines = readFileSync(resolve(process.cwd(), 'docs/fixtures', fileName), 'utf8').trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map((line) => Object.fromEntries(line.split(',').map((value, index) => [headers[index], value])));
  return { headers, rows };
}
const props = (project: Awaited<ReturnType<typeof projectRepository.create>>, datasetId: string) => ({
  project, highlightRowIndex: null, onClearHighlight: () => {}, excludedRows: new Set<number>(),
  onToggleRowExclusion: async () => {}, onSetExcludedRows: async () => {}, onGoToQuality: () => {},
  sharedDatasetId: datasetId, onDatasetChange: () => {}, showSummarySum: false, showSummaryMean: false,
  onToggleSummarySum: () => {}, onToggleSummaryMean: () => {},
});

describe('response scale behavior on ConfigScreen', () => {
  beforeEach(async () => { cleanup(); await db.delete(); await db.open(); Element.prototype.scrollIntoView = () => {}; });
  afterAll(() => db.close());

  async function setup(options: { fileName?: string; scales?: { id: string; name: string; columns: string[]; reversed: string[]; min?: number; max?: number }[]; overall?: boolean; mutateRows?: (rows: Record<string, string>[]) => void } = {}) {
    const { headers, rows } = fixtureData(options.fileName);
    options.mutateRows?.(rows);
    const project = await projectRepository.create({ name: 'Screen test', description: '' });
    const dataset = await datasetRepository.import({ projectId: project.id, fileName: 'fixture.csv', sheetName: 'Sheet 1', headers, rows, columnMeta: {}, demographicColumns: headers.slice(0, 2).map((column_name) => ({ column_name, detected_by: 'test', confidence: 1, confirmed: true })) });
    const makeScale = (scale: NonNullable<typeof options.scales>[number], displayOrder: number) => ({ id: scale.id, name: scale.name, items: scale.columns.map((column, order) => ({ column, order, reverse: scale.reversed.includes(column) })), scoringMethod: 'sum' as const, showOutputs: ['sum' as const], customFormula: '', scaleType: 'numeric' as const, minValue: scale.min ?? 1, maxValue: scale.max ?? 5, baseMin: scale.min ?? 1, baseMax: scale.max ?? 5, rangeSource: 'detected' as const, labelMap: [], confirmed: false, outOfRangeDecisions: {}, displayOrder });
    const scales = options.scales ?? [
      { id: 's1', name: 'Subscale 1', columns: headers.slice(2, 7), reversed: ['Q3'] },
      { id: 's2', name: 'Subscale 2', columns: headers.slice(7), reversed: ['Q6', 'Q9'] },
    ];
    await surveyConfigRepository.save(dataset.id, toSurveyConfigRecord({ datasetId: dataset.id, projectId: project.id, headers, demographicColumns: headers.slice(0, 2).map((column_name, index) => ({ column_name, detected_by: index === 0 ? 'ID column' : 'Age column', confidence: 1, confirmed: true })), subscales: scales.map(makeScale), bands: {}, overallSettings: { enabled: options.overall ?? false, basedOn: 'sums', combineBy: 'sum', customFormula: '' } }));
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

  async function openNamedScale(project: Awaited<ReturnType<typeof projectRepository.create>>, datasetId: string, name: string) {
    const view = render(React.createElement(ConfigScreen, props(project, datasetId)));
    fireEvent.click(await screen.findByText('Response scales'));
    if (!screen.queryByLabelText(`${name} maximum`)) fireEvent.click(await screen.findByLabelText(`Show details for ${name}`));
    const input = await screen.findByLabelText(`${name} maximum`);
    const card = input.closest('[data-response-scale-id]') as HTMLElement;
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

  it('A: shows one actionable placeholder before review and no duplicate Not scored choice', async () => {
    const { project, dataset } = await setup();
    const { user } = await openScales(project, dataset.id);
    const select = user.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(Array.from(select.options).map((option) => [option.value, option.textContent])).toEqual([
      ['', 'Choose…'], ['missing', 'Not scored'], ['widen', 'Widen scale to 1-7'],
    ]);
    fireEvent.change(select, { target: { value: 'widen' } });
    await waitFor(() => expect(select.value).toBe('widen'));
    fireEvent.change(select, { target: { value: 'missing' } });
    await waitFor(() => expect(select.value).toBe('missing'));
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['missing', 'widen']);
  });

  it('C: omits the answer table and its header when the scale has no answer rows', async () => {
    const { project, dataset } = await setup();
    const view = render(React.createElement(ConfigScreen, props(project, dataset.id)));
    fireEvent.click(await screen.findByText('Response scales'));
    fireEvent.click(await screen.findByLabelText('Show details for Subscale 2'));
    const card = await screen.findByLabelText('Subscale 2 maximum').then((input) => input.closest('[data-response-scale-id]') as HTMLElement);
    expect(within(card).queryByRole('columnheader', { name: 'Answer' })).toBeNull();
    view.unmount();
  });

  it('D4: leaves Fixture A untouched with its amber outlier row and review count', async () => {
    const { project, dataset } = await setup({ overall: true });
    const { user, view } = await openNamedScale(project, dataset.id, 'Subscale 1');
    expect(user.getByText('7 (outside 1 to 5)')).toBeTruthy();
    expect(user.getByText(/1 answer to review/)).toBeTruthy();
    expect(screen.queryByText('Not confirmed')).toBeNull();
    expect((user.getByRole('combobox') as HTMLSelectElement).value).toBe('');
    expect(user.getByRole('combobox').className).toContain('text-sm');
    const numberBox = user.getByLabelText('7 (outside 1 to 5) score') as HTMLInputElement;
    expect(numberBox.type).toBe('text');
    expect(numberBox.className).toContain('w-32');
    expect(numberBox.className).toContain('text-sm');
    expect(user.getByRole('table').className).toContain('table-fixed');
    const tooltip = user.getByText('Confirm the range before reverse-scoring items.');
    expect(tooltip.className).toContain('max-w-64');
    expect(tooltip.className).toContain('whitespace-normal');
    expect(tooltip.className).toContain('text-left');
    const tooltipAnchor = tooltip.parentElement as HTMLElement;
    Object.defineProperty(tooltipAnchor, 'getBoundingClientRect', { value: () => ({ left: 600, width: 20, top: 10, right: 620, bottom: 30, height: 20, x: 600, y: 10, toJSON: () => ({}) }) });
    fireEvent.mouseEnter(tooltipAnchor);
    expect(tooltip.className).toContain('right-0');
    expect(Array.from((user.getByRole('combobox') as HTMLSelectElement).options)[0].textContent).toBe('Choose…');
    view.unmount();
    for (const name of ['Subscale 1', 'Subscale 2']) {
      const current = await openNamedScale(project, dataset.id, name);
      fireEvent.click(current.user.getByRole('button', { name: 'Confirm range' }));
      await new Promise((resolve) => setTimeout(resolve, 1500));
      current.view.unmount();
    }
    const scoring = render(React.createElement(ConfigScreen, props(project, dataset.id)));
    fireEvent.click(await screen.findByText('Scoring'));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Scoring' }));
    await screen.findByText(/Scoring complete/);
    expect(screen.getByText(/P25, P26, P29, P30/)).toBeTruthy();
    const result = (await scoreRepository.getLatest(dataset.id))!.payload.result as { rows: Record<string, unknown>[] };
    expect(result.rows[0]).toMatchObject({ 'Subscale 1 Sum': 18, 'Subscale 2 Sum': 19, 'Overall Scale Score': 37 });
    scoring.unmount();
  });

  it('D1: detects Fixture B subscales, scores the baseline, and persists both decisions through reloads', async () => {
    const { project, dataset } = await setup({
      fileName: 'fixture_B.csv', overall: true,
      scales: [
        { id: 's1', name: 'Subscale 1', columns: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'], reversed: ['Q2', 'Q4'], min: 1, max: 5 },
        { id: 's2', name: 'Subscale 2', columns: ['Q6', 'Q7', 'Q8', 'Q9'], reversed: ['Q8'], min: 0, max: 4 },
        { id: 's3', name: 'Subscale 3', columns: ['Q10', 'Q11', 'Q12'], reversed: [], min: 1, max: 7 },
      ],
    });
    const s3view = await openNamedScale(project, dataset.id, 'Subscale 3');
    expect((s3view.user.getByLabelText('Subscale 3 minimum') as HTMLInputElement).value).toBe('1');
    expect((s3view.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe('7');
    expect(s3view.user.getByText('8 (outside 1 to 7)')).toBeTruthy();
    expect(s3view.user.getByText(/1 answer to review/)).toBeTruthy();
    const select = s3view.user.getByRole('combobox') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['Choose…', 'Not scored', 'Widen scale to 1-8']);
    expect(s3view.user.queryByRole('button', { name: 'Confirm range' })).toBeNull();
    s3view.view.unmount();

    for (const name of ['Subscale 1', 'Subscale 2']) {
      const current = await openNamedScale(project, dataset.id, name);
      expect(current.user.getByRole('button', { name: 'Confirm range' })).toBeTruthy();
      fireEvent.click(current.user.getByRole('button', { name: 'Confirm range' }));
      expect(current.user.getByText('Confirmed')).toBeTruthy();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      current.view.unmount();
    }
    const scoreView = render(React.createElement(ConfigScreen, props(project, dataset.id)));
    fireEvent.click(await screen.findByText('Scoring'));
    const runButton = await screen.findByRole('button', { name: 'Run Scoring' });
    expect((runButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(runButton);
    await screen.findByText(/Scoring complete/);
    await waitFor(() => expect(screen.getByText(/R04, R07, R09/)).toBeTruthy());
    let result = (await scoreRepository.getLatest(dataset.id))!.payload.result as { rows: Record<string, unknown>[] };
    expect(result.rows[0]).toMatchObject({ 'Subscale 1 Sum': 17, 'Subscale 2 Sum': 4, 'Subscale 3 Sum': 18, 'Overall Scale Score': 39 });
    expect(result.rows[1]).toMatchObject({ 'Subscale 1 Sum': 19, 'Subscale 2 Sum': 8, 'Subscale 3 Sum': 17, 'Overall Scale Score': 44 });
    expect(result.rows[8]).toMatchObject({ 'Subscale 3 Sum': null, 'Overall Scale Score': null });
    scoreView.unmount();

    let current = await openNamedScale(project, dataset.id, 'Subscale 3');
    fireEvent.change(current.user.getByRole('combobox'), { target: { value: 'widen' } });
    await waitFor(() => expect((current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe('8'));
    await new Promise((resolve) => setTimeout(resolve, 1500)); current.view.unmount();
    current = await openNamedScale(project, dataset.id, 'Subscale 3');
    expect((current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe('8');
    expect((current.user.getByRole('combobox') as HTMLSelectElement).value).toBe('widen');
    current.view.unmount();
    const widenedScoring = render(React.createElement(ConfigScreen, props(project, dataset.id)));
    fireEvent.click(await screen.findByText('Scoring'));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Scoring' }));
    await screen.findByText(/Scoring complete/);
    await waitFor(() => expect(screen.getByText(/R04, R07/)).toBeTruthy());
    result = (await scoreRepository.getLatest(dataset.id))!.payload.result as { rows: Record<string, unknown>[] };
    expect(result.rows[8]).toMatchObject({ 'Subscale 3 Sum': 20, 'Overall Scale Score': 43 });
    widenedScoring.unmount();

    current = await openNamedScale(project, dataset.id, 'Subscale 3');
    const max = current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement;
    fireEvent.change(max, { target: { value: '7' } }); fireEvent.blur(max);
    await waitFor(() => expect(max.value).toBe('7'));
    expect(current.user.getByText('8 (outside 1 to 7)')).toBeTruthy();
    expect((current.user.getByRole('combobox') as HTMLSelectElement).value).toBe('missing');
    expect(Array.from((current.user.getByRole('combobox') as HTMLSelectElement).options).map((option) => option.value)).toEqual(['missing', 'widen']);
    await new Promise((resolve) => setTimeout(resolve, 1500)); current.view.unmount();
    current = await openNamedScale(project, dataset.id, 'Subscale 3');
    fireEvent.change(current.user.getByRole('combobox'), { target: { value: 'widen' } });
    await waitFor(() => expect((current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe('8'));
    await new Promise((resolve) => setTimeout(resolve, 1500)); current.view.unmount();
    current = await openNamedScale(project, dataset.id, 'Subscale 3');
    fireEvent.change(current.user.getByRole('combobox'), { target: { value: 'missing' } });
    await waitFor(() => expect((current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe('7'));
    await new Promise((resolve) => setTimeout(resolve, 1500)); current.view.unmount();
    current = await openNamedScale(project, dataset.id, 'Subscale 3');
    expect((current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe('7');
    expect((current.user.getByRole('combobox') as HTMLSelectElement).value).toBe('missing');
    current.view.unmount();
    const missingScoring = render(React.createElement(ConfigScreen, props(project, dataset.id)));
    fireEvent.click(await screen.findByText('Scoring'));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Scoring' }));
    await screen.findByText(/Scoring complete/);
    await waitFor(() => expect(screen.getByText(/R04, R07, R09/)).toBeTruthy());
    result = (await scoreRepository.getLatest(dataset.id))!.payload.result as { rows: Record<string, unknown>[] };
    expect(result.rows[8]).toMatchObject({ 'Subscale 3 Sum': null, 'Overall Scale Score': null });
    missingScoring.unmount();
  }, 90000);

  it('D2: tracks multiple outliers independently across two widen and two Not scored choices', async () => {
    const { project, dataset } = await setup({
      fileName: 'fixture_B.csv',
      mutateRows: (rows) => { rows[0].Q11 = '9'; rows[1].Q12 = '0'; },
      scales: [
        { id: 's1', name: 'Subscale 1', columns: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'], reversed: ['Q2', 'Q4'], min: 1, max: 5 },
        { id: 's2', name: 'Subscale 2', columns: ['Q6', 'Q7', 'Q8', 'Q9'], reversed: ['Q8'], min: 0, max: 4 },
        { id: 's3', name: 'Subscale 3', columns: ['Q10', 'Q11', 'Q12'], reversed: [], min: 1, max: 7 },
      ],
    });
    let current = await openNamedScale(project, dataset.id, 'Subscale 3');
    const minInput = current.user.getByLabelText('Subscale 3 minimum') as HTMLInputElement;
    const maxInput = current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement;
    fireEvent.change(minInput, { target: { value: '1' } }); fireEvent.blur(minInput);
    fireEvent.change(maxInput, { target: { value: '7' } }); fireEvent.blur(maxInput);
    await waitFor(() => expect(maxInput.value).toBe('7'));
    const row = (answer: string) => current.user.getByText(answer).closest('tr') as HTMLTableRowElement;
    expect(within(row('9 (outside 1 to 7)')).getByRole('combobox').textContent).toContain('Widen scale to 1-9');
    expect(within(row('0 (outside 1 to 7)')).getByRole('combobox').textContent).toContain('Widen scale to 0-7');
    expect(within(row('8 (outside 1 to 7)')).getByRole('combobox').textContent).toContain('Widen scale to 1-8');
    fireEvent.change(within(row('9 (outside 1 to 7)')).getByRole('combobox'), { target: { value: 'widen' } });
    await waitFor(() => expect((current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe('9'));
    await new Promise((resolve) => setTimeout(resolve, 1500)); current.view.unmount();
    current = await openNamedScale(project, dataset.id, 'Subscale 3');
    expect((current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe('9');
    expect((within(row('9 (outside 1 to 7)')).getByRole('combobox') as HTMLSelectElement).value).toBe('widen');
    fireEvent.change(within(row('0 (outside 1 to 7)')).getByRole('combobox'), { target: { value: 'widen' } });
    await waitFor(() => expect((current.user.getByLabelText('Subscale 3 minimum') as HTMLInputElement).value).toBe('0'));
    await new Promise((resolve) => setTimeout(resolve, 1500)); current.view.unmount();
    current = await openNamedScale(project, dataset.id, 'Subscale 3');
    expect((current.user.getByLabelText('Subscale 3 minimum') as HTMLInputElement).value).toBe('0');
    expect((within(row('9 (outside 1 to 7)')).getByRole('combobox') as HTMLSelectElement).value).toBe('widen');
    expect((within(row('0 (outside 1 to 7)')).getByRole('combobox') as HTMLSelectElement).value).toBe('widen');
    fireEvent.change(within(row('9 (outside 1 to 7)')).getByRole('combobox'), { target: { value: 'missing' } });
    await waitFor(() => expect((current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe('7'));
    expect((within(row('0 (outside 1 to 7)')).getByRole('combobox') as HTMLSelectElement).value).toBe('widen');
    await new Promise((resolve) => setTimeout(resolve, 1500)); current.view.unmount();
    current = await openNamedScale(project, dataset.id, 'Subscale 3');
    expect((current.user.getByLabelText('Subscale 3 minimum') as HTMLInputElement).value).toBe('0');
    expect((current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe('7');
    fireEvent.change(within(row('0 (outside 1 to 7)')).getByRole('combobox'), { target: { value: 'missing' } });
    await waitFor(() => expect((current.user.getByLabelText('Subscale 3 minimum') as HTMLInputElement).value).toBe('1'));
    await new Promise((resolve) => setTimeout(resolve, 1500)); current.view.unmount();
    current = await openNamedScale(project, dataset.id, 'Subscale 3');
    expect((current.user.getByLabelText('Subscale 3 minimum') as HTMLInputElement).value).toBe('1');
    expect((current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe('7');
    current.view.unmount();
  }, 90000);

  it('D3: round-trips current template state through storage and checks legacy range migration', async () => {
    const { project, dataset } = await setup({ fileName: 'fixture_B.csv', overall: true, scales: [
      { id: 's1', name: 'Subscale 1', columns: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'], reversed: ['Q2', 'Q4'], min: 1, max: 5 },
      { id: 's2', name: 'Subscale 2', columns: ['Q6', 'Q7', 'Q8', 'Q9'], reversed: ['Q8'], min: 0, max: 4 },
      { id: 's3', name: 'Subscale 3', columns: ['Q10', 'Q11', 'Q12'], reversed: [], min: 1, max: 7 },
    ] });
    const configured = await surveyConfigRepository.get(dataset.id);
    const source = fromSurveyConfigRecord(configured!);
    const { headers: fixtureHeaders, rows: fixtureRows } = fixtureData('fixture_B.csv');
    const sourceScales = source.subscales.map((scale, index) => ({
      ...scale,
      confirmed: index < 2,
      rangeSource: index === 1 ? 'manual' as const : 'detected' as const,
      minValue: index === 1 ? 0 : 1,
      maxValue: index === 1 ? 4 : index === 2 ? 8 : 5,
      baseMin: index === 1 ? 0 : 1,
      baseMax: index === 1 ? 4 : index === 2 ? 7 : 5,
      outOfRangeDecisions: index === 2 ? { '8': { action: 'widen' as const, reviewed: true } } : {},
      labelMap: index === 2 ? [{ label: 'N/A', value: 0, kind: 'special' as const }] : [],
    }));
    const definition = buildTemplateDefinition(sourceScales, {}, {}, { enabled: true, basedOn: 'sums', combineBy: 'sum', customFormula: '' });
    const saved = await templateRepository.save({ name: 'State template', description: '', instrument: '', definition });
    const other = await datasetRepository.import({ projectId: project.id, fileName: 'fixture-copy.csv', sheetName: 'Sheet 1', headers: fixtureHeaders, rows: fixtureRows, columnMeta: {}, demographicColumns: [] });
    await surveyConfigRepository.save(other.id, toSurveyConfigRecord({ datasetId: other.id, projectId: project.id, headers: fixtureHeaders, demographicColumns: [], subscales: [], bands: {}, overallSettings: { enabled: false, basedOn: 'sums', combineBy: 'sum', customFormula: '' } }));
    const targetConfig = toSurveyConfigRecord({ datasetId: other.id, projectId: project.id, headers: fixtureHeaders,
      demographicColumns: [], subscales: sourceScales, bands: {},
      overallSettings: { enabled: true, basedOn: 'sums', combineBy: 'sum', customFormula: '' }, linkedTemplateId: saved.id });
    await templateRepository.applyToDataset(saved.id, other.id, targetConfig);
    const applied = fromSurveyConfigRecord((await surveyConfigRepository.get(other.id))!);
    expect(applied.subscales[2]).toMatchObject({ minValue: 1, maxValue: 8, baseMin: 1, baseMax: 7, rangeSource: 'detected', confirmed: false, outOfRangeDecisions: { '8': { action: 'widen', reviewed: true } } });
    expect(applied.subscales[2].labelMap).toContainEqual({ label: 'N/A', value: 0, kind: 'special' });
    const restored = await openNamedScale(project, other.id, 'Subscale 3');
    expect((restored.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe('8');
    expect((restored.user.getByRole('combobox') as HTMLSelectElement).value).toBe('widen');
    restored.view.unmount();

    const legacy = { ...definition, responseScales: definition.responseScales.map((scale) => ({ ...scale, outOfRangeDecisions: undefined, outOfRangeDecision: { action: 'widen', values: [8], originalMin: 1, originalMax: 7 } })) };
    const oldTemplate = await templateRepository.save({ name: 'Legacy template', description: '', instrument: '', definition: legacy });
    const legacyScale = legacy.responseScales[2];
    expect(legacyScale).toMatchObject({ outOfRangeDecision: { values: [8], originalMin: 1, originalMax: 7 } });
    expect(migrateRangeState({ ...legacyScale, hasReverseItems: false })).toMatchObject({ minValue: 1, maxValue: 8, baseMin: 1, baseMax: 7, outOfRangeDecisions: { '8': { action: 'widen', reviewed: true } } });
    expect(oldTemplate.id).toBeTruthy();
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

  it('D6: runs twelve seeded six-action sequences on Fixture B with reloads', async () => {
    const { project, dataset } = await setup({ fileName: 'fixture_B.csv', scales: [
      { id: 's3', name: 'Subscale 3', columns: ['Q10', 'Q11', 'Q12'], reversed: [], min: 1, max: 7 },
    ] });
    const actions = ['widen', 'missing', 'confirm', 'range', 'invalid'] as const;
    let baseMax = 7;
    let max = 7;
    let decision: '' | 'missing' | 'widen' = '';
    let reviewed = false;
    for (let seed = 41; seed < 53; seed += 1) {
      let random = seed;
      const sequence = Array.from({ length: 6 }, () => { random = (random * 48271) % 2147483647; return actions[random % actions.length]; });
      let current = await openNamedScale(project, dataset.id, 'Subscale 3');
      try {
        for (const action of sequence) {
          const row = current.user.getByText(`8 (outside 1 to ${baseMax})`).closest('tr') as HTMLTableRowElement;
          if (action === 'widen' && decision !== 'widen') {
            fireEvent.change(within(row).getByRole('combobox'), { target: { value: 'widen' } });
            decision = 'widen'; reviewed = true; max = Math.max(baseMax, 8);
          } else if (action === 'missing' && decision !== 'missing') {
            fireEvent.change(within(row).getByRole('combobox'), { target: { value: 'missing' } });
            decision = 'missing'; reviewed = true; max = baseMax;
          } else if (action === 'confirm') {
            expect(current.user.queryByRole('button', { name: 'Confirm range' })).toBeNull();
          } else if (action === 'range') {
            const next = baseMax === 6 ? 7 : 6;
            const input = current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement;
            fireEvent.change(input, { target: { value: String(next) } }); fireEvent.blur(input);
            if (next !== max) { baseMax = next; max = next; if (decision === 'widen') decision = 'missing'; }
          } else if (action === 'invalid') {
            const input = current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement;
            fireEvent.change(input, { target: { value: 'bad' } }); fireEvent.blur(input);
          }
          expect((current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe(String(max));
          const rowAfter = current.user.getByText(`8 (outside 1 to ${baseMax})`).closest('tr') as HTMLTableRowElement;
          expect((within(rowAfter).getByRole('combobox') as HTMLSelectElement).value).toBe(decision);
          const reviewCount = baseMax === 6 ? 1 : reviewed ? 0 : 1;
          expect(current.user.getByText(reviewCount > 0 ? new RegExp(`${reviewCount} answer to review`) : new RegExp(`scale 1 to ${max}`))).toBeTruthy();
        }
        await new Promise((resolve) => setTimeout(resolve, 1500)); current.view.unmount();
        current = await openNamedScale(project, dataset.id, 'Subscale 3');
        expect((current.user.getByLabelText('Subscale 3 maximum') as HTMLInputElement).value).toBe(String(max));
        const row = current.user.getByText(`8 (outside 1 to ${baseMax})`).closest('tr') as HTMLTableRowElement;
        expect((within(row).getByRole('combobox') as HTMLSelectElement).value).toBe(decision);
      } catch (error) {
        throw new Error(`Seed ${seed}, sequence ${sequence.join(' → ')}: ${String(error)}`);
      } finally { current.view.unmount(); }
    }
  }, 90000);
});

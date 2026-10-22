// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConfigScreen } from '../src/components/ConfigScreen';
import { db } from '../src/storage/db';
import { scoreRepository, surveyConfigRepository } from '../src/storage/repositories';
import { openResponseScaleCard, screenProps, setupRealScreen } from './helpers/realScreen';

const fixtureAScales = [
  { id: 's1', name: 'Subscale 1', columns: ['Q1', 'Q2'], reversed: [] },
  { id: 's2', name: 'Subscale 2', columns: ['Q3', 'Q4', 'Q5'], reversed: [] },
];

async function setupWordsA() {
  return setupRealScreen({ fileName: 'fixture_words.csv', scales: fixtureAScales, overall: true });
}

function answerRow(card: HTMLElement, answer: string): HTMLTableRowElement {
  const row = Array.from(card.querySelectorAll('tbody tr')).find((candidate) => candidate.cells[0]?.textContent?.trim().startsWith(answer));
  if (!row) throw new Error(`Missing answer row: ${answer}`);
  return row as HTMLTableRowElement;
}

describe('word response scales on the real ConfigScreen', () => {
  beforeEach(async () => {
    cleanup();
    await db.delete();
    await db.open();
    Element.prototype.scrollIntoView = () => {};
  });
  afterAll(() => db.close());

  it('T1: seeds saved preset numbers, links pending Maybe and blocks scoring until decided', async () => {
    const { project, dataset } = await setupWordsA();
    const current = await openResponseScaleCard(project, dataset.id, 'Subscale 2');
    expect((within(answerRow(current.card, 'Neither agree nor disagree').getElementsByTagName('td')[2]).getByLabelText('Counts as Neither agree nor disagree') as HTMLInputElement).value).toBe('3');
    expect(current.user.queryByRole('button', { name: 'Flip order' })).toBeNull();
    const maybe = answerRow(current.card, 'Maybe');
    expect(maybe.className).toContain('bg-warning-50');
    const scoreInput = within(maybe).getByLabelText('Counts as Maybe') as HTMLInputElement;
    expect(scoreInput.value).toBe('');
    fireEvent.click(await screen.findByText('Scoring'));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Scoring' }));
    expect(await screen.findByText(/Scoring is waiting: Subscale 2 has 1 answer to decide/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Go to Subscale 2/ })).toBeTruthy();
    current.view.unmount();
  });

  it('T2: automatic Overall waits for Maybe and scores with the saved word mapping after Not scored', async () => {
    const { project, dataset } = await setupRealScreen({ fileName: 'fixture_words.csv', scales: [], overall: true });
    let current = await openResponseScaleCard(project, dataset.id, 'Overall scale');
    fireEvent.click(await screen.findByText('Scoring'));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Scoring' }));
    expect(await screen.findByText(/Scoring is waiting/)).toBeTruthy();
    current.view.unmount();

    current = await openResponseScaleCard(project, dataset.id, 'Overall scale');
    const maybe = answerRow(current.card, 'Maybe');
    fireEvent.change(within(maybe).getByRole('combobox', { name: 'Maybe action' }), { target: { value: 'not-scored' } });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    current.view.unmount();

    const scoring = render(React.createElement(ConfigScreen, screenProps(project, dataset.id)));
    fireEvent.click(await screen.findByText('Scoring'));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Scoring' }));
    await screen.findByText(/Scoring complete/);
    const result = (await scoreRepository.getLatest(dataset.id))!.payload.result as { rows: Record<string, unknown>[] };
    expect(result.rows[1]['Overall Scale Score']).toBe(16);
    expect(result.rows[2]['Overall Scale Score']).toBeNull();
    const saved = await surveyConfigRepository.get(dataset.id);
    const words = saved!.overall_scale!.response_scale!.label_map!;
    expect(words.find((entry) => entry.label === 'Strongly agree')?.value).toBe(5);
    expect(words.filter((entry) => entry.label.toLowerCase() === 'strongly agree')).toHaveLength(1);
    scoring.unmount();
  });

  it('T3: number, alias and Not scored are one saved decision each', async () => {
    const { project, dataset } = await setupWordsA();
    const current = await openResponseScaleCard(project, dataset.id, 'Subscale 2');
    const maybe = answerRow(current.card, 'Maybe');
    fireEvent.change(within(maybe).getByLabelText('Counts as Maybe'), { target: { value: '3' } });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    let saved = await surveyConfigRepository.get(dataset.id);
    let labels = saved!.subscales.find((subscale) => subscale.name === 'Subscale 2')!.response_scale!.label_map!;
    expect(labels.find((entry) => entry.label === 'Maybe')?.value).toBe(3);
    expect(saved!.subscales.find((subscale) => subscale.name === 'Subscale 2')!.response_scale!.min_value).toBe(1);

    fireEvent.change(within(answerRow(current.card, 'Maybe')).getByRole('combobox', { name: 'Maybe action' }), { target: { value: 'alias' } });
    fireEvent.change(within(answerRow(current.card, 'Maybe')).getByRole('combobox', { name: 'Maybe counts-as target' }), { target: { value: 'Neither agree nor disagree' } });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    saved = await surveyConfigRepository.get(dataset.id);
    labels = saved!.subscales.find((subscale) => subscale.name === 'Subscale 2')!.response_scale!.label_map!;
    expect(labels.find((entry) => entry.label === 'Maybe')).toMatchObject({ aliasOf: 'Neither agree nor disagree', value: 3 });
    fireEvent.change(within(answerRow(current.card, 'Maybe')).getByRole('combobox', { name: 'Maybe action' }), { target: { value: 'not-scored' } });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    saved = await surveyConfigRepository.get(dataset.id);
    labels = saved!.subscales.find((subscale) => subscale.name === 'Subscale 2')!.response_scale!.label_map!;
    expect(labels.find((entry) => entry.label === 'Maybe')).toMatchObject({ value: null, notScored: true });
    current.view.unmount();
  });

  it('T4: a no-preset word scale has no preset controls and offers number entry', async () => {
    const { project, dataset } = await setupRealScreen({
      data: { headers: ['Participant', 'Item A'], rows: [{ Participant: 'r1', 'Item A': 'oui' }, { Participant: 'r2', 'Item A': 'non' }, { Participant: 'r3', 'Item A': 'peut-être' }] },
      demographicColumns: ['Participant'],
      scales: [{ id: 'language-scale', name: 'Language scale', columns: ['Item A'], reversed: [] }],
    });
    const current = await openResponseScaleCard(project, dataset.id, 'Language scale');
    expect(current.user.queryByRole('button', { name: 'Wrong scale? Change' })).toBeNull();
    expect(current.user.queryByRole('button', { name: 'Flip order' })).toBeNull();
    expect(current.user.queryByRole('button', { name: 'Start at 0' })).toBeNull();
    expect((within(answerRow(current.card, 'oui')).getByLabelText('Counts as oui') as HTMLInputElement).value).toBe('');
    current.view.unmount();
  });

  it('T5: recognizes aliases and numbered labels on the real screen', async () => {
    const rows = [
      'Totally agree', 'Neither agree or disagree', 'Strongly-agree', "Don't know", 'Prefer not to answer',
    ].map((answer, index) => ({ Respondent: `r${index + 1}`, Item: answer }));
    const { project, dataset } = await setupRealScreen({
      data: { headers: ['Respondent', 'Item'], rows },
      demographicColumns: ['Respondent'],
      scales: [{ id: 'aliases', name: 'Alias scale', columns: ['Item'], reversed: [] }],
    });
    let current = await openResponseScaleCard(project, dataset.id, 'Alias scale');
    expect((within(answerRow(current.card, 'Totally agree')).getByLabelText('Counts as Totally agree') as HTMLInputElement).value).toBe('5');
    expect((within(answerRow(current.card, 'Neither agree or disagree')).getByLabelText('Counts as Neither agree or disagree') as HTMLInputElement).value).toBe('3');
    expect((within(answerRow(current.card, 'Strongly-agree')).getByLabelText('Counts as Strongly-agree') as HTMLInputElement).value).toBe('5');
    expect(current.card.textContent).toContain('5-pt Agreement');
    expect(current.card.textContent).not.toContain('These items look like two different scales');
    current.view.unmount();

    const numberedRows = [
      '5 - Strongly agree', '4 - Agree', '3 - Neutral', '2 - Disagree', '1 - Strongly disagree',
    ].map((answer, index) => ({ Respondent: `n${index + 1}`, Item: answer }));
    const numbered = await setupRealScreen({
      data: { headers: ['Respondent', 'Item'], rows: numberedRows },
      demographicColumns: ['Respondent'],
      scales: [{ id: 'numbered', name: 'Numbered scale', columns: ['Item'], reversed: [] }],
    });
    current = await openResponseScaleCard(numbered.project, numbered.dataset.id, 'Numbered scale');
    for (const [answer, value] of numberedRows.map((row) => [row.Item, row.Item[0]] as const)) {
      expect((within(answerRow(current.card, answer)).getByLabelText(`Counts as ${answer}`) as HTMLInputElement).value).toBe(value);
    }
    current.view.unmount();
  });

  it('T11: warns when different item columns match different response scales', async () => {
    const agreement = ['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree'];
    const frequency = ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'];
    const rows = agreement.map((answer, index) => ({ Respondent: `r${index + 1}`, Agreement: answer, Frequency: frequency[index] }));
    const { project, dataset } = await setupRealScreen({
      data: { headers: ['Respondent', 'Agreement', 'Frequency'], rows },
      demographicColumns: ['Respondent'],
      scales: [{ id: 'mixed', name: 'Mixed scale', columns: ['Agreement', 'Frequency'], reversed: [] }],
    });
    const current = await openResponseScaleCard(project, dataset.id, 'Mixed scale');
    expect(current.card.textContent).toContain('These items look like two different scales. Consider separate subscales.');
    current.view.unmount();
  });

  it('T7: Reset to detected restores seeded word labels after manual changes', async () => {
    const { project, dataset } = await setupWordsA();
    const current = await openResponseScaleCard(project, dataset.id, 'Subscale 2');
    expect(current.user.queryByRole('button', { name: 'Reset to detected' })).toBeNull();
    const maybe = answerRow(current.card, 'Maybe');
    fireEvent.change(within(maybe).getByLabelText('Counts as Maybe'), { target: { value: '3' } });
    expect(await screen.findByRole('button', { name: 'Reset to detected' })).toBeTruthy();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to detected' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(current.user.queryByRole('button', { name: 'Reset to detected' })).toBeNull());
    expect((within(answerRow(current.card, 'Maybe')).getByLabelText('Counts as Maybe') as HTMLInputElement).value).toBe('');
    confirm.mockRestore();
    current.view.unmount();
  });

  it('T9: waiting links navigate to the answer cell and scoring reports unresolved respondents', async () => {
    const { project, dataset } = await setupWordsA();
    const current = await openResponseScaleCard(project, dataset.id, 'Subscale 2');
    fireEvent.click(await screen.findByText('Scoring'));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Scoring' }));
    expect(await screen.findByText(/Scoring is waiting: Subscale 2 has 1 answer to decide/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Go to Subscale 2/ }));
    const answerLinks = await screen.findAllByRole('button', { name: 'Q4: W12' });
    fireEvent.click(answerLinks[0]);
    const respondentRow = screen.getByText('W12', { exact: true }).closest('tr');
    expect(Array.from(respondentRow?.querySelectorAll('td') ?? []).some((cell) => cell.textContent?.trim() === 'Maybe' && cell.className.includes('bg-accent-200'))).toBe(true);
    const activeCard = document.querySelector('[data-response-scale-id="s2"]') as HTMLElement;
    const maybe = answerRow(activeCard, 'Maybe');
    fireEvent.change(within(maybe).getByRole('combobox', { name: 'Maybe action' }), { target: { value: 'not-scored' } });
    fireEvent.click(await screen.findByText('Scoring'));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Scoring' }));
    await screen.findByText(/Scoring complete \(v/);
    const missingRows = screen.getByText(/rows have at least one score missing/).textContent ?? '';
    for (const respondent of ['W03', 'W05', 'W09', 'W12']) expect(missingRows).toContain(respondent);
    current.view.unmount();
  });

  it('T6: reverse-scored word subscales require confirmation and use the saved mapping', async () => {
    const reversedScales = [
      { id: 's1', name: 'Subscale 1', columns: ['Q1', 'Q2'], reversed: ['Q2'] },
      { id: 's2', name: 'Subscale 2', columns: ['Q3', 'Q4', 'Q5'], reversed: ['Q4'] },
    ];
    const { project, dataset } = await setupRealScreen({ fileName: 'fixture_words.csv', scales: reversedScales, overall: true });
    let current = await openResponseScaleCard(project, dataset.id, 'Subscale 2');
    fireEvent.change(within(answerRow(current.card, 'Maybe')).getByRole('combobox', { name: 'Maybe action' }), { target: { value: 'not-scored' } });
    expect(current.user.getByRole('button', { name: 'Confirm range' })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    let saved = await surveyConfigRepository.get(dataset.id);
    expect(saved?.subscales.find((subscale) => subscale.name === 'Subscale 2')?.response_scale?.label_map?.find((label) => label.label === 'Maybe')).toMatchObject({ notScored: true });
    current.view.unmount();

    const scoring = render(React.createElement(ConfigScreen, screenProps(project, dataset.id)));
    fireEvent.click(await screen.findByText('Scoring'));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Scoring' }));
    expect(await screen.findByText(/Confirm the range before reverse-scoring/)).toBeTruthy();
    scoring.unmount();

    for (const name of ['Subscale 1', 'Subscale 2']) {
      current = await openResponseScaleCard(project, dataset.id, name);
      fireEvent.click(current.user.getByRole('button', { name: 'Confirm range' }));
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const saved = await surveyConfigRepository.get(dataset.id);
      expect(saved?.subscales.find((subscale) => subscale.name === name)?.response_scale?.confirmed).toBe(true);
      current.view.unmount();
    }
    const finalView = render(React.createElement(ConfigScreen, screenProps(project, dataset.id)));
    fireEvent.click(await screen.findByText('Scoring'));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Scoring' }));
    await screen.findByText(/Scoring complete/);
    const result = (await scoreRepository.getLatest(dataset.id))!.payload.result as { rows: Record<string, unknown>[] };
    const byRespondent = new Map(result.rows.map((row) => [Object.values(row).find((value) => typeof value === 'string' && /^W\d+$/.test(value)) as string, row]));
    expect(byRespondent.get('W01')).toMatchObject({ 'Subscale 1 Sum': 4, 'Subscale 2 Sum': 11, 'Overall Scale Score': 15 });
    expect(byRespondent.get('W02')).toMatchObject({ 'Subscale 1 Sum': 4, 'Subscale 2 Sum': 4, 'Overall Scale Score': 8 });
    expect(byRespondent.get('W04')).toMatchObject({ 'Subscale 1 Sum': 7, 'Subscale 2 Sum': 3, 'Overall Scale Score': 10 });
    expect(byRespondent.get('W06')).toMatchObject({ 'Subscale 1 Sum': 7, 'Subscale 2 Sum': 12, 'Overall Scale Score': 19 });
    expect(byRespondent.get('W03')).toMatchObject({ 'Subscale 1 Sum': null, 'Overall Scale Score': null });
    expect(byRespondent.get('W12')).toMatchObject({ 'Subscale 2 Sum': null, 'Overall Scale Score': null });
    finalView.unmount();
  }, 20000);

  it('T14: a displayed manual word number survives save, scoring, and reload', async () => {
    const { project, dataset } = await setupWordsA();
    let current = await openResponseScaleCard(project, dataset.id, 'Subscale 2');
    const maybe = answerRow(current.card, 'Maybe');
    fireEvent.change(within(maybe).getByLabelText('Counts as Maybe'), { target: { value: '3' } });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    let saved = await surveyConfigRepository.get(dataset.id);
    expect((within(answerRow(current.card, 'Maybe')).getByLabelText('Counts as Maybe') as HTMLInputElement).value).toBe('3');
    expect(saved?.subscales.find((subscale) => subscale.name === 'Subscale 2')?.response_scale?.label_map?.find((label) => label.label === 'Maybe')?.value).toBe(3);
    current.view.unmount();

    const scoring = render(React.createElement(ConfigScreen, screenProps(project, dataset.id)));
    fireEvent.click(await screen.findByText('Scoring'));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Scoring' }));
    await screen.findByText(/Scoring complete/);
    const result = (await scoreRepository.getLatest(dataset.id))!.payload.result as { rows: Record<string, unknown>[] };
    const respondent = result.rows.find((row) => Object.values(row).includes('W12'));
    expect(respondent).toMatchObject({ 'Subscale 1 Sum': 4, 'Subscale 2 Sum': 7, 'Overall Scale Score': 11 });
    scoring.unmount();

    current = await openResponseScaleCard(project, dataset.id, 'Subscale 2');
    expect((within(answerRow(current.card, 'Maybe')).getByLabelText('Counts as Maybe') as HTMLInputElement).value).toBe('3');
    saved = await surveyConfigRepository.get(dataset.id);
    expect(saved?.subscales.find((subscale) => subscale.name === 'Subscale 2')?.response_scale?.label_map?.find((label) => label.label === 'Maybe')?.value).toBe(3);
    current.view.unmount();
  }, 20000);

  it('T10: an immediate unmount flushes a range edit', async () => {
    const { project, dataset } = await setupRealScreen();
    let current = await openResponseScaleCard(project, dataset.id, 'Subscale 1');
    const max = current.user.getByLabelText('Subscale 1 maximum') as HTMLInputElement;
    fireEvent.change(max, { target: { value: '6' } });
    fireEvent.blur(max);
    current.view.unmount();
    current = await openResponseScaleCard(project, dataset.id, 'Subscale 1');
    expect((current.user.getByLabelText('Subscale 1 maximum') as HTMLInputElement).value).toBe('6');
    current.view.unmount();
  });

  it('T15: two unknown numeric answers block scoring and can be treated as not scored together', async () => {
    const { project, dataset } = await setupRealScreen({
      mutateRows: (rows) => { rows[0].Q1 = 'unexpected one'; rows[1].Q2 = 'unexpected two'; },
      scales: [{ id: 'numeric', name: 'Numeric scale', columns: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'], reversed: [] }],
    });
    const current = await openResponseScaleCard(project, dataset.id, 'Numeric scale');
    fireEvent.click(await screen.findByText('Scoring'));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Scoring' }));
    expect(await screen.findByText(/Scoring is waiting: Numeric scale has 2 answers to decide/)).toBeTruthy();
    const resolveAll = screen.getByRole('button', { name: 'Treat all 2 as not scored' });
    fireEvent.click(resolveAll);
    await waitFor(() => expect(screen.queryByText(/Scoring is waiting/)).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Run Scoring' }));
    await screen.findByText(/Scoring complete/);
    current.view.unmount();
  });
});

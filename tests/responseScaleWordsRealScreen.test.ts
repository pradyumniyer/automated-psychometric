// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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

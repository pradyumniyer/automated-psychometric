// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyOutOfRangeAction, type ResponseScaleLabelSetting } from '../src/scientific/responseScales';
import { scoreDataset, type SubscaleConfig } from '../src/scientific/scoring';
import { getUnscoredRowSummary } from '../src/lib/scoringStatus';
import { ScaleCardCompact } from '../src/components/ConfigScreen';

type TestSubscale = {
  id: string;
  name: string;
  items: { column: string; order: number; reverse: boolean }[];
  min: number;
  max: number;
  confirmed: boolean;
  decision?: { action: 'missing' | 'widen'; cells: string[]; values: number[]; originalMin?: number; originalMax?: number };
};

type ExpectedScoreRow = { S1: number | null; S2: number | null; S3: number | null; Overall: number | null };
type FixtureExpected = { base: Record<string, ExpectedScoreRow> };
type Fixture = { headers: string[]; rows: Record<string, unknown>[]; expected?: FixtureExpected };

function loadFixture(fileName: string, expectedFileName?: string): Fixture {
  const csv = readFileSync(resolve(process.cwd(), 'docs', 'fixtures', fileName), 'utf8').trim();
  const [headerLine, ...dataLines] = csv.split(/\r?\n/);
  const headers = headerLine.split(',');
  const rows = dataLines.map((line) => Object.fromEntries(line.split(',').map((value, index) => [headers[index], value])));
  const expected = expectedFileName
    ? JSON.parse(readFileSync(resolve(process.cwd(), 'docs', 'fixtures', expectedFileName), 'utf8')) as FixtureExpected
    : undefined;
  return { headers, rows, expected };
}

function makeSubscale(id: string, name: string, columns: string[], reverse: string[], min: number, max: number, confirmed: boolean): TestSubscale {
  return { id, name, items: columns.map((column, order) => ({ column, order, reverse: reverse.includes(column) })), min, max, confirmed };
}

function scoreCurrent(fixture: Fixture, subscales: TestSubscale[]) {
  return scoreDataset(
    fixture.rows,
    fixture.headers,
    subscales.map((subscale): SubscaleConfig => ({
      id: subscale.id,
      name: subscale.name,
      items: subscale.items,
      scoringMethod: 'sum',
      showOutputs: ['sum'],
      responseScale: { scaleType: 'numeric', minValue: subscale.min, maxValue: subscale.max, labelMap: [], confirmed: subscale.confirmed },
    })),
    {},
    [],
    { rowIds: fixture.rows.map((row) => String(row.ID)), overall: { enabled: true, method: 'sum' } },
  );
}

function CardHarness({ fixture, initial, displayIds = true }: { fixture: Fixture; initial: TestSubscale[]; displayIds?: boolean }) {
  const [subscales, setSubscales] = useState(initial);
  const update = (id: string, patch: Partial<TestSubscale>) => setSubscales((current) => current.map((subscale) => subscale.id === id ? { ...subscale, ...patch } : subscale));
  const result = (() => {
    try { return scoreCurrent(fixture, subscales); } catch { return null; }
  })();
  const ids = fixture.rows.map((row) => String(row.ID));
  const handleApply = async (id: string, action: 'missing' | 'widen', values: number[], cells: string[]) => {
    const current = subscales.find((subscale) => subscale.id === id);
    if (!current) return;
    const applied = applyOutOfRangeAction({
      min: current.min, max: current.max, rangeSource: 'manual', confirmed: current.confirmed,
      flipped: false, startsAtZero: false, labels: [], outOfRange: action,
    }, values, action, current.items.some((item) => item.reverse));
    update(id, {
      min: applied.scale.min,
      max: applied.scale.max,
      confirmed: applied.scale.confirmed,
      decision: { action, cells, values: [...values], originalMin: current.min, originalMax: current.max },
    });
  };
  const handleChangeDecision = (id: string) => {
    const current = subscales.find((subscale) => subscale.id === id);
    if (!current) return;
    update(id, {
      min: current.decision?.originalMin ?? current.min,
      max: current.decision?.originalMax ?? current.max,
      confirmed: current.items.some((item) => item.reverse) ? false : current.confirmed,
      decision: undefined,
    });
  };
  return React.createElement(
    React.Fragment,
    null,
    ...subscales.map((subscale) => React.createElement(ScaleCardCompact, {
      key: subscale.id,
      name: subscale.name,
      scaleType: 'numeric',
      scoringMethod: 'sum',
      showOutputs: ['sum'],
      customFormula: '',
      multipleOutputs: true,
      minValue: subscale.min,
      maxValue: subscale.max,
      labelMap: [] as ResponseScaleLabelSetting[],
      itemCols: subscale.items.map((item) => item.column),
      items: subscale.items,
      rows: fixture.rows,
      displayIds: displayIds ? ids : [],
      cardId: subscale.id,
      collapsible: true,
      isOpen: true,
      onToggleOpen: () => undefined,
      confirmed: subscale.confirmed,
      outOfRangeDecision: subscale.decision,
      onChangeOutOfRangeDecision: () => handleChangeDecision(subscale.id),
      onApplyOutOfRange: (action, values, cells) => handleApply(subscale.id, action, values, cells),
      onHighlightCell: () => undefined,
      onSetScoringMethod: () => undefined,
      onToggleOutput: () => undefined,
      onSetCustomFormula: () => undefined,
      onSetScaleRange: (min, max) => update(subscale.id, { min: min ?? subscale.min, max: max ?? subscale.max, confirmed: subscale.items.some((item) => item.reverse) ? false : subscale.confirmed }),
      onConfirmRange: () => update(subscale.id, { confirmed: true }),
      onSetLabelMap: () => undefined,
      onSetWordOptions: () => undefined,
      onAutoDetect: () => undefined,
      formulaPreviewFn: () => '',
    })),
    result && subscales.flatMap((subscale) => fixture.rows.map((row) => React.createElement('output', { key: `${subscale.id}-${row.ID}`, 'data-testid': `score-${subscale.id}-${row.ID}` }, String(result.scaleScores[subscale.id][String(row.ID)].sum ?? 'blank')))),
    result && fixture.rows.map((row, index) => React.createElement('output', { key: `overall-${row.ID}`, 'data-testid': `score-overall-${row.ID}` }, String(result.overallScaleScore?.[index] ?? 'blank'))),
    React.createElement('output', { 'data-testid': 'status' }, result ? getUnscoredRowSummary(result, ids) ?? 'none' : 'waiting'),
  );
}

function card(id: string) {
  return document.querySelector(`[data-response-scale-id="${id}"]`) as HTMLElement;
}

function expectValue(element: HTMLElement, value: string) {
  expect((element as HTMLInputElement).value).toBe(value);
}

function expectText(element: HTMLElement, text: string) {
  expect(element.textContent).toContain(text);
}

const fixtureA = loadFixture('fixture_A.csv');
const fixtureB = loadFixture('fixture_B.csv', 'fixture_B_expected.json');

afterEach(() => cleanup());

describe('rendered response scale cards', () => {
  it('A: lets a reverse-item card widen and restore its out-of-range decision repeatedly', async () => {
    const user = userEvent.setup();
    render(React.createElement(CardHarness, {
      fixture: fixtureA,
      initial: [makeSubscale('s1', 'Subscale 1', ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'], ['Q3'], 1, 5, false)],
    }));
    const scale = card('s1');
    const choice = within(scale).getByRole('combobox');
    await user.selectOptions(choice, 'widen');
    expect((choice as HTMLSelectElement).value).toBe('widen');
    expectValue(within(scale).getByLabelText('Subscale 1 maximum'), '7');
    expect(within(scale).getByRole('button', { name: 'Confirm range' })).toBeTruthy();
    await user.selectOptions(choice, '');
    expect((choice as HTMLSelectElement).value).toBe('');
    expectValue(within(scale).getByLabelText('Subscale 1 maximum'), '5');
    expect(within(scale).getByText('7 (outside 1 to 5)')).toBeTruthy();
    expect(within(scale).getByRole('button', { name: 'Confirm range' })).toBeTruthy();
    await user.selectOptions(choice, 'widen');
    await user.selectOptions(choice, '');
    expect((choice as HTMLSelectElement).value).toBe('');
    expectValue(within(scale).getByLabelText('Subscale 1 maximum'), '5');
  });

  it('A: widens a no-reverse card immediately and restores scoring when Not scored is chosen', async () => {
    const user = userEvent.setup();
    render(React.createElement(CardHarness, {
      fixture: fixtureB,
      initial: [makeSubscale('s3', 'S3', ['Q10', 'Q11', 'Q12'], [], 1, 7, false)],
    }));
    const scale = card('s3');
    expect(within(scale).queryByRole('button', { name: 'Confirm range' })).toBeNull();
    expect(within(scale).queryByText('Scoring is waiting')).toBeNull();
    const choice = within(scale).getByRole('combobox');
    await user.selectOptions(choice, 'widen');
    expectValue(within(scale).getByLabelText('S3 maximum'), '8');
    expectText(screen.getByTestId('score-s3-R09'), '20');
    await user.selectOptions(choice, '');
    expectValue(within(scale).getByLabelText('S3 maximum'), '7');
    expectText(screen.getByTestId('score-s3-R09'), 'blank');
  });

  it('B: shows Confirm range on an unconfirmed reverse-item card and commits a typed max on direct click', async () => {
    const user = userEvent.setup();
    render(React.createElement(CardHarness, {
      fixture: fixtureA,
      initial: [makeSubscale('s2', 'Subscale 2', ['Q6', 'Q7', 'Q8', 'Q9', 'Q10'], ['Q6', 'Q9'], 1, 5, false)],
    }));
    const scale = card('s2');
    const max = within(scale).getByLabelText('Subscale 2 maximum');
    expect(within(scale).getByRole('button', { name: 'Confirm range' })).toBeTruthy();
    await user.clear(max);
    await user.type(max, '7');
    await user.click(within(scale).getByRole('button', { name: 'Confirm range' }));
    expectValue(max, '7');
    expect(within(scale).queryByRole('button', { name: 'Confirm range' })).toBeNull();
    expectText(screen.getByTestId('score-s2-P01'), '23');
  });

  it('C: commits the same typed range when Enter is pressed before Confirm range', async () => {
    const user = userEvent.setup();
    render(React.createElement(CardHarness, {
      fixture: fixtureB,
      initial: [makeSubscale('s2', 'S2', ['Q6', 'Q7', 'Q8', 'Q9'], ['Q8'], 0, 4, false)],
    }));
    const scale = card('s2');
    const max = within(scale).getByLabelText('S2 maximum');
    await user.clear(max);
    await user.type(max, '3');
    await user.keyboard('{Enter}');
    expectValue(max, '3');
    await user.click(within(scale).getByRole('button', { name: 'Confirm range' }));
    expect(within(scale).queryByRole('button', { name: 'Confirm range' })).toBeNull();
    expectText(screen.getByTestId('score-s2-R04'), '2');
  });

  it('D: preserves and validates a zero minimum through the rendered inputs', async () => {
    const user = userEvent.setup();
    render(React.createElement(CardHarness, {
      fixture: fixtureB,
      initial: [makeSubscale('s2', 'S2', ['Q6', 'Q7', 'Q8', 'Q9'], ['Q8'], 0, 4, true)],
    }));
    const scale = card('s2');
    const min = within(scale).getByLabelText('S2 minimum');
    const max = within(scale).getByLabelText('S2 maximum');
    await user.clear(min);
    expectValue(min, '');
    expectValue(max, '4');
    await user.type(min, '0');
    await user.tab();
    expectValue(min, '0');
    await user.clear(min);
    await user.type(min, '5');
    await user.tab();
    expectValue(min, '0');
    expectValue(max, '4');
  });

  it('E: scores Fixture A through the rendered cards and changes only the widened subscale', async () => {
    const user = userEvent.setup();
    render(React.createElement(CardHarness, {
      fixture: fixtureA,
      initial: [
        makeSubscale('s1', 'Subscale 1', ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'], ['Q3'], 1, 5, true),
        makeSubscale('s2', 'Subscale 2', ['Q6', 'Q7', 'Q8', 'Q9', 'Q10'], ['Q6', 'Q9'], 1, 5, true),
      ],
    }));
    expectText(screen.getByTestId('score-s1-P01'), '18');
    expectText(screen.getByTestId('score-s2-P01'), '19');
    expectText(screen.getByTestId('score-overall-P01'), '37');
    expectText(screen.getByTestId('status'), 'P25, P26, P29, P30');

    const s1 = card('s1');
    const s1Max = within(s1).getByLabelText('Subscale 1 maximum');
    await user.clear(s1Max); await user.type(s1Max, '7'); await user.tab();
    await user.click(within(s1).getByRole('button', { name: 'Confirm range' }));
    expectText(screen.getByTestId('score-s1-P01'), '20');
    expectText(screen.getByTestId('score-s2-P01'), '19');
    expectText(screen.getByTestId('score-overall-P01'), '39');
    expectText(screen.getByTestId('status'), 'P25, P29, P30');

    const s2 = card('s2');
    const s2Max = within(s2).getByLabelText('Subscale 2 maximum');
    await user.clear(s2Max); await user.type(s2Max, '7'); await user.tab();
    await user.click(within(s2).getByRole('button', { name: 'Confirm range' }));
    expectText(screen.getByTestId('score-s1-P01'), '20');
    expectText(screen.getByTestId('score-s2-P01'), '23');
    expectText(screen.getByTestId('score-overall-P01'), '43');
  });

  it('E: matches Fixture B expected scores and status before and after widening S3', async () => {
    const user = userEvent.setup();
    render(React.createElement(CardHarness, {
      fixture: fixtureB,
      initial: [
        makeSubscale('s1', 'S1', ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'], ['Q2', 'Q4'], 1, 5, true),
        makeSubscale('s2', 'S2', ['Q6', 'Q7', 'Q8', 'Q9'], ['Q8'], 0, 4, true),
        makeSubscale('s3', 'S3', ['Q10', 'Q11', 'Q12'], [], 1, 7, false),
      ],
    }));
    for (const [id, scores] of Object.entries(fixtureB.expected.base)) {
      expectText(screen.getByTestId(`score-s1-${id}`), String(scores.S1 ?? 'blank'));
      expectText(screen.getByTestId(`score-s2-${id}`), String(scores.S2 ?? 'blank'));
      expectText(screen.getByTestId(`score-s3-${id}`), String(scores.S3 ?? 'blank'));
      expectText(screen.getByTestId(`score-overall-${id}`), String(scores.Overall ?? 'blank'));
    }
    expectText(screen.getByTestId('status'), 'R04, R07, R09');
    const s3 = card('s3');
    await user.selectOptions(within(s3).getByRole('combobox'), 'widen');
    expectText(screen.getByTestId('score-s3-R09'), '20');
    expectText(screen.getByTestId('score-overall-R09'), '43');
    expectText(screen.getByTestId('status'), 'R04, R07');
    expectText(screen.getByTestId('score-s1-R09'), '17');
    expectText(screen.getByTestId('score-s2-R09'), '6');
  });

  it('F: renders and scores a one-item subscale', () => {
    render(React.createElement(CardHarness, {
      fixture: { headers: ['ID', 'Item'], rows: [{ ID: 'one', Item: 3 }] },
      initial: [makeSubscale('one', 'One item', ['Item'], [], 1, 5, false)],
    }));
    expectText(screen.getByTestId('score-one-one'), '3');
  });

  it('F: renders four no-reverse subscales without any confirmation controls', () => {
    render(React.createElement(CardHarness, {
      fixture: { headers: ['ID', 'A', 'B', 'C', 'D'], rows: [{ ID: 'row', A: 1, B: 2, C: 3, D: 4 }] },
      initial: ['A', 'B', 'C', 'D'].map((column, index) => makeSubscale(`s${index}`, `Scale ${index}`, [column], [], 0, 4, false)),
    }));
    expect(screen.queryAllByRole('button', { name: 'Confirm range' })).toHaveLength(0);
    expectText(screen.getByTestId('score-s0-row'), '1');
    expectText(screen.getByTestId('score-s3-row'), '4');
  });

  it('F: renders decimal continuous mode without a table or word controls', () => {
    render(React.createElement(CardHarness, {
      fixture: { headers: ['ID', 'Item'], rows: [{ ID: 'decimal', Item: 1.5 }, { ID: 'decimal-2', Item: 2.5 }] },
      initial: [makeSubscale('decimal', 'Decimal scale', ['Item'], [], 1, 3, false)],
    }));
    const scale = card('decimal');
    expect(within(scale).queryByRole('columnheader', { name: 'Answer' })).toBeNull();
    expect(within(scale).queryByRole('button', { name: 'Flip order' })).toBeNull();
    expectText(screen.getByTestId('score-decimal-decimal'), '1.5');
  });
});

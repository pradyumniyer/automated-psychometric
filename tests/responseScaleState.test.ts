import { describe, expect, it } from 'vitest';
import {
  afterScaleChange,
  chooseDecision,
  confirmRange,
  effectiveRange,
  migrateRangeState,
  seedDetectedRange,
  setTypedRange,
} from '../src/lib/responseScaleState';
import { buildTemplateDefinition } from '../src/lib/templates';
import { fromSurveyConfigRecord, migrateSurveyConfigRecord, toSurveyConfigRecord } from '../src/storage/viewAdapters';
import { buildAnswerTable, countReviewAnswers } from '../src/lib/responseScaleAnswers';

const base = { minValue: 1, maxValue: 5, baseMin: 1, baseMax: 5, rangeSource: 'detected' as const,
  confirmed: false, hasReverseItems: true, labelMap: [], outOfRangeDecisions: {} };

describe('response scale state transitions', () => {
  it('keeps independent widen decisions and derives the effective range from the base', () => {
    let state = chooseDecision(base, '7', { type: 'widen', value: 7 });
    state = chooseDecision(state, '8', { type: 'widen', value: 8 });
    expect(state).toMatchObject({ minValue: 1, maxValue: 8 });
    expect(effectiveRange(state.baseMin, state.baseMax, state.outOfRangeDecisions)).toEqual({ min: 1, max: 8 });
    state = chooseDecision(state, '8', { type: 'missing' });
    expect(state).toMatchObject({ maxValue: 7, outOfRangeDecisions: { '7': { action: 'widen', reviewed: true }, '8': { action: 'missing', reviewed: true } } });
  });

  it('typing a manual range replaces widened values and does not allow detection to overwrite it', () => {
    const widened = chooseDecision(base, '7', { type: 'widen', value: 7 });
    const typed = setTypedRange(widened, 1, 6);
    expect(typed).toMatchObject({ minValue: 1, maxValue: 6, baseMin: 1, baseMax: 6, rangeSource: 'manual', confirmed: false,
      outOfRangeDecisions: { '7': { action: 'missing', reviewed: true } } });
    expect(seedDetectedRange(typed, 0, 5)).toEqual(typed);
    const widenedManual = { ...base, minValue: 1, maxValue: 7, baseMin: 1, baseMax: 6, rangeSource: 'manual' as const,
      outOfRangeDecisions: { '7': { action: 'widen' as const, reviewed: true } } };
    expect(setTypedRange(widenedManual, 1, 6)).toMatchObject({ minValue: 1, maxValue: 6,
      outOfRangeDecisions: { '7': { action: 'missing', reviewed: true } } });
  });

  it('confirmation changes only confirmation and actual scale changes reset it', () => {
    const confirmed = confirmRange(base);
    expect(confirmed).toMatchObject({ ...base, confirmed: true });
    expect(afterScaleChange(confirmed, { minValue: 1, maxValue: 5 })).toEqual(confirmed);
    expect(afterScaleChange(confirmed, { minValue: 1, maxValue: 6 })).toMatchObject({ confirmed: false });
  });

  it('supports below-zero ranges and leaves confirmation intact when only marking a default reviewed', () => {
    const widened = chooseDecision({ ...base, baseMin: -1, minValue: -1, maxValue: 5, confirmed: true }, '-3', { type: 'widen', value: -3 });
    expect(widened).toMatchObject({ minValue: -3, maxValue: 5, confirmed: false });
    const reviewed = chooseDecision({ ...base, confirmed: true }, '7', { type: 'missing' });
    expect(reviewed).toMatchObject({ confirmed: true, outOfRangeDecisions: { '7': { action: 'missing', reviewed: true } } });
  });

  it('resets confirmation when an updated detected range changes', () => {
    const confirmed = { ...base, confirmed: true };
    expect(seedDetectedRange(confirmed, 0, 5)).toMatchObject({ baseMin: 0, minValue: 0, confirmed: false });
  });

  it('migrates legacy widen metadata into per-value reviewed decisions', () => {
    expect(migrateRangeState({ minValue: 1, maxValue: 7, confirmed: false,
      outOfRangeDecision: { action: 'widen', values: [7], cells: ['Q:1'], originalMin: 1, originalMax: 5 } }))
      .toMatchObject({ baseMin: 1, baseMax: 5, minValue: 1, maxValue: 7, rangeSource: 'detected',
        outOfRangeDecisions: { '7': { action: 'widen', reviewed: true } } });
  });

  it('round-trips the new range state through storage and a template', () => {
    const widened = chooseDecision(base, '7', { type: 'widen', value: 7 });
    const input = {
      datasetId: 'dataset', projectId: 'project', headers: ['Item'], demographicColumns: [],
      subscales: [{ ...widened, id: 'scale', name: 'Scale', items: [{ column: 'Item', order: 0, reverse: true }],
        scoringMethod: 'sum' as const, customFormula: '', scaleType: 'numeric' as const, displayOrder: 0 }],
      bands: {}, overallSettings: { enabled: false, basedOn: 'sums' as const, combineBy: 'sum' as const, customFormula: '' },
    };
    const saved = toSurveyConfigRecord(input);
    const restored = fromSurveyConfigRecord(migrateSurveyConfigRecord(saved));
    expect(restored.subscales[0]).toMatchObject({ minValue: 1, maxValue: 7, baseMin: 1, baseMax: 5,
      rangeSource: 'detected', outOfRangeDecisions: { '7': { action: 'widen', reviewed: true } } });
    const template = buildTemplateDefinition(input.subscales, {});
    expect(template.responseScales[0]).toMatchObject({ minValue: 1, maxValue: 7, baseMin: 1, baseMax: 5,
      rangeSource: 'detected', outOfRangeDecisions: { '7': { action: 'widen', reviewed: true } } });
  });

  it('checks every action sequence through length four for range, review, confirmation, and isolation invariants', () => {
    const actions = ['widen', 'missing', 'typed', 'clear', 'confirm', 'range', 'invalid', 'reverse', 'flip', 'zero'] as const;
    const starts = [
      { ...base, id: 'a1', minValue: 1, maxValue: 5, baseMin: 1, baseMax: 5, outOfRangeDecisions: {}, labelMap: [], value: 7 },
      { ...base, id: 'a2', minValue: 1, maxValue: 5, baseMin: 1, baseMax: 5, hasReverseItems: false, outOfRangeDecisions: {}, labelMap: [], value: 4 },
      { ...base, id: 'b1', minValue: 1, maxValue: 5, baseMin: 1, baseMax: 5, outOfRangeDecisions: {}, labelMap: [], value: 8 },
      { ...base, id: 'b2', minValue: 0, maxValue: 4, baseMin: 0, baseMax: 4, hasReverseItems: false, outOfRangeDecisions: {}, labelMap: [], value: 5 },
      { ...base, id: 'b3', minValue: 1, maxValue: 7, baseMin: 1, baseMax: 7, hasReverseItems: false, outOfRangeDecisions: {}, labelMap: [], value: 8 },
      { ...base, id: 'three', minValue: 1, maxValue: 5, baseMin: 1, baseMax: 5, outOfRangeDecisions: {}, labelMap: [], values: [-1, 7, 8], value: 7 },
      { ...base, id: 'two', minValue: 1, maxValue: 5, baseMin: 1, baseMax: 5, outOfRangeDecisions: {}, labelMap: [], values: [6, 7], value: 6 },
    ];
    const sequences: (typeof actions[number])[][] = [[]];
    for (let length = 1; length <= 4; length += 1) {
      const prior = sequences.filter((sequence) => sequence.length === length - 1);
      for (const sequence of prior) for (const action of actions) sequences.push([...sequence, action]);
    }
    for (const start of starts) for (const sequence of sequences) {
      let state = { ...start, outOfRangeDecisions: { ...start.outOfRangeDecisions }, labelMap: [...start.labelMap] };
      const other = { id: 'untouched', ...base };
      const otherBefore = structuredClone(other);
      for (const action of sequence) {
        const before = state;
        const beforeRange = { minValue: state.minValue, maxValue: state.maxValue, baseMin: state.baseMin, baseMax: state.baseMax, rangeSource: state.rangeSource, outOfRangeDecisions: structuredClone(state.outOfRangeDecisions), labelMap: structuredClone(state.labelMap) };
        if (action === 'widen') state = chooseDecision(state, String(start.value), { type: 'widen', value: start.value });
        else if (action === 'missing' || action === 'clear') state = chooseDecision(state, String(start.value), { type: 'missing' });
        else if (action === 'typed') state = chooseDecision(state, String(start.value), { type: 'typed', number: 2 });
        else if (action === 'confirm') state = confirmRange(state);
        else if (action === 'range') state = setTypedRange(state, state.baseMin!, state.baseMax! + 1);
        else if (action === 'invalid') state = setTypedRange(state, state.baseMin!, state.baseMin!);
        else if (action === 'reverse') state = afterScaleChange(state, { hasReverseItems: !state.hasReverseItems });
        else if (action === 'flip') state = afterScaleChange(state, { flipped: !state.flipped });
        else state = afterScaleChange(state, { startsAtZero: !state.startsAtZero });
        expect({ min: state.minValue, max: state.maxValue }).toEqual(effectiveRange(state.baseMin, state.baseMax, state.outOfRangeDecisions));
        expect(Boolean(state.hasReverseItems && state.confirmed !== true)).toBe(state.hasReverseItems === true && state.confirmed !== true);
        for (const decision of Object.values(state.outOfRangeDecisions ?? {})) expect(decision.reviewed).toBe(true);
        const answerRows = start.values ?? [start.value];
        const table = buildAnswerTable({ rows: answerRows.map((value) => ({ Item: value })), columns: ['Item'], min: state.minValue, max: state.maxValue, baseMin: state.baseMin, baseMax: state.baseMax, labels: state.labelMap ?? [], outOfRangeDecisions: state.outOfRangeDecisions });
        const expectedReviews = table.rows.filter((row) => row.kind === 'out_of_range' && state.outOfRangeDecisions?.[row.answer.replace(/ \(outside .+\)$/, '')]?.reviewed !== true && row.countsAs === null).length;
        expect(countReviewAnswers(table.rows)).toBe(expectedReviews);
        if (action === 'confirm') expect({ minValue: state.minValue, maxValue: state.maxValue, baseMin: state.baseMin, baseMax: state.baseMax, rangeSource: state.rangeSource, outOfRangeDecisions: state.outOfRangeDecisions, labelMap: state.labelMap }).toEqual(beforeRange);
        if (state.rangeSource === 'manual' || state.rangeSource === 'preset') expect(seedDetectedRange(state, -3, 9)).toEqual(state);
        expect(other).toEqual(otherBefore);
        if (action === 'invalid') expect(state).toEqual(before);
      }
    }
  }, 60000);
});

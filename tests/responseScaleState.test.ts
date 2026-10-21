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
});

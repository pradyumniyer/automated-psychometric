import { describe, expect, it } from 'vitest';
import { actionLabel, scoreReadiness, sourceWorkflowLocked } from '../src/lib/phaseA';
import type { Dataset } from '../src/types/domain';

function dataset(partial: Partial<Dataset>): Dataset {
  return {
    id: 'd1',
    project_id: 'p1',
    file_name: 'fixture.csv',
    sheet_name: 'Sheet1',
    headers: ['Q1'],
    rows: [],
    row_ids: [],
    row_count: 0,
    col_count: 1,
    created_at: '',
    ...partial,
  } as Dataset;
}

describe('phase A source lock and readiness', () => {
  it('locks a source that already has organized child sheets', () => {
    const locked = dataset({
      role: 'source',
      split_plan: {
        demoColumns: ['ID'],
        groups: [{ name: 'Scale 1', startIndex: 1, endIndex: 3, childDatasetId: 'child' }],
      },
    });
    expect(sourceWorkflowLocked(locked)).toBe(true);
    expect(sourceWorkflowLocked(dataset({ role: 'instrument' }))).toBe(false);
  });

  it('labels history events in plain language', () => {
    expect(actionLabel('reverse_toggle')).toBe('Reverse');
    expect(actionLabel('sheet_split')).toBe('Organize');
    expect(actionLabel('custom_thing')).toBe('custom thing');
  });

  it('reports score readiness without inventing a second blocker', () => {
    expect(scoreReadiness({
      sourceLocked: true, hasItems: true, pendingAnswerCount: 0, unconfirmedReverse: false,
    }).ready).toBe(false);
    expect(scoreReadiness({
      sourceLocked: false, hasItems: true, pendingAnswerCount: 2, unconfirmedReverse: false,
    }).text).toContain('2 answers');
    expect(scoreReadiness({
      sourceLocked: false, hasItems: true, pendingAnswerCount: 0, unconfirmedReverse: false,
    }).ready).toBe(true);
  });
});

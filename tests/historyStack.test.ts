import { describe, expect, it } from 'vitest';
import { redoTip, retireRedo, undoTip } from '../src/lib/historyStack';
import { describeExclusionChange, describeThresholdChange } from '../src/lib/historySlice';

describe('history undo and redo order', () => {
  const records = [
    { id: 'a', seq: 1, stack: 'undo' as const },
    { id: 'b', seq: 2, stack: 'undo' as const },
    { id: 'c', seq: 3, stack: 'undo' as const },
  ];

  it('undoes the newest action and redoes the last undone one', () => {
    expect(undoTip(records)?.id).toBe('c');
    const afterUndoC = records.map((record) => record.id === 'c' ? { ...record, stack: 'redo' as const } : record);
    expect(undoTip(afterUndoC)?.id).toBe('b');
    const afterUndoB = afterUndoC.map((record) => record.id === 'b' ? { ...record, stack: 'redo' as const } : record);
    expect(redoTip(afterUndoB)?.id).toBe('b');
    const afterRedoB = afterUndoB.map((record) => record.id === 'b' ? { ...record, stack: 'undo' as const } : record);
    expect(redoTip(afterRedoB)?.id).toBe('c');
  });

  it('drops redo when a new action is recorded', () => {
    const withRedo = records.map((record) => record.id === 'c' ? { ...record, stack: 'redo' as const } : record);
    expect(retireRedo(withRedo).some((record) => record.stack === 'redo')).toBe(false);
  });

  it('describes exclusions, inclusions, and data-quality edits', () => {
    expect(describeExclusionChange([], ['r2'], ['r1', 'r2'])).toBe('Excluded row 2');
    expect(describeExclusionChange(['r2'], [], ['r1', 'r2'])).toBe('Included row 2');
    expect(describeExclusionChange([], ['r1', 'r2'], ['r1', 'r2'])).toBe('Excluded 2 rows');
    expect(describeThresholdChange({ longstringMin: 6 }, { longstringMin: 8 })).toBe('Data quality: longstring 6 → 8');
  });
});

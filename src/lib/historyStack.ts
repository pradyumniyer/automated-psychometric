export type HistoryStack = 'undo' | 'redo' | 'audit';

export type StackRecord = {
  id: string;
  seq: number;
  stack: HistoryStack;
};

/** Newest undoable action. */
export function undoTip<T extends StackRecord>(records: T[]): T | null {
  return records
    .filter((record) => record.stack === 'undo')
    .sort((left, right) => right.seq - left.seq)[0] ?? null;
}

/** Last undone action, which is the one redo should reapply first. */
export function redoTip<T extends StackRecord>(records: T[]): T | null {
  return records
    .filter((record) => record.stack === 'redo')
    .sort((left, right) => left.seq - right.seq)[0] ?? null;
}

export function retireRedo<T extends StackRecord>(records: T[]): T[] {
  return records.map((record) => (
    record.stack === 'redo' ? { ...record, stack: 'audit' as const } : record
  ));
}

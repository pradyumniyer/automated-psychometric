import { historyRepository } from '@/storage/repositories';
import type { ActionHistory } from '@/types/domain';
import type { OutOfRangeActionLog } from '@/scientific/responseScales';
import { sameHistorySlice, type HistorySlice } from '@/lib/historySlice';

export async function logAction(
  projectId: string,
  actionType: string,
  description: string,
  payload: Record<string, unknown> = {},
  undoData: { rowId: string; wasExcluded?: boolean } | null = null,
  datasetId?: string,
): Promise<void> {
  await historyRepository.append({
    project_id: projectId,
    dataset_id: datasetId ?? null,
    action_type: actionType,
    description,
    payload,
    undo_data: undoData,
    stack: 'audit',
  });
}

export async function logUndoable(input: {
  projectId: string;
  datasetId: string;
  actionType: string;
  description: string;
  payload?: Record<string, unknown>;
  before: HistorySlice;
  after: HistorySlice;
}): Promise<void> {
  if (sameHistorySlice(input.before, input.after)) return;
  await historyRepository.append({
    project_id: input.projectId,
    dataset_id: input.datasetId,
    action_type: input.actionType,
    description: input.description,
    payload: input.payload ?? {},
    undo_data: { kind: 'snapshot', before: input.before, after: input.after },
    stack: 'undo',
  });
}

export async function logOutOfRangeAction(
  projectId: string,
  datasetId: string,
  log: OutOfRangeActionLog,
): Promise<void> {
  await logAction(
    projectId,
    'response_scale_out_of_range',
    `${log.action === 'widen' ? 'Widen range' : 'Treat as missing'} for ${log.count} out-of-range response${log.count === 1 ? '' : 's'}`,
    { action: log.action, count: log.count, values: [...log.values] },
    null,
    datasetId,
  );
}

export async function fetchHistory(datasetId: string): Promise<ActionHistory[]> {
  return historyRepository.list(datasetId);
}

export async function deleteAction(id: string): Promise<void> {
  await historyRepository.delete(id);
}

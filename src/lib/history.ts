import { historyRepository } from '@/storage/repositories';
import type { ActionHistory } from '@/types/domain';

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
  });
}

export async function fetchHistory(datasetId: string): Promise<ActionHistory[]> {
  return historyRepository.list(datasetId);
}

export async function deleteAction(id: string): Promise<void> {
  await historyRepository.delete(id);
}

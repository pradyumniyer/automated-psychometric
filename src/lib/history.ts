// Action history logging — records every action for audit trail and per-action undo.
import { supabase, ActionHistory } from './supabase';

export async function logAction(
  projectId: string,
  actionType: string,
  description: string,
  payload: Record<string, unknown> = {},
  undoData: Record<string, unknown> | null = null,
  datasetId?: string,
): Promise<void> {
  await supabase.from('action_history').insert({
    project_id: projectId,
    dataset_id: datasetId || null,
    action_type: actionType,
    description,
    payload,
    undo_data: undoData,
  });
}

export async function fetchHistory(datasetId: string): Promise<ActionHistory[]> {
  const { data, error } = await supabase
    .from('action_history')
    .select('*')
    .eq('dataset_id', datasetId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []) as ActionHistory[];
}

export async function deleteAction(id: string): Promise<void> {
  await supabase.from('action_history').delete().eq('id', id);
}

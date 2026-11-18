import { isSourceAlreadySplit } from '@/lib/sheetHierarchy';
import type { Dataset } from '@/types/domain';

/** Organized master sheets are reference-only until the split is removed. */
export function sourceWorkflowLocked(dataset: Dataset | null | undefined): boolean {
  return isSourceAlreadySplit(dataset);
}

const ACTION_LABELS: Record<string, string> = {
  import: 'Import',
  demographic_toggle: 'Demographics',
  demographic_bulk: 'Demographics',
  sheet_delete: 'Sheet',
  sheet_split: 'Organize',
  sheet_unsplit: 'Organize',
  subscale_create: 'Subscales',
  subscale_delete: 'Subscales',
  reverse_toggle: 'Reverse',
  range_confirm: 'Response scale',
  response_scale_out_of_range: 'Response scale',
  proration: 'Proration',
  row_exclude_toggle: 'Exclusion',
  config_change: 'Setup',
  dq_thresholds: 'Data quality',
  export: 'Export',
  scoring: 'Score',
  template_save: 'Template',
  template_update: 'Template',
  template_apply: 'Template',
  undo: 'Undo',
  redo: 'Redo',
};

export function actionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] ?? actionType.replaceAll('_', ' ');
}

export function scoreReadiness(input: {
  sourceLocked: boolean;
  hasItems: boolean;
  pendingAnswerCount: number;
  unconfirmedReverse: boolean;
}): { ready: boolean; text: string } {
  if (input.sourceLocked) {
    return {
      ready: false,
      text: 'This is a source sheet. Scoring runs on the organized sheets, not here.',
    };
  }
  if (!input.hasItems) {
    return { ready: false, text: 'Add items to a scale before scoring.' };
  }
  if (input.pendingAnswerCount > 0) {
    const n = input.pendingAnswerCount;
    return {
      ready: false,
      text: `${n} answer${n === 1 ? '' : 's'} still need a number or Not scored.`,
    };
  }
  if (input.unconfirmedReverse) {
    return {
      ready: false,
      text: 'Confirm the response range on scales that use reverse scoring.',
    };
  }
  return {
    ready: true,
    text: 'Ready to score. Original answers stay unchanged; scores are added as new columns.',
  };
}

import type { QualityThresholds } from '../scientific/dataQuality';
import { exclusionRepository, surveyConfigRepository } from '../storage/repositories';
import { historySlice, sameHistorySlice, type HistorySlice } from './historySlice';

export async function saveDataQualityThresholds(
  datasetId: string,
  thresholds: QualityThresholds,
): Promise<{ before: HistorySlice; after: HistorySlice; beforeThresholds: Record<string, number>; afterThresholds: Record<string, number> } | null> {
  const config = await surveyConfigRepository.get(datasetId);
  if (!config) throw new Error(`Configuration for dataset "${datasetId}" was not found.`);
  const nextThresholds = { ...thresholds };
  if (JSON.stringify(config.dq_thresholds) === JSON.stringify(nextThresholds)) return null;
  const excludedRowIds = (await exclusionRepository.get(datasetId))?.excluded_row_ids ?? [];
  const before = historySlice(config, excludedRowIds);
  const saved = await surveyConfigRepository.save(datasetId, {
    ...config,
    dq_thresholds: nextThresholds,
  });
  const after = historySlice(saved, excludedRowIds);
  if (sameHistorySlice(before, after)) return null;
  return {
    before,
    after,
    beforeThresholds: { ...config.dq_thresholds },
    afterThresholds: nextThresholds,
  };
}

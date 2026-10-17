import type { QualityThresholds } from '../scientific/dataQuality';
import { surveyConfigRepository } from '../storage/repositories';

export async function saveDataQualityThresholds(
  datasetId: string,
  thresholds: QualityThresholds,
): Promise<void> {
  const config = await surveyConfigRepository.get(datasetId);
  if (!config) throw new Error(`Configuration for dataset "${datasetId}" was not found.`);
  await surveyConfigRepository.save(datasetId, {
    ...config,
    dq_thresholds: { ...thresholds },
  });
}

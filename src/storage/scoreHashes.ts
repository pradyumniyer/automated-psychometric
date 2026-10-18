import { buildAutoScale, normalizeResponseMatrix, type SubscaleConfig } from '../scientific/scoring';
import type { Dataset } from '../types/domain';
import type { ScoreResultRecord, SurveyConfigRecord } from './schema';

export const SCIENTIFIC_SPEC_VERSION = 'scientific-spec-v3';

export function buildSubscaleConfigs(
  config: SurveyConfigRecord,
  dataset?: Pick<Dataset, 'headers' | 'rows'>,
): SubscaleConfig[] {
  const automatic = config.subscales.length === 0 && dataset
    ? buildAutoScale(
        dataset.headers,
        config.demographic_columns.map((column) => column.column_name),
        dataset.rows,
        config.id_columns,
      )
    : null;
  if (automatic) {
    return [automatic];
  }
  const scales = config.subscales.length > 0
    ? config.subscales
    : config.overall_scale ? [config.overall_scale] : [];
  return scales.map((subscale) => ({
    id: subscale.id,
    name: subscale.name,
    items: subscale.items,
    scoringMethod: subscale.scoring_method,
    showOutputs: subscale.score_outputs,
    customFormula: subscale.custom_formula,
    responseScale: {
      scaleType: subscale.response_scale?.scale_type ?? 'numeric',
      minValue: subscale.response_scale?.min_value ?? undefined,
      maxValue: subscale.response_scale?.max_value ?? undefined,
      labelMap: subscale.response_scale?.label_map ?? [],
      allowedNonresponse: config.allowed_nonresponse,
      confirmed: subscale.response_scale?.confirmed,
    },
  }));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createScoreHashes(
  dataset: Dataset,
  config: SurveyConfigRecord,
  subscales: SubscaleConfig[],
  excludedRowIds: Iterable<string>,
): Promise<Pick<ScoreResultRecord, 'dataset_hash' | 'config_hash' | 'spec_version'>> {
  const normalizedMatrix = normalizeResponseMatrix(
    dataset.rows,
    subscales,
    config.allowed_nonresponse,
  );
  const datasetHash = await sha256({
    rowIds: dataset.row_ids,
    headers: dataset.headers,
    normalizedMatrix,
  });
  // Data Quality thresholds and config timestamps do not change scoring results.
  const configHash = await sha256({
    config: { ...config, dq_thresholds: {}, updated_at: 0 },
    excludedRowIds: [...new Set(excludedRowIds)].sort(),
  });
  return {
    dataset_hash: datasetHash,
    config_hash: configHash,
    spec_version: SCIENTIFIC_SPEC_VERSION,
  };
}

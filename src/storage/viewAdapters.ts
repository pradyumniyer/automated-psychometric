import type {
  DemographicColumn,
  InterpretationBand,
  ResponseScale,
  SubscaleGroup,
  SubscaleItem,
} from '@/types/domain';
import type { SurveyConfigRecord } from './schema';

export interface ScreenSubscaleState {
  id: string;
  name: string;
  items: SubscaleItem[];
  scoringMethod: 'sum' | 'mean' | 'custom';
  customFormula: string;
  scaleType: 'numeric' | 'categorical';
  minValue: number | null;
  maxValue: number | null;
  labelMap: { label: string; value: number }[];
  displayOrder: number;
}

export interface ScreenSurveyConfig {
  datasetId: string;
  projectId: string;
  headers: string[];
  demographicColumns: DemographicColumn[];
  subscales: ScreenSubscaleState[];
  bands: Record<string, { name: string; minScore: number; maxScore: number; color: string }[]>;
  overallScale: ScreenSubscaleState | null;
  linkedTemplateId?: string | null;
}

function toStoredBand(
  band: ScreenSurveyConfig['bands'][string][number],
  projectId: string,
  datasetId: string,
  subscaleId: string,
  order: number,
): InterpretationBand {
  return {
    id: crypto.randomUUID(),
    project_id: projectId,
    dataset_id: datasetId,
    subscale_id: subscaleId,
    name: band.name,
    min_score: band.minScore,
    max_score: band.maxScore,
    color: band.color,
    display_order: order,
    created_at: new Date().toISOString(),
  };
}

function toStoredSubscale(
  state: ScreenSubscaleState,
  input: ScreenSurveyConfig,
  existing?: SubscaleGroup & { response_scale?: ResponseScale; bands?: InterpretationBand[] },
) {
  const now = new Date().toISOString();
  const responseScale: ResponseScale = {
    id: existing?.response_scale?.id ?? crypto.randomUUID(),
    project_id: input.projectId,
    dataset_id: input.datasetId,
    subscale_id: state.id,
    scale_type: state.scaleType,
    min_value: state.minValue,
    max_value: state.maxValue,
    label_map: state.labelMap,
    created_at: existing?.response_scale?.created_at ?? now,
  };
  const bands = (input.bands[state.name] ?? []).map((band, index) => {
    const oldBand = existing?.bands?.[index];
    return {
      ...toStoredBand(band, input.projectId, input.datasetId, state.id, index),
      id: oldBand?.id ?? crypto.randomUUID(),
      created_at: oldBand?.created_at ?? now,
    };
  });
  return {
    id: state.id,
    project_id: input.projectId,
    dataset_id: input.datasetId,
    name: state.name,
    description: existing?.description ?? '',
    items: state.items,
    scoring_method: state.scoringMethod,
    custom_formula: state.scoringMethod === 'custom' ? state.customFormula ?? null : null,
    display_order: state.displayOrder,
    created_at: existing?.created_at ?? now,
    response_scale: responseScale,
    bands,
  };
}

export function toSurveyConfigRecord(
  input: ScreenSurveyConfig,
  existing?: SurveyConfigRecord | null,
): SurveyConfigRecord {
  const byId = new Map((existing?.subscales ?? []).map((subscale) => [subscale.id, subscale]));
  const subscales = input.subscales.map((subscale) =>
    toStoredSubscale(subscale, input, byId.get(subscale.id)),
  );
  const overallScale = input.overallScale
    ? toStoredSubscale(input.overallScale, input)
    : existing?.overall_scale;
  const bands = subscales.flatMap((subscale) => subscale.bands ?? []);
  if (overallScale?.bands) bands.push(...overallScale.bands);
  const responseScaleSource = overallScale?.response_scale;
  const previous = existing?.response_scale;

  return {
    dataset_id: input.datasetId,
    id_columns: existing?.id_columns ?? [],
    demographic_columns: input.demographicColumns,
    item_columns: input.headers.filter((header) =>
      !input.demographicColumns.some((column) => column.column_name === header),
    ),
    response_scale: responseScaleSource
      ? {
          type: responseScaleSource.scale_type,
          min: responseScaleSource.min_value ?? undefined,
          max: responseScaleSource.max_value ?? undefined,
          label_map: responseScaleSource.label_map,
        }
      : previous ?? { type: 'numeric' },
    subscales,
    overall_scale: overallScale,
    bands,
    allowed_nonresponse: existing?.allowed_nonresponse ?? [],
    proration_enabled: existing?.proration_enabled ?? false,
    proration_max_missing_pct: existing?.proration_max_missing_pct ?? 20,
    dq_thresholds: existing?.dq_thresholds ?? {},
    linked_template_id: input.linkedTemplateId === undefined
      ? existing?.linked_template_id ?? null
      : input.linkedTemplateId,
    updated_at: Date.now(),
  };
}

export function fromSurveyConfigRecord(config: SurveyConfigRecord): {
  demographicColumns: DemographicColumn[];
  subscales: ScreenSubscaleState[];
  bands: ScreenSurveyConfig['bands'];
  overallScale: ScreenSubscaleState | null;
  responseScales: ResponseScale[];
} {
  const toState = (subscale: NonNullable<SurveyConfigRecord['overall_scale']>): ScreenSubscaleState => ({
    id: subscale.id,
    name: subscale.name,
    items: subscale.items,
    scoringMethod: subscale.scoring_method,
    customFormula: subscale.custom_formula ?? '',
    scaleType: subscale.response_scale?.scale_type ?? 'numeric',
    minValue: subscale.response_scale?.min_value ?? null,
    maxValue: subscale.response_scale?.max_value ?? null,
    labelMap: subscale.response_scale?.label_map ?? [],
    displayOrder: subscale.display_order,
  });
  const bands: ScreenSurveyConfig['bands'] = {};
  for (const subscale of [...config.subscales, ...(config.overall_scale ? [config.overall_scale] : [])]) {
    if (subscale.bands?.length) {
      bands[subscale.name] = subscale.bands.map((band) => ({
        name: band.name,
        minScore: band.min_score,
        maxScore: band.max_score,
        color: band.color,
      }));
    }
  }
  const subscales = config.subscales.map(toState);
  return {
    demographicColumns: config.demographic_columns,
    subscales,
    bands,
    overallScale: config.overall_scale ? toState(config.overall_scale) : null,
    responseScales: config.subscales.flatMap((subscale) =>
      subscale.response_scale ? [subscale.response_scale] : [],
    ),
  };
}

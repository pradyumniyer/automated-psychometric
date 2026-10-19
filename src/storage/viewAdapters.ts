import type {
  DemographicColumn,
  InterpretationBand,
  ResponseScale,
  ScoreOutput,
  SubscaleGroup,
  SubscaleItem,
} from '@/types/domain';
import type { SurveyConfigRecord } from './schema';
import { shownScoreOutputs } from '../lib/scoreOutputs';
import { buildAutoScale } from '../scientific/scoring';

export interface ScreenSubscaleState {
  id: string;
  name: string;
  items: SubscaleItem[];
  scoringMethod: 'sum' | 'mean' | 'custom';
  showOutputs?: ScoreOutput[];
  customFormula: string;
  scaleType: 'numeric' | 'categorical';
  minValue: number | null;
  maxValue: number | null;
  labelMap: { label: string; value: number }[];
  confirmed?: boolean;
  outOfRange?: 'missing' | 'widen';
  outOfRangeDecision?: { action: 'missing' | 'widen'; cells: string[]; values: number[] };
  displayOrder: number;
}

export interface ScreenSurveyConfig {
  datasetId: string;
  projectId: string;
  headers: string[];
  demographicColumns: DemographicColumn[];
  subscales: ScreenSubscaleState[];
  bands: Record<string, { name: string; minScore: number; maxScore: number; color: string }[]>;
  bandsByOutput?: Record<string, Partial<Record<ScoreOutput, { name: string; minScore: number; maxScore: number; color: string }[]>>>;
  overallScale: ScreenSubscaleState | null;
  overallSettings?: {
    enabled: boolean;
    basedOn: 'sums' | 'means' | 'custom';
    combineBy: 'sum' | 'mean' | 'custom';
    customFormula: string;
  };
  linkedTemplateId?: string | null;
}

function toStoredBand(
  band: ScreenSurveyConfig['bands'][string][number],
  projectId: string,
  datasetId: string,
  subscaleId: string,
  order: number,
  output?: ScoreOutput,
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
    ...(output ? { score_output: output } : {}),
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
    confirmed: state.confirmed ?? true,
    out_of_range: state.outOfRange ?? existing?.response_scale?.out_of_range ?? 'missing',
    out_of_range_decision: state.outOfRangeDecision ?? existing?.response_scale?.out_of_range_decision,
    created_at: existing?.response_scale?.created_at ?? now,
  };
  const outputs = shownScoreOutputs(state.showOutputs, state.scoringMethod);
  const bandsByOutput = input.bandsByOutput?.[state.name];
  const bandEntries = bandsByOutput
    ? Object.entries(bandsByOutput) as [ScoreOutput, NonNullable<typeof bandsByOutput[ScoreOutput]>][]
    : input.bands[state.name]?.length
      ? [[outputs[0], input.bands[state.name]] as const]
      : [];
  const bands = bandEntries.flatMap(([output, outputBands]) =>
    (outputBands ?? []).map((band, index) => {
      const oldBand = existing?.bands?.filter((candidate) =>
        candidate.score_output === output
        || (!candidate.score_output && output === existing.scoring_method),
      )[index];
      return {
        ...toStoredBand(band, input.projectId, input.datasetId, state.id, index, output),
        id: oldBand?.id ?? crypto.randomUUID(),
        created_at: oldBand?.created_at ?? now,
      };
    }),
  );
  return {
    id: state.id,
    project_id: input.projectId,
    dataset_id: input.datasetId,
    name: state.name,
    description: existing?.description ?? '',
    items: state.items,
    scoring_method: state.scoringMethod,
    score_outputs: [...outputs],
    custom_formula: state.customFormula || null,
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
    overall_settings: input.overallSettings
      ? {
          enabled: input.overallSettings.enabled,
          based_on: input.overallSettings.basedOn,
          combine_by: input.overallSettings.combineBy,
          custom_formula: input.overallSettings.customFormula || null,
        }
      : existing?.overall_settings ?? {
          enabled: input.subscales.length >= 2,
          based_on: input.subscales.length > 0 && input.subscales.every((subscale) => subscale.scoringMethod === 'mean') ? 'means' : 'sums',
          combine_by: input.subscales.length > 0 && input.subscales.every((subscale) => subscale.scoringMethod === 'mean') ? 'mean' : 'sum',
          custom_formula: null,
        },
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

export function migrateSurveyConfigRecord(config: SurveyConfigRecord): SurveyConfigRecord {
  const migrateScale = (scale: ResponseScale | undefined): ResponseScale | undefined =>
    scale ? { ...scale, confirmed: scale.confirmed ?? true } : undefined;
  return {
    ...config,
    response_scale: { ...config.response_scale, confirmed: config.response_scale.confirmed ?? true },
    subscales: config.subscales.map((subscale) => ({
      ...subscale,
      response_scale: migrateScale(subscale.response_scale),
    })),
    overall_scale: config.overall_scale
      ? { ...config.overall_scale, response_scale: migrateScale(config.overall_scale.response_scale) }
      : undefined,
  };
}

export function fromSurveyConfigRecord(
  config: SurveyConfigRecord,
  dataset?: { headers: string[]; rows: Record<string, unknown>[]; idColumns?: string[] },
): {
  demographicColumns: DemographicColumn[];
  subscales: ScreenSubscaleState[];
  bands: ScreenSurveyConfig['bands'];
  bandsByOutput: NonNullable<ScreenSurveyConfig['bandsByOutput']>;
  overallScale: ScreenSubscaleState | null;
  overallSettings: NonNullable<ScreenSurveyConfig['overallSettings']>;
  responseScales: ResponseScale[];
} {
  const toState = (subscale: NonNullable<SurveyConfigRecord['overall_scale']>): ScreenSubscaleState => ({
    id: subscale.id,
    name: subscale.name,
    items: subscale.items,
    scoringMethod: subscale.scoring_method,
    showOutputs: subscale.score_outputs?.length
      ? [...subscale.score_outputs]
      : [subscale.scoring_method],
    customFormula: subscale.custom_formula ?? '',
    scaleType: subscale.response_scale?.scale_type ?? 'numeric',
    minValue: subscale.response_scale?.min_value ?? null,
    maxValue: subscale.response_scale?.max_value ?? null,
    labelMap: subscale.response_scale?.label_map ?? [],
    confirmed: subscale.response_scale?.confirmed ?? true,
    outOfRange: subscale.response_scale?.out_of_range ?? 'missing',
    outOfRangeDecision: subscale.response_scale?.out_of_range_decision,
    displayOrder: subscale.display_order,
  });
  const bands: ScreenSurveyConfig['bands'] = {};
  const bandsByOutput: NonNullable<ScreenSurveyConfig['bandsByOutput']> = {};
  for (const subscale of config.subscales) {
    const firstOutput = subscale.score_outputs?.[0] ?? subscale.scoring_method;
    for (const band of subscale.bands ?? []) {
      const output = band.score_output ?? firstOutput;
      const outputBands = bandsByOutput[subscale.name] ?? {};
      outputBands[output] ??= [];
      outputBands[output]!.push({
        name: band.name,
        minScore: band.min_score,
        maxScore: band.max_score,
        color: band.color,
      });
      bandsByOutput[subscale.name] = outputBands;
    }
    const firstBands = bandsByOutput[subscale.name]?.[firstOutput];
    if (firstBands?.length) bands[subscale.name] = firstBands;
  }
  if (config.overall_scale?.bands?.length) {
    bands[config.overall_scale.name] = config.overall_scale.bands.map((band) => ({
      name: band.name,
      minScore: band.min_score,
      maxScore: band.max_score,
      color: band.color,
    }));
  }
  const automatic = config.subscales.length === 0 && dataset
    ? buildAutoScale(
        dataset.headers,
        config.demographic_columns.map((column) => column.column_name),
        dataset.rows,
        dataset.idColumns ?? config.id_columns,
      )
    : null;
  const configuredSubscales = automatic
    ? [{
        id: automatic.id,
        project_id: config.demographic_columns[0]?.project_id ?? '',
        dataset_id: config.dataset_id,
        name: automatic.name,
        description: '',
        items: automatic.items,
        scoring_method: automatic.scoringMethod,
        score_outputs: ['sum'] as ScoreOutput[],
        custom_formula: null,
        display_order: 0,
        created_at: new Date(0).toISOString(),
        response_scale: {
          id: 'auto-overall-response',
          project_id: config.demographic_columns[0]?.project_id ?? '',
          dataset_id: config.dataset_id,
          subscale_id: automatic.id,
          scale_type: automatic.responseScale.scaleType,
          min_value: automatic.responseScale.minValue ?? null,
          max_value: automatic.responseScale.maxValue ?? null,
          label_map: automatic.responseScale.labelMap ?? [],
          confirmed: false,
          created_at: new Date(0).toISOString(),
        },
        bands: [],
      } as NonNullable<SurveyConfigRecord['overall_scale']>]
    : config.subscales;
  const subscales = configuredSubscales.map(toState);
  return {
    demographicColumns: config.demographic_columns,
    subscales,
    bands,
    bandsByOutput,
    overallScale: config.overall_scale ? toState(config.overall_scale) : null,
    overallSettings: {
      enabled: config.overall_settings?.enabled ?? config.subscales.length >= 2,
      basedOn: config.overall_settings?.based_on
        ?? (config.subscales.length > 0 && config.subscales.every((subscale) => subscale.scoring_method === 'mean') ? 'means' : 'sums'),
      combineBy: config.overall_settings?.combine_by
        ?? (config.subscales.length > 0 && config.subscales.every((subscale) => subscale.scoring_method === 'mean') ? 'mean' : 'sum'),
      customFormula: config.overall_settings?.custom_formula ?? '',
    },
    responseScales: configuredSubscales.flatMap((subscale) =>
      subscale.response_scale ? [subscale.response_scale] : [],
    ),
  };
}

export function ensureAutomaticSubscale(
  config: SurveyConfigRecord,
  dataset: { headers: string[]; rows: Record<string, unknown>[] },
): SurveyConfigRecord {
  if (config.subscales.length > 0) return config;
  const adapted = fromSurveyConfigRecord(config, {
    headers: dataset.headers,
    rows: dataset.rows,
    idColumns: config.id_columns,
  });
  return toSurveyConfigRecord({
    datasetId: config.dataset_id,
    projectId: config.demographic_columns[0]?.project_id ?? '',
    headers: dataset.headers,
    demographicColumns: adapted.demographicColumns,
    subscales: adapted.subscales,
    bands: adapted.bands,
    bandsByOutput: adapted.bandsByOutput,
    overallScale: null,
    overallSettings: adapted.overallSettings,
    linkedTemplateId: config.linked_template_id,
  }, config);
}

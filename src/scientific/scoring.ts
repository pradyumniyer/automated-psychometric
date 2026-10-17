// Scoring engine — shared value normalization, reverse coding, scale scores, and Overall.

export interface SubscaleItemConfig { column: string; order: number; reverse: boolean; }
export interface ResponseScaleConfig {
  scaleType: 'numeric' | 'categorical';
  minValue?: number; maxValue?: number;
  labelMap?: { label: string; value: number }[];
  allowedNonresponse?: string[];
}
export interface SubscaleConfig {
  id: string; name: string; items: SubscaleItemConfig[];
  scoringMethod: 'sum' | 'mean' | 'custom'; customFormula?: string | null;
  showOutputs?: ScoreOutput[];
  responseScale: ResponseScaleConfig;
}
export interface BandConfig { name: string; minScore: number; maxScore: number; color: string; }
import { evaluateFormula } from './formula';
import {
  interpretationColumnKey,
  scoreColumnKey,
  shownScoreOutputs,
  uniqueSubscaleNames,
} from '../lib/scoreOutputs';
import { classifyScore, getOutputRange } from './bandValidation';
import type { ScoreOutput } from '@/types/domain';

export type ItemValueState = 'valid' | 'blank' | 'allowed' | 'out_of_range';

export interface NormalizedMatrix {
  values: Record<string, number | null>[];
  states: Record<string, ItemValueState>[];
}

export interface ScaleScoreDetail {
  sum: number | null;
  mean: number | null;
  score: number | null;
  missingItems: number;
  observedItems: number;
  prorated: boolean;
}

export interface ScoringOptions {
  rowIds?: string[];
  allowedNonresponse?: string[];
  proration?: { enabled?: boolean; maxMissingPercent?: number };
  outputs?: Record<string, { sum?: boolean; mean?: boolean }>;
  bandsByOutput?: Record<string, Partial<Record<ScoreOutput, BandConfig[]>>>;
  legacyScoreColumnIds?: string[];
  overall?: {
    enabled?: boolean;
    source?: 'subscales' | 'items';
    method?: 'sum' | 'mean';
    flippedSubscaleIds?: string[];
    includedSubscaleIds?: string[];
  };
}

export interface ScoringResult {
  headers: string[];
  rows: Record<string, number | string | null>[];
  subscaleScores: Record<string, (number | null)[]>;
  scaleScores: Record<string, Record<string, ScaleScoreDetail>>;
  interpretationLabels: Record<string, (string | null)[]>;
  overallScaleScore?: (number | null)[];
  rowIds: string[];
  normalizedMatrix: NormalizedMatrix;
  excludedRowIndices: number[];
  configSnapshot: { subscales: SubscaleConfig[]; bands: Record<string, BandConfig[]> };
}

export interface ScaleRange { min: number; max: number; }

export function responseScaleRange(scale: ResponseScaleConfig): ScaleRange {
  if (scale.scaleType === 'numeric'
    && Number.isFinite(scale.minValue)
    && Number.isFinite(scale.maxValue)
    && scale.minValue! <= scale.maxValue!) {
    return { min: scale.minValue!, max: scale.maxValue! };
  }
  if (scale.labelMap?.length) {
    const values = scale.labelMap.map((entry) => entry.value);
    if (values.every(Number.isFinite)) {
      return { min: Math.min(...values), max: Math.max(...values) };
    }
  }
  throw new Error('Set the response scale min/max before scoring.');
}

function scaleSignature(scale: ResponseScaleConfig): string {
  return JSON.stringify({
    scaleType: scale.scaleType,
    range: responseScaleRange(scale),
    labels: scale.labelMap?.map(({ label, value }) => [label.trim().toLowerCase(), value]).sort(),
    allowed: scale.allowedNonresponse?.map((value) => value.trim().toLowerCase()).sort(),
  });
}

function parseNumericString(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapValue(
  raw: unknown,
  scale: ResponseScaleConfig,
  range: ScaleRange,
  allowedNonresponse: Set<string>,
): { value: number | null; state: ItemValueState } {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
    return { value: null, state: 'blank' };
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return { value: null, state: 'blank' };
  }

  const text = String(raw).trim();
  if (allowedNonresponse.has(text.toLowerCase())) return { value: null, state: 'allowed' };

  let value: number | null = null;
  if (scale.scaleType === 'categorical' && scale.labelMap) {
    const entry = scale.labelMap.find((candidate) => candidate.label.trim().toLowerCase() === text.toLowerCase());
    if (entry) value = entry.value;
  }
  if (value === null) {
    value = typeof raw === 'number' && Number.isFinite(raw)
      ? raw
      : typeof raw === 'string'
        ? parseNumericString(raw)
        : null;
  }
  if (value === null) return { value: null, state: 'blank' };
  if (value < range.min || value > range.max) return { value: null, state: 'out_of_range' };
  return { value, state: 'valid' };
}

export function normalizeResponseMatrix(
  rawRows: Record<string, unknown>[],
  subscales: SubscaleConfig[],
  allowedNonresponse: string[] = [],
): NormalizedMatrix {
  const columnScales = new Map<string, ResponseScaleConfig>();
  for (const subscale of subscales) {
    const signature = scaleSignature(subscale.responseScale);
    for (const item of subscale.items) {
      const existing = columnScales.get(item.column);
      if (existing && scaleSignature(existing) !== signature) {
        throw new Error(`Conflicting response scales configured for item "${item.column}".`);
      }
      columnScales.set(item.column, subscale.responseScale);
    }
  }

  const ranges = new Map<string, ScaleRange>();
  const allowedByColumn = new Map<string, Set<string>>();
  for (const [column, scale] of columnScales) {
    ranges.set(column, responseScaleRange(scale));
    allowedByColumn.set(
      column,
      new Set([...allowedNonresponse, ...(scale.allowedNonresponse || [])].map((value) => value.trim().toLowerCase())),
    );
  }

  const values: Record<string, number | null>[] = [];
  const states: Record<string, ItemValueState>[] = [];
  for (const row of rawRows) {
    const valueRow: Record<string, number | null> = {};
    const stateRow: Record<string, ItemValueState> = {};
    for (const [column, scale] of columnScales) {
      const mapped = mapValue(row[column], scale, ranges.get(column)!, allowedByColumn.get(column)!);
      valueRow[column] = mapped.value;
      stateRow[column] = mapped.state;
    }
    values.push(valueRow);
    states.push(stateRow);
  }
  return { values, states };
}

function reverseValue(value: number, range: ScaleRange): number {
  return range.min + range.max - value;
}

function deriveRowIds(rawRows: Record<string, unknown>[], suppliedIds?: string[]): string[] {
  const ids = suppliedIds ?? rawRows.map((row, index) => {
    const id = row.ID;
    const text = typeof id === 'string' || typeof id === 'number' ? String(id) : '';
    return text.trim() ? text : `row-${index}`;
  });
  if (ids.length !== rawRows.length || ids.some((id) => !id.trim())) {
    throw new Error('Scoring row IDs must be non-empty and match the number of rows.');
  }
  if (new Set(ids).size !== ids.length) throw new Error('Scoring row IDs must be unique.');
  return [...ids];
}

function scoreValues(values: (number | null)[], method: SubscaleConfig['scoringMethod'], options: ScoringOptions): ScaleScoreDetail {
  const observed = values.filter((value): value is number => value !== null);
  const missingItems = values.length - observed.length;
  const observedItems = observed.length;
  const total = observed.reduce((sum, value) => sum + value, 0);
  if (values.length === 0) {
    return { sum: null, mean: null, score: null, missingItems: 0, observedItems: 0, prorated: false };
  }
  let sum: number | null = null;
  let mean: number | null = null;
  let prorated = false;
  const threshold = options.proration?.maxMissingPercent ?? 20;
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
    throw new Error('Proration threshold must be an integer from 0 to 100.');
  }

  if (missingItems === 0) {
    mean = total / values.length;
    sum = total;
  } else if (
    options.proration?.enabled === true
    && method !== 'custom'
    && observedItems >= 1
    && missingItems * 100 <= threshold * values.length
  ) {
    mean = total / observedItems;
    sum = mean * values.length;
    prorated = true;
  }

  const score = method === 'mean' ? mean : method === 'sum' ? sum : null;
  return { sum, mean, score, missingItems, observedItems, prorated };
}

function outputScores(
  row: Record<string, number | string | null>,
  subscale: SubscaleConfig,
  groupName: string,
  shownOutputs: ScoreOutput[],
  scores: Record<ScoreOutput, number | null>,
): void {
  for (const output of shownOutputs) {
    row[scoreColumnKey(groupName, output)] = scores[output];
  }
}

export function scoreDataset(
  rawRows: Record<string, unknown>[],
  rawHeaders: string[],
  subscales: SubscaleConfig[],
  bands: Record<string, BandConfig[]>,
  excludedRowIndices: number[] = [],
  options: ScoringOptions = {},
): ScoringResult {
  if (new Set(subscales.map((subscale) => subscale.id)).size !== subscales.length) {
    throw new Error('Subscale IDs must be unique for scoring.');
  }
  const prorationThreshold = options.proration?.maxMissingPercent ?? 20;
  if (!Number.isInteger(prorationThreshold) || prorationThreshold < 0 || prorationThreshold > 100) {
    throw new Error('Proration threshold must be an integer from 0 to 100.');
  }
  const normalizedMatrix = normalizeResponseMatrix(rawRows, subscales, options.allowedNonresponse);
  const rowIds = deriveRowIds(rawRows, options.rowIds);
  const ranges = new Map(subscales.map((subscale) => [subscale.id, responseScaleRange(subscale.responseScale)]));
  const excludedSet = new Set(excludedRowIndices);
  const headers = [...rawHeaders];
  const groupNames = uniqueSubscaleNames(subscales.map((subscale) => subscale.name), rawHeaders);
  const subscaleScores: Record<string, (number | null)[]> = {};
  const scaleScores: Record<string, Record<string, ScaleScoreDetail>> = {};
  const interpretationLabels: Record<string, (string | null)[]> = {};
  const outputRows: Record<string, number | string | null>[] = [];

  for (const [subscaleIndex, subscale] of subscales.entries()) {
    const groupName = groupNames[subscaleIndex];
    subscaleScores[subscale.name] = [];
    scaleScores[subscale.id] = {};
    interpretationLabels[subscale.name] = [];
    const legacyOutputs = options.outputs?.[subscale.id] ?? options.outputs?.[subscale.name];
    const shownOutputs = legacyOutputs
      ? shownScoreOutputs([
          ...(legacyOutputs.sum ? ['sum' as const] : []),
          ...(legacyOutputs.mean ? ['mean' as const] : []),
          ...(subscale.scoringMethod === 'custom' ? ['custom' as const] : []),
        ], subscale.scoringMethod)
      : shownScoreOutputs(subscale.showOutputs, subscale.scoringMethod);
    const subscaleBands = options.bandsByOutput?.[subscale.id]
      ?? options.bandsByOutput?.[subscale.name];
    const legacyBands = bands[subscale.name] ?? bands[subscale.id];
    const outputBands = shownOutputs.map((output) => [
      output,
      subscaleBands?.[output]
        ?? (output === shownOutputs[0] ? legacyBands : undefined),
    ] as const);
    for (const output of shownOutputs) {
      const isLegacyScore = options.legacyScoreColumnIds?.includes(subscale.id) && shownOutputs.length === 1;
      headers.push(isLegacyScore ? `${groupName} Score` : scoreColumnKey(groupName, output));
      const outputBandList = outputBands.find(([candidate]) => candidate === output)?.[1];
      if (outputBandList?.length) {
        headers.push(interpretationColumnKey(groupName, output, shownOutputs.length));
      }
    }
  }

  const defaultOverallMethod = subscales.every((subscale) => subscale.scoringMethod === 'mean')
    ? 'mean'
    : 'sum';
  // Mixed scoring methods are not meaningfully comparable, so retain the existing sum fallback.
  const overall: NonNullable<ScoringOptions['overall']> = options.overall ?? {
    enabled: subscales.length > 1,
    source: 'subscales',
    method: defaultOverallMethod,
  };
  const selectedSubscales = subscales.filter((subscale) =>
    !overall.includedSubscaleIds || overall.includedSubscaleIds.includes(subscale.id),
  );
  if (
    overall.enabled
    && (overall.flippedSubscaleIds || []).some((id) =>
      selectedSubscales.some((subscale) => subscale.id === id && subscale.scoringMethod === 'custom'),
    )
  ) {
    throw new Error('Custom subscales cannot be flipped in Overall.');
  }
  if (overall.enabled && selectedSubscales.length >= 2) headers.push('Overall Scale Score');

  const overallScores: (number | null)[] = [];
  const normalizedSubscaleValues: Record<string, (number | null)[]> = {};
  for (const subscale of subscales) normalizedSubscaleValues[subscale.id] = [];

  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex++) {
    const outRow: Record<string, number | string | null> = {};
    for (const header of rawHeaders) {
      const raw = rawRows[rowIndex][header];
      outRow[header] = raw == null ? null : String(raw);
    }

    for (const [subscaleIndex, subscale] of subscales.entries()) {
      const groupName = groupNames[subscaleIndex];
      const legacyOutputs = options.outputs?.[subscale.id] ?? options.outputs?.[subscale.name];
      const shownOutputs = legacyOutputs
        ? shownScoreOutputs([
            ...(legacyOutputs.sum ? ['sum' as const] : []),
            ...(legacyOutputs.mean ? ['mean' as const] : []),
            ...(subscale.scoringMethod === 'custom' ? ['custom' as const] : []),
          ], subscale.scoringMethod)
        : shownScoreOutputs(subscale.showOutputs, subscale.scoringMethod);
      const excluded = excludedSet.has(rowIndex);
      const values = subscale.items.map((item) => {
        const mapped = normalizedMatrix.values[rowIndex][item.column];
        return mapped !== null && item.reverse ? reverseValue(mapped, ranges.get(subscale.id)!) : mapped;
      });
      let detail = excluded
        ? { sum: null, mean: null, score: null, missingItems: values.filter((value) => value === null).length, observedItems: 0, prorated: false }
        : scoreValues(values, subscale.scoringMethod, options);
      let customScore: number | null = null;
      if (!excluded && shownOutputs.includes('custom') && subscale.customFormula && detail.missingItems === 0) {
        const formulaValues: Record<string, number | null> = {};
        subscale.items.forEach((item, itemIndex) => { formulaValues[item.column] = values[itemIndex]; });
        customScore = evaluateFormula(subscale.customFormula, formulaValues).value;
      }
      const outputValues: Record<ScoreOutput, number | null> = {
        sum: detail.sum,
        mean: detail.mean,
        custom: customScore,
      };
      const selectedScore = outputValues[shownOutputs[0]];
      detail = { ...detail, score: selectedScore };
      scaleScores[subscale.id][rowIds[rowIndex]] = detail;
      subscaleScores[subscale.name].push(excluded ? null : selectedScore);
      normalizedSubscaleValues[subscale.id].push(excluded ? null : selectedScore);
      outputScores(outRow, subscale, groupName, shownOutputs, outputValues);

      let firstInterpretation: string | null = null;
      const subscaleBands = options.bandsByOutput?.[subscale.id]
        ?? options.bandsByOutput?.[subscale.name];
      const legacyBands = bands[subscale.name] ?? bands[subscale.id];
      for (const output of shownOutputs) {
        const outputBandList = subscaleBands?.[output]
          ?? (output === shownOutputs[0] ? legacyBands : undefined);
        if (!outputBandList?.length) continue;
        let label: string | null = null;
        const value = outputValues[output];
        if (!excluded && value !== null) {
          const outputRange = getOutputRange(output, subscale.items.length, ranges.get(subscale.id) ?? null);
          label = classifyScore(value, outputBandList, outputRange?.kind ?? 'continuous');
        }
        const interpretationKey = interpretationColumnKey(groupName, output, shownOutputs.length);
        outRow[interpretationKey] = excluded ? 'Excluded' : label;
        if (output === shownOutputs[0]) firstInterpretation = label;
      }
      outRow[`${subscale.name} Score`] = excluded ? null : selectedScore;
      outRow[`${subscale.name} Interpretation`] = excluded ? 'Excluded' : firstInterpretation;
      interpretationLabels[subscale.name].push(excluded ? null : firstInterpretation);
    }
    outputRows.push(outRow);
  }

  if (overall.enabled && selectedSubscales.length >= 2) {
    const flippedIds = new Set(overall.flippedSubscaleIds || []);
    for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex++) {
      let score: number | null = null;
      if (!excludedSet.has(rowIndex)) {
        if (overall.source === 'items') {
          const itemColumns = selectedSubscales.flatMap((subscale) => subscale.items.map((item) => ({
            item,
            flipped: flippedIds.has(subscale.id),
            range: ranges.get(subscale.id)!,
          })));
          const values = itemColumns.map(({ item, flipped, range }) => {
            const rawValue = normalizedMatrix.values[rowIndex][item.column];
            if (rawValue === null) return null;
            const reverse = item.reverse !== flipped;
            return reverse ? reverseValue(rawValue, range) : rawValue;
          });
          score = scoreValues(values, overall.method || 'sum', options).score;
        } else {
          const values = selectedSubscales.map((subscale) => {
            const value = normalizedSubscaleValues[subscale.id][rowIndex];
            if (value === null) return null;
            if (!flippedIds.has(subscale.id)) return value;
            const range = ranges.get(subscale.id)!;
            const itemCount = subscale.items.length;
            const min = subscale.scoringMethod === 'sum' ? itemCount * range.min : range.min;
            const max = subscale.scoringMethod === 'sum' ? itemCount * range.max : range.max;
            return min + max - value;
          });
          if (values.every((value): value is number => value !== null)) {
            const total = values.reduce((sum, value) => sum + value, 0);
            score = overall.method === 'mean' ? total / values.length : total;
          }
        }
      }
      overallScores.push(score);
      outputRows[rowIndex]['Overall Scale Score'] = score;
    }
  }

  return {
    headers,
    rows: outputRows,
    subscaleScores,
    scaleScores,
    interpretationLabels,
    overallScaleScore: overall.enabled && selectedSubscales.length >= 2 ? overallScores : undefined,
    rowIds,
    normalizedMatrix,
    excludedRowIndices,
    configSnapshot: { subscales, bands },
  };
}

// Build an implicit "Overall Scale" from all non-demographic columns when no subscales are defined
export function buildAutoScale(
  allHeaders: string[],
  demographicColumns: string[],
): SubscaleConfig {
  const itemColumns = allHeaders.filter((header) => !demographicColumns.includes(header));
  return {
    id: 'auto-overall',
    name: 'Overall Scale',
    items: itemColumns.map((column, order) => ({ column, order, reverse: false })),
    scoringMethod: 'sum',
    responseScale: { scaleType: 'numeric' },
  };
}

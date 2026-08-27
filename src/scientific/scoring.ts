// Scoring engine — value mapping, reverse scoring, subscale scores, interpretation.
// If no subscales are defined, all non-demographic columns are treated as one "Overall Scale".

export interface SubscaleItemConfig { column: string; order: number; reverse: boolean; }
export interface ResponseScaleConfig {
  scaleType: 'numeric' | 'categorical';
  minValue?: number; maxValue?: number;
  labelMap?: { label: string; value: number }[];
}
export interface SubscaleConfig {
  id: string; name: string; items: SubscaleItemConfig[];
  scoringMethod: 'sum' | 'mean' | 'custom'; customFormula?: string | null;
  responseScale: ResponseScaleConfig;
}
export interface BandConfig { name: string; minScore: number; maxScore: number; color: string; }
import { evaluateFormula } from './formula';

export interface ScoringResult {
  headers: string[];
  rows: Record<string, number | string | null>[];
  subscaleScores: Record<string, (number | null)[]>;
  interpretationLabels: Record<string, (string | null)[]>;
  overallScaleScore?: (number | null)[];
  excludedRowIndices: number[];
  configSnapshot: { subscales: SubscaleConfig[]; bands: Record<string, BandConfig[]> };
}

function mapValue(raw: unknown, scale: ResponseScaleConfig): number | null {
  if (raw == null || raw === '') return null;
  const num = Number(raw);
  if (!isNaN(num) && isFinite(num)) {
    if (scale.scaleType === 'numeric') {
      if (scale.minValue != null && num < scale.minValue) return null;
      if (scale.maxValue != null && num > scale.maxValue) return null;
    }
    return num;
  }
  if (scale.scaleType === 'categorical' && scale.labelMap) {
    const rawStr = String(raw).trim();
    const entry = scale.labelMap.find((e) => e.label.trim().toLowerCase() === rawStr.toLowerCase());
    if (entry) return entry.value;
  }
  return null;
}

function applyReverse(value: number, scale: ResponseScaleConfig): number {
  if (scale.scaleType === 'numeric') return (scale.minValue ?? 0) + (scale.maxValue ?? 0) - value;
  if (scale.scaleType === 'categorical' && scale.labelMap?.length) {
    const values = scale.labelMap.map((e) => e.value);
    return Math.min(...values) + Math.max(...values) - value;
  }
  return value;
}

export function scoreDataset(
  rawRows: Record<string, unknown>[],
  rawHeaders: string[],
  subscales: SubscaleConfig[],
  bands: Record<string, BandConfig[]>,
  excludedRowIndices: number[] = [],
): ScoringResult {
  const excludedSet = new Set(excludedRowIndices);
  const scoreHeaders = subscales.map((s) => `${s.name} Score`);
  const labelHeaders = subscales.map((s) => `${s.name} Interpretation`);
  const headers = [...rawHeaders, ...scoreHeaders, ...labelHeaders];
  const outputRows: Record<string, number | string | null>[] = [];
  const subscaleScores: Record<string, (number | null)[]> = {};
  const interpretationLabels: Record<string, (string | null)[]> = {};
  for (const sub of subscales) { subscaleScores[sub.name] = []; interpretationLabels[sub.name] = []; }

  for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
    const rawRow = rawRows[rowIdx];
    const isExcluded = excludedSet.has(rowIdx);
    const outRow: Record<string, number | string | null> = {};
    for (const h of rawHeaders) outRow[h] = rawRow[h] != null ? String(rawRow[h]) : null;

    for (const sub of subscales) {
      const scoreKey = `${sub.name} Score`, labelKey = `${sub.name} Interpretation`;
      if (isExcluded) {
        outRow[scoreKey] = null; outRow[labelKey] = 'Excluded';
        subscaleScores[sub.name].push(null); interpretationLabels[sub.name].push(null);
        continue;
      }
      const itemValues: number[] = [];
      for (const item of sub.items) {
        let mapped = mapValue(rawRow[item.column], sub.responseScale);
        if (mapped !== null) { if (item.reverse) mapped = applyReverse(mapped, sub.responseScale); itemValues.push(mapped); }
      }
      let score: number | null = null;
      if (sub.scoringMethod === 'custom' && sub.customFormula) {
        const valueMap: Record<string, number | null> = {};
        for (const item of sub.items) {
          let mapped = mapValue(rawRow[item.column], sub.responseScale);
          if (mapped !== null && item.reverse) mapped = applyReverse(mapped, sub.responseScale);
          valueMap[item.column] = mapped;
        }
        const result = evaluateFormula(sub.customFormula, valueMap);
        score = result.value;
      } else if (itemValues.length > 0) {
        score = sub.scoringMethod === 'mean'
          ? itemValues.reduce((s, v) => s + v, 0) / itemValues.length
          : itemValues.reduce((s, v) => s + v, 0);
      }
      outRow[scoreKey] = score;
      subscaleScores[sub.name].push(score);
      let label: string | null = null;
      if (score !== null) {
        const subBands = bands[sub.name] || bands[sub.id];
        if (subBands) { const band = subBands.find((b) => score! >= b.minScore && score! <= b.maxScore); if (band) label = band.name; }
      }
      outRow[labelKey] = label;
      interpretationLabels[sub.name].push(label);
    }
    outputRows.push(outRow);
  }

  // Compute overall scale score when multiple subscales exist
  let overallScaleScore: (number | null)[] | undefined;
  if (subscales.length > 1) {
    overallScaleScore = [];
    for (let i = 0; i < rawRows.length; i++) {
      if (excludedSet.has(i)) { overallScaleScore.push(null); continue; }
      const rowScores = subscales.map((s) => subscaleScores[s.name][i]).filter((v): v is number => v !== null);
      overallScaleScore.push(rowScores.length > 0 ? rowScores.reduce((s, v) => s + v, 0) : null);
    }
    headers.push('Overall Scale Score');
    outputRows.forEach((row, i) => { row['Overall Scale Score'] = overallScaleScore![i] ?? null; });
  }

  return { headers, rows: outputRows, subscaleScores, interpretationLabels, overallScaleScore, excludedRowIndices, configSnapshot: { subscales, bands } };
}

// Build an implicit "Overall Scale" from all non-demographic columns when no subscales are defined
export function buildAutoScale(
  allHeaders: string[],
  demographicColumns: string[],
): SubscaleConfig {
  const itemColumns = allHeaders.filter((h) => !demographicColumns.includes(h));
  return {
    id: 'auto-overall',
    name: 'Overall Scale',
    items: itemColumns.map((col, i) => ({ column: col, order: i, reverse: false })),
    scoringMethod: 'sum',
    responseScale: { scaleType: 'numeric' },
  };
}

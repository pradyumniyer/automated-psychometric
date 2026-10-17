import type { ScoreOutput } from '@/types/domain';

export type OutputKind = 'integer' | 'continuous';

export interface ScoreRange {
  min: number;
  max: number;
}

export interface OutputRange extends ScoreRange {
  kind: OutputKind;
}

export interface BandValidationOptions {
  outputKind: OutputKind;
  possibleRange?: ScoreRange | null;
}

export interface BandValidationWarning {
  type: 'overlap' | 'gap' | 'out_of_range' | 'invalid';
  message: string;
  bandIndices?: number[];
}

type Band = { name: string; minScore: number; maxScore: number };

function validationOptions(
  options: BandValidationOptions | number | null,
): { kind: OutputKind; range: ScoreRange | null; hasKnownRange: boolean } {
  if (typeof options === 'number' || options === null) {
    return { kind: 'integer', range: null, hasKnownRange: false };
  }
  return {
    kind: options.outputKind,
    range: options.possibleRange ?? null,
    hasKnownRange: options.possibleRange != null,
  };
}

export function validateBands(
  bands: Band[],
  options: BandValidationOptions | number | null,
): BandValidationWarning[] {
  const { kind, range, hasKnownRange } = validationOptions(options);
  if (bands.length === 0) return [];
  const warnings: BandValidationWarning[] = [];
  const sorted = bands.map((band, originalIndex) => ({ ...band, originalIndex }))
    .sort((a, b) => a.minScore - b.minScore);

  for (const band of sorted) {
    if (!(band.minScore < band.maxScore)) {
      warnings.push({
        type: 'invalid',
        message: `"${band.name}" minimum (${band.minScore}) must be below its maximum (${band.maxScore})`,
        bandIndices: [band.originalIndex],
      });
    }
    if (hasKnownRange && range && (band.minScore < range.min || band.maxScore > range.max)) {
      warnings.push({
        type: 'out_of_range',
        message: `"${band.name}" does not stay within the possible score range (${range.min}–${range.max})`,
        bandIndices: [band.originalIndex],
      });
    }
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (next.minScore < current.maxScore) {
      warnings.push({
        type: 'overlap',
        message: `"${current.name}" and "${next.name}" overlap`,
        bandIndices: [current.originalIndex, next.originalIndex],
      });
    }
    const expectedNextMin = kind === 'integer' ? current.maxScore + 1 : current.maxScore;
    if (next.minScore > expectedNextMin) {
      warnings.push({
        type: 'gap',
        message: `Gap between "${current.name}" and "${next.name}"`,
        bandIndices: [current.originalIndex, next.originalIndex],
      });
    }
  }

  if (hasKnownRange && range) {
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first.minScore > range.min) {
      warnings.push({
        type: 'out_of_range',
        message: `Bands do not reach the lowest possible score (${range.min})`,
        bandIndices: [first.originalIndex],
      });
    }
    if (last.maxScore < range.max) {
      warnings.push({
        type: 'out_of_range',
        message: `Bands do not reach the highest possible score (${range.max})`,
        bandIndices: [last.originalIndex],
      });
    }
  }
  return warnings;
}

export function classifyScore(
  score: number,
  bands: Band[],
  kind: OutputKind,
): string | null {
  const lastIndex = bands.length - 1;
  for (const [index, band] of bands.entries()) {
    const upperMatches = kind === 'integer' || index === lastIndex
      ? score <= band.maxScore
      : score < band.maxScore;
    if (score >= band.minScore && upperMatches) return band.name;
  }
  return null;
}

export function getOutputRange(
  output: ScoreOutput,
  itemCount: number,
  scaleRange: ScoreRange | null,
): OutputRange | null {
  if (!scaleRange || itemCount < 0) return null;
  if (output === 'custom') return null;
  return output === 'sum'
    ? {
        min: itemCount * scaleRange.min,
        max: itemCount * scaleRange.max,
        kind: Number.isInteger(scaleRange.min) && Number.isInteger(scaleRange.max)
          ? 'integer'
          : 'continuous',
      }
    : { min: scaleRange.min, max: scaleRange.max, kind: 'continuous' };
}

export function suggestBands(
  range: OutputRange,
  count = 3,
): { name: string; minScore: number; maxScore: number; color: string }[] {
  const bandColors = ['#94a3b8', '#f59e0b', '#14b8a6', '#3b82f6', '#8b5cf6'];
  if (count < 1 || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) {
    return [];
  }
  const step = (range.max - range.min) / count;
  const integerStep = (range.max - range.min + 1) / count;
  const defaultNames = ['Low', 'Moderate', 'High', 'Very High', 'Severe'];
  const bands: { name: string; minScore: number; maxScore: number; color: string }[] = [];
  for (let i = 0; i < count; i++) {
    const round = (value: number) => range.kind === 'integer'
      ? Math.round(value)
      : Math.round(value * 100) / 100;
    const min = i === 0
      ? range.min
      : range.kind === 'integer'
        ? range.min + Math.round(i * integerStep)
        : round(range.min + i * step);
    const max = i === count - 1
      ? range.max
      : range.kind === 'integer'
        ? range.min + Math.round((i + 1) * integerStep) - 1
        : round(range.min + (i + 1) * step);
    bands.push({
      name: defaultNames[i] || `Band ${i + 1}`,
      minScore: min,
      maxScore: max,
      color: bandColors[i % bandColors.length],
    });
  }
  return bands;
}

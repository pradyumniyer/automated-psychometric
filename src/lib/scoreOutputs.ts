import type { ScoreOutput } from '@/types/domain';

export const SCORE_OUTPUT_ORDER: readonly ScoreOutput[] = ['sum', 'mean', 'custom'];

export function shownScoreOutputs(
  outputs: readonly ScoreOutput[] | null | undefined,
  legacyMethod: ScoreOutput,
): ScoreOutput[] {
  const selected = new Set(outputs?.filter((output) => SCORE_OUTPUT_ORDER.includes(output)) ?? []);
  if (selected.size === 0) selected.add(legacyMethod);
  return SCORE_OUTPUT_ORDER.filter((output) => selected.has(output));
}

export function scoreOutputLabel(output: ScoreOutput): string {
  return output === 'custom' ? 'Custom' : output === 'sum' ? 'Sum' : 'Mean';
}

export function scoreColumnKey(subscaleName: string, output: ScoreOutput): string {
  return `${subscaleName} ${scoreOutputLabel(output)}`;
}

export function interpretationColumnKey(
  subscaleName: string,
  output: ScoreOutput,
  outputCount: number,
): string {
  return outputCount === 1
    ? `${subscaleName} Interpretation`
    : `${subscaleName} ${scoreOutputLabel(output)} interpretation`;
}

export function primaryScoreColumnKeys(
  subscaleName: string,
  outputs: readonly ScoreOutput[] | null | undefined,
  legacyMethod: ScoreOutput,
): { output: ScoreOutput; scoreKey: string; interpretationKey: string } {
  const shown = shownScoreOutputs(outputs, legacyMethod);
  const output = shown[0];
  return {
    output,
    scoreKey: scoreColumnKey(subscaleName, output),
    interpretationKey: interpretationColumnKey(subscaleName, output, shown.length),
  };
}

export function uniqueSubscaleNames(
  names: readonly string[],
  reservedHeaders: readonly string[] = [],
): string[] {
  const used = new Set(reservedHeaders);
  return names.map((name) => {
    let unique = name;
    let suffix = 2;
    const generatedHeaders = (candidate: string) => [
      `${candidate} Score`,
      `${candidate} Interpretation`,
      ...SCORE_OUTPUT_ORDER.map((output) => scoreColumnKey(candidate, output)),
      ...SCORE_OUTPUT_ORDER.map((output) => interpretationColumnKey(candidate, output, 1)),
      ...SCORE_OUTPUT_ORDER.map((output) => interpretationColumnKey(candidate, output, 2)),
    ];
    while (used.has(unique) || generatedHeaders(unique).some((header) => used.has(header))) {
      unique = `${name} (${suffix})`;
      suffix += 1;
    }
    generatedHeaders(unique).forEach((header) => used.add(header));
    return unique;
  });
}

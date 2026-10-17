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

export function uniqueSubscaleNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let unique = name;
    let suffix = 2;
    while (used.has(unique)) {
      unique = `${name} (${suffix})`;
      suffix += 1;
    }
    used.add(unique);
    return unique;
  });
}

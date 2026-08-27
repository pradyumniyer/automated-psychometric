// Reliability analysis — Cronbach's alpha matching R's psych::alpha() and SPSS.
import { variance, mean, pearsonCorrelation, sd } from './descriptives';

export interface ItemStats {
  itemName: string; n: number; itemMean: number; itemSd: number;
  itemTotalCorrelation: number; itemRestCorrelation: number;
  alphaIfDeleted: number; dropR: number;
}

export interface ReliabilityResult {
  alpha: number; standardizedAlpha: number; nItems: number; nCases: number;
  mean: number; sd: number; itemStats: ItemStats[]; alphaIfDeleted: number[];
}

export function cronbachAlpha(
  itemData: Record<string, number>[],
  itemNames: string[],
): ReliabilityResult {
  const completeCases = itemData.filter((row) =>
    itemNames.every((name) => { const v = row[name]; return v != null && !isNaN(v); })
  );
  const nCases = completeCases.length, k = itemNames.length;

  if (k < 2 || nCases < 2) {
    return { alpha: NaN, standardizedAlpha: NaN, nItems: k, nCases, mean: NaN, sd: NaN, itemStats: [], alphaIfDeleted: [] };
  }

  const itemVectors: Record<string, number[]> = {};
  for (const name of itemNames) itemVectors[name] = completeCases.map((row) => row[name]);

  const totalScores = completeCases.map((row) => itemNames.reduce((s, name) => s + row[name], 0));
  const totalVar = variance(totalScores);

  let sumItemVar = 0;
  const itemVars: Record<string, number> = {};
  for (const name of itemNames) { const v = variance(itemVectors[name]); itemVars[name] = v; sumItemVar += v; }

  const alpha = (k / (k - 1)) * (1 - sumItemVar / totalVar);

  let sumR = 0, countR = 0;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const r = pearsonCorrelation(itemVectors[itemNames[i]], itemVectors[itemNames[j]]);
      if (!isNaN(r)) { sumR += r; countR++; }
    }
  }
  const meanR = countR > 0 ? sumR / countR : 0;
  const standardizedAlpha = (k * meanR) / (1 + (k - 1) * meanR);

  const itemStats: ItemStats[] = [], alphaIfDeleted: number[] = [];
  for (let idx = 0; idx < k; idx++) {
    const itemName = itemNames[idx], itemVec = itemVectors[itemName];
    const remainingItems = itemNames.filter((_, i) => i !== idx);
    const restScore = completeCases.map((row) => remainingItems.reduce((s, name) => s + row[name], 0));
    const itemTotalCorr = pearsonCorrelation(itemVec, restScore);
    const remainingTotalScores = completeCases.map((row) => remainingItems.reduce((s, name) => s + row[name], 0));
    const remainingTotalVar = variance(remainingTotalScores);
    let remainingSumVar = 0;
    for (const name of remainingItems) remainingSumVar += itemVars[name];
    const kRem = remainingItems.length;
    let alphaDel = NaN;
    if (kRem >= 2 && remainingTotalVar > 0) alphaDel = (kRem / (kRem - 1)) * (1 - remainingSumVar / remainingTotalVar);
    itemStats.push({ itemName, n: nCases, itemMean: mean(itemVec), itemSd: sd(itemVec), itemTotalCorrelation: itemTotalCorr, itemRestCorrelation: itemTotalCorr, alphaIfDeleted: alphaDel, dropR: itemTotalCorr });
    alphaIfDeleted.push(alphaDel);
  }
  return { alpha, standardizedAlpha, nItems: k, nCases, mean: mean(totalScores), sd: sd(totalScores), itemStats, alphaIfDeleted };
}

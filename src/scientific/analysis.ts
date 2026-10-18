// Analysis orchestrator — ties together all scientific modules.
// Uses intelligent normality test selection and auto-scale when no subscales defined.

import { descriptiveStats, DescriptiveStats } from './descriptives';
import { intelligentNormalityTest, NormalityTestResult } from './normalityTest';
import { cronbachAlphaFromNormalizedMatrix, ReliabilityResult } from './reliability';
import { iqrOutliers, zscoreOutliers, madOutliers, mahalanobisDistance, MahalanobisResult, OutlierFlag } from './outliers';
import { scoreDataset, ScoringResult, SubscaleConfig, BandConfig, buildAutoScale } from './scoring';

export interface SubscaleAnalysis {
  subscaleName: string;
  descriptives: DescriptiveStats;
  normality: NormalityTestResult;
  reliability: ReliabilityResult;
  outliers: { iqr: { indices: number[]; flags: OutlierFlag[] }; zscore: { indices: number[]; flags: OutlierFlag[] }; mad: { indices: number[]; flags: OutlierFlag[] } };
  scoreValues: number[];
  itemColumns: string[];
}

export interface FullAnalysis {
  subscales: SubscaleAnalysis[];
  multivariateOutliers: MahalanobisResult;
  overallN: number; excludedN: number; includedN: number;
  usedAutoScale: boolean;
}

export function runFullAnalysis(
  rawRows: Record<string, unknown>[],
  rawHeaders: string[],
  subscales: SubscaleConfig[],
  bands: Record<string, BandConfig[]>,
  excludedRowIndices: number[] = [],
  demographicColumns: string[] = [],
): { scoring: ScoringResult; analysis: FullAnalysis } {
  // If no subscales, build auto-scale from all non-demographic columns
  let effectiveSubscales = subscales;
  let usedAutoScale = false;
  if (subscales.length === 0) {
    effectiveSubscales = [buildAutoScale(rawHeaders, demographicColumns, rawRows)];
    usedAutoScale = true;
  }

  const scoring = scoreDataset(rawRows, rawHeaders, effectiveSubscales, bands, excludedRowIndices);
  const includedIndices = rawRows.map((_, i) => i).filter((i) => !excludedRowIndices.includes(i));
  const subscaleAnalyses: SubscaleAnalysis[] = [];

  for (const sub of effectiveSubscales) {
    const scoreValues = includedIndices.map((i) => scoring.subscaleScores[sub.name][i]).filter((v): v is number => v != null && !isNaN(v));
    const desc = descriptiveStats(scoreValues);
    const normality = intelligentNormalityTest(scoreValues);
    const itemNames = sub.items.map((item) => item.column);
    const reliability = cronbachAlphaFromNormalizedMatrix(
      scoring.normalizedMatrix,
      sub,
      includedIndices,
    );
    const iqr = iqrOutliers(scoreValues, sub.name);
    const zs = zscoreOutliers(scoreValues, sub.name, 2.5);
    const mad = madOutliers(scoreValues, sub.name, 3.5);
    subscaleAnalyses.push({ subscaleName: sub.name, descriptives: desc, normality, reliability, outliers: { iqr, zscore: zs, mad }, scoreValues, itemColumns: itemNames });
  }

  const allItemColumns = effectiveSubscales.flatMap((s) => s.items.map((item) => item.column));
  const uniqueItemColumns = Array.from(new Set(allItemColumns));
  const mvData = includedIndices.map((rowIdx) => uniqueItemColumns.map((col) => {
    const value = scoring.normalizedMatrix.values[rowIdx]?.[col];
    return value == null ? NaN : value;
  }));
  const mvOutliers = mahalanobisDistance(mvData, uniqueItemColumns);

  const analysis: FullAnalysis = { subscales: subscaleAnalyses, multivariateOutliers: mvOutliers, overallN: rawRows.length, excludedN: excludedRowIndices.length, includedN: includedIndices.length, usedAutoScale };
  return { scoring, analysis };
}

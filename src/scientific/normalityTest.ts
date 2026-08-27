// Intelligent normality test selector.
// Automatically chooses the appropriate test based on sample size,
// matching R's practical guidance:
//   - 3 <= n <= 5000: Shapiro-Wilk (more powerful, R's recommended default)
//   - n > 5000: Lilliefors-corrected KS (shapiro.test() not supported above 5000)
//   - n > 50: Both tests run and compared for robustness

import { shapiroWilk, ShapiroWilkResult } from './shapiroWilk';
import { lillieforsTest, ksTestNormal, KSResult } from './kolmogorovSmirnov';
import { mean, sd } from './descriptives';

export interface NormalityTestResult {
  primaryTest: 'shapiro-wilk' | 'lilliefors' | 'none';
  primaryReason: string;
  shapiroWilk: ShapiroWilkResult | null;
  lilliefors: KSResult | null;
  kolmogorovSmirnov: KSResult | null;
  isNormal: boolean;
  alpha: number;
  recommendation: string;
}

export function intelligentNormalityTest(
  data: number[],
  alpha = 0.05,
): NormalityTestResult {
  const valid = data.filter((v) => v !== null && v !== undefined && !isNaN(v));
  const n = valid.length;

  // Edge case: too few observations
  if (n < 3) {
    return {
      primaryTest: 'none',
      primaryReason: `Insufficient data (n=${n}). At least 3 observations required for any normality test.`,
      shapiroWilk: null,
      lilliefors: null,
      kolmogorovSmirnov: null,
      isNormal: false,
      alpha,
      recommendation: 'Collect more data before testing normality.',
    };
  }

  // Run Shapiro-Wilk for n=3..5000
  let swResult: ShapiroWilkResult | null = null;
  if (n <= 5000) {
    swResult = shapiroWilk(valid);
  }

  // Run Lilliefors-corrected KS for all n >= 4
  let lfResult: KSResult | null = null;
  if (n >= 4) {
    lfResult = lillieforsTest(valid);
  }

  // Run standard KS (with estimated parameters, for comparison) for n > 50
  let ksResult: KSResult | null = null;
  if (n > 50) {
    const m = mean(valid);
    const s = sd(valid);
    ksResult = ksTestNormal(valid, m, s);
  }

  // Determine primary test
  let primaryTest: 'shapiro-wilk' | 'lilliefors' | 'none';
  let primaryReason: string;

  if (n <= 5000) {
    primaryTest = 'shapiro-wilk';
    primaryReason = `Shapiro-Wilk selected: n=${n} is within the 3–5000 range where SW has the highest statistical power for detecting non-normality.`;
  } else {
    primaryTest = 'lilliefors';
    primaryReason = `Lilliefors-corrected KS selected: n=${n} exceeds 5000 (R's shapiro.test() limit). The Lilliefors correction accounts for parameters estimated from the data.`;
  }

  // Determine normality verdict from primary test
  let isNormal = false;
  let pValue: number;
  let statisticName: string;

  if (primaryTest === 'shapiro-wilk' && swResult) {
    pValue = swResult.pValue;
    statisticName = 'W';
    isNormal = pValue > alpha;
  } else if (primaryTest === 'lilliefors' && lfResult) {
    pValue = lfResult.pValue;
    statisticName = 'D';
    isNormal = pValue > alpha;
  } else {
    pValue = NaN;
    statisticName = '';
  }

  // Check for disagreement between tests when both are available
  let recommendation: string;
  if (swResult && lfResult) {
    const swNormal = swResult.pValue > alpha;
    const lfNormal = lfResult.pValue > alpha;
    if (swNormal && lfNormal) {
      recommendation = `Both tests agree: data appears normally distributed (p > ${alpha}). Parametric analyses are appropriate.`;
    } else if (!swNormal && !lfNormal) {
      recommendation = `Both tests agree: data significantly deviates from normality (p ≤ ${alpha}). Consider non-parametric alternatives or data transformation.`;
    } else {
      recommendation = `Tests disagree: Shapiro-Wilk p=${swResult.pValue.toFixed(4)} (${swNormal ? 'normal' : 'non-normal'}), Lilliefors p=${lfResult.pValue.toFixed(4)} (${lfNormal ? 'normal' : 'non-normal'}). The primary test (${primaryTest}) indicates ${isNormal ? 'normality' : 'non-normality'}. Exercise caution and inspect the Q-Q plot.`;
    }
  } else {
    recommendation = isNormal
      ? `Data appears normally distributed (${statisticName} test, p=${pValue?.toFixed(4)} > ${alpha}). Parametric analyses are appropriate.`
      : `Data significantly deviates from normality (${statisticName} test, p=${pValue?.toFixed(4)} ≤ ${alpha}). Consider non-parametric alternatives or data transformation.`;
  }

  return {
    primaryTest,
    primaryReason,
    shapiroWilk: swResult,
    lilliefors: lfResult,
    kolmogorovSmirnov: ksResult,
    isNormal,
    alpha,
    recommendation,
  };
}

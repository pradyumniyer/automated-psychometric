// Interpretation band validation — detects overlaps, gaps, and out-of-range bands.

export interface BandValidationWarning {
  type: 'overlap' | 'gap' | 'out_of_range';
  message: string;
  bandIndices?: number[];
}

export function validateBands(
  bands: { name: string; minScore: number; maxScore: number }[],
  maxPossibleScore: number,
): BandValidationWarning[] {
  const warnings: BandValidationWarning[] = [];
  if (bands.length === 0) return warnings;

  const sorted = [...bands].map((b, i) => ({ ...b, originalIndex: i })).sort((a, b) => a.minScore - b.minScore);

  // Check for overlaps
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].maxScore >= sorted[i + 1].minScore) {
      const overlapAmount = sorted[i].maxScore - sorted[i + 1].minScore + 1;
      warnings.push({
        type: 'overlap',
        message: `"${sorted[i].name}" and "${sorted[i + 1].name}" overlap by ${overlapAmount} point${overlapAmount !== 1 ? 's' : ''}`,
        bandIndices: [sorted[i].originalIndex, sorted[i + 1].originalIndex],
      });
    }
  }

  // Check for gaps between consecutive bands
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].maxScore + 1;
    const gapEnd = sorted[i + 1].minScore - 1;
    if (gapStart <= gapEnd) {
      warnings.push({
        type: 'gap',
        message: `Gap between "${sorted[i].name}" (max ${sorted[i].maxScore}) and "${sorted[i + 1].name}" (min ${sorted[i + 1].minScore}): uncovered range ${gapStart}–${gapEnd}`,
      });
    }
  }

  // Check for out-of-range bands
  for (const band of sorted) {
    if (band.maxScore > maxPossibleScore) {
      warnings.push({
        type: 'out_of_range',
        message: `"${band.name}" max (${band.maxScore}) exceeds the maximum possible score (${maxPossibleScore})`,
        bandIndices: [band.originalIndex],
      });
    }
  }

  return warnings;
}

// Generate evenly spaced bands that cover [0, maxScore] with no gaps or overlaps
export function suggestBands(
  maxScore: number,
  count: number = 3,
): { name: string; minScore: number; maxScore: number; color: string }[] {
  const bandColors = ['#94a3b8', '#f59e0b', '#14b8a6', '#3b82f6', '#8b5cf6'];
  const step = maxScore / count;
  const defaultNames = ['Low', 'Moderate', 'High', 'Very High', 'Severe'];
  const bands: { name: string; minScore: number; maxScore: number; color: string }[] = [];
  for (let i = 0; i < count; i++) {
    const min = i === 0 ? 0 : Math.round(i * step) + 1;
    const max = Math.round((i + 1) * step);
    bands.push({
      name: defaultNames[i] || `Band ${i + 1}`,
      minScore: min,
      maxScore: max,
      color: bandColors[i % bandColors.length],
    });
  }
  return bands;
}

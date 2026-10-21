export interface CommittedRange {
  min: number;
  max: number;
}

export function commitScaleRangeDraft(
  minText: string,
  maxText: string,
  committed: CommittedRange,
): { range: CommittedRange; changed: boolean } {
  const min = Number(minText);
  const max = Number(maxText);
  if (!/^-?\d+$/.test(minText) || !/^-?\d+$/.test(maxText) || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min >= max) {
    return { range: committed, changed: false };
  }
  return { range: { min, max }, changed: min !== committed.min || max !== committed.max };
}

export function escapeScaleRangeDraft(_draft: { min: string; max: string }, committed: CommittedRange): { min: string; max: string } {
  return { min: String(committed.min), max: String(committed.max) };
}

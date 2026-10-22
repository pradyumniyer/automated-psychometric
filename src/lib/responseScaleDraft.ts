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
  const numberPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (!numberPattern.test(minText.trim()) || !numberPattern.test(maxText.trim()) || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    return { range: committed, changed: false };
  }
  return { range: { min, max }, changed: min !== committed.min || max !== committed.max };
}

export function escapeScaleRangeDraft(_draft: { min: string; max: string }, committed: CommittedRange): { min: string; max: string } {
  return { min: String(committed.min), max: String(committed.max) };
}

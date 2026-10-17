export type ResponseScaleLabelKind = "scale" | "special";
export type OutOfRangeAction = "missing" | "widen";

export interface ResponseScaleLabel {
  text: string;
  value: number | null;
  kind: ResponseScaleLabelKind;
  reverse?: boolean;
}

export interface ResponseScaleV2 {
  min: number;
  max: number;
  rangeSource: "detected" | "manual" | "preset";
  confirmed: boolean;
  flipped: boolean;
  startsAtZero: boolean;
  labels: ResponseScaleLabel[];
  outOfRange: OutOfRangeAction;
}

export type ResolvedResponse =
  | { kind: "blank"; value: null }
  | { kind: "valid"; value: number }
  | { kind: "special_missing"; value: null }
  | { kind: "special_scored"; value: number }
  | { kind: "out_of_range"; value: null; raw: unknown; suggestedAction: OutOfRangeAction }
  | { kind: "unmapped"; value: null; raw: unknown };

const BUILT_IN_NUMERIC_MISSING_CODES = new Set(["-99", "-999"]);
const CONVENTIONAL_RANGES = [
  { min: 0, max: 3 },
  { min: 0, max: 4 },
  { min: 0, max: 5 },
  { min: 0, max: 6 },
  { min: 0, max: 7 },
  { min: 0, max: 10 },
  { min: 1, max: 3 },
  { min: 1, max: 4 },
  { min: 1, max: 5 },
  { min: 1, max: 6 },
  { min: 1, max: 7 },
  { min: 1, max: 9 },
  { min: 1, max: 10 },
  { min: 0, max: 100 },
] as const;

export function normalizeResponseText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function parseNumeric(value: string): number | null {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function reverseValue(value: number, scale: ResponseScaleV2): number {
  return scale.min + scale.max - value;
}

export interface NumericRange {
  min: number;
  max: number;
}

export interface RangeOutlierAssessment {
  count: number;
  values: number[];
  suggestedAction: OutOfRangeAction;
}

export interface ConventionalRangeDetection {
  range: NumericRange;
  confirmed: false;
  coverage: number;
  isContinuous: boolean;
  outOfRange: RangeOutlierAssessment;
}

function numericValues(values: unknown[]): number[] {
  return values
    .map((value) => {
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (typeof value !== "string") return null;
      const text = normalizeResponseText(value);
      if (text === "" || BUILT_IN_NUMERIC_MISSING_CODES.has(text)) return null;
      return parseNumeric(text);
    })
    .filter((value): value is number => value !== null);
}

function isCandidateRange(range: NumericRange): boolean {
  return CONVENTIONAL_RANGES.some((candidate) => candidate.min === range.min && candidate.max === range.max);
}

export function assessRangeOutliers(values: unknown[], range: NumericRange): RangeOutlierAssessment {
  const numeric = numericValues(values);
  const outliers = numeric.filter((value) => value < range.min || value > range.max);
  const oneStepBeyond = outliers.length > 0
    && outliers.every((value) => value === range.min - 1 || value === range.max + 1)
    && outliers.every((value) => isCandidateRange({
      min: Math.min(range.min, value),
      max: Math.max(range.max, value),
    }));
  return {
    count: outliers.length,
    values: outliers,
    suggestedAction: oneStepBeyond ? "widen" : "missing",
  };
}

export function detectConventionalRange(values: unknown[]): ConventionalRangeDetection {
  const numeric = numericValues(values);
  if (numeric.length === 0) {
    throw new Error("Cannot detect a response range without numeric responses.");
  }
  const isContinuous = numeric.some((value) => !Number.isInteger(value));
  const observed = { min: Math.min(...numeric), max: Math.max(...numeric) };
  if (isContinuous) {
    return {
      range: observed,
      confirmed: false,
      coverage: 1,
      isContinuous: true,
      outOfRange: { count: 0, values: [], suggestedAction: "missing" },
    };
  }
  const candidate = CONVENTIONAL_RANGES
    .filter((range) => numeric.filter((value) => value >= range.min && value <= range.max).length / numeric.length >= 0.99)
    .sort((left, right) => (left.max - left.min) - (right.max - right.min))[0];
  const range = candidate ? { min: candidate.min, max: candidate.max } : observed;
  const inRange = numeric.filter((value) => value >= range.min && value <= range.max).length;
  return {
    range,
    confirmed: false,
    coverage: inRange / numeric.length,
    isContinuous: false,
    outOfRange: assessRangeOutliers(numeric, range),
  };
}

export interface MixedRangeDetection {
  mixed: boolean;
  items: { item: string; range: NumericRange }[];
}

export function detectMixedRanges(itemValues: Record<string, unknown[]>): MixedRangeDetection {
  const items = Object.entries(itemValues).map(([item, values]) => {
    const numeric = numericValues(values);
    if (numeric.length === 0) throw new Error(`Cannot detect a response range for "${item}".`);
    return { item, range: { min: Math.min(...numeric), max: Math.max(...numeric) } };
  });
  const signatures = new Set(items.map(({ range }) => `${range.min}:${range.max}`));
  return { mixed: signatures.size > 1, items };
}

export function resolveResponse(raw: unknown, scale: ResponseScaleV2): ResolvedResponse {
  if (raw == null) return { kind: "blank", value: null };
  if (typeof raw !== "string" && (typeof raw !== "number" || !Number.isFinite(raw))) {
    return { kind: "unmapped", value: null, raw };
  }

  const text = String(raw);
  if (text.trim() === "") return { kind: "blank", value: null };
  const normalized = normalizeResponseText(text);
  const label = scale.labels.find((candidate) => normalizeResponseText(candidate.text) === normalized);
  if (label) {
    if (label.value === null) return { kind: "special_missing", value: null };
    const value = label.reverse ? reverseValue(label.value, scale) : label.value;
    return {
      kind: label.kind === "special" ? "special_scored" : "valid",
      value,
    };
  }

  if (BUILT_IN_NUMERIC_MISSING_CODES.has(normalized)) {
    return { kind: "special_missing", value: null };
  }

  const numeric = typeof raw === "number" ? raw : parseNumeric(normalized);
  if (numeric === null) return { kind: "unmapped", value: null, raw };
  if (numeric < scale.min || numeric > scale.max) {
    return {
      kind: "out_of_range",
      value: null,
      raw,
      suggestedAction: scale.outOfRange,
    };
  }
  return { kind: "valid", value: numeric };
}

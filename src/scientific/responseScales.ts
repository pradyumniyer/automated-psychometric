import { COMMON_LIKERT_SCALES, type LikertPreset } from "./detection";

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

export interface OutOfRangeActionLog {
  action: OutOfRangeAction;
  count: number;
  values: number[];
}

export interface OutOfRangeHistoryEntry {
  action_type: "response_scale_out_of_range";
  description: string;
  payload: { action: OutOfRangeAction; count: number; values: number[] };
}

export function createOutOfRangeHistoryEntry(log: OutOfRangeActionLog): OutOfRangeHistoryEntry {
  const actionLabel = log.action === "widen" ? "Widen range" : "Treat as missing";
  return {
    action_type: "response_scale_out_of_range",
    description: `${actionLabel} for ${log.count} out-of-range response${log.count === 1 ? "" : "s"}`,
    payload: { action: log.action, count: log.count, values: [...log.values] },
  };
}

export interface OutOfRangeActionResult {
  scale: ResponseScaleV2;
  log: OutOfRangeActionLog;
}

export interface ConventionalRangeDetection {
  range: NumericRange;
  confirmed: false;
  coverage: number;
  isContinuous: boolean;
  outOfRange: RangeOutlierAssessment;
}

export function canReverseScore(scale: Pick<ResponseScaleV2, "confirmed">): boolean {
  return scale.confirmed;
}

export function applyOutOfRangeAction(
  scale: ResponseScaleV2,
  values: number[],
  action: OutOfRangeAction,
): OutOfRangeActionResult {
  const log = { action, count: values.length, values: [...values] };
  if (action === "missing") return { scale: { ...scale }, log };
  return {
    scale: {
      ...scale,
      min: Math.min(scale.min, ...values),
      max: Math.max(scale.max, ...values),
      rangeSource: "manual",
      confirmed: true,
    },
    log,
  };
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

export interface PresetMatch {
  preset: LikertPreset | null;
  labels: ResponseScaleLabel[];
  extraResponses: string[];
  suggestDemographicOrId: boolean;
}

const BUILT_IN_SPECIAL_WORDS = new Set(["n/a", "na", "prefer not to say"]);

function distinctResponses(values: unknown[]): string[] {
  const responses = new Map<string, string>();
  for (const value of values) {
    if (typeof value !== "string" || value.trim() === "") continue;
    const normalized = normalizeResponseText(value);
    if (!responses.has(normalized)) responses.set(normalized, value.trim());
  }
  return Array.from(responses.values());
}

function presetLabels(preset: LikertPreset, flipped: boolean, startsAtZero: boolean): ResponseScaleLabel[] {
  return preset.labels.map(({ label, value }) => {
    const baseValue = startsAtZero ? value - 1 : value;
    const mappedValue = flipped
      ? (startsAtZero ? preset.points - 1 - baseValue : preset.points + 1 - baseValue)
      : baseValue;
    return { text: label, value: mappedValue, kind: "scale" };
  });
}

export function buildPresetLabels(
  presetName: string,
  options: { flipped?: boolean; startsAtZero?: boolean } = {},
): ResponseScaleLabel[] {
  const preset = COMMON_LIKERT_SCALES.find(({ name }) => name === presetName);
  if (!preset) throw new Error(`Unknown response-scale preset "${presetName}".`);
  return presetLabels(preset, options.flipped ?? false, options.startsAtZero ?? false);
}

export function matchResponsePreset(values: unknown[]): PresetMatch {
  const responses = distinctResponses(values);
  const words = responses.filter((response) => !BUILT_IN_SPECIAL_WORDS.has(normalizeResponseText(response)));
  const suggestDemographicOrId = words.length > 15;
  let best: { preset: LikertPreset; matched: number } | null = null;
  for (const preset of COMMON_LIKERT_SCALES) {
    const presetWords = new Set(preset.labels.map(({ label }) => normalizeResponseText(label)));
    const matched = words.filter((word) => presetWords.has(normalizeResponseText(word))).length;
    if (matched > words.length / 2 && (!best || matched > best.matched)) {
      best = { preset, matched };
    }
  }

  const matchedPreset = best?.preset ?? null;
  const labels = matchedPreset ? presetLabels(matchedPreset, false, false) : responses.map((text) => ({
    text,
    value: null,
    kind: BUILT_IN_SPECIAL_WORDS.has(normalizeResponseText(text)) ? "special" as const : "scale" as const,
  }));
  const presetWords = matchedPreset
    ? new Set(matchedPreset.labels.map(({ label }) => normalizeResponseText(label)))
    : new Set<string>();
  const extraResponses = responses.filter((response) => !presetWords.has(normalizeResponseText(response)));
  if (matchedPreset) {
    labels.push(...extraResponses.map((text) => ({
      text,
      value: null,
      kind: BUILT_IN_SPECIAL_WORDS.has(normalizeResponseText(text)) ? "special" as const : "scale" as const,
    })));
  }
  return { preset: matchedPreset, labels, extraResponses, suggestDemographicOrId };
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
  if (BUILT_IN_SPECIAL_WORDS.has(normalized)) {
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

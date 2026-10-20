import { COMMON_LIKERT_SCALES, type LikertPreset } from "./detection";

export type ResponseScaleLabelKind = "scale" | "special";
export type OutOfRangeAction = "missing" | "widen";

export interface ResponseScaleLabel {
  text: string;
  value: number | null;
  kind: ResponseScaleLabelKind;
  reverse?: boolean;
}

export interface ResponseScaleLabelSetting {
  label: string;
  value: number | null;
  kind?: ResponseScaleLabelKind;
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

export interface ResponseScaleSettings {
  minValue: number | null;
  maxValue: number | null;
  labelMap: ResponseScaleLabelSetting[];
  confirmed?: boolean;
  outOfRange?: OutOfRangeAction;
  flipped?: boolean;
  startsAtZero?: boolean;
}

export function copyFirstResponseScaleSettings<T extends ResponseScaleSettings>(
  first: T,
  scales: T[],
): T[] {
  return scales.map((scale) => ({
    ...scale,
    minValue: first.minValue,
    maxValue: first.maxValue,
    labelMap: first.labelMap.map((label) => ({ ...label })),
    flipped: first.flipped ?? false,
    startsAtZero: first.startsAtZero ?? false,
    confirmed: first.confirmed === true,
    outOfRange: first.outOfRange,
  }));
}

export type ResolvedResponse =
  | { kind: "blank"; value: null }
  | { kind: "valid"; value: number }
  | { kind: "special_missing"; value: null }
  | { kind: "special_scored"; value: number }
  | { kind: "out_of_range"; value: null; raw: unknown; suggestedAction: OutOfRangeAction }
  | { kind: "unmapped"; value: null; raw: unknown };

const BUILT_IN_NUMERIC_MISSING_CODES = new Set(["-99", "-999"]);
export const BUILT_IN_MISSING_CODES = ["N/A", "NA", "Prefer not to say", "-99", "-999"];
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

export function responseScaleFromLabels(labels: ResponseScaleLabelSetting[], range: NumericRange): ResponseScaleV2 {
  return {
    min: range.min, max: range.max, rangeSource: "manual", confirmed: true,
    flipped: false, startsAtZero: false, outOfRange: "missing",
    labels: labels.map((label) => ({ text: label.label, value: label.value,
      kind: label.kind ?? (label.value === null ? "special" : "scale"), reverse: label.reverse })),
  };
}

export interface OtherResponse { response: string; count: number; kind: "built_in" | "unknown"; value: number | null; }

export function collectOtherResponses(rows: Record<string, unknown>[], columns: string[], scale: ResponseScaleV2): OtherResponse[] {
  const entries = new Map<string, OtherResponse>();
  const builtIns = new Set(BUILT_IN_MISSING_CODES.map(normalizeResponseText));
  for (const row of rows) for (const column of columns) {
    const raw = row[column];
    if (raw == null || String(raw).trim() === "") continue;
    const resolved = resolveResponse(raw, scale);
    if (resolved.kind === "valid") continue;
    const response = String(raw).trim();
    const key = normalizeResponseText(response);
    const existing = entries.get(key);
    if (existing) existing.count += 1;
    else entries.set(key, { response, count: 1,
      kind: builtIns.has(key) || resolved.kind === "special_missing" ? "built_in" : "unknown",
      value: resolved.kind === "special_scored" ? resolved.value : null });
  }
  return [...entries.values()];
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

export interface OutOfRangeCell {
  column: string;
  rowIndex: number;
  rowId?: string;
  value: number;
}

export function findOutOfRangeCells(
  rows: Record<string, unknown>[],
  columns: string[],
  range: NumericRange,
  rowIds: string[] = [],
): OutOfRangeCell[] {
  return rows.flatMap((row, rowIndex) => columns.flatMap((column) => {
    const raw = row[column];
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? parseNumeric(normalizeResponseText(raw)) : null;
    if (value === null || (value >= range.min && value <= range.max)) return [];
    return [{ column, rowIndex, ...(rowIds[rowIndex] ? { rowId: rowIds[rowIndex] } : {}), value }];
  }));
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
  hasReverseItems = false,
): OutOfRangeActionResult {
  const log = { action, count: values.length, values: [...values] };
  if (action === "missing") return { scale: { ...scale, confirmed: hasReverseItems ? false : scale.confirmed }, log };
  return {
    scale: {
      ...scale,
      min: Math.min(scale.min, ...values),
      max: Math.max(scale.max, ...values),
      rangeSource: "manual",
      confirmed: hasReverseItems ? false : true,
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

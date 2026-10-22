import { COMMON_LIKERT_SCALES, type LikertPreset } from "./detection";

export type ResponseScaleLabelKind = "scale" | "special";
export type OutOfRangeAction = "missing" | "widen";

export interface ResponseScaleLabel {
  text: string;
  value: number | null;
  kind: ResponseScaleLabelKind;
  reverse?: boolean;
  notScored?: boolean;
  aliasOf?: string;
  manual?: boolean;
  manualLabel?: boolean;
}

export interface ResponseScaleLabelSetting {
  label: string;
  value: number | null;
  kind?: ResponseScaleLabelKind;
  reverse?: boolean;
  notScored?: boolean;
  aliasOf?: string;
  manual?: boolean;
  manualLabel?: boolean;
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
export const BUILT_IN_MISSING_CODES = [
  "N/A", "NA", "Not applicable", "Prefer not to say", "Prefer not to answer", "Don't know", "Dont know", "DK",
  "Refused", "No answer", "No response", "Skipped", "Missing", "Unknown", "-99", "-999",
];
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
  return value.normalize("NFKC").trim().replace(/[-_]/g, " ").replace(/\s+/g, " ").replace(/[\p{P}\p{S}]+$/gu, "").toLocaleLowerCase();
}

const BUILT_IN_SPECIAL_WORDS = new Set(BUILT_IN_MISSING_CODES.filter((value) => !BUILT_IN_NUMERIC_MISSING_CODES.has(value)).map(normalizeResponseText));

export function isBuiltInMissingCode(value: unknown): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const text = String(value).normalize("NFKC").trim();
  return BUILT_IN_NUMERIC_MISSING_CODES.has(text) || BUILT_IN_SPECIAL_WORDS.has(normalizeResponseText(text));
}

export function responseScaleFromLabels(labels: ResponseScaleLabelSetting[], range: NumericRange): ResponseScaleV2 {
  return {
    min: range.min, max: range.max, rangeSource: "manual", confirmed: true,
    flipped: false, startsAtZero: false, outOfRange: "missing",
    labels: labels.map((label) => ({ text: label.label, value: label.value,
      kind: label.kind ?? (label.value === null ? "special" : "scale"), reverse: label.reverse,
      aliasOf: label.aliasOf, notScored: label.notScored, manual: label.manual, manualLabel: label.manualLabel })),
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
  const tWeak = Math.max(1, Math.floor(0.01 * numeric.length));
  const tOut = Math.max(2, Math.floor(0.01 * numeric.length));
  const weakEnd = numeric.filter((value) => value === range.min).length <= tWeak
    || numeric.filter((value) => value === range.max).length <= tWeak;
  let selectedRange = range;
  if (weakEnd) {
    const replacements = CONVENTIONAL_RANGES
      .filter((possible) => (possible.max - possible.min) < (range.max - range.min))
      .filter((possible) => numeric.filter((value) => value === possible.min).length > tWeak
        && numeric.filter((value) => value === possible.max).length > tWeak)
      .map((possible) => ({
        range: { min: possible.min, max: possible.max },
        outside: numeric.filter((value) => value < possible.min || value > possible.max).length,
      }))
      .filter((possible) => possible.outside <= tOut)
      .sort((left, right) => left.outside - right.outside
        || (left.range.max - left.range.min) - (right.range.max - right.range.min));
    if (replacements.length > 0) selectedRange = replacements[0].range;
  }
  const inRange = numeric.filter((value) => value >= selectedRange.min && value <= selectedRange.max).length;
  return {
    range: selectedRange,
    confirmed: false,
    coverage: inRange / numeric.length,
    isContinuous: false,
    outOfRange: assessRangeOutliers(numeric, selectedRange),
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

function distinctResponses(values: unknown[]): string[] {
  const responses = new Map<string, string>();
  for (const value of values) {
    if (typeof value !== "string" || value.trim() === "") continue;
    const normalized = normalizeResponseText(value);
    if (!responses.has(normalized)) responses.set(normalized, value.trim());
  }
  return Array.from(responses.values());
}

export function presetLabelForText(preset: LikertPreset, value: string): LikertPreset['labels'][number] | undefined {
  const normalized = normalizeResponseText(value);
  return preset.labels.find(({ label, aliases = [] }) =>
    [label, ...aliases].some((candidate) => normalizeResponseText(candidate) === normalized),
  );
}

export function matchingResponsePresets(values: unknown[]): { preset: LikertPreset; matched: number }[] {
  const words = distinctResponses(values).filter((response) => !isBuiltInMissingCode(response));
  return COMMON_LIKERT_SCALES.map((preset) => ({
    preset,
    matched: words.filter((word) => !!presetLabelForText(preset, word)).length,
  })).filter(({ matched }) => matched >= 3 && matched > words.length / 2)
    .sort((a, b) => b.matched - a.matched || a.preset.points - b.preset.points || COMMON_LIKERT_SCALES.indexOf(a.preset) - COMMON_LIKERT_SCALES.indexOf(b.preset));
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
  const words = responses.filter((response) => !isBuiltInMissingCode(response));
  const suggestDemographicOrId = words.length > 15;
  const matchedPreset = matchingResponsePresets(words)[0]?.preset ?? null;
  const labels = matchedPreset ? presetLabels(matchedPreset, false, false) : responses.map((text) => ({
    text,
    value: null,
    kind: isBuiltInMissingCode(text) ? "special" as const : "scale" as const,
  }));
  const extraResponses = responses.filter((response) => !matchedPreset || !presetLabelForText(matchedPreset, response));
  if (matchedPreset) {
    labels.push(...extraResponses.map((text) => ({
      text,
      value: null,
      kind: isBuiltInMissingCode(text) ? "special" as const : "scale" as const,
    })));
  }
  return { preset: matchedPreset, labels, extraResponses, suggestDemographicOrId };
}

export interface SeededResponseScale {
  scaleType: "numeric" | "categorical";
  labelMap: ResponseScaleLabelSetting[];
  labelSource: "detected";
  minValue: number | null;
  maxValue: number | null;
  baseMin: number | null;
  baseMax: number | null;
  rangeSource: "detected" | "preset";
  flipped: boolean;
  startsAtZero: boolean;
  presetName?: string;
}

const NUMBERED_LABEL = /^\s*(?:\(\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)|(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:[-=:.]|\))\s*)(.+?)\s*$/u;

function numberedLabel(label: string): { number: number; text: string } | null {
  const match = label.match(NUMBERED_LABEL);
  if (!match) return null;
  const number = Number(match[1] ?? match[2]);
  return Number.isFinite(number) ? { number, text: match[3].trim() } : null;
}

function distinctObservedLabels(values: unknown[]): string[] {
  const found = new Map<string, { first: string; variants: Map<string, number> }>();
  for (const value of values) {
    if (typeof value !== "string" || value.trim() === "" || isBuiltInMissingCode(value) || Number.isFinite(Number(value))) continue;
    const key = normalizeResponseText(value);
    const label = value.trim();
    const existing = found.get(key);
    if (!existing) found.set(key, { first: label, variants: new Map([[label, 1]]) });
    else existing.variants.set(label, (existing.variants.get(label) ?? 0) + 1);
  }
  return [...found.values()].map(({ first, variants }) => [...variants.entries()]
    .reduce((best, candidate) => candidate[1] > best[1] ? candidate : best, [first, variants.get(first) ?? 0])[0]);
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value.trim());
  return Number.isFinite(number) ? number : null;
}

function scaleDataMode(values: unknown[]): "numeric" | "word" | "continuous" | "demographic" {
  const usable = values.filter((value) => value != null && String(value).trim() !== "" && !isBuiltInMissingCode(value));
  const text = usable.filter((value) => numericValue(value) === null);
  const distinctText = new Set(text.map((value) => normalizeResponseText(String(value))));
  if (distinctText.size > 15) return "demographic";
  if (usable.some((value) => { const number = numericValue(value); return number !== null && !Number.isInteger(number); })) return "continuous";
  return text.length >= usable.length / 2 ? "word" : "numeric";
}

export function seedResponseScale(rows: Record<string, unknown>[], columns: string[]): SeededResponseScale {
  const values = columns.flatMap((column) => rows.map((row) => row[column]));
  const numeric = values.map(numericValue).filter((value): value is number => value !== null && !isBuiltInMissingCode(value));
  const mode = scaleDataMode(values);
  const observed = distinctObservedLabels(values);
  const numbered = observed.map((label) => numberedLabel(label));
  const hasCompleteNumbering = observed.length > 0 && numbered.every((entry) => entry !== null)
    && new Set(numbered.map((entry) => entry!.number)).size === numbered.length;
  const matchValues = hasCompleteNumbering ? numbered.map((entry) => entry!.text) : observed;
  const preset = mode === "word" ? matchResponsePreset(matchValues).preset : null;
  const points = preset?.labels ?? [];
  const labels: ResponseScaleLabelSetting[] = [];

  for (const label of observed) {
    const numberIndex = observed.findIndex((candidate) => normalizeResponseText(candidate) === normalizeResponseText(label));
    const number = hasCompleteNumbering ? numbered[numberIndex] : null;
    const point = preset ? presetLabelForText(preset, number?.text ?? label) : undefined;
    labels.push({
      label,
      value: hasCompleteNumbering ? number!.number : point?.value ?? null,
      kind: "scale",
      manual: false,
    });
  }
  for (const value of values) {
    if (typeof value !== "string" || !isBuiltInMissingCode(value)) continue;
    const label = value.trim();
    const key = normalizeResponseText(label);
    if (!labels.some((entry) => entry.kind === "special" && normalizeResponseText(entry.label) === key)) {
      labels.push({ label, value: null, kind: "special", notScored: true, manual: false });
    }
  }
  if (preset && !hasCompleteNumbering) {
    for (const point of preset.labels) {
      if (!labels.some((entry) => entry.kind !== "special" && entry.value === point.value && !entry.notScored)) {
        labels.push({ label: point.label, value: point.value, kind: "scale", manual: false });
      }
    }
  }

  let minValue: number | null = null;
  let maxValue: number | null = null;
  let rangeSource: SeededResponseScale["rangeSource"] = "detected";
  if (mode === "word") {
    const mappedValues = hasCompleteNumbering
      ? numbered.map((entry) => entry!.number)
      : preset ? points.map((point) => point.value) : [];
    if (mappedValues.length > 0) {
      minValue = Math.min(...mappedValues);
      maxValue = Math.max(...mappedValues);
      if (preset && !hasCompleteNumbering) rangeSource = "preset";
    }
  } else if (numeric.length > 0 && mode !== "demographic") {
    try {
      const range = detectConventionalRange(numeric).range;
      minValue = range.min;
      maxValue = range.max;
    } catch {
      minValue = Math.min(...numeric);
      maxValue = Math.max(...numeric);
    }
  }
  return {
    scaleType: "numeric",
    labelMap: mode === "demographic" ? [] : labels,
    labelSource: "detected",
    minValue,
    maxValue,
    baseMin: minValue,
    baseMax: maxValue,
    rangeSource,
    flipped: false,
    startsAtZero: false,
    presetName: preset?.name,
  };
}

export function detectDifferentPresets(values: unknown[]): boolean {
  return matchingResponsePresets(values).length > 1;
}

export function detectDifferentPresetsAcrossColumns(rows: Record<string, unknown>[], columns: string[]): boolean {
  const matchedNames = new Set<string>();
  for (const column of columns) {
    const preset = matchingResponsePresets(rows.map((row) => row[column]))[0]?.preset;
    if (preset) matchedNames.add(preset.name);
  }
  return matchedNames.size > 1;
}

export function resolveResponse(raw: unknown, scale: ResponseScaleV2): ResolvedResponse {
  if (raw == null) return { kind: "blank", value: null };
  if (typeof raw !== "string" && (typeof raw !== "number" || !Number.isFinite(raw))) {
    return { kind: "unmapped", value: null, raw };
  }

  const text = String(raw);
  if (text.trim() === "") return { kind: "blank", value: null };
  const normalized = normalizeResponseText(text);
  const labelsByKey = new Map(scale.labels.map((candidate) => [normalizeResponseText(candidate.text), candidate]));
  let label = labelsByKey.get(normalized);
  if (label) {
    if (label.notScored) return { kind: "special_missing", value: null };
    const visited = new Set<string>();
    while (label.aliasOf) {
      const aliasKey = normalizeResponseText(label.text);
      if (visited.has(aliasKey)) return { kind: "unmapped", value: null, raw };
      visited.add(aliasKey);
      const target = labelsByKey.get(normalizeResponseText(label.aliasOf));
      if (!target) return { kind: "unmapped", value: null, raw };
      label = target;
      if (label.notScored) return { kind: "special_missing", value: null };
    }
    if (label.value === null) {
      return label.kind === "special" ? { kind: "special_missing", value: null } : { kind: "unmapped", value: null, raw };
    }
    const value = label.reverse ? reverseValue(label.value, scale) : label.value;
    return {
      kind: label.kind === "special" ? "special_scored" : "valid",
      value,
    };
  }
  if (isBuiltInMissingCode(raw)) return { kind: "special_missing", value: null };

  const numeric = typeof raw === "number" ? raw : parseNumeric(text.trim());
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

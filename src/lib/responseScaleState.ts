import { COMMON_LIKERT_SCALES } from '../scientific/detection';

export type RangeSource = 'detected' | 'manual' | 'preset';
export type DecisionAction = 'missing' | 'widen';
export type LabelSource = 'detected' | 'preset' | 'manual';
export type ResponseScaleLabelEntry = {
  label: string;
  value: number | null;
  kind?: 'scale' | 'special';
  reverse?: boolean;
  notScored?: boolean;
  aliasOf?: string;
  manual?: boolean;
  manualLabel?: boolean;
};
export interface ValueDecision { action: DecisionAction; reviewed: boolean; }
export interface ScaleRangeState {
  minValue: number | null;
  maxValue: number | null;
  baseMin?: number | null;
  baseMax?: number | null;
  rangeSource?: RangeSource;
  confirmed?: boolean;
  hasReverseItems?: boolean;
  labelMap?: ResponseScaleLabelEntry[];
  labelSource?: LabelSource;
  presetName?: string;
  outOfRangeDecisions?: Record<string, ValueDecision>;
  outOfRangeDecision?: { action: DecisionAction; values: number[]; cells?: string[]; originalMin?: number; originalMax?: number };
  outOfRange?: DecisionAction;
  flipped?: boolean;
  startsAtZero?: boolean;
}
export function effectiveRange(
  baseMin: number | null | undefined,
  baseMax: number | null | undefined,
  decisions: Record<string, ValueDecision> = {},
): { min: number | null; max: number | null } {
  if (baseMin == null || baseMax == null) return { min: baseMin ?? null, max: baseMax ?? null };
  const widened = Object.entries(decisions).filter(([, decision]) => decision.action === 'widen').map(([text]) => Number(text)).filter(Number.isFinite);
  return { min: Math.min(baseMin, ...widened), max: Math.max(baseMax, ...widened) };
}

function withEffective<T extends ScaleRangeState>(state: T): T {
  const range = effectiveRange(state.baseMin ?? state.minValue, state.baseMax ?? state.maxValue, state.outOfRangeDecisions);
  return { ...state, minValue: range.min, maxValue: range.max };
}

export function setTypedRange<T extends ScaleRangeState>(state: T, min: number, max: number): T {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max
      || (state.minValue === min && state.maxValue === max && state.rangeSource === 'manual')) return state;
  const decisions = Object.fromEntries(Object.entries(state.outOfRangeDecisions ?? {}).map(([value, decision]) =>
    [value, decision.action === 'widen' ? { action: 'missing' as const, reviewed: decision.reviewed } : decision]));
  return { ...state, minValue: min, maxValue: max, baseMin: min, baseMax: max, rangeSource: 'manual', labelSource: 'manual', outOfRangeDecisions: decisions,
    confirmed: state.hasReverseItems ? false : state.confirmed };
}

export function setPresetRange<T extends ScaleRangeState>(state: T, min: number, max: number): T {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min >= max) return state;
  const next = afterScaleChange(state, { baseMin: min, baseMax: max, rangeSource: 'preset' as const } as Partial<T>);
  return withEffective(next);
}

export function chooseDecision<T extends ScaleRangeState>(
  state: T,
  value: string,
  choice: { type: 'widen'; value?: number } | { type: 'missing' } | { type: 'typed'; number: number; kind?: 'scale' | 'special' } | { type: 'reviewed' },
): T {
  const labelMap = [...(state.labelMap ?? [])];
  const normalized = normalizedLabelKey(value);
  const index = labelMap.findIndex((label) => normalizedLabelKey(label.label) === normalized);
  let nextLabels = labelMap;
  let decision: ValueDecision = { action: 'missing', reviewed: true };
  if (choice.type === 'widen') {
    nextLabels = labelMap.filter((label) => normalizedLabelKey(label.label) !== normalized);
    decision = { action: 'widen', reviewed: true };
  } else if (choice.type === 'typed') {
    nextLabels = index >= 0
      ? labelMap.map((label, i) => i === index ? { ...label, value: choice.number, notScored: false, aliasOf: undefined, manual: true } : label)
      : [...labelMap, { label: value, value: choice.number, kind: choice.kind ?? 'scale', manual: true }];
  } else if (choice.type === 'missing' || choice.type === 'reviewed') {
    const old = index >= 0 ? labelMap[index] : { label: value, value: null, kind: choice.type === 'missing' ? 'scale' as const : 'special' as const };
    const notScored = { ...old, value: null, notScored: true, aliasOf: undefined, manual: true };
    nextLabels = index >= 0
      ? labelMap.map((label, i) => i === index ? notScored : label)
      : [...labelMap, notScored];
  } else {
    nextLabels = labelMap.filter((label) => normalizedLabelKey(label.label) !== normalized);
  }
  const decisions = { ...(state.outOfRangeDecisions ?? {}), [value]: decision };
  const previousDecision = state.outOfRangeDecisions?.[value];
  const previousLabel = state.labelMap?.find((label) => normalizedLabelKey(label.label) === normalized);
  const nextLabel = nextLabels.find((label) => normalizedLabelKey(label.label) === normalized);
  const changed = (previousDecision?.action ?? 'missing') !== decision.action
    || (choice.type === 'typed' && previousLabel?.value !== choice.number)
    || (choice.type !== 'typed' && previousLabel?.value != null && nextLabel?.value == null)
    || (choice.type === 'missing' && !!previousLabel && previousLabel.notScored !== true);
  const range = effectiveRange(state.baseMin ?? state.minValue, state.baseMax ?? state.maxValue, decisions);
  const next = { ...state, labelMap: nextLabels, labelSource: 'manual', outOfRangeDecisions: decisions, minValue: range.min, maxValue: range.max,
    confirmed: changed && state.hasReverseItems ? false : state.confirmed } as T;
  return next;
}

export function confirmRange<T extends ScaleRangeState>(state: T): T { return { ...state, confirmed: true }; }

export function afterScaleChange<T extends ScaleRangeState>(state: T, patch: Partial<T>): T {
  const next = { ...state, ...patch } as T;
  const currentRecord = state as unknown as Record<string, unknown>;
  const patchRecord = patch as unknown as Record<string, unknown>;
  const changed = Object.keys(patch).some((key) => JSON.stringify(currentRecord[key]) !== JSON.stringify(patchRecord[key]));
  if (changed && state.hasReverseItems) next.confirmed = false;
  return next;
}

export function seedDetectedRange<T extends ScaleRangeState>(state: T, min: number, max: number): T {
  if (state.rangeSource !== 'detected') return state;
  if (state.baseMin === min && state.baseMax === max) return state;
  return withEffective(afterScaleChange(state, { baseMin: min, baseMax: max } as Partial<T>));
}

export function migrateRangeState<T extends ScaleRangeState>(input: T): T {
  const rangeSource = input.rangeSource ?? (input.confirmed ? 'manual' : 'detected');
  const legacy = input.outOfRangeDecision;
  const baseMin = input.baseMin ?? (legacy?.action === 'widen' ? legacy.originalMin : input.minValue);
  const baseMax = input.baseMax ?? (legacy?.action === 'widen' ? legacy.originalMax : input.maxValue);
  const decisions = { ...(input.outOfRangeDecisions ?? {}) };
  if (!input.outOfRangeDecisions && legacy) for (const value of legacy.values) {
    decisions[String(value)] = { action: legacy.action, reviewed: true };
  }
  const migrated = { ...input, rangeSource, baseMin, baseMax, outOfRangeDecisions: decisions } as T;
  return withEffective(migrated);
}

export function normalizedLabelKey(label: string): string {
  return label.normalize('NFKC').trim().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').replace(/[\p{P}\p{S}]+$/gu, '').toLocaleLowerCase();
}

function labelValue(state: Pick<ScaleRangeState, 'labelMap'>, entry: ResponseScaleLabelEntry, seen = new Set<string>()): number | null {
  if (entry.notScored) return null;
  if (!entry.aliasOf) return entry.value;
  const key = normalizedLabelKey(entry.label);
  if (seen.has(key)) return null;
  seen.add(key);
  const target = state.labelMap?.find((candidate) => normalizedLabelKey(candidate.label) === normalizedLabelKey(entry.aliasOf!));
  return target ? labelValue(state, target, seen) : null;
}

function refreshWordRange<T extends ScaleRangeState>(state: T): T {
  const values = (state.labelMap ?? []).filter((entry) => (entry.kind ?? 'scale') === 'scale')
    .map((entry) => labelValue(state, entry)).filter((value): value is number => value !== null && Number.isFinite(value));
  // No scale-word numbers: keep any existing range (never blank the boxes because of specials/others).
  if (values.length === 0) {
    if (state.minValue != null && state.maxValue != null) return state;
    return { ...state, minValue: null, maxValue: null, baseMin: null, baseMax: null };
  }
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  return { ...state, minValue, maxValue, baseMin: minValue, baseMax: maxValue,
    rangeSource: state.labelSource === 'preset' ? 'preset' : 'manual' };
}

function findLabelIndex(state: ScaleRangeState, label: string): number {
  return (state.labelMap ?? []).findIndex((entry) => normalizedLabelKey(entry.label) === normalizedLabelKey(label));
}

export function setWordLabelNumber<T extends ScaleRangeState>(
  state: T,
  label: string,
  value: number | null,
  forceKind?: 'scale' | 'special',
): T {
  if (value !== null && !Number.isFinite(value)) return state;
  const labels = [...(state.labelMap ?? [])];
  const index = findLabelIndex(state, label);
  const existing = index >= 0 ? labels[index] : undefined;
  const kind: 'scale' | 'special' = forceKind
    ?? existing?.kind
    ?? (isBuiltInMissingLabel(label) ? 'special' : 'scale');
  const entry = existing ?? { label, value: null, kind };
  const updated: ResponseScaleLabelEntry = {
    ...entry,
    value,
    kind,
    // Scale points with an empty box still need a number (blocks scoring).
    // Specials/other answers: empty = not scored by default (does not block).
    notScored: kind === 'special' ? value === null : false,
    aliasOf: undefined,
    manual: true,
  };
  const next = {
    ...state,
    labelMap: index >= 0
      ? labels.map((candidate, position) => (position === index ? updated : candidate))
      : [...labels, updated],
    labelSource: 'manual' as const,
  } as T;
  if (kind === 'special') return next;
  return refreshWordRange(next);
}

function isBuiltInMissingLabel(label: string): boolean {
  const key = normalizedLabelKey(label);
  return [
    'n/a', 'na', 'not applicable', 'prefer not to say', 'prefer not to answer',
    "don't know", 'dont know', 'dk', 'refused', 'no answer', 'no response',
    'skipped', 'missing', 'unknown', '-99', '-999',
  ].includes(key);
}

export function aliasResponseLabel<T extends ScaleRangeState>(state: T, label: string, targetLabel: string): T {
  const target = (state.labelMap ?? []).find((entry) => normalizedLabelKey(entry.label) === normalizedLabelKey(targetLabel));
  if (!target || normalizedLabelKey(targetLabel) === normalizedLabelKey(label)) return state;
  const index = findLabelIndex(state, label);
  const entry = index >= 0 ? state.labelMap![index] : { label, value: null, kind: 'scale' as const };
  const updated: ResponseScaleLabelEntry = { ...entry, value: labelValue(state, target), aliasOf: target.label, notScored: false, kind: 'scale', manual: true };
  const labels = index >= 0 ? state.labelMap!.map((candidate, position) => position === index ? updated : candidate) : [...(state.labelMap ?? []), updated];
  return refreshWordRange({ ...state, labelMap: labels, labelSource: 'manual' } as T);
}

export function markResponseLabelNotScored<T extends ScaleRangeState>(state: T, label: string): T {
  const labels = [...(state.labelMap ?? [])];
  const index = findLabelIndex(state, label);
  const entry = index >= 0 ? labels[index] : { label, value: null, kind: 'scale' as const };
  const updated: ResponseScaleLabelEntry = { ...entry, value: null, notScored: true, aliasOf: undefined, manual: true };
  const next = { ...state, labelMap: index >= 0 ? labels.map((candidate, position) => position === index ? updated : candidate) : [...labels, updated], labelSource: 'manual' as const } as T;
  return (updated.kind ?? 'scale') === 'special' ? next : refreshWordRange(next);
}

export function addResponseLabel<T extends ScaleRangeState>(state: T, label: string, value: number | null = null): T {
  if (!label.trim() || findLabelIndex(state, label) >= 0 || (value !== null && !Number.isFinite(value))) return state;
  const next = { ...state, labelMap: [...(state.labelMap ?? []), { label: label.trim(), value, kind: 'scale' as const, manual: true, manualLabel: true }], labelSource: 'manual' as const } as T;
  return refreshWordRange(next);
}

export function editManualResponseLabel<T extends ScaleRangeState>(state: T, oldLabel: string, newLabel: string): T {
  const index = findLabelIndex(state, oldLabel);
  if (index < 0 || !newLabel.trim() || findLabelIndex(state, newLabel) >= 0 && normalizedLabelKey(oldLabel) !== normalizedLabelKey(newLabel)) return state;
  const old = state.labelMap![index];
  const labels = state.labelMap!.map((entry, position) => position === index ? { ...entry, label: newLabel.trim(), manual: true, manualLabel: true } : entry)
    .map((entry) => entry.aliasOf && normalizedLabelKey(entry.aliasOf) === normalizedLabelKey(old.label) ? { ...entry, aliasOf: newLabel.trim() } : entry);
  return refreshWordRange({ ...state, labelMap: labels, labelSource: 'manual' } as T);
}

export function removeResponseLabel<T extends ScaleRangeState>(state: T, label: string): T {
  const labels = (state.labelMap ?? []).filter((entry) => normalizedLabelKey(entry.label) !== normalizedLabelKey(label));
  if (labels.length === (state.labelMap ?? []).length) return state;
  return refreshWordRange({ ...state, labelMap: labels, labelSource: 'manual' } as T);
}

export function chooseResponsePreset<T extends ScaleRangeState>(state: T, presetName: string): T {
  const preset = COMMON_LIKERT_SCALES.find((candidate) => candidate.name === presetName);
  if (!preset) return state;
  const labels = [...(state.labelMap ?? [])].map((entry) => {
    if (entry.manual || entry.kind === 'special' || entry.notScored) return entry;
    const point = preset.labels.find(({ label: canonical, aliases = [] }) => [canonical, ...aliases].some((candidate) => normalizedLabelKey(candidate) === normalizedLabelKey(entry.label)));
    return { ...entry, value: point?.value ?? null, aliasOf: undefined };
  });
  for (const point of preset.labels) if (!labels.some((entry) => entry.kind !== 'special' && labelValue({ labelMap: labels }, entry) === point.value)) {
    labels.push({ label: point.label, value: point.value, kind: 'scale', manual: false });
  }
  const next = { ...state, labelMap: labels, labelSource: 'preset' as const, presetName,
    flipped: false, startsAtZero: false, rangeSource: 'preset' as const,
    minValue: 1, maxValue: preset.points, baseMin: 1, baseMax: preset.points } as T;
  return next;
}

export function togglePresetFlip<T extends ScaleRangeState>(state: T): T {
  if (!state.presetName) return state;
  const preset = COMMON_LIKERT_SCALES.find((candidate) => candidate.name === state.presetName);
  if (!preset) return state;
  const flipped = !state.flipped;
  const labels = (state.labelMap ?? []).map((entry) => {
    if (entry.manual || entry.kind === 'special' || entry.notScored) return entry;
    const point = preset.labels.find(({ label, aliases = [] }) => [label, ...aliases].some((candidate) => normalizedLabelKey(candidate) === normalizedLabelKey(entry.label)));
    if (!point) return entry;
    const baseValue = (state.startsAtZero ? point.value - 1 : point.value);
    return { ...entry, value: flipped ? (state.startsAtZero ? preset.points - 1 - baseValue : preset.points + 1 - baseValue) : baseValue };
  });
  const minValue = state.startsAtZero ? 0 : 1;
  const maxValue = state.startsAtZero ? preset.points - 1 : preset.points;
  return { ...state, labelMap: labels, flipped, minValue, maxValue, baseMin: minValue, baseMax: maxValue,
    rangeSource: 'preset', labelSource: state.labelSource } as T;
}

export function togglePresetStartAtZero<T extends ScaleRangeState>(state: T): T {
  if (!state.presetName) return state;
  const preset = COMMON_LIKERT_SCALES.find((candidate) => candidate.name === state.presetName);
  if (!preset) return state;
  const startsAtZero = !state.startsAtZero;
  const labels = (state.labelMap ?? []).map((entry) => {
    if (entry.manual || entry.kind === 'special' || entry.notScored) return entry;
    const point = preset.labels.find(({ label, aliases = [] }) => [label, ...aliases].some((candidate) => normalizedLabelKey(candidate) === normalizedLabelKey(entry.label)));
    if (!point) return entry;
    const baseValue = startsAtZero ? point.value - 1 : point.value;
    const value = state.flipped ? (startsAtZero ? preset.points - 1 - baseValue : preset.points + 1 - baseValue) : baseValue;
    return { ...entry, value };
  });
  const minValue = startsAtZero ? 0 : 1;
  const maxValue = startsAtZero ? preset.points - 1 : preset.points;
  return { ...state, labelMap: labels, startsAtZero, minValue, maxValue, baseMin: minValue, baseMax: maxValue, rangeSource: 'preset' } as T;
}

export function resetResponseScaleToDetected<T extends ScaleRangeState>(state: T, seed: Partial<T>): T {
  const keys = ['scaleType', 'minValue', 'maxValue', 'baseMin', 'baseMax', 'rangeSource', 'labelMap', 'labelSource', 'presetName', 'flipped', 'startsAtZero', 'outOfRangeDecisions', 'outOfRangeDecision', 'outOfRange'];
  const seedRecord = seed as unknown as Record<string, unknown>;
  const patch = Object.fromEntries(keys.map((key) => [key, seedRecord[key] ?? (key === 'labelMap' ? [] : key === 'outOfRangeDecisions' ? {} : key === 'flipped' || key === 'startsAtZero' ? false : seedRecord[key])])) as Partial<T>;
  return { ...state, ...patch, confirmed: state.hasReverseItems ? false : seed.confirmed ?? state.confirmed };
}

export function responseScaleMatchesSeed(state: ScaleRangeState, seed: Partial<ScaleRangeState>): boolean {
  const stateRecord = state as unknown as Record<string, unknown>;
  const seedRecord = seed as unknown as Record<string, unknown>;
  const keys = ['minValue', 'maxValue', 'baseMin', 'baseMax', 'rangeSource', 'labelMap', 'labelSource', 'presetName', 'flipped', 'startsAtZero', 'confirmed', 'outOfRangeDecisions', 'outOfRangeDecision', 'outOfRange'];
  return keys.every((key) => JSON.stringify(stateRecord[key] ?? (key === 'labelMap' ? [] : key === 'outOfRangeDecisions' ? {} : undefined))
    === JSON.stringify(seedRecord[key] ?? (key === 'labelMap' ? [] : key === 'outOfRangeDecisions' ? {} : undefined)));
}


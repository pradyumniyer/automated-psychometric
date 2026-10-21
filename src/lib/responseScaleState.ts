export type RangeSource = 'detected' | 'manual' | 'preset';
export type DecisionAction = 'missing' | 'widen';
export interface ValueDecision { action: DecisionAction; reviewed: boolean; }
export interface ScaleRangeState {
  minValue: number | null;
  maxValue: number | null;
  baseMin?: number | null;
  baseMax?: number | null;
  rangeSource?: RangeSource;
  confirmed?: boolean;
  hasReverseItems?: boolean;
  labelMap?: { label: string; value: number | null; kind?: 'scale' | 'special'; reverse?: boolean }[];
  outOfRangeDecisions?: Record<string, ValueDecision>;
  outOfRangeDecision?: { action: DecisionAction; values: number[]; cells?: string[]; originalMin?: number; originalMax?: number };
  outOfRange?: DecisionAction;
  flipped?: boolean;
  startsAtZero?: boolean;
  [key: string]: unknown;
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
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min >= max
      || (state.minValue === min && state.maxValue === max)) return state;
  const decisions = Object.fromEntries(Object.entries(state.outOfRangeDecisions ?? {}).map(([value, decision]) =>
    [value, decision.action === 'widen' ? { action: 'missing' as const, reviewed: decision.reviewed } : decision]));
  return { ...state, minValue: min, maxValue: max, baseMin: min, baseMax: max, rangeSource: 'manual', outOfRangeDecisions: decisions,
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
  const index = labelMap.findIndex((label) => label.label === value);
  let nextLabels = labelMap;
  let decision: ValueDecision = { action: 'missing', reviewed: true };
  if (choice.type === 'widen') {
    nextLabels = labelMap.filter((label) => label.label !== value);
    decision = { action: 'widen', reviewed: true };
  } else if (choice.type === 'typed') {
    nextLabels = index >= 0
      ? labelMap.map((label, i) => i === index ? { ...label, value: choice.number } : label)
      : [...labelMap, { label: value, value: choice.number, kind: choice.kind ?? 'scale' }];
  } else {
    nextLabels = labelMap.filter((label) => label.label !== value);
  }
  const decisions = { ...(state.outOfRangeDecisions ?? {}), [value]: decision };
  const previousDecision = state.outOfRangeDecisions?.[value];
  const previousLabel = state.labelMap?.find((label) => label.label === value);
  const nextLabel = nextLabels.find((label) => label.label === value);
  const changed = (previousDecision?.action ?? 'missing') !== decision.action
    || (choice.type === 'typed' && previousLabel?.value !== choice.number)
    || (choice.type !== 'typed' && previousLabel?.value != null && nextLabel?.value == null);
  const range = effectiveRange(state.baseMin ?? state.minValue, state.baseMax ?? state.maxValue, decisions);
  const next = { ...state, labelMap: nextLabels, outOfRangeDecisions: decisions, minValue: range.min, maxValue: range.max,
    confirmed: changed && state.hasReverseItems ? false : state.confirmed } as T;
  return next;
}

export function confirmRange<T extends ScaleRangeState>(state: T): T { return { ...state, confirmed: true }; }

export function afterScaleChange<T extends ScaleRangeState>(state: T, patch: Partial<T>): T {
  const next = { ...state, ...patch } as T;
  const changed = Object.keys(patch).some((key) => JSON.stringify(state[key]) !== JSON.stringify(patch[key]));
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

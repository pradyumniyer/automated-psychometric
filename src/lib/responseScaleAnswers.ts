import {
  isBuiltInMissingCode,
  matchResponsePreset,
  normalizeResponseText,
  presetLabelForText,
  type ResponseScaleLabelSetting,
} from '../scientific/responseScales';
import type { LikertPreset } from '../scientific/detection';

export type ResponseMode = 'numeric' | 'word' | 'continuous' | 'demographic';
export type AnswerRowKind = 'scale' | 'special' | 'out_of_range' | 'unknown';

export interface AnswerTableInput {
  rows: Record<string, unknown>[];
  columns: string[];
  min: number | null;
  max: number | null;
  labels: ResponseScaleLabelSetting[];
  baseMin?: number | null;
  baseMax?: number | null;
  outOfRangeDecisions?: Record<string, { action: 'missing' | 'widen'; reviewed: boolean }>;
  displayIds?: string[];
  excludedRows?: Set<number>;
  preset?: { name: string; labels: { label: string; value: number; aliases?: string[] }[] };
}

export interface AnswerCellRef {
  column: string;
  rowIndex: number;
  displayId?: string;
}

export interface AnswerTableRow {
  answer: string;
  found: number;
  kind: AnswerRowKind;
  countsAs: number | null;
  review: boolean;
  grey: boolean;
  reversed: boolean;
  decision?: '' | 'missing' | 'widen';
  cells: AnswerCellRef[];
  excludedOnly?: boolean;
  suggestion?: string;
  manual?: boolean;
  manualLabel?: boolean;
  notScored?: boolean;
  aliasOf?: string;
}

export interface AnswerTableResult {
  mode: ResponseMode;
  rows: AnswerTableRow[];
  range: { min: number; max: number } | null;
  presetName?: string;
  hasDifferentPresets?: boolean;
}

export interface PendingResponseAnswer {
  subscaleId: string;
  subscaleName: string;
  answer: AnswerTableRow;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isBlank(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

export function detectResponseMode(values: unknown[]): ResponseMode {
  const nonBlank = values.filter((value) => !isBlank(value) && !isBuiltInMissingCode(value));
  const textValues = nonBlank.filter((value) => numberValue(value) === null);
  const distinctText = new Set(textValues.map((value) => normalizeResponseText(String(value))));
  if (distinctText.size > 15) return 'demographic';
  if (nonBlank.some((value) => {
    const number = numberValue(value);
    return number !== null && !Number.isInteger(number);
  })) return 'continuous';
  return textValues.length >= nonBlank.length / 2 ? 'word' : 'numeric';
}

function resolveLabelValue(label: ResponseScaleLabelSetting | undefined, labels: ResponseScaleLabelSetting[], seen = new Set<string>()): number | null {
  if (!label || label.notScored) return null;
  if (!label.aliasOf) return label.value;
  const key = normalizeResponseText(label.label);
  if (seen.has(key)) return null;
  seen.add(key);
  const target = labels.find((entry) => normalizeResponseText(entry.label) === normalizeResponseText(label.aliasOf!));
  return resolveLabelValue(target, labels, seen);
}

function levenshtein(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[right.length];
}

function nearLabel(answer: string, labels: string[]): string | undefined {
  const normalized = normalizeResponseText(answer).replace(/\s+/g, '');
  if (normalized.length < 4) return undefined;
  const maxDistance = normalized.length >= 8 ? 2 : normalized.length >= 4 ? 1 : 0;
  return labels.find((candidate) => {
    const other = normalizeResponseText(candidate).replace(/\s+/g, '');
    return other !== normalized && other.length >= 4 && levenshtein(normalized, other) <= maxDistance;
  });
}

function makeDisplayAnswer(value: string, min: number | null, max: number | null, kind: AnswerRowKind): string {
  return kind === 'out_of_range' && min !== null && max !== null
    ? `${value} (outside ${min} to ${max})`
    : value;
}

export function buildAnswerTable(input: AnswerTableInput): AnswerTableResult {
  const values = input.columns.flatMap((column) => input.rows.map((row) => row[column]));
  const mode = detectResponseMode(values);
  const preset = input.preset as LikertPreset | undefined;
  const tableLabels = [...input.labels];
  for (const point of preset?.labels ?? []) {
    if (!tableLabels.some((label) => normalizeResponseText(label.label) === normalizeResponseText(point.label))) {
      tableLabels.push({ label: point.label, value: point.value, kind: 'scale' });
    }
  }
  const labelsByKey = new Map(tableLabels.map((label) => [normalizeResponseText(label.label), label]));
  const cellsByKey = new Map<string, AnswerTableRow>();
  const includedFound = new Map<string, number>();
  const observedNumericKeys = new Set<string>();
  const add = (rawAnswer: string, kind: AnswerRowKind, column: string, rowIndex: number) => {
    const key = `${kind}:${normalizeResponseText(rawAnswer)}`;
    const label = labelsByKey.get(normalizeResponseText(rawAnswer));
    const existing = cellsByKey.get(key);
    const included = !input.excludedRows?.has(rowIndex);
    if (existing) {
      existing.found += 1;
      existing.cells.push({ column, rowIndex, displayId: input.displayIds?.[rowIndex] });
      if (included) includedFound.set(key, (includedFound.get(key) ?? 0) + 1);
      return;
    }
    const countsAs = resolveLabelValue(label, input.labels);
    const savedDecision = input.outOfRangeDecisions?.[rawAnswer];
    // Scale labels: any missing number needs attention (even if previously notScored).
    const noNumber = countsAs === null && (kind === 'scale' || !label?.notScored);
    const pendingWord = kind === 'scale' && countsAs === null;
    const pendingNumeric = (kind === 'unknown' || kind === 'out_of_range') && noNumber
      && savedDecision?.action !== 'widen' && savedDecision?.reviewed !== true;
    const review = included && (pendingWord || pendingNumeric);
    const cell = { column, rowIndex, displayId: input.displayIds?.[rowIndex] };
    cellsByKey.set(key, {
      answer: makeDisplayAnswer(rawAnswer, kind === 'out_of_range' ? (input.baseMin ?? input.min) : input.min,
        kind === 'out_of_range' ? (input.baseMax ?? input.max) : input.max, kind),
      found: 1,
      kind,
      countsAs,
      review,
      grey: (kind === 'special' && countsAs === null) || label?.notScored === true || !included,
      reversed: false,
      decision: savedDecision?.action ?? (label?.notScored ? 'missing' : pendingWord || pendingNumeric ? '' : 'missing'),
      cells: [cell],
      manual: label?.manual,
      manualLabel: label?.manualLabel,
      notScored: label?.notScored,
      aliasOf: label?.aliasOf,
    });
    includedFound.set(key, included ? 1 : 0);
  };

  input.rows.forEach((row, rowIndex) => input.columns.forEach((column) => {
    const raw = row[column];
    if (isBlank(raw)) return;
    const answer = String(raw).trim();
    if (isBuiltInMissingCode(raw)) return add(answer, 'special', column, rowIndex);
    const number = numberValue(raw);
    if (number !== null) {
      observedNumericKeys.add(String(number));
      const baseMin = input.baseMin ?? input.min;
      const baseMax = input.baseMax ?? input.max;
      if (baseMin !== null && baseMax !== null && (number < baseMin || number > baseMax)) return add(String(number), 'out_of_range', column, rowIndex);
      return;
    }
    // User-scored "other" answers are stored as kind special so they never join the scale list.
    const mapped = labelsByKey.get(normalizeResponseText(answer));
    if (mapped?.kind === 'special') return add(answer, 'special', column, rowIndex);
    if (mode === 'word') return add(answer, 'scale', column, rowIndex);
    return add(answer, 'unknown', column, rowIndex);
  }));

  for (const label of tableLabels) {
    const kind = label.kind ?? (label.value === null ? 'special' : 'scale');
    if (kind !== 'scale') continue;
    const normalizedLabel = normalizeResponseText(label.label);
    const numericLabel = numberValue(label.label);
    if ((numericLabel !== null && observedNumericKeys.has(String(numericLabel)))
      || cellsByKey.has(`unknown:${normalizedLabel}`)
      || cellsByKey.has(`out_of_range:${normalizedLabel}`)) continue;
    const key = `scale:${normalizedLabel}`;
    if (cellsByKey.has(key)) continue;
    cellsByKey.set(key, {
      answer: label.label, found: 0, kind: 'scale', countsAs: resolveLabelValue(label, input.labels),
      review: false, grey: true, reversed: false, decision: 'missing', cells: [], manual: label.manual, notScored: label.notScored,
      aliasOf: label.aliasOf,
      manualLabel: label.manualLabel,
    });
    includedFound.set(key, 0);
  }

  const keys = [...cellsByKey.keys()];
  for (const key of keys) {
    const row = cellsByKey.get(key)!;
    row.excludedOnly = row.found > 0 && (includedFound.get(key) ?? 0) === 0;
    if (row.excludedOnly) {
      row.review = false;
      row.grey = true;
    }
  }

  // Rare non-preset text labels → Other answers (not scale points).
  // Preset + user-manual labels always stay on the scale (even Found = 0 or 1).
  const totalScaleLikeAnswers = [...cellsByKey.values()]
    .filter((row) => row.kind === 'scale' || row.kind === 'unknown')
    .reduce((sum, row) => sum + (includedFound.get(`${row.kind}:${normalizeResponseText(row.answer.replace(/ \(outside .+\)$/, ''))}`) ?? row.found), 0);
  // Small samples: ≥2. Large samples: also ≥1% of answers.
  const occurrenceThreshold = Math.max(2, Math.ceil(0.01 * Math.max(totalScaleLikeAnswers, 1)));
  const presetKeys = new Set(
    (preset?.labels ?? []).flatMap((point) => [point.label, ...(point.aliases ?? [])].map((label) => normalizeResponseText(label))),
  );
  for (const [key, row] of [...cellsByKey.entries()]) {
    if (row.kind !== 'scale') continue;
    const rawKey = normalizeResponseText(row.answer.replace(/ \(outside .+\)$/, ''));
    const label = labelsByKey.get(rawKey);
    // Manual scale labels the user added stay on the scale; specials never do.
    if (label?.kind === 'special') {
      // fall through to demote into other answers
    } else {
      const userOwned = label?.manual === true || label?.manualLabel === true;
      const foundIncluded = includedFound.get(key) ?? 0;
      if (userOwned || presetKeys.has(rawKey) || foundIncluded >= occurrenceThreshold) continue;
      // Zero-found preset fillers are in presetKeys; pure one-offs (Maybe ×1) are demoted.
      if (foundIncluded === 0) continue;
    }
    cellsByKey.delete(key);
    const otherKind = label?.kind === 'special' ? 'special' : 'unknown';
    const nextKey = `${otherKind}:${rawKey}`;
    if (cellsByKey.has(nextKey)) {
      const existingOther = cellsByKey.get(nextKey)!;
      existingOther.found += row.found;
      existingOther.cells.push(...row.cells);
      continue;
    }
    const countsAs = resolveLabelValue(label, input.labels);
    const noNumber = countsAs === null && !label?.notScored;
    const builtIn = isBuiltInMissingCode(row.answer);
    cellsByKey.set(nextKey, {
      ...row,
      kind: otherKind,
      answer: row.answer.replace(/ \(outside .+\)$/, ''),
      review: !row.excludedOnly && noNumber && !builtIn,
      grey: builtIn || label?.notScored === true || !!row.excludedOnly,
      decision: label?.notScored ? 'missing' : noNumber ? '' : 'missing',
      notScored: label?.notScored,
    });
  }

  // Other answers: default Not scored is a real decision — never amber, never blocks scoring.
  // Rare others (Maybe) still count toward the card summary via countReviewAnswers().
  for (const row of cellsByKey.values()) {
    if (row.kind !== 'unknown' && row.kind !== 'special') continue;
    if (row.excludedOnly) continue;
    const builtIn = isBuiltInMissingCode(row.answer);
    if (row.countsAs !== null) {
      row.review = false;
      row.grey = false;
      row.notScored = false;
    } else {
      // Empty = not scored (default). Built-ins and rare others look the same: calm grey.
      row.review = false;
      row.grey = true;
      row.notScored = true;
    }
    if (builtIn && row.countsAs === null) {
      row.notScored = true;
      row.grey = true;
      row.review = false;
    }
  }

  // Scale labels with no number always need a number (blocks scoring), including after backspace.
  for (const row of cellsByKey.values()) {
    if (row.kind !== 'scale' || row.excludedOnly) continue;
    if (row.found === 0) {
      // Unused preset points do not block.
      row.review = false;
      continue;
    }
    if (row.countsAs === null) {
      row.review = true;
      row.grey = false;
      row.notScored = false;
    }
  }

  const scaleRows = [...cellsByKey.values()].filter((row) => row.kind === 'scale');
  for (const row of scaleRows) if (row.review) {
    const suggestion = nearLabel(row.answer, scaleRows.filter((candidate) => candidate !== row && candidate.kind === 'scale').map((candidate) => candidate.answer));
    if (suggestion) row.suggestion = suggestion;
  }

  const presetIndex = (answer: string) => preset ? presetLabelForText(preset, answer)?.value ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
  const ordered = [...cellsByKey.values()];
  ordered.sort((a, b) => {
    const aSpecial = a.kind === 'special' ? 1 : 0;
    const bSpecial = b.kind === 'special' ? 1 : 0;
    if (aSpecial !== bSpecial) return aSpecial - bSpecial;
    if (preset) {
      const aIndex = presetIndex(a.answer);
      const bIndex = presetIndex(b.answer);
      if (aIndex !== bIndex) return aIndex - bIndex;
    }
    if (a.kind === 'scale' && b.kind === 'scale' && a.found !== b.found) return b.found - a.found;
    return 0;
  });
  const mappedWordValues = tableLabels.filter((label) => (label.kind ?? 'scale') === 'scale')
    .map((label) => resolveLabelValue(label, input.labels)).filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    mode,
    rows: ordered,
    range: mode === 'word' && mappedWordValues.length > 0
      ? { min: Math.min(...mappedWordValues), max: Math.max(...mappedWordValues) }
      : input.min !== null && input.max !== null ? { min: input.min, max: input.max } : null,
    presetName: input.preset?.name,
  };
}

export function collectPendingResponseAnswers(
  subscales: { id: string; name: string; items: { column: string }[]; minValue: number | null; maxValue: number | null; baseMin?: number | null; baseMax?: number | null; labelMap: ResponseScaleLabelSetting[]; outOfRangeDecisions?: Record<string, { action: 'missing' | 'widen'; reviewed: boolean }> }[],
  rows: Record<string, unknown>[],
  displayIds: string[],
  excludedRows: Set<number>,
): PendingResponseAnswer[] {
  return subscales.filter((subscale) => subscale.items.length > 0).flatMap((subscale) => {
    const columns = subscale.items.map((item) => item.column);
    const textAnswers = columns.flatMap((column) => rows.map((row) => row[column]))
      .filter((value) => typeof value === 'string' && value.trim() !== '' && Number.isNaN(Number(value)));
    const preset = matchResponsePreset(textAnswers).preset;
    const table = buildAnswerTable({
      rows, columns, min: subscale.minValue, max: subscale.maxValue, baseMin: subscale.baseMin, baseMax: subscale.baseMax,
      labels: subscale.labelMap, outOfRangeDecisions: subscale.outOfRangeDecisions, displayIds, excludedRows,
      preset: preset ? { name: preset.name, labels: preset.labels } : undefined,
    });
    // Only incomplete scale points and undecided out-of-range values block scoring.
    // Other answers default to Not scored and never block.
    return table.rows
      .filter((answer) => answer.review && (answer.kind === 'scale' || answer.kind === 'out_of_range'))
      .map((answer) => ({ subscaleId: subscale.id, subscaleName: subscale.name, answer }));
  });
}

/** Rows that should surface in the card summary as "N answers to review". */
export function countsTowardReviewSummary(row: Pick<AnswerTableRow, 'review' | 'kind' | 'countsAs' | 'found' | 'answer' | 'notScored'>): boolean {
  if (row.review) return true;
  // Rare other answers with no number: visible in the summary, but do not block scoring.
  if (row.found <= 0) return false;
  if (row.kind !== 'unknown' && row.kind !== 'special') return false;
  if (row.countsAs != null) return false;
  if (isBuiltInMissingCode(row.answer)) return false;
  return true;
}

export function countReviewAnswers(rows: Pick<AnswerTableRow, 'review' | 'kind' | 'countsAs' | 'found' | 'answer' | 'notScored'>[]): number {
  return rows.filter((row) => countsTowardReviewSummary(row)).length;
}

export function resetConfirmationAfterScaleChange(state: { confirmed?: boolean; hasReverseItems: boolean }): boolean {
  return state.hasReverseItems ? false : state.confirmed === true;
}

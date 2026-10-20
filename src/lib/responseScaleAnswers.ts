import { BUILT_IN_MISSING_CODES, normalizeResponseText, type ResponseScaleLabelSetting } from '../scientific/responseScales';

export type ResponseMode = 'numeric' | 'word' | 'continuous' | 'demographic';
export type AnswerRowKind = 'scale' | 'special' | 'out_of_range' | 'unknown';

export interface AnswerTableInput {
  rows: Record<string, unknown>[];
  columns: string[];
  min: number | null;
  max: number | null;
  labels: ResponseScaleLabelSetting[];
  preset?: { name: string; labels: { label: string; value: number }[] };
}

export interface AnswerTableRow {
  answer: string;
  found: number;
  kind: AnswerRowKind;
  countsAs: number | null;
  review: boolean;
  grey: boolean;
  reversed: boolean;
  cells: { column: string; rowIndex: number; displayId?: string }[];
}

export interface AnswerTableResult {
  mode: ResponseMode;
  rows: AnswerTableRow[];
  range: { min: number; max: number } | null;
  presetName?: string;
}

const specialWords = new Set(BUILT_IN_MISSING_CODES.map(normalizeResponseText));

function numberValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isSpecial(value: unknown): boolean {
  return typeof value === 'string' && specialWords.has(normalizeResponseText(value));
}

function isBlank(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

export function detectResponseMode(values: unknown[]): ResponseMode {
  const nonBlank = values.filter((value) => !isBlank(value) && !isSpecial(value));
  const textValues = nonBlank.filter((value) => numberValue(value) === null);
  const distinctText = new Set(textValues.map((value) => normalizeResponseText(String(value))));
  if (distinctText.size > 15) return 'demographic';
  if (nonBlank.some((value) => {
    const number = numberValue(value);
    return number !== null && !Number.isInteger(number);
  })) return 'continuous';
  return textValues.length >= nonBlank.length / 2 ? 'word' : 'numeric';
}

function displayAnswer(value: string, min: number | null, max: number | null, kind: AnswerRowKind): string {
  return kind === 'out_of_range' && min !== null && max !== null
    ? `${value} (outside ${min} to ${max})`
    : value;
}

export function buildAnswerTable(input: AnswerTableInput): AnswerTableResult {
  const cellsByKey = new Map<string, AnswerTableRow>();
  const values = input.columns.flatMap((column) => input.rows.map((row) => row[column]));
  const mode = detectResponseMode(values);
  const labelByKey = new Map(input.labels.map((label) => [normalizeResponseText(label.label), label]));
  const presetValueByKey = new Map(input.preset?.labels.map((label) => [normalizeResponseText(label.label), label.value]) ?? []);
  const add = (rawAnswer: string, kind: AnswerRowKind, column: string, rowIndex: number) => {
    const label = labelByKey.get(normalizeResponseText(rawAnswer));
    const key = `${kind}:${normalizeResponseText(rawAnswer)}`;
    const existing = cellsByKey.get(key);
    if (existing) {
      existing.found += 1;
      existing.cells.push({ column, rowIndex });
      return;
    }
    const countsAs = label?.value ?? presetValueByKey.get(normalizeResponseText(rawAnswer)) ?? null;
    const isUnreviewed = (kind === 'unknown' || kind === 'out_of_range') && countsAs === null;
    cellsByKey.set(key, {
      answer: displayAnswer(rawAnswer, input.min, input.max, kind),
      found: 1,
      kind,
      countsAs,
      review: isUnreviewed,
      grey: kind === 'special',
      reversed: false,
      cells: [{ column, rowIndex }],
    });
  };

  input.rows.forEach((row, rowIndex) => input.columns.forEach((column) => {
    const raw = row[column];
    if (isBlank(raw)) return;
    const answer = String(raw).trim();
    if (isSpecial(raw)) return add(answer, 'special', column, rowIndex);
    const number = numberValue(raw);
    if (number !== null) {
      if (input.min !== null && input.max !== null && (number < input.min || number > input.max)) {
        return add(String(number), 'out_of_range', column, rowIndex);
      }
      return;
    }
    if (mode === 'word') return add(answer, 'scale', column, rowIndex);
    return add(answer, 'unknown', column, rowIndex);
  }));

  if (mode === 'word' && input.preset) {
    for (const presetLabel of input.preset.labels) {
      const key = `scale:${normalizeResponseText(presetLabel.label)}`;
      if (!cellsByKey.has(key)) {
        const mapped = labelByKey.get(normalizeResponseText(presetLabel.label));
        cellsByKey.set(key, {
          answer: presetLabel.label, found: 0, kind: 'scale',
          countsAs: mapped?.value ?? presetLabel.value, review: mapped?.value == null,
          grey: true, reversed: false, cells: [],
        });
      }
    }
  }

  const ordered = [...cellsByKey.values()];
  if (mode === 'word' && input.preset) {
    const order = new Map(input.preset.labels.map((label, index) => [normalizeResponseText(label.label), index]));
    ordered.sort((a, b) => (order.get(normalizeResponseText(a.answer)) ?? 999) - (order.get(normalizeResponseText(b.answer)) ?? 999));
  }
  return {
    mode,
    rows: ordered,
    range: mode === 'word' && input.preset
      ? { min: Math.min(...input.preset.labels.map((label) => label.value)), max: Math.max(...input.preset.labels.map((label) => label.value)) }
      : input.min !== null && input.max !== null ? { min: input.min, max: input.max } : null,
    presetName: input.preset?.name,
  };
}

export function countReviewAnswers(rows: Pick<AnswerTableRow, 'review'>[]): number {
  return rows.filter((row) => row.review).length;
}

export function resetConfirmationAfterScaleChange(state: { confirmed?: boolean; hasReverseItems: boolean }): boolean {
  return state.hasReverseItems ? false : state.confirmed === true;
}

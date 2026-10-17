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

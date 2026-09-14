// Content validity computation module — Lawshe CVR and Aiken's V.
// These methods evaluate expert judgments of draft questionnaire items,
// NOT respondent answers.

// ─── Types ───────────────────────────────────────────────────────────

export type CVMethod = 'lawshe' | 'aiken';
export type RowType = 'item' | 'dimension';
export type ItemDecision = 'accept' | 'reject' | 'reject/refine' | 'n/a';

export interface LawsheItemResult {
  rowIndex: number;
  itemLabel: string;
  dimensionLabel: string | null;
  nEssential: number;
  nExperts: number;
  cvr: number | null;
  cvrCritical: number | null;
  decision: ItemDecision;
  rawRatings: Record<string, string | number | null>;
}

export interface AikenItemResult {
  rowIndex: number;
  itemLabel: string;
  dimensionLabel: string | null;
  v: number | null;
  bandLabel: string | null;
  vCritical: number | null;
  alpha: number;
  n: number;
  c: number;
  decision: ItemDecision;
  rawRatings: Record<string, string | number | null>;
}

export type ItemResult = LawsheItemResult | AikenItemResult;

export interface ExpertQualityReport {
  column: string;
  missingRate: number;
  variance: number;
  flagged: boolean;
}

export interface ContentValidityResult {
  method: CVMethod;
  itemResults: ItemResult[];
  dimensionRows: { rowIndex: number; label: string }[];
  summary: {
    totalItems: number;
    accepted: number;
    rejected: number;
    rejectRefine: number;
    na: number;
    dropped: number;
    meanCvrAccepted: number | null;
    scviAve: number | null;
  };
  expertQuality: ExpertQualityReport[];
  activeExpertCount: number;
}

// ─── Lawshe critical values (Ayre & Scally 2014, exact binomial, α=.05 one-tailed) ───

const LAWSHE_CRITICAL: ReadonlyMap<number, { nCritical: number; cvrCritical: number }> = new Map([
  [5, { nCritical: 5, cvrCritical: 1.000 }],
  [6, { nCritical: 6, cvrCritical: 1.000 }],
  [7, { nCritical: 7, cvrCritical: 1.000 }],
  [8, { nCritical: 7, cvrCritical: 0.750 }],
  [9, { nCritical: 8, cvrCritical: 0.778 }],
  [10, { nCritical: 9, cvrCritical: 0.800 }],
  [11, { nCritical: 9, cvrCritical: 0.636 }],
  [12, { nCritical: 10, cvrCritical: 0.667 }],
  [13, { nCritical: 10, cvrCritical: 0.538 }],
  [14, { nCritical: 11, cvrCritical: 0.571 }],
  [15, { nCritical: 12, cvrCritical: 0.600 }],
  [16, { nCritical: 12, cvrCritical: 0.500 }],
  [17, { nCritical: 13, cvrCritical: 0.529 }],
  [18, { nCritical: 13, cvrCritical: 0.444 }],
  [19, { nCritical: 14, cvrCritical: 0.474 }],
  [20, { nCritical: 15, cvrCritical: 0.500 }],
  [21, { nCritical: 15, cvrCritical: 0.429 }],
  [22, { nCritical: 16, cvrCritical: 0.455 }],
  [23, { nCritical: 16, cvrCritical: 0.391 }],
  [24, { nCritical: 17, cvrCritical: 0.417 }],
  [25, { nCritical: 18, cvrCritical: 0.440 }],
  [26, { nCritical: 18, cvrCritical: 0.385 }],
  [27, { nCritical: 19, cvrCritical: 0.407 }],
  [28, { nCritical: 19, cvrCritical: 0.357 }],
  [29, { nCritical: 20, cvrCritical: 0.379 }],
  [30, { nCritical: 20, cvrCritical: 0.333 }],
  [31, { nCritical: 21, cvrCritical: 0.355 }],
  [32, { nCritical: 22, cvrCritical: 0.375 }],
  [33, { nCritical: 22, cvrCritical: 0.333 }],
  [34, { nCritical: 23, cvrCritical: 0.353 }],
  [35, { nCritical: 23, cvrCritical: 0.314 }],
  [36, { nCritical: 24, cvrCritical: 0.333 }],
  [37, { nCritical: 24, cvrCritical: 0.297 }],
  [38, { nCritical: 25, cvrCritical: 0.316 }],
  [39, { nCritical: 26, cvrCritical: 0.333 }],
  [40, { nCritical: 26, cvrCritical: 0.300 }],
]);

export function getLawsheCritical(n: number): { nCritical: number; cvrCritical: number } | null {
  return LAWSHE_CRITICAL.get(n) ?? null;
}

export function computeCVR(nEssential: number, nExperts: number): number | null {
  if (nExperts === 0) return null;
  const half = nExperts / 2;
  if (half === 0) return null;
  return (nEssential - half) / half;
}

export function lawsheDecision(cvr: number | null, nExperts: number): ItemDecision {
  if (cvr == null) return 'n/a';
  if (nExperts < 5 || nExperts > 40) return 'n/a';
  const crit = getLawsheCritical(nExperts);
  if (!crit) return 'n/a';
  return cvr >= crit.cvrCritical ? 'accept' : 'reject';
}

// ─── Aiken's V ──────────────────────────────────────────────────────

export function aikenVCritical(n: number, c: number, alpha = 0.05): number | null {
  if (n < 2 || c < 2) return null;
  const z = alpha <= 0.01 ? 2.32635 : 1.64485;
  const se = Math.sqrt((c + 1) / (12 * n * (c - 1)));
  return 0.5 + z * se;
}

export function computeAikenV(
  ratings: number[],
  lo: number,
  hi: number,
): { v: number | null; n: number } {
  const n = ratings.length;
  if (n === 0 || hi <= lo) return { v: null, n };
  const sum = ratings.reduce((acc, r) => acc + (r - lo), 0);
  const v = sum / (n * (hi - lo));
  return { v, n };
}

export function aikenBand(v: number): string {
  if (v < 0.70) return 'Weakly Valid';
  if (v < 0.80) return 'Adequately Valid';
  return 'Strongly Valid';
}

export function aikenDecision(
  v: number | null,
  vCritical: number | null,
): ItemDecision {
  if (v == null) return 'n/a';
  if (v < 0.70) return 'reject';
  if (vCritical != null && v < vCritical) return 'reject/refine';
  if (vCritical == null) {
    if (v < 0.80) return 'reject/refine';
    return 'accept';
  }
  return 'accept';
}

// ─── Expert quality helpers ──────────────────────────────────────────

export function computeExpertQuality(
  rows: Record<string, unknown>[],
  expertColumns: string[],
  itemRowIndices: number[],
): ExpertQualityReport[] {
  if (itemRowIndices.length === 0) return [];
  return expertColumns.map((col) => {
    let missing = 0;
    const values: number[] = [];
    for (const idx of itemRowIndices) {
      const row = rows[idx];
      const val = row[col];
      if (val == null || String(val).trim() === '') {
        missing++;
      } else {
        const num = Number(val);
        if (!isNaN(num)) values.push(num);
      }
    }
    const missingRate = missing / itemRowIndices.length;
    const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const variance = values.length > 1
      ? values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
      : 0;
    const flagged = missingRate > 0.5 || (values.length > 1 && variance < 0.01);
    return { column: col, missingRate, variance, flagged };
  });
}

// ─── Lawshe analysis ─────────────────────────────────────────────────

export interface AnalyseLawsheParams {
  rows: Record<string, unknown>[];
  headers: string[];
  itemLabelColumn: string | null;
  expertColumns: string[];
  dimensionColumn: string | null;
  rowTypes: Record<number, RowType>;
  valueMapping: Record<string, string>;
  emptyAsEssential: boolean;
  excludedExperts: string[];
  droppedItems: number[];
}

export function analyseLawshe(params: AnalyseLawsheParams): ContentValidityResult {
  const {
    rows, headers, itemLabelColumn, expertColumns, dimensionColumn,
    rowTypes, valueMapping, emptyAsEssential, excludedExperts, droppedItems,
  } = params;

  const activeExperts = expertColumns.filter((c) => !excludedExperts.includes(c));
  const N = activeExperts.length;
  const droppedSet = new Set(droppedItems);

  const itemRowIndices: number[] = [];
  const itemResults: LawsheItemResult[] = [];
  const dimensionRows: { rowIndex: number; label: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowType = rowTypes[i] ?? 'item';
    const row = rows[i];
    const label = itemLabelColumn ? String(row[itemLabelColumn] ?? `Row ${i + 1}`) : `Row ${i + 1}`;
    const dimLabel = dimensionColumn ? String(row[dimensionColumn] ?? '') || null : null;

    if (rowType === 'dimension') {
      dimensionRows.push({ rowIndex: i, label });
      continue;
    }

    itemRowIndices.push(i);

    const rawRatings: Record<string, string | number | null> = {};
    let nEssential = 0;

    for (const expert of activeExperts) {
      const rawVal = row[expert];
      const rawStr = rawVal == null || String(rawVal).trim() === '' ? '' : String(rawVal).trim();
      rawRatings[expert] = rawStr || null;

      if (rawStr === '') {
        if (emptyAsEssential) nEssential++;
        continue;
      }

      const mapped = valueMapping[rawStr];
      if (mapped === 'essential') nEssential++;
    }

    const cvr = computeCVR(nEssential, N);
    const crit = N >= 5 && N <= 40 ? getLawsheCritical(N) : null;
    const cvrCritical = crit?.cvrCritical ?? null;
    const decision = lawsheDecision(cvr, N);

    itemResults.push({
      rowIndex: i,
      itemLabel: label,
      dimensionLabel: dimLabel,
      nEssential,
      nExperts: N,
      cvr,
      cvrCritical,
      decision,
      rawRatings,
    });
  }

  const acceptedResults = itemResults.filter(
    (r) => r.decision === 'accept' && !droppedSet.has(r.rowIndex),
  );
  const meanCvrAccepted = acceptedResults.length > 0
    ? acceptedResults.reduce((sum, r) => sum + (r.cvr ?? 0), 0) / acceptedResults.length
    : null;

  const expertQuality = computeExpertQuality(rows, expertColumns, itemRowIndices);

  const accepted = itemResults.filter((r) => r.decision === 'accept').length;
  const rejected = itemResults.filter((r) => r.decision === 'reject').length;
  const na = itemResults.filter((r) => r.decision === 'n/a').length;

  return {
    method: 'lawshe',
    itemResults,
    dimensionRows,
    summary: {
      totalItems: itemResults.length,
      accepted,
      rejected,
      rejectRefine: 0,
      na,
      dropped: droppedSet.size,
      meanCvrAccepted,
      scviAve: meanCvrAccepted,
    },
    expertQuality,
    activeExpertCount: N,
  };
}

// ─── Aiken analysis ──────────────────────────────────────────────────

export interface AnalyseAikenParams {
  rows: Record<string, unknown>[];
  headers: string[];
  itemLabelColumn: string | null;
  expertColumns: string[];
  dimensionColumn: string | null;
  rowTypes: Record<number, RowType>;
  valueMapping: Record<string, number>;
  scaleLo: number;
  scaleHi: number;
  alpha: number;
  excludedExperts: string[];
  droppedItems: number[];
}

export function analyseAiken(params: AnalyseAikenParams): ContentValidityResult {
  const {
    rows, headers, itemLabelColumn, expertColumns, dimensionColumn,
    rowTypes, valueMapping, scaleLo, scaleHi, alpha, excludedExperts, droppedItems,
  } = params;

  const activeExperts = expertColumns.filter((c) => !excludedExperts.includes(c));
  const droppedSet = new Set(droppedItems);
  const c = scaleHi - scaleLo + 1;

  const itemRowIndices: number[] = [];
  const itemResults: AikenItemResult[] = [];
  const dimensionRows: { rowIndex: number; label: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowType = rowTypes[i] ?? 'item';
    const row = rows[i];
    const label = itemLabelColumn ? String(row[itemLabelColumn] ?? `Row ${i + 1}`) : `Row ${i + 1}`;
    const dimLabel = dimensionColumn ? String(row[dimensionColumn] ?? '') || null : null;

    if (rowType === 'dimension') {
      dimensionRows.push({ rowIndex: i, label });
      continue;
    }

    itemRowIndices.push(i);

    const rawRatings: Record<string, string | number | null> = {};
    const numericRatings: number[] = [];

    for (const expert of activeExperts) {
      const rawVal = row[expert];
      const rawStr = rawVal == null || String(rawVal).trim() === '' ? '' : String(rawVal).trim();
      rawRatings[expert] = rawStr || null;

      if (rawStr === '') continue;

      let numVal: number | null = null;
      if (rawStr in valueMapping) {
        numVal = valueMapping[rawStr];
      } else {
        const parsed = Number(rawStr);
        if (!isNaN(parsed)) numVal = parsed;
      }

      if (numVal != null && !isNaN(numVal)) numericRatings.push(numVal);
    }

    const { v, n } = computeAikenV(numericRatings, scaleLo, scaleHi);
    const vCritical = aikenVCritical(n, c, alpha);
    const bandLabel = v != null ? aikenBand(v) : null;
    const decision = aikenDecision(v, vCritical);

    itemResults.push({
      rowIndex: i,
      itemLabel: label,
      dimensionLabel: dimLabel,
      v,
      bandLabel,
      vCritical,
      alpha,
      n,
      c,
      decision,
      rawRatings,
    });
  }

  const expertQuality = computeExpertQuality(rows, expertColumns, itemRowIndices);

  const accepted = itemResults.filter((r) => r.decision === 'accept').length;
  const rejected = itemResults.filter((r) => r.decision === 'reject').length;
  const rejectRefine = itemResults.filter((r) => r.decision === 'reject/refine').length;
  const na = itemResults.filter((r) => r.decision === 'n/a').length;

  return {
    method: 'aiken',
    itemResults,
    dimensionRows,
    summary: {
      totalItems: itemResults.length,
      accepted,
      rejected,
      rejectRefine,
      na,
      dropped: droppedSet.size,
      meanCvrAccepted: null,
      scviAve: null,
    },
    expertQuality,
    activeExpertCount: activeExperts.length,
  };
}

// ─── Distinct value discovery ────────────────────────────────────────

export function discoverDistinctValues(
  rows: Record<string, unknown>[],
  expertColumns: string[],
  itemRowIndices: number[],
): string[] {
  const set = new Set<string>();
  for (const idx of itemRowIndices) {
    const row = rows[idx];
    if (!row) continue;
    for (const col of expertColumns) {
      const val = row[col];
      if (val != null && String(val).trim() !== '') {
        set.add(String(val).trim());
      }
    }
  }
  return Array.from(set).sort();
}

export function discoverDistinctValuesAll(
  rows: Record<string, unknown>[],
  expertColumns: string[],
): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    for (const col of expertColumns) {
      const val = row[col];
      if (val != null && String(val).trim() !== '') {
        set.add(String(val).trim());
      }
    }
  }
  return Array.from(set).sort();
}

// ─── Auto-suggest for Lawshe mapping ─────────────────────────────────

export function suggestLawsheMapping(values: string[]): Record<string, 'essential' | 'not_essential'> {
  const mapping: Record<string, 'essential' | 'not_essential'> = {};
  for (const v of values) {
    const lower = v.toLowerCase().trim();
    if (lower === '1' || lower === 'yes' || lower === 'essential' || lower === 'true') {
      mapping[v] = 'essential';
    } else if (lower === '0' || lower === 'no' || lower === 'not essential' || lower === 'irrelevant' || lower === 'false') {
      mapping[v] = 'not_essential';
    }
  }
  return mapping;
}

// ─── Auto-suggest for Aiken numeric mapping ──────────────────────────

export function suggestAikenMapping(values: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  for (const v of values) {
    const num = Number(v);
    if (!isNaN(num) && isFinite(num)) {
      mapping[v] = num;
    }
  }
  return mapping;
}

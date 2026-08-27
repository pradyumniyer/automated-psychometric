// Auto-detection: demographics, response scale type, Likert range, template slot matching.
export interface DemographicSuggestion { column: string; confidence: number; rule: string; }
export interface ScaleDetection {
  scaleType: 'numeric' | 'categorical'; minValue: number | null; maxValue: number | null;
  uniqueValues: string[]; confidence: number; suggestion: string;
}
export interface SlotMapping { slotName: string; matchedColumn: string | null; confidence: number; matchedRule: string; }

const DEMOGRAPHIC_PATTERNS: { patterns: RegExp; name: string }[] = [
  { patterns: /^age$/i, name: 'age (exact)' },
  { patterns: /\b(age|years?\s*old)\b/i, name: 'age keyword' },
  { patterns: /^sex$|^gender$/i, name: 'sex/gender (exact)' },
  { patterns: /\b(gender|sex)\b/i, name: 'gender/sex keyword' },
  // ID columns — handle camelCase (RespondentID), snake_case (respondent_id), and plain (respondent)
  { patterns: /^(respondent|participant|subject|user|case|record)(id|_id)?$/i, name: 'respondent/participant ID' },
  { patterns: /^(id|pid|uid|rid|sid|case_id|record_id|user_id)$/i, name: 'ID column' },
  { patterns: /\b(participant|subject|respondent|user|case|record)\b.*\b(id|num|no|number)\b/i, name: 'participant ID keyword' },
  { patterns: /\b(education|qualification|degree|academic)\b/i, name: 'education' },
  { patterns: /\b(income|salary|wage)\b/i, name: 'income' },
  { patterns: /\b(ethnicity|race|ethnic)\b/i, name: 'ethnicity' },
  { patterns: /\b(nationality|country|nation)\b/i, name: 'nationality' },
  { patterns: /\b(marital|relationship\s*status)\b/i, name: 'marital status' },
  { patterns: /\b(occupation|job|profession|employment)\b/i, name: 'occupation' },
  { patterns: /\b(religion|faith)\b/i, name: 'religion' },
  { patterns: /\b(date|timestamp|time|created|submitted)\b/i, name: 'timestamp' },
  { patterns: /\b(city|state|province|region|zip|postcode|postal)\b/i, name: 'location' },
  { patterns: /\b(language)\b/i, name: 'language' },
  { patterns: /\b(height|weight|bmi)\b/i, name: 'physical attribute' },
];

export function detectDemographics(headers: string[], rows: Record<string, unknown>[]): DemographicSuggestion[] {
  const suggestions: DemographicSuggestion[] = [];
  for (const header of headers) {
    let best: { confidence: number; rule: string } | null = null;
    for (const { patterns, name } of DEMOGRAPHIC_PATTERNS) {
      if (patterns.test(header)) {
        const confidence = header.length < 30 && patterns.test(header) ? 0.95 : 0.75;
        if (!best || confidence > best.confidence) best = { confidence, rule: name };
      }
    }
    if (!best) {
      const values = rows.map((r) => r[header]).filter((v) => v != null && v !== '');
      const uniqueValues = new Set(values.map((v) => String(v).toLowerCase().trim()));
      const uniqueRatio = uniqueValues.size / Math.max(values.length, 1);
      if (values.length > 10 && uniqueRatio < 0.1 && uniqueValues.size <= 10) {
        const sampleValues = Array.from(uniqueValues).slice(0, 5);
        if (sampleValues.some((v) => /^(m|f|male|female|other|non-binary)$/i.test(v))) best = { confidence: 0.6, rule: 'content: gender-like values' };
        else if (sampleValues.every((v) => /^(yes|no|y|n|true|false)$/i.test(v))) best = { confidence: 0.4, rule: 'content: yes/no values' };
      }
      if (!best && values.length > 5) {
        const numValues = values.map((v) => Number(v)).filter((v) => !isNaN(v));
        if (numValues.length / values.length > 0.8 && numValues.every((v) => v >= 10 && v <= 100) && !header.match(/\b(score|point|item|q\d|question)\b/i)) best = { confidence: 0.5, rule: 'content: values in age range (10-100)' };
      }
    }
    if (best) suggestions.push({ column: header, confidence: best.confidence, rule: best.rule });
  }
  return suggestions;
}

export function detectScale(_headers: string[], rows: Record<string, unknown>[], itemColumns: string[]): ScaleDetection {
  const allValues: string[] = [];
  for (const col of itemColumns) for (const row of rows) { const v = row[col]; if (v != null && v !== '') allValues.push(String(v).trim()); }
  const uniqueStrings = Array.from(new Set(allValues));
  const numericValues = uniqueStrings.map((v) => Number(v)).filter((v) => !isNaN(v) && isFinite(v));
  const nonNumericValues = uniqueStrings.filter((v) => isNaN(Number(v)));
  if (nonNumericValues.length === 0 && numericValues.length > 0) {
    const min = Math.min(...numericValues), max = Math.max(...numericValues);
    return { scaleType: 'numeric', minValue: min, maxValue: max, uniqueValues: uniqueStrings.sort((a, b) => Number(a) - Number(b)), confidence: 0.95, suggestion: `Numeric Likert scale detected: range ${min}-${max}` };
  }
  return { scaleType: 'categorical', minValue: null, maxValue: null, uniqueValues: uniqueStrings.sort(), confidence: 0.85, suggestion: `Categorical scale with ${uniqueStrings.length} unique labels. Map each label to a numeric value.` };
}

export type LikertCategory = 'agreement' | 'frequency' | 'satisfaction' | 'quality' | 'importance' | 'likelihood' | 'severity';

export interface LikertPreset {
  name: string;
  category: LikertCategory;
  points: number;
  labels: { label: string; value: number }[];
}

export const COMMON_LIKERT_SCALES: LikertPreset[] = [
  // Agreement
  { name: '3-pt Agreement', category: 'agreement', points: 3, labels: [{ label: 'Disagree', value: 1 }, { label: 'Neutral', value: 2 }, { label: 'Agree', value: 3 }] },
  { name: '5-pt Agreement', category: 'agreement', points: 5, labels: [{ label: 'Strongly Disagree', value: 1 }, { label: 'Disagree', value: 2 }, { label: 'Neutral', value: 3 }, { label: 'Agree', value: 4 }, { label: 'Strongly Agree', value: 5 }] },
  { name: '6-pt Agreement', category: 'agreement', points: 6, labels: [{ label: 'Strongly Disagree', value: 1 }, { label: 'Disagree', value: 2 }, { label: 'Slightly Disagree', value: 3 }, { label: 'Slightly Agree', value: 4 }, { label: 'Agree', value: 5 }, { label: 'Strongly Agree', value: 6 }] },
  { name: '7-pt Agreement', category: 'agreement', points: 7, labels: [{ label: 'Strongly Disagree', value: 1 }, { label: 'Disagree', value: 2 }, { label: 'Slightly Disagree', value: 3 }, { label: 'Neutral', value: 4 }, { label: 'Slightly Agree', value: 5 }, { label: 'Agree', value: 6 }, { label: 'Strongly Agree', value: 7 }] },
  // Frequency
  { name: '3-pt Frequency', category: 'frequency', points: 3, labels: [{ label: 'Never', value: 1 }, { label: 'Sometimes', value: 2 }, { label: 'Always', value: 3 }] },
  { name: '4-pt Frequency', category: 'frequency', points: 4, labels: [{ label: 'Never', value: 1 }, { label: 'Sometimes', value: 2 }, { label: 'Often', value: 3 }, { label: 'Always', value: 4 }] },
  { name: '5-pt Frequency', category: 'frequency', points: 5, labels: [{ label: 'Never', value: 1 }, { label: 'Rarely', value: 2 }, { label: 'Sometimes', value: 3 }, { label: 'Often', value: 4 }, { label: 'Always', value: 5 }] },
  { name: '6-pt Frequency', category: 'frequency', points: 6, labels: [{ label: 'Never', value: 1 }, { label: 'Rarely', value: 2 }, { label: 'Sometimes', value: 3 }, { label: 'Often', value: 4 }, { label: 'Very Often', value: 5 }, { label: 'Always', value: 6 }] },
  { name: '7-pt Frequency', category: 'frequency', points: 7, labels: [{ label: 'Never', value: 1 }, { label: 'Rarely', value: 2 }, { label: 'Occasionally', value: 3 }, { label: 'Sometimes', value: 4 }, { label: 'Frequently', value: 5 }, { label: 'Very Frequently', value: 6 }, { label: 'Always', value: 7 }] },
  // Satisfaction
  { name: '3-pt Satisfaction', category: 'satisfaction', points: 3, labels: [{ label: 'Dissatisfied', value: 1 }, { label: 'Neutral', value: 2 }, { label: 'Satisfied', value: 3 }] },
  { name: '4-pt Satisfaction', category: 'satisfaction', points: 4, labels: [{ label: 'Very Dissatisfied', value: 1 }, { label: 'Dissatisfied', value: 2 }, { label: 'Satisfied', value: 3 }, { label: 'Very Satisfied', value: 4 }] },
  { name: '5-pt Satisfaction', category: 'satisfaction', points: 5, labels: [{ label: 'Very Dissatisfied', value: 1 }, { label: 'Dissatisfied', value: 2 }, { label: 'Neutral', value: 3 }, { label: 'Satisfied', value: 4 }, { label: 'Very Satisfied', value: 5 }] },
  { name: '7-pt Satisfaction', category: 'satisfaction', points: 7, labels: [{ label: 'Very Dissatisfied', value: 1 }, { label: 'Dissatisfied', value: 2 }, { label: 'Somewhat Dissatisfied', value: 3 }, { label: 'Neutral', value: 4 }, { label: 'Somewhat Satisfied', value: 5 }, { label: 'Satisfied', value: 6 }, { label: 'Very Satisfied', value: 7 }] },
  // Quality
  { name: '3-pt Quality', category: 'quality', points: 3, labels: [{ label: 'Poor', value: 1 }, { label: 'Fair', value: 2 }, { label: 'Good', value: 3 }] },
  { name: '4-pt Quality', category: 'quality', points: 4, labels: [{ label: 'Poor', value: 1 }, { label: 'Fair', value: 2 }, { label: 'Good', value: 3 }, { label: 'Excellent', value: 4 }] },
  { name: '5-pt Quality', category: 'quality', points: 5, labels: [{ label: 'Poor', value: 1 }, { label: 'Fair', value: 2 }, { label: 'Good', value: 3 }, { label: 'Very Good', value: 4 }, { label: 'Excellent', value: 5 }] },
  // Importance
  { name: '3-pt Importance', category: 'importance', points: 3, labels: [{ label: 'Not Important', value: 1 }, { label: 'Neutral', value: 2 }, { label: 'Important', value: 3 }] },
  { name: '4-pt Importance', category: 'importance', points: 4, labels: [{ label: 'Not at All Important', value: 1 }, { label: 'Slightly Important', value: 2 }, { label: 'Moderately Important', value: 3 }, { label: 'Very Important', value: 4 }] },
  { name: '5-pt Importance', category: 'importance', points: 5, labels: [{ label: 'Not at All Important', value: 1 }, { label: 'Slightly Important', value: 2 }, { label: 'Moderately Important', value: 3 }, { label: 'Very Important', value: 4 }, { label: 'Extremely Important', value: 5 }] },
  // Likelihood
  { name: '3-pt Likelihood', category: 'likelihood', points: 3, labels: [{ label: 'Unlikely', value: 1 }, { label: 'Neutral', value: 2 }, { label: 'Likely', value: 3 }] },
  { name: '4-pt Likelihood', category: 'likelihood', points: 4, labels: [{ label: 'Very Unlikely', value: 1 }, { label: 'Unlikely', value: 2 }, { label: 'Likely', value: 3 }, { label: 'Very Likely', value: 4 }] },
  { name: '5-pt Likelihood', category: 'likelihood', points: 5, labels: [{ label: 'Very Unlikely', value: 1 }, { label: 'Unlikely', value: 2 }, { label: 'Neutral', value: 3 }, { label: 'Likely', value: 4 }, { label: 'Very Likely', value: 5 }] },
  { name: '7-pt Likelihood', category: 'likelihood', points: 7, labels: [{ label: 'Extremely Unlikely', value: 1 }, { label: 'Unlikely', value: 2 }, { label: 'Slightly Unlikely', value: 3 }, { label: 'Neutral', value: 4 }, { label: 'Slightly Likely', value: 5 }, { label: 'Likely', value: 6 }, { label: 'Extremely Likely', value: 7 }] },
  // Severity
  { name: '3-pt Severity', category: 'severity', points: 3, labels: [{ label: 'Mild', value: 1 }, { label: 'Moderate', value: 2 }, { label: 'Severe', value: 3 }] },
  { name: '4-pt Severity', category: 'severity', points: 4, labels: [{ label: 'None', value: 1 }, { label: 'Mild', value: 2 }, { label: 'Moderate', value: 3 }, { label: 'Severe', value: 4 }] },
  { name: '5-pt Severity', category: 'severity', points: 5, labels: [{ label: 'None', value: 1 }, { label: 'Mild', value: 2 }, { label: 'Moderate', value: 3 }, { label: 'Severe', value: 4 }, { label: 'Extreme', value: 5 }] },
];

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) for (let j = 1; j <= a.length; j++) matrix[i][j] = b[i - 1] === a[j - 1] ? matrix[i - 1][j - 1] : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
  return matrix[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const la = a.toLowerCase().replace(/[^a-z0-9]/g, ''), lb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!la || !lb) return 0;
  if (la === lb) return 1;
  return 1 - levenshtein(la, lb) / Math.max(la.length, lb.length);
}

export function recognizeColumns(slots: { name: string; aliases?: string[] }[], actualColumns: string[]): SlotMapping[] {
  return slots.map((slot) => {
    const candidates = [slot.name, ...(slot.aliases || [])];
    let best: { column: string; confidence: number; rule: string } | null = null;
    for (const candidate of candidates) for (const col of actualColumns)
      if (col.toLowerCase().trim() === candidate.toLowerCase().trim() && (!best || 1 > best.confidence)) best = { column: col, confidence: 1, rule: `exact match: "${col}" = "${candidate}"` };
    if (!best) for (const candidate of candidates) for (const col of actualColumns) { const sim = similarity(candidate, col); if (sim > 0.6 && (!best || sim > best.confidence)) best = { column: col, confidence: sim, rule: `fuzzy match: "${col}" ~ "${candidate}" (${(sim * 100).toFixed(0)}%)` }; }
    return { slotName: slot.name, matchedColumn: best?.column || null, confidence: best?.confidence || 0, matchedRule: best?.rule || 'no match found' };
  });
}

/**
 * Psychometric template helpers.
 * Templates store reusable instrument behaviour only:
 * subscales, reverse keys, response scales, interpretation bands.
 * Demographics are detected per-dataset and must not be treated as fixed template content.
 */

import type { TemplateDefinition } from '@/lib/supabase';
import { recognizeColumns } from '@/scientific/detection';

export interface TemplateItemRef {
  name: string;
  aliases: string[];
  order: number;
  reverse: boolean;
}

export interface SubscaleStateLike {
  name: string;
  items: { column: string; order: number; reverse: boolean }[];
  scoringMethod: 'sum' | 'mean' | 'custom';
  customFormula: string;
  scaleType: 'numeric' | 'categorical';
  minValue: number | null;
  maxValue: number | null;
  labelMap: { label: string; value: number }[];
}

export interface BandStateLike {
  name: string;
  minScore: number;
  maxScore: number;
  color: string;
}

export interface MatchDetail {
  subscaleName: string;
  itemName: string;
  matchedColumn: string | null;
  confidence: number;
  rule: string;
  reverse: boolean;
  order: number;
}

export interface TemplateMatchReport {
  templateName: string;
  totalItems: number;
  matchedCount: number;
  unmatchedCount: number;
  details: MatchDetail[];
  unmatchedNames: string[];
  matchedBySubscale: Record<string, { column: string; order: number; reverse: boolean }[]>;
}

/** Normalize a header/item name for alias generation */
export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[_\-./\\]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build useful aliases from a column name so future datasets still match */
export function buildAliases(columnName: string): string[] {
  const raw = columnName.trim();
  const aliases = new Set<string>();
  aliases.add(raw);
  aliases.add(raw.toLowerCase());
  aliases.add(normalizeLabel(raw));

  // Compact form: "Q 1" / "item_01" → q1, item01
  const compact = normalizeLabel(raw).replace(/\s+/g, '');
  if (compact) aliases.add(compact);

  // Common survey export patterns
  const noPrefix = raw.replace(/^(item|question|q|var|v)[_\s-]*/i, '').trim();
  if (noPrefix && noPrefix !== raw) {
    aliases.add(noPrefix);
    aliases.add(normalizeLabel(noPrefix));
  }

  return Array.from(aliases).filter(Boolean);
}

/** Build a TemplateDefinition from current configure state (no demographics) */
export function buildTemplateDefinition(
  subscaleStates: SubscaleStateLike[],
  bandStates: Record<string, BandStateLike[]>,
): TemplateDefinition {
  return {
    subscales: subscaleStates.map((s) => ({
      name: s.name,
      description: '',
      scoringMethod: s.scoringMethod,
      customFormula: s.customFormula || null,
      items: s.items.map((i) => ({
        name: i.column,
        aliases: buildAliases(i.column),
        order: i.order,
        reverse: i.reverse,
      })),
    })),
    responseScales: subscaleStates.map((s) => ({
      subscaleName: s.name,
      scaleType: s.scaleType,
      minValue: s.minValue,
      maxValue: s.maxValue,
      labelMap: s.labelMap,
    })),
    interpretationBands: Object.entries(bandStates).map(([n, bs]) => ({
      subscaleName: n,
      bands: bs.map((b) => ({
        name: b.name,
        minScore: b.minScore,
        maxScore: b.maxScore,
        color: b.color,
      })),
    })),
    // Kept for schema compatibility only — demographics are always re-detected per dataset
    demographicRules: { patterns: [], contentHeuristics: [] },
  };
}

/** Match a template to dataset headers and return a detailed report */
export function matchTemplateToHeaders(
  templateName: string,
  def: TemplateDefinition,
  headers: string[],
): TemplateMatchReport {
  const details: MatchDetail[] = [];
  const matchedBySubscale: Record<string, { column: string; order: number; reverse: boolean }[]> = {};
  const usedColumns = new Set<string>();

  for (const sd of def.subscales || []) {
    matchedBySubscale[sd.name] = [];
    const mappings = recognizeColumns(
      sd.items.map((i) => ({ name: i.name, aliases: i.aliases || [] })),
      headers,
    );

    for (let idx = 0; idx < sd.items.length; idx++) {
      const item = sd.items[idx];
      const map = mappings[idx];
      let matchedColumn = map?.matchedColumn || null;
      let confidence = map?.confidence || 0;
      let rule = map?.matchedRule || 'no match found';

      // Avoid assigning the same dataset column to multiple template items
      if (matchedColumn && usedColumns.has(matchedColumn)) {
        matchedColumn = null;
        confidence = 0;
        rule = 'column already matched to another item';
      }
      if (matchedColumn) usedColumns.add(matchedColumn);

      details.push({
        subscaleName: sd.name,
        itemName: item.name,
        matchedColumn,
        confidence,
        rule,
        reverse: item.reverse,
        order: item.order,
      });

      if (matchedColumn) {
        matchedBySubscale[sd.name].push({
          column: matchedColumn,
          order: item.order,
          reverse: item.reverse,
        });
      }
    }
  }

  const matchedCount = details.filter((d) => d.matchedColumn).length;
  const unmatchedNames = details.filter((d) => !d.matchedColumn).map((d) => `${d.subscaleName}: ${d.itemName}`);

  return {
    templateName,
    totalItems: details.length,
    matchedCount,
    unmatchedCount: details.length - matchedCount,
    details,
    unmatchedNames,
    matchedBySubscale,
  };
}

export function formatMatchSummary(report: TemplateMatchReport): string {
  const base = `Matched ${report.matchedCount}/${report.totalItems} items from "${report.templateName}".`;
  if (report.unmatchedCount === 0) return `${base} All items mapped — review reverse flags and scales, then score if needed.`;
  const preview = report.unmatchedNames.slice(0, 5).join('; ');
  const more = report.unmatchedCount > 5 ? ` (+${report.unmatchedCount - 5} more)` : '';
  return `${base} Unmatched: ${preview}${more}. Review mappings before scoring.`;
}

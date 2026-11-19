/**
 * Build a plain-language methods / analysis report from saved config + run facts.
 * No invention: only states what the app actually stored or scored.
 */

export type ReportScale = {
  name: string;
  itemColumns: string[];
  reversedColumns: string[];
  scoreType?: 'sum' | 'mean' | string;
};

export type ReportResponseScale = {
  name: string;
  min?: number;
  max?: number;
  mappingSummary?: string;
};

export type ReportInput = {
  projectName: string;
  sheetName: string;
  sourceFileName?: string | null;
  rowCount: number;
  excludedCount: number;
  demographics: string[];
  scales: ReportScale[];
  responseScales?: ReportResponseScale[];
  prorationEnabled: boolean;
  prorationMaxMissingPct?: number;
  scored: boolean;
  scoredRowCount?: number;
  proratedScoreCount?: number;
  scoreColumnNames?: string[];
  generatedAt?: Date;
};

export function buildMethodsReport(input: ReportInput): string {
  const when = (input.generatedAt ?? new Date()).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  const lines: string[] = [];

  lines.push(`# Analysis report`);
  lines.push(``);
  lines.push(`**Project:** ${input.projectName}`);
  lines.push(`**Sheet:** ${input.sheetName}`);
  if (input.sourceFileName) lines.push(`**Source file:** ${input.sourceFileName}`);
  lines.push(`**Generated:** ${when}`);
  lines.push(``);

  lines.push(`## Sample`);
  lines.push(
    `- ${input.rowCount} respondent row${input.rowCount === 1 ? '' : 's'} on this sheet` +
      (input.excludedCount > 0
        ? `; ${input.excludedCount} excluded from scoring and data-quality flags`
        : `; none excluded`),
  );
  if (input.demographics.length > 0) {
    lines.push(`- Demographic / ID columns: ${input.demographics.join(', ')}`);
  } else {
    lines.push(`- No columns marked as demographic / ID`);
  }
  lines.push(``);

  lines.push(`## Scales and items`);
  if (input.scales.length === 0) {
    lines.push(`No scales were configured.`);
  } else {
    for (const scale of input.scales) {
      lines.push(`### ${scale.name}`);
      lines.push(`- Items (${scale.itemColumns.length}): ${scale.itemColumns.join(', ') || '(none)'}`);
      if (scale.reversedColumns.length > 0) {
        lines.push(`- Reverse-scored: ${scale.reversedColumns.join(', ')}`);
      } else {
        lines.push(`- Reverse-scored: none`);
      }
      if (scale.scoreType) {
        lines.push(`- Score type: ${scale.scoreType}`);
      }
      lines.push(``);
    }
  }

  if (input.responseScales && input.responseScales.length > 0) {
    lines.push(`## Response scales`);
    for (const rs of input.responseScales) {
      const range =
        rs.min != null && rs.max != null ? `${rs.min}–${rs.max}` : 'as configured';
      lines.push(`- **${rs.name}:** ${range}${rs.mappingSummary ? ` (${rs.mappingSummary})` : ''}`);
    }
    lines.push(``);
  }

  lines.push(`## Missing data / proration`);
  if (input.prorationEnabled) {
    lines.push(
      `- Proration was **enabled** (allow up to ${input.prorationMaxMissingPct ?? 20}% missing items on a scale).`,
    );
    lines.push(
      `- When used, missing item cells for that respondent–scale were filled with the mean of that respondent’s answered items on the same scale, then the scale score was computed. Original item values in the grid stay unchanged; only the scale score may be marked as prorated.`,
    );
  } else {
    lines.push(`- Proration was **off**. Missing items were left blank; a scale score may be absent when required items were missing.`);
  }
  lines.push(``);

  lines.push(`## Scoring run`);
  if (!input.scored) {
    lines.push(`Scoring has not been run yet on this sheet (or no cached result is loaded).`);
  } else {
    lines.push(
      `- Scored rows: ${input.scoredRowCount ?? '—'}` +
        (input.excludedCount > 0 ? ` (${input.excludedCount} excluded rows omitted)` : ''),
    );
    if (input.prorationEnabled) {
      lines.push(
        `- Prorated scale scores: ${input.proratedScoreCount ?? 0}`,
      );
    }
    if (input.scoreColumnNames && input.scoreColumnNames.length > 0) {
      lines.push(`- Score columns: ${input.scoreColumnNames.join(', ')}`);
    }
  }
  lines.push(``);

  lines.push(`## Notes`);
  lines.push(`- This report is generated from the configuration and results stored in this browser project. It is a methods aid, not a substitute for your own write-up.`);
  lines.push(`- Item responses are not rewritten by reverse-scoring or proration in the exported raw cells unless your export options say otherwise.`);
  lines.push(``);

  return lines.join('\n');
}

export function reportFilename(projectName: string, sheetName: string): string {
  const safe = (s: string) => s.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 40);
  return `${safe(projectName)}_${safe(sheetName)}_report.md`;
}

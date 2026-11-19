/**
 * A2 — proration explanation UI
 * Run from repo root: node apply-a2.cjs
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const libDest = path.join(root, 'src/lib/prorationExplain.ts');
const testDest = path.join(root, 'tests/prorationExplain.test.ts');
const configPath = path.join(root, 'src/components/ConfigScreen.tsx');

const libSrc = path.join(__dirname, 'prorationExplain.ts');
const testSrc = path.join(__dirname, 'prorationExplain.test.ts');

if (!fs.existsSync(configPath)) {
  console.error('Run this from the repo root (ConfigScreen.tsx not found).');
  process.exit(1);
}

fs.mkdirSync(path.dirname(libDest), { recursive: true });
fs.mkdirSync(path.dirname(testDest), { recursive: true });
fs.copyFileSync(libSrc, libDest);
fs.copyFileSync(testSrc, testDest);
console.log('Wrote', path.relative(root, libDest));
console.log('Wrote', path.relative(root, testDest));

let src = fs.readFileSync(configPath, 'utf8');
let changed = false;

// 1) Import helpers once
if (!src.includes("from '@/lib/prorationExplain'")) {
  const importNeedle = "from '@/lib/phaseA'";
  const importIdx = src.indexOf(importNeedle);
  if (importIdx < 0) {
    console.error('Could not find phaseA import to attach prorationExplain import.');
    process.exit(1);
  }
  // insert after the phaseA import line
  const lineEnd = src.indexOf('\n', importIdx);
  src = src.slice(0, lineEnd + 1)
    + "import { buildProrationPreview, buildProrationReport, prorationStatusLine } from '@/lib/prorationExplain';\n"
    + src.slice(lineEnd + 1);
  changed = true;
}

// 2) Replace the thin proration blurb + post-score CSV buttons block inside ScoringPanel
// with an explanatory panel. We match a distinctive stretch of the current panel.
const oldBlockStart = '            {prorationEnabled && (\n              <div>\n                {proratedCount > 0\n                  ? `${proratedCount} score${proratedCount === 1 ? \'\' : \'s\'} prorated (≤${prorationMaxMissingPct}% missing)`\n                  : `Proration on (≤${prorationMaxMissingPct}%); none needed`}\n              </div>\n            )}';

// Broader: inject preview card before Run Scoring button
const runBtnMarker = '<Button onClick={onRunScoring} disabled={!canScore || scoring} className="w-full mb-3">';
if (!src.includes('data-a2-proration-preview') && src.includes(runBtnMarker)) {
  const previewJsx = `
      {prorationEnabled && prorationPreview && (
        <Card className="p-3 mb-3 border-secondary-200 bg-secondary-50/40" data-a2-proration-preview>
          <div className="text-xs font-semibold text-secondary-700 mb-1">What proration will do</div>
          <p className="text-xs text-secondary-600 mb-2 leading-relaxed">{prorationPreview.summaryLine}</p>
          {prorationPreview.candidates.length > 0 && (
            <ul className="text-xs text-secondary-700 space-y-1 max-h-36 overflow-y-auto mb-1">
              {prorationPreview.candidates.slice(0, 12).map((gap) => (
                <li key={\`\${gap.rowId}-\${gap.scaleName}\`}>
                  <button
                    type="button"
                    className="text-primary-700 hover:underline text-left"
                    onClick={() => onInspectProration?.(gap.rowIndex, gap.missingColumns[0])}
                  >
                    {gap.displayId}
                  </button>
                  {' · '}{gap.scaleName}
                  {' · missing '}{gap.missingColumns.join(', ')}
                  {' ('}{gap.missingColumns.length}/{gap.itemCount}{')'}
                </li>
              ))}
              {prorationPreview.candidates.length > 12 && (
                <li className="text-secondary-400">+{prorationPreview.candidates.length - 12} more</li>
              )}
            </ul>
          )}
          {prorationPreview.tooMuchMissing.length > 0 && (
            <p className="text-xs text-warning-700 mt-1">
              {prorationPreview.tooMuchMissing.length} gap{prorationPreview.tooMuchMissing.length === 1 ? '' : 's'} over the limit will not be filled.
            </p>
          )}
        </Card>
      )}
`;
  src = src.replace(runBtnMarker, previewJsx + '\n      ' + runBtnMarker);
  changed = true;
  console.log('Injected proration preview card before Run Scoring');
}

// 3) Enrich post-score complete card with report list
const oldCompleteProration = `{prorationEnabled && (
              <div>
                {proratedCount > 0
                  ? \`\${proratedCount} score\${proratedCount === 1 ? '' : 's'} prorated (≤\${prorationMaxMissingPct}% missing)\`
                  : \`Proration on (≤\${prorationMaxMissingPct}%); none needed\`}
              </div>
            )}`;

const newCompleteProration = `{prorationEnabled && (
              <div className="space-y-1">
                <div>{prorationAfterLine}</div>
                {prorationReport.hits.length > 0 && (
                  <ul className="mt-1 space-y-0.5 max-h-28 overflow-y-auto">
                    {prorationReport.hits.slice(0, 10).map((hit) => (
                      <li key={\`\${hit.rowId}-\${hit.scaleName}\`}>
                        <button
                          type="button"
                          className="text-primary-700 hover:underline"
                          onClick={() => onInspectProration?.(hit.rowIndex)}
                        >
                          {hit.displayId}
                        </button>
                        {' · '}{hit.scaleName}
                      </li>
                    ))}
                    {prorationReport.hits.length > 10 && (
                      <li className="text-secondary-400">+{prorationReport.hits.length - 10} more</li>
                    )}
                  </ul>
                )}
              </div>
            )}`;

if (src.includes(oldCompleteProration)) {
  src = src.replace(oldCompleteProration, newCompleteProration);
  changed = true;
  console.log('Replaced post-score proration summary');
} else if (!src.includes('prorationAfterLine')) {
  console.warn('Post-score proration block not found — preview may still work; check ScoringPanel manually.');
}

// 4) Extend ScoringPanel props + body variables
// Add optional props to the destructuring if missing
if (!src.includes('onInspectProration') && src.includes('onProrationThresholdChange }: {')) {
  src = src.replace(
    'onProrationThresholdChange }: {',
    'onProrationThresholdChange, prorationPreview, prorationReport, prorationAfterLine, onInspectProration }: {',
  );
  changed = true;
}

if (!src.includes('prorationPreview:') && src.includes('onProrationThresholdChange: (pct: 20 | 25 | 50) => void;')) {
  src = src.replace(
    'onProrationThresholdChange: (pct: 20 | 25 | 50) => void;',
    `onProrationThresholdChange: (pct: 20 | 25 | 50) => void;
  prorationPreview: ReturnType<typeof buildProrationPreview> | null;
  prorationReport: ReturnType<typeof buildProrationReport>;
  prorationAfterLine: string;
  onInspectProration?: (rowIndex: number, columnKey?: string) => void;`,
  );
  changed = true;
}

// 5) Pass props at the ScoringPanel call site
if (!src.includes('prorationPreview={') && src.includes('onProrationThresholdChange={(pct)')) {
  // Insert before closing of ScoringPanel — find onProrationThresholdChange handler end nearby
  const callMarker = 'onProrationThresholdChange={(pct)';
  const idx = src.indexOf(callMarker);
  if (idx >= 0) {
    // Find the end of this prop - typically ends with }} then more props or />
    // Simpler: add props after prorationMaxMissingPct={prorationMaxMissingPct}
    if (src.includes('prorationMaxMissingPct={prorationMaxMissingPct}')) {
      src = src.replace(
        'prorationMaxMissingPct={prorationMaxMissingPct}',
        `prorationMaxMissingPct={prorationMaxMissingPct}
                    prorationPreview={prorationPreview}
                    prorationReport={prorationReport}
                    prorationAfterLine={prorationAfterLine}
                    onInspectProration={(rowIndex, columnKey) => {
                      if (columnKey) setHighlightCell({ rowIndex, columnKey });
                      else setHighlightRowIndexLocal?.(rowIndex);
                    }}`,
      );
      changed = true;
      console.log('Passed proration explain props into ScoringPanel');
    }
  }
}

// 6) Compute preview/report near scoring UI in ConfigScreen body (before return of main component)
// Insert after pendingResponseAnswers or before scoredColumnData useMemo
if (!src.includes('const prorationPreview =') && src.includes('const scoredColumnData = useMemo')) {
  const inject = `
  const prorationScales = useMemo(() => (
    subscaleStates
      .filter((s) => !isAutomaticSubscale(s) || subscaleStates.length === 1)
      .map((s) => ({ name: s.name, items: s.items.map((i) => i.column) }))
      .filter((s) => s.items.length > 0)
  ), [subscaleStates]);

  const prorationPreview = useMemo(() => {
    if (!dataset || !prorationEnabled) return null;
    return buildProrationPreview({
      scales: prorationScales,
      rows: dataset.rows as Record<string, unknown>[],
      rowIds: dataset.row_ids,
      displayIds: getDisplayIds(dataset.rows, demoCols),
      excludedRowIndices: sharedExcludedRows,
      maxMissingPercent: prorationMaxMissingPct,
    });
  }, [dataset, prorationEnabled, prorationScales, demoCols, sharedExcludedRows, prorationMaxMissingPct]);

  const prorationReport = useMemo(() => {
    if (!scoringResult || !dataset) {
      return { hits: [] as ReturnType<typeof buildProrationReport>['hits'], summaryLine: '' };
    }
    return buildProrationReport({
      scaleScores: scoringResult.scaleScores as Record<string, Record<string, { prorated?: boolean }>>,
      rowIds: dataset.row_ids,
      displayIds: getDisplayIds(dataset.rows, demoCols),
    });
  }, [scoringResult, dataset, demoCols]);

  const prorationAfterLine = prorationStatusLine(
    prorationEnabled,
    prorationMaxMissingPct,
    prorationPreview?.candidates.length ?? 0,
    scoringResult ? prorationReport.hits.length : null,
  );

  const setHighlightRowIndexLocal = (rowIndex: number) => {
    setHighlightCell({ rowIndex, columnKey: dataset?.headers?.[0] ?? '' });
  };

`;
  src = src.replace('const scoredColumnData = useMemo', inject + '  const scoredColumnData = useMemo');
  changed = true;
  console.log('Injected prorationPreview / report memos');
}

// Remove export CSV/XLSX from scoring complete card if still present (user wanted export only on Export step)
// Optional — only if distinctive block remains
const exportBtns = `<div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onExport('csv')} className="flex-1 text-xs"><FileDown className="w-3 h-3" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={() => onExport('xlsx')} className="flex-1 text-xs"><FileDown className="w-3 h-3" /> XLSX</Button>
          </div>`;
if (src.includes(exportBtns)) {
  src = src.replace(exportBtns, `<p className="text-xs text-secondary-500 mt-1">Use the Export tab to download files.</p>`);
  changed = true;
  console.log('Removed redundant CSV/XLSX from scoring panel (Export tab remains)');
}

if (!changed && !src.includes('buildProrationPreview')) {
  console.error('No changes applied — ConfigScreen shape may differ. Files were still copied.');
  process.exit(1);
}

fs.writeFileSync(configPath, src);
console.log('Updated ConfigScreen.tsx');
console.log('Done. Run: npx vitest run tests/prorationExplain.test.ts && npm run build');

/**
 * A4 — methods report from provenance
 * From repo root: node apply-a4.cjs
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = [
  ['reportFromProvenance.ts', 'src/lib/reportFromProvenance.ts'],
  ['reportFromProvenance.test.ts', 'tests/reportFromProvenance.test.ts'],
  ['ReportScreen.tsx', 'src/components/ReportScreen.tsx'],
];

for (const [srcName, destRel] of files) {
  const src = path.join(__dirname, srcName);
  const dest = path.join(root, destRel);
  if (!fs.existsSync(src)) {
    console.error('Missing pack file', srcName);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('Wrote', destRel);
}

// Ensure App imports ReportScreen (idempotent)
const appPath = path.join(root, 'src/App.tsx');
if (fs.existsSync(appPath)) {
  let app = fs.readFileSync(appPath, 'utf8');
  let touched = false;
  if (!app.includes("from '@/components/ReportScreen'") && !app.includes('from "./components/ReportScreen"')) {
    if (app.includes("from '@/components/ExportScreen'")) {
      app = app.replace(
        "from '@/components/ExportScreen';",
        "from '@/components/ExportScreen';\nimport { ReportScreen } from '@/components/ReportScreen';",
      );
      touched = true;
      console.log('Added ReportScreen import to App.tsx');
    }
  }
  if (!app.includes('<ReportScreen') && app.includes("view === 'export'")) {
    // Insert report view next to export if missing
    const exportBlock = app.match(/\{view === 'export' && \([\s\S]*?<\/ExportScreen>\s*\)\}/);
    if (exportBlock) {
      const insert = `${exportBlock[0]}
        {view === 'report' && (
          <ReportScreen
            project={project}
            excludedRows={excludedRows}
            sharedDatasetId={activeDatasetId}
            onDatasetChange={changeActiveDataset}
          />
        )}`;
      app = app.replace(exportBlock[0], insert);
      touched = true;
      console.log('Added ReportScreen view branch');
    }
  }
  if (touched) fs.writeFileSync(appPath, app);
} else {
  console.warn('src/App.tsx not found — ReportScreen file was still written.');
}

console.log('Done. Run:');
console.log('  npx vitest run tests/reportFromProvenance.test.ts');
console.log('  npm run build');
console.log('  npm run dev');

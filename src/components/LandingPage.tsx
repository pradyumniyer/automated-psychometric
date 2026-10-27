import React from 'react';
import { FileSpreadsheet, Shield, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

type Props = {
  onOpenApp: () => void;
  /** Optional Google Form / Typeform / Tally URL for beta feedback */
  feedbackUrl?: string;
};

const FEATURES = [
  {
    title: 'Import messy exports',
    body: 'CSV and Excel from Qualtrics-style layouts, Google Forms, and multi-sheet workbooks. Preview before you commit.',
  },
  {
    title: 'Organize scales',
    body: 'Mark demographics, split a wide sheet into instruments, group items into subscales, and flag reverse-scored items.',
  },
  {
    title: 'Map responses & score',
    body: 'Numeric or word scales (including PHQ-9 / GAD-7 style presets), special codes, sum or mean, optional proration.',
  },
  {
    title: 'Check & export',
    body: 'Data-quality flags, then export analysis-ready files. Your original answers stay available in the grid.',
  },
];

const SCOPE_IN = [
  'Survey / scale scoring from files you already have',
  'Subscales, reverse items, word→number maps',
  'Basic data-quality checks and export',
];

const SCOPE_OUT = [
  'Not a full SPSS / jamovi / R replacement',
  'Not SEM, IRT, or factor analysis',
  'Not a mobile EMA data-collection app',
  'Not a place that uploads respondent data to our servers',
];

export function LandingPage({ onOpenApp, feedbackUrl }: Props) {
  return (
    <div className="min-h-screen bg-secondary-50 text-secondary-900">
      <header className="border-b border-secondary-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-primary-600" aria-hidden />
            <span className="font-semibold text-secondary-900">Psychometric Prep</span>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-warning-100 text-warning-800 border border-warning-200">
              Beta
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenApp}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            Open app
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-12">
        <section className="space-y-4">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-secondary-900">
            From messy survey export to analysis-ready scores
          </h1>
          <p className="text-lg text-secondary-600 leading-relaxed">
            Psychometric Prep is a browser workbench for Likert and multi-item scales.
            Import a file, set up subscales and response maps, score, check data quality, and export —
            without writing SPSS or R syntax.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={onOpenApp}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 shadow-sm"
            >
              Open the app
              <ArrowRight className="w-4 h-4" />
            </button>
            {feedbackUrl ? (
              <a
                href={feedbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg border border-secondary-300 bg-white text-secondary-800 hover:bg-secondary-50"
              >
                Beta feedback form
              </a>
            ) : null}
          </div>
          <p className="flex items-start gap-2 text-sm text-secondary-600 bg-white border border-secondary-200 rounded-lg px-3 py-2.5">
            <Shield className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" aria-hidden />
            <span>
              <strong className="text-secondary-800">Local-first:</strong> projects and respondent data
              stay in <em>your</em> browser. This beta does not upload your spreadsheet to our servers.
              Clearing site data or using another device means the data is not there.
            </span>
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-secondary-500">Workflow</h2>
          <ol className="grid sm:grid-cols-2 gap-3">
            {FEATURES.map((f, i) => (
              <li
                key={f.title}
                className="bg-white border border-secondary-200 rounded-xl p-4 shadow-sm"
              >
                <div className="text-xs font-semibold text-primary-700 mb-1">Step {i + 1}</div>
                <div className="font-medium text-secondary-900">{f.title}</div>
                <p className="text-sm text-secondary-600 mt-1 leading-relaxed">{f.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white border border-secondary-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-secondary-900 flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-success-600" aria-hidden />
              In scope (beta)
            </h2>
            <ul className="space-y-1.5 text-sm text-secondary-700">
              {SCOPE_IN.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-success-600">·</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white border border-secondary-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-secondary-900 flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-secondary-500" aria-hidden />
              Out of scope (for now)
            </h2>
            <ul className="space-y-1.5 text-sm text-secondary-700">
              {SCOPE_OUT.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-secondary-400">·</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-primary-50 border border-primary-100 rounded-xl p-5 space-y-2">
          <h2 className="font-semibold text-primary-900">Closed beta</h2>
          <p className="text-sm text-primary-900/80 leading-relaxed">
            Expect rough edges. Try a real Qualtrics or Forms export if you can.
            If something fails, use the feedback form (or email the person who invited you)
            and mention the file type and which step broke.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={onOpenApp}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              Start scoring
              <ArrowRight className="w-4 h-4" />
            </button>
            {feedbackUrl ? (
              <a
                href={feedbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary-800 underline underline-offset-2 hover:text-primary-950"
              >
                Send feedback
              </a>
            ) : null}
          </div>
        </section>
      </main>

      <footer className="border-t border-secondary-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-6 text-xs text-secondary-500 space-y-1">
          <p>Psychometric Prep · closed beta · data processed in your browser</p>
          <p>
            Not a medical device. Not a substitute for validated scoring protocols or institutional review requirements.
          </p>
        </div>
      </footer>
    </div>
  );
}

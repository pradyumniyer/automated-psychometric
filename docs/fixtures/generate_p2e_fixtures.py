#!/usr/bin/env python3
"""Generate P2e-1 synthetic fixtures C (Qualtrics-style words) and G (tiny n=6)."""
from pathlib import Path
import json
import csv

OUT = Path(__file__).resolve().parent

def write_csv(path, rows):
    with path.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        for row in rows:
            w.writerow(row)

# ── Fixture C: Qualtrics-like headers + PHQ-style word answers ──
# Row0: variable names, Row1: question text, Row2: ImportId JSON, then data
labels = [
    'Not at all',
    'Several days',
    'More than half the days',
    'Nearly every day',
]
# 12 respondents, 9 PHQ-like items (words), Prefer not to say on some
c_headers = ['ResponseId', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9']
c_questions = ['ResponseId'] + [f'Over the last 2 weeks, item {i}?' for i in range(1, 10)]
c_import = ['{"ImportId":"ResponseId"}'] + [f'{{"ImportId":"Q{i}"}}' for i in range(1, 10)]

# Simple deterministic pattern
data_c = []
for i in range(1, 13):
    rid = f'R{i:03d}'
    vals = []
    for q in range(1, 10):
        if i == 3 and q == 2:
            vals.append('Prefer not to say')
        else:
            vals.append(labels[(i + q) % 4])
    data_c.append([rid] + vals)

write_csv(OUT / 'fixture_C.csv', [c_headers, c_questions, c_import] + data_c)
(OUT / 'fixture_C_expected.json').write_text(json.dumps({
    'layout': {
        'headerRowIndex': 0,
        'importIdRowIndex': 2,
        'dataStartRowIndex': 3,
        'respondentCount': 12,
        'itemColumns': [f'Q{i}' for i in range(1, 10)],
    },
    'notes': 'Qualtrics-style three header rows; PHQ-like 0-3 word scale; Prefer not to say not scored',
    'scale': {'min': 0, 'max': 3, 'labels': labels},
}, indent=2), encoding='utf-8')

# ── Fixture G: tiny n=6 ──
g_headers = ['ID', 'Age', 'S1', 'S2', 'S3']
g_data = [
    ['P1', 20, 1, 2, 3],
    ['P2', 22, 2, 2, 2],
    ['P3', 25, 3, 3, 1],
    ['P4', 30, 1, 1, 1],
    ['P5', 28, 4, 3, 2],
    ['P6', 21, 2, 4, 3],
]
write_csv(OUT / 'fixture_G.csv', [g_headers] + g_data)
# Expected sum per row for S1+S2+S3
sums = [sum(r[2:]) for r in g_data]
(OUT / 'fixture_G_expected.json').write_text(json.dumps({
    'respondentCount': 6,
    'itemColumns': ['S1', 'S2', 'S3'],
    'scale': {'min': 1, 'max': 5},
    'rowSums': sums,
    'notes': 'Tiny sample for small-n scoring and DQ edges',
}, indent=2), encoding='utf-8')

print('Wrote fixture_C.csv, fixture_C_expected.json, fixture_G.csv, fixture_G_expected.json')

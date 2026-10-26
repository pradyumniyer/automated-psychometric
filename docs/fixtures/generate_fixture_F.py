#!/usr/bin/env python3
"""
P2e-3 Fixture F — wide / tall synthetic export.

Default (committed size): 120 columns × 300 rows — large enough to stress UI/import paths
without bloating the git repo.

Full stress (optional, not committed):
  python docs/fixtures/generate_fixture_F.py --cols 2000 --rows 5000 --out docs/fixtures/fixture_F_full.csv
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent


def generate(cols: int, rows: int, path: Path) -> dict:
    # ID + Age + item columns
    n_items = max(1, cols - 2)
    headers = ['ID', 'Age'] + [f'Q{i}' for i in range(1, n_items + 1)]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(headers)
        for r in range(1, rows + 1):
            row = [f'W{r:05d}', 18 + (r % 50)]
            for c in range(1, n_items + 1):
                row.append((r + c) % 5 + 1)
            w.writerow(row)
    meta = {
        'columns': len(headers),
        'rows': rows,
        'itemColumns': n_items,
        'notes': 'Wide/tall synthetic numeric export for performance smoke tests',
        'defaultCommitted': cols <= 150 and rows <= 400,
    }
    meta_path = path.with_name(path.stem + '_expected.json')
    meta_path.write_text(json.dumps(meta, indent=2), encoding='utf-8')
    return meta


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--cols', type=int, default=120)
    p.add_argument('--rows', type=int, default=300)
    p.add_argument('--out', type=Path, default=OUT / 'fixture_F.csv')
    args = p.parse_args()
    meta = generate(args.cols, args.rows, args.out)
    print(f'Wrote {args.out} ({meta["columns"]} cols × {meta["rows"]} rows)')


if __name__ == '__main__':
    main()

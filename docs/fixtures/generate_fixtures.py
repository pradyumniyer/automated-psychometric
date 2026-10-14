"""
Reference implementation for docs/TEST_FIXTURES.md.

Regenerates fixture_A.csv and fixture_A_expected.json from scratch using
NumPy/SciPy. These are the KNOWN-ANSWER values the TypeScript scientific
modules must reproduce (see scientific-spec.md for the rules this encodes).

Conventions encoded here (all from scientific-spec.md):
  - Likert items 1-5 (L=1, H=5). Reverse-keyed items: Q3, Q6, Q9.
  - Subscales: Sub1 = Q1-Q5, Sub2 = Q6-Q10. Overall = Q1-Q10.
  - "Missing for scoring" = blank + allowed non-response ("N/A", "Prefer not to say")
    + out-of-range numeric.
  - Proration: person-mean, inclusive threshold (m/k <= t), Sum = observed mean * k.
  - Row means (outlier/normality): mean of valid items AFTER reverse coding,
    only for rows with >= 50% valid items.
  - Quantiles: linear interpolation (R type 7 == numpy default).
  - Skewness G1 / excess kurtosis G2: bias-corrected (SPSS / jamovi convention).
  - Shapiro-Wilk: Royston (1995) algorithm via scipy.stats.shapiro.
  - Cronbach's alpha: listwise complete cases among INCLUDED rows, no proration.
Run:  python3 generate_fixtures.py
"""
import json, csv
import numpy as np
from scipy import stats

L, H = 1, 5
ITEMS = [f"Q{i}" for i in range(1, 11)]
REVERSE = {"Q3", "Q6", "Q9"}
SUBS = {"Sub1": ITEMS[:5], "Sub2": ITEMS[5:], "Overall": ITEMS}
ALLOWED_NR = {"N/A", "Prefer not to say"}
THRESH = 0.20
rng = np.random.default_rng(20261010)

# ---------- build raw data (as respondents answered, before reverse coding)
rows = []
for n in range(1, 25):                       # P01..P24: ordinary respondents
    z = rng.normal()
    resp = {}
    for q in ITEMS:
        scored_dir = np.clip(np.rint(3 + 0.9 * z + rng.normal(0, 0.8)), L, H)
        raw = (L + H) - scored_dir if q in REVERSE else scored_dir
        resp[q] = str(int(raw))
    rows.append({"ID": f"P{n:02d}", "Age": int(rng.integers(19, 45)), **resp})

def special(pid, age, vals):
    rows.append({"ID": pid, "Age": age, **{q: v for q, v in zip(ITEMS, vals)}})

special("P25", 27, ["4","4","2","4","Prefer not to say","2","4","4","2","4"])   # allowed non-response
special("P26", 31, ["3","4","3","7","4","2","3","3","3","4"])                  # out-of-range (7)
special("P27", 22, ["3"]*10)                                                    # straight-liner
special("P28", 29, ["5","1","5","5","1","5","1","5","1","5"])                  # extreme responder
special("P29", 35, ["4","","2","4","4","2","","4","2","4"])                    # 2 blank (20% overall)
special("P30", 24, ["","","N/A","3","4","3","4","3","4","3"])                  # 3 missing (30% overall)

# ---------- helpers
def to_num(v):
    """returns (value or None, category) category in valid|blank|allowed|oor"""
    if v is None or str(v).strip() == "":
        return None, "blank"
    if str(v) in ALLOWED_NR:
        return None, "allowed"
    x = float(v)
    if x < L or x > H:
        return None, "oor"
    return x, "valid"

def longstring(vals):
    best = cur = 0; prev = None
    for v in vals:
        if v is None: cur = 0; prev = None; continue
        cur = cur + 1 if v == prev else 1
        prev = v; best = max(best, cur)
    return best

def score_scale(items, row, prorate):
    xs = []
    for q in items:
        v, _ = to_num(row[q])
        xs.append(None if v is None else ((L + H) - v if q in REVERSE else v))
    k = len(xs); obs = [x for x in xs if x is not None]; m = k - len(obs)
    if m == 0:
        return {"sum": sum(obs), "mean": sum(obs)/k, "missing_items": 0, "prorated": False}
    if prorate and len(obs) >= 1 and m / k <= THRESH + 1e-12:
        mean = sum(obs)/len(obs)
        return {"sum": mean*k, "mean": mean, "missing_items": m, "prorated": True}
    return {"sum": None, "mean": None, "missing_items": m, "prorated": False}

# ---------- per-row expected values
per_row = {}
row_means = {}
for r in rows:
    raw = [to_num(r[q]) for q in ITEMS]
    rawv = [v for v, _ in raw]
    cats = [c for _, c in raw]
    valid = [v for v in rawv if v is not None]
    scored = [((L+H)-v if q in REVERSE else v) for q, v in zip(ITEMS, rawv) if v is not None]
    d = {
        "unexpected_missing_rate": cats.count("blank")/10,   # blank only; allowed NR excluded; oor counted separately
        "blank": cats.count("blank"), "allowed_nonresponse": cats.count("allowed"), "out_of_range": cats.count("oor"),
        "longstring_raw": longstring(rawv),
        "extreme_rate": (sum(1 for v in valid if v in (L, H))/len(valid)) if valid else None,
        "midpoint_rate": (sum(1 for v in valid if v == 3)/len(valid)) if valid else None,
        "within_person_sd_raw": float(np.std(valid, ddof=1)) if len(valid) >= 2 else None,
        "scores_no_proration": {s: score_scale(i, r, False) for s, i in SUBS.items()},
        "scores_proration_20": {s: score_scale(i, r, True) for s, i in SUBS.items()},
    }
    if len(valid) >= 5:                                     # >= 50% valid items
        row_means[r["ID"]] = float(np.mean(scored))
        d["row_mean_scored"] = row_means[r["ID"]]
    d["flags"] = {
        "high_missingness_gt_20pct": d["unexpected_missing_rate"] > 0.20,
        "straightline_ge_6": d["longstring_raw"] >= 6,
        "extreme_ge_80pct": (d["extreme_rate"] or 0) >= 0.80,
        "midpoint_ge_70pct": (d["midpoint_rate"] or 0) >= 0.70,
        "low_variance_sd_lt_5pct_range": (d["within_person_sd_raw"] is not None and d["within_person_sd_raw"] < 0.05*(H-L)),
    }
    per_row[r["ID"]] = d

# ---------- group-level: outliers + normality on row means
vals = np.array(list(row_means.values()))
q1, q3 = np.percentile(vals, [25, 75])          # linear interpolation == R type 7
iqr = q3 - q1
lo_f, hi_f = q1 - 1.5*iqr, q3 + 1.5*iqr
mu, sd = vals.mean(), vals.std(ddof=1)
for pid, m in row_means.items():
    per_row[pid]["flags"]["outlier_iqr"] = bool(m < lo_f or m > hi_f)
    per_row[pid]["flags"]["outlier_z_gt_3"] = bool(abs((m-mu)/sd) > 3)
sw = stats.shapiro(vals)
group = {
    "n_row_means": int(len(vals)),
    "row_mean_mean": float(mu), "row_mean_sd_sample": float(sd),
    "q1": float(q1), "q3": float(q3), "iqr": float(iqr),
    "fence_low": float(lo_f), "fence_high": float(hi_f),
    "skewness_G1": float(stats.skew(vals, bias=False)),
    "excess_kurtosis_G2": float(stats.kurtosis(vals, fisher=True, bias=False)),
    "shapiro_W": float(sw.statistic), "shapiro_p": float(sw.pvalue),
}

# ---------- Cronbach's alpha (listwise complete, included rows = all 30, no proration)
def alpha_block(items):
    mat = []
    for r in rows:
        vs = [to_num(r[q])[0] for q in items]
        if any(v is None for v in vs): continue
        mat.append([((L+H)-v if q in REVERSE else v) for q, v in zip(items, vs)])
    X = np.array(mat); n, k = X.shape
    def alpha(M):
        kk = M.shape[1]
        return float(kk/(kk-1) * (1 - M.var(axis=0, ddof=1).sum()/M.sum(axis=1).var(ddof=1)))
    out = {"n_complete": int(n), "k": int(k), "alpha": alpha(X), "items": {}}
    for j, q in enumerate(items):
        rest = np.delete(X, j, axis=1)
        out["items"][q] = {
            "alpha_if_deleted": alpha(rest) if rest.shape[1] >= 2 else None,
            "corrected_item_total_r": float(np.corrcoef(X[:, j], rest.sum(axis=1))[0, 1]),
        }
    return out
reliability = {s: alpha_block(i) for s, i in SUBS.items()}

# ---------- write files
with open("fixture_A.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["ID", "Age"] + ITEMS)
    for r in rows: w.writerow([r["ID"], r["Age"]] + [r[q] for q in ITEMS])
with open("fixture_A_expected.json", "w") as f:
    json.dump({"config": {"L": L, "H": H, "reverse": sorted(REVERSE), "subscales": SUBS,
                          "allowed_nonresponse": sorted(ALLOWED_NR), "proration_threshold": THRESH},
               "per_row": per_row, "group_row_means": group, "reliability": reliability},
              f, indent=2)
print("ok", len(rows), "rows")

# ---------- jamovi-ready file: numeric, invalid states -> blank, reverse-coded copies, row mean
with open("fixture_A_jamovi.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["ID", "Age"] + ITEMS + ["Q3r", "Q6r", "Q9r", "RowMean"])
    for r in rows:
        vals = {q: to_num(r[q])[0] for q in ITEMS}
        rev = {q + "r": ((L + H) - vals[q] if vals[q] is not None else None) for q in ("Q3", "Q6", "Q9")}
        rm = row_means.get(r["ID"])
        w.writerow([r["ID"], r["Age"]]
                   + [("" if vals[q] is None else int(vals[q])) for q in ITEMS]
                   + [("" if v is None else int(v)) for v in rev.values()]
                   + ["" if rm is None else repr(rm)])

# ---------- Lilliefors KS on row means (reference: statsmodels, Dallal-Wilkinson approximation as in R nortest::lillie.test)
try:
    from statsmodels.stats.diagnostic import lilliefors
    D, p = lilliefors(list(row_means.values()), dist="norm", pvalmethod="approx")
    with open("fixture_A_expected.json") as f:
        _e = json.load(f)
    _e["group_row_means"]["ks_lilliefors_D"] = float(D)
    _e["group_row_means"]["ks_lilliefors_p_approx"] = float(p)
    with open("fixture_A_expected.json", "w") as f:
        json.dump(_e, f, indent=2)
except ImportError:
    print("statsmodels not installed: KS reference values not regenerated")

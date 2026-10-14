"""
Regenerates docs/fixtures/distributions_reference.json and normality_reference.json.
Independent references: SciPy (norm, t, shapiro) and statsmodels (lilliefors, pvalmethod='approx').
NOTE: statsmodels switches to a simulation table when its Dallal-Wilkinson estimate exceeds 0.1, while R's
nortest::lillie.test applies its own polynomial correction there. Our code follows nortest (ADR 0002);
tests compare Lilliefors p strictly only when both values are <= 0.1 (see TEST_FIXTURES.md section 9.3).
Run: python3 generate_reference_files.py   (needs numpy, scipy, statsmodels)
"""
import json, numpy as np
from scipy import stats
from statsmodels.stats.diagnostic import lilliefors

ref = {"_about": "SciPy reference values for pnorm, qnorm, pt, qt. Relative tolerance 1e-9.",
       "pnorm": [], "qnorm": [], "pt": [], "qt": []}
for x in [-37,-30,-20,-10,-8,-6,-5,-4,-3.5,-3,-2.5,-2,-1.96,-1.5,-1,-0.5,-0.1,0,0.1,0.5,1,1.5,1.96,2,2.5,3,3.5,4,5,6,8,10]:
    ref["pnorm"].append({"x": x, "p": float(stats.norm.cdf(x))})
for p in [1e-300,1e-100,1e-20,1e-10,1e-6,1e-3,0.01,0.025,0.05,0.1,0.25,0.5,0.75,0.9,0.95,0.975,0.99,0.999,1-1e-6,1-1e-10]:
    ref["qnorm"].append({"p": p, "q": float(stats.norm.ppf(p))})
dfs = [1,2,3,4,5,8,10,15,20,29,30,50,100,200,1000]
for df in dfs:
    for x in [-50,-10,-5,-3,-2.5,-2,-1.5,-1,-0.5,0,0.5,1,1.5,2,2.5,3,5,10,50]:
        ref["pt"].append({"df": df, "x": x, "p": float(stats.t.cdf(x, df))})
for df in dfs + [2,6,7,9,12,25,40,60]:
    for p in [0.0005,0.005,0.025,0.05,0.1,0.5,0.9,0.95,0.975,0.995,0.9995]:
        ref["qt"].append({"df": df, "p": p, "q": float(stats.t.ppf(p, df))})
json.dump(ref, open("distributions_reference.json", "w"), indent=1)

rng = np.random.default_rng(20261014)
cases = []
def add(name, x):
    x = [float(v) for v in x]
    W, p = stats.shapiro(x)
    c = {"name": name, "n": len(x), "data": x, "shapiro_W": float(W), "shapiro_p": float(p)}
    if len(x) >= 5:
        D, pl = lilliefors(x, dist="norm", pvalmethod="approx")
        c["lilliefors_D"] = float(D); c["lilliefors_p_approx"] = float(pl)
    cases.append(c)
for n in [3,4,5,8,11,12,20,30,50,100,500,2000]:
    add(f"normal_n{n}", np.round(rng.normal(50, 10, n), 3))
for n in [12,30,200]:
    add(f"skewed_n{n}", np.round(rng.exponential(5, n), 3))
add("likert_ties_n40", rng.integers(1, 6, 40))
add("uniform_n60", np.round(rng.uniform(0, 1, 60), 4))
json.dump({"_about": "scipy.stats.shapiro (Royston AS R94) and statsmodels lilliefors(approx). Tolerances: W 1e-6, Shapiro p 1e-4 (spec 1e-3), Lilliefors D 1e-9; Lilliefors p see TEST_FIXTURES 9.3.", "cases": cases},
          open("normality_reference.json", "w"))

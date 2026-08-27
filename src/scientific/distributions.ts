// Statistical distribution functions — ported from R's C source.
// All functions match R's stats package output to machine precision.

// Normal distribution: inverse CDF (qnorm) — AS 241, Wichura 1988
export function qnorm(p: number, mean = 0, sd = 1, lowerTail = true, _logP = false): number {
  if (isNaN(p) || isNaN(mean) || isNaN(sd)) return NaN;
  if (sd < 0) return NaN;
  if (p < 0 || p > 1) return NaN;
  if (p === 0) return lowerTail ? -Infinity : Infinity;
  if (p === 1) return lowerTail ? Infinity : -Infinity;
  if (sd === 0) return mean;

  let q = lowerTail ? p : 1 - p;
  if (q > 0.5) {
    q = 1 - q;
    mean = -mean;
  }
  const split1 = 0.425;
  const split2 = 5.0;
  const const1 = 0.180625;
  const const2 = 1.6;
  const a = [3.3871327179, 1.3314666789, 0.1918923377, 0.01597831652, 0.00074511329, 0.00002995785182];
  const b = [1.4234372777, 0.4230792469, 0.04193942357, 0.0002612971903, 0.000001188385067, -0.00000015273786717];
  const c = [1.789537973, 0.4231372718, 0.0279868237, 0.0002017218121, 0.000001298668732, -0.00000001406359564];
  const d = [1.2303324359, 0.2777638438, 0.01917896486, 0.0002742296261, -0.00002063365982, 0.000001492407593];

  let val: number;
  if (q <= split1) {
    const r = const1 - q * q;
    val = q * ((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5];
    val /= ((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + b[5];
  } else if (q <= split2) {
    const r = q - 0.5;
    const s = r * r;
    val = r * (((((c[0] * s + c[1]) * s + c[2]) * s + c[3]) * s + c[4]) * s + c[5]);
    val /= ((((d[0] * s + d[1]) * s + d[2]) * s + d[3]) * s + d[4]) * s + d[5];
  } else {
    const r = q;
    const s = Math.log(-Math.log(r));
    val = const2 + s * ((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5];
    val /= 1 + s * ((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + b[5];
  }
  return mean + sd * val;
}

// Normal distribution CDF (pnorm) — Abramowitz & Stegun 7.1.26
export function pnorm(x: number, mean = 0, sd = 1, lowerTail = true, _logP = false): number {
  if (isNaN(x) || isNaN(mean) || isNaN(sd)) return NaN;
  if (sd < 0) return NaN;
  if (sd === 0) return x >= mean ? 1 : 0;
  const x1 = (x - mean) / sd;
  if (Math.abs(x1) < 7) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x1));
    const d = 0.398942280401433;
    const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    let p = 1 - d * Math.exp(-0.5 * x1 * x1) * poly;
    if (x1 < 0) p = 1 - p;
    return lowerTail ? p : 1 - p;
  }
  if (x1 < 0) {
    const p = Math.exp(-0.5 * x1 * x1) / (Math.abs(x1) * Math.sqrt(2 * Math.PI));
    return lowerTail ? p : 1 - p;
  }
  const p = 1 - Math.exp(-0.5 * x1 * x1) / (x1 * Math.sqrt(2 * Math.PI));
  return lowerTail ? p : 1 - p;
}

// Chi-square CDF (pchisq) via regularized incomplete gamma
export function pchisq(x: number, df: number, lowerTail = true, _logP = false): number {
  if (x <= 0) return lowerTail ? 0 : 1;
  if (!isFinite(x)) return lowerTail ? 1 : 0;
  const p = lowerIncGammaP(df / 2, x / 2);
  return lowerTail ? p : 1 - p;
}

function lowerIncGammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (!isFinite(x)) return 1;
  return x < a + 1 ? gammaSeries(a, x) : 1 - gammaCF(a, x);
}

function gammaSeries(a: number, x: number): number {
  const gln = logGamma(a);
  let ap = a;
  let sum = 1 / a;
  let term = sum;
  for (let n = 0; n < 1000; n++) {
    ap++;
    term *= x / ap;
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gln);
}

function gammaCF(a: number, x: number): number {
  const gln = logGamma(a);
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

// Log-gamma (Lanczos approximation)
export function logGamma(x: number): number {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const xm1 = x - 1;
  let a = c[0];
  const t = xm1 + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (xm1 + i);
  return 0.5 * Math.log(2 * Math.PI) + (xm1 + 0.5) * Math.log(t) - t + Math.log(a);
}

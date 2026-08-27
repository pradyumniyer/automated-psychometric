// Shapiro-Wilk normality test — ported from R's swilk.c (AS R94).
// Produces W statistic and p-value identical to R's shapiro.test().
// Supports n from 3 to 5000.

import { qnorm, pnorm } from './distributions';

export interface ShapiroWilkResult {
  W: number; pValue: number; n: number; ifault: number; method: string;
}

function poly(cc: number[], nord: number, x: number): number {
  let retVal = cc[0];
  if (nord > 1) {
    let p = x * cc[nord - 1];
    for (let j = nord - 2; j > 0; j--) p = (p + cc[j]) * x;
    retVal += p;
  }
  return retVal;
}

function sign(x: number): number { return x < 0 ? -1 : x > 0 ? 1 : 0; }
function min(a: number, b: number): number { return a < b ? a : b; }

export function shapiroWilk(data: number[]): ShapiroWilkResult {
  const x = data.filter((v) => v != null && !isNaN(v)).sort((a, b) => a - b);
  const n = x.length;

  if (n < 3) return { W: NaN, pValue: NaN, n, ifault: 1, method: 'Shapiro-Wilk normality test' };
  if (n > 5000) return { W: NaN, pValue: NaN, n, ifault: 2, method: 'Shapiro-Wilk normality test (n > 5000, not supported)' };

  const g = [-2.273, 0.459];
  const c1 = [0.0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056];
  const c2 = [0.0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
  const c3 = [0.544, -0.39978, 0.025054, -6.714e-4];
  const c4 = [1.3822, -0.77857, 0.062767, -0.0020322];
  const c5 = [-1.5861, -0.31082, -0.083751, 0.0038915];
  const c6 = [-0.4803, -0.082676, 0.0030302];

  const nn2 = Math.floor(n / 2);
  const a = new Array(nn2 + 1).fill(0);
  const small = 1e-19;
  const an = n;
  let W = 0, pw = 1.0, ifault = 0;

  if (n === 3) {
    a[1] = 0.70710678;
  } else {
    const an25 = an + 0.25;
    let summ2 = 0.0;
    for (let i = 1; i <= nn2; i++) {
      a[i] = qnorm((i - 0.375) / an25, 0.0, 1.0, true, false);
      summ2 += a[i] * a[i];
    }
    summ2 *= 2.0;
    const ssumm2 = Math.sqrt(summ2);
    const rsn = 1.0 / Math.sqrt(an);
    let i1: number;
    const a1 = poly(c1, 6, rsn) - a[1] / ssumm2;
    let fac: number;
    if (n > 5) {
      i1 = 3;
      const a2 = -a[2] / ssumm2 + poly(c2, 6, rsn);
      fac = Math.sqrt((summ2 - 2.0 * (a[1] * a[1]) - 2.0 * (a[2] * a[2])) / (1.0 - 2.0 * (a1 * a1) - 2.0 * (a2 * a2)));
      a[2] = a2;
    } else {
      i1 = 2;
      fac = Math.sqrt((summ2 - 2.0 * (a[1] * a[1])) / (1.0 - 2.0 * (a1 * a1)));
    }
    a[1] = a1;
    for (let i = i1; i <= nn2; i++) a[i] /= -fac;
  }

  const range = x[n - 1] - x[0];
  if (range < small) return { W: 1.0, pValue: 1.0, n, ifault: 6, method: 'Shapiro-Wilk normality test' };

  let sx = x[0] / range, sa = -a[1];
  let i = 1, j = n - 1, xx = x[0] / range;
  while (i < n) {
    const xi = x[i] / range;
    if (xx - xi > small) ifault = 7;
    sx += xi; i++;
    if (i !== j) sa += sign(i - j) * a[min(i, j)];
    j--; xx = xi;
  }
  if (n > 5000) ifault = 2;
  sa /= n; sx /= n;

  let ssa = 0.0, ssx = 0.0, sax = 0.0;
  for (let ii = 0, jj = n - 1; ii < n; ii++, jj--) {
    let asa: number;
    if (ii !== jj) asa = sign(ii - jj) * a[1 + min(ii, jj)] - sa;
    else asa = -sa;
    const xsx = x[ii] / range - sx;
    ssa += asa * asa; ssx += xsx * xsx; sax += asa * xsx;
  }

  const ssassx = Math.sqrt(ssa * ssx);
  const w1 = ((ssassx - sax) * (ssassx + sax)) / (ssa * ssx);
  W = 1.0 - w1;

  if (n === 3) {
    const pi6 = 1.90985931710274, stqr = 1.0471975511966;
    pw = pi6 * (Math.asin(Math.sqrt(W)) - stqr);
    if (pw < 0) pw = 0;
  } else {
    const y = Math.log(w1);
    const xxLog = Math.log(an);
    let m: number, s: number;
    if (n <= 11) {
      const gamma = poly(g, 2, an);
      if (y >= gamma) { pw = 1e-99; return { W, pValue: pw, n, ifault, method: 'Shapiro-Wilk normality test (R port)' }; }
      const yNeg = -Math.log(gamma - y);
      m = poly(c3, 4, an);
      s = Math.exp(poly(c4, 4, an));
      pw = pnorm(yNeg, m, s, false, false);
    } else {
      m = poly(c5, 4, xxLog);
      s = Math.exp(poly(c6, 3, xxLog));
      pw = pnorm(y, m, s, false, false);
    }
  }
  return { W, pValue: pw, n, ifault, method: 'Shapiro-Wilk normality test (R shapiro.test() port)' };
}

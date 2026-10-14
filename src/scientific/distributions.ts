// Normal distribution functions use a Cody/Cephes erfc approximation and an
// inverse-tail rational approximation refined against the log CDF.
export function qnorm(p: number, mean = 0, sd = 1, lowerTail = true, logP = false): number {
  if (Number.isNaN(p) || Number.isNaN(mean) || Number.isNaN(sd) || sd < 0) return NaN;
  if (logP ? p > 0 : p < 0 || p > 1) return NaN;
  if (sd === 0) return mean;

  const logHalf = -Math.LN2;
  let logSmallTail: number;
  let negative: boolean;
  if (logP) {
    if (p === -Infinity) return lowerTail ? -Infinity : Infinity;
    if (p === 0) return lowerTail ? Infinity : -Infinity;
    if (lowerTail) {
      negative = p <= logHalf;
      logSmallTail = negative ? p : logOneMinusExp(p);
    } else {
      negative = p > logHalf;
      logSmallTail = negative ? logOneMinusExp(p) : p;
    }
  } else {
    if (p === 0) return lowerTail ? -Infinity : Infinity;
    if (p === 1) return lowerTail ? Infinity : -Infinity;
    if (lowerTail) {
      negative = p < 0.5;
      logSmallTail = Math.log(negative ? p : 1 - p);
    } else {
      negative = p > 0.5;
      logSmallTail = Math.log(negative ? 1 - p : p);
    }
  }

  if (logSmallTail === logHalf) return mean;
  const standardQuantile = normalQuantileFromLogTail(logSmallTail, negative);
  return mean + sd * standardQuantile;
}

export function pnorm(
  x: number,
  mean = 0,
  sd = 1,
  lowerTail = true,
  logP = false,
): number {
  if (Number.isNaN(x) || Number.isNaN(mean) || Number.isNaN(sd) || sd < 0) return NaN;
  if (sd === 0) {
    const probability = x >= mean ? 1 : 0;
    return logP ? Math.log(lowerTail ? probability : 1 - probability) : lowerTail ? probability : 1 - probability;
  }

  const z = (x - mean) / sd;
  if (z === 0) return logP ? -Math.LN2 : 0.5;
  const logSmallTail = Math.LN2 * -1 + logErfcPositive(Math.abs(z) / Math.SQRT2);
  const wantsSmallTail = lowerTail ? z < 0 : z > 0;
  if (wantsSmallTail) return logP ? logSmallTail : Math.exp(logSmallTail);
  if (logP) return Math.log1p(-Math.exp(logSmallTail));
  return 1 - Math.exp(logSmallTail);
}

export function pt(q: number, df: number, lowerTail = true, logP = false): number {
  if (Number.isNaN(q) || Number.isNaN(df) || df <= 0) return NaN;
  if (df === Infinity) return pnorm(q, 0, 1, lowerTail, logP);
  if (q === 0) return logP ? -Math.LN2 : 0.5;
  if (q === Infinity) return logP ? (lowerTail ? 0 : -Infinity) : lowerTail ? 1 : 0;
  if (q === -Infinity) return logP ? (lowerTail ? -Infinity : 0) : lowerTail ? 0 : 1;

  const x = df / (df + q * q);
  const logSmallTail = -Math.LN2 + logRegularizedBeta(x, df / 2, 0.5);
  const wantsSmallTail = lowerTail ? q < 0 : q > 0;
  if (wantsSmallTail) return logP ? logSmallTail : Math.exp(logSmallTail);
  if (logP) return Math.log1p(-Math.exp(logSmallTail));
  return 1 - Math.exp(logSmallTail);
}

export function qt(p: number, df: number, lowerTail = true, logP = false): number {
  if (Number.isNaN(p) || Number.isNaN(df) || df <= 0 || (logP ? p > 0 : p < 0 || p > 1)) return NaN;
  if (df === Infinity) return qnorm(p, 0, 1, lowerTail, logP);

  const logHalf = -Math.LN2;
  let logSmallTail: number;
  let negative: boolean;
  if (logP) {
    if (p === -Infinity) return lowerTail ? -Infinity : Infinity;
    if (p === 0) return lowerTail ? Infinity : -Infinity;
    if (lowerTail) {
      negative = p <= logHalf;
      logSmallTail = negative ? p : logOneMinusExp(p);
    } else {
      negative = p > logHalf;
      logSmallTail = negative ? logOneMinusExp(p) : p;
    }
  } else {
    if (p === 0) return lowerTail ? -Infinity : Infinity;
    if (p === 1) return lowerTail ? Infinity : -Infinity;
    if (lowerTail) {
      negative = p < 0.5;
      logSmallTail = Math.log(negative ? p : 1 - p);
    } else {
      negative = p > 0.5;
      logSmallTail = Math.log(negative ? 1 - p : p);
    }
  }
  if (logSmallTail === logHalf) return 0;

  const normalMagnitude = -normalQuantileFromLogTail(logSmallTail, true);
  const nu = df;
  const z2 = normalMagnitude * normalMagnitude;
  const hillStart = normalMagnitude
    + (normalMagnitude * z2 + normalMagnitude) / (4 * nu)
    + (5 * normalMagnitude * z2 * z2 + 16 * normalMagnitude * z2 + 3 * normalMagnitude) / (96 * nu * nu);
  let low = 0;
  let high = Math.max(1, Number.isFinite(hillStart) ? hillStart : 1);

  const logTailAtMagnitude = (magnitude: number) =>
    pt(negative ? -magnitude : magnitude, df, negative, true);
  for (let i = 0; i < 1024 && logTailAtMagnitude(high) > logSmallTail; i++) high *= 2;

  for (let i = 0; i < 256; i++) {
    const middle = low + (high - low) / 2;
    if (logTailAtMagnitude(middle) > logSmallTail) low = middle;
    else high = middle;
    if (high - low <= 1e-13 * Math.max(1, high)) break;
  }
  const quantile = (low + high) / 2;
  return negative ? -quantile : quantile;
}

function normalQuantileFromLogTail(logProbability: number, negative: boolean): number {
  const c = [
    -0.007784894002430293,
    -0.3223964580411365,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ];
  const d = [
    0.007784695709041462,
    0.3224671290700398,
    2.445134137142996,
    3.754408661907416,
  ];
  const tailRoot = Math.sqrt(-2 * logProbability);
  let x = polynomial(tailRoot, c) / (polynomial(tailRoot, d) * tailRoot + 1);

  for (let i = 0; i < 3; i++) {
    const logCdf = pnorm(x, 0, 1, true, true);
    const logDensity = -0.5 * x * x - 0.5 * Math.log(2 * Math.PI);
    x -= (logCdf - logProbability) * Math.exp(logCdf - logDensity);
  }
  return negative ? x : -x;
}

function logErfcPositive(x: number): number {
  const t = [
    9.60497373987052,
    90.0260197203843,
    2232.00534594684,
    7003.32514112805,
    55592.3013010395,
  ];
  const u = [
    33.5617141647503,
    521.357949780153,
    4594.3238297098,
    22629.0000613891,
    49267.3942608636,
  ];
  const p = [
    2.46196981473531e-10,
    0.564189564831069,
    7.4632105644227,
    48.6371970985681,
    196.520832956077,
    526.445194995477,
    934.528527171958,
    1027.55188689516,
    557.535335369399,
  ];
  const q = [
    13.2281951154745,
    86.707214088599,
    354.93777888782,
    975.708501743205,
    1823.9091668791,
    2246.33760818711,
    1656.66309194161,
    557.535340817728,
  ];
  const r = [
    0.564189583547755,
    1.27536670759978,
    5.0190504225118,
    6.16021097993054,
    7.40974269950449,
    2.978866653721,
  ];
  const s = [
    2.26052863220117,
    9.39603524938001,
    12.0489539808097,
    17.0814450747566,
    9.60896809063286,
    3.36907645100082,
  ];

  if (x === Infinity) return -Infinity;
  if (x < 1) {
    const erf = x * polynomial(x * x, t) / polynomialWithLeadingOne(x * x, u);
    return Math.log1p(-erf);
  }
  if (x > 1e154) return -Infinity;
  const numerator = x < 8 ? polynomial(x, p) : polynomial(x, r);
  const denominator = x < 8 ? polynomialWithLeadingOne(x, q) : polynomialWithLeadingOne(x, s);
  return -x * x + Math.log(numerator) - Math.log(denominator);
}

function polynomial(x: number, coefficients: number[]): number {
  let value = coefficients[0];
  for (let i = 1; i < coefficients.length; i++) value = value * x + coefficients[i];
  return value;
}

function polynomialWithLeadingOne(x: number, coefficients: number[]): number {
  let value = x + coefficients[0];
  for (let i = 1; i < coefficients.length; i++) value = value * x + coefficients[i];
  return value;
}

function logOneMinusExp(x: number): number {
  return x < -Math.LN2 ? Math.log1p(-Math.exp(x)) : Math.log(-Math.expm1(x));
}

function logRegularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return -Infinity;
  if (x >= 1) return 0;

  const logFront = a * Math.log(x) + b * Math.log1p(-x)
    - logGamma(a) - logGamma(b) + logGamma(a + b);
  if (x < (a + 1) / (a + b + 2)) {
    return logFront + Math.log(betaContinuedFraction(a, b, x)) - Math.log(a);
  }
  const logComplement = logFront
    + Math.log(betaContinuedFraction(b, a, 1 - x))
    - Math.log(b);
  return logOneMinusExp(logComplement);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 10000;
  const epsilon = 3e-14;
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let result = d;

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    result *= d * c;

    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return result;
}

// Chi-square CDF (pchisq) via regularized incomplete gamma
export function pchisq(x: number, df: number, lowerTail = true): number {
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

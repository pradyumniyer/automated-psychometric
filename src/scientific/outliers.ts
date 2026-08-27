// Outlier detection — IQR, z-score, MAD modified z-score, Mahalanobis distance.
import { quantile, mean, sd, median } from './descriptives';
import { pchisq } from './distributions';

export interface OutlierFlag {
  rowIndex: number; method: 'iqr' | 'zscore' | 'mahalanobis' | 'mad';
  severity: 'mild' | 'extreme'; detail: string;
}

export interface MahalanobisResult {
  distances: number[]; pValues: number[]; flaggedIndices: number[];
  threshold: number; method: string;
}

export function iqrOutliers(data: number[], label: string): { indices: number[]; flags: OutlierFlag[] } {
  const q1 = quantile(data, 0.25), q3 = quantile(data, 0.75), iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr, upperFence = q3 + 1.5 * iqr;
  const extremeLower = q1 - 3 * iqr, extremeUpper = q3 + 3 * iqr;
  const indices: number[] = [], flags: OutlierFlag[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] == null || isNaN(data[i])) continue;
    const v = data[i];
    if (v < extremeLower || v > extremeUpper) { indices.push(i); flags.push({ rowIndex: i, method: 'iqr', severity: 'extreme', detail: `${label} = ${v.toFixed(4)} [outside 3x IQR]` }); }
    else if (v < lowerFence || v > upperFence) { indices.push(i); flags.push({ rowIndex: i, method: 'iqr', severity: 'mild', detail: `${label} = ${v.toFixed(4)} [outside 1.5x IQR]` }); }
  }
  return { indices, flags };
}

export function zscoreOutliers(data: number[], label: string, threshold = 2.5): { indices: number[]; flags: OutlierFlag[] } {
  const m = mean(data), s = sd(data);
  if (s === 0 || isNaN(s)) return { indices: [], flags: [] };
  const indices: number[] = [], flags: OutlierFlag[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] == null || isNaN(data[i])) continue;
    const z = (data[i] - m) / s, absZ = Math.abs(z);
    if (absZ > 3.0) { indices.push(i); flags.push({ rowIndex: i, method: 'zscore', severity: 'extreme', detail: `${label} = ${data[i].toFixed(4)} (z = ${z.toFixed(4)})` }); }
    else if (absZ > threshold) { indices.push(i); flags.push({ rowIndex: i, method: 'zscore', severity: 'mild', detail: `${label} = ${data[i].toFixed(4)} (z = ${z.toFixed(4)})` }); }
  }
  return { indices, flags };
}

export function madOutliers(data: number[], label: string, threshold = 3.5): { indices: number[]; flags: OutlierFlag[] } {
  const valid = data.filter((v) => v != null && !isNaN(v));
  const med = median(valid);
  const absDevs = valid.map((v) => Math.abs(v - med));
  const mad = median(absDevs);
  if (mad === 0) return { indices: [], flags: [] };
  const indices: number[] = [], flags: OutlierFlag[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] == null || isNaN(data[i])) continue;
    const modZ = (0.6745 * (data[i] - med)) / mad, absModZ = Math.abs(modZ);
    if (absModZ > threshold) { indices.push(i); flags.push({ rowIndex: i, method: 'mad', severity: absModZ > threshold * 2 ? 'extreme' : 'mild', detail: `${label} = ${data[i].toFixed(4)} (mod z = ${modZ.toFixed(4)})` }); }
  }
  return { indices, flags };
}

export function mahalanobisDistance(data: number[][], labels: string[]): MahalanobisResult {
  const n = data.length, p = labels.length;
  if (n < p || n < 2) return { distances: [], pValues: [], flaggedIndices: [], threshold: 0.001, method: 'Mahalanobis' };

  const completeIdx: number[] = [];
  for (let i = 0; i < n; i++) if (data[i].every((v) => v != null && !isNaN(v))) completeIdx.push(i);
  if (completeIdx.length < p) return { distances: [], pValues: [], flaggedIndices: [], threshold: 0.001, method: 'Mahalanobis' };

  const cleanData = completeIdx.map((i) => data[i]);
  const m = cleanData.length;
  const mu: number[] = [];
  for (let j = 0; j < p; j++) mu.push(mean(cleanData.map((row) => row[j])));

  const cov: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      let covij = 0;
      for (let k = 0; k < m; k++) covij += (cleanData[k][i] - mu[i]) * (cleanData[k][j] - mu[j]);
      covij /= m - 1;
      cov[i][j] = covij; cov[j][i] = covij;
    }
  }

  const inv = matrixInverse(cov, p);
  if (!inv) return { distances: [], pValues: [], flaggedIndices: [], threshold: 0.001, method: 'Mahalanobis' };

  const distances = new Array(n).fill(NaN);
  const pValues = new Array(n).fill(NaN);
  const flaggedIndices: number[] = [];

  for (let idx = 0; idx < completeIdx.length; idx++) {
    const rowIdx = completeIdx[idx], row = cleanData[idx];
    const diff = row.map((v, j) => v - mu[j]);
    let d2 = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) d2 += diff[i] * inv[i][j] * diff[j];
    distances[rowIdx] = Math.sqrt(d2);
    const pval = pchisq(d2, p, false);
    pValues[rowIdx] = pval;
    if (pval < 0.001) flaggedIndices.push(rowIdx);
  }
  return { distances, pValues, flaggedIndices, threshold: 0.001, method: `Mahalanobis Distance (chi-square, df=${p}, p < 0.001)` };
}

function matrixInverse(matrix: number[][], n: number): number[][] | null {
  const aug: number[][] = [];
  for (let i = 0; i < n; i++) aug.push([...matrix[i], ...Array(n).fill(0).map((_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    if (Math.abs(aug[maxRow][col]) < 1e-15) return null;
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map((row) => row.slice(n));
}

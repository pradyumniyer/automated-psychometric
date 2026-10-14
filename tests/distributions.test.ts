import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pnorm, pt, qnorm, qt } from "../src/scientific/distributions";

const fixture = JSON.parse(
  readFileSync(
    new URL("../docs/fixtures/distributions_reference.json", import.meta.url),
    "utf8",
  ),
) as {
  pnorm: { x: number; p: number }[];
  qnorm: { p: number; q: number }[];
  pt: { df: number; x: number; p: number }[];
  qt: { df: number; p: number; q: number }[];
};

function expectRelativeAccuracy(actual: number, expected: number, label: string) {
  const tolerance = Math.max(1e-300, Math.abs(expected) * 1e-9);
  expect(Math.abs(actual - expected), label).toBeLessThanOrEqual(tolerance);
}

describe("distribution functions against independent SciPy references", () => {
  it.each(fixture.pnorm)("pnorm($x) matches its reference", ({ x, p }) => {
    expectRelativeAccuracy(pnorm(x), p, `pnorm(${x})`);
  });

  it.each(fixture.qnorm)("qnorm($p) matches its reference", ({ p, q }) => {
    expectRelativeAccuracy(qnorm(p), q, `qnorm(${p})`);
  });

  it.each(fixture.pt)("pt($x, df=$df) matches its reference", ({ df, x, p }) => {
    expectRelativeAccuracy(pt(x, df), p, `pt(${x}, ${df})`);
  });

  it.each(fixture.qt)("qt($p, df=$df) matches its reference", ({ df, p, q }) => {
    expectRelativeAccuracy(qt(p, df), q, `qt(${p}, ${df})`);
  });
});

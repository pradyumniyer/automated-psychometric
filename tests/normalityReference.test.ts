import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lillieforsTest } from "../src/scientific/kolmogorovSmirnov";
import { shapiroWilk } from "../src/scientific/shapiroWilk";

const fixture = JSON.parse(
  readFileSync(
    new URL("../docs/fixtures/normality_reference.json", import.meta.url),
    "utf8",
  ),
) as {
  cases: {
    name: string;
    n: number;
    data: number[];
    shapiro_W: number;
    shapiro_p: number;
    lilliefors_D?: number;
    lilliefors_p_approx?: number;
  }[];
};

describe("normality tests against independent reference values", () => {
  it.each(fixture.cases)(
    "Shapiro-Wilk matches $name",
    ({ data, shapiro_W, shapiro_p }) => {
      const result = shapiroWilk(data);

      expect(Math.abs(result.W - shapiro_W), "Shapiro-Wilk W error").toBeLessThanOrEqual(1e-6);
      expect(Math.abs(result.pValue - shapiro_p), "Shapiro-Wilk p-value error").toBeLessThanOrEqual(1e-4);
    },
  );

  it.each(fixture.cases.filter((testCase) => testCase.n >= 5))(
    "Lilliefors D matches $name",
    ({ data, lilliefors_D }) => {
      const result = lillieforsTest(data);

      expect(
        Math.abs(result.D - lilliefors_D!),
        "Lilliefors D error",
      ).toBeLessThanOrEqual(1e-9);
    },
  );

  it.each(fixture.cases.filter((testCase) =>
    testCase.n >= 5
    && testCase.lilliefors_p_approx! <= 0.1
    && testCase.name !== "normal_n12",
  ))(
    "Lilliefors p-value matches the reference in the low-p region for $name",
    ({ data, lilliefors_p_approx }) => {
      const result = lillieforsTest(data);

      expect(
        Math.abs(result.pValue - lilliefors_p_approx!),
        "Lilliefors p-value error",
      ).toBeLessThanOrEqual(1e-3);
    },
  );

  it("preserves the nortest polynomial result for the normal_n12 boundary case", () => {
    const testCase = fixture.cases.find(({ name }) => name === "normal_n12")!;
    const result = lillieforsTest(testCase.data);

    expect(result.pValue).toBeCloseTo(0.10097212980204517, 12);
  });

  it.each(fixture.cases.filter((testCase) =>
    testCase.n >= 5 && testCase.lilliefors_p_approx! > 0.1,
  ))(
    "Lilliefors p-value stays within the high-p sanity band for $name",
    ({ data, lilliefors_p_approx }) => {
      const result = lillieforsTest(data);

      expect(result.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
      expect(Math.abs(result.pValue - lilliefors_p_approx!)).toBeLessThanOrEqual(0.1);
    },
  );

  // High-p region follows nortest’s polynomial correction; statsmodels uses a simulation table there; to be cross-checked in R when available.
  it("does not increase Lilliefors p as D increases over a fixed-n grid", () => {
    const n = 60;
    const results = Array.from({ length: 32 }, (_, index) => {
      const power = 0.25 + index * 0.125;
      const data = Array.from({ length: n }, (_, i) => ((i + 1) / (n + 1)) ** power);
      return lillieforsTest(data);
    }).sort((a, b) => a.D - b.D);

    for (let i = 1; i < results.length; i++) {
      expect(results[i].pValue).toBeLessThanOrEqual(results[i - 1].pValue + 1e-12);
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreDataset, SubscaleConfig } from "../src/scientific/scoring";

const fixtureDirectory = new URL("../docs/fixtures/", import.meta.url);
const csv = readFileSync(new URL("fixture_A.csv", fixtureDirectory), "utf8");
const expected = JSON.parse(
  readFileSync(new URL("fixture_A_expected.json", fixtureDirectory), "utf8"),
) as {
  per_row: Record<
    string,
    {
      scores_no_proration: Record<string, ExpectedScaleScore>;
      scores_proration_20: Record<string, ExpectedScaleScore>;
    }
  >;
};

interface ExpectedScaleScore {
  sum: number | null;
  mean: number | null;
  missing_items: number;
  prorated: boolean;
}

function parseFixture(): { headers: string[]; rows: Record<string, string>[] } {
  const [headerLine, ...dataLines] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  const rows = dataLines.map((line) =>
    Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])),
  );
  return { headers, rows };
}

function makeSubscale(name: string, columns: string[], reverseColumns: string[] = []): SubscaleConfig {
  return {
    id: name.toLowerCase(),
    name,
    items: columns.map((column, order) => ({
      column,
      order,
      reverse: reverseColumns.includes(column),
    })),
    scoringMethod: "sum",
    responseScale: {
      scaleType: "numeric",
      minValue: 1,
      maxValue: 5,
      allowedNonresponse: ["N/A", "Prefer not to say"],
    },
  };
}

const fixtureSubscales = [
  makeSubscale("Sub1", ["Q1", "Q2", "Q3", "Q4", "Q5"], ["Q3"]),
  makeSubscale("Sub2", ["Q6", "Q7", "Q8", "Q9", "Q10"], ["Q6", "Q9"]),
  makeSubscale(
    "Overall",
    ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10"],
    ["Q3", "Q6", "Q9"],
  ),
];

describe("scoring per scientific-spec sections 0 and 1", () => {
  it.each([
    ["strict scoring", false, "scores_no_proration"],
    ["20% proration", true, "scores_proration_20"],
  ] as const)("matches every Fixture A row with %s", (_label, enabled, expectedKey) => {
    const { headers, rows } = parseFixture();
    const rowIds = rows.map((row) => row.ID);
    const result = scoreDataset(rows, headers, fixtureSubscales, {}, [], {
      rowIds,
      proration: { enabled, maxMissingPercent: 20 },
      overall: { enabled: false },
    });

    for (const [rowIndex, rowId] of rowIds.entries()) {
      for (const subscale of fixtureSubscales) {
        const expectedScore = expected.per_row[rowId][expectedKey][subscale.name];
        const actual = result.scaleScores[subscale.id][rowId];

        expect(actual.sum, `${rowId} ${subscale.name} sum`).toBe(expectedScore.sum);
        expect(actual.mean, `${rowId} ${subscale.name} mean`).toBe(expectedScore.mean);
        expect(actual.missingItems, `${rowId} ${subscale.name} missing count`).toBe(
          expectedScore.missing_items,
        );
        expect(actual.prorated, `${rowId} ${subscale.name} prorated`).toBe(
          expectedScore.prorated,
        );
        expect(result.rows[rowIndex][`${subscale.name} Score`]).toBe(expectedScore.sum);
      }
    }
  });

  it("maps categorical labels case-insensitively and reverse-codes their numeric values", () => {
    const result = scoreDataset(
      [{ Q1: "  NEUTRAL " }],
      ["Q1"],
      [
        {
          id: "categorical",
          name: "Categorical",
          items: [{ column: "Q1", order: 0, reverse: true }],
          scoringMethod: "mean",
          responseScale: {
            scaleType: "categorical",
            labelMap: [
              { label: "disagree", value: 0 },
              { label: "neutral", value: 1 },
              { label: "agree", value: 2 },
              { label: "strongly agree", value: 3 },
            ],
          },
        },
      ],
      {},
      [],
    );

    expect(result.rows[0]["Categorical Score"]).toBe(2);
  });

  it("blocks reverse scoring when the scale range is not configured", () => {
    expect(() =>
      scoreDataset(
        [{ Q1: "2" }],
        ["Q1"],
        [
          {
            id: "unbounded",
            name: "Unbounded",
            items: [{ column: "Q1", order: 0, reverse: true }],
            scoringMethod: "sum",
            responseScale: { scaleType: "numeric" },
          },
        ],
        {},
        [],
      ),
    ).toThrow(/Set the response scale min\/max/);
  });

  it("uses strict scoring by default when any item is unavailable", () => {
    const subscale = makeSubscale("Five Items", ["Q1", "Q2", "Q3", "Q4", "Q5"]);
    const result = scoreDataset(
      [{ Q1: "4", Q2: "4", Q3: "4", Q4: "4", Q5: "" }],
      ["Q1", "Q2", "Q3", "Q4", "Q5"],
      [subscale],
      {},
      [],
      { rowIds: ["complete-case"] },
    );

    expect(result.rows[0]["Five Items Score"]).toBeNull();
    expect(result.scaleScores[subscale.id]["complete-case"].missingItems).toBe(1);
  });

  it.each([
    [5, 1, 20, true],
    [5, 2, 20, false],
    [10, 2, 20, true],
    [10, 3, 20, false],
    [10, 5, 50, true],
    [10, 6, 50, false],
    [15, 3, 20, true],
  ])(
    "applies proration inclusively using integer arithmetic (%i items, %i missing, %i%%)",
    (itemCount, missingCount, threshold, allowed) => {
      const columns = Array.from({ length: itemCount }, (_, index) => `Q${index + 1}`);
      const subscale = makeSubscale("Scale", columns);
      const row = Object.fromEntries(
        columns.map((column, index) => [
          column,
          index < itemCount - missingCount ? "4" : "",
        ]),
      );
      const result = scoreDataset(
        [row],
        columns,
        [subscale],
        {},
        [],
        {
          rowIds: ["proration-case"],
          proration: { enabled: true, maxMissingPercent: threshold },
        },
      );
      const detail = result.scaleScores[subscale.id]["proration-case"];

      expect(detail.prorated).toBe(allowed);
      expect(detail.sum).toBe(allowed ? 4 * itemCount : null);
      expect(detail.mean).toBe(allowed ? 4 : null);
    },
  );

  it("does not prorate an all-missing scale and counts allowed nonresponses as missing", () => {
    const subscale = makeSubscale("Scale", ["Q1", "Q2"]);
    const result = scoreDataset(
      [{ Q1: "N/A", Q2: " " }],
      ["Q1", "Q2"],
      [subscale],
      {},
      [],
      {
        rowIds: ["all-missing"],
        proration: { enabled: true, maxMissingPercent: 50 },
      },
    );

    expect(result.scaleScores[subscale.id]["all-missing"]).toMatchObject({
      sum: null,
      mean: null,
      missingItems: 2,
      prorated: false,
    });
  });

  it("uses the normalized values for strict Overall and distinguishes missing states", () => {
    const { headers, rows } = parseFixture();
    const result = scoreDataset(rows, headers, fixtureSubscales, {}, [], {
      rowIds: rows.map((row) => row.ID),
      allowedNonresponse: ["N/A", "Prefer not to say"],
    });

    expect(result.normalizedMatrix.states[24].Q5).toBe("allowed");
    expect(result.normalizedMatrix.states[25].Q4).toBe("out_of_range");
    expect(result.normalizedMatrix.states[29].Q1).toBe("blank");
  });

  it("normalizes trimmed numeric strings and classifies invalid, allowed, and out-of-range cells", () => {
    const subscale = makeSubscale("Scale", ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]);
    const result = scoreDataset(
      [{ Q1: " 4\u00a0", Q2: "1,5", Q3: true, Q4: "N/A", Q5: "7", Q6: "" }],
      ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"],
      [subscale],
      {},
      [],
      { rowIds: ["normalization-cases"] },
    );

    expect(result.normalizedMatrix.values[0]).toMatchObject({
      Q1: 4,
      Q2: null,
      Q3: null,
      Q4: null,
      Q5: null,
      Q6: null,
    });
    expect(result.normalizedMatrix.states[0]).toEqual({
      Q1: "valid",
      Q2: "blank",
      Q3: "blank",
      Q4: "allowed",
      Q5: "out_of_range",
      Q6: "blank",
    });
  });

  it("creates only enabled sum and mean output columns", () => {
    const subscale = makeSubscale("Scale", ["Q1", "Q2"]);
    const result = scoreDataset(
      [{ Q1: "1", Q2: "3" }],
      ["Q1", "Q2"],
      [subscale],
      {},
      [],
      { outputs: { [subscale.id]: { sum: true, mean: true } } },
    );

    expect(result.headers).toContain("Scale Sum");
    expect(result.headers).toContain("Scale Mean");
    expect(result.headers).not.toContain("Scale Score");
    expect(result.rows[0]["Scale Sum"]).toBe(4);
    expect(result.rows[0]["Scale Mean"]).toBe(2);
  });

  it("computes configured Overall source-B sum and mean, flips, and strict missingness", () => {
    const positive = makeSubscale("Positive", ["P1", "P2", "P3", "P4"]);
    positive.scoringMethod = "mean";
    const negative = makeSubscale("Negative", ["N1", "N2", "N3", "N4", "N5", "N6"]);
    negative.scoringMethod = "mean";
    const rows = [
      { P1: "4", P2: "4", P3: "4", P4: "4", N1: "2", N2: "2", N3: "2", N4: "2", N5: "2", N6: "2" },
      { P1: "4", P2: "4", P3: "4", P4: "4", N1: "", N2: "2", N3: "2", N4: "2", N5: "2", N6: "2" },
    ];
    const headers = Object.keys(rows[0]);
    const options = {
      overall: { enabled: true, source: "subscales" as const, method: "mean" as const },
    };
    const result = scoreDataset(rows, headers, [positive, negative], {}, [], options);

    expect(result.overallScaleScore).toEqual([3, null]);
    expect(result.rows[0]["Overall Scale Score"]).toBe(3);

    const sumOverall = scoreDataset(rows.slice(0, 1), headers, [positive, negative], {}, [], {
      overall: { enabled: true, source: "subscales", method: "sum" },
    });
    expect(sumOverall.overallScaleScore).toEqual([6]);

    const fromItems = scoreDataset(rows.slice(0, 1), headers, [positive, negative], {}, [], {
      overall: { enabled: true, source: "items", method: "mean" },
    });
    expect(fromItems.overallScaleScore).toEqual([2.8]);

    const flippedSum = scoreDataset(rows.slice(0, 1), headers, [positive, negative], {}, [], {
      overall: {
        enabled: true,
        source: "subscales",
        method: "sum",
        flippedSubscaleIds: ["negative"],
      },
    });
    expect(flippedSum.overallScaleScore).toEqual([8]);

    const flipped = scoreDataset(rows.slice(0, 1), headers, [positive, negative], {}, [], {
      overall: {
        enabled: true,
        source: "subscales",
        method: "mean",
        flippedSubscaleIds: ["negative"],
      },
    });
    expect(flipped.overallScaleScore).toEqual([4]);
  });
});

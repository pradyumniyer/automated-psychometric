import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runFullAnalysis } from "../src/scientific/analysis";
import { SubscaleConfig } from "../src/scientific/scoring";

const fixtureDirectory = new URL("../docs/fixtures/", import.meta.url);
const csv = readFileSync(new URL("fixture_A.csv", fixtureDirectory), "utf8");
const expected = JSON.parse(
  readFileSync(new URL("fixture_A_expected.json", fixtureDirectory), "utf8"),
) as {
  reliability: Record<
    string,
    {
      n_complete: number;
      k: number;
      alpha: number;
      items: Record<
        string,
        { alpha_if_deleted: number; corrected_item_total_r: number }
      >;
    }
  >;
};

function parseFixture(): { headers: string[]; rows: Record<string, string>[] } {
  const [headerLine, ...dataLines] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  const rows = dataLines.map((line) =>
    Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])),
  );
  return { headers, rows };
}

function makeSubscale(
  name: string,
  columns: string[],
  reverseColumns: string[] = [],
): SubscaleConfig {
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

describe("reliability per scientific-spec section 3", () => {
  it.each(["Sub1", "Sub2", "Overall"])(
    "matches all Fixture A reliability values for %s",
    (scaleName) => {
      const { headers, rows } = parseFixture();
      const { analysis } = runFullAnalysis(rows, headers, fixtureSubscales, {});
      const actual = analysis.subscales.find((scale) => scale.subscaleName === scaleName)?.reliability;
      const fixture = expected.reliability[scaleName];

      expect(actual).toBeDefined();
      expect(actual!.nCases).toBe(fixture.n_complete);
      expect(actual!.nItems).toBe(fixture.k);
      expect(actual!.alpha).toBeCloseTo(fixture.alpha, 9);

      for (const [itemName, itemFixture] of Object.entries(fixture.items)) {
        const item = actual!.itemStats.find((stat) => stat.itemName === itemName);
        expect(item, `${scaleName} ${itemName}`).toBeDefined();
        expect(item!.alphaIfDeleted, `${scaleName} ${itemName} alpha if deleted`).toBeCloseTo(
          itemFixture.alpha_if_deleted,
          9,
        );
        expect(
          item!.itemRestCorrelation,
          `${scaleName} ${itemName} corrected item-total r`,
        ).toBeCloseTo(itemFixture.corrected_item_total_r, 9);
      }
    },
  );

  it("produces identical reliability for categorical and numerically coded equivalents", () => {
    const numericValues = [1, 2, 4, 3, 5, 2, 4, 1];
    const labels = ["lowest", "low", "middle", "high", "highest"];
    const columns = ["Q1", "Q2", "Q3"];
    const numericRows = numericValues.map((value, index) => ({
      Q1: String(value),
      Q2: String(numericValues[(index + 1) % numericValues.length]),
      Q3: String(numericValues[(index + 3) % numericValues.length]),
    }));
    const categoricalRows = numericRows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([column, value]) => [column, labels[Number(value) - 1]]),
      ),
    );
    const numericScale = makeSubscale("Scale", columns, ["Q2"]);
    const categoricalScale: SubscaleConfig = {
      ...numericScale,
      responseScale: {
        scaleType: "categorical",
        labelMap: labels.map((label, index) => ({ label, value: index + 1 })),
      },
    };
    const numeric = runFullAnalysis(numericRows, columns, [numericScale], {}).analysis.subscales[0].reliability;
    const categorical = runFullAnalysis(
      categoricalRows,
      columns,
      [categoricalScale],
      {},
    ).analysis.subscales[0].reliability;

    expect(categorical.nCases).toBe(numeric.nCases);
    expect(categorical.nItems).toBe(numeric.nItems);
    expect(categorical.alpha).toBeCloseTo(numeric.alpha, 12);
    expect(categorical.itemStats.map((item) => item.alphaIfDeleted)).toEqual(
      numeric.itemStats.map((item) => item.alphaIfDeleted),
    );
    expect(categorical.itemStats.map((item) => item.itemRestCorrelation)).toEqual(
      numeric.itemStats.map((item) => item.itemRestCorrelation),
    );
  });
});

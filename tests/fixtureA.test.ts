import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fixtureDirectory = new URL("../docs/fixtures/", import.meta.url);

function readFixture(filename: string): string {
  return readFileSync(new URL(filename, fixtureDirectory), "utf8");
}

function dataRowCount(csv: string): number {
  return csv.trim().split(/\r?\n/).length - 1;
}

describe("Fixture A files", () => {
  it("loads both CSV fixtures with 30 data rows", () => {
    expect(dataRowCount(readFixture("fixture_A.csv"))).toBe(30);
    expect(dataRowCount(readFixture("fixture_A_jamovi.csv"))).toBe(30);
  });

  it("loads the expected JSON sections", () => {
    const expected = JSON.parse(readFixture("fixture_A_expected.json"));

    expect(Object.keys(expected)).toEqual(
      expect.arrayContaining(["per_row", "group_row_means", "reliability"]),
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  assessRangeOutliers,
  detectConventionalRange,
  detectMixedRanges,
  resolveResponse,
  type ResponseScaleV2,
} from "../src/scientific/responseScales";

const fixtureScale: ResponseScaleV2 = {
  min: 1,
  max: 5,
  rangeSource: "detected",
  confirmed: false,
  flipped: false,
  startsAtZero: false,
  outOfRange: "missing",
  labels: [
    { text: "N/A", value: null, kind: "special" },
    { text: "Prefer not to say", value: null, kind: "special" },
    { text: "-99", value: null, kind: "special" },
  ],
};

describe("resolveResponse", () => {
  it("resolves Fixture A Q3/Q5 values and special responses", () => {
    expect(resolveResponse(4, fixtureScale)).toEqual({
      kind: "valid",
      value: 4,
    });

    expect(resolveResponse(" N/A ", fixtureScale)).toEqual({
      kind: "special_missing",
      value: null,
    });
    expect(resolveResponse("prefer NOT to say", fixtureScale)).toEqual({
      kind: "special_missing",
      value: null,
    });
  });

  describe("conventional response-scale range detection", () => {
    it("detects 1-4 when nobody chose 5 and leaves the suggestion unconfirmed", () => {
      const result = detectConventionalRange([1, 2, 3, 4, 1, 2, 3, 4]);
      expect(result.range).toEqual({ min: 1, max: 4 });
      expect(result.confirmed).toBe(false);
    });

    it("suggests widening for three values one step beyond 1-4 in 300 responses", () => {
      const values = Array.from({ length: 297 }, (_, index) => (index % 4) + 1);
      values.push(5, 5, 5);
      const result = detectConventionalRange(values);
      expect(result.range).toEqual({ min: 1, max: 4 });
      expect(result.outOfRange).toMatchObject({
        count: 3,
        suggestedAction: "widen",
      });
    });

    it("defaults farther values such as P26's 7 to treating them as missing", () => {
      expect(assessRangeOutliers([7], { min: 1, max: 5 })).toEqual({
        count: 1,
        values: [7],
        suggestedAction: "missing",
      });
    });

    it("reports differing observed ranges for items instead of silently combining them", () => {
      const result = detectMixedRanges({
        Q3: [1, 2, 3, 4, 5],
        Q4: [1, 2, 3, 4],
      });
      expect(result.mixed).toBe(true);
      expect(result.items).toEqual([
        { item: "Q3", range: { min: 1, max: 5 } },
        { item: "Q4", range: { min: 1, max: 4 } },
      ]);
    });
  });

  it("classifies P26's Q4 value 7 as out of range without altering it", () => {
    expect(resolveResponse(7, fixtureScale)).toEqual({
      kind: "out_of_range",
      value: null,
      raw: 7,
      suggestedAction: "missing",
    });
  });

  it("recognizes numeric missing codes and blank or unmapped text", () => {
    expect(resolveResponse(-99, fixtureScale).kind).toBe("special_missing");
    expect(resolveResponse(-999, fixtureScale).kind).toBe("special_missing");
    expect(resolveResponse("   ", fixtureScale)).toEqual({ kind: "blank", value: null });
    expect(resolveResponse("not a response", fixtureScale)).toEqual({
      kind: "unmapped",
      value: null,
      raw: "not a response",
    });
  });

  it("scores a special response when mapped to zero and does not reverse it by default", () => {
    const scale: ResponseScaleV2 = {
      ...fixtureScale,
      labels: [{ text: "N/A", value: 0, kind: "special" }],
    };
    expect(resolveResponse("N/A", scale)).toEqual({
      kind: "special_scored",
      value: 0,
    });
  });

  it("honors an explicitly reversed special label", () => {
    const scale: ResponseScaleV2 = {
      ...fixtureScale,
      labels: [{ text: "N/A", value: 0, kind: "special", reverse: true }],
    };
    expect(resolveResponse("N/A", scale)).toEqual({
      kind: "special_scored",
      value: 6,
    });
  });

  it("treats decimal values as valid continuous responses", () => {
    const scale: ResponseScaleV2 = { ...fixtureScale, min: 0, max: 10 };
    expect(resolveResponse("2.5", scale)).toEqual({ kind: "valid", value: 2.5 });
  });
});

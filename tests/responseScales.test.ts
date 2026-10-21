import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assessRangeOutliers,
  applyOutOfRangeAction,
  buildPresetLabels,
  canReverseScore,
  copyFirstResponseScaleSettings,
  createOutOfRangeHistoryEntry,
  detectConventionalRange,
  detectMixedRanges,
  findOutOfRangeCells,
  matchResponsePreset,
  resolveResponse,
  collectOtherResponses,
  responseScaleFromLabels,
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
  it("identifies affected item cells without changing their raw values", () => {
    expect(findOutOfRangeCells(
      [{ Q3: 4, Q4: 7 }, { Q3: 5, Q4: 1 }],
      ["Q3", "Q4"],
      { min: 1, max: 5 },
      ["P25", "P26"],
    )).toEqual([{ column: "Q4", rowIndex: 0, rowId: "P25", value: 7 }]);
  });

  it("copies only response-scale settings and confirms recipients only when the first is confirmed", () => {
    const scales = [
      { minValue: 1, maxValue: 5, labelMap: [{ label: "Agree", value: 5 }], confirmed: true, flipped: true, startsAtZero: true, showOutputs: ["sum"] },
      { minValue: 0, maxValue: 4, labelMap: [], confirmed: true, showOutputs: ["mean"] },
    ];
    const copied = copyFirstResponseScaleSettings(scales[0], scales);
    expect(copied.map(({ minValue, maxValue, labelMap, confirmed }) => ({ minValue, maxValue, labelMap, confirmed }))).toEqual([
      { minValue: 1, maxValue: 5, labelMap: [{ label: "Agree", value: 5 }], confirmed: true },
      { minValue: 1, maxValue: 5, labelMap: [{ label: "Agree", value: 5 }], confirmed: true },
    ]);
    expect(copied[1].showOutputs).toEqual(["mean"]);
    expect(copied[1].flipped).toBe(true);
    expect(copied[1].startsAtZero).toBe(true);
    const unconfirmed = copyFirstResponseScaleSettings({ ...scales[0], confirmed: false }, scales);
    expect(unconfirmed.every((scale) => scale.confirmed === false)).toBe(true);
  });

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

    describe("out-of-range actions", () => {
      it("widens a detected 1-4 range to 1-5 and logs the affected values", () => {
        const result = applyOutOfRangeAction(
          { ...fixtureScale, min: 1, max: 4, confirmed: false },
          [5, 5, 5],
          "widen",
        );
        expect(result.scale).toMatchObject({
          min: 1,
          max: 5,
          rangeSource: "manual",
          confirmed: true,
        });
        expect(result.log).toEqual({
          action: "widen",
          count: 3,
          values: [5, 5, 5],
        });
      });

      it("widens a detected 1-5 range to 1-7 and then resolves 7 as valid", () => {
        const result = applyOutOfRangeAction(
          { ...fixtureScale, confirmed: false },
          [7],
          "widen",
        );
        expect(result.scale).toMatchObject({ min: 1, max: 7, confirmed: true });
        expect(resolveResponse(7, result.scale)).toEqual({ kind: "valid", value: 7 });
      });

      it("leaves a reverse-item scale unconfirmed when widening", () => {
        const result = applyOutOfRangeAction(
          { ...fixtureScale, confirmed: true },
          [7],
          "widen",
          true,
        );
        expect(result.scale).toMatchObject({ min: 1, max: 7, confirmed: false });
      });

      it("keeps the range and confirmation unchanged when treating values as missing", () => {
        const result = applyOutOfRangeAction(
          { ...fixtureScale, confirmed: false },
          [7, 7],
          "missing",
        );
        expect(result.scale).toEqual(fixtureScale);
        expect(result.log).toEqual({
          action: "missing",
          count: 2,
          values: [7, 7],
        });
        expect(resolveResponse(7, result.scale)).toMatchObject({
          kind: "out_of_range",
          suggestedAction: "missing",
        });
      });
    });

    it("detects Fixture A's 1-5 response range and only permits reverse scoring after confirmation", () => {
      const result = detectConventionalRange([1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
      expect(result.range).toEqual({ min: 1, max: 5 });
      expect(result.confirmed).toBe(false);
      expect(canReverseScore({ ...fixtureScale, confirmed: result.confirmed })).toBe(false);
      expect(canReverseScore({ ...fixtureScale, confirmed: true })).toBe(true);
    });

    describe("word response-scale presets", () => {
      it("matches normalized word variants and preserves an extra N/A row", () => {
        const result = matchResponsePreset([
          "strongly agree",
          " Strongly   Agree ",
          "Agree",
          "N/A",
        ]);
        expect(result.preset?.name).toBe("5-pt Agreement");
        expect(result.extraResponses).toEqual(["N/A"]);
        expect(result.labels.find((label) => label.text === "Strongly Agree")?.value).toBe(5);
      });

      it("matches full-width letters, non-breaking spaces, extra spaces, and mixed case", () => {
        const result = matchResponsePreset([
          "ＳＴＲＯＮＧＬＹ　ＡＧＲＥＥ",
          "Strongly\u00a0Agree",
          "  sTrOnGlY   aGrEe  ",
        ]);
        expect(result.preset?.name).toBe("5-pt Agreement");
        expect(result.labels.find((label) => label.text === "Strongly Agree")?.value).toBe(5);
      });

      it("leaves non-matching words unmapped", () => {
        const result = matchResponsePreset(["Red", "Blue", "Green"]);
        expect(result.preset).toBeNull();
        expect(result.labels).toEqual([
          { text: "Red", value: null, kind: "scale" },
          { text: "Blue", value: null, kind: "scale" },
          { text: "Green", value: null, kind: "scale" },
        ]);
      });

      it("supports flipped and zero-start preset values", () => {
        const labels = buildPresetLabels("5-pt Agreement", { flipped: true, startsAtZero: true });
        expect(labels[0]).toMatchObject({ text: "Strongly Disagree", value: 4 });
        expect(labels[4]).toMatchObject({ text: "Strongly Agree", value: 0 });
      });

      it("suggests a demographic or ID when there are more than 15 words", () => {
        const result = matchResponsePreset(Array.from({ length: 16 }, (_, index) => `Person ${index + 1}`));
        expect(result.suggestDemographicOrId).toBe(true);
        expect(result.labels).toHaveLength(16);
      });
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

    it('keeps well-used endpoints but trims weak conventional endpoints on small samples', () => {
      const repeat = (count: number, value: number) => Array.from({ length: count }, () => value);
      const detect = (values: number[], expected: { min: number; max: number }, outside: number[]) => {
        const result = detectConventionalRange(values);
        expect(result.range).toEqual(expected);
        expect(result.outOfRange.values).toEqual(outside);
      };
      detect([...repeat(5, 1), ...repeat(5, 2), ...repeat(5, 3), ...repeat(5, 4), ...repeat(5, 5), ...repeat(4, 6), ...repeat(5, 7), 8], { min: 1, max: 7 }, [8]);
      detect([...repeat(6, 1), ...repeat(6, 2), ...repeat(6, 3), ...repeat(6, 4), ...repeat(7, 5), ...repeat(6, 6), ...repeat(8, 7), 8, 8], { min: 1, max: 7 }, [8, 8]);
      detect([...repeat(5, 1), ...repeat(5, 2), ...repeat(5, 3), ...repeat(5, 4), ...repeat(5, 5), ...repeat(4, 6), ...repeat(5, 7), 8, ...repeat(12, 7)], { min: 1, max: 7 }, [8]);
      detect([...repeat(6, 1), ...repeat(6, 2), ...repeat(6, 3), ...repeat(6, 4), ...repeat(6, 5), 7], { min: 1, max: 5 }, [7]);
      detect([...repeat(6, 1), ...repeat(6, 2), ...repeat(6, 3), ...repeat(6, 4), ...repeat(6, 5), 0], { min: 1, max: 5 }, [0]);
      detect([...repeat(10, 1), ...repeat(10, 2), ...repeat(9, 3), ...repeat(9, 4), ...repeat(2, 5)], { min: 1, max: 5 }, []);
      detect([...repeat(10, 1), ...repeat(10, 2), ...repeat(10, 3), ...repeat(10, 4), 5], { min: 1, max: 4 }, [5]);
      detect([1, 2, 3, 4, 5, 3], { min: 1, max: 5 }, []);
      detect([...repeat(6, 1), ...repeat(6, 2), ...repeat(6, 3), ...repeat(6, 4), ...repeat(6, 5), ...repeat(6, 6), ...repeat(12, 7), ...repeat(12, 8)], { min: 1, max: 9 }, []);
      detect([...repeat(200, 1), ...repeat(200, 2), ...repeat(200, 3), ...repeat(200, 4), ...repeat(192, 5), ...repeat(8, 7)], { min: 1, max: 5 }, Array(8).fill(7));
      detect([...repeat(200, 1), ...repeat(200, 2), ...repeat(200, 3), ...repeat(200, 4), ...repeat(188, 5), ...repeat(12, 7)], { min: 1, max: 7 }, []);
    });

    it('preserves the weak-end guarantees across seeded random datasets', () => {
      let seed = 72913;
      for (let sample = 0; sample < 250; sample += 1) {
        seed = (seed * 48271) % 2147483647;
        const length = 6 + (seed % 500);
        const values = Array.from({ length }, () => {
          seed = (seed * 48271) % 2147483647;
          return 0 + (seed % 12);
        });
        const ranges = [
          { min: 0, max: 3 }, { min: 0, max: 4 }, { min: 0, max: 5 }, { min: 0, max: 6 },
          { min: 0, max: 7 }, { min: 0, max: 10 }, { min: 1, max: 3 }, { min: 1, max: 4 },
          { min: 1, max: 5 }, { min: 1, max: 6 }, { min: 1, max: 7 }, { min: 1, max: 9 },
          { min: 1, max: 10 }, { min: 0, max: 100 },
        ];
        const oldRange = ranges.filter((range) => values.filter((value) => value >= range.min && value <= range.max).length / length >= 0.99)
          .sort((left, right) => (left.max - left.min) - (right.max - right.min))[0]
          ?? { min: Math.min(...values), max: Math.max(...values) };
        const result = detectConventionalRange(values);
        const tWeak = Math.max(1, Math.floor(0.01 * length));
        const tOut = Math.max(2, Math.floor(0.01 * length));
        const usedMin = values.filter((value) => value === oldRange.min).length;
        const usedMax = values.filter((value) => value === oldRange.max).length;
        if (usedMin > tWeak && usedMax > tWeak) expect(result.range).toEqual(oldRange);
        const newOutside = values.filter((value) => value < result.range.min || value > result.range.max).length;
        expect(newOutside <= Math.max(tOut, Math.floor(0.01 * length)) || (result.range.min === oldRange.min && result.range.max === oldRange.max)).toBe(true);
      }
    });

    it('leaves Fixture A item and whole-dataset automatic ranges at 1-5 with 7 outside', async () => {
      const lines = readFileSync(resolve(process.cwd(), 'docs/fixtures/fixture_A.csv'), 'utf8').trim().split(/\r?\n/);
      const headers = lines[0].split(',');
      const rows = lines.slice(1).map((line) => Object.fromEntries(line.split(',').map((cell, index) => [headers[index], cell])));
      const itemValues = rows.flatMap((row) => ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'].map((column) => row[column]));
      expect(detectConventionalRange(itemValues)).toMatchObject({ range: { min: 1, max: 5 }, outOfRange: { values: [7] } });
      const { buildAutoScale } = await import('../src/scientific/scoring');
      const auto = buildAutoScale(headers, ['ID', 'Age'], rows);
      expect(auto.responseScale).toMatchObject({ minValue: 1, maxValue: 5 });
      expect(detectConventionalRange(rows.flatMap((row) => headers.slice(2).map((column) => row[column]))).outOfRange.values).toContain(7);
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

  it("creates a cleaning-log entry without changing the original cells", () => {
    const result = applyOutOfRangeAction({ ...fixtureScale }, [7, 7], "missing");
    expect(createOutOfRangeHistoryEntry(result.log)).toEqual({
      action_type: "response_scale_out_of_range",
      description: "Treat as missing for 2 out-of-range responses",
      payload: { action: "missing", count: 2, values: [7, 7] },
    });
    expect(result.log.values).toEqual([7, 7]);
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

  it("lists other responses with counts and built-in/unknown kinds", () => {
    const result = collectOtherResponses(
      [{ Q1: "N/A" }, { Q1: "n/a" }, { Q1: "Maybe" }, { Q1: -99 }, { Q1: 3 }],
      ["Q1"],
      responseScaleFromLabels([], { min: 1, max: 5 }),
    );
    expect(result).toEqual([
      { response: "N/A", count: 2, kind: "built_in", value: null },
      { response: "Maybe", count: 1, kind: "unknown", value: null },
      { response: "-99", count: 1, kind: "built_in", value: null },
    ]);
  });

  it("scores a typed special response without reversing it unless its row is reversed", () => {
    const scale = responseScaleFromLabels([{ label: "N/A", value: 0, kind: "special" }], { min: 0, max: 5 });
    expect(resolveResponse("N/A", scale)).toEqual({ kind: "special_scored", value: 0 });
    expect(resolveResponse("N/A", { ...scale, labels: [{ ...scale.labels[0], reverse: true }] })).toEqual({ kind: "special_scored", value: 5 });
  });
});

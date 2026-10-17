import { describe, expect, it } from "vitest";
import {
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

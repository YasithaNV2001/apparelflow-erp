import { describe, expect, it } from "vitest";
import {
  fromHundredths,
  hasAtMostTwoDecimals,
  toHundredths,
} from "@/domain/hundredths";

describe("hasAtMostTwoDecimals", () => {
  it.each([94, 94.5, 94.55, 1.8, 0.01, 100_000])("accepts %s", (value) => {
    expect(hasAtMostTwoDecimals(value)).toBe(true);
  });

  it.each([94.555, 0.001, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %s",
    (value) => {
      expect(hasAtMostTwoDecimals(value)).toBe(false);
    },
  );
});

describe("toHundredths / fromHundredths", () => {
  it("converts to exact integer hundredths and back", () => {
    expect(toHundredths("yards", 94.5)).toBe(9450);
    expect(toHundredths("yards", 1.8)).toBe(180);
    expect(fromHundredths(9450)).toBe(94.5);
  });

  it("throws a RangeError for more than 2 decimals", () => {
    expect(() => toHundredths("yards", 94.555)).toThrow(RangeError);
  });
});

import { describe, expect, it } from "vitest";
import { formatPercent, formatSigned, formatYards } from "@/lib/format";

describe("display formatting", () => {
  it.each([
    [94, "94.00 yd"],
    [95.5, "95.50 yd"],
  ])("formats %s yards as %s", (value, text) => {
    expect(formatYards(value)).toBe(text);
  });

  it.each([
    [4.44, "4.44%"],
    [0, "0.00%"],
    [-2.22, "−2.22%"],
  ])("formats %s percent as %s", (value, text) => {
    expect(formatPercent(value)).toBe(text);
  });

  it.each([
    [4, "+4"],
    [-4, "−4"],
    [0, "0"],
  ])("formats the variance %s as %s", (value, text) => {
    expect(formatSigned(value)).toBe(text);
  });
});

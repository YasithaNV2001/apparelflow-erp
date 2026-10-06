import { describe, expect, it } from "vitest";
import {
  calculateExpectedFabricYds,
  calculateWastage,
} from "@/domain/wastage";

describe("calculateExpectedFabricYds", () => {
  it.each([
    { recipe: "Casual Blouse", targetQty: 50, stdFabricYards: 1.8, expected: 90 },
    { recipe: "Casual Blouse", targetQty: 30, stdFabricYards: 1.8, expected: 54 },
    { recipe: "Crop Top", targetQty: 60, stdFabricYards: 1.1, expected: 66 },
    { recipe: "Crop Top", targetQty: 40, stdFabricYards: 1.1, expected: 44 },
  ])(
    "$recipe × $targetQty at $stdFabricYards yd each → $expected yd",
    ({ targetQty, stdFabricYards, expected }) => {
      expect(calculateExpectedFabricYds(targetQty, stdFabricYards)).toBe(expected);
    },
  );

  it("is exact where floating-point multiplication is not (3 × 1.1)", () => {
    // In plain JavaScript, 3 * 1.1 === 3.3000000000000003.
    expect(calculateExpectedFabricYds(3, 1.1)).toBe(3.3);
  });

  it.each([
    { targetQty: 2.5, stdFabricYards: 1.8 },
    { targetQty: 50, stdFabricYards: 0 },
    { targetQty: 50, stdFabricYards: 1.234 },
  ])(
    "rejects $targetQty × $stdFabricYards",
    ({ targetQty, stdFabricYards }) => {
      expect(() => calculateExpectedFabricYds(targetQty, stdFabricYards)).toThrow(
        RangeError,
      );
    },
  );
});

describe("calculateWastage", () => {
  // Required vectors from PLAN §5.6.
  it.each([
    { order: "Casual Blouse × 50", expected: 90, actual: 94, cap: 5, pct: 4.44, exceeds: false },
    { order: "Casual Blouse × 50", expected: 90, actual: 96, cap: 5, pct: 6.67, exceeds: true },
    { order: "Casual Blouse × 50", expected: 90, actual: 90, cap: 5, pct: 0, exceeds: false },
    { order: "Casual Blouse × 50", expected: 90, actual: 88, cap: 5, pct: -2.22, exceeds: false },
    { order: "Crop Top × 60", expected: 66, actual: 70, cap: 8, pct: 6.06, exceeds: false },
    { order: "Crop Top × 40", expected: 44, actual: 48, cap: 8, pct: 9.09, exceeds: true },
  ])(
    "$order: $actual of $expected yd → $pct% (cap $cap%, exceeds: $exceeds)",
    ({ expected, actual, cap, pct, exceeds }) => {
      expect(calculateWastage(expected, actual, cap)).toEqual({
        wastagePct: pct,
        exceedsCap: exceeds,
      });
    },
  );

  it("does not exceed the cap when wastage equals it exactly", () => {
    expect(calculateWastage(100, 105, 5)).toEqual({ wastagePct: 5, exceedsCap: false });
  });

  it("rounds an exact half away from zero, without floating-point error", () => {
    // 0.02 ÷ 80 × 100 = 0.025 exactly; naive float maths gives 0.0249999… and rounds to 0.02.
    expect(calculateWastage(80, 80.02, 5).wastagePct).toBe(0.03);
    expect(calculateWastage(80, 79.98, 5).wastagePct).toBe(-0.03);
  });

  it("never returns negative zero for a tiny saving", () => {
    // −0.001 % rounds to 0; toBe would fail on −0.
    expect(calculateWastage(1000, 999.99, 5).wastagePct).toBe(0);
  });

  it.each([
    { expected: 0, actual: 94, cap: 5 },
    { expected: 90, actual: 0, cap: 5 },
    { expected: 90, actual: -1, cap: 5 },
    { expected: 90, actual: 94.555, cap: 5 },
    { expected: 90, actual: 94, cap: -1 },
    { expected: Number.NaN, actual: 94, cap: 5 },
  ])(
    "rejects expected $expected, actual $actual, cap $cap",
    ({ expected, actual, cap }) => {
      expect(() => calculateWastage(expected, actual, cap)).toThrow(RangeError);
    },
  );
});

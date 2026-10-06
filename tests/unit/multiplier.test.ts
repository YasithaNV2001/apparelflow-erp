import { describe, expect, it } from "vitest";
import { calculateExpectedQty } from "@/domain/multiplier";

// Recipe components exactly as in PLAN §6.3 (PDF §7.1). Kept literal on purpose:
// tests must not import the seed data they are meant to verify.
const CASUAL_BLOUSE_X50 = [
  { component: "Front Body Panel", piecesPerGarment: 1, expected: 50 },
  { component: "Back Body Panel", piecesPerGarment: 1, expected: 50 },
  { component: "Sleeves (Left & Right)", piecesPerGarment: 2, expected: 100 },
  { component: "Collar & Stand", piecesPerGarment: 1, expected: 50 },
  { component: "Sleeve Cuffs", piecesPerGarment: 2, expected: 100 },
];

const CROP_TOP_X60 = [
  { component: "Front Chest Panel", piecesPerGarment: 1, expected: 60 },
  { component: "Back Support Panel", piecesPerGarment: 1, expected: 60 },
  { component: "Neck Binding Strip", piecesPerGarment: 1, expected: 60 },
  { component: "Hem Elastic Casing", piecesPerGarment: 1, expected: 60 },
  { component: "Side Strap Accents", piecesPerGarment: 2, expected: 120 },
];

describe("calculateExpectedQty", () => {
  it.each(CASUAL_BLOUSE_X50)(
    "Casual Blouse × 50: $component → $expected",
    ({ piecesPerGarment, expected }) => {
      expect(calculateExpectedQty(50, piecesPerGarment)).toBe(expected);
    },
  );

  it.each(CROP_TOP_X60)(
    "Crop Top × 60: $component → $expected",
    ({ piecesPerGarment, expected }) => {
      expect(calculateExpectedQty(60, piecesPerGarment)).toBe(expected);
    },
  );

  it.each([
    { targetQty: 0, piecesPerGarment: 2 },
    { targetQty: -5, piecesPerGarment: 2 },
    { targetQty: 2.5, piecesPerGarment: 2 },
    { targetQty: Number.NaN, piecesPerGarment: 2 },
    { targetQty: 50, piecesPerGarment: 0 },
    { targetQty: 50, piecesPerGarment: 1.5 },
  ])(
    "rejects $targetQty × $piecesPerGarment (not positive integers)",
    ({ targetQty, piecesPerGarment }) => {
      expect(() => calculateExpectedQty(targetQty, piecesPerGarment)).toThrow(
        RangeError,
      );
    },
  );
});

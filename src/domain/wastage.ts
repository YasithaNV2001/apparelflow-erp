import { assertPositiveInteger } from "./assert";
import { HUNDREDTHS_PER_UNIT, fromHundredths, toHundredths } from "./hundredths";

const PERCENT = 100;

export interface WastageResult {
  /** 2 decimals, rounded half away from zero; negative when less fabric was used (D14). */
  wastagePct: number;
  /** A warning only, never a block (D13). */
  exceedsCap: boolean;
}

/** Standard fabric for a batch (PLAN §5.6): target garments × standard yards per garment. */
export function calculateExpectedFabricYds(
  targetQty: number,
  stdFabricYards: number,
): number {
  assertPositiveInteger("targetQty", targetQty);
  const stdHundredths = toPositiveHundredths("stdFabricYards", stdFabricYards);
  return fromHundredths(targetQty * stdHundredths);
}

/**
 * Wastage % = (actual − expected) ÷ expected × 100 (PLAN §5.6, PDF §7.5).
 * Takes the order's expected-fabric and cap snapshots, never live recipe values (D15).
 */
export function calculateWastage(
  expectedFabricYds: number,
  actualFabricYds: number,
  wastageCapPct: number,
): WastageResult {
  const expected = toPositiveHundredths("expectedFabricYds", expectedFabricYds);
  const actual = toPositiveHundredths("actualFabricYds", actualFabricYds);
  const cap = toNonNegativeHundredths("wastageCapPct", wastageCapPct);
  // Result in hundredths of a percent, using integers only: (a − e) × 100 × 100 ÷ e.
  const pctHundredths = divideRoundingHalfAwayFromZero(
    (actual - expected) * PERCENT * HUNDREDTHS_PER_UNIT,
    expected,
  );
  return {
    wastagePct: fromHundredths(pctHundredths),
    exceedsCap: pctHundredths > cap,
  };
}

function toPositiveHundredths(name: string, value: number): number {
  const hundredths = toHundredths(name, value);
  if (hundredths <= 0) {
    throw new RangeError(`${name} must be greater than 0, got ${value}`);
  }
  return hundredths;
}

function toNonNegativeHundredths(name: string, value: number): number {
  const hundredths = toHundredths(name, value);
  if (hundredths < 0) {
    throw new RangeError(`${name} must not be negative, got ${value}`);
  }
  return hundredths;
}

function divideRoundingHalfAwayFromZero(
  numerator: number,
  denominator: number,
): number {
  const quotient = Math.trunc(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  const isHalfOrMore = 2 * Math.abs(remainder) >= denominator;
  const rounded = isHalfOrMore ? quotient + Math.sign(numerator) : quotient;
  // Math.trunc(-0.1) is -0; return a plain 0 so it never shows as "-0".
  return rounded === 0 ? 0 : rounded;
}

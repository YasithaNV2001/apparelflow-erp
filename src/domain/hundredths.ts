export const HUNDREDTHS_PER_UNIT = 100;

// Binary floats are inexact (1.8 × 100 = 180.00000000000003), so allow a tiny gap
// when checking that a value has at most 2 decimals.
const FLOAT_TOLERANCE = 1e-6;

export function hasAtMostTwoDecimals(value: number): boolean {
  if (!Number.isFinite(value)) {
    return false;
  }
  const scaled = value * HUNDREDTHS_PER_UNIT;
  return Math.abs(scaled - Math.round(scaled)) <= FLOAT_TOLERANCE;
}

/** Exact integer hundredths of a 2-decimal value (94.5 → 9450), for float-free arithmetic (PLAN §5.6). */
export function toHundredths(name: string, value: number): number {
  if (!hasAtMostTwoDecimals(value)) {
    throw new RangeError(
      `${name} must be a number with at most 2 decimals, got ${value}`,
    );
  }
  return Math.round(value * HUNDREDTHS_PER_UNIT);
}

export function fromHundredths(hundredths: number): number {
  return hundredths / HUNDREDTHS_PER_UNIT;
}

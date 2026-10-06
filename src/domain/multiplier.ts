import { assertPositiveInteger } from "./assert";

/**
 * Expected number of cut pieces for one component (PLAN §5.3, PDF §7.2):
 * target garments × pieces per garment. Example: 50 blouses × 2 cuffs = 100.
 */
export function calculateExpectedQty(
  targetQty: number,
  piecesPerGarment: number,
): number {
  assertPositiveInteger("targetQty", targetQty);
  assertPositiveInteger("piecesPerGarment", piecesPerGarment);
  return targetQty * piecesPerGarment;
}

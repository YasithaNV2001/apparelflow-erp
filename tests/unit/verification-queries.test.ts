import { describe, expect, it } from "vitest";
import { isNewerThanSave } from "@/components/verification/verification-queries";
import type { OrderStatus } from "@/domain/constants";

function version(status: OrderStatus, verificationRound: number) {
  return { status, verificationRound };
}

// A save only succeeds while the order is pending, so its answer is always a pending order.
const SAVED_ROUND_1 = version("PENDING_VERIFICATION", 1);

describe("isNewerThanSave", () => {
  it("lets the save's answer in when nothing is cached", () => {
    expect(isNewerThanSave(undefined, SAVED_ROUND_1)).toBe(false);
  });

  it("lets the save's answer in while the cached order is pending in the same round", () => {
    expect(isNewerThanSave(version("PENDING_VERIFICATION", 1), SAVED_ROUND_1)).toBe(false);
  });

  it.each<OrderStatus>(["VERIFIED", "REJECTED"])(
    "keeps a cached %s order when a save from the same round answers late",
    (status) => {
      expect(isNewerThanSave(version(status, 1), SAVED_ROUND_1)).toBe(true);
    },
  );

  it("keeps a cached order that has moved on to a later round", () => {
    expect(isNewerThanSave(version("PENDING_VERIFICATION", 2), SAVED_ROUND_1)).toBe(true);
  });

  it("lets a save from a later round replace an older cached order", () => {
    expect(isNewerThanSave(version("REJECTED", 1), version("PENDING_VERIFICATION", 2))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  checkCount,
  completeSheet,
  describeShortages,
  partialSheet,
  previewSheet,
  type SheetComponent,
} from "@/domain/count-sheet";

// Casual Blouse × 50 (PDF §7.2).
const BLOUSE_X50: SheetComponent[] = [
  { componentId: 1, componentName: "Front Body Panel", expectedQty: 50 },
  { componentId: 2, componentName: "Back Body Panel", expectedQty: 50 },
  { componentId: 3, componentName: "Sleeves (Left & Right)", expectedQty: 100 },
  { componentId: 4, componentName: "Collar & Stand", expectedQty: 50 },
  { componentId: 5, componentName: "Sleeve Cuffs", expectedQty: 100 },
];

function drafts(...values: string[]): Record<number, string> {
  return Object.fromEntries(values.map((value, index) => [index + 1, value]));
}

describe("checkCount", () => {
  it.each([
    ["96", 96],
    [" 100 ", 100],
    ["0", 0],
    ["100000", 100_000],
  ])("reads %j as the count %d", (raw, value) => {
    expect(checkCount(raw)).toEqual({ kind: "count", value });
  });

  it.each(["", "   "])("treats %j as not counted, never as 0 (D17)", (raw) => {
    expect(checkCount(raw)).toEqual({ kind: "empty" });
  });

  it.each(["12abc", "2.5", "-1", "1e2", "abc", "100001"])("rejects %j with the API's message", (raw) => {
    expect(checkCount(raw)).toEqual({ kind: "invalid", error: "Enter a whole number from 0 to 100,000." });
  });
});

describe("previewSheet", () => {
  it("classifies every row as the server would and summarises the sheet", () => {
    const { rows, summary } = previewSheet(BLOUSE_X50, drafts("50", "50", "102", "", "96"));
    expect(rows.map((row) => [row.status, row.variance])).toEqual([
      ["GREEN", 0],
      ["GREEN", 0],
      ["YELLOW", 2],
      ["UNCOUNTED", null],
      ["RED", -4],
    ]);
    expect(summary).toEqual({
      green: 2,
      yellow: 1,
      red: 1,
      uncounted: 1,
      canApprove: false,
      blockers: ["Collar & Stand not counted", "Sleeve Cuffs short by 4 (96/100)"],
    });
  });

  it("allows approval when everything is counted and nothing is short", () => {
    expect(previewSheet(BLOUSE_X50, drafts("50", "50", "100", "50", "101")).summary.canApprove).toBe(true);
  });

  it("blocks approval while a box holds invalid text", () => {
    const { rows, summary } = previewSheet(BLOUSE_X50, drafts("50", "50", "100", "50", "1OO"));
    expect(rows[4]).toMatchObject({ status: "UNCOUNTED", actualQty: null, check: { kind: "invalid" } });
    expect(summary.canApprove).toBe(false);
  });

  it("reads a missing draft as an empty box", () => {
    expect(previewSheet(BLOUSE_X50, {}).summary.uncounted).toBe(5);
  });
});

describe("count sheets sent to the API", () => {
  it("builds the complete sheet for Approve only when every box holds a count", () => {
    const counted = previewSheet(BLOUSE_X50, drafts("50", "50", "100", "50", "100"));
    expect(completeSheet(counted.rows)).toEqual([
      { componentId: 1, actualQty: 50 },
      { componentId: 2, actualQty: 50 },
      { componentId: 3, actualQty: 100 },
      { componentId: 4, actualQty: 50 },
      { componentId: 5, actualQty: 100 },
    ]);
    const unfinished = previewSheet(BLOUSE_X50, drafts("50", "50", "100", "", "100"));
    expect(completeSheet(unfinished.rows)).toBeNull();
  });

  it("sends empty boxes as null and leaves invalid text out for Reject", () => {
    const { rows } = previewSheet(BLOUSE_X50, drafts("50", "", "100", "5O", "96"));
    expect(partialSheet(rows)).toEqual([
      { componentId: 1, actualQty: 50 },
      { componentId: 2, actualQty: null },
      { componentId: 3, actualQty: 100 },
      { componentId: 5, actualQty: 96 },
    ]);
  });
});

describe("describeShortages", () => {
  it("pre-fills the reject reason from the short components (PLAN §8.2)", () => {
    const { rows } = previewSheet(BLOUSE_X50, drafts("50", "50", "100", "48", "96"));
    expect(describeShortages(rows)).toBe("Shortage: Collar & Stand 48/50 (−2); Sleeve Cuffs 96/100 (−4).");
  });

  it("is empty when nothing is short", () => {
    const { rows } = previewSheet(BLOUSE_X50, drafts("50", "50", "102", "", "100"));
    expect(describeShortages(rows)).toBe("");
  });
});

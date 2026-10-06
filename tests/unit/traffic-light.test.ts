import { describe, expect, it } from "vitest";
import {
  classifyComponent,
  summarize,
  type CountedComponent,
} from "@/domain/traffic-light";

// Casual Blouse × 50 (PLAN §6.3): expected 50 / 50 / 100 / 50 / 100.
function blouseSheet(counts: Array<number | null>): CountedComponent[] {
  const components = [
    { componentName: "Front Body Panel", expectedQty: 50 },
    { componentName: "Back Body Panel", expectedQty: 50 },
    { componentName: "Sleeves (Left & Right)", expectedQty: 100 },
    { componentName: "Collar & Stand", expectedQty: 50 },
    { componentName: "Sleeve Cuffs", expectedQty: 100 },
  ];
  return components.map((component, index) => ({
    ...component,
    actualQty: counts[index],
  }));
}

describe("classifyComponent", () => {
  it.each([
    { expectedQty: 100, actualQty: 100, status: "GREEN" },
    { expectedQty: 100, actualQty: 102, status: "YELLOW" },
    { expectedQty: 100, actualQty: 96, status: "RED" },
    { expectedQty: 100, actualQty: 0, status: "RED" },
    { expectedQty: 100, actualQty: null, status: "UNCOUNTED" },
  ])(
    "expected $expectedQty, actual $actualQty → $status",
    ({ expectedQty, actualQty, status }) => {
      expect(classifyComponent(expectedQty, actualQty)).toBe(status);
    },
  );

  it.each([
    { expectedQty: 0, actualQty: 10 },
    { expectedQty: 2.5, actualQty: 10 },
    { expectedQty: 100, actualQty: -1 },
    { expectedQty: 100, actualQty: 2.5 },
    { expectedQty: 100, actualQty: Number.NaN },
  ])(
    "rejects expected $expectedQty, actual $actualQty",
    ({ expectedQty, actualQty }) => {
      expect(() => classifyComponent(expectedQty, actualQty)).toThrow(RangeError);
    },
  );
});

describe("summarize", () => {
  it("allows approval when every component matches", () => {
    expect(summarize(blouseSheet([50, 50, 100, 50, 100]))).toEqual({
      green: 5,
      yellow: 0,
      red: 0,
      uncounted: 0,
      canApprove: true,
      blockers: [],
    });
  });

  it("allows approval with an excess (YELLOW), which is only flagged", () => {
    const summary = summarize(blouseSheet([50, 50, 102, 50, 100]));
    expect(summary).toMatchObject({ green: 4, yellow: 1, canApprove: true, blockers: [] });
  });

  it("blocks approval and names the shortage (cuffs 96/100)", () => {
    const summary = summarize(blouseSheet([50, 50, 100, 50, 96]));
    expect(summary).toMatchObject({ green: 4, red: 1, canApprove: false });
    expect(summary.blockers).toEqual(["Sleeve Cuffs short by 4 (96/100)"]);
  });

  it("blocks approval when a component is not counted", () => {
    const summary = summarize(blouseSheet([50, 50, 100, null, 100]));
    expect(summary).toMatchObject({ uncounted: 1, canApprove: false });
    expect(summary.blockers).toEqual(["Collar & Stand not counted"]);
  });

  it("treats a count of 0 as a shortage, never as not counted", () => {
    const summary = summarize(blouseSheet([0, 50, 100, 50, 100]));
    expect(summary).toMatchObject({ red: 1, uncounted: 0, canApprove: false });
    expect(summary.blockers).toEqual(["Front Body Panel short by 50 (0/50)"]);
  });

  it("lists every blocker in sheet order", () => {
    const summary = summarize(blouseSheet([null, 49, 100, 50, 100]));
    expect(summary.blockers).toEqual([
      "Front Body Panel not counted",
      "Back Body Panel short by 1 (49/50)",
    ]);
  });

  it("blocks approval for an order with no components", () => {
    expect(summarize([])).toEqual({
      green: 0,
      yellow: 0,
      red: 0,
      uncounted: 0,
      canApprove: false,
      blockers: ["Order has no components"],
    });
  });
});

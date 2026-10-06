import { describe, expect, it } from "vitest";
import {
  approvalNoteSchema,
  approveOrderSchema,
  countSchema,
  createOrderSchema,
  fabricRollIdSchema,
  fabricYdsSchema,
  parseWholeNumber,
  parseYards,
  rejectOrderSchema,
  rejectionNoteSchema,
  saveCountsSchema,
  targetQtySchema,
} from "@/domain/validation";

const VALID_ORDER = {
  recipeId: 1,
  targetQty: 50,
  fabricRollId: "FAB-ROLL-882",
  actualFabricYds: 94,
};

describe("parseWholeNumber", () => {
  it.each([
    { raw: "50", value: 50 },
    { raw: "0", value: 0 },
    { raw: " 50 ", value: 50 },
  ])("parses $raw as $value", ({ raw, value }) => {
    expect(parseWholeNumber(raw)).toEqual({ kind: "number", value });
  });

  it.each(["", " "])("treats %j as empty, never as 0", (raw) => {
    expect(parseWholeNumber(raw)).toEqual({ kind: "empty" });
  });

  it.each(["12abc", "2.5", "1e2", "-5", "abc", "+5", "0x10"])(
    "rejects %j",
    (raw) => {
      expect(parseWholeNumber(raw)).toEqual({ kind: "invalid" });
    },
  );
});

describe("parseYards", () => {
  it.each([
    { raw: "94.5", value: 94.5 },
    { raw: "94", value: 94 },
    { raw: "94.55", value: 94.55 },
  ])("parses $raw as $value", ({ raw, value }) => {
    expect(parseYards(raw)).toEqual({ kind: "number", value });
  });

  it("treats an empty field as empty", () => {
    expect(parseYards("")).toEqual({ kind: "empty" });
  });

  it.each(["94.555", "94.", ".5", "1e2", "-1", "abc"])("rejects %j", (raw) => {
    expect(parseYards(raw)).toEqual({ kind: "invalid" });
  });
});

describe("targetQtySchema", () => {
  it.each([1, 50, 10_000])("accepts %s", (value) => {
    expect(targetQtySchema.safeParse(value).success).toBe(true);
  });

  it.each([0, -5, 2.5, 10_001, "50", "", null, undefined])(
    "rejects %j",
    (value) => {
      expect(targetQtySchema.safeParse(value).success).toBe(false);
    },
  );

  it("explains the rule in one clear message", () => {
    const result = targetQtySchema.safeParse(2.5);
    expect(result.error?.issues[0]?.message).toBe(
      "Enter a whole number from 1 to 10,000.",
    );
  });
});

describe("countSchema", () => {
  it.each([0, 96, 100_000])("accepts %s (0 is a real count)", (value) => {
    expect(countSchema.safeParse(value).success).toBe(true);
  });

  it.each([-1, 2.5, 100_001, "abc", "12", null])("rejects %j", (value) => {
    expect(countSchema.safeParse(value).success).toBe(false);
  });
});

describe("fabricYdsSchema", () => {
  it.each([94.5, 94, 0.01, 100_000])("accepts %s", (value) => {
    expect(fabricYdsSchema.safeParse(value).success).toBe(true);
  });

  it.each([0, -1, 94.555, 100_000.01, "94", Number.NaN])(
    "rejects %j",
    (value) => {
      expect(fabricYdsSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("fabricRollIdSchema", () => {
  it("trims and upper-cases before checking", () => {
    expect(fabricRollIdSchema.parse("  fab-roll-882 ")).toBe("FAB-ROLL-882");
  });

  it.each(["", "   ", "roll 882!", "ab", "-ROLL-1", "A".repeat(41)])(
    "rejects %j",
    (value) => {
      expect(fabricRollIdSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("rejectionNoteSchema", () => {
  it.each([undefined, "", "   ", "short", "x".repeat(501)])(
    "rejects %j",
    (value) => {
      expect(rejectionNoteSchema.safeParse(value).success).toBe(false);
    },
  );

  it("trims a valid reason", () => {
    expect(rejectionNoteSchema.parse("  Shortage: cuffs 96/100  ")).toBe(
      "Shortage: cuffs 96/100",
    );
  });
});

describe("approvalNoteSchema", () => {
  it("accepts up to 500 characters and rejects more", () => {
    expect(approvalNoteSchema.safeParse("x".repeat(500)).success).toBe(true);
    expect(approvalNoteSchema.safeParse("x".repeat(501)).success).toBe(false);
  });
});

describe("createOrderSchema", () => {
  it("strips client-supplied server fields instead of trusting them (D19)", () => {
    const parsed = createOrderSchema.parse({
      ...VALID_ORDER,
      expectedQty: 999,
      status: "VERIFIED",
      createdBy: 42,
    });
    expect(parsed).toEqual({ ...VALID_ORDER, submitForVerification: false });
  });

  it("rejects a string where a boolean is required", () => {
    const result = createOrderSchema.safeParse({
      ...VALID_ORDER,
      submitForVerification: "true",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty payload", () => {
    expect(createOrderSchema.safeParse({}).success).toBe(false);
  });
});

describe("saveCountsSchema", () => {
  it("accepts null to clear a count", () => {
    const result = saveCountsSchema.safeParse({
      items: [{ componentId: 5, actualQty: null }],
    });
    expect(result.success).toBe(true);
  });

  it.each([
    { label: "an empty list", items: [] },
    {
      label: "a duplicate component",
      items: [
        { componentId: 5, actualQty: 96 },
        { componentId: 5, actualQty: 100 },
      ],
    },
  ])("rejects $label", ({ items }) => {
    expect(saveCountsSchema.safeParse({ items }).success).toBe(false);
  });
});

describe("approveOrderSchema", () => {
  it("strips a forged verifier, status and wastage (PLAN §9.3 tamper test)", () => {
    const parsed = approveOrderSchema.parse({
      verifierId: 999,
      status: "VERIFIED",
      wastagePct: 0,
    });
    expect(parsed).toEqual({});
  });

  it("requires real counts in a final count sheet", () => {
    const result = approveOrderSchema.safeParse({
      items: [{ componentId: 5, actualQty: null }],
    });
    expect(result.success).toBe(false);
  });
});

describe("rejectOrderSchema", () => {
  it("rejects a missing reason note (PDF Test 3)", () => {
    expect(rejectOrderSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a reason with partial counts", () => {
    const result = rejectOrderSchema.safeParse({
      rejectionNote: "Shortage: cuffs 96/100",
      items: [{ componentId: 5, actualQty: null }],
    });
    expect(result.success).toBe(true);
  });
});

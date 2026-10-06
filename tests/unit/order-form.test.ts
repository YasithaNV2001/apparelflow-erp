import { describe, expect, it } from "vitest";
import { checkNewOrderForm, previewOrder, type NewOrderFormValues } from "@/domain/order-form";

const VALID: NewOrderFormValues = {
  recipeId: "1",
  targetQty: "50",
  fabricRollId: " fab-roll-882 ",
  actualFabricYds: "94",
};

const BLOUSE = {
  stdFabricYards: 1.8,
  wastageCap: 5,
  components: [
    { id: 1, name: "Front Body Panel", piecesPerGarment: 1 },
    { id: 5, name: "Sleeve Cuffs", piecesPerGarment: 2 },
  ],
};

describe("checkNewOrderForm", () => {
  it("turns valid text fields into the exact API payload", () => {
    expect(checkNewOrderForm(VALID)).toEqual({
      errors: {},
      payload: { recipeId: 1, targetQty: 50, fabricRollId: "FAB-ROLL-882", actualFabricYds: 94 },
    });
  });

  it("reports every empty field as required, never as 0", () => {
    const result = checkNewOrderForm({ recipeId: "", targetQty: "", fabricRollId: "  ", actualFabricYds: "" });
    expect(result.payload).toBeNull();
    expect(result.errors).toEqual({
      recipeId: "Choose a recipe.",
      targetQty: "Enter the number of garments.",
      fabricRollId: "Enter the fabric roll ID.",
      actualFabricYds: "Enter the fabric used, in yards.",
    });
  });

  it.each(["0", "-5", "2.5", "abc", "1e2", "10001"])("rejects target quantity %j", (targetQty) => {
    const result = checkNewOrderForm({ ...VALID, targetQty });
    expect(result.errors.targetQty).toBe("Enter a whole number from 1 to 10,000.");
    expect(result.payload).toBeNull();
  });

  it.each(["0", "-1", "94.555", "abc", "94."])("rejects fabric used %j", (actualFabricYds) => {
    const result = checkNewOrderForm({ ...VALID, actualFabricYds });
    expect(result.errors.actualFabricYds).toBeDefined();
    expect(result.payload).toBeNull();
  });

  it("accepts yards with up to 2 decimals (D16)", () => {
    expect(checkNewOrderForm({ ...VALID, actualFabricYds: "94.5" }).payload?.actualFabricYds).toBe(94.5);
  });

  it("rejects a malformed roll ID", () => {
    expect(checkNewOrderForm({ ...VALID, fabricRollId: "roll 882!" }).errors.fabricRollId).toBeDefined();
  });
});

describe("previewOrder", () => {
  it("shows expected counts, expected fabric and wastage as soon as the numbers are valid", () => {
    expect(previewOrder(BLOUSE, 50, 94)).toEqual({
      components: [
        { id: 1, name: "Front Body Panel", piecesPerGarment: 1, expectedQty: 50 },
        { id: 5, name: "Sleeve Cuffs", piecesPerGarment: 2, expectedQty: 100 },
      ],
      expectedFabricYds: 90,
      wastage: { wastagePct: 4.44, exceedsCap: false },
    });
  });

  it("leaves numbers blank while the quantity is missing", () => {
    const preview = previewOrder(BLOUSE, null, 94);
    expect(preview.components.map((component) => component.expectedQty)).toEqual([null, null]);
    expect(preview.expectedFabricYds).toBeNull();
    expect(preview.wastage).toBeNull();
  });

  it("shows expected fabric without wastage until the fabric used is entered", () => {
    const preview = previewOrder(BLOUSE, 50, null);
    expect(preview.expectedFabricYds).toBe(90);
    expect(preview.wastage).toBeNull();
  });
});

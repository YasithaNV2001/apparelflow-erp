import { z } from "zod";
import { calculateExpectedQty } from "./multiplier";
import {
  fabricRollIdSchema,
  fabricYdsSchema,
  parseWholeNumber,
  parseYards,
  targetQtySchema,
  type ParsedNumber,
} from "./validation";
import { calculateExpectedFabricYds, calculateWastage, type WastageResult } from "./wastage";

/** The New Cutting Order form exactly as typed: every field is text (no type="number", PLAN §8.3). */
export interface NewOrderFormValues {
  recipeId: string;
  targetQty: string;
  fabricRollId: string;
  actualFabricYds: string;
}

export type NewOrderErrors = Partial<Record<keyof NewOrderFormValues, string>>;

export interface NewOrderPayload {
  recipeId: number;
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: number;
}

export interface NewOrderCheck {
  errors: NewOrderErrors;
  /** The payload for POST /api/orders, or null while any field is invalid. */
  payload: NewOrderPayload | null;
}

type FieldResult<T> = { value: T } | { error: string };

const REQUIRED_MESSAGES = {
  recipeId: "Choose a recipe.",
  targetQty: "Enter the number of garments.",
  fabricRollId: "Enter the fabric roll ID.",
  actualFabricYds: "Enter the fabric used, in yards.",
} as const;

/**
 * Validates the form with the same strict parsers and zod schemas the API uses (PLAN §5.7),
 * so a value the form accepts is a value the server accepts.
 */
export function checkNewOrderForm(form: NewOrderFormValues): NewOrderCheck {
  const fields = {
    recipeId: checkRecipeId(form.recipeId),
    targetQty: checkNumber(parseWholeNumber(form.targetQty), targetQtySchema, REQUIRED_MESSAGES.targetQty),
    fabricRollId: checkFabricRollId(form.fabricRollId),
    actualFabricYds: checkNumber(parseYards(form.actualFabricYds), fabricYdsSchema, REQUIRED_MESSAGES.actualFabricYds),
  };

  const errors: NewOrderErrors = {};
  for (const [name, result] of Object.entries(fields)) {
    if ("error" in result) {
      errors[name as keyof NewOrderFormValues] = result.error;
    }
  }
  if (
    "error" in fields.recipeId ||
    "error" in fields.targetQty ||
    "error" in fields.fabricRollId ||
    "error" in fields.actualFabricYds
  ) {
    return { errors, payload: null };
  }
  return {
    errors,
    payload: {
      recipeId: fields.recipeId.value,
      targetQty: fields.targetQty.value,
      fabricRollId: fields.fabricRollId.value,
      actualFabricYds: fields.actualFabricYds.value,
    },
  };
}

function checkRecipeId(raw: string): FieldResult<number> {
  const parsed = parseWholeNumber(raw);
  return parsed.kind === "number" && parsed.value > 0
    ? { value: parsed.value }
    : { error: REQUIRED_MESSAGES.recipeId };
}

function checkFabricRollId(raw: string): FieldResult<string> {
  if (raw.trim() === "") {
    return { error: REQUIRED_MESSAGES.fabricRollId };
  }
  return fromSchema(fabricRollIdSchema, raw);
}

function checkNumber(
  parsed: ParsedNumber,
  schema: z.ZodType<number>,
  requiredMessage: string,
): FieldResult<number> {
  if (parsed.kind === "empty") {
    return { error: requiredMessage };
  }
  // Text that is not a plain number goes to the schema as text, which fails with its own message.
  return fromSchema(schema, parsed.kind === "number" ? parsed.value : "not a number");
}

function fromSchema<T>(schema: z.ZodType<T>, value: unknown): FieldResult<T> {
  const result = schema.safeParse(value);
  return result.success ? { value: result.data } : { error: result.error.issues[0].message };
}

export interface PreviewRecipe {
  stdFabricYards: number;
  wastageCap: number;
  components: readonly { id: number; name: string; piecesPerGarment: number }[];
}

export interface OrderPreview {
  components: { id: number; name: string; piecesPerGarment: number; expectedQty: number | null }[];
  expectedFabricYds: number | null;
  wastage: WastageResult | null;
}

/**
 * The live preview shown while the supervisor types (PLAN §8.2). The same domain functions
 * compute the stored values on the server, so preview and result always agree.
 */
export function previewOrder(
  recipe: PreviewRecipe,
  targetQty: number | null,
  actualFabricYds: number | null,
): OrderPreview {
  const expectedFabricYds =
    targetQty === null ? null : calculateExpectedFabricYds(targetQty, recipe.stdFabricYards);
  return {
    components: recipe.components.map((component) => ({
      ...component,
      expectedQty: targetQty === null ? null : calculateExpectedQty(targetQty, component.piecesPerGarment),
    })),
    expectedFabricYds,
    wastage:
      expectedFabricYds === null || actualFabricYds === null
        ? null
        : calculateWastage(expectedFabricYds, actualFabricYds, recipe.wastageCap),
  };
}

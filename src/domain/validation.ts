import { z } from "zod";
import {
  APPROVAL_NOTE_MAX_LENGTH,
  COUNT_MAX,
  COUNT_MIN,
  FABRIC_ROLL_ID_PATTERN,
  FABRIC_YDS_MAX,
  FABRIC_YDS_MAX_DECIMALS,
  PASSWORD_MAX_LENGTH,
  REJECTION_NOTE_MAX_LENGTH,
  REJECTION_NOTE_MIN_LENGTH,
  TARGET_QTY_MAX,
  TARGET_QTY_MIN,
} from "./constants";
import { hasAtMostTwoDecimals } from "./hundredths";

// ---------------------------------------------------------------------------
// Strict parsers for text inputs (PLAN §5.7). Forms run these before zod.
// ---------------------------------------------------------------------------

const WHOLE_NUMBER_PATTERN = /^\d+$/;
const YARDS_PATTERN = /^\d+(\.\d{1,2})?$/;

export type ParsedNumber =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "number"; value: number };

/** "50" → 50. Rejects "2.5", "-5", "1e2" and "12abc" (Number("") is 0 and parseInt("12abc") is 12). */
export function parseWholeNumber(raw: string): ParsedNumber {
  return parseWithPattern(raw, WHOLE_NUMBER_PATTERN);
}

/** "94.5" → 94.5. At most 2 decimals, with a digit before the point. */
export function parseYards(raw: string): ParsedNumber {
  return parseWithPattern(raw, YARDS_PATTERN);
}

function parseWithPattern(raw: string, pattern: RegExp): ParsedNumber {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { kind: "empty" };
  }
  if (!pattern.test(trimmed)) {
    return { kind: "invalid" };
  }
  // Safe only because the pattern has already guaranteed plain digits.
  return { kind: "number", value: Number(trimmed) };
}

// ---------------------------------------------------------------------------
// Field schemas. JSON numbers only: numeric strings are rejected, never coerced.
// The message on the base schema replaces every message that field can produce.
// ---------------------------------------------------------------------------

function formatLimit(value: number): string {
  return value.toLocaleString("en-US");
}

const idSchema = z
  .number({ error: "Must be a positive whole number." })
  .int()
  .positive();

export const targetQtySchema = z
  .number({
    error: `Enter a whole number from ${TARGET_QTY_MIN} to ${formatLimit(TARGET_QTY_MAX)}.`,
  })
  .int()
  .min(TARGET_QTY_MIN)
  .max(TARGET_QTY_MAX);

export const countSchema = z
  .number({
    error: `Enter a whole number from ${COUNT_MIN} to ${formatLimit(COUNT_MAX)}.`,
  })
  .int()
  .min(COUNT_MIN)
  .max(COUNT_MAX);

export const fabricYdsSchema = z
  .number({
    error: `Enter yards above 0 and up to ${formatLimit(FABRIC_YDS_MAX)}, with at most ${FABRIC_YDS_MAX_DECIMALS} decimals.`,
  })
  .positive()
  .max(FABRIC_YDS_MAX)
  .refine(hasAtMostTwoDecimals);

export const fabricRollIdSchema = z
  .string({
    error:
      "Use 3–40 letters, digits or dashes, starting with a letter or digit (e.g. FAB-ROLL-882).",
  })
  .trim()
  .toUpperCase()
  .regex(FABRIC_ROLL_ID_PATTERN);

export const rejectionNoteSchema = z
  .string({
    error: `Give a reason of ${REJECTION_NOTE_MIN_LENGTH}–${REJECTION_NOTE_MAX_LENGTH} characters.`,
  })
  .trim()
  .min(REJECTION_NOTE_MIN_LENGTH)
  .max(REJECTION_NOTE_MAX_LENGTH);

export const approvalNoteSchema = z
  .string({
    error: `Keep the note to ${APPROVAL_NOTE_MAX_LENGTH} characters or fewer.`,
  })
  .trim()
  .max(APPROVAL_NOTE_MAX_LENGTH);

// ---------------------------------------------------------------------------
// Count sheets. Unknown component ids are checked by the service; duplicates are a 400 here.
// ---------------------------------------------------------------------------

const DUPLICATE_COMPONENT_MESSAGE = "Each component may appear only once.";
const EMPTY_ITEMS_MESSAGE = "Send at least one component count.";

function hasUniqueComponentIds(
  items: readonly { componentId: number }[],
): boolean {
  return new Set(items.map((item) => item.componentId)).size === items.length;
}

/** Counts being saved: null clears a count back to "not counted" (PLAN D17). */
const countItemsSchema = z
  .array(z.object({ componentId: idSchema, actualQty: countSchema.nullable() }))
  .min(1, { error: EMPTY_ITEMS_MESSAGE })
  .refine(hasUniqueComponentIds, { error: DUPLICATE_COMPONENT_MESSAGE });

/** A complete count sheet sent with Approve: every count is a real number (PLAN §5.5). */
const finalCountItemsSchema = z
  .array(z.object({ componentId: idSchema, actualQty: countSchema }))
  .min(1, { error: EMPTY_ITEMS_MESSAGE })
  .refine(hasUniqueComponentIds, { error: DUPLICATE_COMPONENT_MESSAGE });

// ---------------------------------------------------------------------------
// Request payloads (PLAN §7.2). z.object strips unknown keys such as verifierId,
// status, expectedQty or wastagePct, so the client can never set them (D19).
// ---------------------------------------------------------------------------

export const createOrderSchema = z.object({
  recipeId: idSchema,
  targetQty: targetQtySchema,
  fabricRollId: fabricRollIdSchema,
  actualFabricYds: fabricYdsSchema,
  submitForVerification: z.boolean().default(false),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const submitOrderSchema = z.object({
  actualFabricYds: fabricYdsSchema.optional(),
});
export type SubmitOrderInput = z.infer<typeof submitOrderSchema>;

export const saveCountsSchema = z.object({
  items: countItemsSchema,
});
export type SaveCountsInput = z.infer<typeof saveCountsSchema>;

export const approveOrderSchema = z.object({
  items: finalCountItemsSchema.optional(),
  approvalNote: approvalNoteSchema.optional(),
});
export type ApproveOrderInput = z.infer<typeof approveOrderSchema>;

export const rejectOrderSchema = z.object({
  rejectionNote: rejectionNoteSchema,
  items: countItemsSchema.optional(),
});
export type RejectOrderInput = z.infer<typeof rejectOrderSchema>;



export const loginSchema = z.object({
  // Accounts are stored lower-case (users_email_lower_case CHECK), so normalise before comparing.
  email: z
    .string({ error: "Enter your email address." })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Enter a valid email address." })),
  // Never trimmed: spaces can be part of a password.
  password: z
    .string({ error: "Enter your password." })
    .min(1)
    .max(PASSWORD_MAX_LENGTH, { error: "That password is too long." }),
});
export type LoginInput = z.infer<typeof loginSchema>;

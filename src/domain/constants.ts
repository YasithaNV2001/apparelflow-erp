// Single source of truth for enum values and input limits (PLAN §5, §6.1).
// Shared by the UI, the API's zod schemas and the database enums.

export const ROLES = [
  "cutting_supervisor",
  "cutting_verifier",
  "sewing_supervisor",
] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = [
  "CUTTING_IN_PROGRESS",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REJECTED",
  "SEWING_IN_PROGRESS",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const VERIFICATION_DECISIONS = ["APPROVED", "REJECTED"] as const;
export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number];

// Traffic light for one component (PLAN §5.4). UNCOUNTED means no count was entered yet.
export const COMPONENT_STATUSES = ["GREEN", "YELLOW", "RED", "UNCOUNTED"] as const;
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];

// Input limits (PLAN §5.7).
export const TARGET_QTY_MIN = 1;
export const TARGET_QTY_MAX = 10_000;
export const COUNT_MIN = 0;
export const COUNT_MAX = 100_000;
export const FABRIC_YDS_MAX = 100_000;
export const FABRIC_YDS_MAX_DECIMALS = 2;
export const REJECTION_NOTE_MIN_LENGTH = 10;
export const REJECTION_NOTE_MAX_LENGTH = 500;
export const APPROVAL_NOTE_MAX_LENGTH = 500;
// Generous upper bound so a login request cannot carry an absurdly long string.
export const PASSWORD_MAX_LENGTH = 200;


// 3–40 characters: letters, digits and dashes, starting with a letter or digit (after trim + upper-case).
export const FABRIC_ROLL_ID_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

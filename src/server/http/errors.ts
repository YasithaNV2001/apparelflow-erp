import "server-only";

export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  INTERNAL: 500,
} as const;

/** Stable error codes the client can rely on (PLAN §7.1). */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN_ROLE"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "CONCURRENT_UPDATE"
  | HardStopCode
  | "INTERNAL_ERROR";

export type HardStopCode =
  | "HARD_STOP_SHORTAGE"
  | "HARD_STOP_UNCOUNTED"
  | "HARD_STOP_MISSING_COMPONENTS";

/** An expected failure with a fixed HTTP status, a stable code and a message safe to show users. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(HTTP_STATUS.BAD_REQUEST, "VALIDATION_ERROR", message, details);
  }
}

export class UnauthenticatedError extends ApiError {
  constructor() {
    super(HTTP_STATUS.UNAUTHORIZED, "UNAUTHENTICATED", "Sign in to continue.");
  }
}

export class InvalidCredentialsError extends ApiError {
  constructor() {
    super(HTTP_STATUS.UNAUTHORIZED, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
}

export class ForbiddenRoleError extends ApiError {
  constructor() {
    super(HTTP_STATUS.FORBIDDEN, "FORBIDDEN_ROLE", "Your role cannot perform this action.");
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found.") {
    super(HTTP_STATUS.NOT_FOUND, "NOT_FOUND", message);
  }
}

export class InvalidStateError extends ApiError {
  constructor(message: string) {
    super(HTTP_STATUS.CONFLICT, "INVALID_STATE", message);
  }
}

export class ConcurrentUpdateError extends ApiError {
  constructor() {
    super(
      HTTP_STATUS.CONFLICT,
      "CONCURRENT_UPDATE",
      "Someone else changed this order at the same time. Reload and try again.",
    );
  }
}

export class HardStopError extends ApiError {
  constructor(code: HardStopCode, message: string, details?: unknown) {
    super(HTTP_STATUS.UNPROCESSABLE, code, message, details);
  }
}

/** The JSON error body every endpoint returns: { error: { code, message, details? } }. */
export function errorResponse(error: ApiError): Response {
  const body = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
  return Response.json(body, { status: error.status });
}

export function internalErrorResponse(): Response {
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    { status: HTTP_STATUS.INTERNAL },
  );
}

const STATE_GUARD_PREFIXES = ["ILLEGAL_TRANSITION", "ITEM_LOCKED", "ORDER_LOCKED", "AUDIT_IMMUTABLE"];

/**
 * Translates an integrity-trigger exception (drizzle/0001_integrity_guards.sql) into an API error,
 * or returns null for any other error. Normally the service refuses first; this is the backstop.
 */
export function fromDatabaseGuard(error: unknown): ApiError | null {
  const message = innermostMessage(error);
  if (message.startsWith("HARD_STOP")) {
    const code = message.includes("no components")
      ? "HARD_STOP_MISSING_COMPONENTS"
      : "HARD_STOP_SHORTAGE";
    return new HardStopError(code, "Cannot approve: every component must be counted and none may be short.");
  }
  if (STATE_GUARD_PREFIXES.some((prefix) => message.startsWith(prefix))) {
    return new InvalidStateError("This order can no longer be changed in that way.");
  }
  return null;
}

/** Drizzle wraps driver errors; the database's own message is on the innermost `cause`. */
function innermostMessage(error: unknown): string {
  let current = error;
  while (current instanceof Error && current.cause instanceof Error) {
    current = current.cause;
  }
  return current instanceof Error ? current.message : "";
}

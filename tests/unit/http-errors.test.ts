import { describe, expect, it } from "vitest";
import {
  ConcurrentUpdateError,
  ForbiddenRoleError,
  HardStopError,
  InvalidCredentialsError,
  InvalidStateError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
  errorResponse,
  fromDatabaseGuard,
  internalErrorResponse,
} from "@/server/http/errors";

/** Mimics how drizzle wraps a database error: the trigger text sits on `cause`. */
function wrappedDatabaseError(message: string): Error {
  return new Error("Failed query: UPDATE cutting_orders …", { cause: new Error(message) });
}

describe("typed API errors", () => {
  it.each([
    { error: new ValidationError("Bad input"), status: 400, code: "VALIDATION_ERROR" },
    { error: new UnauthenticatedError(), status: 401, code: "UNAUTHENTICATED" },
    { error: new InvalidCredentialsError(), status: 401, code: "INVALID_CREDENTIALS" },
    { error: new ForbiddenRoleError(), status: 403, code: "FORBIDDEN_ROLE" },
    { error: new NotFoundError(), status: 404, code: "NOT_FOUND" },
    { error: new InvalidStateError("Already approved"), status: 409, code: "INVALID_STATE" },
    { error: new ConcurrentUpdateError(), status: 409, code: "CONCURRENT_UPDATE" },
    { error: new HardStopError("HARD_STOP_SHORTAGE", "Short"), status: 422, code: "HARD_STOP_SHORTAGE" },
  ])("$code → HTTP $status", ({ error, status, code }) => {
    expect(error).toMatchObject({ status, code });
    expect(error).toBeInstanceOf(Error);
  });
});

describe("errorResponse", () => {
  it("renders { error: { code, message, details } } with the right status", async () => {
    const details = [{ component: "Sleeve Cuffs", expected: 100, actual: 96, shortBy: 4 }];
    const response = errorResponse(
      new HardStopError("HARD_STOP_SHORTAGE", "Cannot approve: 1 component is short.", details),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "HARD_STOP_SHORTAGE",
        message: "Cannot approve: 1 component is short.",
        details,
      },
    });
  });

  it("omits details when there are none", async () => {
    const response = errorResponse(new ForbiddenRoleError());
    expect(await response.json()).toEqual({
      error: { code: "FORBIDDEN_ROLE", message: "Your role cannot perform this action." },
    });
  });

  it("gives a generic 500 that reveals nothing internal", async () => {
    const response = internalErrorResponse();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
    });
  });
});

describe("fromDatabaseGuard", () => {
  it.each([
    { message: "HARD_STOP: uncounted or short components", status: 422, code: "HARD_STOP_SHORTAGE" },
    { message: "HARD_STOP: order has no components", status: 422, code: "HARD_STOP_MISSING_COMPONENTS" },
    { message: "ILLEGAL_TRANSITION: VERIFIED -> PENDING_VERIFICATION", status: 409, code: "INVALID_STATE" },
    { message: "ITEM_LOCKED: counts can only change while PENDING_VERIFICATION", status: 409, code: "INVALID_STATE" },
    { message: "ORDER_LOCKED: core order fields cannot change", status: 409, code: "INVALID_STATE" },
    { message: "AUDIT_IMMUTABLE: verification_logs is append-only", status: 409, code: "INVALID_STATE" },
  ])("maps “$message” to $status $code", ({ message, status, code }) => {
    expect(fromDatabaseGuard(wrappedDatabaseError(message))).toMatchObject({ status, code });
  });

  it("never echoes the trigger's internal wording to the client", () => {
    const mapped = fromDatabaseGuard(wrappedDatabaseError("ITEM_LOCKED: counts can only change …"));
    expect(mapped?.message).not.toContain("ITEM_LOCKED");
  });

  it.each([new Error("connection refused"), "not even an Error", undefined])(
    "returns null for anything that is not a guard (%s)",
    (error) => {
      expect(fromDatabaseGuard(error)).toBeNull();
    },
  );
});

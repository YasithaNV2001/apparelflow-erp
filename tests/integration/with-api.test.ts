import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createOrderSchema } from "@/domain/validation";
import { HardStopError, NotFoundError } from "@/server/http/errors";
import { parseRouteId, withApi } from "@/server/http/with-api";
import { apiRequest, sessionCookieFor } from "../helpers/auth";
import { TEST_USERS } from "../helpers/fixtures";
import { createTestDb, resetDb, type TestDb } from "../helpers/test-db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});

beforeEach(async () => {
  await resetDb(testDb.db);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await testDb.close();
});

const VALID_ORDER = {
  recipeId: 1,
  targetQty: 50,
  fabricRollId: "FAB-ROLL-882",
  actualFabricYds: 94,
};

// A supervisor-only endpoint that echoes what withApi handed to it.
const handlerSpy = vi.fn();
const supervisorRoute = withApi(
  { access: ["cutting_supervisor"], body: createOrderSchema },
  async ({ user, body }) => {
    handlerSpy();
    return Response.json({ userId: user.id, body }, { status: 201 });
  },
);

function cookieFor(role: keyof typeof TEST_USERS): Promise<string> {
  return sessionCookieFor(testDb.db, TEST_USERS[role].email);
}

async function errorOf(response: Response): Promise<{ status: number; code: string }> {
  const body = (await response.json()) as { error: { code: string } };
  return { status: response.status, code: body.error.code };
}

describe("withApi: authentication and roles", () => {
  beforeEach(() => {
    handlerSpy.mockClear();
  });

  it("returns 401 without a session cookie, before running the handler", async () => {
    const response = await supervisorRoute(apiRequest("/api/test", { method: "POST", body: VALID_ORDER }));
    expect(await errorOf(response)).toEqual({ status: 401, code: "UNAUTHENTICATED" });
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it("returns 401 for a tampered cookie", async () => {
    const cookie = `${await cookieFor("supervisor")}x`;
    const response = await supervisorRoute(apiRequest("/api/test", { method: "POST", cookie, body: VALID_ORDER }));
    expect(await errorOf(response)).toEqual({ status: 401, code: "UNAUTHENTICATED" });
  });

  it.each(["verifier", "sewing"] as const)(
    "returns 403 for the %s role, even before looking at the body",
    async (role) => {
      const cookie = await cookieFor(role);
      const response = await supervisorRoute(
        apiRequest("/api/test", { method: "POST", cookie, body: { targetQty: "not even valid" } }),
      );
      expect(await errorOf(response)).toEqual({ status: 403, code: "FORBIDDEN_ROLE" });
      expect(handlerSpy).not.toHaveBeenCalled();
    },
  );

  it("lets the allowed role through with the user taken from the session", async () => {
    const cookie = await cookieFor("supervisor");
    const response = await supervisorRoute(apiRequest("/api/test", { method: "POST", cookie, body: VALID_ORDER }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ userId: 1 });
  });

  it("serves public routes without a cookie, with no user", async () => {
    const publicRoute = withApi({ access: "public" }, async ({ user }) =>
      Response.json({ user }),
    );
    expect(await (await publicRoute(apiRequest("/api/public"))).json()).toEqual({ user: null });
  });

  it("accepts every role on signed-in routes", async () => {
    const meRoute = withApi({ access: "signed-in" }, async ({ user }) => Response.json({ role: user.role }));
    for (const role of ["supervisor", "verifier", "sewing"] as const) {
      const response = await meRoute(apiRequest("/api/me", { cookie: await cookieFor(role) }));
      expect(response.status).toBe(200);
    }
  });
});

describe("withApi: body validation", () => {
  it("strips keys the client must not control (D19)", async () => {
    const cookie = await cookieFor("supervisor");
    const response = await supervisorRoute(
      apiRequest("/api/test", {
        method: "POST",
        cookie,
        body: { ...VALID_ORDER, status: "VERIFIED", createdBy: 99, expectedQty: 1 },
      }),
    );
    const { body } = (await response.json()) as { body: Record<string, unknown> };
    expect(body).toEqual({ ...VALID_ORDER, submitForVerification: false });
  });

  it("returns 400 with per-field messages", async () => {
    const cookie = await cookieFor("supervisor");
    const response = await supervisorRoute(
      apiRequest("/api/test", { method: "POST", cookie, body: { ...VALID_ORDER, targetQty: 2.5 } }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: { fields: { targetQty: ["Enter a whole number from 1 to 10,000."] } },
      },
    });
  });

  it("returns 400 for an empty body when fields are required", async () => {
    const cookie = await cookieFor("supervisor");
    const response = await supervisorRoute(apiRequest("/api/test", { method: "POST", cookie }));
    expect(await errorOf(response)).toEqual({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("returns 400 for a body that is not JSON", async () => {
    const cookie = await cookieFor("supervisor");
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: "{ not json",
    });
    expect(await errorOf(await supervisorRoute(request))).toEqual({ status: 400, code: "VALIDATION_ERROR" });
  });
});

describe("withApi: error mapping", () => {
  const routeThrowing = (error: unknown) =>
    withApi({ access: "signed-in" }, async () => {
      throw error;
    });

  it("passes typed errors through with their status, code and details", async () => {
    const details = [{ component: "Sleeve Cuffs", expected: 100, actual: 96, shortBy: 4 }];
    const route = routeThrowing(new HardStopError("HARD_STOP_SHORTAGE", "1 component is short.", details));
    const response = await route(apiRequest("/api/orders/7/approve", { cookie: await cookieFor("verifier") }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { code: "HARD_STOP_SHORTAGE", message: "1 component is short.", details },
    });
  });

  it("turns a database guard into a clean 409 and logs a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const guard = new Error("Failed query", { cause: new Error("ITEM_LOCKED: counts can only change …") });
    const response = await routeThrowing(guard)(
      apiRequest("/api/orders/7/counts", { cookie: await cookieFor("verifier") }),
    );
    expect(await errorOf(response)).toEqual({ status: 409, code: "INVALID_STATE" });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("hides unexpected errors behind a generic 500 and logs where they happened", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await routeThrowing(new Error("secret internal detail"))(
      apiRequest("/api/orders/7", { cookie: await cookieFor("verifier") }),
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret internal detail");
    expect(logError).toHaveBeenCalledWith("[GET /api/orders/7] user=2 unexpected error", expect.any(Error));
  });
});

describe("parseRouteId", () => {
  it("parses a positive whole number", () => {
    expect(parseRouteId({ id: "12" })).toBe(12);
  });

  it.each(["0", "-1", "abc", "1e2", "2.5", ""])("treats id %j as not found (404)", (id) => {
    expect(() => parseRouteId({ id })).toThrow(NotFoundError);
  });
});

describe("withApi: typing", () => {
  it("compiles handlers whose body type comes from the schema", () => {
    const route = withApi({ access: ["cutting_verifier"], body: z.object({ note: z.string() }) }, async ({ body }) =>
      Response.json({ length: body.note.length }),
    );
    expect(typeof route).toBe("function");
  });
});

import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { createTestDb } from "../helpers/test-db";

describe("GET /api/health", () => {
  it("returns 200 { ok: true } when the database answers", async () => {
    const testDb = await createTestDb();
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    await testDb.close();
  });

  it("returns a generic 500 and logs the cause when the database is down", async () => {
    const testDb = await createTestDb();
    await testDb.close(); // the installed database now refuses every query
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "The service is temporarily unavailable.",
      },
    });
    expect(logError).toHaveBeenCalledOnce();
    logError.mockRestore();
  });
});

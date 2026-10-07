import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { apiRequest } from "../helpers/auth";
import { createTestDb, type TestDb } from "../helpers/test-db";

// PGlite boots in hooks, which have a longer timeout than tests (vitest.config.ts), so a busy
// machine slows the boot down without failing the test.
describe("GET /api/health", () => {
  describe("when the database answers", () => {
    let testDb: TestDb;

    beforeAll(async () => {
      testDb = await createTestDb();
    });

    afterAll(async () => {
      await testDb.close();
    });

    it("returns 200 { ok: true }", async () => {
      const response = await GET(apiRequest("/api/health"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    });
  });

  describe("when the database is down", () => {
    beforeAll(async () => {
      const testDb = await createTestDb();
      await testDb.close(); // the installed database now refuses every query
    });

    it("returns a generic 500 and logs the cause", async () => {
      const logError = vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await GET(apiRequest("/api/health"));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
      });
      expect(logError).toHaveBeenCalledWith("[GET /api/health] unexpected error", expect.any(Error));
      logError.mockRestore();
    });
  });
});

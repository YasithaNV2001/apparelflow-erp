import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { recipeComponents, recipes, users } from "@/server/db/schema";
import { createOrder } from "../helpers/factories";
import { createTestDb, resetDb, type TestDb } from "../helpers/test-db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});

beforeEach(async () => {
  await resetDb(testDb.db);
});

afterAll(async () => {
  await testDb.close();
});

describe("test database harness", () => {
  it("installs the in-memory database as the app's database", () => {
    expect(getDb()).toBe(testDb.db);
  });

  it("loads 3 users, 2 recipes and 10 components", async () => {
    expect(await testDb.db.$count(users)).toBe(3);
    expect(await testDb.db.$count(recipes)).toBe(2);
    expect(await testDb.db.$count(recipeComponents)).toBe(10);
  });

  it("restarts identities and order numbers on every reset", async () => {
    const first = await createOrder(testDb.db);
    await resetDb(testDb.db);
    const second = await createOrder(testDb.db);
    expect(first).toMatchObject({ id: 1, orderNo: "CUT-00001" });
    expect(second).toMatchObject({ id: 1, orderNo: "CUT-00001" });
  });
});

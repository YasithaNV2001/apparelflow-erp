import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve the `@/*` import alias from tsconfig.json.
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside Next's react-server build, and tests import server modules directly.
      "server-only": fileURLToPath(
        new URL("./tests/helpers/empty-module.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      JWT_SECRET: "test-only-secret-never-used-outside-vitest-0123456789",
    },
    // PGlite boots a real Postgres in WebAssembly; the first query in a file can take seconds.
    testTimeout: 20_000,
    // Booting PGlite and applying the migrations happens in beforeAll; several files do it in parallel.
    hookTimeout: 60_000,
  },
});

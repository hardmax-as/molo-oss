import { defineConfig } from "vitest/config";

/**
 * Two projects:
 *  - unit: fast, no I/O, runs everywhere (`bun run test`)
 *  - integrity: the content-model assertions against Docker Postgres with
 *    migrations applied (`bun run test:integrity`). Needs DATABASE_URL.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "infra/src/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/dist/**", "packages/testkit/integrity/**"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integrity",
          include: ["packages/testkit/integrity/**/*.test.ts"],
          environment: "node",
          globalSetup: ["packages/testkit/integrity/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});

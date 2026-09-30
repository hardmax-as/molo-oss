import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end: real API Worker (Wrangler DevEnv, env `e2e`), real web dev server,
 * real Postgres (`molo_e2e`, seeded by global-setup). Nothing here touches
 * the development database or any external service.
 *
 * Ports and database default to the documented ones and can be moved with
 * `E2E_API_PORT`, `E2E_WEB_PORT` and `E2E_DATABASE_URL`, so two checkouts of
 * this repo can run the suite at the same time without fighting.
 */
const API_PORT = process.env["E2E_API_PORT"] ?? "8788";
const WEB_PORT = process.env["E2E_WEB_PORT"] ?? "3301";
export const E2E_API = `http://localhost:${API_PORT}`;
export const E2E_WEB = `http://localhost:${WEB_PORT}`;
export const E2E_DATABASE_URL =
  process.env["E2E_DATABASE_URL"] ?? "postgres://molo:molo@localhost:55432/molo_e2e";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env["CI"]
    ? [["github"], ["html", { open: "never", outputFolder: "./playwright-report" }]]
    : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: E2E_WEB,
    locale: "en-GB",
    // The path's current node breathes and the celebration counts up, both of
    // which Playwright reads as "not stable" and refuses to click. The app
    // stills them under reduced motion, which is also the honest setting for
    // a machine: the same DOM, without waiting on decoration.
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/api-server.mjs",
      cwd: "..",
      // Ready without a database: global-setup creates and seeds molo_e2e after the servers are up.
      url: `${E2E_API}/api/auth/ok`,
      reuseExistingServer: false,
      // A cold start on a loaded machine can take well past two minutes.
      timeout: 240_000,
      // wrangler's documented override for a Hyperdrive binding's local connection string.
      env: {
        E2E_API_PORT: API_PORT,
        E2E_WEB_PORT: WEB_PORT,
        CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: E2E_DATABASE_URL,
        CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_CACHED: E2E_DATABASE_URL,
        WRANGLER_SEND_METRICS: "false",
        WRANGLER_WRITE_LOGS: "false",
      },
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `bunx vite dev --port ${WEB_PORT} --strictPort`,
      cwd: "..",
      url: E2E_WEB,
      reuseExistingServer: false,
      // A cold start on a loaded machine can take well past two minutes.
      timeout: 240_000,
      env: { VITE_API_URL: E2E_API, VITE_REVENUECAT_WEB_KEY: "rcb_e2e_placeholder" },
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});

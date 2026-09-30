import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { E2E_DATABASE_URL } from "./playwright.config.ts";

/** Seeds molo_e2e with Bun so the seed shares the workspace's TS loader, not Playwright's. */
export default function globalSetup(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../../..");
  const out = execFileSync("bun", ["packages/testkit/src/e2e-seed.ts"], {
    cwd: root,
    env: { ...process.env, E2E_DATABASE_URL },
    stdio: ["ignore", "pipe", "inherit"],
  });
  execFileSync(
    "bun",
    [
      "packages/cli/src/main.ts",
      "content",
      "export",
      "--published",
      "--out",
      "apps/web/public/lexicon-data",
      "--live",
    ],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  process.stdout.write(`e2e seed: ${out.toString().trim()}\n`);
}

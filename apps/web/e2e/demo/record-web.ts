/**
 * Records the web segments of the Shipaton demo video (MOL-44) against a
 * local dev stack: landing → sign-in → editor overview → content grid → a
 * lexeme → the review queue → the public lexicon page. It is not a test and
 * it is not in the Playwright project: `bun apps/web/e2e/demo/record-web.ts`
 * with the API on 8787 and the web on 3300, signed in as a local admin made
 * by `molo dev user`. Output: apps/web/e2e/demo/out/web-<lang>.webm, a PNG
 * per stop, and web-<lang>.stops.json with the second each stop was reached,
 * so cut.sh can caption the footage without guessing.
 *
 * Nothing here publishes or edits content; it only looks. Everything on
 * screen is the real lexicon (isixhosa.click, CC BY-SA) in its real status.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
mkdirSync(out, { recursive: true });

const WEB = process.env["DEMO_WEB"] ?? "http://localhost:3300";
const EMAIL = process.env["DEMO_EMAIL"] ?? "demo-editor@molo.local";
// The local fixture password from `molo dev user`, never a real credential.
const PASSWORD = process.env["DEMO_PASSWORD"] ?? "molo-dev-1234";
const LANG = process.env["DEMO_LANG"] ?? "en";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: LANG === "nb" ? "nb-NO" : "en-GB",
  recordVideo: { dir: out, size: { width: 1440, height: 900 } },
  reducedMotion: "no-preference",
});
const page = await context.newPage();
const started = Date.now();
const stops: Array<{ name: string; at: number }> = [];
let n = 0;
async function stop(name: string, ms = 2500) {
  n += 1;
  // The stop begins when the page is on screen, before the pause.
  stops.push({ name, at: (Date.now() - started) / 1000 });
  await pause(ms);
  await page.screenshot({ path: join(out, `${String(n).padStart(2, "0")}-${LANG}-${name}.png`) });
}

// 1. Landing: the idea in one screen.
await page.goto(`${WEB}/`);
await page.waitForLoadState("networkidle");
await stop("landing", 3000);
await page.mouse.wheel(0, 700);
await stop("landing-scrolled");

// 2. Sign in as an editor (the sign-in tab; no age fields on sign-in).
await page.goto(`${WEB}/auth`);
await page.waitForLoadState("networkidle");
await stop("auth", 1500);
await page
  .getByLabel(/e-?post|email/i)
  .first()
  .fill(EMAIL);
await page
  .getByLabel(/passord|password/i)
  .first()
  .fill(PASSWORD);
await pause(600);
await page
  .getByRole("button", { name: /logg inn|sign in/i })
  .first()
  .click();
await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15_000 });
await page.waitForLoadState("networkidle");
await stop("signed-in");

// 3. Editor overview: the queue that stands between a draft and a learner.
await page.goto(`${WEB}/edit`);
await page.waitForLoadState("networkidle");
await page.getByTestId("editor-queue").waitFor();
await stop("edit-overview", 3500);
await page.mouse.wheel(0, 500);
await stop("edit-overview-scrolled");

// 4. Content grid: the real lexicon, every row with a status.
await page.goto(`${WEB}/edit/content`);
await page.waitForLoadState("networkidle");
await stop("edit-content", 3500);

// 5. One lexeme: glosses per source language, audio, the status machine.
const firstRow = page.locator('a[href^="/edit/lexemes/"]').first();
if (await firstRow.count()) {
  await firstRow.click();
  await page.waitForLoadState("networkidle");
  await stop("edit-lexeme", 3500);
  await page.mouse.wheel(0, 600);
  await stop("edit-lexeme-scrolled");
}

// 6. Review queue: four eyes before publish.
await page.goto(`${WEB}/edit/review`);
await page.waitForLoadState("networkidle");
await stop("edit-review", 3000);

// 7. Goldens: the morphology engine's contract with a native speaker.
await page.goto(`${WEB}/edit/goldens`);
await page.waitForLoadState("networkidle");
await stop("edit-goldens", 3000);

// 8. The lexicon data package page: CC BY-SA, back to the community.
await page.goto(`${WEB}/lexicon`);
await page.waitForLoadState("networkidle");
await stop("lexicon", 3000);

const video = page.video();
await context.close();
// The file is complete only after the context has closed; then it can be renamed.
if (video) await video.saveAs(join(out, `web-${LANG}.webm`));
if (video) await video.delete();
await browser.close();
writeFileSync(
  join(out, `web-${LANG}.stops.json`),
  JSON.stringify({ lang: LANG, seconds: (Date.now() - started) / 1000, stops }, null, 2),
);
console.log(`recorded ${n} stops into ${out}`);

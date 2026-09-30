/**
 * Renders every piece of Molo artwork with Chromium (Playwright, already a
 * web dev dependency) so the type is the real Fredoka and Nunito rather than
 * a fallback. Run from the repo root: `bun packages/brand/presskit/render.ts`.
 *
 * Outputs:
 *   png/            press kit: logos, app icon, social cards
 *   store/          what Apple and Google ask for at submission
 *   web/            favicons, touch icons and the web manifest
 *
 * Screenshots: drop device captures named 1.png to 4.png into
 * `presskit/screenshots/` and they are framed with a caption; without them
 * the frames are skipped rather than shipped empty.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "png");
const storeOut = join(here, "store");
const webOut = join(here, "web");
for (const d of [out, storeOut, webOut]) mkdirSync(d, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

// Social templates from the HTML file, one element each.
await page.setViewportSize({ width: 1600, height: 2000 });
await page.goto(pathToFileURL(join(here, "src", "social.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
for (const id of ["og", "square", "story", "header"]) {
  const el = page.locator(`#${id}`);
  await el.screenshot({ path: join(out, `social-${id}.png`) });
  console.log(`social-${id}.png`);
}

// ---------------------------------------------------------------------------
// Store and web icons. Apple wants 1024 square with no alpha; Google wants
// 512 square with alpha; the web wants a ladder of sizes plus a maskable one.
// ---------------------------------------------------------------------------

const icons: ReadonlyArray<{ mark: string; file: string; size: number; dir: string }> = [
  // Apple rounds the icon itself, so ours is a full-bleed square with no alpha.
  { mark: "mark-1024", file: "ios-app-icon-1024.png", size: 1024, dir: storeOut },
  { mark: "mark-512", file: "play-icon-512.png", size: 512, dir: storeOut },
  { mark: "mark-1024", file: "app-icon-1024.png", size: 1024, dir: webOut },
  { mark: "mark-256", file: "favicon-16.png", size: 16, dir: webOut },
  { mark: "mark-256", file: "favicon-32.png", size: 32, dir: webOut },
  { mark: "mark-256", file: "favicon-48.png", size: 48, dir: webOut },
  { mark: "mark-256", file: "apple-touch-icon-180.png", size: 180, dir: webOut },
  { mark: "mark-512", file: "icon-192.png", size: 192, dir: webOut },
  { mark: "mark-512", file: "icon-512.png", size: 512, dir: webOut },
  { mark: "mark-maskable", file: "maskable-512.png", size: 512, dir: webOut },
];

// ---------------------------------------------------------------------------
// Store artwork: the Play feature graphic, a square listing tile, and framed
// screenshots when captures are present.
// ---------------------------------------------------------------------------

await page.setViewportSize({ width: 1400, height: 3000 });
await page.goto(pathToFileURL(join(here, "src", "store.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

// The icons: one drawing, rendered at each size a store or a browser wants,
// so a 16px favicon can never drift from the 1024 App Store icon. Playwright
// scales by the device pixel ratio, which keeps the type crisp at every size.
for (const icon of icons) {
  const sourceSize = Number(icon.mark.split("-")[1]) || icon.size;
  const scaled = await browser.newContext({ deviceScaleFactor: icon.size / sourceSize });
  const iconPage = await scaled.newPage();
  await iconPage.setViewportSize({ width: sourceSize + 40, height: sourceSize + 40 });
  await iconPage.goto(pathToFileURL(join(here, "src", "store.html")).href);
  await iconPage.evaluate(() => document.fonts.ready);
  await iconPage.locator(`#${icon.mark}`).screenshot({ path: join(icon.dir, icon.file) });
  await scaled.close();
  console.log(`${icon.file} ${icon.size}x${icon.size}`);
}

for (const [id, file] of [
  ["feature", "play-feature-graphic-1024x500.png"],
  ["tile", "listing-tile-1024.png"],
] as const) {
  await page.locator(`#${id}`).screenshot({ path: join(storeOut, file) });
  console.log(file);
}

// Logos, from the same HTML as the icons so the letter and the mark match.
for (const [id, file, transparent] of [
  ["mark-1024", "logo-mark.png", false],
  ["wordmark", "logo-wordmark.png", true],
  ["wordmark-light", "logo-wordmark-light.png", true],
  ["mark-1024", "app-icon.png", false],
] as const) {
  await page.locator(`#${id}`).screenshot({ path: join(out, file), omitBackground: transparent });
  console.log(file);
}

const shots = join(here, "screenshots");
for (const n of [1, 2, 3, 4]) {
  const capture = join(shots, `${n}.png`);
  if (!existsSync(capture)) {
    console.log(`screenshot ${n}: no capture in presskit/screenshots, skipped`);
    continue;
  }
  await page.evaluate(
    ({ index, href }) => {
      const img = document.querySelector(`#img-${index}`) as HTMLImageElement | null;
      if (img) img.src = href;
    },
    { index: n, href: pathToFileURL(capture).href },
  );
  await page.waitForTimeout(200);
  const file = `screenshot-${n}-1284x2778.png`;
  await page.locator(`#frame-${n}`).screenshot({ path: join(storeOut, file) });
  console.log(file);
}

writeFileSync(
  join(webOut, "site.webmanifest"),
  JSON.stringify(
    {
      name: "Molo",
      short_name: "Molo",
      description: "Learn isiXhosa the way it sounds.",
      start_url: "/",
      display: "standalone",
      background_color: "#FFF7E8",
      theme_color: "#26264F",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log("site.webmanifest");

await browser.close();

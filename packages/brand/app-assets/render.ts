/**
 * Renders the mobile app's launcher, splash and notification images from the
 * brand SVGs, with Chromium (Playwright, already a dependency of this
 * package — nothing new was added for this). Run from the repo root:
 *
 *   bun packages/brand/app-assets/render.ts
 *
 * Output goes straight into apps/mobile/assets, which app.json points at.
 * The files are committed, because an Expo build must not depend on a
 * browser being installed; this script exists so they can be regenerated
 * when the artwork changes rather than being redrawn by hand.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const brand = join(here, "..");
const out = join(brand, "../../apps/mobile/assets");
mkdirSync(out, { recursive: true });

interface Asset {
  /** File written into apps/mobile/assets. */
  readonly name: string;
  /** Source SVG, absolute. */
  readonly src: string;
  readonly width: number;
  readonly height: number;
  /**
   * Keep the SVG's own transparency. The iOS launcher icon must be opaque
   * (Apple rejects alpha), the other three are drawn over a colour declared
   * in app.json.
   */
  readonly transparent: boolean;
}

const assets: readonly Asset[] = [
  // The launcher icon on iOS, and the fallback icon on Android: the whole
  // scene, edge to edge, no alpha.
  {
    name: "icon.png",
    src: join(here, "src/icon.svg"),
    width: 1024,
    height: 1024,
    transparent: false,
  },
  // Android adaptive foreground: the launcher masks it, so it is transparent
  // and everything lives inside the safe circle.
  {
    name: "adaptive-icon.png",
    src: join(here, "src/adaptive-foreground.svg"),
    width: 1024,
    height: 1024,
    transparent: true,
  },
  // The native splash image, over sand.
  {
    name: "splash.png",
    src: join(here, "src/splash.svg"),
    width: 1024,
    height: 1024,
    transparent: true,
  },
  // Android status bar: a white silhouette Android tints itself.
  {
    name: "notification-icon.png",
    src: join(here, "src/notification-icon.svg"),
    width: 96,
    height: 96,
    transparent: true,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const a of assets) {
  await page.setViewportSize({ width: a.width, height: a.height });
  await page.goto(pathToFileURL(a.src).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, a.name), omitBackground: a.transparent });
  console.log(`${a.name} ${a.width}x${a.height}${a.transparent ? " (alpha)" : ""}`);
}
await browser.close();

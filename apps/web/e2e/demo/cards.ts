/**
 * Renders the demo video's cards and captions (cards.json) to PNGs for cut.sh
 * to overlay: `bun apps/web/e2e/demo/cards.ts`. The title, placeholder and
 * outro are full 1920×1080 frames; the phone captions and the web caption
 * band are transparent overlays. Playwright draws them so the video gets the
 * app's own faces (Fredoka, Nunito) and real line wrapping; the ffmpeg on a
 * laptop does not necessarily ship drawtext.
 *
 * Output: apps/web/e2e/demo/out/cards/<id>.png (gitignored).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out", "cards");
mkdirSync(out, { recursive: true });

interface Cards {
  title: { heading: string; line: string; sub: string };
  phone: Array<{ id: string; heading: string; body: string }>;
  placeholder: { label: string; heading: string; line: string; sub: string };
  web: Array<{ id: string; text: string }>;
  outro: { heading: string; line: string; sub: string };
}
const cards = JSON.parse(readFileSync(join(here, "cards.json"), "utf8")) as Cards;

// The web app's own font packages, embedded so the page needs no server.
const require = createRequire(import.meta.url);
function fontFace(family: string, pkg: string, file: string): string {
  const path = join(dirname(require.resolve(`${pkg}/package.json`)), "files", file);
  const data = readFileSync(path).toString("base64");
  return `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${data}) format("woff2");font-weight:300 900}`;
}
const fonts =
  fontFace("Fredoka", "@fontsource-variable/fredoka", "fredoka-latin-wght-normal.woff2") +
  fontFace("Nunito", "@fontsource-variable/nunito", "nunito-latin-wght-normal.woff2");

// The palette from apps/mobile/tailwind.config.js.
const css = `
${fonts}
html,body{margin:0;width:1920px;height:1080px;background:transparent}
.frame{width:1920px;height:1080px;position:relative;font-family:Nunito,sans-serif;color:#FFF7E8}
.opaque{background:#26264F}
.display{font-family:Fredoka,sans-serif;font-weight:700;color:#F6B73C;letter-spacing:-0.01em;text-wrap:balance}
.centre{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:32px;padding:0 200px}
.centre .display{font-size:200px;line-height:1}
.centre .line{font-size:60px;font-weight:600}
.centre .sub{font-size:38px;opacity:.85;max-width:1300px}
.centre .label{font-size:34px;font-weight:700;color:#E85D5D;text-transform:uppercase;letter-spacing:.06em}
.centre.small .display{font-size:80px;line-height:1.1}
.centre.small .line{font-size:46px}
.beside{position:absolute;left:880px;top:380px;width:900px;display:flex;flex-direction:column;gap:28px}
.beside .display{font-size:64px;line-height:1.1}
.beside .body{font-size:40px;line-height:1.35;font-weight:600}
.band{position:absolute;left:0;right:0;bottom:0;height:120px;background:rgba(38,38,79,.92);display:flex;align-items:center;justify-content:center;padding:0 120px;text-align:center}
.band .text{font-size:40px;font-weight:600;line-height:1.25}
.outro .display{font-size:120px}
`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const pages: Array<{ id: string; html: string }> = [
  {
    id: "title",
    html: `<div class="frame opaque"><div class="centre">
      <div class="display">${esc(cards.title.heading)}</div>
      <div class="line">${esc(cards.title.line)}</div>
      <div class="sub">${esc(cards.title.sub)}</div></div></div>`,
  },
  ...cards.phone.map((c) => ({
    id: c.id,
    html: `<div class="frame"><div class="beside">
      <div class="display">${esc(c.heading)}</div>
      <div class="body">${esc(c.body)}</div></div></div>`,
  })),
  {
    id: "placeholder",
    html: `<div class="frame opaque"><div class="centre small">
      <div class="label">${esc(cards.placeholder.label)}</div>
      <div class="display">${esc(cards.placeholder.heading)}</div>
      <div class="line">${esc(cards.placeholder.line)}</div>
      <div class="sub">${esc(cards.placeholder.sub)}</div></div></div>`,
  },
  ...cards.web.map((c) => ({
    id: c.id,
    html: `<div class="frame"><div class="band"><div class="text">${esc(c.text)}</div></div></div>`,
  })),
  {
    id: "outro",
    html: `<div class="frame opaque"><div class="centre outro">
      <div class="display">${esc(cards.outro.heading)}</div>
      <div class="line">${esc(cards.outro.line)}</div>
      <div class="sub">${esc(cards.outro.sub)}</div></div></div>`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
for (const { id, html } of pages) {
  await page.setContent(
    `<!doctype html><html><head><style>${css}</style></head><body>${html}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, `${id}.png`), omitBackground: true });
}
await browser.close();
writeFileSync(join(out, "index.json"), JSON.stringify(pages.map((p) => p.id)));
console.log(`rendered ${pages.length} cards into ${out}`);

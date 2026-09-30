import { expect, test, type Page } from "@playwright/test";

import { E2E, grantEditorRole } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_API, E2E_DATABASE_URL } from "../playwright.config.ts";
import { fill, signUpLearner, t } from "./helpers.ts";

/** A short mono 16-bit WAV of a quiet tone: a stand-in for a tutor's own recording. */
function wav(seconds = 0.4, rate = 16_000): Buffer {
  const n = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 8000), 44 + i * 2);
  return buf;
}

async function openStudio(page: Page) {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  await page.goto("/edit/studio");
  await expect(page.getByRole("heading", { name: t.edit.studio.title })).toBeVisible();
  const speaker = page.getByLabel(t.edit.recorder.speaker);
  await expect(speaker.locator("option", { hasText: "Fixture Speaker" })).toHaveCount(1);
  const value = await speaker
    .locator("option", { hasText: "Fixture Speaker" })
    .getAttribute("value");
  await speaker.selectOption(value!);
}

/** Uploads are answered here, so the spec needs neither R2 nor the audio queue. */
async function captureUploads(page: Page) {
  const uploads: string[] = [];
  await page.route(`${E2E_API}/edit/audio`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    uploads.push(route.request().postData() ?? "");
    return route.fulfill({
      status: 202,
      json: { jobId: crypto.randomUUID(), uploadKey: "incoming/zz", queued: true },
    });
  });
  return uploads;
}

test("the unit menu numbers units in course order", async ({ page }) => {
  await openStudio(page);
  const options = await page.getByLabel(t.edit.studio.unit).locator("option").allTextContents();
  const named = options.slice(1);
  const old = fill(t.edit.studio.unitOld, { title: "" }).trim();
  for (const [i, label] of named.filter((o) => !o.endsWith(old)).entries())
    expect(label).toMatch(new RegExp(`^${i + 1}\\. `));
});

test("a take from a file plays only when asked, and uploads as tier 1 with the speaker", async ({
  page,
}) => {
  await openStudio(page);
  const uploads = await captureUploads(page);
  await page.getByLabel(t.edit.studio.queue).selectOption("click");
  const panel = page.getByTestId("studio-panel");
  await expect(panel.getByRole("button", { name: t.edit.studio.useFile })).toBeEnabled();

  await page.getByTestId("studio-file").setInputFiles({
    name: "zz-take.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await expect(page.getByTestId("studio-file-name")).toContainText("zz-take.wav");
  const play = panel.getByRole("button", { name: t.edit.studio.play });
  await expect(play).toBeVisible();
  // Nothing plays by itself: the take waits for Play, or P.
  expect(await page.locator("audio").evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  await page.locator("body").press("p");
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime > 0 || !a.paused),
    )
    .toBe(true);

  await panel.getByRole("button", { name: t.edit.studio.upload }).click();
  await expect(page.getByText(t.edit.recorder.uploaded).first()).toBeVisible();
  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toContain("1_native_studio");
  expect(uploads[0]).toContain("00000000-0000-4000-8000-00000000f00d");
  expect(uploads[0]).toMatch(/filename="c__[^"]*__t1\.wav"/);
});

test("a saved take can be replaced later: the studio lists it, and a published one stays live meanwhile", async ({
  page,
}) => {
  await openStudio(page);
  const uploads = await captureUploads(page);
  const transitions: string[] = [];
  await page.route(`${E2E_API}/edit/transition`, (route) => {
    transitions.push(route.request().postData() ?? "");
    return route.fallback();
  });
  await page.getByLabel(t.edit.studio.queue).selectOption("lexeme");
  await page.getByLabel(t.edit.studio.onlyMissing).uncheck();
  // The fixture word with a published recording.
  await page
    .getByTestId("studio-queue")
    .getByRole("button", { name: new RegExp(E2E.lexemes.a.lemma) })
    .click();
  const existing = page.getByTestId("studio-existing");
  await expect(existing.getByText(t.edit.status.published, { exact: true })).toBeVisible();
  await existing.getByRole("button", { name: t.edit.studio.replace }).first().click();
  await expect(page.getByTestId("studio-replacing")).toContainText(
    fill(t.edit.studio.replacingPublished, { speaker: "Fixture Speaker" }),
  );
  await page.getByTestId("studio-file").setInputFiles({
    name: "zz-new-take.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await page
    .getByTestId("studio-panel")
    .getByRole("button", { name: t.edit.studio.upload })
    .click();
  await expect(page.getByText(t.edit.recorder.uploaded).first()).toBeVisible();
  expect(uploads).toHaveLength(1);
  // A published take is not pulled: it stays until the new one is approved.
  expect(transitions).toEqual([]);
});

test("several files are matched to the queue by name and confirmed before anything uploads", async ({
  page,
}) => {
  await openStudio(page);
  const uploads = await captureUploads(page);
  await page.getByLabel(t.edit.studio.queue).selectOption("click");
  await page.getByRole("button", { name: t.edit.studio.bulk.open }).click();
  const dialog = page.getByTestId("studio-bulk");
  await expect(dialog.getByRole("heading", { name: t.edit.studio.bulk.title })).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: "XH.wav", mimeType: "audio/wav", buffer: wav() },
    { name: "zz-nothing.wav", mimeType: "audio/wav", buffer: wav() },
  ]);
  await expect(dialog.getByTestId("bulk-matched")).toContainText("XH.wav");
  await expect(dialog.getByTestId("bulk-unmatched")).toContainText("zz-nothing.wav");
  // Nothing has left the browser yet.
  expect(uploads).toHaveLength(0);
  await dialog.getByRole("button", { name: fill(t.edit.studio.bulk.upload, { count: 1 }) }).click();
  await expect(page.getByText(fill(t.edit.studio.bulk.done, { count: 1 }))).toBeVisible();
  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toMatch(/filename="xh__[^"]*__t1\.wav"/);
});

test("skipping the last words ends the list with a way on to the clicks, and remembers the skips", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByLabel(t.edit.studio.queue).selectOption("lexeme");
  const panel = page.getByTestId("studio-panel");
  const list = page.getByTestId("studio-queue").getByRole("listitem");
  await expect(list.first()).toBeVisible();
  const total = await list.count();

  const done = page.getByTestId("studio-list-done");
  for (let n = 0; n < total; n++) {
    await expect(done).toHaveCount(0);
    await panel.getByRole("button", { name: t.edit.studio.skip, exact: true }).click();
    await panel.getByRole("button", { name: t.edit.studio.skipNote.skipOnly }).click();
  }
  await expect(done).toContainText(fill(t.edit.studio.listDone.skipped, { count: total }));
  await expect(list.first()).toContainText(t.edit.studio.skipped);

  // A reload keeps the skips: the list opens already done.
  await page.reload();
  await expect(page.getByTestId("studio-list-done")).toBeVisible();

  await page.getByRole("button", { name: t.edit.studio.listDone.clicks }).click();
  await expect(page.getByLabel(t.edit.studio.queue)).toHaveValue("click");
  await expect(page.getByTestId("studio-list-done")).toHaveCount(0);
});

test("a skip can carry a note, which the editor landing page lists with a link to the word", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByLabel(t.edit.studio.queue).selectOption("lexeme");
  const panel = page.getByTestId("studio-panel");
  const word = (await panel.getByRole("heading", { level: 2 }).textContent())?.trim() ?? "";
  expect(word).not.toBe("");

  // The word's own page is one click away, in a new tab.
  const edit = panel.getByRole("link", { name: t.edit.studio.editWord });
  await expect(edit).toHaveAttribute("href", /\/edit\/lexemes\//);
  await expect(edit).toHaveAttribute("target", "_blank");

  await panel.getByRole("button", { name: t.edit.studio.skip, exact: true }).click();
  const form = page.getByTestId("studio-skip-note");
  await form.getByLabel(t.edit.studio.skipNote.label).fill("The gloss is wrong; missing prefix");
  await form.getByRole("button", { name: t.edit.studio.skipNote.sendAndSkip }).click();
  await expect(page.getByText(t.edit.studio.skipNote.sent)).toBeVisible();
  await expect(form).toHaveCount(0);

  await page.goto("/edit");
  const notes = page.getByTestId("queue-notes");
  await expect(notes).toContainText("The gloss is wrong; missing prefix");
  await expect(notes.getByRole("link", { name: new RegExp(word) })).toHaveAttribute(
    "href",
    /\/edit\/lexemes\//,
  );
});

import { expect, test } from "@playwright/test";

import { E2E, grantEditorRole } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_API, E2E_DATABASE_URL } from "../playwright.config.ts";
import { fill, signUpLearner, t } from "./helpers.ts";

test("learners have no preview switch and cannot read a preview endpoint", async ({ page }) => {
  await signUpLearner(page);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: t.settings.title })).toBeVisible();
  await expect(page.getByRole("switch", { name: t.preview.switch })).toHaveCount(0);
  for (const path of ["/path", "/units", "/units/zz-preview"]) {
    const response = await page.request.get(`${E2E_API}/edit/preview${path}`);
    expect(response.status()).toBe(403);
  }
});

test("an editor previews a draft without progress writes and returns to published content", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  await page.reload();
  const me = await (await page.request.get(`${E2E_API}/me`)).json();
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`${E2E_API}/edit/${path}`, { data });
    expect(response.status()).toBe(201);
    return (await response.json()).id as string;
  };
  const slug = `zz-preview-${Date.now()}`;
  const unitId = await post("units", {
    courseId: me.course.id,
    slug,
    titleKey: "units.unit1.title",
    order: 90,
    cefrBand: "A1",
  });
  const skillId = await post("skills", {
    unitId,
    slug: `${slug}-skill`,
    titleKey: "units.unit1.title",
    order: 1,
    kind: "vocab",
  });
  const lessonId = await post("lessons", { skillId, order: 1 });
  const lexemes = (await (await page.request.get(`${E2E_API}/edit/lexemes?q=zz-lex`)).json())
    .lexemes as Array<{ id: string; lemma: string }>;
  const draftId = lexemes.find((row) => row.lemma === E2E.lexemes.draft.lemma)!.id;
  const publishedId = lexemes.find((row) => row.lemma === E2E.lexemes.a.lemma)!.id;
  await post("exercises", {
    lessonId,
    order: 1,
    type: "listen_select",
    payload: {
      type: "listen_select",
      prompt: { lexemeId: draftId },
      options: [
        { lexemeId: draftId, correct: true },
        { lexemeId: publishedId, correct: false },
      ],
    },
  });

  await page.goto("/settings");
  await page.getByRole("switch", { name: t.preview.switch }).check();
  await expect(page).toHaveURL(/\/preview$/);
  await expect(page.getByText(t.preview.banner)).toBeVisible();
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(E2E_API) && !["GET", "HEAD", "OPTIONS"].includes(request.method()))
      writes.push(request.url());
  });
  const card = page.getByTestId(`preview-unit-${slug}`);
  await expect(card.getByText(t.edit.status.draft)).toBeVisible();
  await card.getByRole("button", { name: t.preview.open }).click();
  await page
    .getByRole("button", { name: fill(t.preview.lesson, { number: 1 }), exact: true })
    .click();
  await expect(
    page.getByText(fill(t.preview.missingAudio, { content: E2E.lexemes.draft.lemma })),
  ).toBeVisible();
  await expect(page.getByText(t.edit.status.draft, { exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: E2E.lexemes.draft.en, exact: true }).click();
  await page.getByRole("button", { name: t.lesson.check, exact: true }).click();
  await page.getByRole("button", { name: t.lesson.continue, exact: true }).click();
  await expect(page.getByText(t.preview.finished)).toBeVisible();
  await page.context().setOffline(true);
  await expect(page.getByText(t.preview.connection)).toBeVisible();
  await expect(page.getByText(t.preview.banner)).toBeVisible();
  await page.context().setOffline(false);
  // Preview has no offline progress; reconnecting starts the exercise again.
  await expect(
    page.getByText(fill(t.preview.missingAudio, { content: E2E.lexemes.draft.lemma })),
  ).toBeVisible();
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: t.preview.exit }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByText(t.preview.banner)).toHaveCount(0);
  const published = await page.request.get(`${E2E_API}/units?preview=1`, {
    headers: { "X-Molo-Preview": "1" },
  });
  expect(await published.text()).not.toContain(unitId);
});

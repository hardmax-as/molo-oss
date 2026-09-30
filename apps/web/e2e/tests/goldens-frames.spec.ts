import { expect, test } from "@playwright/test";

import sheet from "../../../../packages/testkit/golden/cases.json" with { type: "json" };
import { grantEditorRole } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_API, E2E_DATABASE_URL } from "../playwright.config.ts";
import { signUpLearner, t } from "./helpers.ts";

const CONCORD = new Set(["subject_concord", "object_concord", "possessive"]);

test("with the frames parked, the tutor sees no concord card, only what is coming and why", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  await page.goto("/edit/goldens");
  const parked = page.getByTestId("goldens-frames-parked");
  await expect(
    parked.getByRole("heading", { name: t.edit.goldens.frames.parkedTitle }),
  ).toBeVisible();
  await expect(page.locator("fieldset[data-golden]")).toHaveCount(
    sheet.case.filter((c) => !CONCORD.has(c.form)).length,
  );
  await expect(page.getByTestId("golden-frame")).toHaveCount(0);
  // An editor cannot switch them on from the address bar.
  await page.goto("/edit/goldens?frames=preview");
  await expect(page.getByTestId("goldens-frames-parked")).toBeVisible();
  await expect(page.getByTestId("goldens-frames-preview")).toHaveCount(0);
  // Agreement is explained by example, never as a pronoun.
  await page.getByText(t.edit.goldens.frames.exampleTitle).click();
  await expect(parked).toContainText("The trees are falling");
  await expect(page.locator("body")).not.toContainText("“he”");
});

test("an admin preview: she writes the sentence, marks the part, and only her confirmation sets the answer", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email, "admin");
  await page.goto("/edit/goldens?frames=preview");
  await expect(page.getByTestId("goldens-frames-preview")).toBeVisible();

  const target = sheet.case.find((c) => c.form === "subject_concord" && c.class === "3")!;
  const row = page.locator(
    `fieldset[data-golden="${JSON.stringify([target.lemma, target.class, target.form]).replaceAll('"', '\\"')}"]`,
  );
  const frame = row.getByTestId("golden-frame");
  await expect(frame).toContainText("is falling");

  // Placeholder text: the test writes no isiXhosa.
  const box = frame.getByLabel(t.edit.goldens.frames.sentenceLabel);
  await box.fill("zz ab cd");
  // A selection across a space is refused, not turned into an answer.
  await box.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 5));
  await frame.getByRole("button", { name: t.edit.goldens.frames.mark }).click();
  await expect(frame.getByRole("alert")).toHaveText(t.edit.goldens.frames.markSpace);
  await expect(frame.getByRole("status")).toHaveCount(0);
  // Written but not used: a reload keeps the sentence.
  await page.reload();
  await expect(box).toHaveValue("zz ab cd");
  await box.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(3, 5));
  await frame.getByRole("button", { name: t.edit.goldens.frames.mark }).click();
  const status = frame.getByRole("status");
  await expect(status).toContainText("ab");
  await expect(status).toContainText("ab-");
  // Nothing saved yet: marking is not confirming.
  await expect(row.getByTestId("golden-frame-saved")).toHaveCount(0);

  const put = page.waitForResponse(
    (r) => r.url().endsWith("/edit/goldens") && r.request().method() === "PUT" && r.ok(),
  );
  await frame.getByRole("button", { name: t.edit.goldens.frames.use }).click();
  await put;
  await expect(row.getByTestId("golden-frame-saved")).toContainText("ab-");
  const res = await page.request.get(`${E2E_API}/edit/goldens`);
  const { answers } = (await res.json()) as {
    answers: { caseId: string; form: string; notes: string }[];
  };
  const saved = answers.find(
    (a) => a.caseId === JSON.stringify([target.lemma, target.class, target.form]),
  );
  expect(saved?.form).toBe("ab-");
  expect(saved?.notes).toContain("Sentence: zz ab cd (agreement: ab)");
});

import { expect, test } from "@playwright/test";

import { grantEditorRole } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_DATABASE_URL } from "../playwright.config.ts";
import { signUpLearner, t } from "./helpers.ts";

/**
 * The tutor could not find the note behind Skip. Every studio item, a word,
 * a sentence or a bare click, recorded or not, has a Note button; the note
 * goes to POST /edit/notes and shows on Today, and the item stays on screen.
 */
test("a note on a click and on a word, from the Note button, reaches Today without skipping", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);

  await page.goto("/edit/studio?kind=click");
  const panel = page.getByTestId("studio-panel");
  const heading = panel.getByRole("heading", { level: 2 });
  await expect(heading).toBeVisible();
  // Not the first click, so the jump back from Today has something to prove.
  const first = (await heading.textContent())!.trim();
  await panel.getByRole("button", { name: t.edit.studio.next }).click();
  await expect(heading).not.toHaveText(first);
  const click = (await heading.textContent())!.trim();
  const position = await panel
    .getByText(/\d+ \/ \d+|\d+ of \d+/)
    .first()
    .textContent();

  await panel.getByTestId("studio-note-open").click();
  const form = panel.getByTestId("studio-note");
  await expect(form).toBeVisible();
  const send = form.getByRole("button", { name: t.edit.studio.note.send });
  await expect(send).toBeDisabled();
  await form
    .getByRole("textbox", { name: t.edit.studio.note.label })
    .fill("zz the take sounds aspirated");
  const posted = page.waitForResponse(
    (r) => r.url().endsWith("/edit/notes") && r.request().method() === "POST",
  );
  await send.click();
  expect((await posted).ok()).toBe(true);
  await expect(page.getByText(t.edit.studio.skipNote.sent)).toBeVisible();
  await expect(form).toBeHidden();
  // Not skipped: the same click is still the one on screen.
  await expect(heading).toHaveText(click);
  await expect(panel.getByText(position!).first()).toBeVisible();

  await page.goto("/edit/studio?kind=lexeme");
  const word = (await heading.textContent())!.trim();
  await panel.getByTestId("studio-note-open").click();
  await panel
    .getByTestId("studio-note")
    .getByRole("textbox", { name: t.edit.studio.note.label })
    .fill("zz the gloss reads oddly");
  await panel
    .getByTestId("studio-note")
    .getByRole("button", { name: t.edit.studio.note.send })
    .click();
  await expect(page.getByText(t.edit.studio.skipNote.sent)).toBeVisible();
  await expect(heading).toHaveText(word);

  await page.goto("/edit");
  const notes = page.getByTestId("queue-notes");
  await expect(notes.getByText("zz the take sounds aspirated")).toBeVisible();
  await expect(notes.getByText("zz the gloss reads oddly")).toBeVisible();
  await expect(notes.getByRole("link", { name: /zz the take sounds aspirated/ })).toContainText(
    click,
  );
  // A click has no page of its own: its note opens that click in the studio.
  await notes.getByRole("link", { name: /zz the take sounds aspirated/ }).click();
  await expect(page).toHaveURL(/\/edit\/studio\?.*kind=click/);
  await expect(heading).toHaveText(click);
  await expect(heading).not.toHaveText(first);
});

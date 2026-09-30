import { goldenOtherClass } from "@molo/core";
import { expect, test, type Page } from "@playwright/test";

import sheet from "../../../../packages/testkit/golden/cases.json" with { type: "json" };
import { grantEditorRole } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_API, E2E_DATABASE_URL } from "../playwright.config.ts";
import { fill, signUpLearner, t } from "./helpers.ts";

/**
 * An empty card no test here answers: the W07 test checks that the session
 * name reaches it, and the first test that it stays empty.
 */
const untouched = sheet.case.find(
  (c) => c.form === "locative" && c.lemma === "umthi" && c.expected === "",
)!;
const cardOf = (page: Page, c: { lemma: string; class: string; form: string }) =>
  page.locator(
    `fieldset[data-golden="${JSON.stringify([c.lemma, c.class, c.form]).replaceAll('"', '\\"')}"]`,
  );

test("the tutor sheet reveals no engine verdict until input and an explicit check, and saves each card to the server", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  // A card nobody has answered yet, past the three singular cards the
  // plural-of-a-plural test uses.
  const first = sheet.case.filter((c) => c.form === "singular")[3]!;
  expect(first.expected).toBe("");
  const calls: string[] = [];
  await page.route(`${E2E_API}/edit/lexemes?*`, (route) => {
    calls.push("lookup");
    return route.fulfill({
      json: {
        lexemes: [{ id: "zz-golden-id", lemma: first.lemma, nounClass: first.class }],
        limit: 200,
        offset: 0,
      },
    });
  });
  await page.route(`${E2E_API}/edit/lexemes/zz-golden-id/morph`, (route) => {
    calls.push("morph");
    return route.fulfill({
      json: {
        applicable: true,
        lemma: first.lemma,
        nounClass: first.class,
        validated: false,
        forms: [{ form: first.form, surface: "zz-tutor", error: null }],
      },
    });
  });
  await page.goto("/edit/goldens");
  await expect(page.getByRole("heading", { name: t.edit.goldens.title })).toBeVisible();
  // The plain-words box a tutor working alone reads first.
  await expect(page.getByTestId("goldens-how")).toContainText(t.edit.goldens.how1);
  // One card per asked case (the concord cards wait for the sentence frames);
  // the session fieldset (tutor and date) is not a case.
  await expect(page.locator("fieldset[data-golden]")).toHaveCount(
    sheet.case.filter((c) => ["plural", "singular", "locative"].includes(c.form)).length,
  );
  const row = page.getByRole("group", {
    name: new RegExp(`^${first.lemma} · ${t.edit.goldens.forms.singular}`),
  });
  // The card shows its side of the class pair and asks for the other.
  await expect(row.getByTestId("golden-pair")).toHaveText(
    fill(t.edit.goldens.pairAsk, { cls: first.class, other: goldenOtherClass(first.class) }),
  );
  const expected = row.getByLabel(t.edit.goldens.expected);
  const check = row.getByRole("button", { name: t.edit.goldens.check });
  await expect(expected).toBeEnabled();
  await expect(expected).toHaveValue("");
  await expect(check).toBeDisabled();
  expect(calls).toEqual([]);
  await expected.fill("zz-tutor");
  await expect(check).toBeEnabled();
  expect(calls).toEqual([]);
  await check.click();
  await expect(row.getByRole("status")).toHaveText(t.edit.goldens.agrees);
  expect(calls).toEqual(["lookup", "morph"]);
  await expected.fill("zz-tutor-correction");
  await expect(row.getByRole("status")).toHaveCount(0);
  await check.click();
  await expect(row.getByRole("status")).toHaveText(t.edit.goldens.differs);
  await row.getByLabel(t.edit.goldens.validatedBy).fill("Test tutor");
  await row.getByLabel(t.edit.goldens.validatedOn).fill("2026-09-21");
  await row.getByLabel(t.edit.goldens.irregular).check();
  // Leaving the card saves it, and the card says so.
  await page.getByRole("heading", { name: t.edit.goldens.title }).click();
  await expect(row.getByTestId("golden-state")).toHaveText(t.edit.goldens.state.saved);
  await expect(page.getByTestId("goldens-saved")).toHaveText(t.edit.goldens.savedServer);

  // On the server, attributed to the signed-in editor.
  const res = await page.request.get(`${E2E_API}/edit/goldens`);
  expect(res.ok()).toBe(true);
  const { answers } = (await res.json()) as {
    answers: { caseId: string; form: string; tutorName: string; irregular: boolean }[];
  };
  expect(
    answers.find((a) => a.caseId === JSON.stringify([first.lemma, first.class, first.form])),
  ).toMatchObject({ form: "zz-tutor-correction", tutorName: "Test tutor", irregular: true });

  // Not a browser-only draft: another browser (no local storage) sees it.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(row.getByLabel(t.edit.goldens.expected)).toHaveValue("zz-tutor-correction");
  // Another card stays empty.
  await expect(cardOf(page, untouched).getByLabel(t.edit.goldens.expected)).toHaveValue("");
  // The TOML is the operator's, pulled from the server; an editor sees no download.
  await expect(page.getByRole("link", { name: t.edit.goldens.export })).toHaveCount(0);
});

test("a card that cannot reach the server says so, keeps the answer, and sends it again", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  await page.goto("/edit/goldens");
  // utata: a card no other test here answers (they share one database).
  const card = page.locator(`fieldset[data-golden='${JSON.stringify(["utata", "1a", "plural"])}']`);
  await expect(card.getByLabel(t.edit.goldens.expected)).toBeEnabled();
  let fail = true;
  await page.route(`${E2E_API}/edit/goldens`, (route) =>
    route.request().method() === "PUT" && fail ? route.abort() : route.fallback(),
  );
  await card.getByLabel(t.edit.goldens.expected).fill("zz-offline-answer");
  await page.getByRole("heading", { name: t.edit.goldens.title }).click();
  await expect(card.getByTestId("golden-state")).toHaveText(t.edit.goldens.state.error);
  await expect(card.getByRole("button", { name: t.edit.goldens.state.retry })).toBeVisible();
  // Kept in this browser meanwhile: a reload does not lose it, and a card
  // still waiting is sent again as the page loads.
  fail = false;
  await page.reload();
  await expect(card.getByLabel(t.edit.goldens.expected)).toHaveValue("zz-offline-answer");
  await expect(card.getByTestId("golden-state")).toHaveText(t.edit.goldens.state.saved);
});

test("the sheet takes the tutor once, jumps by class and to the next unfinished case (W07)", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  await page.goto("/edit/goldens");
  await expect(page.getByRole("heading", { name: t.edit.goldens.title })).toBeVisible();
  const bar = page.getByTestId("goldens-bar");
  await expect(bar.getByTestId("goldens-saved")).toHaveText(t.edit.goldens.savedServer);

  // Entered once at the top, the name reaches every card, and stays editable per card.
  const cards = page.locator("fieldset[data-golden]");
  await expect(cards.last().getByLabel(t.edit.goldens.validatedBy)).toBeEnabled();
  await page.getByLabel(t.edit.goldens.tutorAll).fill("Other tutor");
  await expect(cards.last().getByLabel(t.edit.goldens.validatedBy)).toHaveValue("Other tutor");
  await cards.last().getByLabel(t.edit.goldens.validatedBy).fill("Second tutor");
  await page.getByLabel(t.edit.goldens.tutorAll).fill("Other tutor 2");
  await expect(cardOf(page, untouched).getByLabel(t.edit.goldens.validatedBy)).toHaveValue(
    "Other tutor 2",
  );
  await expect(cards.last().getByLabel(t.edit.goldens.validatedBy)).toHaveValue("Second tutor");

  // Next unfinished lands in an empty answer field.
  await bar.getByRole("button", { name: t.edit.goldens.nextUnfinished }).click();
  await expect(page.locator("fieldset[data-golden] input:focus")).toHaveValue("");

  // The jump list reaches the last class pair.
  await page
    .getByRole("navigation", { name: t.edit.goldens.jump })
    .getByRole("link", { name: /^9\/10 ·/ })
    .click();
  await expect(page).toHaveURL(/#golden-pair-9-10$/);
  // A plural-class word asks for its singular, never for the plural of a plural.
  const plural = sheet.case.find((c) => c.class === "10" && c.form === "singular")!;
  await expect(
    page.getByRole("group", {
      name: new RegExp(`^${plural.lemma} · ${t.edit.goldens.forms.singular}`),
    }),
  ).toBeVisible();
  expect(sheet.case.some((c) => c.class === "10" && c.form === "plural")).toBe(false);
});

test("answers to the old plural-of-a-plural cards stay readable, and are never filled into a new card", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  const card = sheet.case.find((c) => c.form === "singular")!;
  // What the tutor typed on the old card for the same word, saved before the change.
  const put = await page.request.put(`${E2E_API}/edit/goldens`, {
    data: {
      caseId: JSON.stringify([card.lemma, card.class, "plural"]),
      form: "zz-old-answer",
      irregular: false,
      notes: "zz why",
      tutorName: "Test tutor",
      validatedOn: "2026-09-27",
    },
  });
  expect(put.ok()).toBe(true);

  await page.goto("/edit/goldens");
  const earlier = page.getByTestId("goldens-earlier");
  await expect(earlier.getByRole("heading", { name: t.edit.goldens.earlierTitle })).toBeVisible();
  await expect(earlier).toContainText("zz-old-answer");
  await expect(earlier).toContainText("zz why");
  const row = page.getByRole("group", {
    name: new RegExp(`^${card.lemma} · ${t.edit.goldens.forms.singular}`),
  });
  await expect(row.getByTestId("golden-old-answer")).toHaveText(
    fill(t.edit.goldens.oldCard, { form: "zz-old-answer" }),
  );
  await expect(row.getByLabel(t.edit.goldens.expected)).toHaveValue("");

  // Typed on an old card and never sent (offline, then a deploy): still sent, still shown.
  const other = sheet.case.filter((c) => c.form === "singular")[1]!;
  const oldCard = {
    ...other,
    form: "plural",
    expected: "zz-unsent",
    validated_by: "Test tutor",
    validated_on: "2026-09-27",
    note: "",
  };
  await page.evaluate(
    ([key, unsent]) =>
      window.localStorage.setItem(
        key,
        JSON.stringify({ [JSON.stringify([unsent.lemma, unsent.class, unsent.form])]: unsent }),
      ),
    ["molo.goldens.pending.v2", oldCard] as const,
  );
  const sent = page.waitForResponse(
    (r) => r.url().endsWith("/edit/goldens") && r.request().method() === "PUT" && r.ok(),
  );
  await page.reload();
  await sent;
  await expect(earlier).toContainText("zz-unsent");
  await expect(earlier.getByTestId("golden-earlier-unsent")).toHaveCount(0);
  const res = await page.request.get(`${E2E_API}/edit/goldens`);
  const { answers } = (await res.json()) as { answers: { caseId: string; form: string }[] };
  expect(
    answers.find((a) => a.caseId === JSON.stringify([other.lemma, other.class, "plural"]))?.form,
  ).toBe("zz-unsent");

  // One the server refuses for good: never hidden, and marked as not saved.
  const third = sheet.case.filter((c) => c.form === "singular")[2]!;
  const thirdId = JSON.stringify([third.lemma, third.class, "plural"]);
  await page.route("**/edit/goldens", (route) => {
    const body = route.request().postData();
    return route.request().method() === "PUT" &&
      body !== null &&
      (JSON.parse(body) as { caseId: string }).caseId === thirdId
      ? route.fulfill({ status: 400, contentType: "application/json", body: "{}" })
      : route.continue();
  });
  await page.evaluate(
    ([key, refused]) =>
      window.localStorage.setItem(
        key,
        JSON.stringify({ [JSON.stringify([refused.lemma, refused.class, refused.form])]: refused }),
      ),
    [
      "molo.goldens.pending.v2",
      { ...oldCard, lemma: third.lemma, class: third.class, expected: "zz-refused" },
    ] as const,
  );
  const refusedPut = page.waitForResponse(
    (r) =>
      r.url().endsWith("/edit/goldens") && r.request().method() === "PUT" && r.status() === 400,
  );
  await page.reload();
  await refusedPut;
  const unsent = earlier.getByTestId("golden-earlier-unsent");
  await expect(unsent).toContainText("zz-refused");
  await expect(unsent).toContainText(t.edit.goldens.earlierUnsaved);
});

test("the locatives have their own section, and a card is never filled in for the tutor", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  await page.goto("/edit/goldens");
  await page
    .getByRole("navigation", { name: t.edit.goldens.jump })
    .getByRole("link", { name: /^Locatives ·/ })
    .click();
  await expect(page).toHaveURL(/#golden-locatives$/);
  const section = page.locator("#golden-locatives");
  await expect(section.getByRole("heading", { name: t.edit.goldens.locativeTitle })).toBeVisible();
  await expect(section.locator("fieldset[data-golden]")).toHaveCount(
    sheet.case.filter((c) => c.form === "locative").length,
  );
  const row = section.getByRole("group", {
    name: new RegExp(`^ikhaya · ${t.edit.goldens.forms.locative}`),
  });
  await expect(row.getByLabel(t.edit.goldens.expected)).toHaveValue("");
  // The concord and pair sections carry no locative card.
  await expect(
    page.locator('section[id^="golden-pair"] fieldset[data-golden*="locative"]'),
  ).toHaveCount(0);
});

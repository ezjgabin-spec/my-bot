import { test, expect } from "@playwright/test";

const state = {
  subjects: [],
  exams: [],
  tests: [],
  attempts: [],
  predictions: [],
  grades: [],
  answers: [],
};
async function session(page: import("@playwright/test").Page, paid: boolean) {
  await page.route("**/api/state", (route) =>
    route.fulfill({
      json: {
        configured: true,
        aiReady: true,
        state,
        entitlement: {
          plan: paid ? "study" : "free",
          family: false,
          predictions: paid,
        },
      },
    }),
  );
}

test("free import edits, persists, reviews and undoes without an AI request", async ({
  page,
}) => {
  await session(page, false);
  let generated = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/flashcards/generate")) generated++;
  });
  await page.goto("/flashcards");
  const title = `Imported vocabulary ${Date.now()}`;
  await page.getByLabel("Deck title").fill(title);
  await page
    .getByLabel("Vocabulary and definitions")
    .fill("Accolade = Recognition\nImpetus: Motivation\nUnstructured heading");
  await page.getByRole("button", { name: "Preview imported cards" }).click();
  await expect(page.locator(".flash-preview fieldset")).toHaveCount(2);
  await expect(page.locator(".flash-import-skipped summary")).toContainText(
    "1 lines need attention",
  );
  await page
    .getByLabel("Answer / definition")
    .first()
    .fill("An award from school");
  await page.getByRole("button", { name: "Save deck", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Interactive flashcards" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reveal flashcard answer" }).click();
  await expect(page.locator(".flash-card-content")).toHaveText(
    "An award from school",
  );
  await page.getByRole("button", { name: /Know it/ }).click();
  await expect(page.locator(".flash-group-stats")).toContainText("1 mastered");
  await page.reload();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.locator(".flash-group-stats")).toContainText("1 mastered");
  await page.getByRole("button", { name: "Back / Undo" }).click();
  await expect(page.locator(".flash-group-stats")).toContainText("0 mastered");
  expect(generated).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/gen2-flashcards-mobile.png",
    fullPage: true,
  });
});

test("free users can create manual cards while AI Smart Flashcards shows its paid access requirement", async ({
  page,
}) => {
  await session(page, false);
  await page.goto("/flashcards");
  await page
    .getByRole("button", { name: "AI Smart Flashcards", exact: true })
    .click();
  await expect(
    page.getByText("AI Smart Flashcards is included with Study and Plus.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate preview" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Manual · Free" }).click();
  await page.getByLabel("Question / term").fill("What is evidence?");
  await page
    .getByLabel("Answer / definition")
    .fill("Information supporting a claim.");
  await expect(
    page.getByRole("button", { name: "Save deck", exact: true }),
  ).toBeEnabled();
});

test("paid AI generation previews before saving and preserves edits in the resulting deck", async ({
  page,
}) => {
  await session(page, true);
  await page.route("**/api/flashcards/generate", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      text: "Complete guide covering cells and energy.",
      count: 5,
    });
    expect(route.request().postDataJSON().requestId).toMatch(/^[a-f0-9-]{36}$/);
    await route.fulfill({
      json: {
        preview: {
          title: "AI guide",
          materialId: null,
          sections: 1,
          requestedCount: 5,
          cards: Array.from({ length: 5 }, (_, i) => ({
            front: `Cell question ${i + 1}`,
            back: "Source-supported answer",
            topic: "Biology",
          })),
        },
      },
    });
  });
  await page.goto("/flashcards");
  await page
    .getByRole("button", { name: "AI Smart Flashcards", exact: true })
    .click();
  await page
    .getByLabel("Complete study guide or notes")
    .fill("Complete guide covering cells and energy.");
  await page.getByLabel("Number of cards").selectOption("5");
  await page.getByRole("button", { name: "Generate preview" }).click();
  await expect(page.locator(".flash-preview fieldset")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Remove card 5", exact: true })
    .click();
  const title = `AI edited guide ${Date.now()}`;
  await page.getByLabel("Deck title").fill(title);
  await page
    .getByLabel("Answer / definition")
    .first()
    .fill("Corrected explanation");
  await page.getByRole("button", { name: "Save deck", exact: true }).click();
  await expect(page.locator(".flash-group-stats")).toContainText("4 active");
  await page.getByRole("button", { name: "Reveal flashcard answer" }).click();
  await expect(page.locator(".flash-card-content")).toHaveText(
    "Corrected explanation",
  );
});

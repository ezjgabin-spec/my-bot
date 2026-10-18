import { test, expect } from "@playwright/test";
import { makePdf } from "../pdf-fixture.mjs";

test("Cloudflare serves the PDF worker and supports pausing, resuming, and downloading a guide", async ({
  page,
}) => {
  await page.route("**/api/state", (route) =>
    route.fulfill({
      json: {
        configured: true,
        aiReady: true,
        user: { email: "owner@example.com" },
        state: {
          subjects: [],
          exams: [],
          tests: [],
          attempts: [],
          answers: [],
          grades: [],
          predictions: [],
        },
      },
    }),
  );
  await page.route("**/api/materials", (route) =>
    route.fulfill({ json: { materials: [] } }),
  );
  let release: (() => void) | undefined;
  let requests = 0;
  await page.route("**/api/materials/interpret", async (route) => {
    requests++;
    if (requests === 1)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return route.fulfill({
      json: {
        summary:
          "Function composition applies the inner function first. Check domains and restrictions.",
      },
    });
  });
  await page.goto("/create");
  await page.getByRole("button", { name: "Interpret large file" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "chapters.pdf",
    mimeType: "application/pdf",
    buffer: makePdf({ pages: 220 }),
  });
  await page.getByRole("button", { name: "Read file", exact: true }).click();
  await page
    .getByRole("button", { name: "Summarize file", exact: true })
    .click();
  await expect.poll(() => typeof release).toBe("function");
  await page.getByRole("button", { name: "Pause after this section" }).click();
  release!();
  await expect(
    page.getByRole("button", { name: "Resume interpretation" }),
  ).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Resume interpretation" }).click();
  await expect(page.getByLabel("Review your study guide")).toBeVisible();
  expect(requests).toBeGreaterThan(1);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download text" }).click();
  expect((await download).suggestedFilename()).toBe("study-guide.txt");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
test("an unsigned browser is sent to email sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome to StudyPredict" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in with email" }),
  ).toHaveAttribute("href", "/");
});
test("online settings show the account and shared AI, without requesting a personal key", async ({
  page,
}) => {
  await page.route("**/api/state", (route) =>
    route.fulfill({
      json: {
        configured: true,
        aiReady: true,
        user: { email: "brother@example.com" },
        state: {
          subjects: [],
          exams: [],
          tests: [],
          attempts: [],
          predictions: [],
          grades: [],
          answers: [],
        },
      },
    }),
  );
  await page.goto("/settings");
  await expect(
    page.getByText("brother@example.com", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Connected. AI usage is paid for by the owner."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign out", exact: true }),
  ).toHaveAttribute("href", "/cdn-cgi/access/logout");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByText("Your practice rhythm", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Private to your account", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

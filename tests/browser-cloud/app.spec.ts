import { test, expect } from "@playwright/test";
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

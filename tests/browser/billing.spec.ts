import { test, expect } from "@playwright/test";
const empty = {
  subjects: [],
  exams: [],
  tests: [],
  attempts: [],
  predictions: [],
  grades: [],
  answers: [],
};
const summary = {
  plan: "free",
  family: false,
  balance: { monthly: 0, bank: 0, purchased: 0, free: 300000 },
  freeTests: 1,
  nextFreeAt: "2026-11-01T12:00:00Z",
  paidUntil: null,
  canManageSubscription: false,
  pendingCount: 0,
  usage: [],
  payments: { ready: false, plans: {}, packs: {} },
  admin: false,
};
test("pricing is honest about unavailable payments and family code redemption updates access", async ({
  page,
}) => {
  let family = false;
  await page.route("**/api/state", (route) =>
    route.fulfill({
      json: {
        configured: true,
        aiReady: true,
        state: empty,
        entitlement: {
          plan: family ? "ultra" : "free",
          family,
          predictions: family,
        },
      },
    }),
  );
  await page.route("**/api/billing", (route) =>
    route.fulfill({
      json: { ...summary, family, plan: family ? "ultra" : "free" },
    }),
  );
  await page.route("**/api/billing/code", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      code: "test-family-code",
    });
    family = true;
    await route.fulfill({ json: { unlocked: true } });
  });
  await page.goto("/pricing");
  await expect(
    page.getByText("Paid plans are coming soon.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Coming soon", exact: true }),
  ).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Coming soon", exact: true }).first(),
  ).toBeDisabled();
  await expect(page.locator(".price-card")).toHaveCount(4);
  await page.getByLabel("Access code").fill("test-family-code");
  await page.getByRole("button", { name: "Redeem", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ultra. Everything unlocked." }),
  ).toBeVisible();
  await expect(page.locator(".price-card")).toHaveCount(0);
});
test("free prediction screen shows an upgrade link and pricing fits a phone", async ({
  page,
}) => {
  await page.route("**/api/state", (route) =>
    route.fulfill({
      json: {
        configured: true,
        aiReady: true,
        state: empty,
        entitlement: { plan: "free", family: false, predictions: false },
      },
    }),
  );
  await page.route("**/api/billing", (route) =>
    route.fulfill({ json: summary }),
  );
  await page.goto("/analytics");
  await expect(
    page.getByRole("heading", { name: "Unlock prediction analytics" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Explore plans" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "StudyBot Plus", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

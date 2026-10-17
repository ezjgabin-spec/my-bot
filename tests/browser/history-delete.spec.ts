import { test, expect } from "@playwright/test";

test("history confirms deletes, handles failure, and refreshes the subject filter", async ({
  page,
}) => {
  const subjectId = "11111111-1111-4111-8111-111111111111";
  const examId = "22222222-2222-4222-8222-222222222222";
  const testId = "33333333-3333-4333-8333-333333333333";
  const state = {
    subjects: [{ id: subjectId, name: "Physics" }],
    exams: [
      {
        id: examId,
        subject_id: subjectId,
        name: "Forces",
        exam_date: null,
        created_at: "2026-01-01",
      },
    ],
    tests: [
      {
        id: testId,
        exam_id: examId,
        question_count: 10,
        difficulty: "Medium",
        format: "multiple_choice",
        created_at: "2026-01-01",
      },
    ],
    attempts: [],
    answers: [],
    predictions: [],
    grades: [],
  };
  await page.route("**/api/state", (route) =>
    route.fulfill({ json: { configured: true, aiReady: true, state } }),
  );
  let deletes = 0;
  await page.route(`**/api/tests/${testId}`, (route) => {
    expect(route.request().method()).toBe("DELETE");
    deletes++;
    if (deletes === 1)
      return route.fulfill({
        status: 500,
        json: { error: "Please retry deletion." },
      });
    state.tests = [];
    return route.fulfill({ json: { deleted: true } });
  });
  await page.route(`**/api/subjects/${subjectId}`, (route) => {
    expect(route.request().method()).toBe("DELETE");
    state.subjects = [];
    state.exams = [];
    return route.fulfill({ json: { deleted: true } });
  });
  await page.goto("/history");
  const button = page.getByRole("button", { name: /Delete practice test:/ });
  page.once("dialog", (dialog) => dialog.dismiss());
  await button.click();
  expect(deletes).toBe(0);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("attempts, answers, and predictions");
    await dialog.accept();
  });
  await button.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Please retry deletion." }),
  ).toBeVisible();
  await expect(button).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await button.click();
  await expect(button).toHaveCount(0);
  await expect(
    page.getByText("10-question practice test deleted."),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Subject", exact: true })
    .selectOption(subjectId);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("grades, and predictions");
    await dialog.accept();
  });
  await page
    .getByRole("button", { name: "Delete subject", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Subject", exact: true }),
  ).toHaveValue("all");
  await expect(page.getByText("Physics deleted.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Forces" })).toHaveCount(0);
});

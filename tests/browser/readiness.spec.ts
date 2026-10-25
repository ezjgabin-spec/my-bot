import { test, expect } from "@playwright/test";
import type { WritingDocument } from "../../src/lib/writing-types";
test("public accuracy shows a small-sample message without account details", async ({
  page,
}) => {
  await page.goto("/accuracy");
  await expect(
    page.getByRole("heading", { name: "StudyPredict accuracy" }),
  ).toBeVisible();
  await expect(
    page.getByText("Not enough data yet.", { exact: false }),
  ).toBeVisible();
  await expect(page).toHaveURL(/accuracy/);
});
test("readiness retains analytics and presents locked ranges and baseline errors", async ({
  page,
}) => {
  const state = {
    subjects: [],
    exams: [],
    tests: [],
    attempts: [],
    predictions: [],
    grades: [],
    answers: [],
  };
  await page.route("**/api/state", (r) =>
    r.fulfill({
      json: {
        configured: true,
        aiReady: false,
        state,
        entitlement: { plan: "study", family: false, predictions: true },
      },
    }),
  );
  await page.route("**/api/readiness", (r) =>
    r.fulfill({
      json: {
        sources: [],
        records: [
          {
            id: "r",
            kind: "test",
            sourceId: "e",
            className: "Statistics",
            teacher: "Ms Example",
            at: "2026-01-01",
            version: "v1",
            lower: 70,
            upper: 90,
            calibrationCount: 0,
            nominalCoverage: 0.8,
            runningGrade: 82,
            guess: 85,
            actual: { grade: 88, at: "2026-02-01" },
          },
        ],
      },
    }),
  );
  await page.goto("/analytics");
  await expect(
    page.getByRole("heading", { name: "Real-world readiness" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Statistics.*70.0–90.0/ }),
  ).toBeVisible();
  await expect(page.getByText("Actual: 88%")).toBeVisible();
  await expect(
    page.getByText("app: MAE 8.0 percentage points · 1 comparisons"),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("shows the 65 to 78 comparison beside the earlier actual 89 without changing the locked range", async ({
  page,
}) => {
  const state = {
    subjects: [],
    exams: [],
    tests: [],
    attempts: [],
    predictions: [],
    grades: [],
    answers: [],
  };
  await page.route("**/api/state", (r) =>
    r.fulfill({
      json: {
        configured: true,
        aiReady: false,
        state,
        entitlement: { plan: "study", family: false, predictions: true },
      },
    }),
  );
  await page.route("**/api/readiness", (r) =>
    r.fulfill({
      json: {
        sources: [],
        records: [
          {
            id: "r",
            kind: "test",
            sourceId: "new",
            className: "Statistics",
            teacher: "Ms Smith",
            at: "2026-01-01",
            version: "v1",
            lower: 70,
            upper: 90,
            calibrationCount: 0,
            nominalCoverage: 0.8,
            runningGrade: 82,
            guess: 85,
          },
        ],
      },
    }),
  );
  await page.route("**/api/readiness/stage?*", (r) =>
    r.fulfill({
      json: {
        stage: 2,
        className: "Statistics",
        teacher: "Ms Smith",
        current: { score: 78, difficulty: "Medium", format: "multiple_choice" },
        matches: [
          {
            recordId: "old",
            sourceId: "old-exam",
            previousScore: 65,
            actualGrade: 89,
            difference: 13,
          },
        ],
      },
    }),
  );
  await page.goto("/analytics");
  const comparison = page.getByRole("region", {
    name: "Same-stage practice comparison",
  });
  await expect(comparison).toContainText("65%");
  await expect(comparison).toContainText("89%");
  await expect(comparison).toContainText("78%");
  await expect(comparison).toContainText("13 percentage points higher");
  await expect(comparison).toContainText("does not predict the same increase");
  await expect(
    page.getByRole("heading", { name: /Statistics.*70.0–90.0/ }),
  ).toBeVisible();
});

test("tags older essays and displays same-draft evidence", async ({ page }) => {
  await page.route("**/api/state", (r) =>
    r.fulfill({
      json: {
        configured: true,
        aiReady: false,
        state: {
          subjects: [],
          exams: [],
          tests: [],
          attempts: [],
          predictions: [],
          grades: [],
          answers: [],
        },
        entitlement: { plan: "study", family: false, predictions: true },
      },
    }),
  );
  await page.route("**/api/readiness", (r) =>
    r.fulfill({ json: { sources: [], records: [] } }),
  );
  let tagged = false;
  await page.route("**/api/readiness/context", async (r) => {
    if (r.request().method() === "POST") {
      expect(r.request().postDataJSON()).toMatchObject({
        kind: "essay",
        className: "English",
        teacher: "Ms A",
      });
      tagged = true;
      await r.fulfill({ json: { saved: true } });
    } else
      await r.fulfill({
        json: {
          sources: [
            {
              id: "old",
              kind: "essay",
              name: "Earlier essay",
              className: tagged ? "English" : "",
              teacher: tagged ? "Ms A" : "",
              locked: false,
              graded: true,
            },
          ],
        },
      });
  });
  await page.route("**/api/readiness/essay-stage?*", (r) =>
    r.fulfill({
      json: {
        stage: 2,
        current: { lower: 78, upper: 88 },
        matches: [
          {
            recordId: "r",
            sourceId: "older",
            lower: 65,
            upper: 75,
            actualGrade: 89,
            difference: 13,
          },
        ],
      },
    }),
  );
  await page.goto("/analytics");
  await page.getByLabel("Assessment to tag").selectOption("essay:old");
  await page.getByLabel("Class for comparisons").fill("English");
  await page.getByLabel("Teacher for comparisons").fill("Ms A");
  await page.getByRole("button", { name: "Save class and teacher" }).click();
  await expect(page.getByRole("status")).toContainText("Tags saved");
  await expect(
    page.getByText("This draft’s midpoint is", { exact: false }),
  ).toContainText("13.0 percentage points higher");
  await expect(
    page.getByText("This draft’s midpoint is", { exact: false }),
  ).toContainText("teacher gave 89%");
});

test("uploads a rubric and grades an edited draft in the existing essay", async ({
  page,
}) => {
  await page.route("**/api/state", (r) =>
    r.fulfill({
      json: {
        configured: true,
        aiReady: true,
        state: {
          subjects: [],
          exams: [],
          tests: [],
          attempts: [],
          predictions: [],
          grades: [],
          answers: [],
        },
        entitlement: { plan: "study", family: false, predictions: true },
      },
    }),
  );
  const source =
    "A detailed essay with a clear thesis, evidence and analysis. ".repeat(4);
  const rubric = "Evidence 40%, argument 40%, organization 20%.";
  const feedback = {
    lower: 78,
    upper: 88,
    likelyLetter: "B",
    confidence: "low" as const,
    overview: "Develop the argument.",
    strengths: ["Clear thesis"],
    priorities: ["Add evidence"],
    criteria: [],
    limitations: "Teacher grading varies.",
  };
  let doc: WritingDocument | undefined;
  await page.route("**/api/writing", async (r) => {
    if (r.request().method() === "GET") {
      await r.fulfill({ json: { essays: doc ? [doc] : [] } });
      return;
    }
    const input = r.request().postDataJSON();
    expect(input.rubric).toBe(rubric);
    if (doc) {
      expect(input.essayId).toBe(doc.id);
      expect(input.text).toContain("A revised conclusion.");
    }
    const revision = {
      id: input.requestId,
      action: "grade" as const,
      createdAt: new Date().toISOString(),
      autoHumanize: false,
      tone: "natural",
      result: "Feedback",
      sourceSnapshot: input.text,
      rubricSnapshot: rubric,
      feedback,
    };
    doc = {
      id: input.essayId ?? input.requestId,
      title: "My essay",
      sourceText: doc?.sourceText ?? input.text,
      assignment: "",
      rubric,
      teacherFeedback: "",
      materialId: null,
      createdAt: doc?.createdAt ?? revision.createdAt,
      updatedAt: revision.createdAt,
      revisions: [...(doc?.revisions ?? []), revision],
    };
    await r.fulfill({ status: 201, json: { essay: doc, revision } });
  });
  await page.route("**/api/writing/rubric", (r) =>
    r.fulfill({ json: { rubric } }),
  );
  await page.route("**/api/writing/quote", (r) =>
    r.fulfill({
      json: { estimate: { estimatedCredits: 2, estimatedDollars: 0.02 } },
    }),
  );
  await page.route("**/api/readiness/essay-stage?*", (r) =>
    r.fulfill({ json: { needsTags: true } }),
  );
  await page.goto("/writing");
  await page.getByLabel("Your original essay").fill(source);
  await page
    .locator('input[type="file"]')
    .nth(1)
    .setInputFiles({
      name: "rubric.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(rubric),
    });
  await expect(page.getByLabel("Rubric (optional)")).toHaveValue(rubric);
  await page
    .getByRole("button", { name: "Review estimated credit cost" })
    .click();
  await page
    .getByRole("button", { name: "Confirm grade · use credits" })
    .click();
  await expect(page.getByLabel("Draft to grade")).toHaveValue(source);
  await page
    .getByLabel("Draft to grade")
    .fill(source + "A revised conclusion.");
  await page
    .getByRole("button", { name: "Review estimated credit cost" })
    .click();
  await page
    .getByRole("button", { name: "Confirm grade · use credits" })
    .click();
  await expect(page.locator(".writing-history-entry")).toHaveCount(2);
  expect(doc?.sourceText).toBe(source);
});

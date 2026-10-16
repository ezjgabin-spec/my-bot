import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { AttemptView, PublicQuestion } from "../../src/lib/types";
const empty = {
  subjects: [],
  exams: [],
  tests: [],
  attempts: [],
  predictions: [],
  grades: [],
  answers: [],
};
const json = (data: unknown) => ({
  contentType: "application/json",
  body: JSON.stringify(data),
});
// Browser fixtures exercise UI behavior only; they are never used by the application.
const qid = "11111111-1111-4111-8111-111111111111",
  aid = "22222222-2222-4222-8222-222222222222",
  eid = "33333333-3333-4333-8333-333333333333";
const question: PublicQuestion = {
  id: qid,
  position: 0,
  kind: "multiple_choice",
  prompt: "What is the value of two plus two?",
  topic: "Arithmetic",
  options: ["One", "Two", "Three", "Four"],
  max_points: 2,
};
function view(): AttemptView {
  return {
    attempt: {
      id: aid,
      test_id: "t",
      exam_id: eid,
      status: "in_progress",
      responses: {},
      flags: [],
      score: null,
      earned_points: null,
      possible_points: null,
      submitted_at: null,
      completed_at: null,
      time_spent_seconds: null,
      started_at: new Date().toISOString(),
      deadline_at: null,
    },
    test: {
      id: "t",
      exam_id: eid,
      difficulty: "Medium",
      question_count: 1,
      format: "multiple_choice",
      material_id: "m",
      time_limit_minutes: null,
      topics: ["Arithmetic"],
      created_at: new Date().toISOString(),
    },
    exam: {
      id: eid,
      name: "Functions review",
      subject_id: "s",
      exam_date: null,
      created_at: new Date().toISOString(),
    },
    subject: "Precalculus",
    questions: [question],
    results: [],
    prediction: null,
  };
}
async function ready(page: Page) {
  await page.route("**/api/state", (r) =>
    r.fulfill(json({ configured: true, aiReady: true, state: empty })),
  );
}
test("local app shows honest empty states and directs key entry to Settings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make your next exam your best." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Settings" })).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Create practice test" })
    .click();
  await expect(
    page.getByRole("button", { name: "Generate practice test" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Upload a file" }).click();
  await expect(page.locator('input[type="file"]')).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Prediction analytics" })
    .click();
  await expect(
    page.getByText("No paired results yet.", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("real endpoints reject cross-origin mutations and unknown attempts", async ({
  request,
}) => {
  const blocked = await request.post("/api/tests/generate", {
    headers: { Origin: "https://untrusted.example" },
    data: {},
  });
  expect(blocked.status()).toBe(403);
  const privateResult = await request.get(`/api/attempts/${aid}`);
  expect(privateResult.status()).toBe(404);
  expect(JSON.stringify(await privateResult.json())).not.toContain(
    "answer_key",
  );
  const body = await request.get("/api/state");
  expect((await body.json()).configured).toBe(true);
});
test("mobile navigation works without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make your next exam your best." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Tests & history" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Every attempt tells a story." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
});
test("practice answers autosave, survive reload, stay hidden, and submit only after confirmation", async ({
  page,
}) => {
  await ready(page);
  let attempt = view();
  let saved: Record<string, string> = {};
  let submitted = 0;
  await page.route(`**/api/attempts/${aid}`, async (r) => {
    if (r.request().method() === "PATCH") {
      const data = r.request().postDataJSON();
      saved = data.responses;
      attempt = {
        ...attempt,
        attempt: {
          ...attempt.attempt,
          responses: data.responses,
          flags: data.flags,
        },
      };
      await r.fulfill(json({ saved: true }));
    } else await r.fulfill(json(attempt));
  });
  await page.route(`**/api/attempts/${aid}/submit`, async (r) => {
    submitted++;
    attempt = {
      ...attempt,
      attempt: {
        ...attempt.attempt,
        status: "completed",
        score: 100,
        earned_points: 2,
        possible_points: 2,
        time_spent_seconds: 30,
      },
      questions: [
        {
          ...question,
          answer_key: "Four",
          explanation: "Addition gives four.",
          rubric: "Two points for four.",
        },
      ],
      results: [
        {
          question_id: qid,
          response: "Four",
          points: 2,
          max_points: 2,
          feedback: "Correct.",
          topic: "Arithmetic",
        },
      ],
    };
    await r.fulfill(json({ completed: true }));
  });
  await page.goto(`/attempts/${aid}`);
  await expect(
    page.getByRole("heading", { name: question.prompt }),
  ).toBeVisible();
  await expect(page.getByText("EXPECTED ANSWER")).toHaveCount(0);
  await page.getByRole("radio", { name: "D Four" }).check();
  await expect.poll(() => saved[qid]).toBe("Four");
  await page.getByRole("button", { name: "Flag for review" }).click();
  await expect(
    page.getByRole("button", { name: "Flagged", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("All answers saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: "D Four" })).toBeChecked();
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Submit test", exact: true }).click();
  expect(submitted).toBe(0);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Submit test", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Every answer is a step forward." }),
  ).toBeVisible();
  expect(submitted).toBe(1);
  await expect(page.getByText("EXPECTED ANSWER")).toBeVisible();
});
test("failed autosave stays visible and can be retried without losing the answer", async ({
  page,
}) => {
  await ready(page);
  let failures = 1;
  await page.route(`**/api/attempts/${aid}`, (r) =>
    r.request().method() === "PATCH"
      ? failures-- > 0
        ? r.fulfill({
            status: 500,
            ...json({ error: "Temporary save failure" }),
          })
        : r.fulfill(json({ saved: true }))
      : r.fulfill(json(view())),
  );
  await page.goto(`/attempts/${aid}`);
  await page.getByRole("radio", { name: "D Four" }).check();
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary save failure" }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "D Four" })).toBeChecked();
  await page.getByRole("button", { name: "Retry saving" }).click();
  await expect(page.getByText("All answers saved")).toBeVisible();
});
test("an expired timer submits saved answers and disables editing", async ({
  page,
}) => {
  await ready(page);
  let submits = 0;
  const data = view();
  data.attempt.deadline_at = new Date(Date.now() - 5000).toISOString();
  await page.route(`**/api/attempts/${aid}`, (r) => r.fulfill(json(data)));
  await page.route(`**/api/attempts/${aid}/submit`, async (r) => {
    submits++;
    await r.fulfill({
      status: 502,
      ...json({ error: "Grading temporarily unavailable; retry" }),
    });
  });
  await page.goto(`/attempts/${aid}`);
  await expect.poll(() => submits).toBe(1);
  await expect(page.getByRole("radio", { name: "D Four" })).toBeDisabled();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Grading temporarily unavailable" }),
  ).toBeVisible();
});
test("actual grades are validated, saved, and compared with the frozen forecast", async ({
  page,
}) => {
  const base = {
    ...empty,
    subjects: [{ id: "s", name: "Precalculus" }],
    exams: [
      {
        id: eid,
        subject_id: "s",
        name: "Functions review",
        exam_date: null,
        created_at: "2026-01-01",
      },
    ],
    predictions: [
      {
        id: "p",
        exam_id: eid,
        attempt_id: aid,
        subject: "Precalculus",
        predicted: 88,
        lower: 80,
        upper: 96,
        confidence: "low",
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    grades: [] as { exam_id: string; grade: number; recorded_at: string }[],
  };
  await page.route("**/api/state", (r) =>
    r.fulfill(json({ configured: true, aiReady: true, state: base })),
  );
  await page.route(`**/api/exams/${eid}/grade`, (r) => {
    base.grades = [
      {
        exam_id: eid,
        grade: r.request().postDataJSON().grade,
        recorded_at: "2026-02-01T00:00:00Z",
      },
    ];
    return r.fulfill(json({ saved: true }));
  });
  await page.goto(`/exams/${eid}`);
  await page.getByLabel("Actual school grade (%)").fill("91");
  await page.getByRole("button", { name: "Save actual grade" }).click();
  await expect(
    page.getByText("3.0 percentage points higher than predicted"),
  ).toBeVisible();
  await expect(
    page.getByText("Grade saved. Future predictions will use this result."),
  ).toBeVisible();
  expect(base.predictions[0].predicted).toBe(88);
});

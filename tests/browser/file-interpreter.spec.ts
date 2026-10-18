import { test, expect, type Page } from "@playwright/test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makePdf } from "../pdf-fixture.mjs";

async function openInterpreter(page: Page) {
  await page.route("**/api/state", (route) =>
    route.fulfill({
      json: {
        configured: true,
        aiReady: true,
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
  await page.goto("/create");
  await page.getByRole("button", { name: "Interpret a file" }).click();
}

test("interprets a PDF over 100 MB and 500 pages, retries only the failed section, and saves edited notes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const directory = await mkdtemp(join(tmpdir(), "study-large-pdf-"));
  const filename = join(directory, "textbook.pdf");
  try {
    await writeFile(
      filename,
      makePdf({ pages: 601, paddingBytes: 101 * 1024 * 1024 }),
    );
    await openInterpreter(page);
    let calls = 0;
    let failedText = "";
    const successful: string[] = [];
    await page.route("**/api/materials/interpret", async (route) => {
      calls++;
      const { text } = route.request().postDataJSON();
      expect(text.length).toBeLessThanOrEqual(16000);
      expect(route.request().postDataBuffer()!.length).toBeLessThan(110000);
      if (calls === 2) {
        failedText = text;
        return route.fulfill({
          status: 502,
          json: { error: "Temporary AI failure." },
        });
      }
      if (calls === 3) expect(text).toBe(failedText);
      successful.push(text);
      return route.fulfill({
        json: {
          summary: `Section ${successful.length}: Function composition applies one function to another.`,
        },
      });
    });
    await page.locator('input[type="file"]').setInputFiles(filename);
    await page.getByRole("button", { name: "Read file", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Summarize file", exact: true }),
    ).toBeVisible({ timeout: 60000 });
    await page
      .getByRole("button", { name: "Summarize file", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Temporary AI failure" }),
    ).toBeVisible();
    await expect(page.getByText(/1 \/ \d+ sections completed/)).toBeVisible();
    await page.getByRole("button", { name: "Resume interpretation" }).click();
    const review = page.getByLabel("Review your study guide");
    await expect(review).toBeVisible();
    expect(successful.join("\n")).toContain("Page 601.");
    expect(calls).toBe(successful.length + 1);
    const edited =
      "Edited guide: Function composition means applying the inner function first, then the outer function.";
    await review.fill(edited);
    await page.route("**/api/materials", (route) => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON().text).toBe(edited);
      expect(route.request().postDataJSON().filename).toContain(
        "study guide.txt",
      );
      return route.fulfill({
        status: 201,
        json: { id: "saved-guide", filename: "textbook — study guide.txt" },
      });
    });
    await page
      .getByRole("button", { name: "Save guide & use for test" })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Saved study material" }),
    ).toHaveValue("saved-guide");
    await expect(
      page.getByRole("button", { name: "Generate practice test" }),
    ).toBeEnabled();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reads Word and text locally and reports a PDF with no readable content", async ({
  page,
}) => {
  await openInterpreter(page);
  for (const path of [
    "tests/fixtures/study-guide.docx",
    "tests/fixtures/study-guide.txt",
  ]) {
    if (path.endsWith(".txt")) {
      await page
        .locator('input[type="file"]')
        .setInputFiles({
          name: "notes.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Force equals mass times acceleration."),
        });
    } else await page.locator('input[type="file"]').setInputFiles(path);
    await page.getByRole("button", { name: "Read file", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Summarize file" }),
    ).toBeVisible();
  }
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "blank.pdf",
      mimeType: "application/pdf",
      buffer: makePdf({ pageText: "" }),
    });
  await page.getByRole("button", { name: "Read file", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No readable text" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Summarize file" }),
  ).toHaveCount(0);
});

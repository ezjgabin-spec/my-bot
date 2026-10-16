import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const temporary = await mkdtemp(path.join(os.tmpdir(), "study-desktop-smoke-"));
const target = process.argv[2] || "desktop/staging/app";
const args = [target];
// Linux container smoke tests may explicitly opt out of Chromium's unavailable
// sandbox; the Windows app never supplies this flag.
if (process.env.STUDYPREDICT_TEST_NO_SANDBOX === "1") args.push("--no-sandbox");
const env = { ...process.env, XDG_CONFIG_HOME: temporary, APPDATA: temporary };
let app;
try {
  app = await electron.launch({ args, env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.waitForURL("**/settings");
  await expect(
    page.getByRole("heading", { name: "One key. Ready to study." }),
  ).toBeVisible();
  const settings = await page.evaluate(() => window.studyDesktop.settings());
  assert.equal(settings.hasKey, false);
  assert.equal("apiKey" in settings, false);
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByText("Settings saved. You can start practicing."),
  ).toBeVisible();
  assert.equal((await fetch(new URL("/api/state", page.url()))).status, 401);
  const pdf = (await readFile("tests/fixtures/study-guide.pdf")).toString(
    "base64",
  );
  const docx = (await readFile("tests/fixtures/study-guide.docx")).toString(
    "base64",
  );
  const saved = await page.evaluate(
    async ({ pdf, docx }) => {
      const post = async (url, data) => {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : {} };
      };
      return {
        exam: await post("/api/exams", {
          name: "Desktop persistence check",
          subject: "Precalculus",
        }),
        pdf: await post("/api/materials", {
          filename: "study-guide.pdf",
          base64: pdf,
        }),
        docx: await post("/api/materials", {
          filename: "study-guide.docx",
          base64: docx,
        }),
      };
    },
    { pdf, docx },
  );
  for (const result of Object.values(saved))
    assert.equal(result.status, 201, JSON.stringify(result));
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Create practice test" })
    .click();
  await page.waitForURL("**/create");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
    false,
  );
  await app.close();
  app = await electron.launch({ args, env, timeout: 45000 });
  const reopened = await app.firstWindow();
  await reopened.waitForURL("**/settings");
  const state = await reopened.evaluate(
    async () => (await (await fetch("/api/state")).json()).state,
  );
  assert.ok(state.exams.some((exam) => exam.id === saved.exam.body.exam.id));
  const materials = await reopened.evaluate(
    async () => (await (await fetch("/api/materials")).json()).materials,
  );
  assert.equal(materials.length, 2);
  console.log(
    "Desktop smoke passed: settings IPC, private session, PDF/DOCX extraction, navigation, close-to-tray, and persistence after restart.",
  );
} finally {
  await app?.close().catch(() => {});
  await rm(temporary, { recursive: true, force: true });
}

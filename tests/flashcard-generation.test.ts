import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateFlashcardPreview } from "../src/lib/flashcard-generation";
import { generateFlashcards } from "../src/lib/ai";
import { POST as generate } from "../src/app/api/flashcards/generate/route";
import { POST as save } from "../src/app/api/flashcards/route";
import { accountFor } from "../src/lib/billing";
import { readLocalData, updateLocalData } from "../src/lib/local-store";
import { changeFlashcardDeck } from "../src/lib/flashcard-decks";
vi.mock("../src/lib/ai", () => ({
  generateFlashcards: vi.fn(),
  withAiLock: async (_id: string, work: () => Promise<unknown>) => work(),
}));
let directory: string;
const origin = "http://127.0.0.1:3000";
const req = (url: string, body: unknown) =>
  new Request(origin + url, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "flash-gen-"));
  vi.stubEnv("STUDYPREDICT_DATA_DIR", directory);
  vi.mocked(generateFlashcards)
    .mockReset()
    .mockImplementation(async (text, count) =>
      Array.from({ length: count }, (_, i) => ({
        front: `${text.slice(0, 10)} question ${i}`,
        back: "Source-backed answer",
        topic: "Concepts",
      })),
    );
  await updateLocalData((data) =>
    accountFor(data, { id: "local-owner" }, false),
  );
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

it("saves unlimited-free manual/import cards without AI calls, test deductions or progress resets on retries", async () => {
  const input = {
    requestId: crypto.randomUUID(),
    title: "Vocabulary",
    source: "smart-import",
    cards: [{ front: "Accolade", back: "Recognition", topic: "Vocabulary" }],
  };
  expect((await save(req("/api/flashcards", input))).status).toBe(201);
  await updateLocalData((data) => {
    data.flashcardDecks[0] = changeFlashcardDeck(
      data.flashcardDecks[0],
      "known",
      data.flashcardDecks[0].active[0],
    );
  });
  expect((await save(req("/api/flashcards", input))).status).toBe(201);
  const data = await readLocalData();
  expect(data.flashcardDecks).toHaveLength(1);
  expect(data.flashcardDecks[0].mastered).toHaveLength(1);
  expect(data.billingAccounts[0].freeTests).toBe(1);
  expect(data.billingUsage).toHaveLength(0);
  expect(generateFlashcards).not.toHaveBeenCalled();
  expect(
    (await save(req("/api/flashcards", { ...input, title: "Changed" }))).status,
  ).toBe(409);
});
it("rejects free-tier AI calls on the server before contacting Claude", async () => {
  const response = await generate(
    req("/api/flashcards/generate", {
      requestId: crypto.randomUUID(),
      text: "A full guide",
      count: 10,
    }),
  );
  expect(response.status).toBe(403);
  expect(generateFlashcards).not.toHaveBeenCalled();
});
it("returns a paid preview before saving, processes all sections, and replays the same request without AI charges", async () => {
  await updateLocalData((data) => {
    const account = data.billingAccounts[0];
    account.plan = "study";
    account.paidUntil = new Date(Date.now() + 86400000).toISOString();
  });
  const source =
    "A".repeat(40000) + "B".repeat(40000) + "Last important concept";
  const input = {
    requestId: crypto.randomUUID(),
    source,
    title: "Long guide",
    materialId: null,
    count: 10,
  };
  const first = await generateFlashcardPreview(input);
  expect(first.sections).toBe(3);
  expect(first.cards).toHaveLength(10);
  expect(
    vi
      .mocked(generateFlashcards)
      .mock.calls.map((c) => c[0])
      .join(""),
  ).toBe(source);
  expect(await generateFlashcardPreview(input)).toEqual(first);
  expect(generateFlashcards).toHaveBeenCalledTimes(3);
  expect((await readLocalData()).flashcardDecks).toHaveLength(0);
  expect((await readLocalData()).billingAccounts[0].freeTests).toBe(1);
  await expect(
    generateFlashcardPreview({ ...input, source: "Other source" }),
  ).rejects.toMatchObject({ status: 409 });
});
it("blocks concurrent duplicates and does not automatically retry a failed paid request", async () => {
  let release!: () => void;
  vi.mocked(generateFlashcards).mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    throw new Error("Provider failure");
  });
  const input = {
    requestId: crypto.randomUUID(),
    source: "Useful source",
    title: "Guide",
    materialId: null,
    count: 5,
  };
  const first = generateFlashcardPreview(input);
  const check = expect(first).rejects.toThrow("Provider failure");
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  await expect(generateFlashcardPreview(input)).rejects.toMatchObject({
    status: 409,
  });
  release();
  await check;
  await expect(generateFlashcardPreview(input)).rejects.toMatchObject({
    status: 409,
  });
  expect(generateFlashcards).toHaveBeenCalledTimes(1);
});
it("blocks saving a material belonging to a different workspace", async () => {
  const response = await save(
    req("/api/flashcards", {
      requestId: crypto.randomUUID(),
      title: "Private",
      materialId: crypto.randomUUID(),
      source: "manual",
      cards: [{ front: "Q", back: "A", topic: "Topic" }],
    }),
  );
  expect(response.status).toBe(404);
});

import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
let directory: string;
const mocked = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status = 429;
  }
  class Anthropic {
    static APIError = APIError;
    messages = {
      create: async (...args: unknown[]) => ({
        id: "msg_test",
        usage: { input_tokens: 100, output_tokens: 100 },
        ...(await mocked.create(...args)),
      }),
      countTokens: async () => ({ input_tokens: 100 }),
    };
  }
  return { default: Anthropic };
});
import {
  generateTest,
  gradeWritten,
  summarizeMaterial,
  generateFlashcards,
} from "../src/lib/ai";
import { readLocalData } from "../src/lib/local-store";
import type { Question } from "../src/lib/types";
const settings = {
  examId: "11111111-1111-4111-8111-111111111111",
  materialId: "22222222-2222-4222-8222-222222222222",
  difficulty: "Medium" as const,
  format: "multiple_choice" as const,
  count: 10 as const,
  timeLimit: null,
  focusTopics: [],
};
const questions = Array.from({ length: 10 }, (_, i) => ({
  kind: "multiple_choice",
  prompt: `Question ${i + 1}: What is two plus two?`,
  topic: "Arithmetic",
  options: ["1", "2", "3", "4"],
  max_points: 1,
  answer_key: "4",
  explanation: "Two plus two is four.",
  rubric: "One point for four.",
}));
function respond(input: unknown) {
  mocked.create.mockResolvedValue({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", name: "return_result", input }],
  });
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "study-ai-billing-"));
  vi.stubEnv("STUDYPREDICT_DATA_DIR", directory);
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only-not-a-real-key");
  mocked.create.mockReset();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
describe("Claude boundary validation (SDK mocked; no live network)", () => {
  it("meters AI flashcards separately and records provider-reported usage", async () => {
    const cards = Array.from({ length: 5 }, (_, i) => ({
      front: `Question ${i}`,
      back: "Answer",
      topic: "Topic",
    }));
    respond({ cards });
    expect(await generateFlashcards("Complete source guide", 5)).toEqual(cards);
    const data = await readLocalData();
    expect(data.billingUsage).toHaveLength(1);
    expect(data.billingUsage[0]).toMatchObject({
      operation: "flashcards",
      status: "completed",
      inputTokens: 100,
      outputTokens: 100,
    });
    expect(data.billingUsage[0].costMicros).toBeGreaterThan(0);
  });
  it("passes linked flashcard weaknesses as topic preferences without changing test difficulty", async () => {
    respond({ questions });
    await generateTest(
      settings,
      "Math",
      "Two plus two equals four.",
      false,
      [],
      ["Arithmetic: Two plus two"],
    );
    const payload = JSON.parse(
      mocked.create.mock.calls[0][0].messages[0].content,
    );
    expect(payload.selfReportedFlashcardReview).toEqual([
      "Arithmetic: Two plus two",
    ]);
    expect(payload.settings.difficulty).toBe("Medium");
    expect(payload.flashcardGuidance).toContain(
      "not verified ability or test scores",
    );
  });
  it("balances answer positions and preserves correct text for grading", async () => {
    respond({ questions });
    const result = await generateTest(
      settings,
      "Math",
      "Two plus two equals four.",
    );
    const counts = [0, 0, 0, 0];
    for (const q of result) {
      counts[q.options!.indexOf(q.answer_key)]++;
      expect([...q.options!].sort()).toEqual(["1", "2", "3", "4"]);
      const stored = { ...q, id: `q${q.position}` } as Question;
      expect(
        (await gradeWritten([stored], { [stored.id]: q.answer_key }))[0].points,
      ).toBe(1);
    }
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
  it("passes prior questions and retries an exact repeat before saving", async () => {
    const fresh = questions.map((q, i) => ({
      ...q,
      prompt: `Fresh source-supported problem ${i}`,
    }));
    mocked.create.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", name: "return_result", input: { questions } },
      ],
    });
    mocked.create.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          name: "return_result",
          input: { questions: fresh },
        },
      ],
    });
    const result = await generateTest(
      settings,
      "Math",
      "Two plus two equals four.",
      false,
      questions,
    );
    expect(result[0].prompt).toBe(fresh[0].prompt);
    expect(mocked.create).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(
      mocked.create.mock.calls[0][0].messages[0].content,
    );
    expect(payload.previousQuestions[0].prompt).toBe(questions[0].prompt);
    expect(payload.priorityExcerpts).toEqual(["Two plus two equals four."]);
  });
  it("rejects repeated old questions after a bounded retry", async () => {
    respond({ questions });
    await expect(
      generateTest(settings, "Math", "Notes", false, questions),
    ).rejects.toThrow(/duplicate/);
    expect(mocked.create).toHaveBeenCalledTimes(2);
  });
  it("summarizes source text with bounded output and ignores embedded commands", async () => {
    respond({ summary: "[Page 1] Force = mass × acceleration." });
    expect((await summarizeMaterial("[Page 1] F=ma")).summary).toContain(
      "Force",
    );
    const request = mocked.create.mock.calls[0][0];
    expect(request.system).toContain("untrusted");
    expect(request.max_tokens).toBe(3000);
    respond({ summary: "x".repeat(2001) });
    await expect(summarizeMaterial("notes")).rejects.toThrow(/invalid/);
  });
  it("passes material to a forced structured tool and validates its result", async () => {
    respond({ questions });
    const result = await generateTest(
      settings,
      "Precalculus",
      "Two plus two equals four.",
    );
    expect(result).toHaveLength(10);
    expect(result[9].position).toBe(9);
    const request = mocked.create.mock.calls[0][0];
    expect(request.tool_choice).toEqual({
      type: "tool",
      name: "return_result",
    });
    expect(request.messages[0].content).toContain("Two plus two equals four");
    expect(request.system).toContain("untrusted");
  });
  it("rejects incorrect counts, formats, and duplicate questions", async () => {
    for (const invalid of [
      questions.slice(0, 9),
      questions.map((q) => ({ ...q, kind: "math", options: null })),
      questions.map(() => questions[0]),
    ]) {
      respond({ questions: invalid });
      await expect(
        generateTest(settings, "Precalculus", "Notes"),
      ).rejects.toThrow();
    }
  });
  it("rejects answer keys outside the options", async () => {
    respond({
      questions: questions.map((q) => ({ ...q, answer_key: "Not an option" })),
    });
    await expect(
      generateTest(settings, "Precalculus", "Notes"),
    ).rejects.toThrow(/invalid/);
  });
  it("rejects truncated output instead of saving partial questions", async () => {
    mocked.create.mockResolvedValue({ stop_reason: "max_tokens", content: [] });
    await expect(
      generateTest(settings, "Precalculus", "Notes"),
    ).rejects.toThrow(/too long/);
  });
  it("fails explicitly when the API credential is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(
      generateTest(settings, "Precalculus", "Notes"),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocked.create).not.toHaveBeenCalled();
  });
  it("does not call Claude to grade multiple choice", async () => {
    const question = {
      ...questions[0],
      id: settings.examId,
      position: 0,
    } as Question;
    const result = await gradeWritten([question], { [question.id]: "4" });
    expect(result[0].points).toBe(1);
    expect(mocked.create).not.toHaveBeenCalled();
  });
  it("validates rubric feedback and requests equivalent-expression grading", async () => {
    const q = {
      ...questions[0],
      id: settings.examId,
      position: 0,
      kind: "math",
      options: null,
      max_points: 4,
    } as Question;
    respond({
      grades: [
        {
          question_id: q.id,
          points: 3,
          feedback: "Correct method with a rounding error.",
        },
      ],
    });
    expect((await gradeWritten([q], { [q.id]: "2+2" }))[0].points).toBe(3);
    expect(mocked.create.mock.calls[0][0].system).toContain(
      "equivalent algebraic expressions",
    );
  });
  it("rejects excessive AI points rather than silently clamping them", async () => {
    const q = {
      ...questions[0],
      id: settings.examId,
      position: 0,
      kind: "math",
      options: null,
    } as Question;
    respond({
      grades: [{ question_id: q.id, points: 100, feedback: "Full marks" }],
    });
    await expect(gradeWritten([q], { [q.id]: "4" })).rejects.toThrow(
      /inconsistent grading/,
    );
  });
});

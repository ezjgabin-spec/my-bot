import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocked = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status = 429;
  }
  class Anthropic {
    static APIError = APIError;
    messages = { create: mocked.create };
  }
  return { default: Anthropic };
});
import { generateTest, gradeWritten } from "../src/lib/ai";
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
beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only-not-a-real-key");
  mocked.create.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
describe("Claude boundary validation (SDK mocked; no live network)", () => {
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

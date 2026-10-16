import { describe, it, expect } from "vitest";
import {
  gradeMultipleChoice,
  combineGrades,
  totalScore,
} from "../src/lib/grading";
import { generatedTestSchema, generateSchema } from "../src/lib/schemas";
import type { Question } from "../src/lib/types";
const mc: Question = {
  id: "11111111-1111-4111-8111-111111111111",
  position: 0,
  kind: "multiple_choice",
  prompt: "What is 2+2?",
  topic: "Arithmetic",
  options: ["1", "2", "3", "4"],
  answer_key: "4",
  explanation: "Adding two and two gives four.",
  max_points: 2,
  rubric: "2 points for the correct choice.",
};
const written: Question = {
  ...mc,
  id: "22222222-2222-4222-8222-222222222222",
  position: 1,
  kind: "math",
  options: null,
  max_points: 4,
  answer_key: "x=2",
  prompt: "Solve 2x=4 and show your steps.",
  rubric: "2 points for dividing both sides, 2 for the correct result.",
};
describe("grading integrity", () => {
  it("grades multiple choice in code", () => {
    expect(gradeMultipleChoice(mc, "4").points).toBe(2);
    expect(gradeMultipleChoice(mc, "3").points).toBe(0);
  });
  it("cannot award points to an option outside the provided choices", () => {
    expect(gradeMultipleChoice({ ...mc, answer_key: "5" }, "5").points).toBe(0);
  });
  it("grades blank answers as zero without an AI call", () => {
    const r = combineGrades([mc, written], {}, { grades: [] });
    expect(totalScore(r)).toEqual({ earned: 0, possible: 6, score: 0 });
  });
  it("combines deterministic choices with rubric-based partial credit", () => {
    const r = combineGrades(
      [mc, written],
      { [mc.id]: "4", [written.id]: "2x/2 = 4/2; x=2" },
      {
        grades: [
          {
            question_id: written.id,
            points: 3,
            feedback: "Correct method; include units where required.",
          },
        ],
      },
    );
    expect(totalScore(r)).toEqual({ earned: 5, possible: 6, score: 83.33 });
  });
  it("never substitutes exact string matching for written math grading", () => {
    const r = combineGrades(
      [written],
      { [written.id]: "4/2" },
      {
        grades: [
          { question_id: written.id, points: 4, feedback: "Equivalent to 2." },
        ],
      },
    );
    expect(r[0].points).toBe(4);
  });
  it.each([5, -1, NaN])("rejects invalid AI points %s", (points) => {
    expect(() =>
      combineGrades(
        [written],
        { [written.id]: "x=2" },
        { grades: [{ question_id: written.id, points, feedback: "Feedback" }] },
      ),
    ).toThrow();
  });
  it("rejects missing, duplicate, and foreign question grades", () => {
    const g = { question_id: written.id, points: 2, feedback: "Partial" };
    const responses = { [written.id]: "work" };
    expect(() => combineGrades([written], responses, { grades: [] })).toThrow();
    expect(() =>
      combineGrades([written], responses, { grades: [g, g] }),
    ).toThrow();
    expect(() =>
      combineGrades([written], responses, {
        grades: [{ ...g, question_id: mc.id }],
      }),
    ).toThrow();
  });
  it("rejects zero-point empty tests", () => {
    expect(() => totalScore([])).toThrow();
  });
});
describe("generated-test validation", () => {
  const raw = { ...mc };
  it("accepts valid structured questions", () => {
    expect(
      generatedTestSchema.safeParse({
        questions: Array.from({ length: 10 }, () => raw),
      }).success,
    ).toBe(true);
  });
  it("rejects invented option keys and duplicate options", () => {
    for (const q of [
      { ...raw, answer_key: "E" },
      { ...raw, options: ["1", "1", "2", "4"] },
    ])
      expect(
        generatedTestSchema.safeParse({
          questions: Array.from({ length: 10 }, () => q),
        }).success,
      ).toBe(false);
  });
  it("requires written questions to omit options", () => {
    expect(
      generatedTestSchema.safeParse({
        questions: Array.from({ length: 10 }, () => ({ ...raw, kind: "math" })),
      }).success,
    ).toBe(false);
  });
  it("rejects unsupported sizes and time limits", () => {
    const config = {
      examId: mc.id,
      materialId: written.id,
      difficulty: "Hard",
      format: "mixed",
      count: 20,
      timeLimit: null,
    };
    expect(generateSchema.safeParse(config).success).toBe(true);
    expect(generateSchema.safeParse({ ...config, count: 200 }).success).toBe(
      false,
    );
    expect(generateSchema.safeParse({ ...config, timeLimit: 0 }).success).toBe(
      false,
    );
  });
});

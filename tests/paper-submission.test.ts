import { describe, expect, it } from "vitest";
import { mapExtractedPaperAnswers } from "../src/lib/paper-submission";
import type { PublicQuestion } from "../src/lib/types";

const questions: PublicQuestion[] = [
  { id: "q1", position: 0, kind: "multiple_choice", topic: "Algebra", prompt: "Solve for x.", options: ["1", "2", "3", "4"], max_points: 1 },
  { id: "q2", position: 1, kind: "math", topic: "Algebra", prompt: "Show your working.", options: null, max_points: 5 },
];

describe("paper photo answer matching", () => {
  it("converts marked MC letters to the actual option text", () => {
    const result = mapExtractedPaperAnswers({ answers: [{ number: 1, answer: "option c" }] }, questions);
    expect(result.answers).toEqual([{ questionId: "q1", number: 1, answer: "3" }]);
  });
  it("preserves transcribed intermediate steps", () => {
    const result = mapExtractedPaperAnswers({ answers: [{ number: 2, answer: " 2x + 4 = 10\nx = 3 " }] }, questions);
    expect(result.answers[0].answer).toBe("2x + 4 = 10\nx = 3");
  });
  it("does not assume illegible MC marks are correct answers", () => {
    const result = mapExtractedPaperAnswers({ answers: [{ number: 1, answer: "B or D" }, { number: 2, answer: "[unclear]" }, { number: 4, answer: "answer" }] }, questions);
    expect(result.answers).toEqual([{ questionId: "q2", number: 2, answer: "[unclear]" }]);
    expect(result.skipped).toBe(2);
  });
  it("deduplicates repeated question numbers", () => {
    const result = mapExtractedPaperAnswers({ answers: [{ number: 2, answer: "first page" }, { number: 2, answer: "second page" }] }, questions);
    expect(result.answers).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });
});

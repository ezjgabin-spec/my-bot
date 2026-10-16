import { z } from "zod";
import type { AnswerResult, Question } from "./types";
export const writtenGradesSchema = z.object({
  grades: z
    .array(
      z.object({
        question_id: z.string().uuid(),
        points: z.number().finite().nonnegative(),
        feedback: z.string().min(1).max(4000),
      }),
    )
    .max(40),
});
export function gradeMultipleChoice(
  q: Question,
  response: string,
): AnswerResult {
  if (q.kind !== "multiple_choice")
    throw new Error("Only multiple choice is graded by this function.");
  const correct = response === q.answer_key && !!q.options?.includes(response);
  return {
    question_id: q.id,
    response,
    points: correct ? q.max_points : 0,
    max_points: q.max_points,
    feedback: correct
      ? "Correct. " + q.explanation
      : "Incorrect. " + q.explanation,
    topic: q.topic,
  };
}
export function combineGrades(
  questions: Question[],
  responses: Record<string, string>,
  raw: unknown,
): AnswerResult[] {
  const parsed = writtenGradesSchema.parse(raw);
  const written = questions.filter(
    (q) => q.kind !== "multiple_choice" && responses[q.id]?.trim(),
  );
  if (
    parsed.grades.length !== written.length ||
    new Set(parsed.grades.map((g) => g.question_id)).size !== written.length
  )
    throw new Error(
      "Grading response has missing or duplicate questions. Please retry submission.",
    );
  for (const g of parsed.grades) {
    const q = written.find((q) => q.id === g.question_id);
    if (!q || g.points > q.max_points)
      throw new Error(
        "Grading response contains invalid points. Please retry submission.",
      );
  }
  return questions.map((q) => {
    const response = responses[q.id] ?? "";
    if (q.kind === "multiple_choice") return gradeMultipleChoice(q, response);
    const result = parsed.grades.find((g) => g.question_id === q.id);
    return {
      question_id: q.id,
      response,
      points: result ? Math.round(result.points * 100) / 100 : 0,
      max_points: q.max_points,
      feedback: result?.feedback ?? "No answer submitted.",
      topic: q.topic,
    };
  });
}
export function totalScore(results: AnswerResult[]) {
  const earned = results.reduce((s, r) => s + r.points, 0);
  const possible = results.reduce((s, r) => s + r.max_points, 0);
  if (possible <= 0) throw new Error("Test must contain graded questions.");
  return {
    earned,
    possible,
    score: Math.round((earned / possible) * 10000) / 100,
  };
}

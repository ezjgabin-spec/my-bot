import type { Attempt, PracticeTest } from "./types";
import type { ReadinessRecord } from "./readiness";
import { assessmentFormat } from "./prediction-research";
export type PracticeStage = {
  testId: string;
  attemptId: string;
  score: number;
  difficulty: string;
  format: string;
  completedAt: string;
};
export function practiceStages(
  examId: string,
  attempts: Attempt[],
  tests: PracticeTest[],
  before: string,
) {
  const seen = new Set<string>();
  const stages: PracticeStage[] = [];
  for (const a of attempts
    .filter(
      (a) =>
        a.exam_id === examId &&
        a.status === "completed" &&
        a.completed_at &&
        a.completed_at < before &&
        a.score !== null &&
        Number.isFinite(a.score) &&
        a.score >= 0 &&
        a.score <= 100,
    )
    .sort(
      (a, b) =>
        a.completed_at!.localeCompare(b.completed_at!) ||
        a.id.localeCompare(b.id),
    )) {
    const test = tests.find((t) => t.id === a.test_id && t.exam_id === examId);
    if (!test || seen.has(test.id)) continue;
    seen.add(test.id);
    stages.push({
      testId: test.id,
      attemptId: a.id,
      score: a.score!,
      difficulty: test.difficulty,
      format: assessmentFormat(test),
      completedAt: a.completed_at!,
    });
  }
  return stages;
}
const normalize = (s: string) =>
  s.trim().replace(/\s+/g, " ").toLocaleLowerCase();
export function comparePracticeStage(
  current: {
    sourceId: string;
    className: string;
    teacher: string;
    stages: PracticeStage[];
  },
  history: (Pick<
    ReadinessRecord,
    "id" | "kind" | "sourceId" | "className" | "teacher" | "actual"
  > & { at?: string })[],
  before: string,
) {
  const stage = current.stages.length;
  const latest = current.stages.at(-1);
  if (!latest) return { stage: 0, current: null, matches: [] };
  const seen = new Set<string>();
  const matches = history
    .filter(
      (r) =>
        r.kind === "test" &&
        r.sourceId !== current.sourceId &&
        normalize(r.className) === normalize(current.className) &&
        normalize(r.teacher) === normalize(current.teacher) &&
        r.actual &&
        r.actual.at < before &&
        (!r.at || r.at < r.actual.at),
    )
    .sort((a, b) => b.actual!.at.localeCompare(a.actual!.at))
    .flatMap((r) => {
      if (seen.has(r.sourceId)) return [];
      seen.add(r.sourceId);
      const previous = r.actual?.practiceStages?.[stage - 1];
      if (
        !previous ||
        previous.difficulty !== latest.difficulty ||
        previous.format !== latest.format ||
        previous.completedAt >= r.actual!.at
      )
        return [];
      return [
        {
          recordId: r.id,
          sourceId: r.sourceId,
          previousScore: previous.score,
          actualGrade: r.actual!.grade,
          actualAt: r.actual!.at,
          difference: Math.round((latest.score - previous.score) * 100) / 100,
        },
      ];
    });
  return { stage, current: latest, matches };
}
export type StageComparison = ReturnType<typeof comparePracticeStage>;

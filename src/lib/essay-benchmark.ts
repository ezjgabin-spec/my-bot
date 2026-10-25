import type { WritingDocument } from "./writing-types";
export type EssayStage = {
  revisionId: string;
  lower: number;
  upper: number;
  completedAt: string;
  rubric: string;
  method: string;
};
export const normalizeTag = (s: string) =>
  s.trim().replace(/\s+/g, " ").toLowerCase();
export function essayStages(
  doc: WritingDocument,
  before: string,
): EssayStage[] {
  const seen = new Set<string>();
  return doc.revisions
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .flatMap((r) => {
      if (r.action !== "grade" || !r.feedback || r.createdAt >= before)
        return [];
      // A repeated grade of the same text is not a new draft. Legacy grades used the original.
      const draft = (r.sourceSnapshot ?? doc.sourceText)
        .trim()
        .replace(/\s+/g, " ");
      if (seen.has(draft)) return [];
      seen.add(draft);
      return [
        {
          revisionId: r.id,
          lower: r.feedback.lower,
          upper: r.feedback.upper,
          completedAt: r.createdAt,
          rubric: normalizeTag(r.rubricSnapshot ?? doc.rubric),
          method: r.gradingRuns ? "three-runs-v1" : "legacy-single-run",
        },
      ];
    });
}
export type EssayBenchmark = {
  id: string;
  kind: "test" | "essay";
  sourceId: string;
  className: string;
  teacher: string;
  actual?: { grade: number; at: string; essayStages?: EssayStage[] };
};
export function compareEssayStage(
  current: {
    sourceId: string;
    className: string;
    teacher: string;
    stages: EssayStage[];
  },
  history: EssayBenchmark[],
  before: string,
) {
  const stage = current.stages.length,
    latest = current.stages.at(-1);
  if (!latest) return { stage: 0, current: null, matches: [] };
  const seen = new Set<string>();
  const matches = history
    .filter(
      (r) =>
        r.kind === "essay" &&
        r.sourceId !== current.sourceId &&
        r.actual &&
        r.actual.at < before &&
        normalizeTag(r.className) === normalizeTag(current.className) &&
        normalizeTag(r.teacher) === normalizeTag(current.teacher),
    )
    .sort((a, b) => b.actual!.at.localeCompare(a.actual!.at))
    .flatMap((r) => {
      if (seen.has(r.sourceId)) return [];
      seen.add(r.sourceId);
      const previous = r.actual!.essayStages?.[stage - 1];
      if (
        !previous ||
        previous.completedAt >= r.actual!.at ||
        previous.rubric !== latest.rubric ||
        previous.method !== latest.method
      )
        return [];
      return [
        {
          recordId: r.id,
          sourceId: r.sourceId,
          lower: previous.lower,
          upper: previous.upper,
          actualGrade: r.actual!.grade,
          difference:
            (latest.lower + latest.upper - (previous.lower + previous.upper)) /
            2,
        },
      ];
    });
  return { stage, current: latest, matches };
}
export type EssayComparisonResult = ReturnType<typeof compareEssayStage>;

import type { LocalData } from "./local-store";
import type { ReadinessRecord } from "./readiness";
import { essayStages } from "./essay-benchmark";
import { practiceStages } from "./practice-benchmark";
export type AssessmentContext = {
  id: string;
  kind: "test" | "essay";
  sourceId: string;
  className: string;
  teacher: string;
  updatedAt: string;
  outcome?: NonNullable<ReadinessRecord["actual"]>;
};
export function sourceOutcome(
  d: LocalData,
  kind: "test" | "essay",
  sourceId: string,
) {
  if (kind === "test") {
    const g = d.grades.find((g) => g.exam_id === sourceId);
    return g
      ? {
          grade: g.grade,
          at: g.recorded_at,
          practiceStages: practiceStages(
            sourceId,
            d.attempts,
            d.tests,
            g.recorded_at,
          ),
        }
      : undefined;
  }
  const doc = d.writingDocuments.find((e) => e.id === sourceId);
  return doc?.actualTeacherGrade !== undefined && doc.actualTeacherRecordedAt
    ? {
        grade: doc.actualTeacherGrade,
        at: doc.actualTeacherRecordedAt,
        essayStages: essayStages(doc, doc.actualTeacherRecordedAt),
      }
    : undefined;
}
// Retrospective context is kept separate from prospective accuracy/calibration records.
export function benchmarkHistory(d: LocalData) {
  return [
    ...d.readinessRecords.map((r) => ({
      ...r,
      actual: r.actual
        ? {
            ...r.actual,
            ...(r.kind === "test"
              ? {
                  practiceStages:
                    r.actual.practiceStages ??
                    practiceStages(
                      r.sourceId,
                      d.attempts,
                      d.tests,
                      r.actual.at,
                    ),
                }
              : {
                  essayStages:
                    r.actual.essayStages ??
                    (d.writingDocuments.find((e) => e.id === r.sourceId)
                      ? essayStages(
                          d.writingDocuments.find((e) => e.id === r.sourceId)!,
                          r.actual.at,
                        )
                      : []),
                }),
          }
        : sourceOutcome(d, r.kind, r.sourceId),
    })),
    ...d.assessmentContexts
      .filter(
        (c) =>
          !d.readinessRecords.some(
            (r) => r.kind === c.kind && r.sourceId === c.sourceId,
          ),
      )
      .map((c) => ({
        ...c,
        at: undefined,
        actual: c.outcome ?? sourceOutcome(d, c.kind, c.sourceId),
      })),
  ];
}

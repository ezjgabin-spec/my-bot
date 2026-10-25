import type { LocalData } from "./local-store";
import { AppError } from "./server";
import { practiceStages } from "./practice-benchmark";
import { essayStages } from "./essay-benchmark";
export function linkReadinessOutcome(
  d: LocalData,
  kind: "test" | "essay",
  sourceId: string,
  grade: number,
  at: string,
) {
  const record = d.readinessRecords.find(
    (r) => r.kind === kind && r.sourceId === sourceId,
  );
  if (!record) return;
  if (record.actual) {
    if (record.actual.grade !== grade)
      throw new AppError(
        "This outcome is linked to a locked readiness prediction and cannot be changed.",
        409,
      );
    return;
  }
  const doc = d.writingDocuments.find((e) => e.id === sourceId);
  record.actual = {
    grade,
    at,
    ...(kind === "test"
      ? { practiceStages: practiceStages(sourceId, d.attempts, d.tests, at) }
      : { essayStages: doc ? essayStages(doc, at) : [] }),
  };
}

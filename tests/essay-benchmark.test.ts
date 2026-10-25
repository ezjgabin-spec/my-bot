import { it, expect } from "vitest";
import { essayStages, compareEssayStage } from "../src/lib/essay-benchmark";
import type {
  WritingDocument,
  WritingRevision,
} from "../src/lib/writing-types";
const revision = (
  id: string,
  text: string,
  lower: number,
  upper: number,
  at: string,
) =>
  ({
    id,
    action: "grade",
    sourceSnapshot: text,
    rubricSnapshot: "Evidence and argument",
    createdAt: at,
    feedback: { lower, upper },
    gradingRuns: [{}, {}, {}],
  }) as WritingRevision;
const doc = (id: string, revisions: WritingRevision[]) =>
  ({
    id,
    sourceText: "Original",
    rubric: "Evidence and argument",
    revisions,
  }) as WritingDocument;
it("compares the same distinct draft stage and ignores repeat grading or post-outcome edits", () => {
  const old = doc("old", [
    revision("a", "Original", 60, 70, "2026-01-01"),
    revision("b", "New draft", 65, 75, "2026-01-02"),
    revision("c", "New   draft", 90, 100, "2026-01-03"),
    revision("d", "After grade", 99, 100, "2026-03-01"),
  ]);
  const stages = essayStages(old, "2026-02-01");
  expect(stages).toHaveLength(2);
  const current = doc("new", [
    revision("e", "First draft", 60, 70, "2026-04-01"),
    revision("f", "Second draft", 78, 88, "2026-04-02"),
  ]);
  const history = [
    {
      id: "r",
      kind: "essay" as const,
      sourceId: "old",
      className: "English",
      teacher: "Ms A",
      actual: { grade: 89, at: "2026-02-01", essayStages: stages },
    },
  ];
  const result = compareEssayStage(
    {
      sourceId: "new",
      className: " english ",
      teacher: "MS A",
      stages: essayStages(current, "2026-05-01"),
    },
    history,
    "2026-05-01",
  );
  expect(result.stage).toBe(2);
  expect(result.matches[0]).toMatchObject({
    lower: 65,
    upper: 75,
    actualGrade: 89,
    difference: 13,
  });
  for (const changed of [
    { ...history[0], teacher: "Ms B" },
    { ...history[0], actual: { ...history[0].actual, at: "2026-06-01" } },
    {
      ...history[0],
      actual: {
        ...history[0].actual,
        essayStages: stages.map((s) => ({ ...s, rubric: "Different rubric" })),
      },
    },
  ]) {
    expect(
      compareEssayStage(
        {
          sourceId: "new",
          className: "English",
          teacher: "Ms A",
          stages: essayStages(current, "2026-05-01"),
        },
        [changed],
        "2026-05-01",
      ).matches,
    ).toHaveLength(0);
  }
});

import { describe, it, expect } from "vitest";
import {
  practiceStages,
  comparePracticeStage,
  type PracticeStage,
} from "../src/lib/practice-benchmark";
import type { Attempt, PracticeTest } from "../src/lib/types";
import type { ReadinessRecord } from "../src/lib/readiness";
const stage = (score: number, n = 1): PracticeStage => ({
  testId: `test-${n}`,
  attemptId: `attempt-${n}`,
  score,
  difficulty: "Medium",
  format: "multiple_choice",
  completedAt: `2026-01-0${n + 1}`,
});
const previous: ReadinessRecord = {
  id: "prior",
  kind: "test",
  sourceId: "old-exam",
  className: "Statistics",
  teacher: "Ms Smith",
  at: "2026-01-01",
  version: "v1",
  lower: 60,
  upper: 90,
  nominalCoverage: 0.8,
  calibrationCount: 0,
  runningGrade: 80,
  guess: 85,
  info: {},
  actual: {
    at: "2026-01-10",
    grade: 89,
    practiceStages: [stage(60), stage(65, 2), stage(90, 3)],
  },
};
const current = {
  sourceId: "new-exam",
  className: " Statistics ",
  teacher: "ms smith",
  stages: [stage(70), stage(78, 2)],
};
describe("same-stage benchmarks", () => {
  it("compares 78 on test two with 65 on test two and the actual 89, not the final practice score", () => {
    const before = JSON.stringify(previous);
    const result = comparePracticeStage(current, [previous], "2026-02-01");
    expect(result.stage).toBe(2);
    expect(result.matches[0]).toMatchObject({
      previousScore: 65,
      actualGrade: 89,
      difference: 13,
    });
    expect(JSON.stringify(previous)).toBe(before);
  });
  it("excludes different teachers/classes, formats, difficulty, future outcomes, essays and same assessment", () => {
    const variants = [
      { ...previous, teacher: "Other" },
      { ...previous, className: "English" },
      { ...previous, kind: "essay" as const },
      { ...previous, sourceId: "new-exam" },
      { ...previous, actual: { ...previous.actual!, at: "2026-03-01" } },
      {
        ...previous,
        actual: {
          ...previous.actual!,
          practiceStages: [stage(60), { ...stage(65, 2), difficulty: "Hard" }],
        },
      },
      {
        ...previous,
        actual: {
          ...previous.actual!,
          practiceStages: [stage(60), { ...stage(65, 2), format: "math" }],
        },
      },
    ];
    for (const candidate of variants)
      expect(
        comparePracticeStage(current, [candidate], "2026-02-01").matches,
      ).toHaveLength(0);
  });
  it("does not invent stages for missing attempts, handles equal/lower scores, and deduplicates assessments", () => {
    expect(
      comparePracticeStage({ ...current, stages: [] }, [previous], "2026-02-01")
        .stage,
    ).toBe(0);
    expect(
      comparePracticeStage(
        current,
        [
          {
            ...previous,
            actual: { ...previous.actual!, practiceStages: [stage(60)] },
          },
        ],
        "2026-02-01",
      ).matches,
    ).toHaveLength(0);
    expect(
      comparePracticeStage(
        { ...current, stages: [stage(70), stage(65, 2)] },
        [previous, previous],
        "2026-02-01",
      ).matches,
    ).toHaveLength(1);
    expect(
      comparePracticeStage(
        { ...current, stages: [stage(70), stage(60, 2)] },
        [previous],
        "2026-02-01",
      ).matches[0].difference,
    ).toBe(-5);
  });
  it("orders by completion time and counts first completions of distinct tests only", () => {
    const tests = [
      {
        id: "t1",
        exam_id: "exam",
        format: "multiple_choice",
        difficulty: "Medium",
      },
      { id: "t2", exam_id: "exam", format: "math", difficulty: "Hard" },
    ] as PracticeTest[];
    const attempts = [
      {
        id: "a2",
        exam_id: "exam",
        test_id: "t2",
        status: "completed",
        score: 78,
        completed_at: "2026-01-03",
      },
      {
        id: "a1",
        exam_id: "exam",
        test_id: "t1",
        status: "completed",
        score: 65,
        completed_at: "2026-01-02",
      },
      {
        id: "repeat",
        exam_id: "exam",
        test_id: "t1",
        status: "completed",
        score: 100,
        completed_at: "2026-01-04",
      },
      {
        id: "later",
        exam_id: "exam",
        test_id: "t2",
        status: "completed",
        score: 99,
        completed_at: "2026-03-01",
      },
    ] as Attempt[];
    expect(
      practiceStages("exam", attempts, tests, "2026-02-01").map((p) => p.score),
    ).toEqual([65, 78]);
  });
});

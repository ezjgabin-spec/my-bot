import { describe, it, expect } from "vitest";
import {
  predictGrade,
  attemptFeatures,
  pairedOutcomes,
  historyFromState,
} from "../src/lib/prediction";
import type {
  PredictionFeatures,
  HistoryExample,
  Prediction,
  Exam,
  ActualGrade,
  Attempt,
  PracticeTest,
  State,
} from "../src/lib/types";
const now = new Date("2026-10-01T12:00:00Z");
const features: PredictionFeatures = {
  latest: 95,
  average: 95,
  improvement: 0,
  difficulty: "Medium",
  format: "mixed",
  questionCount: 20,
  topics: ["Functions"],
  attemptCount: 1,
};
const predict = (history: HistoryExample[] = [], f = features) =>
  predictGrade({
    examId: "target",
    subject: "Precalculus",
    features: f,
    history,
    now,
  });
function example(
  id: string,
  actual = 92,
  subject = "Precalculus",
): HistoryExample {
  return {
    examId: id,
    subject,
    actual,
    baseline: 89,
    predicted: 89,
    recordedAt: "2026-09-25T12:00:00Z",
    predictedAt: "2026-09-20T12:00:00Z",
    features,
  };
}
function snapshot(
  id: string,
  examId = "e",
  created_at = "2026-09-20T12:00:00Z",
): Prediction {
  return {
    id,
    exam_id: examId,
    attempt_id: id,
    subject: "Precalculus",
    created_at,
    ...predict(),
  };
}
const exams: Exam[] = [
  {
    id: "e",
    name: "Functions",
    subject_id: "s",
    exam_date: "2026-09-24",
    created_at: "2026-09-01T12:00:00Z",
  },
];
const grades: ActualGrade[] = [
  { exam_id: "e", grade: 93, recorded_at: "2026-09-25T12:00:00Z" },
];
describe("personal grade prediction", () => {
  function multiQuiz(scores: number[]) {
    return attemptFeatures(
      scores.map((score, i) => ({
        id: String(i),
        test_id: "t",
        status: "completed",
        score,
        completed_at: new Date(Date.UTC(2026, 8, i + 1)).toISOString(),
      })) as Attempt[],
      [
        {
          id: "t",
          difficulty: "Medium",
          format: "mixed",
          question_count: 20,
          topics: ["Functions"],
        },
      ] as PracticeTest[],
    );
  }
  it("puts two early 60s followed by three strong 90s in the mid-to-high 80s", () => {
    const f = multiQuiz([60, 65, 92, 94, 96]);
    expect(predict([], f).predicted).toBeGreaterThanOrEqual(85);
    expect(predict([], f).predicted).toBeLessThan(90);
    expect(f.attemptCount).toBe(5);
  });
  it("retains every quiz while favoring recent scores and softening a bad last quiz", () => {
    const scores = [60, 65, 92, 94, 96];
    const base = multiQuiz(scores).weightedAverage!;
    const changes = scores.map(
      (_, i) =>
        multiQuiz(scores.map((score, j) => score + (i === j ? 1 : 0)))
          .weightedAverage! - base,
    );
    expect(changes.every((change) => change > 0)).toBe(true);
    expect(changes).toEqual([...changes].sort((a, b) => a - b));
    expect(
      predict([], multiQuiz([94, 94, 94, 94, 60])).predicted,
    ).toBeGreaterThan(70);
  });
  it("uses an honest conservative cold start with a wide range", () => {
    const p = predict();
    expect(p.predicted).toBe(89);
    expect(p.confidence).toBe("low");
    expect(p.sample_size).toBe(0);
    expect(p.upper - p.lower).toBeGreaterThan(25);
    expect(p.explanation).toMatch(/no paired school results/);
  });
  it("bounds estimates and ranges at both score limits", () => {
    for (const score of [0, 1, 99, 100]) {
      const p = predict([], { ...features, latest: score, average: score });
      expect(p.lower).toBeGreaterThanOrEqual(0);
      expect(p.upper).toBeLessThanOrEqual(100);
      expect(p.predicted).toBeGreaterThanOrEqual(p.lower);
      expect(p.predicted).toBeLessThanOrEqual(p.upper);
    }
  });
  it("rejects invalid practice scores", () => {
    expect(() => predict([], { ...features, latest: NaN })).toThrow();
    expect(() => predict([], { ...features, average: 101 })).toThrow();
  });
  it("learns from a new actual grade without mutating prior snapshots", () => {
    const history = [example("a")];
    const frozen = JSON.stringify(history);
    expect(predict(history).predicted).toBeGreaterThan(predict().predicted);
    expect(JSON.stringify(history)).toBe(frozen);
  });
  it("counts repeated attempts on one exam only once", () => {
    const e = example("a");
    expect(predict([e, e, e, e])).toEqual(predict([e]));
  });
  it("selects the most recent pre-result forecast per exam", () => {
    const old = {
      ...example("a"),
      actual: 50,
      predictedAt: "2026-09-01T00:00:00Z",
    };
    expect(predict([old, example("a")])).toEqual(predict([example("a")]));
  });
  it("excludes the target exam, future outcomes, and post-outcome predictions", () => {
    const history = [
      example("target"),
      { ...example("future"), recordedAt: "2026-11-01T00:00:00Z" },
      { ...example("leak"), predictedAt: "2026-09-26T00:00:00Z" },
    ];
    expect(predict(history)).toEqual(predict());
  });
  it("limits the influence of a single extreme outcome", () => {
    expect(Math.abs(predict([example("outlier", 0)]).adjustment)).toBeLessThan(
      8,
    );
  });
  it("weights subject-matched outcomes more heavily when data is sparse", () => {
    expect(predict([example("a", 99)]).adjustment).toBeGreaterThan(
      predict([example("a", 99, "History")]).adjustment,
    );
  });
  it("switches to subject-specific calibration only after five exams", () => {
    const same = Array.from({ length: 5 }, (_, i) => example(String(i), 94));
    const mixed = [
      ...same,
      ...Array.from({ length: 20 }, (_, i) =>
        example(`other${i}`, 0, "History"),
      ),
    ];
    expect(predict(mixed)).toEqual(predict(same));
    expect(predict(mixed).explanation).toMatch(/subject-specific/);
  });
  it("gives recent exams more influence", () => {
    const old = {
      ...example("a", 99),
      recordedAt: "2024-01-01T00:00:00Z",
      predictedAt: "2023-12-25T00:00:00Z",
    };
    expect(predict([example("a", 99)]).adjustment).toBeGreaterThan(
      predict([old]).adjustment,
    );
  });
  it("narrows ranges with abundant accurate outcomes", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      ...example(String(i), 89),
      predicted: 89,
    }));
    expect(predict(history).upper - predict(history).lower).toBeLessThan(
      predict().upper - predict().lower,
    );
    expect(predict(history).confidence).toBe("higher");
  });
  it("widens ranges when historical forecasts are inaccurate", () => {
    const accurate = Array.from({ length: 8 }, (_, i) => ({
      ...example(String(i), 90),
      predicted: 90,
    }));
    const inaccurate = accurate.map((h) => ({ ...h, predicted: 50 }));
    expect(
      predict(inaccurate).upper - predict(inaccurate).lower,
    ).toBeGreaterThan(predict(accurate).upper - predict(accurate).lower);
  });
  it("discounts easy tests more than teacher-level tests", () => {
    expect(
      predict([], { ...features, difficulty: "Easy" }).predicted,
    ).toBeLessThan(
      predict([], { ...features, difficulty: "Teacher-Level" }).predicted,
    );
  });
  it("uses latest, average, and bounded improvement across attempts", () => {
    const attempts = [
      {
        id: "1",
        test_id: "t",
        status: "completed",
        score: 60,
        completed_at: "2026-09-01",
      },
      {
        id: "2",
        test_id: "t",
        status: "completed",
        score: 90,
        completed_at: "2026-09-02",
      },
      { id: "3", test_id: "t", status: "in_progress", score: null },
    ] as Attempt[];
    const tests = [
      {
        id: "t",
        difficulty: "Hard",
        format: "math",
        question_count: 20,
        topics: ["Functions"],
      },
    ] as PracticeTest[];
    const f = attemptFeatures(attempts, tests);
    expect(f).toMatchObject({
      latest: 90,
      average: 75,
      improvement: 30,
      attemptCount: 2,
    });
    expect(predict([], f).predicted).toBeLessThan(95);
  });
  it("does not create predictions without completed attempts", () => {
    expect(() => attemptFeatures([], [])).toThrow(/Complete a practice/);
  });
});
describe("immutable prediction/outcome pairing", () => {
  it("pairs each school result with exactly one eligible forecast", () => {
    const ps = [
      snapshot("first"),
      snapshot("second", "e", "2026-09-23T12:00:00Z"),
      snapshot("late", "e", "2026-09-26T12:00:00Z"),
    ];
    const result = pairedOutcomes(ps, grades, exams);
    expect(result).toHaveLength(1);
    expect(result[0].prediction.id).toBe("second");
    expect(result[0].error).toBe(4);
  });
  it("excludes forecasts after the school exam even if the grade is entered later", () => {
    expect(
      pairedOutcomes(
        [snapshot("late", "e", "2026-09-25T10:00:00Z")],
        grades,
        exams,
      ),
    ).toHaveLength(0);
  });
  it("uses the grade recording time when no exam date is known", () => {
    expect(
      pairedOutcomes([snapshot("a")], grades, [
        { ...exams[0], exam_date: null },
      ]),
    ).toHaveLength(1);
  });
  it("does not invent comparisons for an actual grade with no forecast", () => {
    expect(pairedOutcomes([], grades, exams)).toEqual([]);
  });
  it("keeps a saved prediction unchanged when the actual grade is corrected", () => {
    const ps = [snapshot("a")];
    const original = JSON.stringify(ps);
    const first = pairedOutcomes(ps, grades, exams);
    const second = pairedOutcomes(ps, [{ ...grades[0], grade: 80 }], exams);
    expect(first[0].prediction).toEqual(second[0].prediction);
    expect(first[0].error).not.toEqual(second[0].error);
    expect(JSON.stringify(ps)).toBe(original);
  });
  it("builds calibration examples from real paired data only", () => {
    const state = { predictions: [snapshot("a")], grades, exams } as State;
    expect(historyFromState(state)).toHaveLength(1);
    expect(historyFromState(state)[0].actual).toBe(93);
  });
});

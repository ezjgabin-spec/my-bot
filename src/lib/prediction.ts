import type {
  ActualGrade,
  Attempt,
  Exam,
  HistoryExample,
  Prediction,
  PredictionFeatures,
  PracticeTest,
  State,
} from "./types";
export const MODEL_VERSION = "personal-calibration-v2-range-cap10";
// Product display constraint, NOT an empirical confidence or coverage guarantee.
export const MAX_DISPLAY_HALF_RANGE = 10;
const offsets = { Easy: -10, Medium: -6, Hard: -2, "Teacher-Level": -1 };
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n * 10) / 10;
export const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

/** One immutable, pre-outcome forecast per exam. No attempt-level pseudo-replication. */
export function pairedOutcomes(
  predictions: Prediction[],
  grades: ActualGrade[],
  exams: Exam[],
) {
  return grades.flatMap((grade) => {
    const exam = exams.find((e) => e.id === grade.exam_id);
    const cutoff = Math.min(
      Date.parse(grade.recorded_at),
      exam?.exam_date
        ? Date.parse(`${exam.exam_date}T23:59:59.999Z`)
        : Infinity,
    );
    const prediction = predictions
      .filter(
        (p) => p.exam_id === grade.exam_id && Date.parse(p.created_at) < cutoff,
      )
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    return prediction
      ? [{ grade, prediction, exam, error: grade.grade - prediction.predicted }]
      : [];
  });
}
export function historyFromState(state: State): HistoryExample[] {
  return pairedOutcomes(state.predictions, state.grades, state.exams).map(
    ({ grade, prediction }) => ({
      examId: grade.exam_id,
      subject: prediction.subject,
      actual: grade.grade,
      baseline: prediction.baseline,
      predicted: prediction.predicted,
      recordedAt: grade.recorded_at,
      predictedAt: prediction.created_at,
      features: prediction.features,
    }),
  );
}
export function attemptFeatures(
  attempts: Attempt[],
  tests: PracticeTest[],
): PredictionFeatures {
  const sorted = attempts
    .filter((a) => a.status === "completed" && a.score !== null)
    .sort((a, b) => Date.parse(a.completed_at!) - Date.parse(b.completed_at!));
  if (!sorted.length)
    throw new Error("Complete a practice attempt before predicting a grade.");
  const latest = sorted.at(-1)!;
  const test = tests.find((t) => t.id === latest.test_id);
  if (!test) throw new Error("Missing test metadata.");
  // Rank-squared weights retain every completed quiz while favoring recent work.
  // Normalize ranks first so long histories cannot overflow the weight sum.
  const weights = sorted.map((_, index) => ((index + 1) / sorted.length) ** 2);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const weightedAverage =
    sorted.reduce(
      (sum, attempt, index) => sum + attempt.score! * weights[index],
      0,
    ) / weightSum;
  const weightedDifficultyOffset =
    sorted.reduce((sum, attempt, index) => {
      const metadata = tests.find((item) => item.id === attempt.test_id);
      if (!metadata) throw new Error("Missing test metadata.");
      return sum + offsets[metadata.difficulty] * weights[index];
    }, 0) / weightSum;
  return {
    weightedAverage,
    weightedDifficultyOffset,
    latest: latest.score!,
    average: mean(sorted.map((a) => a.score!)),
    improvement: latest.score! - sorted[0].score!,
    difficulty: test.difficulty,
    format: test.format,
    questionCount: test.question_count,
    topics: test.topics,
    attemptCount: sorted.length,
  };
}
export function predictGrade(input: {
  examId: string;
  subject: string;
  features: PredictionFeatures;
  history: HistoryExample[];
  now?: Date;
}) {
  const { features: f, subject, examId } = input;
  const now = input.now ?? new Date();
  for (const score of [f.latest, f.average, f.weightedAverage ?? f.average])
    if (!Number.isFinite(score) || score < 0 || score > 100)
      throw new Error("Practice scores must be between 0 and 100.");
  const baseline = clamp(
    (f.weightedAverage ?? f.average) +
      (f.weightedDifficultyOffset ?? offsets[f.difficulty]),
  );
  const unique = new Map<string, HistoryExample>();
  for (const h of input.history) {
    if (
      h.examId === examId ||
      Date.parse(h.recordedAt) > now.getTime() ||
      Date.parse(h.predictedAt) >= Date.parse(h.recordedAt)
    )
      continue;
    if (
      ![h.actual, h.baseline, h.predicted].every(
        (n) => Number.isFinite(n) && n >= 0 && n <= 100,
      )
    )
      continue;
    const previous = unique.get(h.examId);
    if (
      !previous ||
      Date.parse(h.predictedAt) > Date.parse(previous.predictedAt)
    )
      unique.set(h.examId, h);
  }
  const all = [...unique.values()];
  const same = all.filter((h) => h.subject === subject);
  const subjectSpecific = same.length >= 5;
  const selected = subjectSpecific ? same : all;
  const weighted = selected.map((h) => {
    const ageDays = Math.max(
      0,
      (now.getTime() - Date.parse(h.recordedAt)) / 86400000,
    );
    const overlap = f.topics.length
      ? f.topics.filter((t) => h.features.topics.includes(t)).length /
        f.topics.length
      : 0;
    const weight =
      Math.pow(0.5, ageDays / 180) *
      (h.subject === subject ? 1 : 0.35) *
      (h.features.difficulty === f.difficulty ? 1.2 : 1) *
      (h.features.format === f.format ? 1.1 : 1) *
      (1 + overlap * 0.3);
    return { h, weight };
  });
  const weightSum = weighted.reduce((s, x) => s + x.weight, 0);
  // Shrink toward the conservative prior; clip each residual so one outlier cannot dominate.
  const adjustment =
    weighted.reduce(
      (s, { h, weight }) => s + clamp(h.actual - h.baseline, -20, 20) * weight,
      0,
    ) /
    (weightSum + 3);
  const predicted = clamp(baseline + adjustment);
  const historicalMae = weightSum
    ? weighted.reduce(
        (s, { h, weight }) => s + Math.abs(h.actual - h.predicted) * weight,
        0,
      ) / weightSum
    : 12;
  const width = clamp(
    1.5 * historicalMae +
      12 / Math.sqrt(weightSum + 1) +
      (f.questionCount <= 10 ? 2 : 0),
    6,
    30,
  );
  // Preserve the research-driven width internally, but never advertise an
  // excessively broad band in the student-facing forecast.  Capping a range
  // does not make the model more accurate or increase its confidence.
  const displayedWidth = Math.min(width, MAX_DISPLAY_HALF_RANGE);
  const widthIsCapped = width > MAX_DISPLAY_HALF_RANGE;
  const rangeDisclosure = widthIsCapped
    ? "Displayed range capped at ±10 percentage points for readability; underlying uncertainty is greater, so this band is not a reliable coverage interval."
    : "Displayed range is a heuristic estimate, not a statistically validated coverage interval.";
  const confidence =
    weightSum < 5 ? "low" : weightSum < 15 ? "moderate" : "higher";
  return {
    predicted: round(predicted),
    lower: round(clamp(predicted - displayedWidth)),
    upper: round(clamp(predicted + displayedWidth)),
    baseline: round(baseline),
    adjustment: round(adjustment),
    confidence: confidence as "low" | "moderate" | "higher",
    sample_size: selected.length,
    features: f,
    model_version: MODEL_VERSION,
    explanation:
      selected.length === 0
        ? `Low confidence: no paired school results yet. Uses all ${f.attemptCount} completed practice quizzes for this exam, with more weight on recent quizzes and an adjustment for each quiz's difficulty. ${rangeDisclosure}`
        : `Uses all ${f.attemptCount} completed practice quizzes for this exam, weighted toward recent results and adjusted for difficulty. Calibrated on ${selected.length} distinct school exam${selected.length === 1 ? "" : "s"} using ${subjectSpecific ? "subject-specific" : "subject-weighted overall"} results. Recent and similar exams count more; outliers are capped and adjustments shrink toward the baseline. Range uses errors from saved pre-result predictions. Confidence is ${confidence}; ${rangeDisclosure} This is an estimate, not a guaranteed grade.`,
  };
}

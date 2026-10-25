export type ReadinessRecord = {
  id: string;
  kind: "test" | "essay";
  sourceId: string;
  className: string;
  teacher: string;
  at: string;
  version: string;
  lower: number;
  upper: number;
  nominalCoverage: number;
  calibrationCount: number;
  runningGrade: number;
  guess: number;
  info: unknown;
  comparison?: {
    lower: number;
    upper: number;
    at: string;
    model: string;
    version: string;
  };
  actual?: { grade: number; at: string };
};
export function readinessMetrics(rows: ReadinessRecord[]) {
  const pairs = rows.filter((r) => r.actual && r.actual.at > r.at);
  const mean = (v: number[]) =>
    v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  return {
    count: pairs.length,
    coverage: mean(
      pairs.map((r) =>
        Number(r.actual!.grade >= r.lower && r.actual!.grade <= r.upper),
      ),
    ),
    width: mean(pairs.map((r) => r.upper - r.lower)),
    methods: ["app", "guess", "runningGrade", "claude"].map((method) => {
      const selected = pairs.filter(
        (r) =>
          method !== "claude" ||
          (r.comparison && r.comparison.at < r.actual!.at),
      );
      const errors = selected.map((r) => {
        const estimate =
          method === "app"
            ? (r.lower + r.upper) / 2
            : method === "claude"
              ? (r.comparison!.lower + r.comparison!.upper) / 2
              : method === "guess"
                ? r.guess
                : r.runningGrade;
        return estimate - r.actual!.grade;
      });
      return {
        method,
        count: errors.length,
        mae: mean(errors.map(Math.abs)),
        bias: mean(errors),
      };
    }),
  };
}
export function calibratedRange(center: number, history: ReadinessRecord[]) {
  const errors = history
    .filter((r) => r.actual)
    .map((r) => Math.abs(r.actual!.grade - (r.lower + r.upper) / 2))
    .sort((a, b) => a - b);
  const half =
    errors.length >= 30
      ? errors[
          Math.min(errors.length - 1, Math.ceil((errors.length + 1) * 0.8) - 1)
        ]
      : 20;
  return {
    lower: Math.max(0, center - half),
    upper: Math.min(100, center + half),
    calibrationCount: errors.length,
  };
}

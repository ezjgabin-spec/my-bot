import { z } from "zod";
const operation = z.enum([
  "sum",
  "product",
  "mean",
  "difference",
  "ratio",
  "power",
  "sample_sd",
  "population_sd",
  "sample_variance",
  "median",
  "sqrt",
  "log",
  "exp",
  "linear_root",
  "binomial_pmf",
  "binomial_cdf",
  "normal_cdf",
]);
const operand = z.union([
  z.number().finite(),
  z.object({ step: z.number().int().min(0).max(31) }).strict(),
]);
const instruction = z
  .object({ operation, values: z.array(operand).min(1).max(100) })
  .strict();
export const calculationSchema = instruction.extend({
  steps: z
    .array(instruction)
    .max(32)
    .optional()
    .describe(
      "Optional intermediate computations. {step:0} refers to the first completed step. Only backward references are allowed.",
    ),
  decimalPlaces: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .describe(
      "Round the final result only if the question explicitly requests this many decimal places.",
    ),
});
function calculate(o: z.infer<typeof operation>, v: number[]) {
  const arity = (n: number) => {
    if (v.length !== n) throw Error(`${o} requires ${n} inputs`);
  };
  if (
    [
      "sum",
      "product",
      "mean",
      "sample_sd",
      "sample_variance",
      "population_sd",
    ].includes(o) &&
    v.length < 2
  )
    throw Error("At least two source values required");
  const mean = () => v.reduce((a, b) => a + b, 0) / v.length;
  switch (o) {
    case "sum":
      return v.reduce((a, b) => a + b, 0);
    case "product":
      return v.reduce((a, b) => a * b, 1);
    case "mean":
      return mean();
    case "median": {
      const a = [...v].sort((a, b) => a - b),
        m = Math.floor(a.length / 2);
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }
    case "sample_sd":
    case "sample_variance":
    case "population_sd": {
      const m = mean(),
        variance =
          v.reduce((s, x) => s + (x - m) ** 2, 0) /
          (v.length - (o === "population_sd" ? 0 : 1));
      return o === "sample_variance" ? variance : Math.sqrt(variance);
    }
    case "difference":
      arity(2);
      return v[0] - v[1];
    case "ratio":
      arity(2);
      return v[0] / v[1];
    case "power":
      arity(2);
      return v[0] ** v[1];
    case "sqrt":
      arity(1);
      return Math.sqrt(v[0]);
    case "log":
      arity(1);
      return Math.log(v[0]);
    case "exp":
      arity(1);
      return Math.exp(v[0]);
    case "linear_root":
      arity(2);
      return -v[1] / v[0];
    case "binomial_pmf":
    case "binomial_cdf": {
      arity(3);
      const [n, p, k] = v;
      if (
        !Number.isInteger(n) ||
        n < 0 ||
        n > 10000 ||
        !Number.isInteger(k) ||
        k < 0 ||
        k > n ||
        p < 0 ||
        p > 1
      )
        throw Error("Invalid binomial n,p,k");
      if (p === 0) return o === "binomial_cdf" || k === 0 ? 1 : 0;
      if (p === 1) return k === n ? 1 : 0;
      let logChoose = 0,
        total = 0;
      for (let i = 0; i <= k; i++) {
        if (i) logChoose += Math.log(n - i + 1) - Math.log(i);
        const mass = Math.exp(
          logChoose + i * Math.log(p) + (n - i) * Math.log1p(-p),
        );
        if (o === "binomial_cdf") total += mass;
        else if (i === k) return mass;
      }
      return Math.min(1, total);
    }
    case "normal_cdf": {
      arity(3);
      const [x, mu, sd] = v;
      if (sd <= 0) throw Error("Standard deviation must be positive");
      const z = (x - mu) / sd;
      if (z === 0) return 0.5;
      const a = Math.abs(z),
        t = 1 / (1 + 0.2316419 * a);
      const tail =
        (Math.exp((-a * a) / 2) / Math.sqrt(2 * Math.PI)) *
        t *
        (0.31938153 +
          t *
            (-0.356563782 +
              t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
      return z > 0 ? 1 - tail : tail;
    }
  }
}
export function computeKey(input: z.infer<typeof calculationSchema>) {
  const spec = calculationSchema.parse(input),
    results: number[] = [];
  const execute = (s: z.infer<typeof instruction>) => {
    const v = s.values.map((x) => {
      if (typeof x === "number") return x;
      if (x.step >= results.length)
        throw Error("Forward or missing step reference");
      return results[x.step];
    });
    const n = calculate(s.operation, v);
    if (!Number.isFinite(n)) throw Error("Undefined computation");
    return n;
  };
  for (const step of spec.steps ?? []) results.push(execute(step));
  const answer = execute(spec);
  return spec.decimalPlaces === undefined
    ? answer
    : Number(answer.toFixed(spec.decimalPlaces));
}
export type KeyAudit = {
  status: "computed" | "verified" | "unverified" | "mismatch";
  reason: string;
  version: string;
  computed?: number;
};

import { z } from "zod";
export const calculationSchema = z.object({
  operation: z.enum([
    "sum",
    "product",
    "mean",
    "difference",
    "ratio",
    "power",
    "sample_sd",
  ]),
  values: z.array(z.number().finite()).min(1).max(100),
});
export function computeKey(spec: z.infer<typeof calculationSchema>) {
  const { operation: o, values: v } = spec;
  let n: number;
  if (o === "sum") n = v.reduce((a, b) => a + b, 0);
  else if (o === "product") n = v.reduce((a, b) => a * b, 1);
  else if (o === "mean") n = v.reduce((a, b) => a + b, 0) / v.length;
  else if (o === "sample_sd") {
    if (v.length < 2) throw Error("At least two values required");
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    n = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
  } else {
    if (v.length !== 2) throw Error("Two values required");
    n =
      o === "difference"
        ? v[0] - v[1]
        : o === "ratio"
          ? v[0] / v[1]
          : v[0] ** v[1];
  }
  if (!Number.isFinite(n)) throw Error("Undefined computation");
  return n;
}
export type KeyAudit = {
  status: "computed" | "verified" | "unverified" | "mismatch";
  reason: string;
  version: string;
  computed?: number;
};

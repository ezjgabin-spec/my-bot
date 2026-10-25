import { it, expect } from "vitest";
import { computeKey } from "../src/lib/key-check";
it("computes multi-step physics and statistics without evaluating generated code", () => {
  expect(
    computeKey({
      steps: [
        { operation: "power", values: [3, 2] },
        { operation: "product", values: [0.5, 4] },
      ],
      operation: "product",
      values: [{ step: 0 }, { step: 1 }],
    }),
  ).toBe(18);
  expect(
    computeKey({ operation: "binomial_pmf", values: [10, 0.5, 3] }),
  ).toBeCloseTo(0.1171875, 8);
  expect(
    computeKey({ operation: "binomial_cdf", values: [10, 0.5, 3] }),
  ).toBeCloseTo(0.171875, 8);
  expect(
    computeKey({
      operation: "normal_cdf",
      values: [1.96, 0, 1],
      decimalPlaces: 3,
    }),
  ).toBe(0.975);
  expect(computeKey({ operation: "normal_cdf", values: [0, 0, 1] })).toBe(0.5);
  expect(computeKey({ operation: "linear_root", values: [2, -10] })).toBe(5);
  expect(computeKey({ operation: "sample_variance", values: [1, 2, 3] })).toBe(
    1,
  );
});
it("rejects forward references, undefined operations and excessive computation", () => {
  expect(() =>
    computeKey({ operation: "sum", values: [{ step: 0 }, 2] }),
  ).toThrow();
  expect(() => computeKey({ operation: "sum", values: [42] })).toThrow();
  expect(() => computeKey({ operation: "ratio", values: [2, 0] })).toThrow();
  expect(() =>
    computeKey({ operation: "binomial_cdf", values: [10001, 0.5, 10001] }),
  ).toThrow();
  expect(() => computeKey({ operation: "sqrt", values: [-1] })).toThrow();
  expect(() =>
    computeKey({ operation: "normal_cdf", values: [0, 0, 0] }),
  ).toThrow();
});

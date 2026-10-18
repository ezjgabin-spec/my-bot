import { describe, expect, it } from "vitest";
import { coveragePriorities, randomizeChoices } from "../src/lib/test-variety";

describe("source-grounded test variation", () => {
  it("keeps priority excerpts within the source and favors requested topics", () => {
    const source = "Algebra ".repeat(250) + "Biology ".repeat(250) + "History ".repeat(250);
    const excerpts = coveragePriorities(source, ["Biology"]);
    expect(excerpts.length).toBeGreaterThan(0);
    expect(excerpts.every((excerpt) => source.includes(excerpt) && excerpt.includes("Biology"))).toBe(true);
    expect(coveragePriorities("Only these notes.", ["missing topic"])).toEqual(["Only these notes."]);
  });
  it("leaves written questions unchanged in a mixed test", () => {
    const written = { kind: "math", options: null, answer_key: "4" };
    const choice = { kind: "multiple_choice", options: ["1", "2", "3", "4"], answer_key: "4" };
    const input = [written, choice];
    const before = JSON.stringify(input);
    expect(randomizeChoices(input)[0]).toEqual(written);
    expect(JSON.stringify(input)).toBe(before);
  });
});

import { describe, expect, it } from "vitest";
import { selectStudyMaterial } from "../src/lib/material-selection";
import { MAX_AI_MATERIAL_BYTES } from "../src/lib/material-limits";
describe("long-document context selection", () => {
  it("passes short documents through intact", () => {
    expect(selectStudyMaterial("All my study notes", [])).toEqual({
      text: "All my study notes",
      sampled: false,
    });
  });
  it("includes the beginning and end rather than only the first chapters", () => {
    const input =
      "FIRST CHAPTER\n" +
      "Study concepts and worked examples.\n".repeat(14000) +
      "\nLAST CHAPTER";
    const result = selectStudyMaterial(input, []);
    expect(result.sampled).toBe(true);
    expect(result.text).toContain("FIRST CHAPTER");
    expect(result.text).toContain("LAST CHAPTER");
    expect(new TextEncoder().encode(result.text).length).toBeLessThanOrEqual(
      MAX_AI_MATERIAL_BYTES,
    );
  });
  it("prioritizes buried focus topics and respects UTF-8 size", () => {
    const input =
      "数学知识\n".repeat(30000) +
      "\nRARE FOCUS TOPIC: inverse functions with a detailed example.\n" +
      "数学知识\n".repeat(30000);
    const result = selectStudyMaterial(input, ["inverse functions"]);
    expect(result.text).toContain("RARE FOCUS TOPIC");
    expect(new TextEncoder().encode(result.text).length).toBeLessThanOrEqual(
      MAX_AI_MATERIAL_BYTES,
    );
    const labels = result.text.match(/\[Document section \d+ of \d+\]/g) ?? [];
    expect(new Set(labels).size).toBe(labels.length);
  });
});

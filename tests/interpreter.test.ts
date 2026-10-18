import { describe, expect, it } from "vitest";
import {
  splitStudyText,
  INTERPRETER_CHUNK_CHARACTERS,
} from "../src/lib/interpreter-limits";

describe("sectioning large study material", () => {
  it("preserves all dense Unicode content, including the final section", () => {
    const text = "📚".repeat(100_001) + "FINAL CHAPTER";
    const chunks = splitStudyText(text);
    expect(chunks.join("")).toBe(text);
    expect(
      chunks.every((part) => part.length <= INTERPRETER_CHUNK_CHARACTERS),
    ).toBe(true);
    expect(chunks.every((part) => !/[\uD800-\uDBFF]$/.test(part))).toBe(true);
  });
  it("uses paragraph boundaries without losing words", () => {
    const paragraphs = Array.from(
      { length: 900 },
      (_, n) => `Section ${n}: Remember every topic and definition.`,
    );
    expect(splitStudyText(paragraphs.join("\n")).join("\n")).toBe(
      paragraphs.join("\n"),
    );
  });
});

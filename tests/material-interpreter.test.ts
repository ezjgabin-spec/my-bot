import { describe, expect, it, vi } from "vitest";
import {
  splitDocument,
  interpretDocument,
  MAX_INTERPRETER_SECTIONS,
} from "../src/lib/material-interpreter";

describe("large PDF interpretation", () => {
  it("covers every character of a large document without skipping chapters", () => {
    const text =
      "FIRST CHAPTER\n" +
      ("Inertia, velocity, force and examples in physics.\n").repeat(9000) +
      "LAST CHAPTER";
    const sections = splitDocument(text);
    expect(sections.length).toBeGreaterThan(3);
    expect(sections.length).toBeLessThanOrEqual(MAX_INTERPRETER_SECTIONS);
    expect(sections.map((section) => section.text).join("")).toBe(text);
    expect(sections[0].number).toBe(1);
    expect(sections.at(-1)?.number).toBe(sections.length);
  });

  it("preserves Unicode and surrogate pairs at section boundaries", () => {
    const text = "数学 📚 science\n".repeat(26000);
    expect(splitDocument(text).map((x) => x.text).join("")).toEqual(text);
  });

  it("summarizes every section and preserves document order", async () => {
    const doc = "Full notes from a chapter.\n".repeat(5000);
    const summarize = vi.fn(async (section: { number: number; text: string }) =>
      `Key facts from section ${section.number}, ${section.text.length} characters.`,
    );
    const result = await interpretDocument(doc, summarize);
    expect(summarize).toHaveBeenCalledTimes(result.sectionCount);
    expect(result.sectionCount).toBeGreaterThan(1);
    for (let index = 1; index <= result.sectionCount; index++)
      expect(result.text).toContain(
        `[Document section ${index} of ${result.sectionCount}]`,
      );
    expect(result.text.indexOf("[Document section 1 of")).toBe(0);
    expect(result.text.lastIndexOf("[Document section")).toBeGreaterThan(0);
  });

  it("never caches a partial guide when summarizing one section fails", async () => {
    const doc = "Force = mass × acceleration\n".repeat(5000);
    await expect(
      interpretDocument(doc, async (section) => {
        if (section.number === 2) throw new Error("Claude temporarily unavailable");
        return "Worked examples and formulas";
      }),
    ).rejects.toThrow("Claude temporarily unavailable");
  });

  it("rejects empty or oversized summaries instead of silently truncating", async () => {
    await expect(interpretDocument("some notes", async () => "")).rejects.toThrow(
      "empty or oversized",
    );
    await expect(
      interpretDocument("some notes", async () => "x".repeat(5100)),
    ).rejects.toThrow("empty or oversized");
  });
});

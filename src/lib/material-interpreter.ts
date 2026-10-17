import { MAX_AI_MATERIAL_BYTES, MAX_MATERIAL_CHARACTERS } from "./material-limits";

// Large documents are interpreted in full, not sampled. Bound each upload to
// a predictable maximum number of Claude requests and a single-test context.
export const INTERPRETER_CHUNK_CHARACTERS = 30_000;
export const MAX_INTERPRETER_SECTIONS = 24;
export const MAX_INTERPRETER_SUMMARY_BYTES = 100_000;

export type DocumentSection = {
  number: number;
  total: number;
  text: string;
};

export function splitDocument(text: string): DocumentSection[] {
  if (!text.trim()) throw new Error("Study material is empty.");
  if (text.length > MAX_MATERIAL_CHARACTERS)
    throw new Error("Document exceeds the permitted character limit.");

  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + INTERPRETER_CHUNK_CHARACTERS, text.length);
    if (end < text.length) {
      // Prefer a paragraph or line break near the boundary, preserving the
      // complete source text even when a section contains no newlines.
      const line = text.lastIndexOf("\n", end);
      if (line >= start + INTERPRETER_CHUNK_CHARACTERS * 0.8)
        end = line + 1;
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]))
        end--;
    }
    if (end <= start) throw new Error("Could not split the document safely.");
    parts.push(text.slice(start, end));
    if (parts.length > MAX_INTERPRETER_SECTIONS)
      throw new Error(
        "This document needs too many AI sections. Split it into chapters before uploading.",
      );
    start = end;
  }
  return parts.map((part, index) => ({
    number: index + 1,
    total: parts.length,
    text: part,
  }));
}

export async function interpretDocument(
  text: string,
  summarize: (section: DocumentSection) => Promise<string>,
) {
  const sections = splitDocument(text);
  const summaries: string[] = [];
  // Keep concurrency small to limit rate-limit spikes and provider spend.
  for (let i = 0; i < sections.length; i += 2) {
    const batch = await Promise.all(
      sections.slice(i, i + 2).map(async (section) => {
        const summary = (await summarize(section)).trim();
        if (!summary || new TextEncoder().encode(summary).length > 5_000)
          throw new Error(
            "Claude returned an empty or oversized section summary. Please retry.",
          );
        return `[Document section ${section.number} of ${section.total}]\n${summary}`;
      }),
    );
    summaries.push(...batch);
  }
  const result = summaries.join("\n\n");
  if (new TextEncoder().encode(result).length > MAX_INTERPRETER_SUMMARY_BYTES ||
      new TextEncoder().encode(result).length > MAX_AI_MATERIAL_BYTES)
    throw new Error(
      "The combined study guide is too long. Split the PDF into smaller chapters.",
    );
  return { text: result, sectionCount: sections.length };
}

import { MAX_AI_MATERIAL_BYTES } from "./material-limits";

// Keep the original document intact. Send a bounded, explicitly labelled
// selection to Claude when a document exceeds one request's context budget.
export function selectStudyMaterial(text: string, focusTopics: string[]) {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= MAX_AI_MATERIAL_BYTES)
    return { text, sampled: false };
  const chunks: string[] = [];
  // Small sections make it possible to sample both early and late chapters.
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 2400, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf("\n", end);
      if (boundary > start + 1200) end = boundary + 1;
      // Do not split a UTF-16 surrogate pair.
      if (
        text.charCodeAt(end - 1) >= 0xd800 &&
        text.charCodeAt(end - 1) <= 0xdbff
      )
        end--;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  const terms = focusTopics.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const ranked = chunks
    .map((chunk, index) => ({
      index,
      score: terms.reduce(
        (score, term) => score + (chunk.toLowerCase().includes(term) ? 1 : 0),
        0,
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = new Set<number>();
  let bytes = 0;
  function add(index: number, budget = MAX_AI_MATERIAL_BYTES) {
    if (selected.has(index)) return;
    const size = encoder.encode(
      `\n\n[Document section ${index + 1} of ${chunks.length}]\n${chunks[index]}`,
    ).length;
    if (bytes + size > budget) return;
    selected.add(index);
    bytes += size;
  }
  // Reserve half the budget for focus matches, then cover the whole document.
  for (const match of ranked) add(match.index, MAX_AI_MATERIAL_BYTES / 2);
  const slots = Math.max(2, Math.floor((MAX_AI_MATERIAL_BYTES - bytes) / 8000));
  for (let i = 0; i < slots; i++)
    add(Math.round((i * (chunks.length - 1)) / (slots - 1)));
  for (const match of ranked) add(match.index);
  // Interleave the remaining sections instead of taking only the beginning.
  for (
    let stride = Math.ceil(chunks.length / 2);
    stride >= 1;
    stride = Math.floor(stride / 2)
  )
    for (let i = 0; i < chunks.length; i += stride) add(i);
  return {
    text: [...selected]
      .sort((a, b) => a - b)
      .map(
        (index) =>
          `\n\n[Document section ${index + 1} of ${chunks.length}]\n${chunks[index]}`,
      )
      .join(""),
    sampled: true,
  };
}

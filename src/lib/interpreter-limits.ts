// Small requests work on both Cloudflare and the desktop server.
export const INTERPRETER_CHUNK_CHARACTERS = 16_000;
export const INTERPRETER_SUMMARY_CHARACTERS = 2_000;

export function splitStudyText(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + INTERPRETER_CHUNK_CHARACTERS, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end);
      if (newline > start + INTERPRETER_CHUNK_CHARACTERS / 2) end = newline + 1;
      // Keep surrogate pairs together.
      if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    const part = text.slice(start, end).trim();
    if (part) parts.push(part);
    start = end;
  }
  return parts;
}

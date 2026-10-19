import type { Flashcard, FlashcardDeck } from "./flashcard-decks";

export type DraftCard = Omit<Flashcard, "id">;
export const MAX_DECK_CARDS = 500;
export const MAX_IMPORT_CHARACTERS = 100_000;
export const MAX_AI_FLASHCARD_CHARACTERS = 400_000;
export const FLASHCARD_CHUNK_CHARACTERS = 40_000;

// Deterministic parsing only. This module has no API or network dependency.
export function smartImport(text: string) {
  if (text.length > MAX_IMPORT_CHARACTERS)
    throw new Error("Import up to 100,000 characters at a time.");
  const cards: DraftCard[] = [];
  const skipped: { line: number; text: string }[] = [];
  const seen = new Set<string>();
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((raw, index) => {
      const line = raw.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, "");
      if (!line) return;
      const match = line.match(
        /^(?!https?:\/\/)(.+?)(?:\t+|\s*=\s*|:\s*|\s+[–—-]\s+)(.+)$/,
      );
      if (!match) {
        skipped.push({ line: index + 1, text: raw });
        return;
      }
      const front = match[1].trim(),
        back = match[2].trim();
      const key = `${front.toLocaleLowerCase()}\u0000${back.toLocaleLowerCase()}`;
      if (
        !front ||
        !back ||
        front.length > 500 ||
        back.length > 3000 ||
        cards.length >= MAX_DECK_CARDS
      ) {
        skipped.push({ line: index + 1, text: raw });
        return;
      }
      if (!seen.has(key)) {
        cards.push({ front, back, topic: "Vocabulary" });
        seen.add(key);
      }
    });
  return { cards, skipped };
}

export function flashcardChunks(text: string): string[] {
  if (!text.trim() || text.length > MAX_AI_FLASHCARD_CHARACTERS)
    throw new Error(
      "Use between 1 and 400,000 characters of readable study material.",
    );
  const chunks: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + FLASHCARD_CHUNK_CHARACTERS, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf("\n", end);
      if (boundary > start + FLASHCARD_CHUNK_CHARACTERS / 2) end = boundary + 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

export function uniqueCards(cards: DraftCard[]) {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = card.front
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/\s+/gu, " ")
      .trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Ratings guide topic selection only. Never feed self-ratings into predictions.
export function flashcardReviewPriorities(
  decks: FlashcardDeck[],
  materialId: string,
) {
  const eligible = decks.filter((deck) => deck.material_id === materialId);
  const red = eligible.flatMap((deck) =>
    deck.cards.filter((c) => deck.needs_work.includes(c.id)),
  );
  const yellow = eligible.flatMap((deck) =>
    deck.cards.filter(
      (c) => deck.active.includes(c.id) && deck.almost_seen.includes(c.id),
    ),
  );
  return uniqueCards([...red, ...yellow])
    .slice(0, 12)
    .map((card) => `${card.topic}: ${card.front}`);
}

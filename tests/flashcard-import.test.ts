import { describe, it, expect } from "vitest";
import {
  smartImport,
  flashcardChunks,
  uniqueCards,
  flashcardReviewPriorities,
  MAX_AI_FLASHCARD_CHARACTERS,
} from "../src/lib/flashcard-import";
import {
  makeFlashcardDeck,
  changeFlashcardDeck,
} from "../src/lib/flashcard-decks";

describe("free Smart Import", () => {
  it("handles common separators, list prefixes, Unicode and separators inside answers", () => {
    const result = smartImport(
      "1. Accolade = An award: earned recognition\r\n- Impetus:Something causing action\nAppraise\tEstimate value\n• Résumé — A summary\nX-ray - An image made using radiation\nAccolade = An award: earned recognition\nhttps://example.com\nA heading without a definition",
    );
    expect(result.cards.map((c) => c.front)).toEqual([
      "Accolade",
      "Impetus",
      "Appraise",
      "Résumé",
      "X-ray",
    ]);
    expect(result.cards[0].back).toBe("An award: earned recognition");
    expect(result.skipped.map((r) => r.line)).toEqual([7, 8]);
  });
  it("reports malformed and excessive rows rather than silently truncating them", () => {
    const result = smartImport(
      "Empty =\n" +
        Array.from({ length: 501 }, (_, i) => `Term ${i} = Definition`).join(
          "\n",
        ),
    );
    expect(result.cards).toHaveLength(500);
    expect(result.skipped).toHaveLength(2);
    expect(() => smartImport("a".repeat(100001))).toThrow(/100,000/);
  });
  it("keeps complete long guides across chunks and respects the technical limit", () => {
    const source = "SECTION: Everything matters.\n".repeat(10000);
    const chunks = flashcardChunks(source);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(source);
    expect(chunks.every((c) => c.length <= 40000)).toBe(true);
    expect(() =>
      flashcardChunks("a".repeat(MAX_AI_FLASHCARD_CHARACTERS + 1)),
    ).toThrow();
  });
  it("deduplicates exact questions while keeping distinct math expressions", () => {
    expect(
      uniqueCards(
        ["Solve x + 2", " solve  X + 2 ", "Solve x - 2"].map((front) => ({
          front,
          back: "Answer",
          topic: "Math",
        })),
      ),
    ).toHaveLength(2);
  });
  it("uses only linked red and yellow cards for practice selection and never green ratings as score evidence", () => {
    let deck = makeFlashcardDeck(
      "material",
      "Deck",
      ["Red", "Yellow", "Green"].map((front) => ({
        front,
        back: "A",
        topic: "Topic",
      })),
    );
    deck = changeFlashcardDeck(deck, "again", deck.active[0]);
    deck = changeFlashcardDeck(deck, "almost", deck.active[0]);
    deck = changeFlashcardDeck(deck, "known", deck.active[0]);
    expect(flashcardReviewPriorities([deck], "material")).toEqual([
      "Topic: Red",
      "Topic: Yellow",
    ]);
    expect(flashcardReviewPriorities([deck], "other-material")).toEqual([]);
  });
});

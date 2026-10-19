import { describe, expect, it } from "vitest";
import { changeFlashcardDeck, makeFlashcardDeck } from "../src/lib/flashcard-decks";

const make = () => {
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  return makeFlashcardDeck("material", "Vocabulary", [
    { front: "burden", back: "A heavy responsibility", topic: "Vocab" },
    { front: "accomplice", back: "Someone who assists in wrongdoing", topic: "Vocab" },
    { front: "engender", back: "To cause", topic: "Vocab" },
  ], id, () => "2026-10-19T12:00:00.000Z");
};

describe("persistent flashcard review", () => {
  it("moves green to mastered, red to separate deck, yellow to the back", () => {
    const start = make();
    const first = start.active[0], second = start.active[1], third = start.active[2];
    const green = changeFlashcardDeck(start, "known", first);
    expect(green.active).toEqual([second, third]);
    expect(green.mastered).toEqual([first]);
    const yellow = changeFlashcardDeck(green, "almost", second);
    expect(yellow.active).toEqual([third, second]);
    expect(yellow.almost_seen).toEqual([second]);
    const red = changeFlashcardDeck(yellow, "again", third);
    expect(red.active).toEqual([second]);
    expect(red.needs_work).toEqual([third]);
    expect(red.mastered).toEqual([first]);
  });

  it("does not allow a second yellow choice even after restoring a saved deck", () => {
    const deck = make();
    const first = deck.active[0];
    const second = changeFlashcardDeck(deck, "almost", first);
    const last = second.active[0];
    const returned = changeFlashcardDeck(second, "known", last);
    const restored = JSON.parse(JSON.stringify(returned));
    expect(restored.active).toEqual([deck.active[2], first]);
    expect(() => changeFlashcardDeck(restored, "almost", first)).toThrow();
    const ready = changeFlashcardDeck(restored, "known", deck.active[2]);
    expect(() => changeFlashcardDeck(ready, "almost", first)).toThrow(/already chose Almost/);
    expect(changeFlashcardDeck(ready, "known", first).mastered).toContain(first);
  });

  it("undoes the last rating, including a red rating, without losing position", () => {
    const deck = make();
    const red = changeFlashcardDeck(deck, "again", deck.active[0]);
    expect(red.needs_work).toHaveLength(1);
    const undone = changeFlashcardDeck(red, "undo");
    expect(undone.active).toEqual(deck.active);
    expect(undone.needs_work).toHaveLength(0);
    expect(undone.previous).toBeUndefined();
    expect(() => changeFlashcardDeck(undone, "undo")).toThrow();
  });

  it("keeps unfinished yellow cards available next session and separates red cards", () => {
    const deck = make();
    const first = changeFlashcardDeck(deck, "almost", deck.active[0]);
    const red = changeFlashcardDeck(first, "again", deck.active[1]);
    const saved = JSON.parse(JSON.stringify(red));
    expect(saved.active).toEqual([deck.active[2], deck.active[0]]);
    expect(saved.needs_work).toEqual([deck.active[1]]);
    const allGreen = changeFlashcardDeck(
      changeFlashcardDeck(saved, "known", deck.active[2]), "known", deck.active[0]);
    expect(allGreen.active).toHaveLength(0);
    const retry = changeFlashcardDeck(allGreen, "retry-red");
    expect(retry.active).toEqual([deck.active[1]]);
    expect(retry.needs_work).toHaveLength(0);
  });

  it("requires the current card to avoid stale clicks and can restart", () => {
    const deck = make();
    expect(() => changeFlashcardDeck(deck, "known", deck.active[1])).toThrow(/no longer/);
    const known = changeFlashcardDeck(deck, "known", deck.active[0]);
    expect(changeFlashcardDeck(known, "restart").active).toEqual(deck.active);
    expect(changeFlashcardDeck(known, "restart").mastered).toEqual([]);
  });
});

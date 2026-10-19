export type Flashcard = {
  id: string;
  front: string;
  back: string;
  topic: string;
};

export type FlashcardRating = "known" | "almost" | "again";
export type FlashcardAction =
  FlashcardRating | "undo" | "shuffle" | "retry-red" | "restart";

type FlashcardSnapshot = {
  active: string[];
  mastered: string[];
  needs_work: string[];
  almost_seen: string[];
};
export type FlashcardDeck = FlashcardSnapshot & {
  id: string;
  material_id: string | null;
  source?: "manual" | "smart-import" | "ai";
  title: string;
  created_at: string;
  updated_at: string;
  cards: Flashcard[];
  previous?: FlashcardSnapshot;
};

const copySnapshot = (deck: FlashcardDeck): FlashcardSnapshot => ({
  active: [...deck.active],
  mastered: [...deck.mastered],
  needs_work: [...deck.needs_work],
  almost_seen: [...deck.almost_seen],
});

export function makeFlashcardDeck(
  materialId: string | null,
  title: string,
  cards: Omit<Flashcard, "id">[],
  id: () => string = () => crypto.randomUUID(),
  now: () => string = () => new Date().toISOString(),
): FlashcardDeck {
  if (!cards.length || cards.length > 500)
    throw new Error("Invalid deck size.");
  const created_at = now();
  const withIds = cards.map((card) => ({ ...card, id: id() }));
  return {
    id: id(),
    material_id: materialId,
    title,
    created_at,
    updated_at: created_at,
    cards: withIds,
    active: withIds.map((card) => card.id),
    mastered: [],
    needs_work: [],
    almost_seen: [],
  };
}

export function changeFlashcardDeck(
  deck: FlashcardDeck,
  action: FlashcardAction,
  cardId?: string,
  now: () => string = () => new Date().toISOString(),
): FlashcardDeck {
  const next = {
    ...deck,
    ...copySnapshot(deck),
    previous: deck.previous
      ? {
          active: [...deck.previous.active],
          mastered: [...deck.previous.mastered],
          needs_work: [...deck.previous.needs_work],
          almost_seen: [...deck.previous.almost_seen],
        }
      : undefined,
    updated_at: now(),
  };
  if (action === "undo") {
    if (!next.previous) throw new Error("Nothing to undo.");
    Object.assign(next, next.previous);
    delete next.previous;
    return next;
  }

  if (action === "known" || action === "again" || action === "almost") {
    if (!cardId || next.active[0] !== cardId)
      throw new Error(
        "This card is no longer at the front. Reload and try again.",
      );
    if (action === "almost" && next.almost_seen.includes(cardId))
      throw new Error(
        "You already chose Almost for this card. Now choose Know it or Needs work.",
      );
    next.previous = copySnapshot(next);
    next.active.shift();
    if (action === "known") next.mastered.push(cardId);
    if (action === "again") next.needs_work.push(cardId);
    if (action === "almost") {
      next.almost_seen.push(cardId);
      next.active.push(cardId);
    }
    return next;
  }

  if (action === "retry-red") {
    if (!next.needs_work.length) throw new Error("No cards to retry.");
    next.previous = copySnapshot(next);
    const red = [...next.needs_work];
    next.active.push(...red);
    next.needs_work = [];
    next.almost_seen = next.almost_seen.filter((id) => !red.includes(id));
    return next;
  }

  if (action === "shuffle") {
    if (next.active.length < 2) return next;
    next.previous = copySnapshot(next);
    for (let i = next.active.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next.active[i], next.active[j]] = [next.active[j], next.active[i]];
    }
    return next;
  }

  if (action === "restart") {
    next.previous = copySnapshot(next);
    next.active = next.cards.map((card) => card.id);
    next.mastered = [];
    next.needs_work = [];
    next.almost_seen = [];
    return next;
  }
  throw new Error("Unknown flashcard action.");
}

import "server-only";
import { createHash } from "node:crypto";
import { AppError } from "./server";
import { updateLocalData } from "./local-store";
import { generateFlashcards } from "./ai";
import {
  flashcardChunks,
  uniqueCards,
  type DraftCard,
} from "./flashcard-import";

export type FlashcardDraft = {
  id: string;
  fingerprint: string;
  created_at: string;
  status: "running" | "ready" | "failed";
  result?: {
    cards: DraftCard[];
    title: string;
    materialId: string | null;
    sections: number;
    requestedCount: number;
  };
};

export async function generateFlashcardPreview(input: {
  requestId: string;
  source: string;
  materialId: string | null;
  title: string;
  count: number;
}) {
  const chunks = flashcardChunks(input.source);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([input.source, input.materialId, input.count]))
    .digest("hex");
  const cached = await updateLocalData((data) => {
    const existing = data.flashcardDrafts.find(
      (draft) => draft.id === input.requestId,
    );
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new AppError(
          "This request ID belongs to different material or settings.",
          409,
        );
      if (existing.status === "ready") {
        if (!existing.result)
          throw new AppError(
            "This preview expired. Start a new generation.",
            410,
          );
        return existing.result;
      }
      throw new AppError(
        existing.status === "running"
          ? "This generation is still running or awaiting a usage check. Retry this request later; it will not be charged twice."
          : "This generation failed. Start a new request to try again; previous processing may have used credits.",
        409,
      );
    }
    // Retain request tombstones so retries cannot become a second paid request.
    // Only large preview bodies expire; saved decks are never removed here.
    for (const draft of data.flashcardDrafts) {
      if (
        Date.parse(draft.created_at) < Date.now() - 7 * 86400_000 &&
        draft.result
      )
        delete draft.result;
    }
    data.flashcardDrafts.push({
      id: input.requestId,
      fingerprint,
      created_at: new Date().toISOString(),
      status: "running",
    });
    return null;
  });
  if (cached) return cached;
  try {
    const all: DraftCard[] = [];
    const perChunk = Math.ceil(input.count / chunks.length);
    for (const chunk of chunks) {
      all.push(
        ...(await generateFlashcards(
          chunk,
          perChunk,
          all.map((card) => card.front),
        )),
      );
    }
    const unique = uniqueCards(all);
    // Evenly cover the processed sections when the requested deck is smaller.
    const cards =
      unique.length <= input.count
        ? unique
        : Array.from(
            { length: input.count },
            (_, index) =>
              unique[Math.floor(((index + 0.5) * unique.length) / input.count)],
          );
    if (!cards.length)
      throw new AppError(
        "No distinct cards could be generated from this material.",
        502,
      );
    const result = {
      cards,
      title: input.title,
      materialId: input.materialId,
      sections: chunks.length,
      requestedCount: input.count,
    };
    await updateLocalData((data) => {
      const draft = data.flashcardDrafts.find((d) => d.id === input.requestId)!;
      draft.status = "ready";
      draft.result = result;
    });
    return result;
  } catch (error) {
    await updateLocalData((data) => {
      const draft = data.flashcardDrafts.find((d) => d.id === input.requestId)!;
      draft.status = "failed";
    });
    throw error;
  }
}

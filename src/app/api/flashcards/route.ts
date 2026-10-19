import { NextResponse } from "next/server";
import {
  apiError,
  requireUser,
  protectMutation,
  readJson,
  AppError,
} from "@/lib/server";
import { readLocalData, updateLocalData } from "@/lib/local-store";
import { z } from "zod";
import { makeFlashcardDeck } from "@/lib/flashcard-decks";
import { MAX_DECK_CARDS } from "@/lib/flashcard-import";

export async function GET() {
  try {
    await requireUser();
    const data = await readLocalData();
    return NextResponse.json({
      decks: data.flashcardDecks
        .map(
          ({
            id,
            title,
            material_id,
            created_at,
            updated_at,
            cards,
            active,
            mastered,
            needs_work,
          }) => ({
            id,
            title,
            material_id,
            created_at,
            updated_at,
            total: cards.length,
            active: active.length,
            mastered: mastered.length,
            needs_work: needs_work.length,
          }),
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    });
  } catch (e) {
    return apiError(e);
  }
}

const saveSchema = z
  .object({
    requestId: z.string().uuid(),
    title: z.string().trim().min(1).max(150),
    materialId: z.string().uuid().nullable().default(null),
    source: z.enum(["manual", "smart-import", "ai"]),
    cards: z
      .array(
        z
          .object({
            front: z.string().trim().min(1).max(500),
            back: z.string().trim().min(1).max(3000),
            topic: z.string().trim().min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_DECK_CARDS),
  })
  .strict();

export async function POST(request: Request) {
  try {
    protectMutation(request);
    await requireUser();
    const input = saveSchema.parse(await readJson(request, 800_000));
    const deck = await updateLocalData((data) => {
      const existing = data.flashcardDecks.find(
        (deck) => deck.id === input.requestId,
      );
      if (existing) {
        const savedCards = existing.cards.map(({ front, back, topic }) => ({
          front,
          back,
          topic,
        }));
        if (
          existing.title !== input.title ||
          existing.material_id !== input.materialId ||
          existing.source !== input.source ||
          JSON.stringify(savedCards) !== JSON.stringify(input.cards)
        )
          throw new AppError(
            "This save request already created a different deck. Open that saved deck before creating another.",
            409,
          );
        return existing; // Retrying Save never duplicates a deck or resets progress.
      }
      if (
        input.materialId &&
        !data.materials.some((m) => m.id === input.materialId)
      )
        throw new AppError("Study material not found.", 404);
      const saved = makeFlashcardDeck(
        input.materialId,
        input.title,
        input.cards,
      );
      saved.id = input.requestId;
      saved.source = input.source;
      data.flashcardDecks.push(saved);
      return saved;
    });
    return NextResponse.json({ deck }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

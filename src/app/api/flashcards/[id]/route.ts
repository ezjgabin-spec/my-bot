import { NextResponse } from "next/server";
import { z } from "zod";
import { protectMutation, requireUser, readJson, apiError, AppError } from "@/lib/server";
import { readLocalData, updateLocalData } from "@/lib/local-store";
import { changeFlashcardDeck } from "@/lib/flashcard-decks";

type Params = { params: Promise<{ id: string }> };
const actionSchema = z.object({
  action: z.enum(["known", "almost", "again", "undo", "shuffle", "retry-red", "restart"]),
  cardId: z.string().uuid().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new AppError("Invalid deck.", 400);
    const data = await readLocalData();
    const deck = data.flashcardDecks.find((item) => item.id === id);
    if (!deck) throw new AppError("Flashcard deck not found.", 404);
    return NextResponse.json({ deck });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    protectMutation(request);
    await requireUser();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new AppError("Invalid deck.", 400);
    const input = actionSchema.parse(await readJson(request));
    const deck = await updateLocalData((data) => {
      const index = data.flashcardDecks.findIndex((item) => item.id === id);
      if (index < 0) throw new AppError("Flashcard deck not found.", 404);
      try {
        const updated = changeFlashcardDeck(data.flashcardDecks[index], input.action, input.cardId);
        data.flashcardDecks[index] = updated;
        return updated;
      } catch (error) {
        throw new AppError((error as Error).message, 409);
      }
    });
    return NextResponse.json({ deck });
  } catch (e) {
    return apiError(e);
  }
}

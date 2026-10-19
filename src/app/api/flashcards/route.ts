import { NextResponse } from "next/server";
import { apiError, requireUser } from "@/lib/server";
import { readLocalData } from "@/lib/local-store";

export async function GET() {
  try {
    await requireUser();
    const data = await readLocalData();
    return NextResponse.json({
      decks: data.flashcardDecks
        .map(({ id, title, material_id, created_at, updated_at, cards, active, mastered, needs_work }) => ({
          id, title, material_id, created_at, updated_at,
          total: cards.length, active: active.length, mastered: mastered.length, needs_work: needs_work.length,
        }))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    });
  } catch (e) {
    return apiError(e);
  }
}

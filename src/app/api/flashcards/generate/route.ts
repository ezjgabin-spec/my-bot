import { NextResponse } from "next/server";
import { z } from "zod";
import {
  protectMutation,
  readJson,
  apiError,
  requireUser,
  AppError,
} from "@/lib/server";
import { readLocalData } from "@/lib/local-store";
import { isCloud } from "@/lib/cloud";
import { withAiLock } from "@/lib/ai";
import { requireSmartFlashcards } from "@/lib/feature-access";
import { generateFlashcardPreview } from "@/lib/flashcard-generation";
import { MAX_AI_FLASHCARD_CHARACTERS } from "@/lib/flashcard-import";

export const maxDuration = 300;
const schema = z
  .object({
    requestId: z.string().uuid(),
    materialId: z.string().uuid().optional(),
    text: z.string().trim().min(1).max(MAX_AI_FLASHCARD_CHARACTERS).optional(),
    title: z.string().trim().min(1).max(150).default("AI Smart Flashcards"),
    count: z.number().int().min(5).max(100),
  })
  .strict()
  .refine(
    (v) => !!v.materialId !== !!v.text,
    "Choose saved material or paste text, not both.",
  );

export async function POST(request: Request) {
  try {
    protectMutation(request);
    const user = await requireUser();
    await requireSmartFlashcards();
    const input = schema.parse(await readJson(request, 1_700_000));
    let source = input.text ?? "",
      title = input.title;
    if (input.materialId) {
      const material = (await readLocalData()).materials.find(
        (m) => m.id === input.materialId,
      );
      if (!material) throw new AppError("Study material not found.", 404);
      source =
        material.interpreted_text ||
        (isCloud()
          ? await (
              await import("@/lib/cloud-store")
            ).cloudMaterialText(input.materialId)
          : material.extracted_text);
      title = material.filename.slice(0, 150);
    }
    if (!source.trim())
      throw new AppError("This material has no readable text.", 400);
    if (source.length > MAX_AI_FLASHCARD_CHARACTERS)
      throw new AppError(
        "Use up to 400,000 characters. Interpret or split this document first.",
        413,
      );
    const preview = await withAiLock(user.id, () =>
      generateFlashcardPreview({
        requestId: input.requestId,
        source,
        title,
        materialId: input.materialId ?? null,
        count: input.count,
      }),
    );
    return NextResponse.json({ preview });
  } catch (error) {
    return apiError(error);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { protectMutation, readJson, apiError, requireUser, AppError } from "@/lib/server";
import { readLocalData } from "@/lib/local-store";
import { isCloud } from "@/lib/cloud";
import { selectStudyMaterial } from "@/lib/material-selection";
import { withAiLock, generateFlashcards } from "@/lib/ai";
import { withFreeTest } from "@/lib/billing";

export const maxDuration = 300;
const requestSchema = z.object({
  materialId: z.string().uuid(),
  count: z.union([z.literal(10), z.literal(20), z.literal(30)]),
});

export async function POST(request: Request) {
  try {
    protectMutation(request);
    const user = await requireUser();
    const { materialId, count } = requestSchema.parse(await readJson(request));
    const data = await readLocalData();
    const material = data.materials.find((item) => item.id === materialId);
    if (!material) throw new AppError("Study material not found.", 404);
    const source = material.interpreted_text ||
      (isCloud()
        ? await (await import("@/lib/cloud-store")).cloudMaterialText(materialId)
        : material.extracted_text);
    if (!source?.trim()) throw new AppError("This study material has no readable text.", 400);
    const selection = selectStudyMaterial(source, []);
    const cards = await withAiLock(user.id, () =>
      withFreeTest(() => generateFlashcards(selection.text, count)));
    return NextResponse.json({ cards, sampled: selection.sampled });
  } catch (e) {
    return apiError(e);
  }
}

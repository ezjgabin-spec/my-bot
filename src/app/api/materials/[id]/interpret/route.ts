import { NextResponse } from "next/server";
import { uuid } from "@/lib/schemas";
import { AppError, apiError, protectMutation, requireUser } from "@/lib/server";
import { readLocalData, saveLocalInterpretedSection } from "@/lib/local-store";
import { splitDocument } from "@/lib/material-interpreter";
import { MAX_AI_MATERIAL_BYTES } from "@/lib/material-limits";
import { summarizeStudySection, withAiLock } from "@/lib/ai";

export const maxDuration = 120;

// Interpret only one section per request. Large PDFs can finish over multiple
// requests without relying on a single long-lived Worker invocation.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    protectMutation(request);
    const user = await requireUser();
    const id = uuid.parse((await params).id);

    const existing = (await readLocalData()).materials.find((m) => m.id === id);
    if (!existing) throw new AppError("Study material not found.", 404);
    if (existing.interpreted_text ||
        new TextEncoder().encode(existing.extracted_text).length <= MAX_AI_MATERIAL_BYTES)
      return NextResponse.json(
        existing.interpreted_text
          ? {
              ready: true,
              completed: existing.interpreted_sections ?? 1,
              total: existing.interpreted_sections ?? 1,
            }
          : { ready: true, completed: 0, total: 0 },
        { headers: { "Cache-Control": "no-store" } },
      );

    const progress = await withAiLock(user.id, async () => {
      // Re-read *inside* the per-user lock to avoid duplicate Claude calls.
      const material = (await readLocalData()).materials.find((m) => m.id === id);
      if (!material) throw new AppError("Study material not found.", 404);
      if (material.interpreted_text)
        return {
          ready: true,
          completed: material.interpreted_sections ?? 1,
          total: material.interpreted_sections ?? 1,
        };
      if (new TextEncoder().encode(material.extracted_text).length <= MAX_AI_MATERIAL_BYTES)
        return { ready: true, completed: 0, total: 0 };
      const sections = splitDocument(material.extracted_text);
      const next = material.interpreted_parts?.length ?? 0;
      if (next >= sections.length)
        throw new AppError("Document interpretation needs repair. Contact the owner.", 409);
      const summary = await summarizeStudySection(sections[next]);
      return saveLocalInterpretedSection(id, next, sections.length, summary);
    });
    return NextResponse.json(progress, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

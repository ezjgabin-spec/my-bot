import { NextResponse } from "next/server";
import { z } from "zod";
import { protectMutation, requireUser, readJson, apiError, AppError } from "@/lib/server";
import { readLocalData, saveLocalMaterial } from "@/lib/local-store";
import { MAX_MATERIAL_CHARACTERS } from "@/lib/material-limits";

export async function POST(request: Request) {
  try {
    protectMutation(request);
    await requireUser();
    const { materialIds } = z.object({
      materialIds: z.array(z.string().uuid()).min(2).max(8),
    }).parse(await readJson(request));
    if (new Set(materialIds).size !== materialIds.length)
      throw new AppError("Choose different files.", 400);
    // Per-user storage lookup; never select materials from another account.
    const data = await readLocalData();
    const sections = materialIds.map((id, index) => {
      const material = data.materials.find((m) => m.id === id);
      if (!material) throw new AppError("One of the study files was not found.", 404);
      return `[Source ${index + 1}: ${material.filename}]\n${material.extracted_text}`;
    });
    const combined = sections.join("\n\n");
    if (combined.length > MAX_MATERIAL_CHARACTERS)
      throw new AppError("Combined notes are over 500,000 characters. Use fewer slideshows or select shorter chapters.", 413);
    const id = crypto.randomUUID();
    await saveLocalMaterial({
      id,
      filename: `Combined notes (${materialIds.length} files).txt`,
      mime_type: "text/plain",
      extracted_text: combined,
    });
    return NextResponse.json({ id, filename: `Combined notes (${materialIds.length} files).txt` }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

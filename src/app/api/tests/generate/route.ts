import { NextResponse } from "next/server";
import { generateSchema } from "@/lib/schemas";
import { protectMutation, readJson, apiError, requireUser } from "@/lib/server";
import { generateTest, summarizeStudyDocument, withAiLock } from "@/lib/ai";
import {
  getGenerationContext,
  cacheLocalMaterialInterpretation,
  saveLocalTest,
} from "@/lib/local-store";
import { MAX_AI_MATERIAL_BYTES } from "@/lib/material-limits";

export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const user = await requireUser();
    const input = generateSchema.parse(await readJson(request));
    const context = await getGenerationContext(input.examId, input.materialId);
    const questions = await withAiLock(user.id, async () => {
      let prepared = context.interpreted;
      // For long documents, never silently sample some chapters. Interpret
      // every source section and persist the guide for subsequent tests.
      if (!prepared && new TextEncoder().encode(context.material).length > MAX_AI_MATERIAL_BYTES) {
        const guide = await summarizeStudyDocument(context.material);
        await cacheLocalMaterialInterpretation(input.materialId, guide.text, guide.sectionCount);
        prepared = guide.text;
      }
      return generateTest(
        input,
        context.subject,
        prepared ?? context.material,
        !!prepared,
      );
    });
    return NextResponse.json(
      { testId: await saveLocalTest({ ...input, questions }) },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}

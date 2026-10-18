import { NextResponse } from "next/server";
import { generateSchema } from "@/lib/schemas";
import { protectMutation, readJson, apiError, requireUser, AppError } from "@/lib/server";
import { generateTest, withAiLock } from "@/lib/ai";
import { getGenerationContext, saveLocalTest } from "@/lib/local-store";
import { MAX_AI_MATERIAL_BYTES } from "@/lib/material-limits";

export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const user = await requireUser();
    const input = generateSchema.parse(await readJson(request));
    const context = await getGenerationContext(input.examId, input.materialId);
    if (!context.interpreted &&
        new TextEncoder().encode(context.material).length > MAX_AI_MATERIAL_BYTES)
      throw new AppError(
        "This document needs interpretation before test generation. Open Create Test to finish processing its sections.",
        409,
      );
    const questions = await withAiLock(user.id, () =>
      generateTest(
        input,
        context.subject,
        context.interpreted ?? context.material,
        !!context.interpreted,
        context.previousQuestions,
      ),
    );
    return NextResponse.json(
      { testId: await saveLocalTest({ ...input, questions }) },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}

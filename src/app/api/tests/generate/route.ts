import { NextResponse } from "next/server";
import { generateSchema } from "@/lib/schemas";
import {
  protectMutation,
  readJson,
  apiError,
  requireUser,
  AppError,
} from "@/lib/server";
import { generateTest, withAiLock } from "@/lib/ai";
import { getGenerationContext, saveLocalTest } from "@/lib/local-store";
import { MAX_AI_MATERIAL_BYTES } from "@/lib/material-limits";
import { withFreeTest } from "@/lib/billing";

import { requireFeature } from "@/lib/feature-access";
import { effectiveDifficulty } from "@/lib/test-settings";

export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const user = await requireUser();
    const input = generateSchema.parse(await readJson(request));
    if (input.advanced) await requireFeature();
    const context = await getGenerationContext(input.examId, input.materialId);
    if (
      !context.interpreted &&
      new TextEncoder().encode(context.material).length > MAX_AI_MATERIAL_BYTES
    )
      throw new AppError(
        "This document needs interpretation before test generation. Open Create Test to finish processing its sections.",
        409,
      );
    const requested_difficulty = input.difficulty;
    input.difficulty = effectiveDifficulty(input.difficulty, input.advanced?.mode ?? "exam", context.attempts);
    const testId = await withAiLock(user.id, () =>
      withFreeTest(async () => {
        const questions = await generateTest(
          input,
          context.subject,
          context.interpreted ?? context.material,
          !!context.interpreted,
          context.previousQuestions,
          context.flashcardPriorities,
        );
        return saveLocalTest({ ...input, requested_difficulty, questions });
      }),
    );
    return NextResponse.json({ testId }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}

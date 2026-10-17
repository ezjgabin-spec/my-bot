import { NextResponse } from "next/server";
import { generateSchema } from "@/lib/schemas";
import { protectMutation, readJson, apiError, requireUser } from "@/lib/server";
import { generateTest, withAiLock } from "@/lib/ai";
import { getGenerationContext, saveLocalTest } from "@/lib/local-store";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const user = await requireUser();
    const input = generateSchema.parse(await readJson(request));
    const context = await getGenerationContext(input.examId, input.materialId);
    const questions = await withAiLock(user.id, () =>
      generateTest(input, context.subject, context.material),
    );
    return NextResponse.json(
      { testId: await saveLocalTest({ ...input, questions }) },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}

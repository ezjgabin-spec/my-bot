import { NextResponse } from "next/server";
import {
  requireUser,
  protectMutation,
  apiError,
  readJson,
  AppError,
} from "@/lib/server";
import { uuid, saveAnswersSchema } from "@/lib/schemas";
import { getAttempt } from "@/lib/data";
import { saveLocalAnswers } from "@/lib/local-store";
import { canSeePredictions } from "@/lib/billing";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const view = await getAttempt(user.id, uuid.parse((await context.params).id));
    const allowed = await canSeePredictions();
    return NextResponse.json(
      { ...view, prediction: allowed ? view.prediction : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    protectMutation(request);
    const user = await requireUser();
    const id = uuid.parse((await context.params).id);
    const input = saveAnswersSchema.parse(await readJson(request, 600_000));
    const view = await getAttempt(user.id, id);
    const ids = new Set(view.questions.map((q) => q.id));
    if (
      [...Object.keys(input.responses), ...input.flags].some(
        (key) => !ids.has(key),
      )
    )
      throw new AppError("Answer references a question outside this test.");
    for (const q of view.questions)
      if (
        q.kind === "multiple_choice" &&
        input.responses[q.id] &&
        !q.options?.includes(input.responses[q.id])
      )
        throw new AppError("Choose one of the listed answers.");
    await saveLocalAnswers(id, input.responses, input.flags);
    return NextResponse.json({ saved: true });
  } catch (e) {
    return apiError(e);
  }
}

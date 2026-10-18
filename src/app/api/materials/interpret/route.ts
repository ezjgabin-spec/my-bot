import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, protectMutation, readJson, requireUser } from "@/lib/server";
import { summarizeMaterial, withAiLock } from "@/lib/ai";
import { INTERPRETER_CHUNK_CHARACTERS } from "@/lib/interpreter-limits";

export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const user = await requireUser();
    const input = z
      .object({
        text: z.string().trim().min(1).max(INTERPRETER_CHUNK_CHARACTERS),
      })
      .strict()
      .parse(await readJson(request, 110_000));
    const result = await withAiLock(
      user.id,
      () => summarizeMaterial(input.text),
      "interpretation",
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}

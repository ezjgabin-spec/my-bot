import { NextResponse } from "next/server";
import { z } from "zod";
import { protectMutation, apiError, readJson } from "@/lib/server";
import { uuid } from "@/lib/schemas";
import { recordLocalGrade } from "@/lib/local-store";
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    protectMutation(request);
    const { grade } = z
      .object({ grade: z.number().finite().min(0).max(100) })
      .parse(await readJson(request));
    await recordLocalGrade(uuid.parse((await context.params).id), grade);
    return NextResponse.json({ saved: true });
  } catch (e) {
    return apiError(e);
  }
}

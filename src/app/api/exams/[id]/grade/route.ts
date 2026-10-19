import { NextResponse } from "next/server";
import { z } from "zod";
import { protectMutation, apiError, readJson, requireUser } from "@/lib/server";
import { FORMATS } from "@/lib/types";
import { uuid } from "@/lib/schemas";
import { recordLocalGrade } from "@/lib/local-store";
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    protectMutation(request);
    await requireUser();
    const { grade, feedback } = z
      .object({ grade: z.number().finite().min(0).max(100), feedback:z.object({format:z.enum(FORMATS),difficulty:z.enum(["easier","similar","harder","unknown"]),workingRequired:z.boolean(),topics:z.string().max(2000),teacherNotes:z.string().max(4000)}).optional() })
      .parse(await readJson(request));
    await recordLocalGrade(uuid.parse((await context.params).id), grade, feedback);
    return NextResponse.json({ saved: true });
  } catch (e) {
    return apiError(e);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, apiError, AppError } from "@/lib/server";
import { readLocalData } from "@/lib/local-store";
import { essayStages, compareEssayStage } from "@/lib/essay-benchmark";
import { benchmarkHistory } from "@/lib/assessment-context";
export async function GET(request: Request) {
  try {
    await requireUser();
    const q = z
      .object({
        essayId: z.string().uuid(),
        className: z.string().trim().max(100).optional(),
        teacher: z.string().trim().max(100).optional(),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const d = await readLocalData(),
      doc = d.writingDocuments.find((e) => e.id === q.essayId);
    if (!doc) throw new AppError("Essay not found.", 404);
    const record = d.readinessRecords.find(
      (r) => r.kind === "essay" && r.sourceId === doc.id,
    );
    const context =
      record ??
      d.assessmentContexts.find(
        (c) => c.kind === "essay" && c.sourceId === doc.id,
      );
    const className = context?.className || q.className,
      teacher = context?.teacher || q.teacher;
    if (!className || !teacher) return NextResponse.json({ needsTags: true });
    const cutoff =
      record?.actual?.at ??
      doc.actualTeacherRecordedAt ??
      new Date().toISOString();
    return NextResponse.json(
      {
        ...compareEssayStage(
          {
            sourceId: doc.id,
            className,
            teacher,
            stages: record?.actual?.essayStages ?? essayStages(doc, cutoff),
          },
          benchmarkHistory(d),
          cutoff,
        ),
        className,
        teacher,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}

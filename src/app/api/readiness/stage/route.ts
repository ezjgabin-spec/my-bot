import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, apiError, AppError } from "@/lib/server";
import { readLocalData } from "@/lib/local-store";
import { practiceStages, comparePracticeStage } from "@/lib/practice-benchmark";
import { benchmarkHistory } from "@/lib/assessment-context";
export async function GET(request: Request) {
  try {
    await requireUser();
    const q = z
      .object({
        examId: z.string().uuid(),
        className: z.string().trim().max(100).optional(),
        teacher: z.string().trim().max(100).optional(),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const d = await readLocalData();
    if (!d.exams.some((e) => e.id === q.examId))
      throw new AppError("Exam not found.", 404);
    const record = d.readinessRecords.find(
      (r) => r.kind === "test" && r.sourceId === q.examId,
    );
    const context =
      record ??
      d.assessmentContexts.find(
        (c) => c.kind === "test" && c.sourceId === q.examId,
      );
    const className = context?.className ?? q.className,
      teacher = context?.teacher ?? q.teacher;
    if (!className || !teacher) return NextResponse.json({ needsTags: true });
    const now = new Date().toISOString();
    const cutoff =
      record?.actual?.at ??
      d.grades.find((g) => g.exam_id === q.examId)?.recorded_at ??
      now;
    const stages =
      record?.actual?.practiceStages ??
      practiceStages(q.examId, d.attempts, d.tests, cutoff);
    // Older records are compared only when original timestamped attempts still exist.
    const history = benchmarkHistory(d);
    return NextResponse.json(
      {
        ...comparePracticeStage(
          { sourceId: q.examId, className, teacher, stages },
          history,
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

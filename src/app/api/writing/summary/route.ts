import { NextResponse } from "next/server";
import { apiError, requireUser } from "@/lib/server";
import { requireFeature } from "@/lib/feature-access";
import { readLocalData } from "@/lib/local-store";

// Read-only summary of an already-saved grade: no Claude request, no credit usage.
export async function GET() {
  try {
    await requireUser();
    await requireFeature();
    const data = await readLocalData();
    const history = data.writingDocuments
      .flatMap((essay) => essay.revisions
        .filter((revision) => revision.action === "grade" && revision.feedback)
        .map((revision) => ({
          essayId: essay.id,
          essayTitle: essay.title,
          createdAt: revision.createdAt,
          feedback: revision.feedback!,
          actualTeacherGrade: essay.actualTeacherGrade,
          actualTeacherLetter: essay.actualTeacherLetter,
          actualTeacherRecordedAt: essay.actualTeacherRecordedAt,
        })))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
    const latest = history[0] ?? null;
    return NextResponse.json({ latest, history }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

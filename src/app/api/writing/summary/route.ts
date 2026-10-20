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
    const latest = data.writingDocuments
      .flatMap((essay) => essay.revisions
        .filter((revision) => revision.action === "grade" && revision.feedback)
        .map((revision) => ({
          essayId: essay.id,
          essayTitle: essay.title,
          createdAt: revision.createdAt,
          feedback: revision.feedback!,
          actualTeacherGrade: essay.actualTeacherGrade,
        })))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    return NextResponse.json({ latest }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

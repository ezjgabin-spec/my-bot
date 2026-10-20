import { NextResponse } from "next/server";
import { apiError, requireUser, protectMutation, readJson, AppError } from "@/lib/server";
import { updateLocalData } from "@/lib/local-store";
import { teacherGradeSchema } from "@/lib/writing-teacher-grade";

export async function POST(request: Request) {
  try {
    protectMutation(request);
    await requireUser();
    const input = teacherGradeSchema.parse(await readJson(request));
    const essay = await updateLocalData((data) => {
      const doc = data.writingDocuments.find((item) => item.id === input.essayId);
      if (!doc) throw new AppError("Essay not found. Select the essay and retry.", 404);
      if (!doc.revisions.some((revision) => revision.action === "grade" && revision.feedback)) {
        throw new AppError("Run an independent grade estimate before entering the teacher grade.", 409);
      }
      // Preserve the independent prediction; letter-only results stay letter-only.
      doc.actualTeacherGrade = input.grade;
      doc.actualTeacherLetter = input.letter;
      doc.actualTeacherNotes = input.teacherNotes;
      doc.actualTeacherRecordedAt = new Date().toISOString();
      doc.updatedAt = doc.actualTeacherRecordedAt;
      return doc;
    });
    return NextResponse.json({ saved: true, essay }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

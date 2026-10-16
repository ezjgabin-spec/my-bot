import { NextResponse } from "next/server";
import { requireUser, protectMutation, apiError } from "@/lib/server";
import { uuid } from "@/lib/schemas";
import { withAiLock, gradeWritten } from "@/lib/ai";
import { totalScore } from "@/lib/grading";
import {
  attemptFeatures,
  historyFromState,
  predictGrade,
} from "@/lib/prediction";
import { getState } from "@/lib/data";
import type { Attempt } from "@/lib/types";
import {
  claimLocalSubmission,
  localQuestionsForTest,
  finishLocalSubmission,
  releaseLocalSubmission,
} from "@/lib/local-store";
export const maxDuration = 300;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let locked: { user: string; id: string; token: string } | null = null;
  try {
    protectMutation(request);
    const user = await requireUser();
    const id = uuid.parse((await context.params).id);
    const token = crypto.randomUUID();
    const attempt = await claimLocalSubmission(id, token);
    if (attempt.status === "completed")
      return NextResponse.json({ completed: true });
    locked = { user: user.id, id, token };
    const questions = await localQuestionsForTest(attempt.test_id);
    const needsAi = questions.some(
      (q) => q.kind !== "multiple_choice" && attempt.responses[q.id]?.trim(),
    );
    const results = needsAi
      ? await withAiLock(user.id, () =>
          gradeWritten(questions, attempt.responses),
        )
      : await gradeWritten(questions, attempt.responses);
    const totals = totalScore(results);
    const state = await getState(user.id);
    const now = new Date();
    const complete: Attempt = {
      ...attempt,
      status: "completed",
      score: totals.score,
      completed_at: now.toISOString(),
    };
    const features = attemptFeatures(
      [
        ...state.attempts.filter(
          (a) => a.exam_id === attempt.exam_id && a.id !== id,
        ),
        complete,
      ],
      state.tests,
    );
    const exam = state.exams.find((e) => e.id === attempt.exam_id)!;
    const subject = state.subjects.find((s) => s.id === exam.subject_id)!.name;
    const prediction = predictGrade({
      examId: exam.id,
      subject,
      features,
      history: historyFromState(state),
      now,
    });
    await finishLocalSubmission(id, token, results, { ...prediction, subject });
    return NextResponse.json({ completed: true });
  } catch (e) {
    if (locked) {
      // Keep submitted answers frozen. An immediate retry may reclaim the expired lease.
      await releaseLocalSubmission(locked.id, locked.token).catch(
        () => undefined,
      );
    }
    return apiError(e);
  }
}

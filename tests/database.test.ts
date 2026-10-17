import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import * as store from "../src/lib/local-store";
import { predictGrade } from "../src/lib/prediction";
import { gradeWritten } from "../src/lib/ai";
import { POST as submit } from "../src/app/api/attempts/[id]/submit/route";
let directory: string,
  exam: string,
  testId: string,
  questions: Awaited<ReturnType<typeof store.localQuestionsForTest>>;
const prediction = {
  ...predictGrade({
    examId: "e",
    subject: "Physics",
    features: {
      latest: 100,
      average: 100,
      improvement: 0,
      difficulty: "Medium",
      format: "multiple_choice",
      questionCount: 2,
      topics: ["Motion"],
      attemptCount: 1,
    },
    history: [],
  }),
  subject: "Physics",
};
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "study-store-test-"));
  vi.stubEnv("STUDYPREDICT_DATA_DIR", directory);
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  exam = (await store.createLocalExam({ subject: "Physics", name: "Motion" }))
    .id;
  const materialId = crypto.randomUUID();
  await store.saveLocalMaterial({
    id: materialId,
    filename: "notes.txt",
    mime_type: "text/plain",
    extracted_text: "Motion and forces.",
  });
  testId = await store.saveLocalTest({
    examId: exam,
    materialId,
    difficulty: "Medium",
    format: "multiple_choice",
    count: 2,
    timeLimit: 10,
    questions: [0, 1].map((position) => ({
      position,
      prompt: "Question " + position,
      topic: "Motion",
      kind: "multiple_choice",
      options: ["1", "2", "3", "4"],
      max_points: 2,
      answer_key: "4",
      explanation: "Four.",
      rubric: "Correct = two points.",
    })),
  });
  questions = await store.localQuestionsForTest(testId);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function completed() {
  const id = await store.startLocalAttempt(testId);
  await store.saveLocalAnswers(id, { [questions[0].id]: "4" }, []);
  const attempt = await store.claimLocalSubmission(id, "token");
  const results = await gradeWritten(questions, attempt.responses);
  await store.finishLocalSubmission(id, "token", results, prediction);
  return id;
}
describe("local persistent practice workflow", () => {
  it("deletes a test and results while keeping its exam, grade, and library", async () => {
    const id = await completed();
    await store.recordLocalGrade(exam, 85);
    await store.deleteLocalTest(testId);
    const data = await store.readLocalData();
    for (const collection of [
      data.tests,
      data.questions,
      data.attempts,
      data.answers,
      data.predictions,
    ])
      expect(collection).toHaveLength(0);
    expect(data.exams).toHaveLength(1);
    expect(data.grades).toHaveLength(1);
    expect(data.materials).toHaveLength(1);
    await expect(store.localAttemptView(id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("cascades subject deletion while preserving another subject", async () => {
    await completed();
    await store.recordLocalGrade(exam, 90);
    const other = await store.createLocalExam({
      subject: "History",
      name: "Rome",
    });
    const subject = (await store.localState()).exams.find(
      (e) => e.id === exam,
    )!.subject_id;
    await store.deleteLocalSubject(subject);
    const data = await store.readLocalData();
    expect(data.subjects.map((s) => s.name)).toEqual(["History"]);
    expect(data.exams.map((e) => e.id)).toEqual([other.id]);
    for (const collection of [
      data.tests,
      data.questions,
      data.attempts,
      data.answers,
      data.predictions,
      data.grades,
    ])
      expect(collection).toHaveLength(0);
    expect(data.materials).toHaveLength(1);
  });
  it("never resurrects a deleted test when pending grading finishes", async () => {
    const id = await store.startLocalAttempt(testId);
    const attempt = await store.claimLocalSubmission(id, "pending");
    const results = await gradeWritten(questions, attempt.responses);
    await store.deleteLocalTest(testId);
    await expect(
      store.finishLocalSubmission(id, "pending", results, prediction),
    ).rejects.toMatchObject({ status: 404 });
    expect((await store.localState()).predictions).toHaveLength(0);
  });
  it("serializes concurrent writes across module reloads without losing exams", async () => {
    vi.resetModules();
    const second = await import("../src/lib/local-store");
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? store : second).createLocalExam({
          subject: "Physics",
          name: "Exam " + i,
        }),
      ),
    );
    const persisted = JSON.parse(
      await readFile(path.join(directory, "studypredict.json"), "utf8"),
    );
    expect(persisted.exams).toHaveLength(13);
    expect(persisted.subjects).toHaveLength(1);
  });
  it("keeps the previous successful write as a recoverable backup", async () => {
    const previous = await readFile(
      path.join(directory, "studypredict.json"),
      "utf8",
    );
    await store.createLocalExam({ subject: "History", name: "History test" });
    expect(
      await readFile(path.join(directory, "studypredict.json.bak"), "utf8"),
    ).toBe(previous);
  });
  it("fails closed on damaged data without overwriting it", async () => {
    await writeFile(path.join(directory, "studypredict.json"), "{damaged");
    await expect(
      store.createLocalExam({ subject: "History", name: "Test" }),
    ).rejects.toThrow(/could not be read/);
    expect(
      await readFile(path.join(directory, "studypredict.json"), "utf8"),
    ).toBe("{damaged");
  });
  it("resumes the same active attempt and reloads saved answers", async () => {
    const ids = await Promise.all([
      store.startLocalAttempt(testId),
      store.startLocalAttempt(testId),
    ]);
    expect(ids[0]).toBe(ids[1]);
    await store.saveLocalAnswers(ids[0], { [questions[0].id]: "4" }, [
      questions[1].id,
    ]);
    const view = await store.localAttemptView(ids[0]);
    expect(view.attempt.responses[questions[0].id]).toBe("4");
    expect(view.attempt.flags).toEqual([questions[1].id]);
    expect(JSON.stringify(view)).not.toContain("answer_key");
    expect(JSON.stringify(view)).not.toContain("rubric");
  });
  it("enforces the persisted deadline on the server", async () => {
    const id = await store.startLocalAttempt(testId);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60_000);
    await expect(store.saveLocalAnswers(id, {}, [])).rejects.toMatchObject({
      status: 409,
    });
    expect((await store.claimLocalSubmission(id, "token")).status).toBe(
      "grading",
    );
  });
  it("freezes submitted answers, rejects overlapping grading, and permits a failed request to retry", async () => {
    const id = await store.startLocalAttempt(testId);
    await store.claimLocalSubmission(id, "token");
    await expect(store.claimLocalSubmission(id, "other")).rejects.toMatchObject(
      { status: 409 },
    );
    await expect(store.saveLocalAnswers(id, {}, [])).rejects.toMatchObject({
      status: 409,
    });
    await store.releaseLocalSubmission(id, "token");
    expect((await store.claimLocalSubmission(id, "other")).grading_token).toBe(
      "other",
    );
    expect(
      (await store.localAttemptView(id)).attempt.grading_token,
    ).toBeUndefined();
  });
  it("reclaims interrupted grading after the lease expires", async () => {
    const id = await store.startLocalAttempt(testId);
    const initial = await store.claimLocalSubmission(id, "token");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60_000);
    const retry = await store.claimLocalSubmission(id, "retry");
    expect(retry.submitted_at).toBe(initial.submitted_at);
    expect(retry.grading_token).toBe("retry");
  });
  it("rejects duplicate, foreign, and over-awarded results atomically", async () => {
    const id = await store.startLocalAttempt(testId);
    const claimed = await store.claimLocalSubmission(id, "token");
    const results = await gradeWritten(questions, claimed.responses);
    for (const invalid of [
      [results[0], results[0]],
      [{ ...results[0], question_id: crypto.randomUUID() }, results[1]],
      [{ ...results[0], points: 3 }, results[1]],
    ])
      await expect(
        store.finishLocalSubmission(id, "token", invalid, prediction),
      ).rejects.toThrow();
    expect((await store.localState()).answers).toHaveLength(0);
    expect((await store.localState()).predictions).toHaveLength(0);
    expect((await store.localAttemptView(id)).attempt.status).toBe("grading");
    await store.finishLocalSubmission(id, "token", results, prediction);
    expect((await store.localAttemptView(id)).attempt.status).toBe("completed");
  });
  it("grades MC answers and blanks, reveals feedback only after completion, and finalizes once", async () => {
    const id = await completed();
    await store.finishLocalSubmission(id, "obsolete-token", [], prediction);
    const view = await store.localAttemptView(id);
    expect(view.attempt.score).toBe(50);
    expect(view.results).toHaveLength(2);
    expect(view.questions[0]).toHaveProperty("answer_key", "4");
    expect((await store.localState()).predictions).toHaveLength(1);
  });
  it("preserves the original forecast and grade timestamp when the actual grade is corrected", async () => {
    await completed();
    const before = (await store.localState()).predictions[0];
    await store.recordLocalGrade(exam, 75);
    const timestamp = (await store.localState()).grades[0].recorded_at;
    await store.recordLocalGrade(exam, 80);
    const state = await store.localState();
    expect(state.predictions[0]).toEqual(before);
    expect(state.grades[0]).toMatchObject({
      grade: 80,
      recorded_at: timestamp,
    });
    await expect(store.startLocalAttempt(testId)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("never adds a retrospective forecast after the actual grade is known", async () => {
    const id = await store.startLocalAttempt(testId);
    const attempt = await store.claimLocalSubmission(id, "token");
    await store.recordLocalGrade(exam, 80);
    await store.finishLocalSubmission(
      id,
      "token",
      await gradeWritten(questions, attempt.responses),
      prediction,
    );
    expect((await store.localState()).predictions).toHaveLength(0);
  });
  it("runs the real submission API and prediction engine without an API key for MC tests", async () => {
    const id = await store.startLocalAttempt(testId);
    await store.saveLocalAnswers(
      id,
      Object.fromEntries(questions.map((q) => [q.id, "4"])),
      [],
    );
    const response = await submit(
      new Request("http://127.0.0.1/api/attempts/" + id + "/submit", {
        method: "POST",
        headers: { Origin: "http://127.0.0.1" },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(200);
    const view = await store.localAttemptView(id);
    expect(view.attempt.score).toBe(100);
    expect(view.prediction?.subject).toBe("Physics");
    expect(view.prediction?.features.latest).toBe(100);
    expect(view.prediction?.lower).toBeLessThan(view.prediction!.upper);
  });
});

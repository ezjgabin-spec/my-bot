import "server-only";
import { mkdir, readFile, rename, open, copyFile } from "node:fs/promises";
import path from "node:path";
import type {
  ActualGrade,
  AnswerResult,
  Attempt,
  Difficulty,
  Exam,
  Format,
  Prediction,
  PracticeTest,
  Question,
  State,
  Subject,
} from "./types";
import { AppError } from "./server";
import type { BillingAccount, LedgerEntry, UsageReceipt } from "./plans";
import type { FlashcardDeck } from "./flashcard-decks";
import { isCloud } from "./cloud";
import { combineDocumentSummaries, MAX_INTERPRETER_SECTIONS } from "./material-interpreter";

export type StudyMaterial = {
  id: string;
  filename: string;
  mime_type: string;
  extracted_text: string;
  // Complete section-by-section AI study guide (optional for older materials).
  interpreted_text?: string;
  interpreted_sections?: number;
  // Completed summaries awaiting the next interpretation request.
  interpreted_parts?: string[];
  created_at: string;
};

export type LocalData = State & {
  billingAccounts: BillingAccount[];
  billingLedger: LedgerEntry[];
  billingUsage: UsageReceipt[];
  version: 1;
  materials: StudyMaterial[];
  flashcardDecks: FlashcardDeck[];
  questions: (Question & { test_id: string })[];
};

export const emptyData = (): LocalData => ({
  billingAccounts: [],
  billingLedger: [],
  billingUsage: [],
  version: 1,
  subjects: [],
  exams: [],
  tests: [],
  attempts: [],
  predictions: [],
  grades: [],
  answers: [],
  materials: [],
  flashcardDecks: [],
  questions: [],
});

// Next routes may bundle this module separately. Share the queue across bundles.
const shared = globalThis as typeof globalThis & {
  studyWriteQueue?: Promise<unknown>;
};

function dataDirectory() {
  return (
    process.env.STUDYPREDICT_DATA_DIR ||
    path.join(process.cwd(), ".studypredict-data")
  );
}

function dataFile() {
  return path.join(dataDirectory(), "studypredict.json");
}

async function load(): Promise<LocalData> {
  await mkdir(dataDirectory(), { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(dataFile(), "utf8")) as LocalData;
    // Upgrade existing desktop files without rewriting or discarding study data.
    parsed.billingAccounts ??= [];
    parsed.billingLedger ??= [];
    parsed.billingUsage ??= [];
    parsed.flashcardDecks ??= [];
    if (
      parsed.version !== 1 ||
      Object.keys(emptyData()).some(
        (key) =>
          key !== "version" && !Array.isArray(parsed[key as keyof LocalData]),
      )
    )
      throw new Error("Unsupported or damaged data");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyData();
    throw new AppError(
      "Your local study data could not be read. Quit the app and restore studypredict.json.bak from your data folder.",
      500,
    );
  }
}

async function save(data: LocalData) {
  const file = dataFile();
  const temporary = `${file}.${process.pid}.tmp`;
  const handle = await open(temporary, "w", 0o600);
  try {
    await handle.writeFile(JSON.stringify(data), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await copyFile(file, file + ".bak.tmp");
    await rename(file + ".bak.tmp", file + ".bak");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await rename(temporary, file);
}

export async function readLocalData() {
  if (isCloud()) return (await import("./cloud-store")).readCloudData();
  await shared.studyWriteQueue?.catch(() => undefined);
  return load();
}

export function updateLocalData<T>(
  change: (data: LocalData) => T | Promise<T>,
): Promise<T> {
  if (isCloud())
    return import("./cloud-store").then((store) =>
      store.updateCloudData(change),
    );
  const operation = (shared.studyWriteQueue ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      const data = await load();
      const result = await change(data);
      await save(data);
      return result;
    });
  shared.studyWriteQueue = operation;
  return operation;
}

export async function localState(): Promise<State> {
  const data = await readLocalData();
  return {
    subjects: data.subjects,
    exams: data.exams,
    tests: data.tests,
    attempts: data.attempts.map(publicAttempt),
    predictions: data.predictions,
    grades: data.grades,
    answers: data.answers,
  };
}

export function publicAttempt(attempt: Attempt): Attempt {
  const { grading_token: _token, ...safe } = attempt;
  void _token;
  return safe;
}

export async function createLocalExam(input: {
  subject: string;
  name: string;
  date?: string | null;
}) {
  return updateLocalData((data) => {
    let subject = data.subjects.find((item) => item.name === input.subject);
    if (!subject) {
      subject = {
        id: crypto.randomUUID(),
        name: input.subject,
      } satisfies Subject;
      data.subjects.push(subject);
    }
    const exam: Exam = {
      id: crypto.randomUUID(),
      subject_id: subject.id,
      name: input.name,
      exam_date: input.date ?? null,
      created_at: new Date().toISOString(),
    };
    data.exams.push(exam);
    return exam;
  });
}

export async function listLocalMaterials() {
  return (await readLocalData()).materials
    .map(({ id, filename, created_at }) => ({ id, filename, created_at }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function saveLocalMaterial(
  material: Omit<StudyMaterial, "created_at">,
  original?: Uint8Array,
) {
  if (isCloud())
    return (await import("./cloud-store")).storeCloudMaterial(
      material,
      original,
    );
  return updateLocalData((data) => {
    data.materials.push({ ...material, created_at: new Date().toISOString() });
  });
}

// Cache only the full guide for this user's own saved document. A summary is
// never visible to another account and the original text remains unchanged.
export async function cacheLocalMaterialInterpretation(
  materialId: string,
  summary: string,
  sections: number,
) {
  if (!summary || new TextEncoder().encode(summary).length > 120_000 ||
      !Number.isInteger(sections) || sections < 1 || sections > 24)
    throw new AppError("The document summary could not be saved.", 413);
  return updateLocalData((data) => {
    const material = data.materials.find((item) => item.id === materialId);
    if (!material) throw new AppError("Study material not found.", 404);
    // Never overwrite an existing interpretation on a concurrent request.
    if (!material.interpreted_text) {
      material.interpreted_text = summary;
      material.interpreted_sections = sections;
    }
  });
}

export async function saveLocalInterpretedSection(
  materialId: string,
  sectionIndex: number,
  total: number,
  summary: string,
) {
  if (!Number.isInteger(sectionIndex) || sectionIndex < 0 ||
      !Number.isInteger(total) || total < 1 || total > MAX_INTERPRETER_SECTIONS)
    throw new AppError("Invalid document section.", 400);
  if (!summary.trim() || new TextEncoder().encode(summary).length > 5_000)
    throw new AppError("Claude returned an invalid section summary.", 502);
  return updateLocalData((data) => {
    const material = data.materials.find((item) => item.id === materialId);
    if (!material) throw new AppError("Study material not found.", 404);
    if (material.interpreted_text)
      return { ready: true, completed: total, total };
    const parts = [...(material.interpreted_parts ?? [])];
    if (parts.length !== sectionIndex)
      throw new AppError("Document interpretation changed. Retry this section.", 409);
    parts.push(summary);
    if (parts.length === total) {
      material.interpreted_text = combineDocumentSummaries(parts);
      material.interpreted_sections = total;
      delete material.interpreted_parts;
    } else material.interpreted_parts = parts;
    return { ready: !!material.interpreted_text, completed: parts.length, total };
  });
}

export async function getGenerationContext(examId: string, materialId: string) {
  const data = await readLocalData();
  const exam = data.exams.find((item) => item.id === examId);
  const material = data.materials.find((item) => item.id === materialId);
  if (!exam || !material)
    throw new AppError("Exam or material not found.", 404);
  if (data.grades.some((grade) => grade.exam_id === examId))
    throw new AppError(
      "This exam already has an actual grade. Create a new school exam for further practice.",
      409,
    );
  const subject = data.subjects.find((item) => item.id === exam.subject_id);
  if (!subject) throw new AppError("The exam subject could not be found.", 500);
  const relatedTests = data.tests
    .filter((test) => test.material_id === materialId || test.exam_id === examId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);
  const previousQuestions = relatedTests.flatMap((test) =>
    data.questions.filter((question) => question.test_id === test.id)
      .map(({ prompt, topic }) => ({ prompt, topic })),
  );
  return {
    previousQuestions,
    subject: subject.name,
    interpreted: material.interpreted_text ?? null,
    material: isCloud()
      ? await (await import("./cloud-store")).cloudMaterialText(materialId)
      : material.extracted_text,
  };
}

export async function saveLocalTest(input: {
  examId: string;
  materialId: string;
  difficulty: Difficulty;
  format: Format;
  count: number;
  timeLimit: number | null;
  questions: Omit<Question, "id">[];
}) {
  return updateLocalData((data) => {
    if (
      !data.exams.some((exam) => exam.id === input.examId) ||
      !data.materials.some((material) => material.id === input.materialId)
    )
      throw new AppError("Exam or material not found.", 404);
    if (data.grades.some((grade) => grade.exam_id === input.examId))
      throw new AppError(
        "This exam already has an actual grade. Create a new school exam for further practice.",
        409,
      );
    if (input.questions.length !== input.count)
      throw new AppError(
        "Generated question count did not match the request.",
        502,
      );
    const id = crypto.randomUUID();
    const test: PracticeTest = {
      id,
      exam_id: input.examId,
      material_id: input.materialId,
      difficulty: input.difficulty,
      format: input.format,
      question_count: input.count,
      time_limit_minutes: input.timeLimit,
      topics: [...new Set(input.questions.map((question) => question.topic))],
      created_at: new Date().toISOString(),
    };
    data.tests.push(test);
    data.questions.push(
      ...input.questions.map(
        (question) =>
          ({
            ...question,
            id: crypto.randomUUID(),
            test_id: id,
          }) as Question & { test_id: string },
      ),
    );
    return id;
  });
}

export async function startLocalAttempt(testId: string) {
  return updateLocalData((data) => {
    const test = data.tests.find((item) => item.id === testId);
    if (!test) throw new AppError("Test not found.", 404);
    const active = data.attempts.find(
      (attempt) => attempt.test_id === testId && attempt.status !== "completed",
    );
    if (active) return active.id;
    if (data.grades.some((grade) => grade.exam_id === test.exam_id))
      throw new AppError(
        "This exam already has an actual grade. Create a new exam for further practice.",
        409,
      );
    const now = new Date();
    const attempt: Attempt = {
      id: crypto.randomUUID(),
      test_id: test.id,
      exam_id: test.exam_id,
      status: "in_progress",
      responses: {},
      flags: [],
      score: null,
      earned_points: null,
      possible_points: null,
      started_at: now.toISOString(),
      deadline_at: test.time_limit_minutes
        ? new Date(
            now.getTime() + test.time_limit_minutes * 60_000,
          ).toISOString()
        : null,
      submitted_at: null,
      completed_at: null,
      time_spent_seconds: null,
    };
    data.attempts.push(attempt);
    return attempt.id;
  });
}

export async function saveLocalAnswers(
  attemptId: string,
  responses: Record<string, string>,
  flags: string[],
) {
  return updateLocalData((data) => {
    const attempt = data.attempts.find((item) => item.id === attemptId);
    if (!attempt) throw new AppError("Attempt not found.", 404);
    if (
      attempt.status !== "in_progress" ||
      (attempt.deadline_at && Date.parse(attempt.deadline_at) <= Date.now())
    )
      throw new AppError(
        "Answers cannot be saved: time expired or attempt is already submitted.",
        409,
      );
    attempt.responses = responses;
    attempt.flags = flags;
  });
}

export async function claimLocalSubmission(attemptId: string, token: string) {
  return updateLocalData((data) => {
    const attempt = data.attempts.find((item) => item.id === attemptId);
    if (!attempt) throw new AppError("Attempt not found.", 404);
    if (attempt.status === "completed") return attempt;
    const started = (attempt as Attempt & { grading_started_at?: string })
      .grading_started_at;
    if (
      attempt.status === "grading" &&
      started &&
      Date.parse(started) > Date.now() - 5 * 60_000
    )
      throw new AppError(
        "Grading is already running. Refresh in a moment.",
        409,
      );
    attempt.status = "grading";
    attempt.grading_token = token;
    (attempt as Attempt & { grading_started_at?: string }).grading_started_at =
      new Date().toISOString();
    attempt.submitted_at ??= new Date().toISOString();
    return attempt;
  });
}

export async function releaseLocalSubmission(attemptId: string, token: string) {
  return updateLocalData((data) => {
    const attempt = data.attempts.find((item) => item.id === attemptId);
    if (attempt?.status === "grading" && attempt.grading_token === token)
      (
        attempt as Attempt & { grading_started_at?: string }
      ).grading_started_at = "2000-01-01T00:00:00Z";
  });
}

export async function finishLocalSubmission(
  attemptId: string,
  token: string,
  results: AnswerResult[],
  prediction: Omit<Prediction, "id" | "attempt_id" | "exam_id" | "created_at">,
) {
  return updateLocalData((data) => {
    const attempt = data.attempts.find((item) => item.id === attemptId);
    if (!attempt) throw new AppError("Attempt not found.", 404);
    if (attempt.status === "completed") return;
    if (attempt.status !== "grading" || attempt.grading_token !== token)
      throw new AppError("Submission lock expired; reload and retry.", 409);
    const expected = data.questions.filter(
      (question) => question.test_id === attempt.test_id,
    );
    if (
      !expected.length ||
      results.length !== expected.length ||
      new Set(results.map((r) => r.question_id)).size !== expected.length
    )
      throw new AppError("Incomplete grading.", 500);
    for (const result of results) {
      const question = expected.find((q) => q.id === result.question_id);
      if (
        !question ||
        result.max_points !== question.max_points ||
        !Number.isFinite(result.points) ||
        result.points < 0 ||
        result.points > question.max_points
      )
        throw new AppError("Invalid grading result.", 500);
    }
    data.answers.push(
      ...results.map((result) => ({
        ...result,
        id: crypto.randomUUID(),
        attempt_id: attempt.id,
      })),
    );
    const earned = results.reduce((sum, result) => sum + result.points, 0);
    const possible = results.reduce(
      (sum, result) => sum + result.max_points,
      0,
    );
    attempt.status = "completed";
    attempt.earned_points = earned;
    attempt.possible_points = possible;
    attempt.score = Math.round((earned / possible) * 10_000) / 100;
    attempt.completed_at = new Date().toISOString();
    const submitted = Date.parse(attempt.submitted_at!);
    attempt.time_spent_seconds = Math.max(
      0,
      Math.round(
        (Math.min(
          submitted,
          attempt.deadline_at ? Date.parse(attempt.deadline_at) : submitted,
        ) -
          Date.parse(attempt.started_at)) /
          1000,
      ),
    );
    attempt.grading_token = null;
    if (!data.grades.some((grade) => grade.exam_id === attempt.exam_id)) {
      data.predictions.push({
        ...prediction,
        id: crypto.randomUUID(),
        exam_id: attempt.exam_id,
        attempt_id: attempt.id,
        created_at: new Date().toISOString(),
      });
    }
  });
}

export async function recordLocalGrade(examId: string, grade: number) {
  return updateLocalData((data) => {
    if (!data.exams.some((exam) => exam.id === examId))
      throw new AppError("Exam not found.", 404);
    const existing = data.grades.find((item) => item.exam_id === examId);
    if (existing) existing.grade = grade;
    else
      data.grades.push({
        exam_id: examId,
        grade,
        recorded_at: new Date().toISOString(),
      } satisfies ActualGrade);
  });
}

export async function localAttemptView(id: string) {
  const data = await readLocalData();
  const attempt = data.attempts.find((item) => item.id === id);
  if (!attempt) throw new AppError("Attempt not found.", 404);
  const test = data.tests.find((item) => item.id === attempt.test_id);
  const exam = data.exams.find((item) => item.id === attempt.exam_id);
  if (!test || !exam) throw new AppError("Attempt data is incomplete.", 500);
  const subject = data.subjects.find((item) => item.id === exam.subject_id);
  const allQuestions = data.questions.filter(
    (question) =>
      (question as Question & { test_id?: string }).test_id === test.id,
  );
  const questions =
    attempt.status === "completed"
      ? allQuestions
      : allQuestions.map(({ answer_key, explanation, rubric, ...question }) => {
          void answer_key;
          void explanation;
          void rubric;
          return question;
        });
  return {
    attempt: publicAttempt(attempt),
    test,
    exam,
    subject: subject?.name ?? "Unknown subject",
    questions,
    results:
      attempt.status === "completed"
        ? data.answers.filter((answer) => answer.attempt_id === id)
        : [],
    prediction:
      attempt.status === "completed"
        ? (data.predictions.find(
            (prediction) => prediction.attempt_id === id,
          ) ?? null)
        : null,
  };
}

export async function localQuestionsForTest(testId: string) {
  return (await readLocalData()).questions.filter(
    (question) =>
      (question as Question & { test_id?: string }).test_id === testId,
  );
}

function removeTests(data: LocalData, testIds: Set<string>) {
  const attempts = new Set(
    data.attempts.filter((a) => testIds.has(a.test_id)).map((a) => a.id),
  );
  data.tests = data.tests.filter((t) => !testIds.has(t.id));
  data.questions = data.questions.filter((q) => !testIds.has(q.test_id));
  data.attempts = data.attempts.filter((a) => !attempts.has(a.id));
  data.answers = data.answers.filter((a) => !attempts.has(a.attempt_id ?? ""));
  data.predictions = data.predictions.filter(
    (p) => !attempts.has(p.attempt_id),
  );
}

function removeExams(data: LocalData, examIds: Set<string>) {
  removeTests(
    data,
    new Set(data.tests.filter((t) => examIds.has(t.exam_id)).map((t) => t.id)),
  );
  data.exams = data.exams.filter((e) => !examIds.has(e.id));
  data.grades = data.grades.filter((g) => !examIds.has(g.exam_id));
  data.predictions = data.predictions.filter((p) => !examIds.has(p.exam_id));
}

export async function deleteLocalTest(id: string) {
  return updateLocalData((data) => {
    if (!data.tests.some((t) => t.id === id))
      throw new AppError("Test not found.", 404);
    removeTests(data, new Set([id]));
  });
}

export async function deleteLocalExam(id: string) {
  return updateLocalData((data) => {
    if (!data.exams.some((e) => e.id === id))
      throw new AppError("Exam not found.", 404);
    removeExams(data, new Set([id]));
  });
}

export async function deleteLocalSubject(id: string) {
  return updateLocalData((data) => {
    if (!data.subjects.some((s) => s.id === id))
      throw new AppError("Subject not found.", 404);
    removeExams(
      data,
      new Set(data.exams.filter((e) => e.subject_id === id).map((e) => e.id)),
    );
    data.subjects = data.subjects.filter((s) => s.id !== id);
    // Saved materials may be reused by other subjects; keep the library intact.
  });
}

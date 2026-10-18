import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { getPlatformProxy } from "wrangler";
import type { CloudBindings } from "../src/lib/cloud";
import * as store from "../src/lib/local-store";
import { withAiLock, gradeWritten } from "../src/lib/ai";
import { POST as submit } from "../src/app/api/attempts/[id]/submit/route";
import { GET as viewAttempt } from "../src/app/api/attempts/[id]/route";
import { POST as upload } from "../src/app/api/materials/route";
import { GET as stateRoute } from "../src/app/api/state/route";
import { DELETE as deleteSubject } from "../src/app/api/subjects/[id]/route";
import { DELETE as deleteTest } from "../src/app/api/tests/[id]/route";
import { DELETE as deleteExam } from "../src/app/api/exams/[id]/route";
import { POST as interpret } from "../src/app/api/materials/interpret/route";

const context = new AsyncLocalStorage<string>();
let platform: Awaited<ReturnType<typeof getPlatformProxy<CloudBindings>>>;
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: platform.env }),
}));
vi.mock("../src/lib/cloud-auth", () => ({
  cloudUser: async () => {
    const id = context.getStore();
    if (!id) {
      const { AppError } = await import("../src/lib/server");
      throw new AppError("Sign in", 401);
    }
    return { id, email: `${id}@example.com` };
  },
}));
const as = <T>(id: string, run: () => Promise<T>) => context.run(id, run);
const origin = {
  Origin: "https://study.example.com",
  "Content-Type": "application/json",
};
beforeAll(async () => {
  platform = await getPlatformProxy<CloudBindings>({
    configPath: "wrangler.jsonc",
    persist: false,
  });
  const migration = await readFile(
    "cloudflare/migrations/0001_workspace.sql",
    "utf8",
  );
  await platform.env.DB.batch(
    migration
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((sql) => platform.env.DB.prepare(sql)),
  );
});
beforeEach(async () => {
  vi.stubEnv("STUDYPREDICT_CLOUD", "1");
  vi.stubEnv("APP_ORIGIN", "https://study.example.com");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AI_DAILY_USER_LIMIT", "10");
  vi.stubEnv("AI_DAILY_SITE_LIMIT", "30");
  await platform.env.DB.batch(
    [
      "DELETE FROM study_items",
      "DELETE FROM workspaces",
      "DELETE FROM ai_leases",
      "DELETE FROM ai_daily_usage",
    ].map((sql) => platform.env.DB.prepare(sql)),
  );
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await platform?.dispose();
});
async function seed() {
  const exam = await store.createLocalExam({
    subject: "Physics",
    name: "Forces",
  });
  const materialId = crypto.randomUUID();
  await store.saveLocalMaterial({
    id: materialId,
    filename: "notes.txt",
    mime_type: "text/plain",
    extracted_text:
      "Force equals mass times acceleration. Motion can be measured.",
  });
  const testId = await store.saveLocalTest({
    examId: exam.id,
    materialId,
    difficulty: "Medium",
    format: "multiple_choice",
    count: 1,
    timeLimit: null,
    questions: [
      {
        position: 0,
        prompt: "What is force?",
        kind: "multiple_choice",
        topic: "Forces",
        options: ["ma", "m/a", "a/m", "m+a"],
        answer_key: "ma",
        max_points: 1,
        explanation: "Newton's second law",
        rubric: "Correct answer",
      },
    ],
  });
  return {
    examId: exam.id,
    materialId,
    testId,
    attemptId: await store.startLocalAttempt(testId),
  };
}
describe("Cloudflare D1 account isolation", () => {
  it("protects interpretation and rejects oversized text before calling AI", async () => {
    const request = (text: string, requestOrigin = origin.Origin) =>
      new Request("https://study.example.com/api/materials/interpret", {
        method: "POST",
        headers: { ...origin, Origin: requestOrigin },
        body: JSON.stringify({ text }),
      });
    expect((await interpret(request("notes"))).status).toBe(401);
    expect(
      (
        await as("owner", () =>
          interpret(request("notes", "https://other.example")),
        )
      ).status,
    ).toBe(403);
    expect(
      (await as("owner", () => interpret(request("x".repeat(16001))))).status,
    ).toBe(400);
    expect((await as("owner", () => interpret(request(" ")))).status).toBe(400);
  });
  it("reserves interpretation quota separately and enforces its limit", async () => {
    vi.stubEnv("INTERPRETER_DAILY_USER_LIMIT", "2");
    try {
      await as("owner", () =>
        withAiLock("owner", async () => "section 1", "interpretation"),
      );
      await as("owner", () =>
        withAiLock("owner", async () => "section 2", "interpretation"),
      );
      await expect(
        as("owner", () =>
          withAiLock("owner", async () => "section 3", "interpretation"),
        ),
      ).rejects.toMatchObject({ status: 429 });
      expect(
        await as("owner", () => withAiLock("owner", async () => "test")),
      ).toBe("test");
      expect(
        await as("brother", () =>
          withAiLock("brother", async () => "section", "interpretation"),
        ),
      ).toBe("section");
    } finally {
      vi.stubEnv("INTERPRETER_DAILY_USER_LIMIT", "500");
    }
  });
  it("stores long Unicode notes in D1 without R2", async () => {
    await as("owner", async () => {
      const notes = "学习资料。".repeat(70000);
      const materialId = crypto.randomUUID();
      await store.saveLocalMaterial({
        id: materialId,
        filename: "long.txt",
        mime_type: "text/plain",
        extracted_text: notes,
      });
      const exam = await store.createLocalExam({
        subject: "Language",
        name: "Reading",
      });
      expect(
        (await store.getGenerationContext(exam.id, materialId)).material,
      ).toBe(notes);
    });
  });
  it("authorizes deletion and cascades D1 records without affecting other accounts", async () => {
    const owner = await as("owner", seed);
    await as("brother", seed);
    const subjectId = (await as("owner", store.localState)).subjects[0].id;
    const request = (kind: string, id: string, requestOrigin = origin.Origin) =>
      new Request(`https://study.example.com/api/${kind}/${id}`, {
        method: "DELETE",
        headers: { Origin: requestOrigin },
      });
    const params = (id: string) => ({ params: Promise.resolve({ id }) });
    await as("brother", async () => {
      expect(
        (await deleteTest(request("tests", owner.testId), params(owner.testId)))
          .status,
      ).toBe(404);
      expect(
        (await deleteExam(request("exams", owner.examId), params(owner.examId)))
          .status,
      ).toBe(404);
      expect(
        (await deleteSubject(request("subjects", subjectId), params(subjectId)))
          .status,
      ).toBe(404);
    });
    await as("owner", async () => {
      expect(
        (
          await deleteSubject(
            request("subjects", subjectId, "https://evil.example"),
            params(subjectId),
          )
        ).status,
      ).toBe(403);
      expect(
        (await deleteSubject(request("subjects", subjectId), params(subjectId)))
          .status,
      ).toBe(200);
      expect((await store.localState()).subjects).toHaveLength(0);
      expect((await store.readLocalData()).questions).toHaveLength(0);
    });
    expect((await as("brother", store.localState)).tests).toHaveLength(1);
  });
  it("rejects unsigned requests before accessing stored data", async () => {
    expect((await stateRoute()).status).toBe(401);
    await expect(store.localState()).rejects.toMatchObject({ status: 401 });
  });
  it("gives each account a private history and rejects foreign resource IDs", async () => {
    const owner = await as("owner", seed);
    const brother = await as("brother", seed);
    expect(
      (await as("owner", store.localState)).exams.map((e) => e.id),
    ).toEqual([owner.examId]);
    expect(
      (await as("brother", store.localState)).exams.map((e) => e.id),
    ).toEqual([brother.examId]);
    await as("brother", async () => {
      for (const run of [
        () => store.localAttemptView(owner.attemptId),
        () => store.startLocalAttempt(owner.testId),
        () => store.saveLocalAnswers(owner.attemptId, {}, []),
        () => store.recordLocalGrade(owner.examId, 100),
        () => store.getGenerationContext(brother.examId, owner.materialId),
      ])
        await expect(run()).rejects.toMatchObject({ status: 404 });
      expect(
        (
          await viewAttempt(new Request("https://study.example.com"), {
            params: Promise.resolve({ id: owner.attemptId }),
          })
        ).status,
      ).toBe(404);
    });
    const text = await as("owner", () =>
      store.getGenerationContext(owner.examId, owner.materialId),
    );
    expect(text.material).toContain("acceleration");
    const ownerData = await as("owner", store.readLocalData);
    const brotherData = await as("brother", store.readLocalData);
    expect(ownerData.materials).toHaveLength(1);
    expect(brotherData.materials).toHaveLength(1);
    expect(ownerData.materials[0].extracted_text).toContain("acceleration");
    expect(brotherData.materials[0].id).toBe(brother.materialId);
  });
  it("uploads actual material through the API and scopes it to the session", async () => {
    await as("upload-user", async () => {
      const response = await upload(
        new Request("https://study.example.com/api/materials", {
          method: "POST",
          headers: origin,
          body: JSON.stringify({
            filename: "guide.txt",
            base64: Buffer.from(
              "Forces cause acceleration. Newton's second law says F equals m times a.",
            ).toString("base64"),
          }),
        }),
      );
      expect(response.status).toBe(201);
      const body = await response.json();
      const saved = await store.readLocalData();
      expect(saved.materials).toHaveLength(1);
      expect(saved.materials[0].id).toBe(body.id);
      expect(saved.materials[0].extracted_text).toContain(
        "Newton's second law",
      );
      expect(await store.listLocalMaterials()).toHaveLength(1);
    });
    expect(await as("brother", store.listLocalMaterials)).toHaveLength(0);
  });
  it("does not lose updates from concurrent requests or duplicate active attempts", async () => {
    await as("owner", async () => {
      await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          store.createLocalExam({ subject: "Physics", name: `Exam ${i}` }),
        ),
      );
      expect((await store.localState()).exams).toHaveLength(6);
      expect((await store.localState()).subjects).toHaveLength(1);
      const { testId, attemptId } = await seed();
      expect(
        await Promise.all([
          store.startLocalAttempt(testId),
          store.startLocalAttempt(testId),
        ]),
      ).toEqual([attemptId, attemptId]);
    });
  });
  it("completes the real grading and prediction workflow in D1 exactly once", async () => {
    await as("owner", async () => {
      const { attemptId, testId } = await seed();
      const view = await store.localAttemptView(attemptId);
      expect(view.questions[0]).not.toHaveProperty("answer_key");
      const questions = await store.localQuestionsForTest(testId);
      await store.saveLocalAnswers(attemptId, { [questions[0].id]: "ma" }, []);
      const request = () =>
        new Request(
          `https://study.example.com/api/attempts/${attemptId}/submit`,
          { method: "POST", headers: origin },
        );
      const params = { params: Promise.resolve({ id: attemptId }) };
      expect((await submit(request(), params)).status).toBe(200);
      expect((await submit(request(), params)).status).toBe(200);
      const saved = await store.localAttemptView(attemptId);
      expect(saved.attempt.score).toBe(100);
      expect(saved.prediction?.subject).toBe("Physics");
      expect(saved.questions[0]).toHaveProperty("answer_key", "ma");
      expect((await store.localState()).predictions).toHaveLength(1);
      expect((await store.localState()).answers).toHaveLength(1);
      expect(await gradeWritten(questions, {})).toHaveLength(1);
    });
    expect((await as("brother", store.localState)).predictions).toHaveLength(0);
  });
  it("holds AI leases across requests per account and releases failed requests", async () => {
    await as("owner", () =>
      withAiLock("owner", async () => {
        await expect(
          withAiLock("owner", async () => true),
        ).rejects.toMatchObject({ status: 409 });
        expect(
          await as("brother", () =>
            withAiLock("brother", async () => "allowed"),
          ),
        ).toBe("allowed");
      }),
    );
    await expect(
      as("owner", () =>
        withAiLock("owner", async () => {
          throw new Error("failed");
        }),
      ),
    ).rejects.toThrow("failed");
    expect(
      await as("owner", () => withAiLock("owner", async () => "released")),
    ).toBe("released");
  });
  it("atomically limits shared spending across different accounts", async () => {
    vi.stubEnv("AI_DAILY_SITE_LIMIT", "1");
    const attempts = await Promise.allSettled(
      ["owner", "brother"].map((id) =>
        as(id, () => withAiLock(id, async () => "one request")),
      ),
    );
    expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(attempts.find((x) => x.status === "rejected")).toMatchObject({
      reason: { status: 429 },
    });
  });
});

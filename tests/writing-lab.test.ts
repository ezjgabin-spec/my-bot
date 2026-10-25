import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { POST, GET } from "../src/app/api/writing/route";
import { POST as recordActual } from "../src/app/api/writing/actual/route";
import { readLocalData } from "../src/lib/local-store";
import { runWriting } from "../src/lib/writing-service";
import { POST as lockReadiness } from "../src/app/api/readiness/route";
import { POST as uploadRubric } from "../src/app/api/writing/rubric/route";

vi.mock("@/lib/writing-service", () => ({
  runWriting: vi.fn(
    async (input: {
      requestId: string;
      action: string;
      autoHumanize: boolean;
      tone: string;
    }) => ({
      id: input.requestId,
      createdAt: new Date().toISOString(),
      action: input.action,
      autoHumanize: input.autoHumanize,
      tone: input.tone,
      result: "Educational feedback on the submitted essay.",
      feedback: {
        lower: 80,
        upper: 88,
        likelyLetter: "B",
        confidence: "low",
        overview: "A careful approximate grade.",
        strengths: ["Clear direction"],
        priorities: ["More analysis"],
        criteria: [],
        limitations: "Teacher grading varies.",
      },
    }),
  ),
  writingEstimate: vi.fn(() => ({
    estimatedCredits: 1,
    estimatedDollars: 0.025,
    pricingVersion: "test",
  })),
}));
const URL = "http://localhost:3000/api/writing";
const request = (url: string, value: unknown) =>
  new Request(url, {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(value),
  });
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "writing-lab-"));
  vi.stubEnv("STUDYPREDICT_DATA_DIR", dir);
  vi.mocked(runWriting).mockClear();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
const essay =
  "An important literary idea is that writers choose language to reveal character and change. ".repeat(
    4,
  );

describe("Writing Lab persistence and benchmarks", () => {
  it("extracts an uploaded rubric for review without AI charges or silent truncation", async () => {
    const upload = (text: string) =>
      new Request(URL + "/rubric", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/octet-stream",
          "x-filename": "teacher-rubric.txt",
        },
        body: text,
      });
    const text =
      "Argument: 40 points. Evidence: 40 points. Organization and clarity: 20 points.";
    const response = await uploadRubric(upload(text));
    expect(response.status).toBe(200);
    expect((await response.json()).rubric).toBe(text);
    expect((await uploadRubric(upload(text.repeat(200)))).status).toBe(400);
    expect(vi.mocked(runWriting)).not.toHaveBeenCalled();
  });
  it("saves an independent estimate, replays an identical request once, and then accepts a teacher grade", async () => {
    const requestId = crypto.randomUUID();
    const input = {
      requestId,
      title: "Test essay",
      text: essay,
      action: "grade",
      assignment: "Analyze the text.",
      rubric: "Argument and evidence",
      teacherFeedback: "",
    };
    const first = await POST(request(URL, input));
    expect(first.status).toBe(201);
    const result = await first.json();
    expect(result.revision.feedback.lower).toBe(80);
    expect(result.essay.actualTeacherGrade).toBeUndefined();
    const again = await POST(request(URL, input));
    expect(again.status).toBe(201);
    expect(vi.mocked(runWriting)).toHaveBeenCalledTimes(1);
    expect((await readLocalData()).writingDocuments[0].revisions).toHaveLength(
      1,
    );
    const actual = await recordActual(
      request(URL + "/actual", {
        essayId: requestId,
        grade: 83,
        teacherNotes: "Improve evidence.",
      }),
    );
    expect(actual.status).toBe(200);
    const saved = (await readLocalData()).writingDocuments[0];
    expect(saved.actualTeacherGrade).toBe(83);
    expect(saved.revisions[0].feedback?.lower).toBe(80);
    expect((await GET()).status).toBe(200);
  });
  it("does not accept teacher grades before the first independent essay estimate", async () => {
    const r = await recordActual(
      request(URL + "/actual", { essayId: crypto.randomUUID(), grade: 70 }),
    );
    expect(r.status).toBe(404);
  });
  it("grades revised text, preserves the original and links the actual grade without changing the range", async () => {
    const essayId = crypto.randomUUID();
    await POST(
      request(URL, {
        requestId: essayId,
        title: "Drafts",
        text: essay,
        action: "grade",
        rubric: "Evidence",
      }),
    );
    const revised = essay + "A new conclusion with more detailed evidence.";
    expect(
      (
        await POST(
          request(URL, {
            requestId: crypto.randomUUID(),
            essayId,
            text: revised,
            action: "grade",
          }),
        )
      ).status,
    ).toBe(201);
    expect(vi.mocked(runWriting).mock.calls.at(-1)?.[1]).toBe(revised);
    const before = (await readLocalData()).writingDocuments[0];
    expect(before.sourceText).toBe(essay.trim());
    expect(before.revisions[1].sourceSnapshot).toBe(revised);
    expect(before.revisions[1].rubricSnapshot).toBe("Evidence");
    expect(
      (
        await lockReadiness(
          request(URL, {
            id: crypto.randomUUID(),
            sourceId: essayId,
            kind: "essay",
            className: "English",
            teacher: "Ms A",
            runningGrade: 82,
            guess: 85,
          }),
        )
      ).status,
    ).toBe(201);
    const locked = (await readLocalData()).readinessRecords[0];
    expect((locked.info as { essay: string }).essay).toBe(revised);
    expect(
      (await recordActual(request(URL + "/actual", { essayId, grade: 89 })))
        .status,
    ).toBe(200);
    const saved = (await readLocalData()).readinessRecords[0];
    expect(saved.actual?.essayStages).toHaveLength(2);
    expect(saved.actual?.grade).toBe(89);
    expect(saved.lower).toBe(locked.lower);
    expect(
      (await recordActual(request(URL + "/actual", { essayId, grade: 99 })))
        .status,
    ).toBe(409);
    expect(
      (
        await POST(
          request(URL, {
            requestId: crypto.randomUUID(),
            essayId,
            text: revised,
            action: "grade",
          }),
        )
      ).status,
    ).toBe(409);
  });
});

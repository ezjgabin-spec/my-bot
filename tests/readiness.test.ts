import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { POST, PATCH, PUT } from "../src/app/api/readiness/route";
import { GET as accuracy } from "../src/app/api/accuracy/route";
import { readLocalData, updateLocalData } from "../src/lib/local-store";
import {
  readinessMetrics,
  calibratedRange,
  type ReadinessRecord,
} from "../src/lib/readiness";
import { computeKey } from "../src/lib/key-check";
let dir: string;
const eid = crypto.randomUUID();
const input = {
  id: crypto.randomUUID(),
  sourceId: eid,
  kind: "test",
  className: "AP Statistics",
  teacher: "Teacher",
  runningGrade: 82,
  guess: 90,
};
const req = (body: unknown) =>
  new Request("http://localhost:3000/api/readiness", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "readiness-"));
  vi.stubEnv("STUDYPREDICT_DATA_DIR", dir);
  await updateLocalData((d) => {
    d.exams.push({
      id: eid,
      name: "Next exam",
      subject_id: "s",
      exam_date: null,
      created_at: new Date().toISOString(),
    });
    d.predictions.push({ id: "p", exam_id: eid, predicted: 85 } as never);
  });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
it("locks ranges and baselines and rejects post-outcome Claude comparisons", async () => {
  expect((await POST(req(input))).status).toBe(201);
  const before = (await readLocalData()).readinessRecords[0];
  expect(before.lower).toBe(65);
  expect(before.upper).toBe(100);
  expect(
    (await POST(req({ ...input, id: crypto.randomUUID(), guess: 100 }))).status,
  ).toBe(409);
  expect((await PATCH(req({ id: input.id, grade: 88 }))).status).toBe(200);
  expect((await PUT(req({ id: input.id }))).status).toBe(409);
  expect((await PATCH(req({ id: input.id, grade: 95 }))).status).toBe(409);
  expect((await readLocalData()).readinessRecords[0].guess).toBe(90);
});
it("suppresses all public small-sample numbers and identifiers", async () => {
  await POST(req(input));
  await PATCH(req({ id: input.id, grade: 88 }));
  const result = await (await accuracy()).json();
  expect(result.ready).toBe(false);
  expect(JSON.stringify(result)).not.toContain("Teacher");
  expect(result.count).toBeUndefined();
});
it("measures coverage and baseline error without imputing missing comparisons", () => {
  const r = {
    at: "2026-01-01",
    lower: 70,
    upper: 90,
    guess: 90,
    runningGrade: 75,
    actual: { grade: 85, at: "2026-02-01" },
  } as ReadinessRecord;
  const m = readinessMetrics([r]);
  expect(m.coverage).toBe(1);
  expect(m.methods.find((m) => m.method === "app")?.mae).toBe(5);
  expect(m.methods.find((m) => m.method === "claude")?.count).toBe(0);
  expect(calibratedRange(80, []).calibrationCount).toBe(0);
});
it("computes numeric keys without executing model-generated code", () => {
  expect(computeKey({ operation: "mean", values: [2, 4, 9] })).toBe(5);
  expect(computeKey({ operation: "sample_sd", values: [1, 2, 3] })).toBe(1);
  expect(() => computeKey({ operation: "ratio", values: [1, 0] })).toThrow();
});
it("rejects a late Claude comparison when an older outcome exists outside the readiness form", async () => {
  await POST(req(input));
  await updateLocalData((d) => {
    d.grades.push({
      exam_id: eid,
      grade: 89,
      recorded_at: new Date().toISOString(),
    });
  });
  expect((await PUT(req({ id: input.id }))).status).toBe(409);
});
it("freezes the original practice stages when the real outcome is recorded", async () => {
  await updateLocalData((d) => {
    d.tests.push({
      id: "stage-test",
      exam_id: eid,
      difficulty: "Medium",
      format: "multiple_choice",
    } as never);
    d.attempts.push({
      id: "stage-attempt",
      exam_id: eid,
      test_id: "stage-test",
      status: "completed",
      score: 65,
      completed_at: "2026-01-01",
    } as never);
  });
  await POST(req(input));
  await PATCH(req({ id: input.id, grade: 89 }));
  await updateLocalData((d) => {
    d.attempts[0].score = 100;
  });
  const r = (await readLocalData()).readinessRecords[0];
  expect(r.actual?.practiceStages?.[0].score).toBe(65);
  expect(r.actual?.grade).toBe(89);
});

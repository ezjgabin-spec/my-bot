import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { POST as tag } from "../src/app/api/readiness/context/route";
import { GET as stage } from "../src/app/api/readiness/stage/route";
import { POST as lock } from "../src/app/api/readiness/route";
import {
  readLocalData,
  updateLocalData,
  recordLocalGrade,
} from "../src/lib/local-store";
let dir: string;
const request = (body: unknown) =>
  new Request("http://localhost:3000/api/readiness/context", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "assessment-context-"));
  vi.stubEnv("STUDYPREDICT_DATA_DIR", dir);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
it("makes tagged older outcomes available without fabricating prospective predictions", async () => {
  const previous = crypto.randomUUID(),
    current = crypto.randomUUID();
  await updateLocalData((d) => {
    for (const [id, score] of [
      [previous, 65],
      [current, 78],
    ] as const) {
      d.exams.push({
        id,
        name: id,
        subject_id: "s",
        exam_date: null,
        created_at: "2026-01-01",
      });
      d.tests.push({
        id,
        exam_id: id,
        difficulty: "Medium",
        format: "multiple_choice",
      } as never);
      d.attempts.push({
        id,
        test_id: id,
        exam_id: id,
        score,
        status: "completed",
        completed_at: "2026-02-01",
      } as never);
    }
    d.grades.push({ exam_id: previous, grade: 89, recorded_at: "2026-03-01" });
  });
  for (const sourceId of [previous, current])
    expect(
      (
        await tag(
          request({
            sourceId,
            kind: "test",
            className: "AP Stats",
            teacher: "Ms A",
          }),
        )
      ).status,
    ).toBe(200);
  // Freeze the older original attempts on tagging, even if their source is later removed.
  await updateLocalData((d) => {
    d.attempts = d.attempts.filter((a) => a.exam_id !== previous);
  });
  const result = await (
    await stage(
      new Request(
        `http://localhost:3000/api/readiness/stage?examId=${current}`,
      ),
    )
  ).json();
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0]).toMatchObject({
    previousScore: 65,
    actualGrade: 89,
    difference: 13,
  });
  expect((await readLocalData()).readinessRecords).toHaveLength(0);
  expect(
    (
      await tag(
        request({
          sourceId: crypto.randomUUID(),
          kind: "test",
          className: "AP Stats",
          teacher: "Ms A",
        }),
      )
    ).status,
  ).toBe(404);
});
it("automatically links the ordinary grade form to the immutable readiness outcome", async () => {
  const eid = crypto.randomUUID();
  await updateLocalData((d) => {
    d.exams.push({
      id: eid,
      name: "Exam",
      subject_id: "s",
      exam_date: null,
      created_at: "2026-01-01",
    });
    d.predictions.push({ id: "p", exam_id: eid, predicted: 80 } as never);
  });
  expect(
    (
      await lock(
        request({
          id: crypto.randomUUID(),
          sourceId: eid,
          kind: "test",
          className: "Stats",
          teacher: "Ms A",
          runningGrade: 82,
          guess: 85,
        }),
      )
    ).status,
  ).toBe(201);
  await recordLocalGrade(eid, 89);
  const r = (await readLocalData()).readinessRecords[0];
  expect(r.actual?.grade).toBe(89);
  expect(r.lower).toBe(60);
  await expect(recordLocalGrade(eid, 99)).rejects.toThrow("cannot be changed");
  expect(
    (
      await tag(
        request({
          sourceId: eid,
          kind: "test",
          className: "Different class",
          teacher: "Ms A",
        }),
      )
    ).status,
  ).toBe(409);
});

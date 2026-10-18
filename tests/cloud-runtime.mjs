// Exercises the deployable Worker, not a replacement API implementation.
// Only external Access JWKS and Anthropic responses are simulated locally.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { makePdf } from "./pdf-fixture.mjs";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const publicJwk = {
  ...(await exportJWK(publicKey)),
  kid: "test",
  alg: "RS256",
};
let aiCalls = 0;
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "studypredict",
    port: 8789,
    modules: true,
    scriptPath: ".wrangler/cloud-bundle/worker.js",
    compatibilityDate: "2026-10-17",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    bindings: {
      STUDYPREDICT_CLOUD: "1",
      APP_ORIGIN: "http://127.0.0.1:8789",
      CF_ACCESS_TEAM_DOMAIN: "study.cloudflareaccess.com",
      CF_ACCESS_AUD: "study-app",
      ALLOWED_EMAILS: "*",
      ANTHROPIC_API_KEY: "test-placeholder-not-a-real-key",
      AI_DAILY_USER_LIMIT: "10",
      AI_DAILY_SITE_LIMIT: "30",
    },
    serviceBindings: {
      ASSETS: () => new Response("Not found", { status: 404 }),
    },
    outboundService: async (request) => {
      const url = new URL(request.url);
      if (
        url.href === "https://study.cloudflareaccess.com/cdn-cgi/access/certs"
      )
        return Response.json({ keys: [publicJwk] });
      if (
        url.hostname === "api.anthropic.com" &&
        url.pathname === "/v1/messages"
      ) {
        aiCalls++;
        const body = await request.json();
        const input = JSON.parse(body.messages[0].content);
        if (input.sourceText) assert.ok(input.sourceText.includes("Function"));
        else assert.ok(input.studyMaterial.includes("Function"));
        const questions = Array.from(
          { length: input.settings?.count ?? 0 },
          (_, i) => ({
            kind: "multiple_choice",
            prompt: `Which expression is the composition in problem ${i + 1}?`,
            topic: "Functions",
            options: ["f(g(x))", "f(x)+g(x)", "f(x)-g(x)", "x"],
            max_points: 1,
            answer_key: "f(g(x))",
            explanation: "Apply the inner function first.",
            rubric: "One point for the correct option.",
          }),
        );
        return Response.json({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: body.model,
          content: [
            {
              type: "tool_use",
              id: "tool_test",
              name: "return_result",
              input: input.sourceText
                ? {
                    summary:
                      "[Page 1] Function composition applies the inner function before the outer function. Keep the domain restrictions.",
                  }
                : { questions },
            },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 100, output_tokens: 100 },
        });
      }
      throw new Error(
        `Unexpected external request: ${url.origin}${url.pathname}`,
      );
    },
  }),
);
try {
  const { DB: db } = await runtime.getBindings();
  const migration = await readFile(
    "cloudflare/migrations/0001_workspace.sql",
    "utf8",
  );
  await db.batch(
    migration
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((sql) => db.prepare(sql)),
  );
  async function identity(id) {
    return new SignJWT({ email: `${id}@example.com` })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject(id)
      .setIssuer("https://study.cloudflareaccess.com")
      .setAudience("study-app")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
  }
  const owner = await identity("owner"),
    brother = await identity("brother");
  async function api(
    token,
    path,
    body,
    method = body ? "POST" : "GET",
    status = 200,
  ) {
    const response = await runtime.dispatchFetch(
      `http://127.0.0.1:8789${path}`,
      {
        method,
        headers: {
          Origin: "http://127.0.0.1:8789",
          "Content-Type": "application/json",
          ...(token ? { "cf-access-jwt-assertion": token } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    const data = await response.json();
    assert.equal(
      response.status,
      status,
      `${method} ${path}: ${JSON.stringify(data)}`,
    );
    return data;
  }
  await api(null, "/api/state", null, "GET", 401);
  const initial = await api(owner, "/api/state");
  assert.equal(initial.user.email, "owner@example.com");
  assert.equal(initial.aiReady, true);
  assert.deepEqual(initial.state.exams, []);
  await api(
    null,
    "/api/materials/interpret",
    { text: "Function composition" },
    "POST",
    401,
  );
  await api(
    owner,
    "/api/materials/interpret",
    { text: "x".repeat(16001) },
    "POST",
    400,
  );
  const interpreted = await api(
    owner,
    "/api/materials/interpret",
    { text: "[Page 1] Function composition applies the inner function first." },
    "POST",
  );
  assert.ok(interpreted.summary.includes("Function composition"));
  const { exam } = await api(
    owner,
    "/api/exams",
    { subject: "Math", name: "Functions" },
    "POST",
    201,
  );
  let material;
  for (const extension of ["pdf", "docx"]) {
    material = await api(
      owner,
      "/api/materials",
      {
        filename: `study-guide.${extension}`,
        base64: (
          await readFile(`tests/fixtures/study-guide.${extension}`)
        ).toString("base64"),
      },
      "POST",
      201,
    );
    assert.ok(material.characters > 40);
  }
  const largeUpload = await runtime.dispatchFetch(
    "http://127.0.0.1:8789/api/materials",
    {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:8789",
        "cf-access-jwt-assertion": owner,
        "Content-Type": "application/octet-stream",
        "X-Filename": "long-study-guide.pdf",
      },
      body: makePdf({ pages: 150, paddingBytes: 4 * 1024 * 1024 }),
    },
  );
  const largeMaterial = await largeUpload.json();
  assert.equal(largeUpload.status, 201, JSON.stringify(largeMaterial));
  material = await api(
    owner,
    "/api/materials",
    {
      filename: "interpreted-study-guide.txt",
      text: interpreted.summary,
    },
    "POST",
    201,
  );
  const { testId } = await api(
    owner,
    "/api/tests/generate",
    {
      examId: exam.id,
      materialId: material.id,
      difficulty: "Medium",
      format: "multiple_choice",
      count: 10,
      timeLimit: null,
      focusTopics: [],
    },
    "POST",
    201,
  );
  assert.equal(aiCalls, 2);
  const { attemptId } = await api(owner, `/api/tests/${testId}/attempts`, {});
  const attempt = await api(owner, `/api/attempts/${attemptId}`);
  assert.equal(attempt.questions.length, 10);
  assert.equal(attempt.questions[0].answer_key, undefined);
  await api(brother, `/api/attempts/${attemptId}`, null, "GET", 404);
  await api(brother, `/api/exams/${exam.id}/grade`, { grade: 100 }, "PUT", 404);
  assert.deepEqual((await api(brother, "/api/state")).state.exams, []);
  assert.deepEqual((await api(brother, "/api/materials")).materials, []);
  await api(
    owner,
    `/api/attempts/${attemptId}`,
    {
      responses: Object.fromEntries(
        attempt.questions.map((q) => [q.id, "f(g(x))"]),
      ),
      flags: [],
    },
    "PATCH",
  );
  await api(owner, `/api/attempts/${attemptId}/submit`, {});
  const completed = await api(owner, `/api/attempts/${attemptId}`);
  assert.equal(completed.attempt.score, 100);
  assert.equal(completed.prediction.subject, "Math");
  assert.equal(completed.results.length, 10);
  await api(owner, `/api/exams/${exam.id}/grade`, { grade: 92 }, "PUT");
  assert.equal((await api(owner, "/api/state")).state.grades[0].grade, 92);
  assert.deepEqual((await api(brother, "/api/state")).state.grades, []);
  await api(brother, `/api/tests/${testId}`, null, "DELETE", 404);
  await api(owner, `/api/tests/${testId}`, null, "DELETE");
  let saved = (await api(owner, "/api/state")).state;
  assert.deepEqual(saved.tests, []);
  assert.deepEqual(saved.attempts, []);
  assert.deepEqual(saved.answers, []);
  assert.deepEqual(saved.predictions, []);
  assert.equal(saved.grades.length, 1);
  await api(owner, `/api/exams/${exam.id}`, null, "DELETE");
  saved = (await api(owner, "/api/state")).state;
  assert.deepEqual(saved.exams, []);
  assert.deepEqual(saved.grades, []);
  await api(owner, `/api/subjects/${saved.subjects[0].id}`, null, "DELETE");
  assert.deepEqual((await api(owner, "/api/state")).state.subjects, []);
  assert.equal((await api(owner, "/api/materials")).materials.length, 4);
  console.log(
    "Cloudflare Worker passed: interpretation, saved summaries used for tests, PDF/DOCX uploads, grading, predictions, private accounts, and deletion. External AI was simulated; no paid API calls made.",
  );
} finally {
  await runtime.dispose();
}

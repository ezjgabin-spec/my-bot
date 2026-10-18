// End-to-end check against the actual built Cloudflare Worker (email delivery mocked).
// No live email, Anthropic, or payment traffic is made.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const sentCodes = new Map();
const runtime = new Miniflare(convertV4MiniflareOptions({
  name: "studypredict-password-tests", port: 8791, modules: true,
  scriptPath: ".wrangler/cloud-bundle/worker.js",
  compatibilityDate: "2026-10-17",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"],
  bindings: {
    STUDYPREDICT_CLOUD: "1",
    APP_ORIGIN: "http://127.0.0.1:8791",
    PASSWORD_AUTH_ENABLED: "1",
    PASSWORD_AUTH_PEPPER: "integration-test-pepper-very-long-32-chars-only",
    AUTH_EMAIL_API_KEY: "integration-test-key",
    AUTH_FROM_EMAIL: "test@example.com",
    ANTHROPIC_API_KEY: "test-only-key",
    CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    CF_ACCESS_AUD: "test-app",
    ALLOWED_EMAILS: "*",
  },
  serviceBindings: { ASSETS: () => new Response("Not found", {status:404}) },
  outboundService: async (request) => {
    const url = new URL(request.url);
    if (url.origin === "https://api.resend.com") {
      const payload = await request.json();
      const match = /\b(\d{6})\b/.exec(payload.text);
      assert.ok(match, "Verification email must contain a six-digit code.");
      sentCodes.set(payload.to[0], match[1]);
      return Response.json({id:"mock-email"});
    }
    throw new Error("Unexpected external dependency: " + url.hostname);
  },
}));
try {
  const {DB} = await runtime.getBindings();
  for (const file of ["0001_workspace.sql", "0002_password_accounts.sql"]) {
    const sql = await readFile("cloudflare/migrations/" + file, "utf8");
    await DB.batch(sql.split(";").map((x)=>x.trim()).filter(Boolean).map((x)=>DB.prepare(x)));
  }
  async function call(route, body, {cookie, expected = 200, method = body ? "POST" : "GET"} = {}) {
    const response = await runtime.dispatchFetch("http://127.0.0.1:8791" + route, {
      method, headers: {
        "Content-Type": "application/json", Origin: "http://127.0.0.1:8791",
        "cf-connecting-ip": "192.0.2.1",
        ...(cookie ? { Cookie: cookie } : {}),
      }, ...(body ? {body:JSON.stringify(body)} : {}),
    });
    const data = await response.json();
    assert.equal(response.status, expected, route + " : " + JSON.stringify(data));
    return { data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  await call("/api/state", null, {expected:401});
  await call("/api/auth/register", {email:"STUDENT@example.com", password:"unique-student-password-123"});
  assert.ok(sentCodes.has("student@example.com"));
  await call("/api/auth/verify", {email:"student@example.com",code:"000001"}, {expected:400});
  const verified = await call("/api/auth/verify", {
    email:"student@example.com", code:sentCodes.get("student@example.com"),
  });
  assert.ok(verified.cookie?.startsWith("studypredict-auth="));
  const studentCookie = verified.cookie;
  const state = await call("/api/state", null, {cookie:studentCookie});
  assert.equal(state.data.user.email,"student@example.com");
  assert.equal(state.data.entitlement.plan,"free");
  assert.equal(state.data.entitlement.predictions,false);
  const billing = await call("/api/billing",null,{cookie:studentCookie});
  assert.equal(billing.data.freeTests,1);
  assert.ok(billing.data.balance.free > 0);
  await call("/api/auth/login",{email:"student@example.com",password:"incorrect-password"}, {expected:401});
  const signedIn = await call("/api/auth/login",{email:"student@example.com",password:"unique-student-password-123"});
  assert.ok(signedIn.cookie);
  const exam = await call("/api/exams",{subject:"Math",name:"Functions quiz"}, {cookie:studentCookie,expected:201});
  assert.ok(exam.data.exam.id);
  await call("/api/auth/register",{email:"second@example.com",password:"another-long-private-password"});
  const second = await call("/api/auth/verify", {email:"second@example.com",code:sentCodes.get("second@example.com")});
  assert.deepEqual((await call("/api/state",null,{cookie:second.cookie})).data.state.exams,[]);
  assert.equal((await call("/api/billing",null,{cookie:second.cookie})).data.freeTests,1);
  await call("/api/auth/logout",{}, {cookie:studentCookie});
  await call("/api/state",null,{cookie:studentCookie,expected:401});
  assert.equal((await call("/api/state",null,{cookie:signedIn.cookie})).data.state.exams.length,1);
  console.log("Password Worker runtime: verified email signup, private sessions, password checks, account isolation, free signup grant and logout passed.");
} finally {
  await runtime.dispose();
}

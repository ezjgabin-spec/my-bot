import { afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { protectMutation, readJson } from "../src/lib/server";
afterEach(() => vi.unstubAllEnvs());
function local(headers: Record<string, string> = {}) {
  return new NextRequest("http://127.0.0.1:3000/api/state", {
    headers: { host: "127.0.0.1:3000", ...headers },
  });
}
describe("local desktop access boundary", () => {
  it("requires the launch-specific desktop cookie", () => {
    vi.stubEnv("STUDYPREDICT_DESKTOP", "1");
    vi.stubEnv("STUDYPREDICT_SESSION_TOKEN", "private-launch-token");
    expect(proxy(local()).status).toBe(401);
    expect(proxy(local({ cookie: "studypredict-session=wrong" })).status).toBe(
      401,
    );
    expect(
      proxy(local({ cookie: "studypredict-session=private-launch-token" }))
        .status,
    ).toBe(200);
  });
  it("fails closed if the desktop token is absent", () => {
    vi.stubEnv("STUDYPREDICT_DESKTOP", "1");
    vi.stubEnv("STUDYPREDICT_SESSION_TOKEN", "");
    expect(proxy(local()).status).toBe(401);
  });
  it("blocks DNS rebinding and cross-site requests even in development", () => {
    vi.stubEnv("STUDYPREDICT_DESKTOP", "0");
    expect(proxy(local({ host: "evil.example:3000" })).status).toBe(403);
    expect(proxy(local({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(proxy(local()).status).toBe(200);
  });
  it("blocks missing and foreign mutation origins", () => {
    for (const origin of [null, "https://evil.example"]) {
      expect(() =>
        protectMutation(
          new Request("http://127.0.0.1:3000/api/exams", {
            method: "POST",
            headers: origin ? { Origin: origin } : {},
          }),
        ),
      ).toThrow(/origin/);
    }
    expect(() =>
      protectMutation(
        new Request("http://127.0.0.1:3000/api/exams", {
          method: "POST",
          headers: { Origin: "http://127.0.0.1:3000" },
        }),
      ),
    ).not.toThrow();
  });
  it("limits actual body bytes even without Content-Length", async () => {
    await expect(
      readJson(
        new Request("http://localhost/api/exams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "a".repeat(100) }),
        }),
        50,
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("accepts the actual loopback Host when standalone Next normalizes the URL", () => {
    expect(() =>
      protectMutation(
        new Request("http://localhost:3211/api/exams", {
          method: "POST",
          headers: { Host: "127.0.0.1:3211", Origin: "http://127.0.0.1:3211" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      protectMutation(
        new Request("http://localhost:3211/api/exams", {
          method: "POST",
          headers: { Host: "evil.example", Origin: "http://evil.example" },
        }),
      ),
    ).toThrow(/origin/);
  });
  it("rejects non-JSON and malformed bodies", async () => {
    await expect(
      readJson(
        new Request("http://localhost/api/exams", {
          method: "POST",
          body: "hello",
        }),
      ),
    ).rejects.toThrow(/JSON/);
    await expect(
      readJson(
        new Request("http://localhost/api/exams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
      ),
    ).rejects.toThrow(/Invalid JSON/);
  });
});

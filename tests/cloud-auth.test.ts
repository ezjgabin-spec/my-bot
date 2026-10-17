import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyAccessToken } from "../src/lib/cloud-auth";
import { protectMutation } from "../src/lib/server";
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: ReturnType<typeof createLocalJWKSet>;
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(keys.publicKey)), kid: "test", alg: "RS256" }],
  });
});
beforeEach(() => {
  vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "study.cloudflareaccess.com");
  vi.stubEnv("CF_ACCESS_AUD", "study-app");
  vi.stubEnv("ALLOWED_EMAILS", "owner@example.com,brother@example.com");
});
afterEach(() => vi.unstubAllEnvs());
async function token(
  options: {
    email?: string;
    issuer?: string;
    audience?: string;
    expires?: number;
  } = {},
) {
  return new SignJWT({ email: options.email ?? "owner@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setSubject("owner-id")
    .setIssuedAt()
    .setIssuer(options.issuer ?? "https://study.cloudflareaccess.com")
    .setAudience(options.audience ?? "study-app")
    .setExpirationTime(options.expires ?? Math.floor(Date.now() / 1000) + 600)
    .sign(keys.privateKey);
}
describe("Cloudflare Access identity", () => {
  it("accepts a signed, unexpired token for the correct app and invited email", async () => {
    expect(await verifyAccessToken(await token(), jwks)).toEqual({
      id: "owner-id",
      email: "owner@example.com",
    });
  });
  it("rejects other apps, issuers, expired sessions, and uninvited people", async () => {
    for (const options of [
      { audience: "other-app" },
      { issuer: "https://evil.example" },
      { expires: 1 },
      { email: "stranger@example.com" },
    ])
      await expect(
        verifyAccessToken(await token(options), jwks),
      ).rejects.toMatchObject({ status: 401 });
  });
  it("rejects unsigned and tampered tokens", async () => {
    const signed = await token();
    const parts = signed.split(".");
    parts[1] = Buffer.from(
      JSON.stringify({ email: "brother@example.com", sub: "brother" }),
    ).toString("base64url");
    await expect(
      verifyAccessToken(parts.join("."), jwks),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      verifyAccessToken("owner@example.com", jwks),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("fails closed when the invitation list is missing", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "");
    await expect(verifyAccessToken(await token(), jwks)).rejects.toMatchObject({
      status: 503,
    });
  });
  it("allows any verified email only when open signup is explicitly enabled", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "*");
    expect(
      (await verifyAccessToken(await token({ email: "new@example.com" }), jwks))
        .email,
    ).toBe("new@example.com");
    await expect(
      verifyAccessToken(await token({ audience: "other-app" }), jwks),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("requires the configured origin for every browser mutation", () => {
    vi.stubEnv("STUDYPREDICT_CLOUD", "1");
    vi.stubEnv("APP_ORIGIN", "https://study.example.com");
    for (const origin of ["https://evil.example", "null", ""]) {
      expect(() =>
        protectMutation(
          new Request("https://study.example.com/api/exams", {
            headers: { origin },
          }),
        ),
      ).toThrow(/origin/);
    }
    expect(() =>
      protectMutation(
        new Request("http://localhost/api/exams", {
          headers: { origin: "https://study.example.com" },
        }),
      ),
    ).not.toThrow();
  });
});

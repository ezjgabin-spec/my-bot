import "server-only";
import { headers, cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { AppError } from "./server";

const keySets = new Map<string, JWTVerifyGetKey>();

export function accessConfiguration() {
  const team = process.env.CF_ACCESS_TEAM_DOMAIN ?? "";
  const audience = process.env.CF_ACCESS_AUD ?? "";
  const emails = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) ||
    !audience ||
    !emails.length
  )
    throw new AppError(
      "The owner needs to finish Cloudflare sign-in setup.",
      503,
    );
  return { issuer: `https://${team}`, audience, emails };
}

// Verify signatures AND the specific Access application's audience. Neither a
// forwarded email header nor a decoded (unverified) JWT is an identity.
export async function verifyAccessToken(token: string, keys?: JWTVerifyGetKey) {
  const { issuer, audience, emails } = accessConfiguration();
  let jwks = keys ?? keySets.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keySets.set(issuer, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat", "email"],
    });
    if (
      typeof payload.sub !== "string" ||
      !payload.sub ||
      typeof payload.email !== "string" ||
      !(emails.includes("*") || emails.includes(payload.email.toLowerCase()))
    )
      throw new Error("Not invited");
    return { id: payload.sub, email: payload.email.toLowerCase() };
  } catch {
    throw new AppError(
      "Your sign-in session is invalid or expired. Please sign in again.",
      401,
    );
  }
}

export async function cloudUser() {
  const token =
    (await headers()).get("cf-access-jwt-assertion") ??
    (await cookies()).get("CF_Authorization")?.value;
  if (!token)
    throw new AppError("Sign in to open your private workspace.", 401);
  return verifyAccessToken(token);
}

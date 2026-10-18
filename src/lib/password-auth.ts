import "server-only";
import { cookies } from "next/headers";
import { cloudBindings } from "./cloud";
import { AppError } from "./server";
import type { NextResponse } from "next/server";

const COOKIE = "studypredict-auth";
const SESSION_SECONDS = 14 * 24 * 60 * 60;
const HASH_ITERATIONS = 260_000;
const enc = new TextEncoder();
const hex = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("hex");
const bytes = (count: number) => crypto.getRandomValues(new Uint8Array(count));
const sha = async (value: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function passwordAuthEnabled() {
  // Default OFF so an update never disables existing Cloudflare Access users.
  return process.env.PASSWORD_AUTH_ENABLED === "1";
}
function requirePasswordMode() {
  if (!passwordAuthEnabled()) throw new AppError("Password accounts are not enabled.", 404);
}
function authConfig() {
  requirePasswordMode();
  const pepper = process.env.PASSWORD_AUTH_PEPPER ?? "";
  const mailKey = process.env.AUTH_EMAIL_API_KEY ?? "";
  const from = process.env.AUTH_FROM_EMAIL ?? "";
  if (pepper.length < 32 || !mailKey || !from)
    throw new AppError("Password signup is awaiting secure email configuration.", 503);
  return { pepper, mailKey, from };
}
function normalizedEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 200 || !emailPattern.test(email)) throw new AppError("Enter a valid email.");
  return email;
}
function validatePassword(value: string) {
  if (value.length < 12 || value.length > 128 || enc.encode(value).length > 256)
    throw new AppError("Use a password between 12 and 128 characters.");
  return value;
}
async function passwordDigest(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits({
    name: "PBKDF2", hash: "SHA-256", salt: Buffer.from(salt, "base64url"), iterations: HASH_ITERATIONS,
  }, key, 256);
  return hex(result);
}
function equalHex(a: string, b: string) {
  if (a.length !== 64 || b.length !== 64) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
async function codeDigest(email: string, code: string) {
  const { pepper } = authConfig();
  const key = await crypto.subtle.importKey("raw", enc.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(email + ":" + code)));
}
async function limit(key: string, maximum: number, windowMs: number) {
  const { DB } = await cloudBindings();
  const now = Date.now();
  const hash = await sha(key);
  const row = await DB.prepare(
    "INSERT INTO password_rate_limits (key, attempts, expires_at) VALUES (?, 1, ?) " +
    "ON CONFLICT(key) DO UPDATE SET " +
    "attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END, " +
    "expires_at = CASE WHEN expires_at <= ? THEN ? ELSE expires_at END " +
    "RETURNING attempts",
  ).bind(hash, now + windowMs, now, now, now + windowMs).first<{ attempts: number }>();
  if (!row || row.attempts > maximum)
    throw new AppError("Too many attempts. Try again later.", 429);
}
function clientIp(request: Request) {
  // Cloudflare overwrites this header on requests arriving via its edge.
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}
async function sendCode(email: string, code: string) {
  const { mailKey, from } = authConfig();
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Bearer ${mailKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [email], subject: "Your StudyPredict verification code",
        text: `Your StudyPredict verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      }),
    });
  } catch {
    throw new AppError("Verification email could not be sent. Try again.", 502);
  }
  if (!response.ok) throw new AppError("Verification email could not be sent. Check email delivery settings.", 502);
}
export async function registerPasswordAccount(request: Request, input: { email: string; password: string }) {
  requirePasswordMode();
  authConfig();
  const email = normalizedEmail(input.email);
  const password = validatePassword(input.password);
  const ip = clientIp(request);
  await limit(`signup-ip:${ip}`, 8, 60 * 60_000);
  await limit(`signup-email:${email}`, 4, 60 * 60_000);
  const { DB } = await cloudBindings();
  const exists = await DB.prepare("SELECT id FROM password_accounts WHERE email = ?").bind(email).first();
  if (exists) throw new AppError("This email already has an account. Sign in instead.", 409);
  const salt = Buffer.from(bytes(16)).toString("base64url");
  const digest = await passwordDigest(password, salt);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const hashedCode = await codeDigest(email, code);
  const existing = await DB.prepare("SELECT id FROM password_signups WHERE email = ?").bind(email).first<{id:string}>();
  const id = existing?.id ?? "password:" + crypto.randomUUID();
  await DB.prepare(
    "INSERT INTO password_signups (email, id, salt, password_hash, code_hash, expires_at, attempts) " +
    "VALUES (?, ?, ?, ?, ?, ?, 0) ON CONFLICT(email) DO UPDATE SET " +
    "salt = excluded.salt, password_hash = excluded.password_hash, code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0",
  ).bind(email, id, salt, digest, hashedCode, Date.now() + 10 * 60_000).run();
  await sendCode(email, code);
}
export async function createPasswordSession(userId: string, response: NextResponse) {
  const { DB } = await cloudBindings();
  const token = Buffer.from(bytes(32)).toString("base64url");
  const tokenHash = await sha(token);
  const expiration = Date.now() + SESSION_SECONDS * 1000;
  await DB.prepare("INSERT INTO password_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(tokenHash, userId, expiration).run();
  response.cookies.set(COOKIE, token, {
    httpOnly: true, secure: (process.env.APP_ORIGIN ?? "").startsWith("https:"),
    sameSite: "lax", path: "/", maxAge: SESSION_SECONDS,
  });
}
export async function verifyPasswordSignup(request: Request, input: { email: string; code: string }, response: NextResponse) {
  requirePasswordMode();
  const email = normalizedEmail(input.email);
  if (!/^\d{6}$/.test(input.code)) throw new AppError("Enter the six-digit code.");
  await limit(`verify-ip:${clientIp(request)}`, 30, 15 * 60_000);
  const { DB } = await cloudBindings();
  const pending = await DB.prepare("SELECT id, code_hash, expires_at, attempts FROM password_signups WHERE email = ?")
    .bind(email).first<{ id: string; code_hash: string; expires_at: number; attempts: number }>();
  if (!pending || pending.expires_at < Date.now() || pending.attempts >= 5)
    throw new AppError("Code expired or too many attempts. Request a new code.", 400);
  const codeHash = await codeDigest(email, input.code);
  if (!equalHex(pending.code_hash, codeHash)) {
    await DB.prepare("UPDATE password_signups SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
    throw new AppError("Incorrect verification code.", 400);
  }
  const inserted = await DB.prepare(
    "INSERT OR IGNORE INTO password_accounts (id, email, salt, password_hash, created_at) " +
    "SELECT id, email, salt, password_hash, ? FROM password_signups " +
    "WHERE email = ? AND code_hash = ? AND expires_at >= ? AND attempts < 5",
  ).bind(Date.now(), email, codeHash, Date.now()).run();
  if (inserted.meta.changes !== 1) throw new AppError("This code is already used. Sign in instead.", 409);
  await DB.prepare("DELETE FROM password_signups WHERE email = ?").bind(email).run();
  await createPasswordSession(pending.id, response);
}
export async function loginPasswordAccount(request: Request, input: { email: string; password: string }, response: NextResponse) {
  requirePasswordMode();
  const email = normalizedEmail(input.email);
  const password = input.password;
  if (typeof password !== "string" || password.length > 128)
    throw new AppError("Invalid email or password.", 401);
  await limit(`login-ip:${clientIp(request)}`, 80, 15 * 60_000);
  await limit(`login-email:${email}`, 12, 15 * 60_000);
  const { DB } = await cloudBindings();
  const account = await DB.prepare("SELECT id, salt, password_hash FROM password_accounts WHERE email = ?")
    .bind(email).first<{ id: string; salt: string; password_hash: string }>();
  // Hash even when email doesn't exist to make basic account probing less useful.
  const salt = account?.salt ?? "AAAAAAAAAAAAAAAAAAAAAA";
  const digest = await passwordDigest(password, salt);
  if (!account || !equalHex(account.password_hash, digest))
    throw new AppError("Invalid email or password.", 401);
  await createPasswordSession(account.id, response);
}
export async function passwordUser() {
  requirePasswordMode();
  const token = (await cookies()).get(COOKIE)?.value ?? "";
  if (!/^[a-zA-Z0-9_-]{43}$/.test(token)) throw new AppError("Sign in to your StudyPredict account.", 401);
  const { DB } = await cloudBindings();
  const result = await DB.prepare(
    "SELECT a.id, a.email FROM password_sessions s " +
    "JOIN password_accounts a ON a.id = s.user_id " +
    "WHERE s.token_hash = ? AND s.expires_at > ?",
  ).bind(await sha(token), Date.now()).first<{ id: string; email: string }>();
  if (!result) throw new AppError("Your session expired. Sign in again.", 401);
  return result;
}
export async function logoutPasswordAccount(response: NextResponse) {
  requirePasswordMode();
  const token = (await cookies()).get(COOKIE)?.value ?? "";
  if (/^[a-zA-Z0-9_-]{43}$/.test(token)) {
    const { DB } = await cloudBindings();
    await DB.prepare("DELETE FROM password_sessions WHERE token_hash = ?").bind(await sha(token)).run();
  }
  response.cookies.set(COOKIE, "", { path: "/", httpOnly: true, secure: (process.env.APP_ORIGIN ?? "").startsWith("https:"), sameSite: "lax", maxAge: 0 });
}

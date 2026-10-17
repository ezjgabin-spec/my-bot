import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isCloud } from "./cloud";
import { cloudUser } from "./cloud-auth";

export const LOCAL_USER = { id: "local-owner" } as const;

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function requireUser() {
  if (isCloud()) return cloudUser();
  return LOCAL_USER;
}

export function protectMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (isCloud()) {
    const allowed = process.env.APP_ORIGIN;
    if (
      !allowed ||
      origin !== allowed ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new AppError("Request origin is not allowed.", 403);
    return;
  }
  // Standalone Next may normalize request.url to localhost internally.
  // Compare against the actual loopback Host header validated by our proxy.
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  if (
    !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) ||
    !origin ||
    origin !== url.protocol + "//" + host
  )
    throw new AppError("Request origin is not allowed.", 403);
}

export async function readJson(
  request: Request,
  maxBytes = 200_000,
): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("Expected a JSON request.");
  const buffer = await readBytes(request, maxBytes);
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new AppError("Invalid JSON request.");
  }
}

export async function readBytes(
  request: Request,
  maxBytes: number,
  tooLargeMessage = "Request is too large.",
): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AppError(tooLargeMessage, 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function apiError(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: error.issues
          .map(
            (issue) => `${issue.path.join(".") || "Input"}: ${issue.message}`,
          )
          .join("; "),
      },
      { status: 400 },
    );
  if (error instanceof AppError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "unknown",
  );
  return NextResponse.json(
    {
      error:
        "The operation could not be completed. Your saved work is preserved; please retry.",
    },
    { status: 500 },
  );
}

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

// The local server is bound to loopback; validate Host too to prevent DNS rebinding.
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (
    !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return NextResponse.json(
      { error: "Local app access only." },
      { status: 403 },
    );
  if (process.env.STUDYPREDICT_DESKTOP === "1") {
    const expected = Buffer.from(process.env.STUDYPREDICT_SESSION_TOKEN ?? "");
    const actual = Buffer.from(
      request.cookies.get("studypredict-session")?.value ?? "",
    );
    if (
      !expected.length ||
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    )
      return NextResponse.json(
        { error: "Open StudyPredict from the desktop app." },
        { status: 401 },
      );
  }
  return NextResponse.next();
}
export const config = { matcher: "/:path*" };

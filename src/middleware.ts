import { NextRequest, NextResponse } from "next/server";

// The local server is bound to loopback; validate Host too to prevent DNS rebinding.
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (
    process.env.NEXT_PUBLIC_STUDYPREDICT_CLOUD === "1" ||
    process.env.STUDYPREDICT_CLOUD === "1"
  ) {
    const origin = process.env.APP_ORIGIN;
    if (!origin || host !== new URL(origin).host)
      return NextResponse.json(
        { error: "Use the configured StudyPredict address." },
        { status: 403 },
      );
    // Data endpoints independently verify the Access JWT before touching data.
    const response = NextResponse.next();
    if (request.nextUrl.pathname.startsWith("/api/"))
      response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (
    !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return NextResponse.json(
      { error: "Local app access only." },
      { status: 403 },
    );
  if (process.env.STUDYPREDICT_DESKTOP === "1") {
    const expected = process.env.STUDYPREDICT_SESSION_TOKEN ?? "";
    const actual = request.cookies.get("studypredict-session")?.value ?? "";
    let difference = expected.length ^ actual.length;
    for (let i = 0; i < expected.length; i++)
      difference |= expected.charCodeAt(i) ^ (actual.charCodeAt(i) || 0);
    if (
      !expected.length ||
      expected.length !== actual.length ||
      difference !== 0
    )
      return NextResponse.json(
        { error: "Open StudyPredict from the desktop app." },
        { status: 401 },
      );
  }
  return NextResponse.next();
}
export const config = { matcher: "/:path*" };

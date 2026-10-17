import { NextResponse } from "next/server";
import { configurationStatus } from "@/lib/config";
import { requireUser, apiError } from "@/lib/server";
import { getState } from "@/lib/data";
export const dynamic = "force-dynamic";
export async function GET() {
  const config = await configurationStatus();
  if (!config.ready)
    return NextResponse.json(
      { configured: false, ...config },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const user = await requireUser();
    return NextResponse.json(
      {
        configured: true,
        aiReady: config.aiReady,
        user: "email" in user ? { email: user.email } : null,
        state: await getState(user.id),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}

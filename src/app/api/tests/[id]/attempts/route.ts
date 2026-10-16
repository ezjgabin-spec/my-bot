import { NextResponse } from "next/server";
import { protectMutation, apiError } from "@/lib/server";
import { uuid } from "@/lib/schemas";
import { startLocalAttempt } from "@/lib/local-store";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    protectMutation(request);
    return NextResponse.json({
      attemptId: await startLocalAttempt(uuid.parse((await context.params).id)),
    });
  } catch (e) {
    return apiError(e);
  }
}

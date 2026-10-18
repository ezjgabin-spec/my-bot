import { NextResponse } from "next/server";
import { configurationStatus } from "@/lib/config";
import { requireUser, apiError } from "@/lib/server";
import { getState } from "@/lib/data";
import { billingAccount } from "@/lib/billing";
import { activePlan, hasPredictions } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET() {
  // Report only which subsystem failed. Never expose secrets, JWTs,
  // database queries, or raw exception text in the public response.
  let stage: "configuration" | "sign-in" | "workspace" = "configuration";
  try {
    const config = await configurationStatus();
    if (!config.ready)
      return NextResponse.json(
        { configured: false, ...config },
        { headers: { "Cache-Control": "no-store" } },
      );
    stage = "sign-in";
    const user = await requireUser();
    stage = "workspace";
    const state = await getState(user.id);
    const billing = await billingAccount();
    const predictions = hasPredictions(billing);
    return NextResponse.json(
      {
        configured: true,
        aiReady: config.aiReady,
        authMethod: process.env.PASSWORD_AUTH_ENABLED === "1" ? "password" : "access",
        user: "email" in user ? { email: user.email } : null,
        state: predictions ? state : { ...state, predictions: [] },
        entitlement: { plan: activePlan(billing), family: billing.family, predictions },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("StudyPredict /api/state failed during:", stage, error);
    const response = apiError(error);
    if (response.status >= 500) {
      return NextResponse.json(
        {
          error: "StudyPredict could not load your workspace.",
          code:
            stage === "configuration"
              ? "CONFIGURATION_FAILED"
              : stage === "sign-in"
                ? "SIGN_IN_FAILED"
                : "WORKSPACE_STORAGE_FAILED",
        },
        { status: response.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return response;
  }
}

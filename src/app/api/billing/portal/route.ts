import { NextResponse } from "next/server";
import { billingPortal } from "@/lib/payments";
import { apiError, protectMutation } from "@/lib/server";
export async function POST(request: Request) {
  try {
    protectMutation(request);
    return NextResponse.json({ url: await billingPortal() });
  } catch (error) {
    return apiError(error);
  }
}

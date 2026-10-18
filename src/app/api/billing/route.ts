import { NextResponse } from "next/server";
import { billingSummary } from "@/lib/billing";
import { isBillingAdmin, paymentConfiguration } from "@/lib/payments";
import { apiError } from "@/lib/server";
export async function GET() {
  try {
    return NextResponse.json(
      {
        ...(await billingSummary()),
        payments: await paymentConfiguration(),
        admin: await isBillingAdmin(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

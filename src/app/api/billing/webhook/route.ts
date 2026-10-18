import { NextResponse } from "next/server";
import { receivePayment } from "@/lib/payments";
import { apiError, readBytes } from "@/lib/server";
export async function POST(request: Request) {
  try {
    const raw = (await readBytes(request, 1_000_000)).toString("utf8");
    await receivePayment(raw, request.headers.get("stripe-signature") ?? "");
    return NextResponse.json({ received: true });
  } catch (error) {
    return apiError(error);
  }
}

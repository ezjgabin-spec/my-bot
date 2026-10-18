import { NextResponse } from "next/server";
import { adminUsage, pendingUsage, reconcileUsage } from "@/lib/billing-admin";
import { apiError, protectMutation, readJson } from "@/lib/server";
import { z } from "zod";
export async function GET() {
  try {
    return NextResponse.json(
      { ...(await adminUsage()), pending: await pendingUsage() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const value = z
      .object({
        userId: z.string().min(1).max(200),
        receiptId: z.string().uuid(),
        costMicros: z.number().int().min(0).max(1_000_000_000),
        reference: z.string().trim().min(5).max(200),
      })
      .strict()
      .parse(await readJson(request, 2000));
    await reconcileUsage(
      value.userId,
      value.receiptId,
      value.costMicros,
      value.reference,
    );
    return NextResponse.json({ reconciled: true });
  } catch (error) {
    return apiError(error);
  }
}

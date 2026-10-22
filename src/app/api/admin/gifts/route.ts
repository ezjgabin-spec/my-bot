import { NextResponse } from "next/server";
import { apiError, protectMutation, readJson } from "@/lib/server";
import { listOwnerGifts, changeOwnerGift } from "@/lib/owner-gifts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listOwnerGifts(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    protectMutation(request);
    const updated = await changeOwnerGift(await readJson(request, 2500));
    return NextResponse.json({ updated }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

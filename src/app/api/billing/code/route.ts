import { NextResponse } from "next/server";
import { z } from "zod";
import { redeemFamilyCode } from "@/lib/billing";
import { apiError, protectMutation, readJson } from "@/lib/server";
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const { code } = z
      .object({ code: z.string().min(1).max(200) })
      .strict()
      .parse(await readJson(request, 2000));
    await redeemFamilyCode(code);
    return NextResponse.json({ unlocked: true });
  } catch (error) {
    return apiError(error);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { beginCheckout } from "@/lib/payments";
import { apiError, protectMutation, readJson } from "@/lib/server";
const schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("plan"),
      product: z.enum(["study", "plus", "ultra"]),
      requestId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("pack"),
      product: z.enum(["small", "medium", "large"]),
      requestId: z.string().uuid(),
    })
    .strict(),
]);
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const input = schema.parse(await readJson(request, 2000));
    return NextResponse.json({
      url: await beginCheckout(input.kind, input.product, input.requestId),
    });
  } catch (error) {
    return apiError(error);
  }
}

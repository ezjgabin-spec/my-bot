import { NextResponse } from "next/server";
import { apiError, protectMutation, requireUser } from "@/lib/server";
import { deleteLocalTest } from "@/lib/local-store";
import { uuid } from "@/lib/schemas";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    protectMutation(request);
    await requireUser();
    await deleteLocalTest(uuid.parse((await context.params).id));
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}

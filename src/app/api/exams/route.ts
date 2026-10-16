import { NextResponse } from "next/server";
import { protectMutation, apiError, readJson } from "@/lib/server";
import { examSchema } from "@/lib/schemas";
import { createLocalExam } from "@/lib/local-store";
export async function POST(request: Request) {
  try {
    protectMutation(request);
    return NextResponse.json(
      {
        exam: await createLocalExam(examSchema.parse(await readJson(request))),
      },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}

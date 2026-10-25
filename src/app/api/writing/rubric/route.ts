import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiError,
  AppError,
  protectMutation,
  readBytes,
  requireUser,
} from "@/lib/server";
import { requireFeature } from "@/lib/feature-access";
import { extractDocument, MAX_FILE_BYTES } from "@/lib/documents";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    protectMutation(request);
    await requireUser();
    await requireFeature("study");
    let filename: string;
    try {
      filename = decodeURIComponent(request.headers.get("x-filename") ?? "");
    } catch {
      throw new AppError("Invalid rubric filename.", 400);
    }
    filename = z.string().min(1).max(180).parse(filename);
    const bytes = await readBytes(
      request,
      MAX_FILE_BYTES,
      "Rubric upload exceeds the supported file size.",
    );
    const { text } = await extractDocument(filename, bytes);
    if (!text.trim())
      throw new AppError(
        "No rubric text could be read. Paste the rubric criteria instead.",
        400,
      );
    if (text.length > 12000)
      throw new AppError(
        "This document contains more than 12,000 characters. Upload just the rubric pages or paste the grading criteria; nothing was truncated.",
        400,
      );
    return NextResponse.json(
      { rubric: text, filename },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}

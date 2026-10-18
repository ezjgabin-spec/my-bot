import { NextResponse } from "next/server";
import { z } from "zod";
import {
  protectMutation,
  apiError,
  readJson,
  readBytes,
  AppError,
  requireUser,
} from "@/lib/server";
import { extractDocument, validateText, MAX_FILE_BYTES } from "@/lib/documents";
import { listLocalMaterials, saveLocalMaterial } from "@/lib/local-store";
import { MAX_MATERIAL_CHARACTERS } from "@/lib/material-limits";
import { importPublicStudyLink } from "@/lib/study-links";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  try {
    return NextResponse.json({ materials: await listLocalMaterials() });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    protectMutation(request);
    await requireUser();
    const binary =
      request.headers.get("content-type")?.split(";")[0] ===
      "application/octet-stream";
    let filename: string,
      text: string,
      mime = "text/plain";
    let original: Uint8Array | undefined;
    if (binary) {
      try {
        filename = decodeURIComponent(request.headers.get("x-filename") ?? "");
      } catch {
        throw new AppError("Invalid filename.");
      }
      filename = z.string().min(1).max(180).parse(filename);
      const buffer = await readBytes(
        request,
        MAX_FILE_BYTES,
        "This file is too large. The maximum upload size is 99 MB.",
      );
      const document = await extractDocument(filename, buffer);
      text = document.text;
      mime = document.mime;
      original = buffer;
    } else {
      const input = z
        .object({
          filename: z.string().min(1).max(180),
          text: z.string().max(MAX_MATERIAL_CHARACTERS).optional(),
          sourceUrl: z.string().url().max(2048).optional(),
          base64: z
            .string()
            .max(Math.ceil(MAX_FILE_BYTES / 3) * 4)
            .optional(),
        })
        .parse(
          await readJson(request, Math.ceil(MAX_FILE_BYTES / 3) * 4 + 4096),
        );
      filename = input.filename;
      if (input.sourceUrl) {
        const imported = await importPublicStudyLink(input.sourceUrl);
        filename = imported.filename;
        text = imported.text;
        mime = imported.mime;
      } else if (input.text !== undefined) text = validateText(input.text);
      else if (input.base64) {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64))
          throw new AppError("Invalid file encoding.");
        const buffer = Buffer.from(input.base64, "base64");
        original = buffer;
        if (buffer.length > MAX_FILE_BYTES)
          throw new AppError(
            "This file is too large. The maximum upload size is 99 MB.",
            413,
          );
        const document = await extractDocument(input.filename, buffer);
        text = document.text;
        mime = document.mime;
      } else throw new AppError("Upload a file or paste your study notes.");
    }
    const id = crypto.randomUUID();
    await saveLocalMaterial(
      {
        id,
        filename,
        mime_type: mime,
        extracted_text: text,
      },
      original,
    );
    return NextResponse.json(
      { id, filename, characters: text.length },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}

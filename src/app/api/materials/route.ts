import { NextResponse } from "next/server";
import { z } from "zod";
import { protectMutation, apiError, readJson, AppError } from "@/lib/server";
import { extractDocument, validateText, MAX_FILE_BYTES } from "@/lib/documents";
import { listLocalMaterials, saveLocalMaterial } from "@/lib/local-store";
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
    const input = z
      .object({
        filename: z.string().min(1).max(180),
        text: z.string().max(100000).optional(),
        base64: z
          .string()
          .max(4 * 1024 * 1024)
          .optional(),
      })
      .parse(await readJson(request, 4 * 1024 * 1024 + 4096));
    const id = crypto.randomUUID();
    let text: string,
      mime = "text/plain";
    if (input.text !== undefined) text = validateText(input.text);
    else if (input.base64) {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64))
        throw new AppError("Invalid file encoding.");
      const buffer = Buffer.from(input.base64, "base64");
      if (buffer.length > MAX_FILE_BYTES)
        throw new AppError("Files must be under 3 MB.", 413);
      const document = await extractDocument(input.filename, buffer);
      text = document.text;
      mime = document.mime;
    } else throw new AppError("Upload a file or paste your study notes.");
    await saveLocalMaterial({
      id,
      filename: input.filename,
      mime_type: mime,
      extracted_text: text,
    });
    return NextResponse.json(
      { id, filename: input.filename, characters: text.length },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}

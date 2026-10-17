import "server-only";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import yauzl from "yauzl";
import { AppError } from "./server";
import {
  MAX_FILE_BYTES,
  MAX_PDF_PAGES,
  MAX_MATERIAL_CHARACTERS,
} from "./material-limits";
export { MAX_FILE_BYTES } from "./material-limits";
async function inspectDocx(buffer: Buffer) {
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip)
        return reject(
          new AppError(
            "This Word file is damaged. Export it as DOCX or TXT and try again.",
          ),
        );
      let bytes = 0,
        entries = 0,
        hasDocument = false,
        settled = false;
      const fail = () => {
        if (!settled) {
          settled = true;
          zip.close();
          reject(
            new AppError(
              "This Word file is too large when expanded or is not a valid DOCX document.",
            ),
          );
        }
      };
      zip.on("error", fail);
      zip.on("entry", (entry) => {
        bytes += entry.uncompressedSize;
        entries++;
        if (
          bytes > 20 * 1024 * 1024 ||
          entries > 1000 ||
          entry.fileName.endsWith("vbaProject.bin")
        )
          return fail();
        if (entry.fileName === "word/document.xml") hasDocument = true;
        zip.readEntry();
      });
      zip.on("end", () => {
        if (!settled) {
          if (!hasDocument) return fail();
          settled = true;
          resolve();
        }
      });
      zip.readEntry();
    });
  });
}
export function validateText(text: string) {
  const cleaned = text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
  if (cleaned.length < 40)
    throw new AppError(
      "Not enough readable text was found. Scanned PDFs need OCR first; try pasting your notes or uploading a text-based file.",
    );
  if (cleaned.length > MAX_MATERIAL_CHARACTERS)
    throw new AppError(
      "The document contains more than 500,000 characters. Split it into chapters and upload the section you want to study.",
    );
  return cleaned;
}
export async function extractDocument(filename: string, buffer: Buffer) {
  if (!buffer.length || buffer.length > MAX_FILE_BYTES)
    throw new AppError("Choose a nonempty file up to 20 MB.");
  const extension = filename.toLowerCase().split(".").pop();
  try {
    if (extension === "txt") {
      if (buffer.includes(0))
        throw new AppError(
          "This does not appear to be a plain-text file. Export it as UTF-8 TXT.",
        );
      return {
        text: validateText(
          new TextDecoder("utf-8", { fatal: true }).decode(buffer),
        ),
        mime: "text/plain",
        extension,
      };
    }
    if (extension === "pdf") {
      if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-")))
        throw new AppError("The file does not contain a valid PDF header.");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const info = await parser.getInfo();
        if (info.total > MAX_PDF_PAGES)
          throw new AppError("Please upload at most 500 PDF pages at a time.");
        return {
          text: validateText((await parser.getText()).text),
          mime: "application/pdf",
          extension,
        };
      } finally {
        await parser.destroy();
      }
    }
    if (extension === "docx") {
      await inspectDocx(buffer);
      return {
        text: validateText((await mammoth.extractRawText({ buffer })).value),
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extension,
      };
    }
    throw new AppError(
      "Supported files: PDF, DOCX, and TXT. For older .doc files, save as .docx first.",
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "We could not read this document. Remove password protection or export it as DOCX, UTF-8 TXT, or a text-based PDF.",
    );
  }
}

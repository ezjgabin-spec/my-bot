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
// PPTX slides contain readable DrawingML text within a ZIP container.
// Extract all slides in numerical order without running macros or embedded files.
async function extractPptx(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip)
        return reject(new AppError("Invalid PowerPoint file."));
      const slides = new Map<number, string>();
      let total = 0;
      let entries = 0;
      let finished = false;
      const fail = (message: string) => {
        if (finished) return;
        finished = true;
        zip.close();
        reject(new AppError(message));
      };
      zip.on("error", () => fail("Could not read PowerPoint file."));
      zip.on("entry", (entry) => {
        entries++;
        total += entry.uncompressedSize;
        if (entries > 1800 || total > 35_000_000)
          return fail("PowerPoint expands beyond the supported size.");
        const match = /^ppt\/slides\/slide([1-9]\d*)\.xml$/.exec(
          entry.fileName,
        );
        if (!match) return zip.readEntry();
        if (entry.uncompressedSize > 2_000_000 || slides.size >= 500)
          return fail("PowerPoint slide limit exceeded.");
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream)
            return fail("Could not read PowerPoint slide.");
          const parts: Buffer[] = [];
          let length = 0;
          stream.on("error", () => fail("Could not read PowerPoint slide."));
          stream.on("data", (part: Buffer) => {
            length += part.length;
            if (length > 2_000_000)
              return fail("PowerPoint slide is too large.");
            parts.push(part);
          });
          stream.on("end", () => {
            if (finished) return;
            const xml = Buffer.concat(parts).toString("utf8");
            const texts = [
              ...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g),
            ].map((item) =>
              item[1].replace(
                /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,
                (entity) => {
                  const named: Record<string, string> = {
                    "&amp;": "&",
                    "&lt;": "<",
                    "&gt;": ">",
                    "&quot;": '"',
                    "&apos;": "'",
                  };
                  if (named[entity]) return named[entity];
                  const point = entity.startsWith("&#x")
                    ? parseInt(entity.slice(3, -1), 16)
                    : parseInt(entity.slice(2, -1), 10);
                  return Number.isInteger(point) &&
                    point > 0 &&
                    point <= 0x10ffff
                    ? String.fromCodePoint(point)
                    : entity;
                },
              ),
            );
            slides.set(Number(match[1]), texts.join(" "));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => {
        if (finished) return;
        finished = true;
        if (!slides.size)
          return reject(new AppError("No readable slides were found."));
        resolve(
          [...slides]
            .sort((a, b) => a[0] - b[0])
            .map(([num, text]) => `Slide ${num}: ${text}`)
            .join("\n\n"),
        );
      });
      zip.readEntry();
    });
  });
}

export function validateText(text: string, minimumCharacters = 1) {
  const cleaned = text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
  if (cleaned.length < minimumCharacters)
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
  if (!buffer.length) throw new AppError("This file is empty.");
  if (buffer.length > MAX_FILE_BYTES)
    throw new AppError(
      "This file is too large. The maximum upload size is 99 MB.",
      413,
    );
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
      // PDF.js rejects Node Buffer instances. A plain view avoids copying the file.
      const parser = new PDFParse({
        data: new Uint8Array(
          buffer.buffer,
          buffer.byteOffset,
          buffer.byteLength,
        ),
      });
      try {
        const info = await parser.getInfo();
        if (info.total > MAX_PDF_PAGES)
          throw new AppError("Please upload at most 500 PDF pages at a time.");
        return {
          text: validateText((await parser.getText()).text, 1),
          mime: "application/pdf",
          extension,
        };
      } finally {
        await parser.destroy();
      }
    }
    if (extension === "pptx") {
      return {
        text: validateText(await extractPptx(buffer), 1),
        mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        extension,
      };
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
      "Supported files: PDF, PPTX, DOCX, and TXT. For older .doc files, save as .docx first.",
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "We could not read this document. Remove password protection or export it as DOCX, UTF-8 TXT, or a text-based PDF.",
    );
  }
}

import {
  splitStudyText,
  INTERPRETER_CHUNK_CHARACTERS,
} from "./interpreter-limits";

export type ExtractedStudyFile = { chunks: string[]; warnings: string[] };

export async function readStudyFile(
  file: File,
  progress: (message: string) => void,
  signal: AbortSignal,
): Promise<ExtractedStudyFile> {
  if (!file.size) throw new Error("This file is empty.");
  const extension = file.name.toLowerCase().split(".").pop();
  const chunks: string[] = [];
  const warnings: string[] = [];
  let pending = "";
  const append = (text: string) => {
    pending += text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
    while (pending.length > INTERPRETER_CHUNK_CHARACTERS) {
      const part = splitStudyText(
        pending.slice(0, INTERPRETER_CHUNK_CHARACTERS + 1),
      )[0];
      if (!part) {
        pending = pending.slice(INTERPRETER_CHUNK_CHARACTERS);
        continue;
      }
      // Preserve every character when removing a trimmed chunk.
      const end = pending.indexOf(part) + part.length;
      chunks.push(part);
      pending = pending.slice(end);
    }
  };
  if (extension === "pdf") {
    if ((await file.slice(0, 5).text()) !== "%PDF-")
      throw new Error("This is not a valid PDF file.");
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker-${pdfjs.version}.min.mjs`;
    const initial = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    let failRead: () => void = () => {};
    class FileTransport extends pdfjs.PDFDataRangeTransport {
      requestDataRange(begin: number, end: number) {
        void file
          .slice(begin, end)
          .arrayBuffer()
          .then((buffer) => {
            if (!signal.aborted)
              this.onDataRange(begin, new Uint8Array(buffer));
          })
          .catch(() => failRead());
      }
    }
    const task = pdfjs.getDocument({
      range: new FileTransport(file.size, initial, true),
      length: file.size,
      rangeChunkSize: 1024 * 1024,
      disableAutoFetch: true,
      disableStream: true,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    const abort = () => {
      void task.destroy();
    };
    failRead = abort;
    signal.addEventListener("abort", abort, { once: true });
    let unreadable = 0;
    const missingPages: number[] = [];
    try {
      signal.throwIfAborted();
      const document = await task.promise;
      for (let n = 1; n <= document.numPages; n++) {
        signal.throwIfAborted();
        progress(`Reading page ${n} of ${document.numPages} on your device…`);
        const page = await document.getPage(n);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("")
          .trim();
        if (text) append(`\n\n[Page ${n}]\n${text}`);
        else {
          unreadable++;
          if (missingPages.length < 20) missingPages.push(n);
        }
        page.cleanup();
      }
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof Error && error.name === "PasswordException")
        throw new Error(
          "This PDF is password protected. Export an unlocked copy first.",
        );
      throw new Error(
        "Could not read this PDF. Try exporting a fresh copy or splitting it into chapters if your device runs out of memory.",
      );
    } finally {
      signal.removeEventListener("abort", abort);
      await task.destroy();
    }
    if (unreadable)
      warnings.push(
        `${unreadable} page(s) had no readable text (pages ${missingPages.join(", ")}${unreadable > missingPages.length ? ", …" : ""}). They may be blank or scanned. Their contents are not included; use OCR first to include them. Images and diagrams are not interpreted.`,
      );
  } else if (extension === "txt") {
    const reader = file
      .stream()
      .pipeThrough(new TextDecoderStream("utf-8", { fatal: true }))
      .getReader();
    try {
      while (true) {
        signal.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        progress(
          `Reading text on your device… ${chunks.length} sections found`,
        );
        append(value);
      }
    } finally {
      await reader.cancel();
    }
  } else if (extension === "docx") {
    progress("Reading Word document on your device…");
    const mammoth = await import("mammoth/mammoth.browser");
    signal.throwIfAborted();
    const result = await mammoth.extractRawText({
      arrayBuffer: await file.arrayBuffer(),
    });
    signal.throwIfAborted();
    append(result.value);
    if (result.messages.length)
      warnings.push(
        "Some Word formatting could not be read. Review the resulting study guide against the original.",
      );
  } else
    throw new Error(
      "Choose a PDF, DOCX, or UTF-8 TXT file. Convert older .doc files to .docx first.",
    );
  chunks.push(...splitStudyText(pending));
  if (!chunks.length)
    throw new Error(
      "No readable text was found. Scanned files need OCR before interpretation.",
    );
  return { chunks, warnings };
}

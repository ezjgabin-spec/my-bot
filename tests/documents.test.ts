import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  extractDocument,
  validateText,
  MAX_FILE_BYTES,
} from "../src/lib/documents";
const text =
  "Function composition means applying one function to the output of another function. Inverses undo a function.";
describe("document extraction", () => {
  it("extracts text from a real PDF fixture", async () => {
    const result = await extractDocument(
      "guide.pdf",
      readFileSync(new URL("./fixtures/study-guide.pdf", import.meta.url)),
    );
    expect(result.text).toContain("Function composition");
    expect(result.mime).toBe("application/pdf");
  });
  it("extracts text from a real DOCX fixture", async () => {
    const result = await extractDocument(
      "guide.docx",
      readFileSync(new URL("./fixtures/study-guide.docx", import.meta.url)),
    );
    expect(result.text).toContain("Inverse functions");
  });
  it("extracts valid UTF-8 study notes", async () => {
    expect((await extractDocument("notes.txt", Buffer.from(text))).text).toBe(
      text,
    );
  });
  it("rejects empty and oversized files", async () => {
    await expect(extractDocument("empty.txt", Buffer.from(""))).rejects.toThrow(
      /nonempty/,
    );
    await expect(
      extractDocument("big.txt", Buffer.alloc(MAX_FILE_BYTES + 1)),
    ).rejects.toThrow(/3 MB/);
  });
  it("rejects disguised PDFs", async () => {
    await expect(
      extractDocument("fake.pdf", Buffer.from(text)),
    ).rejects.toThrow(/valid PDF/);
  });
  it("rejects malformed DOCX", async () => {
    await expect(
      extractDocument("fake.docx", Buffer.from(text)),
    ).rejects.toThrow(/damaged/);
  });
  it("explains how to handle legacy Word files", async () => {
    await expect(extractDocument("old.doc", Buffer.from(text))).rejects.toThrow(
      /save as .docx/,
    );
  });
  it("rejects binary data disguised as text", async () => {
    await expect(
      extractDocument("binary.txt", Buffer.alloc(100)),
    ).rejects.toThrow(/plain-text/);
  });
  it("gives an actionable message for scanned or unreadable material", () => {
    expect(() => validateText("  ")).toThrow(/OCR/);
  });
  it("enforces the extracted text limit", () => {
    expect(() => validateText("a".repeat(100001))).toThrow(/100,000/);
  });
});

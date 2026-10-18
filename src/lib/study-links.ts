import "server-only";
import { AppError } from "./server";
import { validateText } from "./documents";
import { MAX_MATERIAL_CHARACTERS } from "./material-limits";

// Allowlisted hosts avoid SSRF against private services and metadata endpoints.
// Access-controlled school pages (Canvas, Google Classroom, private Docs)
// require a separate authorized integration, not a user's session cookie.
export async function importPublicStudyLink(input: string) {
  let url: URL;
  try { url = new URL(input); }
  catch { throw new AppError("Enter a complete HTTPS link to public study notes."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new AppError("Only public HTTPS notes links are supported.");
  let destination: string;
  let filename: string;
  if (url.hostname === "docs.google.com") {
    const match = url.pathname.match(/^\/document\/d\/([a-zA-Z0-9_-]{20,})\/(?:edit|view|preview)?\/?$/);
    if (!match) throw new AppError("Paste a Google Docs document link, not a folder or account link.");
    destination = `https://docs.google.com/document/d/${match[1]}/export?format=txt`;
    filename = "Google Docs notes.txt";
  } else if (url.hostname === "raw.githubusercontent.com") {
    if (!/^\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\//.test(url.pathname) ||
        !/\.(txt|md|markdown)$/i.test(url.pathname))
      throw new AppError("GitHub links must point to a public raw TXT or Markdown file.");
    destination = url.origin + url.pathname;
    filename = url.pathname.split("/").at(-1) || "GitHub notes.txt";
  } else {
    throw new AppError(
      "Link import currently supports public Google Docs and GitHub raw text/Markdown. For private assignments, paste the text or upload the file.",
    );
  }
  let response: Response;
  try {
    response = await fetch(destination, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: "text/plain" },
    });
  } catch {
    throw new AppError("Could not access this notes link. Check that it is public and try again.", 502);
  }
  if (!response.ok || response.status >= 300)
    throw new AppError("These notes could not be downloaded. Make the document publicly viewable or paste its text.", 422);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_MATERIAL_CHARACTERS * 4)
    throw new AppError("Linked notes are too long; select a shorter chapter.", 413);
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("This link contains no readable notes.");
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_MATERIAL_CHARACTERS * 4)
        throw new AppError("Linked notes are too large; select a shorter chapter.", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new AppError("The linked notes are not UTF-8 text. Upload a PDF or DOCX instead."); }
  return { filename, text: validateText(text), mime: "text/plain" };
}

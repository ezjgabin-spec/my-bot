import { afterEach, describe, expect, it, vi } from "vitest";
import { importPublicStudyLink } from "../src/lib/study-links";

afterEach(() => vi.unstubAllGlobals());
describe("public notes link import", () => {
  it("downloads public Google Docs as plain text", async () => {
    const fetchMock = vi.fn(async () => new Response("Functions and inverses are used in algebra class.\n"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await importPublicStudyLink(
      "https://docs.google.com/document/d/abcdefghijklmnopqrstuvwxyz123456/edit",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://docs.google.com/document/d/abcdefghijklmnopqrstuvwxyz123456/export?format=txt",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(result.text).toContain("inverses");
  });
  it("rejects local endpoints and arbitrary websites without making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const url of [
      "http://docs.google.com/document/d/abcdefghijklmnopqrstuvwxyz123456/edit",
      "https://127.0.0.1/private",
      "https://localhost/secrets",
      "https://docs.google.com.evil.example/document/d/abcdefghijklmnopqrstuvwxyz123456/edit",
      "https://example.com/assignment",
      "https://user:password@docs.google.com/document/d/abcdefghijklmnopqrstuvwxyz123456/edit",
    ])
      await expect(importPublicStudyLink(url)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects private Google Docs redirecting to login", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("", { status: 302, headers: { location: "https://accounts.google.com/" } }),
    ));
    await expect(
      importPublicStudyLink("https://docs.google.com/document/d/abcdefghijklmnopqrstuvwxyz123456/edit"),
    ).rejects.toThrow("publicly viewable");
  });
});

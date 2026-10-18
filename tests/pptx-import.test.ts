import { describe, expect, it } from "vitest";
import { extractDocument } from "../src/lib/documents";

describe("PowerPoint import", () => {
  it("rejects an invalid or damaged slideshow", async () => {
    await expect(
      extractDocument("slides.pptx", Buffer.from("not a presentation")),
    ).rejects.toThrow();
  });
  it("does not interpret an old PowerPoint .ppt file as a safe archive", async () => {
    await expect(
      extractDocument("old.ppt", Buffer.from("fake ppt file")),
    ).rejects.toThrow(/Supported files/);
  });
});

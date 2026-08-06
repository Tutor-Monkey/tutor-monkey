import { describe, expect, it } from "vitest";
import {
  UnsupportedFormatError,
  describeUnsupportedFormat,
  extractTextFromBuffer,
} from "./extract";
import { EXTRACTABLE_EXTENSIONS } from "./materials";

const utf8 = (text: string) => new TextEncoder().encode(text);

describe("extractTextFromBuffer (pure dispatch)", () => {
  it("extracts .txt as UTF-8 text", async () => {
    const result = await extractTextFromBuffer("notes.txt", utf8("Hello world"));
    expect(result.text).toBe("Hello world");
    expect(result.charCount).toBe(11);
    expect(result.wordCount).toBe(2);
  });

  it("strips a UTF-8 BOM from .txt", async () => {
    const result = await extractTextFromBuffer(
      "bom.txt",
      utf8("\uFEFFBOM content"),
    );
    expect(result.text).toBe("BOM content");
  });

  it("extracts .md verbatim", async () => {
    const result = await extractTextFromBuffer(
      "lesson.md",
      utf8("# Unit 1\n\nSome *notes*."),
    );
    expect(result.text).toBe("# Unit 1\n\nSome *notes*.");
  });

  it("counts characters by code point (emoji-safe)", async () => {
    const result = await extractTextFromBuffer("emoji.txt", utf8("a😀b"));
    expect(result.charCount).toBe(3);
    expect(result.wordCount).toBe(1);
  });

  it("returns zero counts for empty text", async () => {
    const result = await extractTextFromBuffer("empty.txt", utf8(""));
    expect(result.text).toBe("");
    expect(result.charCount).toBe(0);
    expect(result.wordCount).toBe(0);
  });

  it("rejects legacy .doc files with an honest error", async () => {
    await expect(
      extractTextFromBuffer("handout.doc", utf8("not really a doc")),
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it("rejects legacy .ppt files with an honest error", async () => {
    await expect(
      extractTextFromBuffer("deck.ppt", utf8("not really a ppt")),
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it("rejects unknown extensions", async () => {
    await expect(
      extractTextFromBuffer("archive.zip", utf8("x")),
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it("rejects files with no extension", async () => {
    await expect(
      extractTextFromBuffer("README", utf8("x")),
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });
});

describe("describeUnsupportedFormat", () => {
  it("names the format and the fix for .doc", () => {
    const message = describeUnsupportedFormat(".doc", "handout.doc");
    expect(message).toMatch(/\.doc/);
    expect(message).toMatch(/convert/i);
    expect(message).toContain("handout.doc");
  });

  it("names the format and the fix for .ppt", () => {
    const message = describeUnsupportedFormat(".ppt", "slides.ppt");
    expect(message).toMatch(/\.ppt/);
    expect(message).toMatch(/convert/i);
  });

  it("covers exactly the formats the UI advertises", () => {
    expect(EXTRACTABLE_EXTENSIONS).toEqual([
      ".txt",
      ".md",
      ".docx",
      ".pdf",
      ".pptx",
    ]);
  });
});

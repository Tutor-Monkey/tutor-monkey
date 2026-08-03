/**
 * TutorMonkey Teachers — local text extraction for uploaded materials.
 *
 * Server-only helpers (used by the extract route handler; never imported from
 * client components). Every extractor runs in-process inside the Next.js Node
 * runtime on a buffer already downloaded through the authenticated Supabase
 * client — no third-party processing service, no service-role key, and the
 * file contents never leave the app.
 *
 * Formats (kept in sync with ACCEPTED_EXTENSIONS in lib/teachers/materials.ts):
 *   .txt / .md  – UTF-8 text (BOM stripped)
 *   .docx       – WordprocessingML text via mammoth
 *   .pdf        – PDF.js (pdfjs-dist legacy build, the build Mozilla
 *                 recommends for Node.js)
 *   .pptx       – slide text from ppt/slides/slideN.xml via JSZip
 *
 * Legacy binary formats (.doc, .ppt) and anything else throw
 * UnsupportedFormatError so callers can answer honestly instead of pretending
 * to extract text they never produced.
 */

import mammoth from "mammoth";
import JSZip from "jszip";
import { EXTRACTABLE_EXTENSIONS, extensionOf } from "./materials";

/** @deprecated use EXTRACTABLE_EXTENSIONS from lib/teachers/materials.ts */
export const SUPPORTED_EXTRACTION_EXTENSIONS = EXTRACTABLE_EXTENSIONS;

/** Thrown when a file's format can't be extracted (or isn't supported yet). */
export class UnsupportedFormatError extends Error {
  readonly code = "UNSUPPORTED_FORMAT" as const;

  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFormatError";
  }
}

export type ExtractionResult = {
  text: string;
  charCount: number;
  wordCount: number;
};

/** Human-readable explanation for a file we can't extract text from. */
export function describeUnsupportedFormat(
  extension: string,
  filename: string,
): string {
  const base = filename ? `“${filename}”` : "This file";
  const ext = extension.toLowerCase();

  if (ext === ".doc") {
    return `${base} is an old Word document (.doc). Convert it to .docx (or save it as a PDF) and re-upload to extract text.`;
  }
  if (ext === ".ppt") {
    return `${base} is an old PowerPoint file (.ppt). Convert it to .pptx (or save it as a PDF) and re-upload to extract text.`;
  }
  if (ext === "") {
    return `${base} has no file extension, so its format can't be determined. Supported formats: ${SUPPORTED_EXTRACTION_EXTENSIONS.join(", ")}.`;
  }
  return `${base} is a ${ext} file, which text extraction doesn't support yet. Supported formats: ${SUPPORTED_EXTRACTION_EXTENSIONS.join(", ")}.`;
}

/**
 * Extract readable text from an uploaded material's bytes.
 *
 * Dispatch is purely by filename extension; the extension list mirrors the
 * upload picker, so anything that got past intake is either handled here or
 * rejected with an UnsupportedFormatError that names the format and the fix.
 */
export async function extractTextFromBuffer(
  filename: string,
  data: Uint8Array,
): Promise<ExtractionResult> {
  const extension = extensionOf(filename);

  let text: string;
  switch (extension) {
    case ".txt":
    case ".md":
      text = decodeTextFile(data);
      break;
    case ".docx":
      text = await extractDocxText(data);
      break;
    case ".pdf":
      text = await extractPdfText(data);
      break;
    case ".pptx":
      text = await extractPptxText(data);
      break;
    default:
      throw new UnsupportedFormatError(
        describeUnsupportedFormat(extension, filename),
      );
  }

  const trimmed = text.trim();
  return {
    text,
    // Count by code point (emoji-safe) without relying on a modern target:
    // Array.from(string) is a plain lib call and compiles under any target.
    charCount: Array.from(text).length,
    wordCount: trimmed ? trimmed.split(/\s+/).length : 0,
  };
}

/** UTF-8 decode with a leading BOM stripped. */
function decodeTextFile(data: Uint8Array): string {
  let text = new TextDecoder("utf-8").decode(data);
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return text;
}

/** .docx → raw text via mammoth (pure JS, no native deps). */
async function extractDocxText(data: Uint8Array): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
  return value;
}

/**
 * .pdf → text via PDF.js. The legacy build is the one Mozilla supports in
 * Node.js; a fake worker is used, so no workerSrc is required. Password-
 * protected files get an honest error instead of a generic crash.
 */
async function extractPdfText(data: Uint8Array): Promise<string> {
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await getDocument({
      data,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;

    try {
      const parts: string[] = [];
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        let line = "";
        for (const item of content.items) {
          if ("str" in item) {
            line += item.str + " ";
          }
        }
        parts.push(line.trimEnd());
      }
      return parts.filter(Boolean).join("\n");
    } finally {
      await doc.destroy().catch(() => {
        // Best-effort cleanup; the extraction result is already in hand.
      });
    }
  } catch (error) {
    if (error instanceof Error && /password|encrypted/i.test(error.message)) {
      throw new UnsupportedFormatError(
        "This PDF is password-protected. Open it, remove the password, and re-upload to extract text.",
      );
    }
    throw error;
  }
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (full, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        return String.fromCodePoint(parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith("#")) {
        return String.fromCodePoint(parseInt(entity.slice(1), 10));
      }
      return XML_ENTITIES[entity] ?? full;
    },
  );
}

/**
 * .pptx → slide text via JSZip. A .pptx is a zip of XML; the readable text
 * lives in the <a:t> runs of ppt/slides/slideN.xml. Slides are visited in
 * document order and their paragraphs are joined — no styling, no notes, no
 * embedded images, just the plain text that would appear on each slide.
 */
async function extractPptxText(data: Uint8Array): Promise<string> {
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new UnsupportedFormatError(
      "This .pptx couldn't be opened for text extraction — it may be corrupt or not actually a PowerPoint file.",
    );
  }

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(
      (a, b) =>
        Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0) -
        Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0),
    );

  if (slideFiles.length === 0) {
    throw new UnsupportedFormatError(
      "This .pptx has no readable slides — it may be corrupt or empty.",
    );
  }

  const slides: string[] = [];
  for (const name of slideFiles) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("string");
    const runs: string[] = [];
    const matches = Array.from(
      xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g),
    );
    for (const match of matches) {
      const decoded = decodeXmlEntities(match[1]).replace(/\s+/g, " ").trim();
      if (decoded) runs.push(decoded);
    }
    if (runs.length > 0) slides.push(runs.join(" "));
  }

  return slides.join("\n");
}

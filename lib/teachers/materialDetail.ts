/**
 * TutorMonkey Teachers — pure, client-safe helpers for the material review
 * view (MaterialDetailModal) and the material library list.
 *
 * This module must stay dependency-free (no DOM, no Supabase, no server
 * modules): it is imported by client components and covered by Vitest as a
 * pure helper module, mirroring the conventions in lib/teachers/extract.test.ts.
 *
 * The wording for unsupported formats deliberately mirrors
 * lib/teachers/extract.ts::describeUnsupportedFormat (the server-side
 * extractor) so the review view and the route agree about what failed and
 * how to fix it. Keep the two in sync.
 */

import { EXTRACTABLE_EXTENSIONS, extensionOf } from "./materials";

export type MaterialStatus = "uploaded" | "processing" | "ready" | "failed";

export type ExtractionProvenance = {
  extraction?: {
    text?: string;
    // Counts are stored as JSON numbers, but the list query reads them
    // through a PostgREST `->>` projection which returns strings — accept
    // both and normalize with parseExtractionCount.
    char_count?: number | string;
    word_count?: number | string;
    extractor?: string;
    extracted_at?: string;
    job_id?: string;
  } | null;
  last_error?: { stage?: string; message?: string; at?: string } | null;
  // provenance is a free-form JSONB object (e.g. uploaded_by / upload_batch
  // from intake); typed keys above are just the ones this slice reads.
  [key: string]: unknown;
};

/**
 * What the extraction section of the material review view should show,
 * decided purely from row data. One state per situation, with the message
 * the UI should render verbatim — the review view never invents success or
 * hides failures behind a generic "try again".
 */
export type ExtractionState =
  | {
      kind: "ready";
      text: string;
      charCount: number | null;
      wordCount: number | null;
      extractedAt: string | null;
      extractor: string | null;
    }
  | { kind: "not-extracted"; message: string }
  | { kind: "unsupported"; message: string }
  | { kind: "processing"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "no-text"; message: string };

/**
 * Normalize an extraction count that may arrive as a JSON number (full
 * provenance object) or as a string (PostgREST `->>` path projection in the
 * list query). Non-integer or unparseable values become null so the UI can
 * omit them instead of rendering garbage.
 */
export function parseExtractionCount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && Number.isInteger(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

/** Compact "Sep 2, 2026"-style date, or "" when the timestamp is unparseable. */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Human-readable label for the per-material extract action. */
export function extractActionLabel(status: MaterialStatus): string {
  if (status === "ready") return "Re-extract";
  if (status === "failed") return "Retry extract";
  if (status === "processing") return "Retry extract";
  return "Extract text";
}

/**
 * Is this filename one the local extractor can read? Anything outside
 * EXTRACTABLE_EXTENSIONS (legacy .doc/.ppt, unknown extensions, no
 * extension) can never produce text, so the review view says so up front
 * instead of waiting for a guaranteed failure.
 */
export function isExtractableFile(filename: string): boolean {
  return (EXTRACTABLE_EXTENSIONS as readonly string[]).includes(
    extensionOf(filename),
  );
}

/**
 * Honest explanation for a file text extraction can't read. Mirrors the
 * server-side wording in lib/teachers/extract.ts so the route and the review
 * view tell the same story.
 */
export function describeUnsupportedMaterialFormat(filename: string): string {
  const base = filename ? `“${filename}”` : "This file";
  const ext = extensionOf(filename).toLowerCase();

  if (ext === ".doc") {
    return `${base} is an old Word document (.doc). Convert it to .docx (or save it as a PDF) and re-upload to extract text.`;
  }
  if (ext === ".ppt") {
    return `${base} is an old PowerPoint file (.ppt). Convert it to .pptx (or save it as a PDF) and re-upload to extract text.`;
  }
  if (ext === "") {
    return `${base} has no file extension, so its format can't be determined. Supported formats: ${EXTRACTABLE_EXTENSIONS.join(", ")}.`;
  }
  return `${base} is a ${ext} file, which text extraction doesn't support yet. Supported formats: ${EXTRACTABLE_EXTENSIONS.join(", ")}.`;
}

type DescribeExtractionInput = {
  status: MaterialStatus;
  filename: string;
  sourceType?: string | null;
  provenance?: ExtractionProvenance | null;
};

/**
 * Decide what the extraction section of the material review view shows.
 *
 * Precedence:
 *   1. failed        – show the recorded error verbatim (the route's message,
 *                      which for legacy formats already names the fix).
 *   2. ready         – show the extracted text + counts; if the row claims
 *                      ready without any saved text, say so honestly.
 *   3. processing    – extraction is in flight.
 *   4. not a local upload – Google Drive imports can't be extracted yet.
 *   5. uploaded      – never attempted: unsupported formats are called out
 *                      up front, everything else gets the "extract me" state.
 */
export function describeExtractionState(
  input: DescribeExtractionInput,
): ExtractionState {
  const { status, filename, sourceType, provenance } = input;
  const extraction = provenance?.extraction ?? null;
  const lastError = provenance?.last_error ?? null;

  if (status === "failed") {
    const recordedError = lastError?.message?.trim();
    return {
      kind: "failed",
      message: recordedError
        ? recordedError
        : "Extraction failed — run Extract again to retry.",
    };
  }

  if (status === "ready") {
    const text = extraction?.text ?? "";
    if (text.trim().length > 0) {
      return {
        kind: "ready",
        text,
        charCount: parseExtractionCount(extraction?.char_count),
        wordCount: parseExtractionCount(extraction?.word_count),
        extractedAt:
          typeof extraction?.extracted_at === "string" &&
          extraction.extracted_at.trim() !== ""
            ? extraction.extracted_at
            : null,
        extractor:
          typeof extraction?.extractor === "string" &&
          extraction.extractor.trim() !== ""
            ? extraction.extractor
            : null,
      };
    }
    return {
      kind: "no-text",
      message:
        "This material is marked ready, but no extracted text was saved — run Extract again to re-read the file.",
    };
  }

  if (status === "processing") {
    return {
      kind: "processing",
      message:
        "Extraction is running — give it a moment, then reopen this material.",
    };
  }

  if (sourceType && sourceType !== "local_upload") {
    return {
      kind: "unsupported",
      message:
        "This material isn't a local upload, so text extraction isn't available for it yet.",
    };
  }

  if (!isExtractableFile(filename)) {
    return { kind: "unsupported", message: describeUnsupportedMaterialFormat(filename) };
  }

  return {
    kind: "not-extracted",
    message:
      "This file is uploaded but hasn't been read yet. Click “Extract text” to read it on the server — no third-party service is used.",
  };
}

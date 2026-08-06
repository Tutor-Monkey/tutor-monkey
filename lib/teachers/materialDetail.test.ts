import { describe, expect, it } from "vitest";
import {
  describeExtractionState,
  describeGenerationState,
  describeUnsupportedMaterialFormat,
  generateActionLabel,
  isExtractableFile,
  parseExtractionCount,
  shortDate,
} from "./materialDetail";

describe("parseExtractionCount", () => {
  it("accepts JSON numbers", () => {
    expect(parseExtractionCount(1234)).toBe(1234);
    expect(parseExtractionCount(0)).toBe(0);
  });

  it("accepts numeric strings (PostgREST ->> projection)", () => {
    expect(parseExtractionCount("1234")).toBe(1234);
    expect(parseExtractionCount("0")).toBe(0);
  });

  it("rejects null, undefined and empty strings", () => {
    expect(parseExtractionCount(null)).toBeNull();
    expect(parseExtractionCount(undefined)).toBeNull();
    expect(parseExtractionCount("")).toBeNull();
    expect(parseExtractionCount("   ")).toBeNull();
  });

  it("rejects non-integer and unparseable values", () => {
    expect(parseExtractionCount("abc")).toBeNull();
    expect(parseExtractionCount("12.5")).toBeNull();
    expect(parseExtractionCount(12.5)).toBeNull();
    expect(parseExtractionCount(Number.NaN)).toBeNull();
    expect(parseExtractionCount(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("shortDate", () => {
  it("formats a valid ISO timestamp", () => {
    expect(shortDate("2026-08-02T12:00:00.000Z")).toMatch(/2026/);
    expect(shortDate("2026-08-02T12:00:00.000Z")).toMatch(/Aug/);
  });

  it("returns an empty string for unparseable input", () => {
    expect(shortDate("")).toBe("");
    expect(shortDate("not-a-date")).toBe("");
  });
});

describe("isExtractableFile", () => {
  it("accepts the advertised formats", () => {
    expect(isExtractableFile("notes.txt")).toBe(true);
    expect(isExtractableFile("lesson.md")).toBe(true);
    expect(isExtractableFile("handout.docx")).toBe(true);
    expect(isExtractableFile("chapter.pdf")).toBe(true);
    expect(isExtractableFile("deck.pptx")).toBe(true);
  });

  it("rejects legacy and unknown formats", () => {
    expect(isExtractableFile("old.doc")).toBe(false);
    expect(isExtractableFile("slides.ppt")).toBe(false);
    expect(isExtractableFile("archive.zip")).toBe(false);
    expect(isExtractableFile("README")).toBe(false);
  });
});

describe("describeUnsupportedMaterialFormat", () => {
  it("names the format and the fix for .doc", () => {
    const message = describeUnsupportedMaterialFormat("handout.doc");
    expect(message).toMatch(/\.doc/);
    expect(message).toMatch(/convert/i);
    expect(message).toContain("handout.doc");
  });

  it("names the format and the fix for .ppt", () => {
    const message = describeUnsupportedMaterialFormat("slides.ppt");
    expect(message).toMatch(/\.ppt/);
    expect(message).toMatch(/convert/i);
  });

  it("calls out unknown extensions", () => {
    const message = describeUnsupportedMaterialFormat("archive.zip");
    expect(message).toMatch(/\.zip/);
    expect(message).toContain(".txt");
  });
});

describe("describeExtractionState", () => {
  it("shows extracted text and counts when ready", () => {
    const state = describeExtractionState({
      status: "ready",
      filename: "notes.txt",
      sourceType: "local_upload",
      provenance: {
        extraction: {
          text: "Hello world",
          char_count: 11,
          word_count: 2,
          extractor: "tutormonkey-local-v1",
          extracted_at: "2026-08-02T12:00:00.000Z",
        },
      },
    });
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.text).toBe("Hello world");
    expect(state.charCount).toBe(11);
    expect(state.wordCount).toBe(2);
    expect(state.extractor).toBe("tutormonkey-local-v1");
    expect(state.extractedAt).toBe("2026-08-02T12:00:00.000Z");
  });

  it("survives string counts from the list projection", () => {
    const state = describeExtractionState({
      status: "ready",
      filename: "notes.txt",
      provenance: {
        extraction: { text: "abc", char_count: "3", word_count: "1" },
      },
    });
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.charCount).toBe(3);
    expect(state.wordCount).toBe(1);
  });

  it("gives an honest empty state for uploaded-but-not-extracted files", () => {
    const state = describeExtractionState({
      status: "uploaded",
      filename: "notes.txt",
      sourceType: "local_upload",
      provenance: { uploaded_by: "user-1" },
    });
    expect(state.kind).toBe("not-extracted");
    if (state.kind !== "not-extracted") return;
    expect(state.message).toMatch(/automatically/i);
    expect(state.message).toMatch(/upload/i);
  });

  it("calls out legacy .doc files before they are ever tried", () => {
    const state = describeExtractionState({
      status: "uploaded",
      filename: "handout.doc",
      sourceType: "local_upload",
    });
    expect(state.kind).toBe("unsupported");
    if (state.kind !== "unsupported") return;
    expect(state.message).toMatch(/\.doc/);
  });

  it("calls out legacy .ppt files before they are ever tried", () => {
    const state = describeExtractionState({
      status: "uploaded",
      filename: "deck.ppt",
      sourceType: "local_upload",
    });
    expect(state.kind).toBe("unsupported");
  });

  it("rejects non-local uploads honestly", () => {
    const state = describeExtractionState({
      status: "uploaded",
      filename: "drive-notes.pdf",
      sourceType: "google_drive",
    });
    expect(state.kind).toBe("unsupported");
    if (state.kind !== "unsupported") return;
    expect(state.message).toMatch(/local upload/i);
  });

  it("shows the recorded error verbatim when failed", () => {
    const state = describeExtractionState({
      status: "failed",
      filename: "notes.txt",
      provenance: {
        last_error: {
          stage: "extract",
          message: "This PDF is password-protected. Open it and re-upload.",
          at: "2026-08-02T12:00:00.000Z",
        },
      },
    });
    expect(state.kind).toBe("failed");
    if (state.kind !== "failed") return;
    expect(state.message).toContain("password-protected");
  });

  it("falls back to a generic retry message when failed with no recorded error", () => {
    const state = describeExtractionState({
      status: "failed",
      filename: "notes.txt",
    });
    expect(state.kind).toBe("failed");
    if (state.kind !== "failed") return;
    expect(state.message).toMatch(/uploading it again/i);
  });

  it("reports processing without claiming success", () => {
    const state = describeExtractionState({
      status: "processing",
      filename: "notes.txt",
    });
    expect(state.kind).toBe("processing");
  });

  it("is honest when a material is ready but has no saved text", () => {
    const state = describeExtractionState({
      status: "ready",
      filename: "notes.txt",
      provenance: { extraction: { char_count: 0, word_count: 0 } },
    });
    expect(state.kind).toBe("no-text");
    if (state.kind !== "no-text") return;
    expect(state.message).toMatch(/no extracted text was saved/i);
  });

  it("never invents text when provenance is null", () => {
    const state = describeExtractionState({
      status: "uploaded",
      filename: "notes.txt",
      provenance: null,
    });
    expect(state.kind).toBe("not-extracted");
  });
});

describe("describeGenerationState", () => {
  const readyWithText = {
    status: "ready" as const,
    sourceType: "local_upload",
    provenance: {
      extraction: { text: "Photosynthesis happens in chloroplasts." },
    },
  };

  it("reports processing while a generate job is running", () => {
    const state = describeGenerationState({
      ...readyWithText,
      hasRunningGenerateJob: true,
    });
    expect(state.kind).toBe("processing");
    if (state.kind !== "processing") return;
    expect(state.message).toMatch(/running/i);
  });

  it("is unavailable before extraction succeeds", () => {
    const uploaded = describeGenerationState({
      status: "uploaded",
      sourceType: "local_upload",
    });
    expect(uploaded.kind).toBe("unavailable");
    if (uploaded.kind !== "unavailable") return;
    expect(uploaded.message).toMatch(/hasn't been parsed yet/i);

    const failed = describeGenerationState({ status: "failed" });
    expect(failed.kind).toBe("unavailable");
    if (failed.kind !== "unavailable") return;
    expect(failed.message).toMatch(/failed to parse/i);

    const processing = describeGenerationState({ status: "processing" });
    expect(processing.kind).toBe("unavailable");
  });

  it("is unavailable for non-local uploads", () => {
    const state = describeGenerationState({
      status: "ready",
      sourceType: "google_drive",
      provenance: { extraction: { text: "text" } },
    });
    expect(state.kind).toBe("unavailable");
    if (state.kind !== "unavailable") return;
    expect(state.message).toMatch(/locally uploaded/i);
  });

  it("only claims generated when a worksheet is actually persisted", () => {
    const state = describeGenerationState({
      status: "ready",
      sourceType: "local_upload",
      provenance: {
        extraction: { text: "text" },
        worksheet: {
          worksheet: {
            title: "Review",
            questions: [
              {
                id: "q1",
                type: "short_answer",
                prompt: "P?",
                answer: "A",
              },
            ],
          },
          provider: "deepseek",
          model: "deepseek-v4-flash",
          generated_at: "2026-08-02T12:00:00.000Z",
          truncated_source: true,
        },
      },
    });
    expect(state.kind).toBe("generated");
    if (state.kind !== "generated") return;
    expect(state.worksheet.title).toBe("Review");
    expect(state.generatedAt).toBe("2026-08-02T12:00:00.000Z");
    expect(state.model).toBe("deepseek-v4-flash");
    expect(state.truncatedSource).toBe(true);
  });

  it("shows the recorded generate error verbatim", () => {
    const state = describeGenerationState({
      status: "ready",
      sourceType: "local_upload",
      provenance: {
        extraction: { text: "text" },
        worksheet: {
          last_error: {
            stage: "generate",
            message:
              "Worksheet generation isn't configured yet — the developer needs to add DEEPSEEK_API_KEY to the server environment.",
            at: "2026-08-02T12:00:00.000Z",
          },
        },
      },
    });
    expect(state.kind).toBe("failed");
    if (state.kind !== "failed") return;
    expect(state.message).toContain("DEEPSEEK_API_KEY");
  });

  it("is unavailable when no extracted text is saved", () => {
    const state = describeGenerationState({
      status: "ready",
      sourceType: "local_upload",
      provenance: { extraction: { char_count: 0 } },
    });
    expect(state.kind).toBe("unavailable");
    if (state.kind !== "unavailable") return;
    expect(state.message).toMatch(/no extracted text/i);
  });

  it("is ready once the text exists", () => {
    const state = describeGenerationState(readyWithText);
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.message).toMatch(/ready/i);
  });
});

describe("generateActionLabel", () => {
  it("labels first generation and regeneration honestly", () => {
    expect(generateActionLabel(false)).toBe("Generate worksheet");
    expect(generateActionLabel(true)).toBe("Regenerate worksheet");
  });
});

import { describe, expect, it } from "vitest";
import {
  SUGGESTION_LIMIT_DEFAULT,
  SUGGESTION_LIMIT_MAX,
  boundSuggestionLimit,
  buildConfirmationSources,
  buildWorksheetDriveFileName,
  buildWorksheetMarkdown,
  canConfirmGeneration,
  describeDriveSaveFailure,
  findMentionAtCaret,
  includedReadySourceIds,
  isDriveSyncStatus,
  isMissingTableError,
  isReadySourceDoc,
  rankDocumentCandidates,
  replaceMentionRange,
  setSuggestedSourcesIncluded,
  toggleConfirmationSource,
  type ComposerSourceDoc,
} from "./materialsComposer";
import type { Worksheet } from "./worksheet";

function doc(
  id: string,
  filename: string,
  status: ComposerSourceDoc["status"] = "ready",
  createdAt = "2026-08-01T00:00:00.000Z",
): ComposerSourceDoc {
  return {
    id,
    filename,
    sourceType: "local_upload",
    mimeType: "application/pdf",
    status,
    createdAt,
    folderSegments: [],
  };
}

describe("findMentionAtCaret", () => {
  it("is inactive when there is no @", () => {
    expect(findMentionAtCaret("make a quiz", 13)).toMatchObject({
      active: false,
    });
  });

  it("is inactive in an empty string", () => {
    expect(findMentionAtCaret("", 0).active).toBe(false);
  });

  it("activates right after a lone @", () => {
    const mention = findMentionAtCaret("Use @", 5);
    expect(mention).toEqual({ active: true, query: "", start: 4, end: 5 });
  });

  it("captures the query between @ and caret", () => {
    const mention = findMentionAtCaret("Use @enzym", 10);
    expect(mention).toEqual({ active: true, query: "enzym", start: 4, end: 10 });
  });

  it("ignores whitespace before the caret (mention already closed)", () => {
    expect(findMentionAtCaret("Use @enzym ", 11).active).toBe(false);
  });

  it("does not treat email addresses as mentions", () => {
    expect(findMentionAtCaret("mail me at a@b.com", 18).active).toBe(false);
  });

  it("handles a caret at the very start", () => {
    expect(findMentionAtCaret("hello", 0).active).toBe(false);
  });

  it("finds the most recent mention when several @ exist", () => {
    const mention = findMentionAtCaret("@one @tw", 8);
    expect(mention).toEqual({ active: true, query: "tw", start: 5, end: 8 });
  });
});

describe("replaceMentionRange", () => {
  it("replaces the range and returns the new caret", () => {
    const result = replaceMentionRange("Use @enzym now", 4, 10, "@Enzymes.pdf ");
    expect(result.text).toBe("Use @Enzymes.pdf  now");
    expect(result.caret).toBe(17);
  });
});

describe("rankDocumentCandidates", () => {
  const docs = [
    doc("1", "Enzymes Review.pdf"),
    doc("2", "Cell Division Notes.docx"),
    doc("3", "enzymes-lab-report.pdf"),
    doc("4", "Enzyme Kinetics.pdf"),
    doc("5", "Photosynthesis.txt"),
  ];

  it("ranks prefix matches over token matches and drops the rest", () => {
    const ranked = rankDocumentCandidates(docs, "enzym").map((d) => d.id);
    // No filename equals "enzym", so the three prefix matches sort by
    // filename (locale) — Enzyme Kinetics, Enzymes Review, enzymes-lab-report.
    expect(ranked).toEqual(["4", "1", "3"]);
    expect(ranked).not.toContain("2");
    expect(ranked).not.toContain("5");
  });

  it("drops documents that do not match at all", () => {
    const ranked = rankDocumentCandidates(docs, "zzz");
    expect(ranked).toEqual([]);
  });

  it("returns everything newest-first for an empty query", () => {
    const older = docs.map((d) =>
      d.id === "5" ? { ...d, createdAt: "2026-07-01T00:00:00.000Z" } : d,
    );
    const ranked = rankDocumentCandidates(older, "");
    expect(ranked.map((d) => d.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  it("prefers ready documents on equal scores", () => {
    const mixed = [
      doc("a", "Unit 3.pdf", "ready"),
      doc("b", "Unit 3 notes.pdf", "processing"),
    ];
    const ranked = rankDocumentCandidates(mixed, "unit");
    expect(ranked[0].id).toBe("a");
  });

  it("matches tokens case-insensitively", () => {
    const ranked = rankDocumentCandidates(docs, "ENZYM");
    expect(ranked.length).toBeGreaterThan(0);
  });
});

describe("boundSuggestionLimit", () => {
  it("defaults when the value is missing or unparseable", () => {
    expect(boundSuggestionLimit(null)).toBe(SUGGESTION_LIMIT_DEFAULT);
    expect(boundSuggestionLimit(undefined)).toBe(SUGGESTION_LIMIT_DEFAULT);
    expect(boundSuggestionLimit("abc")).toBe(SUGGESTION_LIMIT_DEFAULT);
    expect(boundSuggestionLimit("0")).toBe(SUGGESTION_LIMIT_DEFAULT);
    expect(boundSuggestionLimit("-3")).toBe(SUGGESTION_LIMIT_DEFAULT);
  });

  it("parses valid values and clamps to the max", () => {
    expect(boundSuggestionLimit("5")).toBe(5);
    expect(boundSuggestionLimit("999")).toBe(SUGGESTION_LIMIT_MAX);
  });
});

describe("buildConfirmationSources / generation gate", () => {
  const explicit = [doc("e1", "Explicit.pdf")];
  const suggested = [
    doc("s1", "Suggested One.pdf"),
    doc("s2", "Still Processing.pdf", "processing"),
    doc("s3", "Failed.pdf", "failed"),
  ];

  it("lists explicit first, then suggested, deduped", () => {
    const sources = buildConfirmationSources(explicit, [
      ...suggested,
      doc("e1", "Explicit.pdf"), // duplicate of explicit
    ]);
    expect(sources.map((s) => s.doc.id)).toEqual(["e1", "s1", "s2", "s3"]);
    expect(sources.filter((s) => s.origin === "explicit")).toHaveLength(1);
  });

  it("defaults ready docs to included and non-ready to excluded", () => {
    const sources = buildConfirmationSources(explicit, suggested);
    expect(sources.find((s) => s.doc.id === "e1")?.included).toBe(true);
    expect(sources.find((s) => s.doc.id === "s1")?.included).toBe(true);
    expect(sources.find((s) => s.doc.id === "s2")?.included).toBe(false);
    expect(sources.find((s) => s.doc.id === "s3")?.included).toBe(false);
  });

  it("gates generation on at least one included ready source", () => {
    expect(canConfirmGeneration(buildConfirmationSources(explicit, []))).toBe(
      true,
    );
    expect(
      canConfirmGeneration(
        buildConfirmationSources([], [doc("x", "X.pdf", "processing")]),
      ),
    ).toBe(false);
    expect(
      canConfirmGeneration(
        buildConfirmationSources([], [doc("x", "X.pdf", "failed")]),
      ),
    ).toBe(false);
    expect(canConfirmGeneration([])).toBe(false);
  });

  it("collects only included ready ids", () => {
    const sources = buildConfirmationSources(explicit, suggested);
    expect(includedReadySourceIds(sources)).toEqual(["e1", "s1"]);
  });

  it("toggles a single source and suggested-only toggles are scoped", () => {
    let sources = buildConfirmationSources(explicit, suggested);
    sources = toggleConfirmationSource(sources, "s1");
    expect(sources.find((s) => s.doc.id === "s1")?.included).toBe(false);
    expect(sources.find((s) => s.doc.id === "e1")?.included).toBe(true);

    sources = setSuggestedSourcesIncluded(sources, true);
    expect(sources.find((s) => s.doc.id === "s2")?.included).toBe(true);
    expect(sources.find((s) => s.doc.id === "e1")?.included).toBe(true);

    sources = setSuggestedSourcesIncluded(sources, false);
    expect(sources.find((s) => s.doc.id === "s1")?.included).toBe(false);
    expect(sources.find((s) => s.doc.id === "e1")?.included).toBe(true);
  });

  it("never includes a non-ready doc even after forced include", () => {
    const sources = buildConfirmationSources([], [
      doc("x", "X.pdf", "failed"),
    ]);
    expect(canConfirmGeneration(sources)).toBe(false);
    expect(includedReadySourceIds(sources)).toEqual([]);
  });
});

describe("isReadySourceDoc", () => {
  it("is true only for ready documents", () => {
    expect(isReadySourceDoc(doc("a", "A.pdf", "ready"))).toBe(true);
    expect(isReadySourceDoc(doc("a", "A.pdf", "processing"))).toBe(false);
    expect(isReadySourceDoc(doc("a", "A.pdf", "failed"))).toBe(false);
    expect(isReadySourceDoc(doc("a", "A.pdf", "uploaded"))).toBe(false);
  });
});

describe("isMissingTableError", () => {
  it("detects PostgREST PGRST205 and Postgres 42P01", () => {
    expect(isMissingTableError({ code: "PGRST205", message: "n/a" })).toBe(
      true,
    );
    expect(isMissingTableError({ code: "42P01", message: "n/a" })).toBe(true);
  });

  it("detects the human-readable relation wording", () => {
    expect(
      isMissingTableError({
        code: "",
        message: 'relation "public.generated_materials" does not exist',
      }),
    ).toBe(true);
    expect(
      isMissingTableError({ code: "", message: "could not find the table" }),
    ).toBe(true);
  });

  it("is false for null and for real errors", () => {
    expect(isMissingTableError(null)).toBe(false);
    expect(isMissingTableError({ code: "PGRST116", message: "nope" })).toBe(
      false,
    );
    expect(
      isMissingTableError({ code: "", message: "network error" }),
    ).toBe(false);
  });
});

describe("Drive sync status narrowing", () => {
  it("accepts the four statuses and rejects everything else", () => {
    expect(isDriveSyncStatus("not_applicable")).toBe(true);
    expect(isDriveSyncStatus("pending")).toBe(true);
    expect(isDriveSyncStatus("synced")).toBe(true);
    expect(isDriveSyncStatus("failed")).toBe(true);
    expect(isDriveSyncStatus("SYNCED")).toBe(false);
    expect(isDriveSyncStatus("")).toBe(false);
    expect(isDriveSyncStatus(null)).toBe(false);
    expect(isDriveSyncStatus(42)).toBe(false);
  });
});

describe("describeDriveSaveFailure", () => {
  it("reports missing tokens as no-token before any status", () => {
    const result = describeDriveSaveFailure({
      status: 403,
      message: null,
      hasToken: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no-token");
  });

  it("maps 401 to reauthorization-required", () => {
    const result = describeDriveSaveFailure({
      status: 401,
      message: "Invalid Credentials",
      hasToken: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("reauthorization-required");
  });

  it("maps 403 to forbidden", () => {
    const result = describeDriveSaveFailure({
      status: 403,
      message: null,
      hasToken: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden");
  });

  it("maps network failures (no status) honestly", () => {
    const result = describeDriveSaveFailure({
      status: null,
      message: null,
      hasToken: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("network");
  });

  it("maps other HTTP statuses to upload-failed with a safe message", () => {
    const result = describeDriveSaveFailure({
      status: 500,
      message: "backendError",
      hasToken: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("upload-failed");
      expect(result.status).toBe(500);
      // Upstream bodies are never echoed back — messages stay deterministic
      // and free of any credential-like content.
      expect(result.message).not.toContain("backendError");
    }
  });
});

describe("buildWorksheetMarkdown / buildWorksheetDriveFileName", () => {
  const worksheet: Worksheet = {
    title: "Enzyme Lab",
    instructions: "Answer each question from the handout.",
    questions: [
      {
        id: "q1",
        type: "multiple_choice",
        prompt: "What speeds up reactions?",
        choices: ["Enzymes", "Heat only", "Water", "Salt"],
        answer: "Enzymes",
        explanation: "Enzymes are biological catalysts.",
        points: 1,
      },
      {
        id: "q2",
        type: "short_answer",
        prompt: "Define active site.",
        answer: "The region where the substrate binds.",
      },
    ],
    answer_key: "1. Enzymes. 2. Substrate-binding region.",
  };

  it("builds a deterministic markdown document", () => {
    const markdown = buildWorksheetMarkdown(worksheet);
    expect(markdown).toContain("# Enzyme Lab");
    expect(markdown).toContain("Answer each question from the handout.");
    expect(markdown).toContain("1. What speeds up reactions?");
    expect(markdown).toContain("a) Enzymes");
    expect(markdown).toContain("**Answer:** Enzymes");
    expect(markdown).toContain("2. Define active site.");
    expect(markdown).toContain("## Answer key");
    expect(markdown).toContain("1. Enzymes. 2. Substrate-binding region.");
  });

  it("builds a safe Drive filename with the Worksheet suffix", () => {
    expect(buildWorksheetDriveFileName(worksheet)).toBe(
      "Enzyme Lab — Worksheet.md",
    );
    expect(
      buildWorksheetDriveFileName({ title: 'a/b:c*d?"e', questions: [] }),
    ).toBe("a_b_c_d__e — Worksheet.md");
  });
});

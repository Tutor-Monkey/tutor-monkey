/**
 * TutorMonkey Teachers — pure, client-safe helpers for the Materials
 * composer slice (the ChatGPT-like "create with AI" surface).
 *
 * This module must stay dependency-free (no DOM, no Supabase, no server
 * modules): it is imported by client components (MaterialsComposer,
 * MaterialsView) and covered by Vitest as a pure helper module, mirroring
 * the conventions in lib/teachers/fileBrowser.ts.
 *
 * It owns the small decision logic of the composer:
 *   - `@` mention parsing (caret-based), so the recommendation menu knows
 *     the exact query and where to replace it when a doc is picked;
 *   - recommendation ranking (explicit filename/token matches, bounded);
 *   - source-confirmation state (explicit chips + suggested sources,
 *     include/exclude, and the "can we generate yet?" gate);
 *   - missing-table detection for the honest migration-pending states
 *     (generated_materials may not exist until the third Teachers
 *     migration is applied);
 *   - Google Drive save decisions: the human-readable Markdown builder and
 *     the typed failure mapping (403 / reauthorization, never the token).
 *
 * Terminology is exact: Documents = imported source files, Materials =
 * generated content. No extracted text ever appears in this module — the
 * composer only ever receives id/filename/status metadata for suggestions.
 */

import type { MaterialStatus } from "./materialDetail";
import type { Worksheet } from "./worksheet";

// ---------------------------------------------------------------------------
// Composer source documents (metadata only — never extracted text)
// ---------------------------------------------------------------------------

/** A document the composer may use as a generation source (metadata only). */
export type ComposerSourceDoc = {
  id: string;
  filename: string;
  sourceType: string;
  mimeType: string | null;
  status: MaterialStatus;
  createdAt: string;
  /** Folder segments ([] = workspace root); purely cosmetic. */
  folderSegments: string[];
};

/** True when a document's extracted text is ready to generate from. */
export function isReadySourceDoc(doc: ComposerSourceDoc): boolean {
  return doc.status === "ready";
}

// ---------------------------------------------------------------------------
// @ mention parsing (caret based)
// ---------------------------------------------------------------------------

export type MentionState = {
  /** True when the caret sits right after a `@` with no whitespace between. */
  active: boolean;
  /** The raw text between the `@` and the caret (may be empty). */
  query: string;
  /** Index of the `@` character. */
  start: number;
  /** Caret position (exclusive end of the mention). */
  end: number;
};

/**
 * Decide whether the caret is inside a `@` mention and what it queries.
 *
 * A mention is active when scanning back from the caret we hit a `@`
 * before any whitespace or the start of the string. The query is the text
 * between that `@` and the caret (empty right after typing `@`). Anything
 * else — no `@`, whitespace before the caret, or a `@` that is preceded by
 * word characters (e.g. an email address) — reports inactive.
 *
 * Pure so the component can call it on every keystroke with no DOM state.
 */
export function findMentionAtCaret(text: string, caret: number): MentionState {
  const boundedCaret = Math.max(0, Math.min(caret, text.length));
  if (boundedCaret === 0) {
    return { active: false, query: "", start: 0, end: 0 };
  }

  let at = -1;
  for (let index = boundedCaret - 1; index >= 0; index--) {
    const ch = text[index];
    if (ch === "@") {
      at = index;
      break;
    }
    if (/\s/.test(ch)) break;
  }
  if (at < 0) {
    return { active: false, query: "", start: boundedCaret, end: boundedCaret };
  }

  // An email address or a bare word like "at@something" is not a mention:
  // the character before `@` must not be a word character.
  const previous = at > 0 ? text[at - 1] : "";
  if (previous !== "" && /[\w]/.test(previous)) {
    return { active: false, query: "", start: boundedCaret, end: boundedCaret };
  }

  return {
    active: true,
    query: text.slice(at + 1, boundedCaret),
    start: at,
    end: boundedCaret,
  };
}

/**
 * Replace the mention range [start, end) with `replacement` and return the
 * new text plus the caret position after the replacement.
 */
export function replaceMentionRange(
  text: string,
  start: number,
  end: number,
  replacement: string,
): { text: string; caret: number } {
  const next = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
  return { text: next, caret: start + replacement.length };
}

// ---------------------------------------------------------------------------
// Recommendation ranking
// ---------------------------------------------------------------------------

/** Default / maximum number of candidates the suggestion UI may show. */
export const SUGGESTION_LIMIT_DEFAULT = 10;
export const SUGGESTION_LIMIT_UI = 20;
export const SUGGESTION_LIMIT_MAX = 100;

/**
 * Bound a raw `limit` value (URL param) into [1, SUGGESTION_LIMIT_MAX].
 * Unparseable or out-of-range values fall back to the default.
 */
export function boundSuggestionLimit(value: unknown): number {
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 1) {
      return Math.min(parsed, SUGGESTION_LIMIT_MAX);
    }
  }
  return SUGGESTION_LIMIT_DEFAULT;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token !== "");
}

/**
 * Rank candidate documents for a mention query (or a prompt, when the
 * composer auto-suggests related documents on submit). Pure scoring:
 *
 *   0 — filename equals the query
 *   1 — filename starts with the query
 *   2 — a filename token starts with the query
 *   3 — a filename token contains the query
 *   no match — excluded
 *
 * Ties break on filename (locale) then newest first. Non-matching docs are
 * dropped entirely, so the caller never renders irrelevant rows. The result
 * is bounded by the caller (slice(0, limit)) — this function returns every
 * match, ranked.
 */
export function rankDocumentCandidates(
  docs: readonly ComposerSourceDoc[],
  query: string,
): ComposerSourceDoc[] {
  const trimmed = query.trim();
  if (trimmed === "") {
    // Empty query = "show me recent documents": keep everything, newest
    // first (ready docs first, so the menu is immediately useful).
    return [...docs].sort((a, b) => {
      const readyDelta = Number(isReadySourceDoc(b)) - Number(isReadySourceDoc(a));
      if (readyDelta !== 0) return readyDelta;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }

  const needle = trimmed.toLowerCase();
  const needleTokens = tokenize(needle);

  const scored: { doc: ComposerSourceDoc; score: number }[] = [];
  for (const doc of docs) {
    const filename = doc.filename.toLowerCase();
    let score = -1;

    if (filename === needle) {
      score = 0;
    } else if (filename.startsWith(needle)) {
      score = 1;
    } else {
      const tokens = tokenize(doc.filename);
      if (tokens.some((token) => token.startsWith(needle))) {
        score = 2;
      } else if (
        needleTokens.some((needleToken) =>
          tokens.some((token) => token.includes(needleToken)),
        )
      ) {
        score = 3;
      }
    }

    if (score >= 0) {
      scored.push({ doc, score });
    }
  }

  return scored
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      const readyDelta = Number(isReadySourceDoc(b.doc)) - Number(isReadySourceDoc(a.doc));
      if (readyDelta !== 0) return readyDelta;
      const nameDelta = a.doc.filename.localeCompare(b.doc.filename);
      if (nameDelta !== 0) return nameDelta;
      return b.doc.createdAt.localeCompare(a.doc.createdAt);
    })
    .map(({ doc }) => doc);
}

// ---------------------------------------------------------------------------
// Source confirmation state
// ---------------------------------------------------------------------------

export type ConfirmationSourceOrigin = "explicit" | "suggested";

export type ConfirmationSource = {
  doc: ComposerSourceDoc;
  origin: ConfirmationSourceOrigin;
  /** Defaults to true for ready docs; the teacher can toggle it. */
  included: boolean;
};

/**
 * Build the confirmation-panel source list from the explicitly @-selected
 * docs and the automatically suggested ones. Explicit docs keep their
 * selection order; suggested docs follow (ranked by the caller). A doc that
 * appears in both lists is only listed once (as explicit). Ready docs start
 * included; docs that can't generate yet (processing/failed/uploaded) start
 * excluded so the confirm button's "no ready sources" gate stays truthful.
 */
export function buildConfirmationSources(
  explicit: readonly ComposerSourceDoc[],
  suggested: readonly ComposerSourceDoc[],
): ConfirmationSource[] {
  const seen = new Set<string>();
  const sources: ConfirmationSource[] = [];

  for (const doc of explicit) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    sources.push({
      doc,
      origin: "explicit",
      included: isReadySourceDoc(doc),
    });
  }
  for (const doc of suggested) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    sources.push({
      doc,
      origin: "suggested",
      included: isReadySourceDoc(doc),
    });
  }
  return sources;
}

/** The ids of every included, ready source — what the generate route gets. */
export function includedReadySourceIds(
  sources: readonly ConfirmationSource[],
): string[] {
  return sources
    .filter((source) => source.included && isReadySourceDoc(source.doc))
    .map((source) => source.doc.id);
}

/**
 * The generation gate: at least one included source must be a ready
 * document. The composer blocks the "Confirm sources & generate" button
 * until this is true — no request is ever sent with zero ready sources.
 */
export function canConfirmGeneration(
  sources: readonly ConfirmationSource[],
): boolean {
  return includedReadySourceIds(sources).length > 0;
}

/** Toggle one source's included flag by document id (immutable). */
export function toggleConfirmationSource(
  sources: readonly ConfirmationSource[],
  docId: string,
): ConfirmationSource[] {
  return sources.map((source) =>
    source.doc.id === docId
      ? { ...source, included: !source.included }
      : source,
  );
}

/** Include or exclude every suggested source at once (immutable). */
export function setSuggestedSourcesIncluded(
  sources: readonly ConfirmationSource[],
  included: boolean,
): ConfirmationSource[] {
  return sources.map((source) =>
    source.origin === "suggested" ? { ...source, included } : source,
  );
}

// ---------------------------------------------------------------------------
// Missing-table detection (honest migration-pending states)
// ---------------------------------------------------------------------------

/**
 * True when a Supabase/PostgREST error means the queried table does not
 * exist. PostgREST reports a missing relation as PGRST205 (or surfaces the
 * Postgres 42P01 "relation ... does not exist"); both are checked, plus the
 * human-readable wording, so the Materials view can fall back to legacy
 * provenance only for this exact cause — any other error is a real load
 * failure and is surfaced as such.
 */
export function isMissingTableError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  if (code === "PGRST205" || code === "42P01") return true;
  return (
    message.includes("could not find the table") ||
    message.includes("does not exist") ||
    message.includes("relation")
  );
}

// ---------------------------------------------------------------------------
// Google Drive save decisions (pure)
// ---------------------------------------------------------------------------

export type DriveSyncStatus =
  | "not_applicable"
  | "pending"
  | "synced"
  | "failed";

const DRIVE_SYNC_STATUSES: readonly DriveSyncStatus[] = [
  "not_applicable",
  "pending",
  "synced",
  "failed",
];

/** Narrow an unknown value (e.g. a request body field) to a sync status. */
export function isDriveSyncStatus(value: unknown): value is DriveSyncStatus {
  return (
    typeof value === "string" &&
    (DRIVE_SYNC_STATUSES as readonly string[]).includes(value)
  );
}

export type DriveSaveFailureReason =
  | "no-token"
  | "reauthorization-required"
  | "forbidden"
  | "upload-failed"
  | "network";

export type DriveSaveResult =
  | {
      ok: true;
      fileId: string;
      name: string;
      webViewLink: string | null;
    }
  | {
      ok: false;
      reason: DriveSaveFailureReason;
      message: string;
      /** HTTP status when the Drive API responded (null for network/0). */
      status: number | null;
    };

/**
 * Map a failed Drive files.create attempt to a typed, teacher-safe result.
 * 401 means the in-memory provider token is stale/expired — the fix is
 * reauthorization (sign out and back in after the drive.file scope). 403 is
 * a hard permission denial (still within drive.file — e.g. the folder was
 * shared oddly or the picker token lacks it). Everything else is an honest
 * retry-friendly failure. The token itself is never part of any message.
 */
export function describeDriveSaveFailure(input: {
  status: number | null;
  message?: string | null;
  hasToken: boolean;
}): DriveSaveResult {
  if (!input.hasToken) {
    return {
      ok: false,
      reason: "no-token",
      status: null,
      message:
        "Google Drive isn't connected to this sign-in. Sign out and sign back in after granting Drive read access, then try again.",
    };
  }
  if (input.status === 401) {
    return {
      ok: false,
      reason: "reauthorization-required",
      status: 401,
      message:
        "Your Google Drive connection needs reauthorizing. Sign out and sign back in, then try saving again.",
    };
  }
  if (input.status === 403) {
    return {
      ok: false,
      reason: "forbidden",
      status: 403,
      message:
        "Google Drive refused the save (403). Pick a different folder or reauthorize Drive access, then try again.",
    };
  }
  if (input.status === null) {
    return {
      ok: false,
      reason: "network",
      status: null,
      message:
        "Couldn't reach Google Drive — check your connection and try again.",
    };
  }
  return {
    ok: false,
    reason: "upload-failed",
    status: input.status,
    // The upstream body is deliberately not echoed: messages stay
    // deterministic and never carry credential-like or raw API content.
    message:
      "Google Drive couldn't save this worksheet right now — please try again.",
  };
}

/**
 * Human-readable Markdown for a generated worksheet — the content uploaded
 * to Google Drive (text/markdown). Deterministic and pure so tests pin the
 * exact shape. Uses only the canonical Worksheet fields.
 */
export function buildWorksheetMarkdown(worksheet: Worksheet): string {
  const lines: string[] = [];
  lines.push(`# ${worksheet.title}`);
  lines.push("");
  if (worksheet.instructions && worksheet.instructions.trim() !== "") {
    lines.push(worksheet.instructions.trim());
    lines.push("");
  }
  lines.push("## Questions");
  lines.push("");

  worksheet.questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${question.prompt}`);
    if (question.choices && question.choices.length > 0) {
      question.choices.forEach((choice, choiceIndex) => {
        lines.push(`   ${String.fromCharCode(97 + choiceIndex)}) ${choice}`);
      });
    }
    lines.push("");
    lines.push(`   **Answer:** ${question.answer}`);
    if (question.explanation && question.explanation.trim() !== "") {
      lines.push(`   *Explanation:* ${question.explanation}`);
    }
    lines.push("");
  });

  if (worksheet.answer_key && worksheet.answer_key.trim() !== "") {
    lines.push("## Answer key");
    lines.push("");
    lines.push(worksheet.answer_key.trim());
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Safe Drive filename for a worksheet export: the worksheet title plus a
 * fixed suffix, with characters Drive forbids replaced and a length cap.
 */
export function buildWorksheetDriveFileName(worksheet: Worksheet): string {
  const base = worksheet.title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 80);
  const stem = base === "" ? "Worksheet" : base;
  return `${stem} — Worksheet.md`;
}

/**
 * TutorMonkey Teachers — pure, client-safe helpers for the Google
 * Classroom-style file-browser slice (workspace selector, Documents /
 * Materials tabs, folder breadcrumbs, Drive-import boundary).
 *
 * This module must stay dependency-free (no DOM, no Supabase, no server
 * modules): it is imported by client components and covered by Vitest as a
 * pure helper module, mirroring the conventions in
 * lib/teachers/materialDetail.ts.
 *
 * Terminology is deliberate and exact:
 *   Documents — imported legacy/source files (local uploads today, Google
 *               Drive folder imports via the Picker later). The Documents
 *               tab browses them.
 *   Materials — TutorMonkey-generated classroom content (worksheets produced
 *               from extracted text). The Materials tab lists generated
 *               worksheets with their provenance.
 *
 * The Google Drive import gate (Picker config + provider token) lives in
 * googlePicker.ts, and the lazy Picker loader/opener in
 * googlePickerClient.ts — this module stays free of Drive-specific state.
 */

import type { MaterialStatus } from "./materialDetail";
import type { Worksheet } from "./worksheet";

// ---------------------------------------------------------------------------
// Workspace tabs (Documents / Materials)
// ---------------------------------------------------------------------------

export type WorkspaceTabId = "documents" | "materials";

export const WORKSPACE_TABS = [
  { id: "documents", label: "Documents" },
  { id: "materials", label: "Materials" },
] as const;

/** Narrow an unknown value (e.g. from a URL or persisted state) to a tab id. */
export function isWorkspaceTab(value: unknown): value is WorkspaceTabId {
  return value === "documents" || value === "materials";
}

export function workspaceTabLabel(id: WorkspaceTabId): string {
  return id === "documents" ? "Documents" : "Materials";
}

// ---------------------------------------------------------------------------
// Folder paths + breadcrumbs
// ---------------------------------------------------------------------------

/**
 * Split a folder path into its segments. Accepts "/"-separated paths and
 * tolerates surrounding whitespace, empty segments and trailing slashes
 * ("Unit 3 / Enzymes/" -> ["Unit 3", "Enzymes"]). The empty path is the
 * root folder.
 */
export function splitFolderPath(path: string): string[] {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");
}

/** Join folder segments back into a canonical "/"-separated path. */
export function joinFolderPath(segments: readonly string[]): string {
  return segments.join("/");
}

/** The parent folder's segments (everything but the last one). */
export function parentFolderSegments(segments: readonly string[]): string[] {
  return segments.slice(0, -1);
}

/**
 * Stable map key for a folder path. "" is the root folder; deeper folders
 * get their canonical joined path.
 */
export function folderPathKey(segments: readonly string[]): string {
  return segments.join("/");
}

export type BreadcrumbItem = {
  /** Stable key for React lists (root is always "documents-root"). */
  key: string;
  label: string;
  /** 0 = root ("Documents"); 1+ = first/second folder level. */
  depth: number;
};

/**
 * Build the breadcrumb trail for a folder: the root "Documents" item, then
 * one clickable item per folder level. Pure — the UI just renders it.
 */
export function buildBreadcrumbItems(
  segments: readonly string[],
): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [
    { key: "documents-root", label: "Documents", depth: 0 },
  ];
  segments.forEach((segment, index) => {
    items.push({
      key: `documents-${index + 1}`,
      label: segment,
      depth: index + 1,
    });
  });
  return items;
}

/**
 * Normalize a stored folder path into segments. Accepts what the schema may
 * hold today or later:
 *   - null / undefined / ""            -> root ([])
 *   - a "/"-separated string          -> splitFolderPath
 *   - a JSON array rendered as text   -> parsed, then each string segment
 *   - an actual array of strings      -> trimmed, empties dropped
 * Anything unparseable degrades to root so the browser never crashes on
 * foreign provenance data.
 */
export function normalizeFolderPath(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((segment) => (typeof segment === "string" ? segment.trim() : ""))
      .filter((segment) => segment !== "");
  }
  if (typeof value !== "string" || value.trim() === "") return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((segment) =>
            typeof segment === "string" ? segment.trim() : "",
          )
          .filter((segment) => segment !== "");
      }
      return [];
    } catch {
      return [];
    }
  }
  return splitFolderPath(trimmed);
}

// ---------------------------------------------------------------------------
// Document (imported file) entries for the Documents file browser
// ---------------------------------------------------------------------------

export type DocumentFileEntry = {
  id: string;
  kind: "file";
  name: string;
  sourceType: string;
  byteSize: number | null;
  status: MaterialStatus;
  charCount: number | null;
  createdAt: string;
  workspaceTitle: string;
  /** Folder segments this file lives in ([] = workspace root). */
  folderSegments: string[];
};

/**
 * Minimal material row shape the Documents view projects (counts come back
 * as strings through PostgREST `->>` projections; normalize with
 * parseExtractionCount in materialDetail.ts before passing charCount).
 */
export type DocumentRowLike = {
  id: string;
  source_type: string;
  original_filename: string;
  byte_size: number | null;
  status: MaterialStatus;
  charCount: number | null;
  created_at: string;
  folder_path?: unknown;
};

export function toDocumentFileEntry(
  row: DocumentRowLike,
  workspaceTitle: string,
): DocumentFileEntry {
  return {
    id: row.id,
    kind: "file",
    name: row.original_filename,
    sourceType: row.source_type,
    byteSize: row.byte_size,
    status: row.status,
    charCount: row.charCount,
    createdAt: row.created_at,
    workspaceTitle,
    folderSegments: normalizeFolderPath(row.folder_path),
  };
}

export type FolderEntry = {
  name: string;
  /** Segments of the folder itself (for breadcrumb navigation). */
  path: string[];
};

export type FolderContents = {
  folders: FolderEntry[];
  files: DocumentFileEntry[];
};

/**
 * Group the workspace's document entries for the folder currently being
 * browsed: immediate subfolders first (sorted by name), then the files that
 * live directly in this folder (newest first). A file belongs to the
 * current folder when its segments exactly equal the current path; a folder
 * is shown when it is exactly one level deeper.
 */
export function groupFolderContents(
  entries: readonly DocumentFileEntry[],
  currentSegments: readonly string[],
): FolderContents {
  const folders = new Map<string, FolderEntry>();
  const files: DocumentFileEntry[] = [];

  for (const entry of entries) {
    const segments = entry.folderSegments;
    if (segments.length === currentSegments.length) {
      files.push(entry);
      continue;
    }
    const isChild =
      segments.length === currentSegments.length + 1 &&
      currentSegments.every((segment, index) => segments[index] === segment);
    if (isChild) {
      const name = segments[segments.length - 1];
      if (!folders.has(name)) {
        folders.set(name, { name, path: segments });
      }
    }
  }

  return {
    folders: Array.from(folders.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    files: files.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
  };
}

// ---------------------------------------------------------------------------
// Generated material entries for the Materials file browser
// ---------------------------------------------------------------------------

export type GeneratedMaterialEntry =
  | {
      kind: "generated";
      id: string;
      materialId: string;
      title: string;
      sourceFilename: string;
      questionCount: number;
      model: string | null;
      generatedAt: string | null;
      truncatedSource: boolean;
    }
  | {
      kind: "failed";
      id: string;
      materialId: string;
      title: string;
      sourceFilename: string;
      error: string;
    };

/** The provenance.worksheet block as projected by the Materials query. */
export type WorksheetBlockLike = {
  worksheet?: unknown;
  model?: unknown;
  generated_at?: unknown;
  truncated_source?: unknown;
  last_error?: { message?: unknown } | null;
} | null;

/**
 * Minimal material row shape for the Materials view: id + filename + the
 * projected provenance.worksheet JSONB sub-object.
 */
export type GeneratedMaterialRowLike = {
  id: string;
  original_filename: string;
  worksheet?: WorksheetBlockLike;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function readWorksheetBlock(row: GeneratedMaterialRowLike): {
  worksheet?: unknown;
  model?: unknown;
  generated_at?: unknown;
  truncated_source?: unknown;
  last_error?: { message?: unknown } | null;
} | null {
  if (!isRecord(row.worksheet)) return null;
  return row.worksheet;
}

/**
 * Map a material row to a file-browser entry for the Materials tab:
 *   - a persisted, validated worksheet block  -> a "generated" entry
 *   - a recorded generate failure (no worksheet) -> a "failed" entry with
 *     the honest message
 *   - anything else (no worksheet block at all) -> null (not shown)
 * The generated worksheet's title/contents are the durable provenance copy
 * the generate route persisted after validation.
 */
export function toGeneratedMaterialEntry(
  row: GeneratedMaterialRowLike,
): GeneratedMaterialEntry | null {
  const block = readWorksheetBlock(row);
  if (!block) return null;

  const worksheet = isRecord(block.worksheet)
    ? (block.worksheet as Partial<Worksheet>)
    : null;

  if (worksheet && nonEmptyString(worksheet.title)) {
    const questions = Array.isArray(worksheet.questions)
      ? worksheet.questions
      : [];
    return {
      kind: "generated",
      id: `${row.id}:generated`,
      materialId: row.id,
      title: worksheet.title,
      sourceFilename: row.original_filename,
      questionCount: questions.length,
      model: nonEmptyString(block.model) ? block.model : null,
      generatedAt: nonEmptyString(block.generated_at) ? block.generated_at : null,
      truncatedSource: block.truncated_source === true,
    };
  }

  const lastError = isRecord(block.last_error)
    ? block.last_error.message
    : null;
  if (nonEmptyString(lastError)) {
    return {
      kind: "failed",
      id: `${row.id}:failed`,
      materialId: row.id,
      title: row.original_filename,
      sourceFilename: row.original_filename,
      error: lastError,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Workspace selector helpers
// ---------------------------------------------------------------------------

export type WorkspaceSummary = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
};

/** Short avatar initials for a workspace ("AP Biology · Period 2" -> "AP"). */
export function workspaceInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export type WorkspaceSelectorState =
  | { phase: "loading"; label: string }
  | { phase: "unavailable"; label: string; caption: string }
  | { phase: "empty"; label: string; caption: string }
  | { phase: "ready"; label: string; current: WorkspaceSummary };

/**
 * Decide what the sidebar workspace selector shows from pure inputs. The
 * current workspace is the caller's selection when it still exists in the
 * list; otherwise it falls back to the most recent workspace (index 0,
 * created_at desc) so a stale selection never renders a blank trigger.
 */
export function describeWorkspaceSelector(
  workspaces: readonly WorkspaceSummary[],
  currentId: string | null,
  loading: boolean,
  schemaReady: boolean,
): WorkspaceSelectorState {
  if (loading) {
    return { phase: "loading", label: "Loading workspaces…" };
  }
  if (!schemaReady) {
    return {
      phase: "unavailable",
      label: "Workspace list unavailable",
      caption:
        "The Teachers database migration isn't applied yet — workspace selection is disabled until then.",
    };
  }
  if (workspaces.length === 0) {
    return {
      phase: "empty",
      label: "No workspaces yet",
      caption: "Add a workspace to start browsing documents and materials.",
    };
  }
  const current =
    workspaces.find((workspace) => workspace.id === currentId) ?? workspaces[0];
  return { phase: "ready", label: current.title, current };
}

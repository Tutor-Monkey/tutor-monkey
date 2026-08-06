/**
 * TutorMonkey Teachers — pure, client-safe helpers for the workspace
 * suggestions route (GET /api/teachers/workspaces/[workspaceId]/suggestions).
 *
 * Dependency-free (no DOM, no Supabase, no server modules) so Vitest can
 * cover it as pure helpers. The route fetches candidate source documents
 * scoped to the caller's workspace and returns ONLY metadata — never
 * provenance, never extracted text. This module owns:
 *
 *   - missing-schema detection: the applied remote schema has no folder
 *     columns, so the route degrades gracefully when materials.folder_id /
 *     workspace_folders don't exist yet (migration 20260802020000 pending);
 *   - the row → ComposerSourceDoc projection (metadata only);
 *   - folder-segment chain building from flat workspace_folders rows.
 *
 * Ranking itself lives in materialsComposer.ts (rankDocumentCandidates),
 * shared with the composer UI so the menu and the route agree.
 */

import type { ComposerSourceDoc } from "./materialsComposer";
import type { MaterialStatus } from "./materialDetail";

const MATERIAL_STATUSES: readonly MaterialStatus[] = [
  "uploaded",
  "processing",
  "ready",
  "failed",
];

/** True when `value` is one of the materials.status values the schema allows. */
export function isMaterialStatus(value: unknown): value is MaterialStatus {
  return (
    typeof value === "string" &&
    (MATERIAL_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * True when a Supabase/PostgREST error means the queried COLUMN does not
 * exist (PostgREST PGRST204, or the underlying "column ... does not exist"
 * wording). Distinct from isMissingTableError (materialsComposer.ts), which
 * detects missing tables — the suggestions route uses both: a missing
 * folder_id column just means "no folders yet", not a failed load.
 */
export function isMissingColumnError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  if (code === "PGRST204") return true;
  return (
    message.toLowerCase().includes("column") &&
    (message.toLowerCase().includes("does not exist") ||
      message.toLowerCase().includes("could not find the"))
  );
}

/**
 * Build id → folder-segment chains from flat workspace_folders rows.
 * A folder's segments are its ancestors' names plus its own name, root
 * first (e.g. ["Unit 3", "Enzymes"]); the workspace root is [] (a
 * folder with no parent yields just its own name). Cycles are impossible
 * per the schema (no self-parent, composite-FK workspace scoping) but a
 * depth cap keeps a corrupt row from hanging the request.
 */
export function buildFolderSegmentChains(
  folders: readonly {
    id: string;
    name: string;
    parent_id: string | null;
  }[],
): Map<string, string[]> {
  const byId = new Map<string, { name: string; parent_id: string | null }>();
  for (const folder of folders) {
    byId.set(folder.id, { name: folder.name, parent_id: folder.parent_id });
  }

  const chains = new Map<string, string[]>();
  const MAX_DEPTH = 16;

  const walk = (
    id: string,
    depth: number,
    path: ReadonlySet<string> = new Set(),
  ): string[] => {
    const cached = chains.get(id);
    if (cached) return cached;
    const folder = byId.get(id);
    if (!folder || depth > MAX_DEPTH) return [];
    if (path.has(id)) {
      chains.set(id, []);
      return [];
    }
    const nextPath = new Set(path);
    nextPath.add(id);
    let segments: string[];
    if (folder.parent_id !== null) {
      const parentSegments = walk(folder.parent_id, depth + 1, nextPath);
      if (byId.has(folder.parent_id) && parentSegments.length === 0) {
        chains.set(id, []);
        return [];
      }
      segments = [...parentSegments, folder.name];
    } else {
      segments = [folder.name];
    }
    if (segments.length <= MAX_DEPTH + 1 && !path.has(id)) {
      chains.set(id, segments);
    }
    return segments;
  };

  for (const id of Array.from(byId.keys())) {
    walk(id, 0);
  }
  return chains;
}

/**
 * Minimal materials row shape the suggestions query projects. folder_id is
 * optional because it only exists once the third Teachers migration is
 * applied; the route falls back to rows without it.
 */
export type SuggestionRowLike = {
  id: string;
  original_filename: string;
  source_type: string;
  mime_type: string | null;
  status: string;
  created_at: string;
  folder_id?: string | null;
};

/**
 * Project a materials row into the composer's metadata-only document shape.
 * Never touches provenance: extracted text and source internals stay on the
 * server. Unknown statuses degrade to "uploaded" (the schema's default) so
 * the UI never renders an out-of-model badge.
 */
export function toComposerSourceDoc(
  row: SuggestionRowLike,
  folderSegmentsById: ReadonlyMap<string, string[]>,
): ComposerSourceDoc {
  return {
    id: row.id,
    filename: row.original_filename,
    sourceType: row.source_type,
    mimeType: row.mime_type,
    status: isMaterialStatus(row.status) ? row.status : "uploaded",
    createdAt: row.created_at,
    folderSegments:
      typeof row.folder_id === "string" && row.folder_id !== ""
        ? (folderSegmentsById.get(row.folder_id) ?? [])
        : [],
  };
}

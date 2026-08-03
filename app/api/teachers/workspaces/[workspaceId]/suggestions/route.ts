import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  boundSuggestionLimit,
  isMissingTableError,
  rankDocumentCandidates,
  type ComposerSourceDoc,
} from "@/lib/teachers/materialsComposer";
import {
  buildFolderSegmentChains,
  isMissingColumnError,
  toComposerSourceDoc,
  type SuggestionRowLike,
} from "@/lib/teachers/workspaceSuggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Workspace materials fetched per suggestions request (newest first). */
const CANDIDATE_QUERY_LIMIT = 100;

/**
 * Columns every applied schema has. folder_id is appended separately and
 * dropped on PGRST204 (it only exists after the third Teachers migration).
 */
const BASE_SELECT =
  "id, workspace_id, original_filename, mime_type, source_type, status, created_at";

type WorkspaceFolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
};

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

/**
 * GET /api/teachers/workspaces/[workspaceId]/suggestions?q=...&limit=...
 *
 * Suggestion candidates for the Materials composer's `@` mention menu (and
 * its submit-time auto-suggest). The composer UI already ranks client-side
 * with rankDocumentCandidates; this route is the server-side authority so
 * the menu can never be fed another workspace's documents:
 *
 *   1. SSR Supabase client resolves the session from cookies; no session →
 *      401.
 *   2. The workspace id must be a strict UUID → 404 otherwise (identical to
 *      a non-member's empty result, so nothing leaks).
 *   3. Materials are SELECTed through RLS scoped to the workspace id. A
 *      caller who isn't a member simply gets zero rows — no existence leak.
 *   4. Only metadata is projected (id, filename, mime type, source type,
 *      status, created_at, folder segments). provenance and extracted text
 *      are never selected, so they can never be returned.
 *   5. Candidates are ranked with the shared rankDocumentCandidates and
 *      bounded by the (bounded) limit param.
 *
 * Folders are best-effort: materials.folder_id and workspace_folders only
 * exist once migration 20260802020000 is applied. Until then every
 * candidate reports folderSegments: [] and the request still succeeds.
 */
export async function GET(
  request: Request,
  { params }: { params: { workspaceId: string } },
) {
  const supabase = createClient();
  if (!supabase) {
    return json(
      { error: "Server isn't configured for Supabase right now." },
      500,
    );
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return json({ error: "You need to sign in to see suggestions." }, 401);
  }

  const { workspaceId } = params;
  if (!UUID_RE.test(workspaceId)) {
    return json({ error: "Workspace not found." }, 404);
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const limit = boundSuggestionLimit(url.searchParams.get("limit"));

  const rows = await loadCandidateRows(supabase, workspaceId);
  if (!rows) {
    return json(
      { error: "Couldn't load this workspace's documents — please refresh." },
      500,
    );
  }

  const folderSegmentsById = await loadFolderSegmentChains(
    supabase,
    workspaceId,
    rows,
  );

  const docs: ComposerSourceDoc[] = rows.map((row) =>
    toComposerSourceDoc(row, folderSegmentsById),
  );

  // Same ranking the composer uses; bounded to the requested limit.
  const candidates = rankDocumentCandidates(docs, query).slice(0, limit);

  return json({ candidates } as Record<string, unknown>, 200);
}

/**
 * Fetch the workspace's materials (metadata columns only), degrading
 * gracefully when materials.folder_id doesn't exist yet (pre-migration
 * schema). Returns null on any real load error; RLS handles membership, so
 * a non-member gets an empty array, never an error.
 */
async function loadCandidateRows(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<SuggestionRowLike[] | null> {
  let data: SuggestionRowLike[] | null = null;
  let error: { code?: string; message?: string } | null = null;
  ({ data, error } = await supabase
    .from("materials")
    .select(`${BASE_SELECT}, folder_id`)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_QUERY_LIMIT));

  if (error && isMissingColumnError(error)) {
    // Pre-20260802020000 schema: no folder_id column yet. Retry without it.
    const fallback = await supabase
      .from("materials")
      .select(BASE_SELECT)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_QUERY_LIMIT);
    data = (fallback.data ?? []).map((row) => ({
      ...row,
      folder_id: null,
    })) as SuggestionRowLike[];
    error = fallback.error;
  }

  if (error) {
    console.error(
      "TutorMonkey Teachers: suggestion candidates load failed",
      workspaceId,
      error.message,
    );
    return null;
  }
  return (data ?? []) as SuggestionRowLike[];
}

/**
 * Best-effort folder-segment chains for the returned rows. Requires the
 * workspace_folders table (migration 20260802020000); any failure — missing
 * table or otherwise — degrades to empty chains so suggestions never break
 * over cosmetics.
 */
async function loadFolderSegmentChains(
  supabase: SupabaseClient,
  workspaceId: string,
  rows: SuggestionRowLike[],
): Promise<ReadonlyMap<string, string[]>> {
  const folderIds = new Set<string>();
  for (const row of rows) {
    if (typeof row.folder_id === "string" && row.folder_id !== "") {
      folderIds.add(row.folder_id);
    }
  }
  if (folderIds.size === 0) return new Map();

  const { data, error } = await supabase
    .from("workspace_folders")
    .select("id, name, parent_id")
    .eq("workspace_id", workspaceId)
    .in("id", Array.from(folderIds));

  if (error) {
    if (!isMissingTableError(error)) {
      console.error(
        "TutorMonkey Teachers: suggestion folder lookup failed (degrading to root)",
        workspaceId,
        error.message,
      );
    }
    return new Map();
  }

  return buildFolderSegmentChains((data ?? []) as WorkspaceFolderRow[]);
}

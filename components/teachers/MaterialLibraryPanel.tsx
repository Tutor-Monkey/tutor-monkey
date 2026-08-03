"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Eye,
  Info,
  Library,
  Loader2,
  RefreshCw,
  ScanText,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";
import {
  EXTRACTABLE_EXTENSIONS,
  formatBytes,
} from "@/lib/teachers/materials";
import {
  extractActionLabel,
  parseExtractionCount,
  shortDate,
  type MaterialStatus,
} from "@/lib/teachers/materialDetail";
import { MaterialStatusBadge } from "@/components/teachers/MaterialStatusBadge";
import {
  MaterialDetailModal,
  type GenerateWorksheetOutcome,
  type MaterialSummary,
} from "@/components/teachers/MaterialDetailModal";

type MaterialRow = {
  id: string;
  original_filename: string;
  byte_size: number | null;
  status: MaterialStatus;
  /** Normalized from provenance.extraction.char_count via a `->>` projection. */
  charCount: number | null;
  /** Normalized from provenance.last_error.message via a `->>` projection. */
  lastErrorMessage: string | null;
  created_at: string;
  workspace_title: string;
};

type MaterialLibraryPanelProps = {
  schemaStatus: TeachersSchemaStatus;
};

/**
 * Material library — the authenticated list of uploaded materials with a
 * per-material "Review" (open) action and an "Extract text" action.
 *
 * Extraction runs on the server (POST /api/teachers/materials/[id]/extract)
 * using the user's session: the file is read from private storage under RLS
 * and text is extracted in-process — no third-party service. Every row shows
 * its real status (uploaded / extracting / ready / failed) and failures are
 * shown verbatim (the route's message, e.g. "…is an old Word document…"),
 * never hidden behind a generic "try again".
 *
 * Payload hygiene: the list query projects only the extraction *counts* and
 * the last error message out of the provenance JSONB (`->>`), never the full
 * extracted text. The full text is fetched on demand, RLS-scoped, when the
 * teacher opens a material in the review modal — so a 10 MB handout doesn't
 * ride along with every list refresh.
 */
export function MaterialLibraryPanel({
  schemaStatus,
}: MaterialLibraryPanelProps) {
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [detailMaterial, setDetailMaterial] = useState<MaterialSummary | null>(
    null,
  );

  const isReady = schemaStatus === "ready";

  const loadMaterials = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("materials")
        .select(
          "id, original_filename, byte_size, status, created_at, workspace_id, course_workspaces(title), provenance->extraction->>char_count, provenance->extraction->>word_count, provenance->last_error->>message",
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error(
          "TutorMonkey Teachers: material list load failed",
          error.message,
        );
        setLoadError("Couldn't load your materials — please refresh.");
        return;
      }

      if (data) {
        setMaterials(
          data.map((row) => {
            const course = row.course_workspaces as unknown as
              | { title: string }
              | { title: string }[]
              | null;
            const courseTitle = Array.isArray(course)
              ? (course[0] as { title?: string } | undefined)?.title
              : (course as { title?: string } | null)?.title;
            return {
              id: row.id,
              original_filename: row.original_filename,
              byte_size: row.byte_size,
              status: row.status as MaterialStatus,
              charCount: parseExtractionCount(row.char_count),
              lastErrorMessage:
                typeof row.message === "string" && row.message.trim() !== ""
                  ? row.message
                  : null,
              created_at: row.created_at,
              workspace_title: courseTitle ?? "Workspace",
            };
          }),
        );
      }
    } catch {
      setLoadError("Couldn't load your materials — please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isReady) {
      void loadMaterials();
    }
  }, [isReady, loadMaterials]);

  /**
   * Runs extraction for one material and reports the outcome so callers (the
   * row button and the review modal) can show the route's error verbatim.
   * The list is reloaded either way so statuses stay fresh.
   */
  async function runExtraction(
    materialId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (extractingId) {
      return { ok: false, error: "Extraction is already running." };
    }
    setExtractingId(materialId);
    setRowErrors((previous) => {
      const next = { ...previous };
      delete next[materialId];
      return next;
    });

    try {
      const response = await fetch(
        `/api/teachers/materials/${materialId}/extract`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        const message =
          body?.error ?? "Extraction failed — please try again.";
        setRowErrors((previous) => ({ ...previous, [materialId]: message }));
        return { ok: false, error: message };
      }
      // The route is synchronous, so the list is already up to date; reload
      // anyway so statuses (and any error recorded server-side) are fresh.
      await loadMaterials();
      return { ok: true };
    } catch {
      const message =
        "Couldn't reach the server — check your connection and try again.";
      setRowErrors((previous) => ({ ...previous, [materialId]: message }));
      return { ok: false, error: message };
    } finally {
      setExtractingId(null);
    }
  }

  async function runGeneration(
    materialId: string,
  ): Promise<GenerateWorksheetOutcome> {
    try {
      const response = await fetch(
        `/api/teachers/materials/${materialId}/generate`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        worksheet?: GenerateWorksheetOutcome["worksheet"];
        model?: string;
        truncatedSource?: boolean;
      } | null;

      if (!response.ok) {
        return {
          ok: false,
          error:
            body?.error ?? "Worksheet generation failed — please try again.",
        };
      }
      await loadMaterials();
      return {
        ok: true,
        worksheet: body?.worksheet,
        model: body?.model ?? null,
        truncatedSource: body?.truncatedSource === true,
      };
    } catch {
      return {
        ok: false,
        error:
          "Couldn't reach the server — check your connection and try again.",
      };
    }
  }

  const statusPill =
    schemaStatus === "checking"
      ? "Checking"
      : schemaStatus === "not-applied"
        ? "Migration pending"
        : "Ready";

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-900">
            <Library className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Material library
            </h2>
            <p className="text-sm text-gray-500 font-light">
              Extract readable text from uploaded materials — runs on the
              server with your session, never sent to a third-party service.
              Open a material to review its extracted text.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              isReady ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            {statusPill}
          </span>
          <button
            type="button"
            onClick={() => void loadMaterials()}
            disabled={!isReady || loading}
            title="Refresh material list"
            aria-label="Refresh material list"
            className="shrink-0 rounded-xl border border-gray-200 bg-white p-3 text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
          Extracts: {EXTRACTABLE_EXTENSIONS.join(" ")}
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
          .doc / .ppt not supported yet
        </span>
      </div>

      {!isReady && schemaStatus === "not-applied" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 animate-fade-in">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="font-light">
            The Teachers database isn&apos;t live yet — the schema in{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
              supabase/migrations/
            </code>{" "}
            is written but hasn&apos;t been applied to your Supabase project.
            Extraction is disabled until then.
          </p>
        </div>
      )}

      {loadError && (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 text-sm text-red-600 font-light"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          {loadError}
        </p>
      )}

      {isReady && !loading && materials.length === 0 && !loadError && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-10 text-center">
          <ScanText
            className="mx-auto mb-3 h-8 w-8 text-gray-400"
            aria-hidden="true"
          />
          <p className="mb-1 text-sm font-medium text-gray-900">
            No materials yet
          </p>
          <p className="text-sm text-gray-500 font-light">
            Upload files in the Import materials panel — then come back here
            to extract and review their text.
          </p>
        </div>
      )}

      {materials.length > 0 && (
        <ul className="space-y-2">
          {materials.map((material) => {
            const lastError =
              rowErrors[material.id] ?? material.lastErrorMessage ?? null;
            const busy = extractingId === material.id;

            return (
              <li
                key={material.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Eye
                      className="h-4 w-4 shrink-0 text-gray-400"
                      aria-hidden="true"
                    />
                    <p
                      className="truncate text-sm font-medium text-gray-900"
                      title={material.original_filename}
                    >
                      {material.original_filename}
                    </p>
                    <MaterialStatusBadge status={material.status} />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 font-light">
                    {material.workspace_title}
                    {material.byte_size != null
                      ? ` · ${formatBytes(material.byte_size)}`
                      : ""}
                    {material.created_at
                      ? ` · ${shortDate(material.created_at)}`
                      : ""}
                    {material.charCount != null && material.status === "ready"
                      ? ` · ${material.charCount.toLocaleString()} characters extracted`
                      : ""}
                  </p>
                  {lastError && (
                    <p
                      role="alert"
                      className="mt-1 flex items-start gap-1.5 text-xs text-red-600 font-light"
                    >
                      <AlertTriangle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      {lastError}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDetailMaterial({
                        id: material.id,
                        original_filename: material.original_filename,
                        byte_size: material.byte_size,
                        status: material.status,
                        charCount: material.charCount,
                        lastErrorMessage: material.lastErrorMessage,
                        created_at: material.created_at,
                        workspace_title: material.workspace_title,
                      })
                    }
                    disabled={!isReady}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Review
                  </button>
                  <button
                    type="button"
                    onClick={() => void runExtraction(material.id)}
                    disabled={!isReady || busy || extractingId !== null}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <ScanText className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {busy ? "Extracting…" : extractActionLabel(material.status)}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs text-gray-500 font-light">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        Extraction reads the file through your session and runs entirely on
        the server — text is saved to your workspace, and failures are shown
        here honestly. Extracted text loads only when you open a material.
      </p>

      {detailMaterial && (
        <MaterialDetailModal
          material={detailMaterial}
          schemaStatus={schemaStatus}
          onClose={() => setDetailMaterial(null)}
          onExtract={runExtraction}
          onGenerate={runGeneration}
        />
      )}
    </section>
  );
}

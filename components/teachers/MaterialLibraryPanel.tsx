"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
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

type MaterialStatus = "uploaded" | "processing" | "ready" | "failed";

type MaterialProvenance = {
  extraction?: {
    char_count?: number;
    word_count?: number;
    text?: string;
    extracted_at?: string;
  };
  last_error?: { stage?: string; message?: string; at?: string };
};

type MaterialRow = {
  id: string;
  original_filename: string;
  byte_size: number | null;
  status: MaterialStatus;
  provenance: MaterialProvenance | null;
  created_at: string;
  workspace_title: string;
};

type MaterialLibraryPanelProps = {
  schemaStatus: TeachersSchemaStatus;
};

function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: MaterialStatus }) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-800">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Ready
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Extracting
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
      <FileText className="h-3 w-3" aria-hidden="true" />
      Uploaded
    </span>
  );
}

/**
 * Material library — the authenticated list of uploaded materials with a
 * per-material "Extract text" action.
 *
 * Extraction runs on the server (POST /api/teachers/materials/[id]/extract)
 * using the user's session: the file is read from private storage under RLS
 * and text is extracted in-process — no third-party service. Every row shows
 * its real status (uploaded / extracting / ready / failed) and failures are
 * shown verbatim (the route's message, e.g. "…is an old Word document…"),
 * never hidden behind a generic "try again".
 */
export function MaterialLibraryPanel({
  schemaStatus,
}: MaterialLibraryPanelProps) {
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

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
          "id, original_filename, byte_size, status, provenance, created_at, workspace_id, course_workspaces(title)",
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
              provenance: (row.provenance ?? null) as MaterialProvenance | null,
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

  async function runExtraction(material: MaterialRow) {
    if (extractingId) return;
    setExtractingId(material.id);
    setRowErrors((previous) => {
      const next = { ...previous };
      delete next[material.id];
      return next;
    });

    try {
      const response = await fetch(
        `/api/teachers/materials/${material.id}/extract`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setRowErrors((previous) => ({
          ...previous,
          [material.id]:
            body?.error ?? "Extraction failed — please try again.",
        }));
      }
      // The route is synchronous, so the list is already up to date; reload
      // anyway so statuses (and any error recorded server-side) are fresh.
      await loadMaterials();
    } catch {
      setRowErrors((previous) => ({
        ...previous,
        [material.id]:
          "Couldn't reach the server — check your connection and try again.",
      }));
    } finally {
      setExtractingId(null);
    }
  }

  const statusPill =
    schemaStatus === "checking"
      ? "Checking"
      : schemaStatus === "not-applied"
        ? "Migration pending"
        : "Ready";

  const actionLabelFor = (status: MaterialStatus): string => {
    if (status === "ready") return "Re-extract";
    if (status === "failed") return "Retry extract";
    if (status === "processing") return "Retry extract";
    return "Extract text";
  };

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
            to extract their text.
          </p>
        </div>
      )}

      {materials.length > 0 && (
        <ul className="space-y-2">
          {materials.map((material) => {
            const charCount =
              material.provenance?.extraction?.char_count ?? null;
            const lastError =
              rowErrors[material.id] ??
              material.provenance?.last_error?.message ??
              null;
            const busy = extractingId === material.id;

            return (
              <li
                key={material.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText
                      className="h-4 w-4 shrink-0 text-gray-400"
                      aria-hidden="true"
                    />
                    <p
                      className="truncate text-sm font-medium text-gray-900"
                      title={material.original_filename}
                    >
                      {material.original_filename}
                    </p>
                    <StatusBadge status={material.status} />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 font-light">
                    {material.workspace_title}
                    {material.byte_size != null
                      ? ` · ${formatBytes(material.byte_size)}`
                      : ""}
                    {material.created_at
                      ? ` · ${shortDate(material.created_at)}`
                      : ""}
                    {charCount != null && material.status === "ready"
                      ? ` · ${charCount.toLocaleString()} characters extracted`
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
                <button
                  type="button"
                  onClick={() => void runExtraction(material)}
                  disabled={!isReady || busy || extractingId !== null}
                  className="shrink-0 inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <ScanText className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {busy ? "Extracting…" : actionLabelFor(material.status)}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs text-gray-500 font-light">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        Extraction reads the file through your session and runs entirely on
        the server — text is saved to your workspace, and failures are shown
        here honestly.
      </p>
    </section>
  );
}

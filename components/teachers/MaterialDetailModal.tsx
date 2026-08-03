"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  FileText,
  FolderTree,
  HardDrive,
  Info,
  Loader2,
  ScanText,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";
import { formatBytes } from "@/lib/teachers/materials";
import {
  describeExtractionState,
  extractActionLabel,
  shortDate,
  type ExtractionProvenance,
  type MaterialStatus,
} from "@/lib/teachers/materialDetail";
import { MaterialStatusBadge } from "@/components/teachers/MaterialStatusBadge";

/**
 * The summary row the library list already has — enough to render the modal
 * header instantly while the full detail (including the extracted text)
 * loads. The list deliberately never carries provenance.extraction.text.
 */
export type MaterialSummary = {
  id: string;
  original_filename: string;
  byte_size: number | null;
  status: MaterialStatus;
  charCount: number | null;
  lastErrorMessage: string | null;
  created_at: string;
  workspace_title: string;
};

type MaterialDetailRow = {
  id: string;
  workspace_id: string;
  source_type: string;
  original_filename: string;
  storage_path: string | null;
  mime_type: string | null;
  byte_size: number | null;
  status: MaterialStatus;
  provenance: ExtractionProvenance | null;
  created_at: string;
  course_workspaces:
    | { title: string }
    | { title: string }[]
    | null;
  processing_jobs?: ProcessingJobRow[] | null;
};

type ProcessingJobRow = {
  id: string;
  stage: string;
  status: string;
  error: string | null;
  created_at: string;
};

type MaterialDetailModalProps = {
  material: MaterialSummary;
  schemaStatus: TeachersSchemaStatus;
  onClose: () => void;
  onExtract: (
    materialId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
};

function workspaceTitleOf(
  course: MaterialDetailRow["course_workspaces"],
): string {
  if (Array.isArray(course)) {
    return (course[0] as { title?: string } | undefined)?.title ?? "Workspace";
  }
  return course?.title ?? "Workspace";
}

/**
 * Review modal for a single teacher material — the "inspect before you
 * generate" surface.
 *
 * The detail (metadata, status, extraction counts, extracted text from
 * provenance.extraction.text, recent processing jobs) is fetched on demand
 * through the same RLS-scoped browser client the library list uses: a
 * material id from a workspace the caller doesn't belong to resolves to an
 * empty result, which renders as an honest "not available" state — the IDOR
 * guard is the workspace RLS policies, never a client-side check. No
 * service-role key, no new server route.
 *
 * The extraction section is driven by describeExtractionState (pure helper,
 * lib/teachers/materialDetail.ts): uploaded-but-not-extracted files get a
 * real empty state, legacy .doc/.ppt and Google Drive imports get an honest
 * unsupported notice, failures show the route's message verbatim, and only a
 * row that actually has provenance.extraction.text claims "ready".
 */
export function MaterialDetailModal({
  material,
  schemaStatus,
  onClose,
  onExtract,
}: MaterialDetailModalProps) {
  const [detail, setDetail] = useState<MaterialDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const isReady = schemaStatus === "ready";

  const loadDetail = useCallback(async (materialId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadError(
        "This workspace needs Supabase configured to view materials.",
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("materials")
        .select(
          "id, workspace_id, source_type, original_filename, storage_path, mime_type, byte_size, status, provenance, created_at, course_workspaces(title), processing_jobs(id, stage, status, error, created_at)",
        )
        .eq("id", materialId)
        .order("created_at", {
          ascending: false,
          foreignTable: "processing_jobs",
        })
        .limit(5, { foreignTable: "processing_jobs" })
        .maybeSingle();

      if (error) {
        console.error(
          "TutorMonkey Teachers: material detail load failed",
          materialId,
          error.message,
        );
        setLoadError(
          "Couldn't load this material right now — please close and try again.",
        );
        return;
      }
      if (!data) {
        // RLS-scoped lookup: a row from another teacher's workspace and a
        // deleted row both land here, and both get the same honest answer.
        setLoadError(
          "This material isn't available — it may have been removed, or you may no longer have access to its workspace.",
        );
        return;
      }
      setDetail(data as unknown as MaterialDetailRow);
    } catch {
      setLoadError(
        "Couldn't load this material right now — please close and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDetail(material.id);
  }, [material.id, loadDetail]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleExtract() {
    if (busy || !detail) return;
    setBusy(true);
    setExtractError(null);
    const outcome = await onExtract(detail.id);
    if (outcome.ok) {
      // The route is synchronous, but refetch so the fresh provenance
      // (counts + text) appears without the teacher reopening the modal.
      await loadDetail(detail.id);
    } else {
      setExtractError(
        outcome.error ?? "Extraction failed — please try again.",
      );
    }
    setBusy(false);
  }

  const extractionState = detail
    ? describeExtractionState({
        status: detail.status,
        filename: detail.original_filename,
        sourceType: detail.source_type,
        provenance: detail.provenance,
      })
    : null;

  const jobs = detail?.processing_jobs ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-detail-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-gray-200 bg-white shadow-2xl animate-fade-in-up"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-900">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="material-detail-title"
                className="truncate text-lg font-semibold text-gray-900"
                title={material.original_filename}
              >
                {material.original_filename}
              </h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 font-light">
                <span className="inline-flex items-center gap-1">
                  <FolderTree
                    className="h-3.5 w-3.5 text-gray-400"
                    aria-hidden="true"
                  />
                  {detail ? workspaceTitleOf(detail.course_workspaces) : material.workspace_title}
                </span>
                <span aria-hidden="true">·</span>
                <span>{shortDate(material.created_at) || "—"}</span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <MaterialStatusBadge status={material.status} />
            <button
              type="button"
              onClick={onClose}
              title="Close material view"
              aria-label="Close material view"
              className="shrink-0 rounded-xl border border-gray-200 bg-white p-2.5 text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-16 text-gray-500">
              <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
              <p className="text-sm font-light">Loading material details…</p>
            </div>
          )}

          {!loading && loadError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0"
                aria-hidden="true"
              />
              <div className="font-light">
                <p className="font-medium text-red-800">Can&apos;t open this material</p>
                <p className="mt-0.5">{loadError}</p>
              </div>
            </div>
          )}

          {!loading && !loadError && detail && (
            <div className="space-y-6">
              {/* Metadata */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
                <div>
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <FolderTree className="h-3.5 w-3.5" aria-hidden="true" />
                    Workspace
                  </dt>
                  <dd className="mt-1 truncate text-sm text-gray-800">
                    {workspaceTitleOf(detail.course_workspaces)}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    Uploaded
                  </dt>
                  <dd className="mt-1 text-sm text-gray-800">
                    {shortDate(detail.created_at) || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
                    Size
                  </dt>
                  <dd className="mt-1 text-sm text-gray-800">
                    {detail.byte_size != null ? formatBytes(detail.byte_size) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    Format
                  </dt>
                  <dd className="mt-1 text-sm text-gray-800">
                    {detail.mime_type ?? "Unknown"}
                  </dd>
                </div>
              </dl>

              {/* Extraction */}
              <section aria-label="Extracted text">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <ScanText className="h-4 w-4 text-gray-500" aria-hidden="true" />
                  Extracted text
                </h3>

                {extractionState?.kind === "ready" && (
                  <div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {extractionState.charCount != null && (
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                          {extractionState.charCount.toLocaleString()} characters
                        </span>
                      )}
                      {extractionState.wordCount != null && (
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                          {extractionState.wordCount.toLocaleString()} words
                        </span>
                      )}
                      {extractionState.extractedAt && (
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                          Extracted {shortDate(extractionState.extractedAt) || "recently"}
                        </span>
                      )}
                      {extractionState.extractor && (
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                          {extractionState.extractor}
                        </span>
                      )}
                    </div>
                    <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-gray-200 bg-gray-50/60 p-4 font-sans text-sm leading-relaxed text-gray-800 font-light">
                      {extractionState.text}
                    </pre>
                  </div>
                )}

                {extractionState?.kind === "not-extracted" && (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-8 text-center">
                    <ScanText
                      className="mx-auto mb-3 h-8 w-8 text-gray-400"
                      aria-hidden="true"
                    />
                    <p className="mb-1 text-sm font-medium text-gray-900">
                      No text extracted yet
                    </p>
                    <p className="mx-auto max-w-md text-sm text-gray-500 font-light">
                      {extractionState.message}
                    </p>
                  </div>
                )}

                {extractionState?.kind === "unsupported" && (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle
                      className="mt-0.5 h-5 w-5 shrink-0"
                      aria-hidden="true"
                    />
                    <p className="font-light">{extractionState.message}</p>
                  </div>
                )}

                {extractionState?.kind === "processing" && (
                  <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    <Loader2
                      className="mt-0.5 h-5 w-5 shrink-0 animate-spin"
                      aria-hidden="true"
                    />
                    <p className="font-light">{extractionState.message}</p>
                  </div>
                )}

                {extractionState?.kind === "failed" && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertTriangle
                      className="mt-0.5 h-5 w-5 shrink-0"
                      aria-hidden="true"
                    />
                    <p className="font-light">{extractionState.message}</p>
                  </div>
                )}

                {extractionState?.kind === "no-text" && (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle
                      className="mt-0.5 h-5 w-5 shrink-0"
                      aria-hidden="true"
                    />
                    <p className="font-light">{extractionState.message}</p>
                  </div>
                )}
              </section>

              {/* Recent processing runs */}
              {jobs.length > 0 && (
                <section aria-label="Processing history">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Clock3 className="h-4 w-4 text-gray-500" aria-hidden="true" />
                    Processing runs
                  </h3>
                  <ul className="space-y-2">
                    {jobs.map((job) => (
                      <li
                        key={job.id}
                        className="rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-2.5"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs font-medium text-gray-800">
                            {job.stage}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              job.status === "succeeded"
                                ? "bg-green-100 text-green-800"
                                : job.status === "failed"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {job.status}
                          </span>
                          {job.created_at && (
                            <span className="text-xs text-gray-500 font-light">
                              {shortDate(job.created_at) || ""}
                            </span>
                          )}
                        </div>
                        {job.error && (
                          <p className="mt-1 text-xs text-red-600 font-light">
                            {job.error}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse items-stretch gap-2 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-1.5 text-xs text-gray-500 font-light">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
            Text is read on the server through your session — never sent to a
            third-party service.
          </p>
          <div className="flex items-center gap-2">
            {extractError && (
              <p role="alert" className="max-w-[240px] text-xs text-red-600 font-light">
                {extractError}
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void handleExtract()}
              disabled={!isReady || busy || !detail || loading}
              className="shrink-0 inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-sm transition-all duration-300 hover:bg-gray-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ScanText className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {busy ? "Extracting…" : extractActionLabel(material.status)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";
import {
  toGeneratedMaterialEntry,
  type GeneratedMaterialEntry,
  type GeneratedMaterialRowLike,
  type WorkspaceSummary,
} from "@/lib/teachers/fileBrowser";
import { parseExtractionCount, shortDate, type MaterialStatus } from "@/lib/teachers/materialDetail";
import {
  requestWorksheetGeneration,
  type GenerateWorksheetOutcome,
} from "@/lib/teachers/generateClient";
import {
  MaterialDetailModal,
  type MaterialSummary,
} from "@/components/teachers/MaterialDetailModal";

type MaterialRow = {
  id: string;
  workspace_id: string;
  original_filename: string;
  byte_size: number | null;
  status: MaterialStatus;
  /** PostgREST `->>` projection — normalize with parseExtractionCount. */
  char_count: unknown;
  /** PostgREST `->>` projection of provenance.last_error.message. */
  message: string | null;
  created_at: string;
  /** PostgREST `->` projection of provenance.worksheet (JSONB block). */
  worksheet: unknown;
};

type MaterialsViewProps = {
  schemaStatus: TeachersSchemaStatus;
  /** The workspace being browsed; null while none exists / is selected. */
  currentWorkspace: WorkspaceSummary | null;
  /** Jump to the Documents tab (e.g. an empty-state CTA to import/generate). */
  onSwitchToDocuments: () => void;
};

/**
 * Materials view — the workspace file browser for TutorMonkey-generated
 * content (worksheets produced from imported documents).
 *
 * Terminology is exact: Documents = imported source files, Materials =
 * generated content. Each generated worksheet is a durable provenance copy
 * (provenance.worksheet) written by the generate route after validation and
 * persistence; this view only ever claims "generated" for rows that have
 * one. Recorded generation failures show their honest message. Opening an
 * entry jumps to the source document's review modal, where regeneration is
 * available — the existing review/generation flow stays intact.
 */
export function MaterialsView({
  schemaStatus,
  currentWorkspace,
  onSwitchToDocuments,
}: MaterialsViewProps) {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailMaterial, setDetailMaterial] = useState<MaterialSummary | null>(
    null,
  );

  const isReady = schemaStatus === "ready";

  const loadMaterials = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !currentWorkspace) return;

    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("materials")
        .select(
          "id, workspace_id, original_filename, byte_size, status, created_at, provenance->worksheet, provenance->extraction->>char_count, provenance->last_error->>message",
        )
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error(
          "TutorMonkey Teachers: generated materials load failed",
          currentWorkspace.id,
          error.message,
        );
        setLoadError(
          "Couldn't load this workspace's materials — please refresh.",
        );
        return;
      }

      if (data) {
        setRows(
          data.map((row) => ({
            id: row.id as string,
            workspace_id: row.workspace_id as string,
            original_filename: row.original_filename as string,
            byte_size: row.byte_size as number | null,
            status: row.status as MaterialStatus,
            char_count: row.char_count,
            message:
              typeof row.message === "string" && row.message.trim() !== ""
                ? row.message
                : null,
            created_at: row.created_at as string,
            worksheet: row.worksheet,
          })),
        );
      }
    } catch {
      setLoadError("Couldn't load this workspace's materials — please refresh.");
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    if (isReady && currentWorkspace) {
      void loadMaterials();
    } else {
      setRows([]);
    }
  }, [isReady, currentWorkspace, loadMaterials]);

  useEffect(() => {
    setDetailMaterial(null);
  }, [currentWorkspace?.id]);

  const entries = useMemo<GeneratedMaterialEntry[]>(
    () =>
      rows
        .map((row) =>
          toGeneratedMaterialEntry({
            id: row.id,
            original_filename: row.original_filename,
            worksheet: row.worksheet as GeneratedMaterialRowLike["worksheet"],
          }),
        )
        .filter((entry): entry is GeneratedMaterialEntry => entry !== null),
    [rows],
  );

  const generatedEntries = entries.filter((entry) => entry.kind === "generated");
  const failedEntries = entries.filter((entry) => entry.kind === "failed");
  const hasAnyDocuments = rows.length > 0;

  async function runGeneration(
    materialId: string,
  ): Promise<GenerateWorksheetOutcome> {
    const outcome = await requestWorksheetGeneration(materialId);
    if (outcome.ok) {
      await loadMaterials();
    }
    return outcome;
  }

  function openReview(row: MaterialRow) {
    setDetailMaterial({
      id: row.id,
      original_filename: row.original_filename,
      byte_size: row.byte_size,
      status: row.status,
      charCount: parseExtractionCount(row.char_count),
      lastErrorMessage: row.message,
      created_at: row.created_at,
      workspace_title: currentWorkspace?.title ?? "Workspace",
    });
  }

  return (
    <section
      aria-label="Materials"
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8"
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-900">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Materials
            </h2>
            <p className="text-sm text-gray-500 font-light">
              TutorMonkey-generated content for{" "}
              <span className="font-medium text-gray-800">
                {currentWorkspace?.title ?? "this workspace"}
              </span>{" "}
              — worksheets built from your imported documents.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadMaterials()}
          disabled={!isReady || loading || !currentWorkspace}
          title="Refresh materials list"
          aria-label="Refresh materials list"
          className="shrink-0 rounded-xl border border-gray-200 bg-white p-3 text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {schemaStatus === "not-applied" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 animate-fade-in">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="font-light">
            The Teachers database isn&apos;t live yet — the schema in{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
              supabase/migrations/
            </code>{" "}
            is written but hasn&apos;t been applied to your Supabase project.
            Materials are disabled until then.
          </p>
        </div>
      )}

      {!currentWorkspace && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-12 text-center">
          <Sparkles
            className="mx-auto mb-3 h-8 w-8 text-gray-400"
            aria-hidden="true"
          />
          <p className="mb-1 text-sm font-medium text-gray-900">
            No workspace selected
          </p>
          <p className="mx-auto max-w-md text-sm text-gray-500 font-light">
            Pick a workspace from the sidebar — or add one — to see its
            generated materials.
          </p>
        </div>
      )}

      {currentWorkspace && loading && (
        <div className="flex flex-col items-center gap-3 py-12 text-gray-500">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          <p className="text-sm font-light">Loading materials…</p>
        </div>
      )}

      {currentWorkspace && !loading && loadError && (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 text-sm text-red-600 font-light"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {loadError}
        </p>
      )}

      {currentWorkspace && !loading && !loadError && entries.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-12 text-center">
          <Sparkles
            className="mx-auto mb-3 h-8 w-8 text-gray-400"
            aria-hidden="true"
          />
          <p className="mb-1 text-sm font-medium text-gray-900">
            {hasAnyDocuments
              ? "No generated materials yet"
              : "No materials in this workspace yet"}
          </p>
          <p className="mx-auto max-w-md text-sm text-gray-500 font-light">
            {hasAnyDocuments
              ? "Open a document in the Documents tab and generate a worksheet from its extracted text — it appears here as a material."
              : "Import documents first, then generate worksheets from them — generated content appears here as materials."}
          </p>
          <button
            type="button"
            onClick={onSwitchToDocuments}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:bg-gray-800 hover:shadow-md"
          >
            {hasAnyDocuments ? "Review documents & generate" : "Import documents"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {currentWorkspace && !loading && !loadError && entries.length > 0 && (
        <div className="space-y-6">
          {generatedEntries.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Generated · {generatedEntries.length}
              </h3>
              <ul className="space-y-2">
                {generatedEntries.map((entry) => {
                  if (entry.kind !== "generated") return null;
                  const row = rows.find((r) => r.id === entry.materialId);
                  return (
                    <li
                      key={entry.id}
                      className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <Sparkles
                          className="mt-0.5 h-4 w-4 shrink-0 text-gray-900"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className="truncate text-sm font-medium text-gray-900"
                              title={entry.title}
                            >
                              {entry.title}
                            </p>
                            <span className="shrink-0 rounded-full bg-gray-900 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                              {entry.questionCount} question
                              {entry.questionCount === 1 ? "" : "s"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500 font-light">
                            From “{entry.sourceFilename}”
                            {entry.model ? ` · ${entry.model}` : ""}
                            {entry.generatedAt
                              ? ` · ${shortDate(entry.generatedAt)}`
                              : ""}
                            {entry.truncatedSource
                              ? " · source was truncated for generation"
                              : ""}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => row && openReview(row)}
                        disabled={!isReady || !row}
                        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        Open source document
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {failedEntries.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Generation failures · {failedEntries.length}
              </h3>
              <ul className="space-y-2">
                {failedEntries.map((entry) => {
                  if (entry.kind !== "failed") return null;
                  const row = rows.find((r) => r.id === entry.materialId);
                  return (
                    <li
                      key={entry.id}
                      className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <AlertTriangle
                          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {entry.title}
                          </p>
                          <p className="mt-1 text-xs text-amber-800 font-light">
                            {entry.error}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => row && openReview(row)}
                        disabled={!isReady || !row}
                        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-medium text-amber-800 shadow-sm transition-all duration-300 hover:bg-amber-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        Review source
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p className="flex items-start gap-2 text-xs text-gray-500 font-light">
            <Info
              className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
              aria-hidden="true"
            />
            Materials are generated on the server from a document&apos;s
            extracted text and stored with the document — open a source
            document to regenerate or review the worksheet.
          </p>
        </div>
      )}

      {detailMaterial && (
        <MaterialDetailModal
          material={detailMaterial}
          schemaStatus={schemaStatus}
          onClose={() => setDetailMaterial(null)}
          onGenerate={runGeneration}
        />
      )}
    </section>
  );
}

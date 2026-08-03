"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Info,
  Loader2,
  RefreshCw,
  ScanText,
  UploadCloud,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";
import {
  folderPathKey,
  groupFolderContents,
  toDocumentFileEntry,
  type DocumentFileEntry,
  type WorkspaceSummary,
} from "@/lib/teachers/fileBrowser";
import type { GoogleDriveImportGate } from "@/lib/teachers/googlePicker";
import type { GoogleDrivePick } from "@/lib/teachers/googlePicker";
import { formatBytes } from "@/lib/teachers/materials";
import {
  parseExtractionCount,
  shortDate,
  type MaterialStatus,
} from "@/lib/teachers/materialDetail";
import {
  requestWorksheetGeneration,
  type GenerateWorksheetOutcome,
} from "@/lib/teachers/generateClient";
import { MaterialStatusBadge } from "@/components/teachers/MaterialStatusBadge";
import { FolderBreadcrumb } from "@/components/teachers/FolderBreadcrumb";
import { GoogleDriveImportButton } from "@/components/teachers/GoogleDriveImportButton";
import {
  MaterialDetailModal,
  type MaterialSummary,
} from "@/components/teachers/MaterialDetailModal";
import { MaterialsIntakePanel } from "@/components/teachers/MaterialsIntakePanel";

type DocumentRow = {
  id: string;
  source_type: string;
  original_filename: string;
  byte_size: number | null;
  status: MaterialStatus;
  /** PostgREST `->>` projection — normalize with parseExtractionCount. */
  char_count: unknown;
  /** PostgREST `->>` projection of provenance.last_error.message. */
  message: string | null;
  created_at: string;
  /** Future Drive-import provenance (folder_path); absent today -> root. */
  folder_path?: unknown;
};

type DocumentsViewProps = {
  schemaStatus: TeachersSchemaStatus;
  userId: string;
  /** The workspace being browsed; null while none exists / is selected. */
  currentWorkspace: WorkspaceSummary | null;
};

/**
 * Documents view — the workspace file browser for imported source files.
 *
 * This is the workspace-scoped replacement for the old global material
 * library: the same automatic one-time parsing, review modal and worksheet
 * generation all still live here, but the list is filtered to the current
 * workspace (RLS-scoped like every other query) and presented as a file
 * browser with folder breadcrumbs. Terminology is exact: Documents = the
 * imported/uploaded source files themselves (local uploads today, Google
 * Drive folder imports later).
 *
 * Google Drive stays a boundary, not an integration: "Import from Drive"
 * opens the Google Picker (drive.file least privilege) behind an honest
 * gate — when the Picker public config or the session's provider_token is
 * missing, the button is disabled with setup copy (GoogleDriveImportButton
 * + describeGoogleDriveImportGate). Picked file/folder ids and metadata come
 * back through a typed callback and are listed here; no Drive file is
 * downloaded or imported until a server-side import path exists. Local
 * uploads go through the existing MaterialsIntakePanel, seeded with the
 * current workspace id so the upload lands in the workspace being browsed.
 */
export function DocumentsView({
  schemaStatus,
  userId,
  currentWorkspace,
}: DocumentsViewProps) {
  const [folderSegments, setFolderSegments] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailMaterial, setDetailMaterial] = useState<MaterialSummary | null>(
    null,
  );
  /** Drive import gate lifted from GoogleDriveImportButton (null = checking). */
  const [driveGate, setDriveGate] = useState<GoogleDriveImportGate | null>(null);
  /** The last Picker selection — ids/metadata only, nothing downloaded yet. */
  const [drivePicks, setDrivePicks] = useState<GoogleDrivePick[]>([]);

  const isReady = schemaStatus === "ready";

  function handleDrivePicked(picks: GoogleDrivePick[]) {
    setDrivePicks(picks);
  }

  const loadDocuments = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !currentWorkspace) return;

    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("materials")
        .select(
          "id, source_type, original_filename, byte_size, status, created_at, provenance->extraction->>char_count, provenance->last_error->>message",
        )
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error(
          "TutorMonkey Teachers: document list load failed",
          currentWorkspace.id,
          error.message,
        );
        setLoadError("Couldn't load this workspace's documents — please refresh.");
        return;
      }

      if (data) {
        setRows(
          data.map((row) => ({
            id: row.id as string,
            source_type: row.source_type as string,
            original_filename: row.original_filename as string,
            byte_size: row.byte_size as number | null,
            status: row.status as MaterialStatus,
            char_count: row.char_count,
            message:
              typeof row.message === "string" && row.message.trim() !== ""
                ? row.message
                : null,
            created_at: row.created_at as string,
            folder_path: (row as { folder_path?: unknown }).folder_path,
          })),
        );
      }
    } catch {
      setLoadError("Couldn't load this workspace's documents — please refresh.");
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    if (isReady && currentWorkspace) {
      void loadDocuments();
    } else {
      setRows([]);
    }
  }, [isReady, currentWorkspace, loadDocuments]);

  // Reset the folder trail when switching workspaces so the browser never
  // shows a path that belongs to the previous workspace.
  useEffect(() => {
    setFolderSegments([]);
    setImportOpen(false);
    setDetailMaterial(null);
    setDrivePicks([]);
  }, [currentWorkspace?.id]);

  const entries = useMemo<DocumentFileEntry[]>(
    () =>
      rows.map((row) =>
        toDocumentFileEntry(
          {
            id: row.id,
            source_type: row.source_type,
            original_filename: row.original_filename,
            byte_size: row.byte_size,
            status: row.status,
            charCount: parseExtractionCount(row.char_count),
            created_at: row.created_at,
            folder_path: row.folder_path,
          },
          currentWorkspace?.title ?? "Workspace",
        ),
      ),
    [rows, currentWorkspace?.title],
  );

  const contents = useMemo(
    () => groupFolderContents(entries, folderSegments),
    [entries, folderSegments],
  );

  async function runGeneration(
    materialId: string,
  ): Promise<GenerateWorksheetOutcome> {
    const outcome = await requestWorksheetGeneration(materialId);
    if (outcome.ok) {
      await loadDocuments();
    }
    return outcome;
  }

  function openReview(entry: DocumentFileEntry, row: DocumentRow) {
    setDetailMaterial({
      id: entry.id,
      original_filename: entry.name,
      byte_size: entry.byteSize,
      status: entry.status,
      charCount: entry.charCount,
      lastErrorMessage: row.message,
      created_at: entry.createdAt,
      workspace_title: entry.workspaceTitle,
    });
  }

  const emptyFolder =
    !loading && !loadError && contents.folders.length === 0 && contents.files.length === 0;

  return (
    <section
      aria-label="Documents"
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8"
    >
      {/* Toolbar: breadcrumb + import actions */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <FolderBreadcrumb
          segments={folderSegments}
          onNavigate={setFolderSegments}
          activeLabel={importOpen ? "Import" : undefined}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setImportOpen((open) => !open)}
            disabled={!isReady || !currentWorkspace}
            title={
              !currentWorkspace
                ? "Pick a workspace first"
                : importOpen
                  ? "Back to the document browser"
                  : "Upload source documents into this workspace"
            }
            className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:bg-gray-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UploadCloud className="h-4 w-4" aria-hidden="true" />
            {importOpen ? "Back to documents" : "Import documents"}
          </button>
          <GoogleDriveImportButton
            mode="files"
            label="Import Drive files"
            onPicked={handleDrivePicked}
            onGateChange={setDriveGate}
            disabled={!isReady || !currentWorkspace}
          />
          <GoogleDriveImportButton
            mode="folders"
            label="Import a Drive folder"
            onPicked={handleDrivePicked}
            onGateChange={setDriveGate}
            disabled={!isReady || !currentWorkspace}
          />
        </div>
      </div>

      {driveGate && !driveGate.available && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 text-sm text-gray-600">
          <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <p className="font-light">
            <span className="font-medium text-gray-800">{driveGate.label}</span>
            {" — "}
            {driveGate.caption}
          </p>
        </div>
      )}

      {drivePicks.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm text-blue-900 animate-fade-in">
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0 text-blue-500"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {drivePicks.length === 1
                ? "1 item selected from Google Drive"
                : `${drivePicks.length} items selected from Google Drive`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {drivePicks.map((pick) => (
                <li key={pick.id} className="truncate font-light">
                  {pick.kind === "folder" ? "📁" : "📄"} {pick.name}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 font-light text-blue-800/80">
              Drive import isn&apos;t wired to the server yet — these picks
              (ids + metadata) are held here so the next step can consume
              them. Local uploads and automatic one-time parsing are
              unchanged.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDrivePicks([])}
            aria-label="Dismiss Drive selection"
            className="shrink-0 rounded-lg p-1 text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {schemaStatus === "not-applied" && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 animate-fade-in">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="font-light">
            The Teachers database isn&apos;t live yet — the schema in{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
              supabase/migrations/
            </code>{" "}
            is written but hasn&apos;t been applied to your Supabase project.
            Document browsing and uploads are disabled until then.
          </p>
        </div>
      )}

      {/* Import flow (inline, workspace-seeded) */}
      {importOpen && currentWorkspace && (
        <div className="mb-6 animate-fade-in">
          <MaterialsIntakePanel
            schemaStatus={schemaStatus}
            userId={userId}
            initialWorkspaceId={currentWorkspace.id}
          />
        </div>
      )}

      {!currentWorkspace && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-12 text-center">
          <FolderOpen
            className="mx-auto mb-3 h-8 w-8 text-gray-400"
            aria-hidden="true"
          />
          <p className="mb-1 text-sm font-medium text-gray-900">
            No workspace selected
          </p>
          <p className="mx-auto max-w-md text-sm text-gray-500 font-light">
            Pick a workspace from the sidebar — or add one — to browse its
            imported documents.
          </p>
        </div>
      )}

      {currentWorkspace && !importOpen && loading && (
        <div className="flex flex-col items-center gap-3 py-12 text-gray-500">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          <p className="text-sm font-light">Loading documents…</p>
        </div>
      )}

      {currentWorkspace && !importOpen && loadError && (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 text-sm text-red-600 font-light"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {loadError}
        </p>
      )}

      {currentWorkspace && !importOpen && !loading && !loadError && (
        <div className="space-y-6">
          {emptyFolder && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-12 text-center">
              <ScanText
                className="mx-auto mb-3 h-8 w-8 text-gray-400"
                aria-hidden="true"
              />
              <p className="mb-1 text-sm font-medium text-gray-900">
                {folderSegments.length === 0
                  ? "No documents in this workspace yet"
                  : "This folder is empty"}
              </p>
              <p className="mx-auto max-w-md text-sm text-gray-500 font-light">
                {folderSegments.length === 0
                  ? "Upload files with Import documents — parsing starts automatically, then documents appear here for review and worksheet generation."
                  : "Nothing lives in this folder yet — move files here later, or head back to the Documents root."}
              </p>
              {folderSegments.length === 0 && (
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:bg-gray-800 hover:shadow-md"
                >
                  <UploadCloud className="h-4 w-4" aria-hidden="true" />
                  Import documents
                </button>
              )}
            </div>
          )}

          {contents.folders.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Folders
              </h3>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {contents.folders.map((folder) => (
                  <li key={folderPathKey(folder.path)}>
                    <button
                      type="button"
                      onClick={() => setFolderSegments(folder.path)}
                      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-100"
                    >
                      <Folder
                        className="h-5 w-5 shrink-0 text-amber-500"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">
                          {folder.name}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {contents.files.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Files
              </h3>
              <ul className="space-y-2">
                {contents.files.map((entry) => {
                  const row = rows.find((r) => r.id === entry.id);
                  return (
                    <li
                      key={entry.id}
                      className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <FileText
                          className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className="truncate text-sm font-medium text-gray-900"
                              title={entry.name}
                            >
                              {entry.name}
                            </p>
                            <MaterialStatusBadge status={entry.status} />
                          </div>
                          <p className="mt-1 text-xs text-gray-500 font-light">
                            {entry.workspaceTitle}
                            {entry.byteSize != null
                              ? ` · ${formatBytes(entry.byteSize)}`
                              : ""}
                            {entry.createdAt
                              ? ` · ${shortDate(entry.createdAt)}`
                              : ""}
                            {entry.charCount != null && entry.status === "ready"
                              ? ` · ${entry.charCount.toLocaleString()} characters extracted`
                              : ""}
                          </p>
                          {row?.message && (
                            <p
                              role="alert"
                              className="mt-1 flex items-start gap-1.5 text-xs text-red-600 font-light"
                            >
                              <AlertTriangle
                                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              {row.message}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => row && openReview(entry, row)}
                          disabled={!isReady || !row}
                          className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          Review
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {entries.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500 font-light">
                {entries.length} document{entries.length === 1 ? "" : "s"} in this
                workspace · parsed automatically on upload
              </p>
              <button
                type="button"
                onClick={() => void loadDocuments()}
                disabled={loading}
                title="Refresh document list"
                aria-label="Refresh document list"
                className="shrink-0 rounded-xl border border-gray-200 bg-white p-2.5 text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          )}
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs text-gray-500 font-light">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        Uploaded documents are parsed automatically, exactly once, when they
        are uploaded — text is saved to the workspace and failures are shown
        here honestly. Extracted text loads only when you open a document.
      </p>

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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  HardDriveDownload,
  Info,
  Loader2,
  RefreshCw,
  UploadCloud,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";
import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_TYPES_LABEL,
  EXTRACTABLE_EXTENSIONS,
  MAX_FILE_SIZE_LABEL,
  TEACHERS_MATERIALS_BUCKET,
  buildMaterialObjectPath,
  formatBytes,
  resolveMaterialMimeType,
  validateMaterialFile,
} from "@/lib/teachers/materials";

/**
 * Per-file lifecycle. Extraction is automatic and one-time: once a file is
 * stored and its materials row exists, parsing starts immediately with no
 * manual step (and no re-parse action anywhere in the UI).
 *
 *   idle → uploading → parsing → parsed            (happy path)
 *                       ↓           ↓
 *                 parse_failed   upload_failed
 *
 * `uploaded` is a brief transient between the row insert and the extract
 * POST; the UI reports it textually ("Uploaded — extracting text…") while
 * the status is `parsing`.
 */
type FileStatus =
  | "idle"
  | "uploading"
  | "uploaded"
  | "parsing"
  | "parsed"
  | "upload_failed"
  | "parse_failed";

type SelectedFile = {
  file: File;
  validationError: string | null;
  status: FileStatus;
  error: string | null;
  uploadedTo: string | null;
};

type WorkspaceRow = {
  id: string;
  title: string;
};

type BucketStatus = "checking" | "ready" | "not-applied";

type BatchResult = {
  parsed: number;
  failed: number;
  workspaceTitle: string;
};

type MaterialsIntakePanelProps = {
  schemaStatus: TeachersSchemaStatus;
  userId: string;
};

/** Human-readable explanation for a storage/DB write failure. */
function describeUploadError(
  error: { message?: string; statusCode?: string | number } | null,
): string {
  const message = error?.message ?? "";
  const status =
    error?.statusCode != null ? Number(error.statusCode) : null;

  if (status === 404 || /bucket not found|not found/i.test(message)) {
    return "Storage isn't set up yet — apply the storage migration (supabase/migrations/) first.";
  }
  if (
    status === 42501 ||
    /row-level security|permission denied|permission/i.test(message)
  ) {
    return "This file isn't allowed for your account — pick a workspace you belong to and try again.";
  }
  if (status === 413 || /file size|too large|payload/i.test(message)) {
    return `File exceeds the ${MAX_FILE_SIZE_LABEL.toLowerCase()} limit.`;
  }
  if (status === 415 || /mime|content-type/i.test(message)) {
    return `File type isn't accepted — ${ACCEPTED_TYPES_LABEL.toLowerCase()} only.`;
  }
  if (/does not exist|PGRST205|relation/i.test(message)) {
    return "The Teachers database isn't applied yet — apply the schema migration first.";
  }
  return "Upload didn't complete — please try again.";
}

/**
 * Materials intake panel — real local uploads via Supabase Storage with
 * automatic, one-time text extraction.
 *
 * A file is only reported as uploaded once BOTH writes succeeded:
 *   1. the object lands in the private `teachers-materials` bucket under
 *      {workspace_id}/{material_id}/{filename}, and
 *   2. the public.materials row referencing it is inserted — the insert
 *      returns the new material id (`.select("id").single()`), which is
 *      used to POST /api/teachers/materials/[id]/extract immediately.
 * If the DB insert fails after a successful upload, the object is removed
 * again so no orphaned file is left behind. Every file gets its own status
 * line (selected → uploading → parsing → parsed, or an honest per-file
 * error). Parse failures show the route's message verbatim — the UI never
 * claims "parsed" on failure, and there is deliberately no re-extract
 * action: parsing happens exactly once, right after upload.
 *
 * The target workspace is always explicit: the user picks one from their own
 * workspace list. There is no silent workspace fallback. When the schema
 * and/or the storage migration hasn't been applied yet, uploads are disabled
 * with an honest notice instead of pretending persistence exists.
 */
export function MaterialsIntakePanel({
  schemaStatus,
  userId,
}: MaterialsIntakePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [bucketStatus, setBucketStatus] = useState<BucketStatus>("checking");
  const [uploading, setUploading] = useState(false);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  const isReady = schemaStatus === "ready";

  const loadWorkspaces = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setLoadingWorkspaces(true);
    try {
      const { data, error } = await supabase
        .from("course_workspaces")
        .select("id, title")
        .order("created_at", { ascending: false })
        .limit(25);

      if (!error && data) {
        setWorkspaces(data as WorkspaceRow[]);
        // Drop a stale selection (e.g. a workspace that disappeared).
        setSelectedWorkspaceId((current) =>
          current && data.some((row) => row.id === current) ? current : "",
        );
      }
    } catch {
      // Stay graceful: leave the list as-is if the query fails.
    } finally {
      setLoadingWorkspaces(false);
    }
  }, []);

  const checkBucket = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setBucketStatus("not-applied");
      return;
    }
    try {
      const { error } = await supabase.storage.getBucket(
        TEACHERS_MATERIALS_BUCKET,
      );
      setBucketStatus(error ? "not-applied" : "ready");
    } catch {
      setBucketStatus("not-applied");
    }
  }, []);

  useEffect(() => {
    void checkBucket();
    if (isReady) {
      void loadWorkspaces();
    }
  }, [isReady, checkBucket, loadWorkspaces]);

  function handleFiles(files: FileList | null) {
    if (!files) return;

    const next = Array.from(files).map((file) => ({
      file,
      validationError: validateMaterialFile(file),
      status: "idle" as const,
      error: null,
      uploadedTo: null,
    }));

    setSelectedFiles((previous) => [...previous, ...next]);

    // Allow re-selecting the same file: reset the input value.
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function removeFile(index: number) {
    setSelectedFiles((previous) => previous.filter((_, i) => i !== index));
  }

  function setFileStatus(
    index: number,
    status: FileStatus,
    error: string | null = null,
    uploadedTo: string | null = null,
  ) {
    setSelectedFiles((previous) =>
      previous.map((item, i) =>
        i === index ? { ...item, status, error, uploadedTo } : item,
      ),
    );
  }

  async function uploadOne(
    supabase: SupabaseClient,
    item: SelectedFile,
    index: number,
    workspace: WorkspaceRow,
    batchId: string,
  ): Promise<"parsed" | "failed"> {
    const path = buildMaterialObjectPath(workspace.id, item.file.name);
    const contentType = resolveMaterialMimeType(item.file);

    setFileStatus(index, "uploading");

    // 1) Storage write.
    const { error: uploadError } = await supabase.storage
      .from(TEACHERS_MATERIALS_BUCKET)
      .upload(path, item.file, {
        contentType,
        upsert: false,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error(
        "TutorMonkey Teachers: storage upload failed",
        item.file.name,
        uploadError.message,
      );
      setFileStatus(index, "upload_failed", describeUploadError(uploadError));
      return "failed";
    }

    // 2) DB write — success is only claimed once BOTH writes landed, and the
    //    insert returns the new material id so parsing can start immediately.
    const { data: inserted, error: insertError } = await supabase
      .from("materials")
      .insert({
        workspace_id: workspace.id,
        source_type: "local_upload",
        original_filename: item.file.name,
        storage_path: path,
        mime_type: contentType,
        byte_size: item.file.size,
        status: "uploaded",
        provenance: {
          uploaded_by: userId,
          upload_batch: batchId,
        },
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error(
        "TutorMonkey Teachers: materials insert failed after upload",
        item.file.name,
        insertError?.message,
      );
      // Clean up the orphaned object so we don't leave a file with no record.
      try {
        await supabase.storage
          .from(TEACHERS_MATERIALS_BUCKET)
          .remove([path]);
      } catch {
        // Best-effort cleanup only; the row never existed, so nothing else
        // references the object.
      }
      setFileStatus(index, "upload_failed", describeUploadError(insertError));
      return "failed";
    }

    const materialId = inserted.id;

    // 3) Automatic, one-time extraction — the only parse this file ever
    //    gets. No manual Extract/Re-extract/Retry control exists anywhere;
    //    a parse failure is reported honestly with the route's message.
    setFileStatus(index, "uploaded", null, workspace.title);
    setFileStatus(index, "parsing");

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
          body?.error ??
          "Text extraction failed — the file is uploaded but couldn't be read.";
        console.error(
          "TutorMonkey Teachers: automatic extraction failed",
          item.file.name,
          materialId,
          message,
        );
        setFileStatus(index, "parse_failed", message, workspace.title);
        return "failed";
      }

      setFileStatus(index, "parsed", null, workspace.title);
      return "parsed";
    } catch {
      const message =
        "Couldn't reach the extraction service — the file is uploaded, but text extraction didn't complete.";
      console.error(
        "TutorMonkey Teachers: automatic extraction request failed",
        item.file.name,
        materialId,
      );
      setFileStatus(index, "parse_failed", message, workspace.title);
      return "failed";
    }
  }

  async function handleUpload() {
    if (!selectedWorkspaceId || uploading) return;

    const workspace = workspaces.find((w) => w.id === selectedWorkspaceId);
    if (!workspace) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const uploadable = selectedFiles
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) =>
          !item.validationError &&
          (item.status === "idle" || item.status === "upload_failed"),
      );
    if (uploadable.length === 0) return;

    const batchId = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    setUploading(true);
    setBatchResult(null);
    setBatchTotal(uploadable.length);

    const outcomes = await Promise.all(
      uploadable.map(({ item, index }) =>
        uploadOne(supabase, item, index, workspace, batchId),
      ),
    );

    const parsed = outcomes.filter(
      (outcome) => outcome === "parsed",
    ).length;
    setBatchResult({
      parsed,
      failed: outcomes.length - parsed,
      workspaceTitle: workspace.title,
    });
    setUploading(false);
  }

  const bucketReady = bucketStatus === "ready";
  const canUpload =
    isReady && bucketReady && selectedWorkspaceId !== "" && !uploading;

  const uploadableCount = selectedFiles.filter(
    (item) =>
      !item.validationError &&
      (item.status === "idle" || item.status === "upload_failed"),
  ).length;
  const doneCount = selectedFiles.filter((item) =>
    ["parsed", "parse_failed", "upload_failed"].includes(item.status),
  ).length;
  const retryableCount = selectedFiles.filter(
    (item) => item.status === "upload_failed" && !item.validationError,
  ).length;
  const anyFinished = doneCount > 0;

  const statusPill =
    schemaStatus === "checking" || bucketStatus === "checking"
      ? "Checking"
      : !isReady
        ? "Migration pending"
        : !bucketReady
          ? "Storage pending"
          : "Ready";

  const uploadButtonLabel = !isReady
    ? "Available after migration"
    : bucketStatus === "checking"
      ? "Checking storage…"
      : !bucketReady
        ? "Available after storage setup"
        : !selectedWorkspaceId
          ? "Select a workspace first"
          : uploading
            ? `Processing ${doneCount}/${batchTotal}…`
            : uploadableCount === 0
              ? anyFinished
                ? "All files processed"
                : "Select files to upload"
              : retryableCount > 0
                ? `Retry ${retryableCount} upload${retryableCount === 1 ? "" : "s"}`
                : `Upload ${uploadableCount} file${uploadableCount === 1 ? "" : "s"}`;

  const uploadNote = !isReady
    ? "The Teachers database migration (supabase/migrations/) isn't applied yet — uploads are disabled until it is."
    : !bucketReady
      ? "The storage migration (supabase/migrations/) isn't applied yet — the teachers-materials bucket doesn't exist, so uploads are disabled."
      : "Files upload to the teachers-materials bucket and are recorded in your workspace. Text extraction runs automatically, once, right after the upload — no manual step needed. If extraction fails, the file stays in your library with the failure shown honestly.";

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-900">
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Import materials
            </h2>
            <p className="text-sm text-gray-500 font-light">
              Upload documents into a workspace — text is extracted
              automatically, right after upload.
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            bucketReady && isReady
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {statusPill}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
          {ACCEPTED_TYPES_LABEL}
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
          {MAX_FILE_SIZE_LABEL}
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
          Auto-parses: {EXTRACTABLE_EXTENSIONS.join(" ")}
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
          .doc / .ppt upload only
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
            Uploads are disabled until then; nothing would be saved.
          </p>
        </div>
      )}

      {/* Workspace selection — always explicit, never implicit. */}
      <div className="mb-5">
        <label
          htmlFor="materials-workspace"
          className="mb-1.5 block text-sm font-medium text-gray-700"
        >
          Upload to workspace
        </label>
        <div className="flex items-center gap-2">
          <select
            id="materials-workspace"
            value={selectedWorkspaceId}
            onChange={(event) => setSelectedWorkspaceId(event.target.value)}
            disabled={!isReady || uploading || workspaces.length === 0}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="" disabled>
              {workspaces.length === 0
                ? "No workspaces yet…"
                : "Select a workspace…"}
            </option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadWorkspaces()}
            disabled={!isReady || uploading || loadingWorkspaces}
            title="Refresh workspace list"
            aria-label="Refresh workspace list"
            className="shrink-0 rounded-xl border border-gray-200 bg-white p-3 text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingWorkspaces ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>
        {isReady && workspaces.length === 0 && (
          <p className="mt-1.5 text-xs text-gray-500 font-light">
            No workspaces yet — create one in the panel next to this one, then
            refresh this list.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-8 text-center">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={(event) => handleFiles(event.target.files)}
          className="sr-only"
          aria-label="Choose material files (PDF, Word, PowerPoint, or text)"
          tabIndex={-1}
        />
        <UploadCloud
          className="mx-auto mb-3 h-8 w-8 text-gray-400"
          aria-hidden="true"
        />
        <p className="mb-1 text-sm font-medium text-gray-900">
          Choose files from your computer
        </p>
        <p className="mb-4 text-sm text-gray-500 font-light">
          Files are validated locally — nothing is uploaded until you press
          Upload.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
        >
          <UploadCloud className="h-4 w-4" aria-hidden="true" />
          Browse files
        </button>
      </div>

      {selectedFiles.length > 0 && (
        <ul className="mt-5 space-y-2">
          {selectedFiles.map((item, index) => {
            const uploadFailed = item.status === "upload_failed";
            const parseFailed = item.status === "parse_failed";
            const parsed = item.status === "parsed";
            const inFlight =
              item.status === "uploading" ||
              item.status === "uploaded" ||
              item.status === "parsing";

            return (
              <li
                key={`${item.file.name}-${index}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  {inFlight ? (
                    <Loader2
                      className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-gray-400"
                      aria-hidden="true"
                    />
                  ) : parsed ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-green-600"
                      aria-hidden="true"
                    />
                  ) : parseFailed ? (
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                      aria-hidden="true"
                    />
                  ) : uploadFailed ? (
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileText
                      className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm font-medium text-gray-900"
                      title={item.file.name}
                    >
                      {item.file.name}
                    </p>
                    <p
                      className={`mt-0.5 text-xs font-light ${
                        item.validationError || uploadFailed
                          ? "text-red-600"
                          : parseFailed
                            ? "text-amber-700"
                            : parsed
                              ? "text-green-700"
                              : "text-gray-500"
                      }`}
                    >
                      {formatBytes(item.file.size)}
                      {item.validationError
                        ? ` · ${item.validationError}`
                        : item.status === "uploading"
                          ? " · Uploading…"
                          : item.status === "parsing"
                            ? ` · Uploaded to “${item.uploadedTo}” — extracting text…`
                            : parsed
                              ? ` · Uploaded to “${item.uploadedTo}” · Text extracted`
                              : parseFailed
                                ? ` · Uploaded to “${item.uploadedTo}” · Text extraction failed: ${item.error}`
                                : uploadFailed
                                  ? ` · ${item.error}`
                                  : " · Selected"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  disabled={uploading}
                  aria-label={`Remove ${item.file.name}`}
                  className="shrink-0 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5">
        <button
          type="button"
          onClick={() => void handleUpload()}
          disabled={!canUpload || uploadableCount === 0}
          title={
            !canUpload
              ? "Pick a workspace and wait for the schema + storage migrations to be applied"
              : "Upload the selected files to the chosen workspace — text is extracted automatically"
          }
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:bg-gray-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          <HardDriveDownload className="h-4 w-4" aria-hidden="true" />
          {uploadButtonLabel}
        </button>

        {batchResult && !uploading && (
          <p
            role="status"
            className={`mt-3 flex items-start gap-2 text-xs font-light ${
              batchResult.failed === 0 ? "text-green-700" : "text-amber-700"
            }`}
          >
            {batchResult.failed === 0 ? (
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
            )}
            {batchResult.failed === 0
              ? `${batchResult.parsed} file${
                  batchResult.parsed === 1 ? "" : "s"
                } uploaded and parsed in “${batchResult.workspaceTitle}”.`
              : `${batchResult.parsed} uploaded and parsed, ${batchResult.failed} failed — see the per-file messages above.`}
          </p>
        )}

        <p className="mt-3 flex items-start gap-2 text-xs text-gray-500 font-light">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
            aria-hidden="true"
          />
          {uploadNote}
        </p>
      </div>
    </section>
  );
}

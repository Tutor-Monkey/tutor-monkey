"use client";

import { useRef, useState } from "react";
import {
  FileText,
  HardDriveDownload,
  Info,
  UploadCloud,
  X,
} from "lucide-react";
import type { TeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";

const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".txt",
  ".md",
];

const ACCEPTED_TYPES_LABEL = "PDF, Word, PowerPoint, or text";
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB per file
const MAX_FILE_SIZE_LABEL = "Up to 25 MB per file";

type SelectedFile = {
  file: File;
  error: string | null;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File): string | null {
  const nameParts = file.name.split(".");
  const extension = nameParts.length > 1 ? nameParts.pop() ?? "" : "";
  const dotExtension = `.${extension.toLowerCase()}`;

  if (!ACCEPTED_EXTENSIONS.includes(dotExtension)) {
    return `Unsupported type — ${ACCEPTED_TYPES_LABEL.toLowerCase()} only.`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File is ${formatBytes(file.size)} — ${MAX_FILE_SIZE_LABEL.toLowerCase()}.`;
  }
  return null;
}

type MaterialsIntakePanelProps = {
  schemaStatus: TeachersSchemaStatus;
};

/**
 * Initial materials intake panel.
 *
 * The local file picker is live (selection is validated client-side only), but
 * the upload action is deliberately disabled in every state: the uploads
 * bucket + storage pipeline land in the next milestone, and before the
 * migration is applied the materials tables don't exist either. Nothing here
 * pretends an upload succeeded.
 */
export function MaterialsIntakePanel({
  schemaStatus,
}: MaterialsIntakePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);

  const isReady = schemaStatus === "ready";

  function handleFiles(files: FileList | null) {
    if (!files) return;

    const next = Array.from(files).map((file) => ({
      file,
      error: validateFile(file),
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

  const uploadButtonLabel = isReady
    ? "Coming in the next milestone"
    : schemaStatus === "checking"
      ? "Checking workspace…"
      : "Available after migration";

  const uploadNote = isReady
    ? "Selection is local only — nothing has been uploaded. Uploads need the storage and processing pipeline, which lands in the next milestone."
    : "Selection is local only — nothing has been uploaded. The Teachers database migration (supabase/migrations/) isn't applied yet, and uploads land in the next milestone.";

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
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
              Intake records for uploads and Google Drive files.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-gray-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
          Coming next
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
          {ACCEPTED_TYPES_LABEL}
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
          {MAX_FILE_SIZE_LABEL}
        </span>
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
          Selection is local only — nothing is uploaded yet.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md"
        >
          <UploadCloud className="h-4 w-4" aria-hidden="true" />
          Browse files
        </button>
      </div>

      {selectedFiles.length > 0 && (
        <ul className="mt-5 space-y-2">
          {selectedFiles.map((item, index) => (
            <li
              key={`${item.file.name}-${index}`}
              className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3"
            >
              <div className="flex min-w-0 items-start gap-3">
                <FileText
                  className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-medium text-gray-900"
                    title={item.file.name}
                  >
                    {item.file.name}
                  </p>
                  <p
                    className={`mt-0.5 text-xs font-light ${
                      item.error ? "text-red-600" : "text-gray-500"
                    }`}
                  >
                    {formatBytes(item.file.size)}
                    {item.error ? ` · ${item.error}` : " · Selected"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(index)}
                aria-label={`Remove ${item.file.name}`}
                className="shrink-0 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        <button
          type="button"
          disabled
          title="Uploads land with the storage pipeline in the next milestone"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-gray-50 px-6 py-3 text-sm font-medium text-gray-500 shadow-sm disabled:cursor-not-allowed"
        >
          <HardDriveDownload className="h-4 w-4" aria-hidden="true" />
          {uploadButtonLabel}
        </button>
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

/**
 * TutorMonkey Teachers — client-side materials constants and helpers.
 *
 * These mirror the storage migration (supabase/migrations/
 * 20260802010000_teachers_materials_storage.sql): the bucket name, the
 * accepted document extensions, the 25 MB cap, and the MIME types the
 * bucket's `allowed_mime_types` accepts. Keep the two files in sync.
 */

export const TEACHERS_MATERIALS_BUCKET = "teachers-materials";

export const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".txt",
  ".md",
] as const;

export const ACCEPTED_TYPES_LABEL = "PDF, Word, PowerPoint, or text";
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const MAX_FILE_SIZE_LABEL = "Up to 25 MB per file";

/**
 * Canonical MIME type per accepted extension. Used as the upload content
 * type (and stored on the materials row) so the browser's `file.type`
 * guesswork never drifts from what the bucket's allow-list expects.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

export function extensionOf(filename: string): string {
  const parts = filename.split(".");
  if (parts.length <= 1) return "";
  return `.${(parts.pop() ?? "").toLowerCase()}`;
}

/**
 * Client-side validation of a picked file: extension must be in
 * ACCEPTED_EXTENSIONS and the size must be within MAX_FILE_SIZE_BYTES.
 * Returns a human-readable error, or null when the file is acceptable.
 */
export function validateMaterialFile(file: File): string | null {
  const extension = extensionOf(file.name);

  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) {
    return `Unsupported type — ${ACCEPTED_TYPES_LABEL.toLowerCase()} only.`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File is ${formatBytes(file.size)} — ${MAX_FILE_SIZE_LABEL.toLowerCase()}.`;
  }
  return null;
}

/** Resolve the MIME type to send to Storage for a picked file. */
export function resolveMaterialMimeType(file: File): string {
  const byExtension = MIME_BY_EXTENSION[extensionOf(file.name)];
  if (byExtension) return byExtension;
  return file.type || "application/octet-stream";
}

/**
 * Make a filename safe to use as the last path segment of an object key:
 * drop any directory components, control characters and path-traversal
 * tricks, then cap the length. Unicode letters and digits pass through
 * untouched (Storage encodes them); only path separators and shell-hostile
 * punctuation become underscores.
 */
export function sanitizeStorageFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, "").trim();

  // Strip control characters (U+0000–U+001F) without a control-char regex.
  let cleaned = "";
  for (const ch of base) {
    if (ch.charCodeAt(0) < 32) continue;
    cleaned += ch;
  }

  cleaned = cleaned
    .replace(/[\\/:*?"<>|#%]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();

  if (!cleaned || cleaned === "." || cleaned === "..") {
    return "file";
  }
  return cleaned;
}

/** Collision-free id for the object path's middle segment. */
function randomObjectId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Non-secure contexts (plain-HTTP Tailscale hosts) lack crypto.randomUUID.
  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
    Math.random().toString(36).slice(2, 10),
  ].join("-");
}

/**
 * Build the object key for a local upload:
 *   {workspace_id}/{material_id}/{safe_filename}
 * The first segment is the workspace, which storage RLS uses to scope every
 * read/write/delete to the uploader's own workspace namespace.
 */
export function buildMaterialObjectPath(
  workspaceId: string,
  filename: string,
): string {
  return `${workspaceId}/${randomObjectId()}/${sanitizeStorageFilename(filename)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

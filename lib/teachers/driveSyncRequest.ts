/**
 * TutorMonkey Teachers — pure, client-safe validation for the generated
 * material Drive-sync route
 * (POST /api/teachers/generated-materials/[generatedMaterialId]/drive-sync).
 *
 * Dependency-free (no DOM, no Supabase, no server modules) so Vitest can
 * cover it as pure helpers. The route only accepts a Drive file id, a sync
 * status, and an optional error message — all bounded — and never reads a
 * workspace id from the client (RLS + the row id scope everything).
 *
 * Error strings are safe to show to the teacher: they never echo the
 * Drive file id, the error detail, or any token.
 */

import type { DriveSyncStatus } from "./materialsComposer";

/** Upper bound on a Google Drive file id (base64url-ish; ids are short). */
export const MAX_DRIVE_FILE_ID_CHARS = 200;

/** Upper bound on the optional failure message recorded for `failed`. */
export const MAX_DRIVE_ERROR_CHARS = 500;

/**
 * Drive file ids are base64url-encoded (letters, digits, `_`, `-`). Accept
 * exactly that alphabet so a hostile payload can never smuggle path-ish or
 * control characters into the drive_file_id column.
 */
const DRIVE_FILE_ID_RE = /^[A-Za-z0-9_-]+$/;

export type BoundedDriveFileId =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Validate a Drive file id: non-blank, bounded, safe alphabet. */
export function boundDriveFileId(value: unknown): BoundedDriveFileId {
  if (typeof value !== "string") {
    return { ok: false, error: "driveFileId must be a string." };
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: false, error: "driveFileId must not be blank." };
  }
  if (trimmed.length > MAX_DRIVE_FILE_ID_CHARS) {
    return {
      ok: false,
      error: `driveFileId is too long (max ${MAX_DRIVE_FILE_ID_CHARS} characters).`,
    };
  }
  if (!DRIVE_FILE_ID_RE.test(trimmed)) {
    return {
      ok: false,
      error: "driveFileId contains invalid characters.",
    };
  }
  return { ok: true, id: trimmed };
}

export type BoundedDriveSyncError =
  | { ok: true; error: string | null }
  | { ok: false; error: string };

/**
 * Validate the optional error message. Blank/absent becomes null; present
 * values are trimmed and bounded so the drive_error column never grows
 * unbounded.
 */
export function boundDriveSyncError(value: unknown): BoundedDriveSyncError {
  if (value === undefined || value === null) {
    return { ok: true, error: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "error must be a string." };
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, error: null };
  }
  if (trimmed.length > MAX_DRIVE_ERROR_CHARS) {
    return {
      ok: false,
      error: `The error message is too long (max ${MAX_DRIVE_ERROR_CHARS} characters).`,
    };
  }
  return { ok: true, error: trimmed };
}

/**
 * The sync statuses a drive-sync call may report. `not_applicable` is the
 * schema default for rows never touched by Drive and is deliberately NOT
 * accepted here — a client must never be able to wipe a synced/failed state
 * back to the default.
 */
export type DriveSyncUpdateStatus = Exclude<DriveSyncStatus, "not_applicable">;

const DRIVE_SYNC_UPDATE_STATUSES: readonly DriveSyncUpdateStatus[] = [
  "pending",
  "synced",
  "failed",
];

/** True when `value` is a status this route may persist. */
export function isDriveSyncUpdateStatus(
  value: unknown,
): value is DriveSyncUpdateStatus {
  return (
    typeof value === "string" &&
    (DRIVE_SYNC_UPDATE_STATUSES as readonly string[]).includes(value)
  );
}

export type BoundedDriveSyncInput =
  | {
      ok: true;
      driveFileId: string;
      status: DriveSyncUpdateStatus;
      error: string | null;
    }
  | { ok: false; error: string };

/**
 * Validate the whole drive-sync body at once: safe file id + safe status +
 * bounded optional error. The first failing field wins so the client gets
 * one actionable message.
 */
export function boundDriveSyncInput(input: {
  driveFileId: unknown;
  status: unknown;
  error?: unknown;
}): BoundedDriveSyncInput {
  const fileId = boundDriveFileId(input.driveFileId);
  if (!fileId.ok) return fileId;
  if (!isDriveSyncUpdateStatus(input.status)) {
    return {
      ok: false,
      error: "status must be one of pending, synced, failed.",
    };
  }
  const driveError = boundDriveSyncError(input.error);
  if (!driveError.ok) return driveError;
  return {
    ok: true,
    driveFileId: fileId.id,
    status: input.status,
    error: driveError.error,
  };
}

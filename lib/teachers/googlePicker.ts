/**
 * TutorMonkey Teachers — Google Drive import boundary via the Google Picker
 * API (least privilege, drive.file only).
 *
 * This module is the *decision layer* for Drive import: it describes what
 * the UI may do based on public configuration and whether the session
 * carries a Google provider token, and it normalizes Picker results into
 * typed picks. It is deliberately dependency-free (no DOM, no Supabase, no
 * server modules) so it can be unit-tested like the rest of lib/teachers.
 *
 * Least privilege: Drive import never uses a full-drive scope. The app's
 * Google OAuth scope is https://www.googleapis.com/auth/drive.file, so the
 * Picker only ever lists files/folders the user has explicitly granted to
 * the app (or picked before). The UI additionally gates on two things before
 * it will open the Picker at all:
 *   1. the Picker public config (below), and
 *   2. an available Supabase session `provider_token` — used only in memory
 *      for PickerBuilder.setOAuthToken, never logged, stored or sent to our
 *      servers.
 *
 * Public (browser-safe) environment placeholders — these ship to the browser
 * by design and must never hold secrets:
 *   NEXT_PUBLIC_GOOGLE_PICKER_API_KEY        browser-restricted API key
 *   NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER  Cloud project number (origin
 *                                            verification, Picker setAppId)
 */

/** MIME type Google uses for Drive folders. */
export const GOOGLE_DRIVE_FOLDER_MIME_TYPE =
  "application/vnd.google-apps.folder";

/** What the Picker may select: files only, or folders too. */
export type GoogleDriveSelectionMode = "files" | "folders";

export type GoogleDrivePickKind = "file" | "folder";

/** A normalized Picker selection — id + metadata, nothing more. */
export type GoogleDrivePick = {
  id: string;
  name: string;
  mimeType: string;
  kind: GoogleDrivePickKind;
};

export type GooglePickerPublicConfig = {
  apiKey: string;
  cloudProjectNumber: string;
};

/**
 * The honest gate the UI renders Drive import behind:
 *   - available            -> the Picker may open
 *   - not-configured       -> Picker public config missing (setup copy)
 *   - no-provider-token    -> signed in, but the session has no Drive token
 *                             (reauthorize after adding the drive.file scope)
 */
export type GoogleDriveImportGate =
  | { available: true }
  | {
      available: false;
      reason: "not-configured" | "no-provider-token";
      label: string;
      caption: string;
    };

/**
 * Read the two public Picker env vars. Both must be present and non-blank;
 * anything else is "not configured" so the UI never half-opens the Picker.
 * Pass the env object explicitly so this stays pure and testable.
 */
export function readGooglePickerPublicConfig(env: {
  apiKey?: string;
  cloudProjectNumber?: string;
}): GooglePickerPublicConfig | null {
  const apiKey = env.apiKey?.trim();
  const cloudProjectNumber = env.cloudProjectNumber?.trim();
  if (!apiKey || !cloudProjectNumber) return null;
  return { apiKey, cloudProjectNumber };
}

/**
 * Decide what the Drive import UI may do. Setup copy is deliberately
 * specific: enable the Google Picker API, configure a browser-restricted
 * API key, and reauthorize after adding the drive.file scope.
 */
export function describeGoogleDriveImportGate(input: {
  publicConfig: GooglePickerPublicConfig | null;
  hasProviderToken: boolean;
}): GoogleDriveImportGate {
  if (!input.publicConfig) {
    return {
      available: false,
      reason: "not-configured",
      label: "Google Drive import isn't configured yet",
      caption:
        "To turn it on: enable the Google Picker API in Google Cloud Console, create a browser-restricted API key, then set NEXT_PUBLIC_GOOGLE_PICKER_API_KEY and NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER. The app uses read-only Drive traversal plus explicit Picker selection; it never writes to Drive during import.",
    };
  }
  if (!input.hasProviderToken) {
    return {
      available: false,
      reason: "no-provider-token",
      label: "Google Drive isn't connected to this sign-in",
      caption:
        "Signing in with Google covers your identity only. Sign out and sign back in after granting Drive read access so the session carries a token for recursive folder traversal. Import remains read-only and only starts from an explicitly selected Picker folder.",
    };
  }
  return { available: true };
}

/** True when a Picker doc MIME type is a Drive folder. */
export function isGoogleDriveFolder(mimeType: string): boolean {
  return mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE;
}

/**
 * Normalize one raw Picker `docs[]` entry into a typed pick. The Picker
 * sends { id, name, mimeType, ... }; folders carry the folder MIME type.
 * Anything missing those three string fields is dropped.
 */
export function toGoogleDrivePick(value: unknown): GoogleDrivePick | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const mimeType =
    typeof record.mimeType === "string" ? record.mimeType.trim() : "";
  if (!id || !name || !mimeType) return null;
  return { id, name, mimeType, kind: isGoogleDriveFolder(mimeType) ? "folder" : "file" };
}

/** Normalize the Picker's whole `docs` array, dropping unparseable entries. */
export function normalizeGoogleDrivePicks(docs: unknown): GoogleDrivePick[] {
  if (!Array.isArray(docs)) return [];
  const picks: GoogleDrivePick[] = [];
  for (const doc of docs) {
    const pick = toGoogleDrivePick(doc);
    if (pick) picks.push(pick);
  }
  return picks;
}

/**
 * DocsView options for a selection mode — drive.file-compatible either way:
 * folders are always shown for navigation, but only "folders" mode lets the
 * teacher select a folder itself.
 */
export function driveDocsViewOptions(mode: GoogleDriveSelectionMode): {
  includeFolders: boolean;
  selectFolderEnabled: boolean;
} {
  return {
    includeFolders: true,
    selectFolderEnabled: mode === "folders",
  };
}

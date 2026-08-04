"use client";

/**
 * TutorMonkey Teachers — "Import from Google Drive" button.
 *
 * Renders the Drive import action behind an honest gate:
 *   - while the Picker public config or the session's Google provider_token
 *     is missing, the button is disabled with an explanatory title, and the
 *     gate is surfaced to the parent (onGateChange) so DocumentsView can
 *     render the setup banner.
 *   - when everything is present, clicking lazily loads the Google Picker
 *     script and opens the Picker with drive.file-compatible selection. The
 *     provider_token is read fresh at click time and handed to the Picker
 *     in memory only — never logged, stored or persisted.
 *
 * No full-drive scope is ever used; no files are downloaded from here. The
 * typed onPicked callback receives { id, name, mimeType, kind } picks.
 */

import { useCallback, useEffect, useState } from "react";
import { Cloud, Loader2 } from "lucide-react";
import {
  describeGoogleDriveImportGate,
  readGooglePickerPublicConfig,
  type GoogleDriveImportGate,
  type GoogleDrivePick,
  type GoogleDriveSelectionMode,
} from "@/lib/teachers/googlePicker";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  loadGooglePicker,
  openGoogleDrivePicker,
  readGoogleProviderToken,
  subscribeToAuthChanges,
} from "@/lib/teachers/googlePickerClient";

/**
 * Public, browser-safe Picker config (inlined by Next.js at build time).
 * Both placeholders are public by design; secrets never belong here.
 */
const googlePickerPublicConfig = readGooglePickerPublicConfig({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY,
  cloudProjectNumber: process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER,
});

type GoogleDriveImportButtonProps = {
  /** "files" (default) or "folders" — what the Picker may select. */
  mode?: GoogleDriveSelectionMode;
  /** Extra disabling from the parent (e.g. no workspace selected). */
  disabled?: boolean;
  /** Button label override for folder-vs-file actions. */
  label?: string;
  /** Render as an icon-only toolbar action. */
  compact?: boolean;
  /** Typed callback with the picked file/folder ids + metadata. */
  onPicked: (picks: GoogleDrivePick[]) => void;
  /** Lift the gate up so the parent can render the setup banner. */
  onGateChange?: (gate: GoogleDriveImportGate | null) => void;
};

export function GoogleDriveImportButton({
  mode = "files",
  label = "Import from Drive",
  compact = false,
  disabled = false,
  onPicked,
  onGateChange,
}: GoogleDriveImportButtonProps) {
  // null = still checking the session for a provider_token.
  const [gate, setGate] = useState<GoogleDriveImportGate | null>(null);
  const [opening, setOpening] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function refreshGate() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const token = await readGoogleProviderToken();
      if (!active) return;
      const nextGate = describeGoogleDriveImportGate({
        publicConfig: googlePickerPublicConfig,
        hasProviderToken: token !== null,
      });
      setGate(nextGate);
      onGateChange?.(nextGate);
      if (!nextGate.available && nextGate.reason === "no-provider-token") {
        await supabase.auth.signOut();
      }
    }

    void refreshGate();
    const unsubscribe = subscribeToAuthChanges(() => void refreshGate());

    return () => {
      active = false;
      unsubscribe();
    };
  }, [onGateChange]);

  const available = gate?.available === true;
  const title =
    gate === null
      ? "Checking Google Drive access…"
      : !gate.available
        ? gate.caption
        : pickerError ?? "Pick files from Google Drive";

  const handleClick = useCallback(async () => {
    if (!gate?.available || !googlePickerPublicConfig) return;

    setOpening(true);
    setPickerError(null);

    try {
      // Fresh token at open time; used only for PickerBuilder.setOAuthToken.
      const token = await readGoogleProviderToken();
      if (!token) {
        const nextGate = describeGoogleDriveImportGate({
          publicConfig: googlePickerPublicConfig,
          hasProviderToken: false,
        });
        setGate(nextGate);
        onGateChange?.(nextGate);
        return;
      }

      await loadGooglePicker();
      openGoogleDrivePicker({
        config: googlePickerPublicConfig,
        token,
        mode,
        onPicked,
        onCanceled: () => setOpening(false),
        onError: (message) => {
          setPickerError(message);
        },
      });
    } catch {
      setPickerError(
        "Google Picker couldn't start — please check your connection and try again.",
      );
    } finally {
      // The picker is modal once opened; this also clears the spinner if a
      // step above failed before the picker became visible.
      setOpening(false);
    }
  }, [gate, mode, onPicked, onGateChange]);

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={disabled || gate === null || !available || opening}
        aria-label={label}
        title={title}
        className={compact ? "rounded p-1 text-[#c7c8ce] hover:bg-[#30323d] hover:text-white disabled:cursor-not-allowed disabled:opacity-40" : "inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-300 hover:border-gray-400 hover:bg-gray-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"}
      >
        {opening ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Cloud className="h-4 w-4" aria-hidden="true" />
        )}
        {!compact && label}
      </button>
      {pickerError && (
        <p
          role="alert"
          className="w-full text-xs text-red-600 font-light"
        >
          {pickerError}
        </p>
      )}
    </>
  );
}

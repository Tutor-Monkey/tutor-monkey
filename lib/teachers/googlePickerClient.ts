/**
 * TutorMonkey Teachers — client-side Google Picker loader + opener.
 *
 * This is the *execution* layer for Drive import: it lazily loads the
 * Google Picker script, reads the session's Google provider_token (in
 * memory only), and opens the Picker with drive.file-compatible file/folder
 * selection. It is imported only by client components and never touches the
 * server.
 *
 * Security posture:
 *   - Public config only (browser-restricted API key + Cloud project
 *     number) — these are public by design.
 *   - The provider_token is read fresh from the Supabase session at open
 *     time, passed straight to PickerBuilder.setOAuthToken, and never
 *     logged, stored in state, persisted, or sent to our servers.
 *   - No full-drive scope: the Picker lists only files the user has granted
 *     to the app under https://www.googleapis.com/auth/drive.file.
 */

import {
  driveDocsViewOptions,
  normalizeGoogleDrivePicks,
  type GoogleDrivePick,
  type GoogleDriveSelectionMode,
  type GooglePickerPublicConfig,
} from "./googlePicker";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Minimal ambient types for the Picker globals. This repo has no @types/gapi;
// only the surface this module uses is declared. `gapi` is the script loader;
// the `google.picker.*` namespace appears once `gapi.load("picker")` resolves.
// ES modules can't declare globals, so a namespace is required here.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  interface Window {
    gapi?: {
      load: (
        library: "picker",
        options: { callback: () => void; onerror?: () => void },
      ) => void;
    };
  }

  namespace google {
    namespace picker {
      const Action: {
        PICKED: string;
        CANCEL: string;
        ERROR: string;
      };
      const DocsViewMode: { LIST: string };
      interface PickerResponse {
        action: string;
        docs?: unknown;
      }
      interface PickerBuilderLike {
        addView(view: unknown): PickerBuilderLike;
        setOAuthToken(token: string): PickerBuilderLike;
        setDeveloperKey(key: string): PickerBuilderLike;
        setAppId(cloudProjectNumber: string): PickerBuilderLike;
        setCallback(
          callback: (response: PickerResponse) => void,
        ): PickerBuilderLike;
        build(): { setVisible(visible: boolean): void };
      }
      interface DocsViewLike {
        setIncludeFolders(include: boolean): DocsViewLike;
        setSelectFolderEnabled(enabled: boolean): DocsViewLike;
        setMode(mode: string): DocsViewLike;
      }
      const DocsView: new () => DocsViewLike;
      const PickerBuilder: new () => PickerBuilderLike;
    }
  }
}

// ---------------------------------------------------------------------------
// Lazy script loading (singleton promise, retryable on failure)
// ---------------------------------------------------------------------------

const PICKER_API_SRC = "https://apis.google.com/js/api.js";

let pickerLoadPromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(script);
  });
}

/**
 * Ensure the Google Picker library is loaded, exactly once per page. The
 * promise is shared so concurrent callers wait on the same load; a failed
 * load resets the singleton so the next attempt can retry.
 */
export function loadGooglePicker(): Promise<void> {
  if (!pickerLoadPromise) {
    pickerLoadPromise = (async () => {
      if (!window.gapi) {
        await loadScript(PICKER_API_SRC);
      }
      const gapi = window.gapi;
      if (!gapi) {
        throw new Error("Google API script loaded without gapi");
      }
      await new Promise<void>((resolve, reject) => {
        gapi.load("picker", {
          callback: () => resolve(),
          onerror: () =>
            reject(new Error("gapi failed to load the Picker library")),
        });
      });
    })().catch((error: unknown) => {
      pickerLoadPromise = null;
      throw error;
    });
  }
  return pickerLoadPromise;
}

// ---------------------------------------------------------------------------
// Session provider_token (in-memory only)
// ---------------------------------------------------------------------------

/**
 * Read the Google provider_token off the current Supabase session, or null
 * when there is no session / no token (e.g. Google OAuth signed in before
 * the drive.file scope was added). The token is returned to the caller and
 * used only to authorize the Picker — it is never logged or persisted here.
 */
export async function readGoogleProviderToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.provider_token ?? null;
}

/**
 * Subscribe to auth changes so callers can re-evaluate the Drive gate after
 * the user reauthorizes. Returns an unsubscribe function.
 */
export function subscribeToAuthChanges(onChange: () => void): () => void {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return () => {};
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(() => onChange());
  return () => subscription.unsubscribe();
}

// ---------------------------------------------------------------------------
// Picker opening
// ---------------------------------------------------------------------------

export type GoogleDrivePickerOptions = {
  config: GooglePickerPublicConfig;
  /** Fresh provider_token — in-memory, never logged or persisted. */
  token: string;
  mode: GoogleDriveSelectionMode;
  onPicked: (picks: GoogleDrivePick[]) => void;
  onCanceled?: () => void;
  onError?: (message: string) => void;
};

/**
 * Open the Google Picker with drive.file-compatible selection for the given
 * mode. Folders are always shown for navigation; only "folders" mode allows
 * selecting a folder itself. Selected docs come back through the typed
 * onPicked callback (id + name + mimeType + kind) — no files are downloaded
 * or imported from here.
 */
export function openGoogleDrivePicker(options: GoogleDrivePickerOptions): void {
  const viewOptions = driveDocsViewOptions(options.mode);

  const docsView = new google.picker.DocsView()
    .setIncludeFolders(viewOptions.includeFolders)
    .setSelectFolderEnabled(viewOptions.selectFolderEnabled)
    .setMode(google.picker.DocsViewMode.LIST);

  const picker = new google.picker.PickerBuilder()
    .addView(docsView)
    .setOAuthToken(options.token)
    .setDeveloperKey(options.config.apiKey)
    .setAppId(options.config.cloudProjectNumber)
    .setCallback((response) => {
      if (response.action === google.picker.Action.PICKED) {
        options.onPicked(normalizeGoogleDrivePicks(response.docs));
      } else if (response.action === google.picker.Action.CANCEL) {
        options.onCanceled?.();
      } else if (response.action === google.picker.Action.ERROR) {
        options.onError?.(
          "Google Picker hit an error — please close it and try again.",
        );
      }
    })
    .build();

  picker.setVisible(true);
}

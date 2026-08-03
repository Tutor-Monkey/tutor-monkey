import type { Worksheet } from "./worksheet";
import {
  buildWorksheetDriveFileName,
  buildWorksheetMarkdown,
  describeDriveSaveFailure,
} from "./materialsComposer";

function driveFailureMessage(status: number | null): string {
  const result = describeDriveSaveFailure({ status, hasToken: true });
  return "message" in result
    ? result.message
    : "Google Drive did not save this Material.";
}

export type DriveUploadResult =
  | { ok: true; fileId: string; name: string; webViewLink: string | null }
  | { ok: false; error: string; status: number | null };

export type DriveUploadOptions = {
  token: string;
  folderId: string;
  worksheet: Worksheet;
  title: string;
  fetchImpl?: typeof fetch;
};

/** Upload a generated worksheet as readable Markdown into an explicitly picked Drive folder. */
export async function uploadWorksheetToDrive(
  options: DriveUploadOptions,
): Promise<DriveUploadResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const boundary = `tutormonkey-${crypto.randomUUID()}`;
  const metadata = {
    name: buildWorksheetDriveFileName(options.worksheet),
    mimeType: "text/markdown",
    parents: [options.folderId],
  };
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: text/markdown; charset=UTF-8",
    "",
    buildWorksheetMarkdown(options.worksheet),
    `--${boundary}--`,
    "",
  ].join("\r\n");

  let response: Response;
  try {
    response = await fetchImpl(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
  } catch {
    return {
      ok: false,
      error: driveFailureMessage(null),
      status: null,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: driveFailureMessage(response.status),
      status: response.status,
    };
  }

  const payload = (await response.json().catch(() => null)) as {
    id?: unknown;
    name?: unknown;
    webViewLink?: unknown;
  } | null;
  if (typeof payload?.id !== "string" || payload.id.trim() === "") {
    return {
      ok: false,
      error: "Google Drive did not return a file id — the Material was not confirmed saved.",
      status: response.status,
    };
  }

  return {
    ok: true,
    fileId: payload.id,
    name: typeof payload.name === "string" ? payload.name : metadata.name,
    webViewLink:
      typeof payload.webViewLink === "string" ? payload.webViewLink : null,
  };
}

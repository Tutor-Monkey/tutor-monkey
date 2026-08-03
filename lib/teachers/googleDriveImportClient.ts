"use client";

import {
  buildMaterialObjectPath,
  resolveMaterialMimeType,
  TEACHERS_MATERIALS_BUCKET,
} from "./materials";
import type { GoogleDrivePick } from "./googlePicker";
import type { SupabaseClient } from "@supabase/supabase-js";

type DriveMetadata = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
  folderPath?: string[];
};

type DriveListResponse = { files?: DriveMetadata[]; nextPageToken?: string };

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const EXPORT_MIME: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

export type DriveImportOutcome = {
  imported: string[];
  skipped: string[];
  failed: string[];
};

function safeName(name: string): string {
  const trimmed = name.trim() || "Drive document";
  return /\.[a-z0-9]{1,8}$/i.test(trimmed) ? trimmed : `${trimmed}.txt`;
}

async function driveRequest<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Drive request failed (${response.status})`);
  return (await response.json()) as T;
}

async function listSelectedFolder(token: string, folder: GoogleDrivePick): Promise<DriveMetadata[]> {
  const query = encodeURIComponent(`'${folder.id}' in parents and trashed = false`);
  const fields = encodeURIComponent("nextPageToken,files(id,name,mimeType,size,parents)");
  const result = await driveRequest<DriveListResponse>(token, `${DRIVE_API}/files?q=${query}&pageSize=100&fields=${fields}`);
  return (result.files ?? [])
    .filter((file) => file.mimeType !== DRIVE_FOLDER_MIME)
    .map((file) => ({ ...file, folderPath: [folder.name] }));
}

async function getMetadata(token: string, pick: GoogleDrivePick): Promise<DriveMetadata> {
  const fields = encodeURIComponent("id,name,mimeType,size,parents");
  return driveRequest<DriveMetadata>(token, `${DRIVE_API}/files/${encodeURIComponent(pick.id)}?fields=${fields}`);
}

async function downloadDriveFile(token: string, metadata: DriveMetadata): Promise<File> {
  const exportMime = EXPORT_MIME[metadata.mimeType];
  const endpoint = exportMime
    ? `${DRIVE_API}/files/${encodeURIComponent(metadata.id)}/export?mimeType=${encodeURIComponent(exportMime)}`
    : `${DRIVE_API}/files/${encodeURIComponent(metadata.id)}?alt=media`;
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Drive download failed (${response.status})`);
  const blob = await response.blob();
  return new File([blob], safeName(metadata.name), {
    type: exportMime ?? metadata.mimeType ?? blob.type ?? "application/octet-stream",
  });
}

/**
 * Import only Picker-explicit files. A selected folder is expanded one level
 * through Drive's `parents` query; TutorMonkey never searches arbitrary Drive.
 */
export async function importSelectedDrivePicks(options: {
  token: string;
  picks: GoogleDrivePick[];
  workspaceId: string;
  userId: string;
  supabase: SupabaseClient;
}): Promise<DriveImportOutcome> {
  const selected = (await Promise.all(options.picks.map(async (pick) => {
    if (pick.kind === "folder") return listSelectedFolder(options.token, pick);
    return [await getMetadata(options.token, pick)];
  }))).flat();
  const unique = selected.filter((file, index, all) => all.findIndex((other) => other.id === file.id) === index);
  const existing = await options.supabase
    .from("materials")
    .select("provenance")
    .eq("workspace_id", options.workspaceId)
    .limit(500);
  const existingIds = new Set(
    (existing.data ?? []).map((row) => (row.provenance as { drive_file_id?: unknown } | null)?.drive_file_id).filter((id): id is string => typeof id === "string"),
  );
  const outcome: DriveImportOutcome = { imported: [], skipped: [], failed: [] };

  for (const metadata of unique) {
    if (existingIds.has(metadata.id)) {
      outcome.skipped.push(metadata.name);
      continue;
    }
    try {
      const file = await downloadDriveFile(options.token, metadata);
      const path = buildMaterialObjectPath(options.workspaceId, file.name);
      const mimeType = resolveMaterialMimeType(file);
      const upload = await options.supabase.storage.from(TEACHERS_MATERIALS_BUCKET).upload(path, file, {
        contentType: mimeType,
        upsert: false,
        cacheControl: "3600",
      });
      if (upload.error) throw upload.error;
      const inserted = await options.supabase.from("materials").insert({
        workspace_id: options.workspaceId,
        source_type: "google_drive",
        original_filename: file.name,
        storage_path: path,
        mime_type: mimeType,
        byte_size: file.size,
        status: "uploaded",
        provenance: {
          uploaded_by: options.userId,
          drive_file_id: metadata.id,
          drive_file_name: metadata.name,
          drive_mime_type: metadata.mimeType,
          drive_parents: metadata.parents ?? [],
          folder_path: metadata.folderPath ?? [],
          imported_explicitly: true,
        },
      }).select("id").single();
      if (inserted.error || !inserted.data) {
        await options.supabase.storage.from(TEACHERS_MATERIALS_BUCKET).remove([path]);
        throw inserted.error ?? new Error("Drive material row was not created");
      }
      const extraction = await fetch(`/api/teachers/materials/${inserted.data.id}/extract`, { method: "POST" });
      if (!extraction.ok) throw new Error("Automatic extraction failed");
      outcome.imported.push(file.name);
      existingIds.add(metadata.id);
    } catch {
      outcome.failed.push(metadata.name);
    }
  }
  return outcome;
}

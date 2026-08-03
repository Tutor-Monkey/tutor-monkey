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
  const visited = new Set<string>();
  const files: DriveMetadata[] = [];

  async function walk(folderId: string, folderPath: string[], depth: number): Promise<void> {
    if (visited.has(folderId) || depth > 8 || files.length >= 500) return;
    visited.add(folderId);
    let pageToken = "";
    do {
      const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      const fields = encodeURIComponent("nextPageToken,files(id,name,mimeType,size,parents)");
      const page = await driveRequest<DriveListResponse>(token, `${DRIVE_API}/files?q=${query}&pageSize=100&orderBy=name&fields=${fields}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      for (const file of page.files ?? []) {
        if (files.length >= 500) break;
        if (file.mimeType === DRIVE_FOLDER_MIME) {
          await walk(file.id, [...folderPath, file.name], depth + 1);
        } else {
          files.push({ ...file, folderPath });
        }
      }
      pageToken = page.nextPageToken ?? "";
    } while (pageToken && files.length < 500);
  }

  await walk(folder.id, [folder.name], 0);
  return files;
}

async function getMetadata(token: string, pick: GoogleDrivePick): Promise<DriveMetadata> {
  const fields = encodeURIComponent("id,name,mimeType,size,parents");
  return driveRequest<DriveMetadata>(token, `${DRIVE_API}/files/${encodeURIComponent(pick.id)}?fields=${fields}`);
}

function driveStorageMime(metadata: DriveMetadata): string {
  return EXPORT_MIME[metadata.mimeType] ?? metadata.mimeType ?? "application/octet-stream";
}

async function getDriveMetadataById(token: string, id: string): Promise<DriveMetadata> {
  const fields = encodeURIComponent("id,name,mimeType,size,parents");
  return driveRequest<DriveMetadata>(token, `${DRIVE_API}/files/${encodeURIComponent(id)}?fields=${fields}`);
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

/** Download one explicitly selected/used Drive file into private Storage. */
export async function hydrateDriveMaterial(options: {
  token: string;
  materialId: string;
  workspaceId: string;
  supabase: SupabaseClient;
}): Promise<boolean> {
  const row = await options.supabase
    .from("materials")
    .select("id, original_filename, storage_path, provenance")
    .eq("id", options.materialId)
    .eq("workspace_id", options.workspaceId)
    .maybeSingle();
  if (row.error || !row.data) return false;
  const provenance = (row.data.provenance ?? {}) as { drive_file_id?: unknown };
  if (typeof provenance.drive_file_id !== "string") return false;
  if (row.data.storage_path) {
    const extraction = await fetch(`/api/teachers/materials/${row.data.id}/extract`, { method: "POST" });
    return extraction.ok || extraction.status === 409;
  }
  const metadata = await getDriveMetadataById(options.token, provenance.drive_file_id);
  const file = await downloadDriveFile(options.token, metadata);
  const path = buildMaterialObjectPath(options.workspaceId, file.name);
  const upload = await options.supabase.storage.from(TEACHERS_MATERIALS_BUCKET).upload(path, file, { contentType: resolveMaterialMimeType(file), upsert: false, cacheControl: "3600" });
  if (upload.error) return false;
  const update = await options.supabase.from("materials").update({ storage_path: path, mime_type: resolveMaterialMimeType(file), byte_size: file.size }).eq("id", row.data.id).eq("workspace_id", options.workspaceId);
  if (update.error) {
    await options.supabase.storage.from(TEACHERS_MATERIALS_BUCKET).remove([path]);
    return false;
  }
  const extraction = await fetch(`/api/teachers/materials/${row.data.id}/extract`, { method: "POST" });
  return extraction.ok || extraction.status === 409;
}

async function ensureWorkspaceFolderPaths(options: {
  workspaceId: string;
  paths: string[][];
  supabase: SupabaseClient;
}): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const existing = await options.supabase
    .from("workspace_folders")
    .select("id, parent_id, name")
    .eq("workspace_id", options.workspaceId);
  if (existing.error) return result;

  for (const row of existing.data ?? []) {
    result.set(`${row.parent_id ?? "root"}/${row.name}`, row.id as string);
  }

  const paths = Array.from(new Set(options.paths.map((path) => path.filter((segment) => segment.trim() !== "").join("/")).values()))
    .map((path) => path.split("/"));
  for (const path of paths) {
    let parentId: string | null = null;
    for (const name of path) {
      const key = `${parentId ?? "root"}/${name}`;
      let id = result.get(key);
      if (!id) {
        const inserted = await options.supabase
          .from("workspace_folders")
          .insert({ workspace_id: options.workspaceId, parent_id: parentId, name })
          .select("id")
          .single();
        if (inserted.error || !inserted.data) break;
        id = inserted.data.id as string;
        result.set(key, id);
      }
      parentId = id;
    }
  }
  return result;
}


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
    .select("id, provenance")
    .eq("workspace_id", options.workspaceId)
    .limit(500);
  const existingRows = existing.data ?? [];
  const existingIds = new Set(
    existingRows.map((row) => (row.provenance as { drive_file_id?: unknown } | null)?.drive_file_id).filter((id): id is string => typeof id === "string"),
  );
  const outcome: DriveImportOutcome = { imported: [], skipped: [], failed: [] };

  const folderPaths = options.picks
    .filter((pick) => pick.kind === "folder")
    .map((pick) => [pick.name]);
  for (const metadata of unique) {
    if (metadata.folderPath && metadata.folderPath.length > 0) {
      for (let index = 1; index <= metadata.folderPath.length; index += 1) {
        folderPaths.push(metadata.folderPath.slice(0, index));
      }
    }
  }
  const folderIds = await ensureWorkspaceFolderPaths({ workspaceId: options.workspaceId, paths: folderPaths, supabase: options.supabase });
  const folderIdForPath = (path: string[] | undefined): string | null => {
    if (!path || path.length === 0) return null;
    let parentId: string | null = null;
    for (const name of path) {
      const id = folderIds.get(`${parentId ?? "root"}/${name}`);
      if (!id) return null;
      parentId = id;
    }
    return parentId;
  };

  for (const metadata of unique) {
    if (existingIds.has(metadata.id)) {
      const existingRow = existingRows.find((row) => (row.provenance as { drive_file_id?: unknown } | null)?.drive_file_id === metadata.id);
      const existingProvenance = (existingRow?.provenance ?? {}) as Record<string, unknown>;
      if (existingRow && metadata.folderPath && metadata.folderPath.length > 0) {
        const nextProvenance = { ...existingProvenance, folder_path: metadata.folderPath };
        await options.supabase.from("materials").update({ provenance: nextProvenance, folder_id: folderIdForPath(metadata.folderPath) }).eq("id", existingRow.id).eq("workspace_id", options.workspaceId);
      }
      outcome.skipped.push(metadata.name);
      continue;
    }
    try {
      const filename = safeName(metadata.name);
      const mimeType = driveStorageMime(metadata);
      const inserted = await options.supabase.from("materials").insert({
        workspace_id: options.workspaceId,
        folder_id: folderIdForPath(metadata.folderPath),
        source_type: "google_drive",
        original_filename: filename,
        storage_path: null,
        mime_type: mimeType,
        byte_size: metadata.size ? Number(metadata.size) : null,
        status: "uploaded",
        provenance: {
          uploaded_by: options.userId,
          drive_file_id: metadata.id,
          drive_file_name: metadata.name,
          drive_mime_type: metadata.mimeType,
          drive_parents: metadata.parents ?? [],
          folder_path: metadata.folderPath ?? [],
          imported_explicitly: true,
          lazy_content: true,
        },
      }).select("id").single();
      if (inserted.error || !inserted.data) throw inserted.error ?? new Error("Drive material row was not created");
      outcome.imported.push(filename);
      existingIds.add(metadata.id);
    } catch {
      outcome.failed.push(metadata.name);
    }
  }
  return outcome;
}

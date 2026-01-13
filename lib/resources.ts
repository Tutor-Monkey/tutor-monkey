import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ResourceFolder, ResourceLink } from "@/types/resources";

let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdminClient() {
  if (supabaseAdmin) return supabaseAdmin;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" })
    }
  });

  return supabaseAdmin;
}

export async function readResources(): Promise<ResourceFolder[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("resource_folders")
    .select(
      `
        id,
        title,
        default_open,
        position,
        resources:resources (
          id,
          title,
          description,
          position,
          links:resource_links (
            id,
            label,
            url,
            gtm_label,
            anchor_id,
            position
          )
        )
      `
    );

  if (error) {
    console.error("Failed to read resources from Supabase", error);
    throw new Error("Unable to load resources");
  }

  // Normalize and sort using the optional position fields. If position is absent, fall back to alphabetical order.
  const normalized = (data ?? []).map((folder) => ({
    id: folder.id,
    title: folder.title,
    defaultOpen: folder.default_open ?? undefined,
    position: typeof folder.position === "number" ? folder.position : undefined,
    resources:
      (folder.resources ?? [])
        .map((resource) => ({
          id: resource.id,
          title: resource.title,
          description: resource.description ?? "",
          position: typeof resource.position === "number" ? resource.position : undefined,
          links:
            (resource.links ?? []).map((link) => {
              const normalizedLink = normalizeLink(folder.title, resource.title, {
                label: link.label,
                url: link.url,
                id: link.anchor_id ?? link.id,
                gtmLabel: link.gtm_label ?? undefined
              });
              return {
                ...normalizedLink,
                position: typeof link.position === "number" ? link.position : undefined
              };
            })
        }))
        .sort((a, b) => {
          if (typeof a.position === "number" && typeof b.position === "number") return a.position - b.position;
          return a.title.localeCompare(b.title);
        })
  }))
  .sort((a, b) => {
    if (typeof a.position === "number" && typeof b.position === "number") return a.position - b.position;
    return a.title.localeCompare(b.title);
  });

  return normalized;
}

export function generateLinkId(folder: string, resourceTitle: string, label: string) {
  return slugify(`${folder}-${resourceTitle}-${label}-link`);
}

// reorder helper: accepts arrays of ids and writes position values to DB
export async function reorder(input: {
  folders?: string[];
  resources?: Array<{ folderId: string; resourceIds: string[] }>;
  links?: Array<{ resourceId: string; linkIds: string[] }>;
}) {
  const supabase = getSupabaseAdminClient();
  const updates: Promise<unknown>[] = [];

  if (input.folders) {
    input.folders.forEach((id, idx) => {
      updates.push((async () => await supabase.from("resource_folders").update({ position: idx + 1 }).eq("id", id).select())());
    });
  }

  if (input.resources) {
    input.resources.forEach((group) => {
      group.resourceIds.forEach((id, idx) => {
        updates.push((async () => await supabase.from("resources").update({ position: idx + 1 }).eq("id", id).select())());
      });
    });
  }

  if (input.links) {
    input.links.forEach((group) => {
      group.linkIds.forEach((id, idx) => {
        updates.push((async () => await supabase.from("resource_links").update({ position: idx + 1 }).eq("id", id).select())());
      });
    });
  }

  // Run updates in parallel and throw if any error occurs
  const results = await Promise.all(updates);
  interface SupabaseResult { error?: unknown | null }
  for (const res of results) {
    const r = res as SupabaseResult | undefined | null;
    if (r?.error) {
      throw r.error;
    }
  }

  return readResources();
}

export function generateGtmLabel(folder: string, resourceTitle: string, label: string) {
  return `${folder} ${resourceTitle} ${label}`.trim();
}

export function normalizeLink(
  folder: string,
  resourceTitle: string,
  link: { label: string; url: string; id?: string | null; gtmLabel?: string | null; position?: number }
): ResourceLink {
  const label = link.label.trim();
  const url = link.url.trim();
  return {
    label,
    url,
    id: (link.id ?? generateLinkId(folder, resourceTitle, label)).trim(),
    gtmLabel: (link.gtmLabel ?? generateGtmLabel(folder, resourceTitle, label)).trim(),
    position: typeof link.position === "number" ? link.position : undefined
  };
}

export async function addResourceToSupabase(input: {
  folderTitle: string;
  createFolder: boolean;
  defaultOpen?: boolean;
  resource: {
    title: string;
    description: string;
    links: Array<{ label: string; url: string; id?: string; gtmLabel?: string }>;
  };
}) {
  const supabase = getSupabaseAdminClient();

  const folderTitle = input.folderTitle.trim();
  const resourceTitle = input.resource.title.trim();

  const { data: existingFolder, error: folderFetchError } = await supabase
    .from("resource_folders")
    .select("id")
    .eq("title", folderTitle)
    .maybeSingle();

  if (folderFetchError && folderFetchError.code !== "PGRST116") {
    throw folderFetchError;
  }

  let folderId = existingFolder?.id as string | undefined;

  if (!folderId) {
    if (!input.createFolder) {
      throw new Error("Folder not found");
    }

    // Determine next position for new folder
    const { data: lastFolder } = await supabase
      .from("resource_folders")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextFolderPosition = (lastFolder?.position ?? 0) + 1;

    const { data: newFolder, error: createFolderError } = await supabase
      .from("resource_folders")
      .insert({
        title: folderTitle,
        default_open: input.defaultOpen ?? false,
        position: nextFolderPosition
      })
      .select("id")
      .single();

    if (createFolderError) {
      throw createFolderError;
    }

    folderId = newFolder.id;
  }

  // Determine next position for resource inside its folder
  const { data: lastResource } = await supabase
    .from("resources")
    .select("position")
    .eq("folder_id", folderId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextResourcePosition = (lastResource?.position ?? 0) + 1;

  const { data: newResource, error: resourceInsertError } = await supabase
    .from("resources")
    .insert({
      folder_id: folderId,
      title: resourceTitle,
      description: input.resource.description.trim(),
      position: nextResourcePosition
    })
    .select("id")
    .single();

  if (resourceInsertError) {
    throw resourceInsertError;
  }

  const normalizedLinks = input.resource.links.map((link, idx) => {
    const l = normalizeLink(folderTitle, resourceTitle, link);
    return { ...l, position: idx + 1 };
  });

  const { error: linkInsertError } = await supabase.from("resource_links").insert(
    normalizedLinks.map((link) => ({
      resource_id: newResource.id,
      label: link.label,
      url: link.url,
      gtm_label: link.gtmLabel,
      anchor_id: link.id,
      position: link.position
    }))
  );

  if (linkInsertError) {
    throw linkInsertError;
  }

  return readResources();
}

export async function updateResourceInSupabase(input: {
  resourceId: string;
  folderTitle: string;
  createFolder: boolean;
  defaultOpen?: boolean;
  resource: {
    title: string;
    description: string;
    links: Array<{ label: string; url: string; id?: string; gtmLabel?: string }>;
  };
}) {
  const supabase = getSupabaseAdminClient();

  const folderTitle = input.folderTitle.trim();
  const resourceTitle = input.resource.title.trim();

  // Select existing resource with position and folder information
  const { data: existingResource, error: existingResourceError } = await supabase
    .from("resources")
    .select("id, folder_id, position")
    .eq("id", input.resourceId)
    .maybeSingle();

  if (existingResourceError) {
    throw existingResourceError;
  }

  if (!existingResource) {
    throw new Error("Resource not found");
  }

  const { data: existingFolder, error: folderFetchError } = await supabase
    .from("resource_folders")
    .select("id")
    .eq("title", folderTitle)
    .maybeSingle();

  if (folderFetchError && folderFetchError.code !== "PGRST116") {
    throw folderFetchError;
  }

  let folderId = existingFolder?.id as string | undefined;

  if (!folderId) {
    if (!input.createFolder) {
      throw new Error("Folder not found");
    }

    // Determine next position for new folder
    const { data: lastFolder } = await supabase
      .from("resource_folders")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextFolderPosition = (lastFolder?.position ?? 0) + 1;

    const { data: newFolder, error: createFolderError } = await supabase
      .from("resource_folders")
      .insert({
        title: folderTitle,
        default_open: input.defaultOpen ?? false,
        position: nextFolderPosition
      })
      .select("id")
      .single();

    if (createFolderError) {
      throw createFolderError;
    }

    folderId = newFolder.id;
  }

  // If folder changed, move the resource to the end of the new folder
  const updatedFields: Record<string, unknown> = {
    folder_id: folderId,
    title: resourceTitle,
    description: input.resource.description.trim()
  };

  if (existingResource.folder_id !== folderId) {
    const { data: lastResource } = await supabase
      .from("resources")
      .select("position")
      .eq("folder_id", folderId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextResourcePosition = (lastResource?.position ?? 0) + 1;
    (updatedFields as Record<string, unknown>).position = nextResourcePosition;
  }

  const { error: resourceUpdateError } = await supabase
    .from("resources")
    .update(updatedFields)
    .eq("id", input.resourceId);

  if (resourceUpdateError) {
    throw resourceUpdateError;
  }

  const { error: deleteLinksError } = await supabase
    .from("resource_links")
    .delete()
    .eq("resource_id", input.resourceId);

  if (deleteLinksError) {
    throw deleteLinksError;
  }

  const normalizedLinks = input.resource.links.map((link, idx) => {
    const l = normalizeLink(folderTitle, resourceTitle, link);
    return { ...l, position: idx + 1 };
  });

  if (normalizedLinks.length > 0) {
    const { error: linkInsertError } = await supabase.from("resource_links").insert(
      normalizedLinks.map((link) => ({
        resource_id: input.resourceId,
        label: link.label,
        url: link.url,
        gtm_label: link.gtmLabel,
        anchor_id: link.id,
        position: link.position
      }))
    );

    if (linkInsertError) {
      throw linkInsertError;
    }
  }

  return readResources();
}

export async function deleteResourceFromSupabase(resourceId: string) {
  const supabase = getSupabaseAdminClient();

  const { data: resource, error: resourceFetchError } = await supabase
    .from("resources")
    .select("id")
    .eq("id", resourceId)
    .maybeSingle();

  if (resourceFetchError) {
    throw resourceFetchError;
  }

  if (!resource) {
    throw new Error("Resource not found");
  }

  const { error: deleteError } = await supabase.from("resources").delete().eq("id", resourceId);

  if (deleteError) {
    throw deleteError;
  }

  return readResources();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

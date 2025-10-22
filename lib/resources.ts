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
        resources:resources (
          id,
          title,
          description,
          links:resource_links (
            id,
            label,
            url,
            gtm_label,
            anchor_id
          )
        )
      `
    )
    .order("title", { ascending: true })
    .order("title", { foreignTable: "resources", ascending: true })
    .order("label", { foreignTable: "resources.resource_links", ascending: true });

  if (error) {
    console.error("Failed to read resources from Supabase", error);
    throw new Error("Unable to load resources");
  }

  return (data ?? []).map((folder) => ({
    id: folder.id,
    title: folder.title,
    defaultOpen: folder.default_open ?? undefined,
    resources:
      folder.resources?.map((resource) => ({
        id: resource.id,
        title: resource.title,
        description: resource.description ?? "",
        links:
          resource.links?.map((link) =>
            normalizeLink(folder.title, resource.title, {
              label: link.label,
              url: link.url,
              id: link.anchor_id ?? link.id,
              gtmLabel: link.gtm_label ?? undefined
            })
          ) ?? []
      })) ?? []
  }));
}

export function generateLinkId(folder: string, resourceTitle: string, label: string) {
  return slugify(`${folder}-${resourceTitle}-${label}-link`);
}

export function generateGtmLabel(folder: string, resourceTitle: string, label: string) {
  return `${folder} ${resourceTitle} ${label}`.trim();
}

export function normalizeLink(
  folder: string,
  resourceTitle: string,
  link: { label: string; url: string; id?: string | null; gtmLabel?: string | null }
): ResourceLink {
  const label = link.label.trim();
  const url = link.url.trim();
  return {
    label,
    url,
    id: (link.id ?? generateLinkId(folder, resourceTitle, label)).trim(),
    gtmLabel: (link.gtmLabel ?? generateGtmLabel(folder, resourceTitle, label)).trim()
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

    const { data: newFolder, error: createFolderError } = await supabase
      .from("resource_folders")
      .insert({
        title: folderTitle,
        default_open: input.defaultOpen ?? false
      })
      .select("id")
      .single();

    if (createFolderError) {
      throw createFolderError;
    }

    folderId = newFolder.id;
  }

  const { data: newResource, error: resourceInsertError } = await supabase
    .from("resources")
    .insert({
      folder_id: folderId,
      title: resourceTitle,
      description: input.resource.description.trim()
    })
    .select("id")
    .single();

  if (resourceInsertError) {
    throw resourceInsertError;
  }

  const normalizedLinks = input.resource.links.map((link) =>
    normalizeLink(folderTitle, resourceTitle, link)
  );

  const { error: linkInsertError } = await supabase.from("resource_links").insert(
    normalizedLinks.map((link) => ({
      resource_id: newResource.id,
      label: link.label,
      url: link.url,
      gtm_label: link.gtmLabel,
      anchor_id: link.id
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

  const { data: existingResource, error: existingResourceError } = await supabase
    .from("resources")
    .select("id")
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

    const { data: newFolder, error: createFolderError } = await supabase
      .from("resource_folders")
      .insert({
        title: folderTitle,
        default_open: input.defaultOpen ?? false
      })
      .select("id")
      .single();

    if (createFolderError) {
      throw createFolderError;
    }

    folderId = newFolder.id;
  }

  const { error: resourceUpdateError } = await supabase
    .from("resources")
    .update({
      folder_id: folderId,
      title: resourceTitle,
      description: input.resource.description.trim()
    })
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

  const normalizedLinks = input.resource.links.map((link) =>
    normalizeLink(folderTitle, resourceTitle, link)
  );

  if (normalizedLinks.length > 0) {
    const { error: linkInsertError } = await supabase.from("resource_links").insert(
      normalizedLinks.map((link) => ({
        resource_id: input.resourceId,
        label: link.label,
        url: link.url,
        gtm_label: link.gtmLabel,
        anchor_id: link.id
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

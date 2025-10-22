import { NextRequest, NextResponse } from "next/server";
import {
  addResourceToSupabase,
  deleteResourceFromSupabase,
  readResources,
  updateResourceInSupabase
} from "@/lib/resources";

const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN;

export async function GET() {
  const resources = await readResources();
  return NextResponse.json({ resources });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as AdminAddResourcePayload;
  if (payload.action !== "addResource") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const {
    folderTitle,
    createFolder,
    resource,
    newFolderTitle,
    defaultOpen
  } = payload;

  const targetTitle = (createFolder ? newFolderTitle : folderTitle)?.trim();
  if (!targetTitle) {
    return NextResponse.json({ error: "Folder title is required" }, { status: 400 });
  }

  if (!isResourceValid(resource)) {
    return NextResponse.json({ error: "Invalid resource payload" }, { status: 400 });
  }

  const validLinks = sanitizeLinks(resource.links);
  if (validLinks.length === 0) {
    return NextResponse.json({ error: "At least one link is required" }, { status: 400 });
  }

  try {
    const resources = await addResourceToSupabase({
      folderTitle: targetTitle,
      createFolder: Boolean(createFolder),
      defaultOpen,
      resource: {
        title: resource.title.trim(),
        description: resource.description.trim(),
        links: validLinks
      }
    });

    return NextResponse.json({ success: true, resources }, { status: 201 });
  } catch (error) {
    console.error("Failed to add resource", error);
    return NextResponse.json({ error: "Failed to save resource" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as AdminUpdateResourcePayload;
  if (payload.action !== "updateResource") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const {
    resourceId,
    folderTitle,
    createFolder,
    resource,
    newFolderTitle,
    defaultOpen
  } = payload;

  if (!resourceId?.trim()) {
    return NextResponse.json({ error: "Resource id is required" }, { status: 400 });
  }

  const targetTitle = (createFolder ? newFolderTitle : folderTitle)?.trim();
  if (!targetTitle) {
    return NextResponse.json({ error: "Folder title is required" }, { status: 400 });
  }

  if (!isResourceValid(resource)) {
    return NextResponse.json({ error: "Invalid resource payload" }, { status: 400 });
  }

  const validLinks = sanitizeLinks(resource.links);
  if (validLinks.length === 0) {
    return NextResponse.json({ error: "At least one link is required" }, { status: 400 });
  }

  try {
    const resources = await updateResourceInSupabase({
      resourceId: resourceId.trim(),
      folderTitle: targetTitle,
      createFolder: Boolean(createFolder),
      defaultOpen,
      resource: {
        title: resource.title.trim(),
        description: resource.description.trim(),
        links: validLinks
      }
    });

    return NextResponse.json({ success: true, resources }, { status: 200 });
  } catch (error) {
    console.error("Failed to update resource", error);
    return NextResponse.json({ error: "Failed to update resource" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { resourceId } = (await request.json()) as AdminDeleteResourcePayload;

  if (!resourceId?.trim()) {
    return NextResponse.json({ error: "Resource id is required" }, { status: 400 });
  }

  try {
    const resources = await deleteResourceFromSupabase(resourceId.trim());
    return NextResponse.json({ success: true, resources }, { status: 200 });
  } catch (error) {
    console.error("Failed to delete resource", error);
    return NextResponse.json({ error: "Failed to delete resource" }, { status: 500 });
  }
}

interface AdminBaseResourcePayload {
  folderTitle?: string;
  newFolderTitle?: string;
  createFolder?: boolean;
  defaultOpen?: boolean;
  resource: {
    title: string;
    description: string;
    links: Array<{ label: string; url: string; id?: string; gtmLabel?: string }>;
  };
}

interface AdminAddResourcePayload extends AdminBaseResourcePayload {
  action: "addResource";
}

interface AdminUpdateResourcePayload extends AdminBaseResourcePayload {
  action: "updateResource";
  resourceId: string;
}

interface AdminDeleteResourcePayload {
  resourceId: string;
}

function isResourceValid(resource: AdminBaseResourcePayload["resource"] | undefined): resource is AdminBaseResourcePayload["resource"] {
  if (!resource) return false;
  if (!resource.title?.trim() || !resource.description?.trim()) return false;
  if (!Array.isArray(resource.links)) return false;
  return true;
}

function sanitizeLinks(links: AdminBaseResourcePayload["resource"]["links"]) {
  return links
    .map((link) => ({
      label: link.label?.trim() ?? "",
      url: link.url?.trim() ?? ""
    }))
    .filter((link) => link.label && link.url);
}

function isAuthorized(request: NextRequest) {
  if (!ADMIN_TOKEN) {
    console.warn("ADMIN_API_TOKEN is not configured");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return token === ADMIN_TOKEN;
}

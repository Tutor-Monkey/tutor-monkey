import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/teachers/materialsComposer";
import {
  boundDriveSyncInput,
  type DriveSyncUpdateStatus,
} from "@/lib/teachers/driveSyncRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = {
  driveFileId?: unknown;
  status?: unknown;
  error?: unknown;
};

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function readBody(request: Request): Promise<Body | null> {
  try {
    const value: unknown = await request.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Body;
  } catch {
    return null;
  }
}

/**
 * Persist Drive backup metadata for a generated Material.
 *
 * The browser never sends a workspace id or a token here. The generated
 * material id is resolved through Supabase RLS, which is the membership and
 * IDOR boundary for this update.
 */
export async function POST(
  request: Request,
  { params }: { params: { generatedMaterialId: string } },
) {
  const supabase = createClient();
  if (!supabase) {
    return json({ error: "Server isn't configured for Supabase right now." }, 500);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return json({ error: "You need to sign in to save Materials." }, 401);
  }

  if (!UUID_RE.test(params.generatedMaterialId)) {
    return json({ error: "Generated Material not found." }, 404);
  }

  const body = await readBody(request);
  if (!body) {
    return json({ error: "Couldn't read the Drive sync request." }, 400);
  }

  const input = boundDriveSyncInput({
    driveFileId: body.driveFileId,
    status: body.status,
    error: body.error,
  });
  if (!input.ok) return json({ error: input.error }, 400);

  const update: {
    drive_file_id: string;
    drive_sync_status: DriveSyncUpdateStatus;
    drive_synced_at: string | null;
    drive_error: string | null;
  } = {
    drive_file_id: input.driveFileId,
    drive_sync_status: input.status,
    drive_synced_at: input.status === "synced" ? new Date().toISOString() : null,
    drive_error: input.status === "failed" ? input.error : null,
  };

  const { data, error } = await supabase
    .from("generated_materials")
    .update(update)
    .eq("id", params.generatedMaterialId)
    .select("id, drive_file_id, drive_sync_status, drive_synced_at, drive_error")
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return json(
        {
          error:
            "Drive saving isn't available yet — apply the generated Materials migration first.",
        },
        503,
      );
    }
    console.error(
      "TutorMonkey Teachers: generated Material Drive sync failed",
      params.generatedMaterialId,
      error.message,
    );
    return json({ error: "Couldn't save the Drive sync status." }, 500);
  }

  if (!data) {
    return json({ error: "Generated Material not found." }, 404);
  }

  return json({ material: data }, 200);
}

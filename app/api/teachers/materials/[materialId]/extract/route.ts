import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { TEACHERS_MATERIALS_BUCKET } from "@/lib/teachers/materials";
import {
  UnsupportedFormatError,
  extractTextFromBuffer,
} from "@/lib/teachers/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MaterialRow = {
  id: string;
  workspace_id: string;
  source_type: string;
  original_filename: string;
  storage_path: string | null;
  status: string;
  provenance: Record<string, unknown> | null;
};

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

/**
 * POST /api/teachers/materials/[materialId]/extract
 *
 * Authenticated local text extraction for an already-uploaded teacher
 * material. The whole pipeline runs in-process on the server with only the
 * user's own session:
 *
 *   1. The SSR Supabase client resolves the session from cookies.
 *   2. The material row is SELECTed through RLS — the query only ever sees
 *      rows in workspaces the caller belongs to — so a material id from
 *      another user's workspace resolves to nothing (404) instead of data.
 *      This is the IDOR guard: the id is used only to filter the caller's
 *      own RLS-visible rows, never to reach into someone else's.
 *   3. The private storage object is downloaded through the same
 *      authenticated client; storage RLS re-checks workspace membership on
 *      the object path.
 *   4. Text is extracted in-process (txt/md/docx/pdf/pptx; .doc/.ppt get an
 *      honest unsupported error). No third-party processing service is ever
 *      called and the service-role key is never used.
 *   5. Only after validation (workspace access + stored file present +
 *      downloadable) is a processing_jobs row created and the material
 *      marked "processing". Success flips the material to "ready" with the
 *      extracted text + provenance in materials.provenance; any failure
 *      leaves the job "failed" with the error recorded — we never claim
 *      complete on failure.
 */
export async function POST(
  _request: Request,
  { params }: { params: { materialId: string } },
) {
  const supabase = createClient();
  if (!supabase) {
    return json(
      { error: "Server isn't configured for Supabase right now." },
      500,
    );
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return json({ error: "You need to sign in to extract materials." }, 401);
  }

  const { materialId } = params;
  if (!UUID_RE.test(materialId)) {
    return json({ error: "Material not found." }, 404);
  }

  // RLS-scoped lookup: non-members get an empty result and an identical 404.
  const { data: material, error: materialError } = await supabase
    .from("materials")
    .select(
      "id, workspace_id, source_type, original_filename, storage_path, mime_type, status, provenance",
    )
    .eq("id", materialId)
    .maybeSingle();

  if (materialError) {
    console.error(
      "TutorMonkey Teachers: material lookup failed",
      materialId,
      materialError.message,
    );
    return json({ error: "Couldn't look up this material." }, 500);
  }
  if (!material) {
    return json({ error: "Material not found." }, 404);
  }

  if (material.source_type !== "local_upload") {
    return json(
      {
        error:
          "Only locally uploaded materials can be extracted — Google Drive imports aren't supported yet.",
      },
      400,
    );
  }
  if (!material.storage_path) {
    return json(
      { error: "This material has no stored file to extract." },
      400,
    );
  }

  // Don't pile onto an in-flight extraction for the same material.
  const { data: runningJobs } = await supabase
    .from("processing_jobs")
    .select("id")
    .eq("material_id", material.id)
    .eq("stage", "extract")
    .eq("status", "running")
    .limit(1);
  if (runningJobs && runningJobs.length > 0) {
    return json(
      {
        error:
          "Extraction is already running for this material — give it a moment.",
      },
      409,
    );
  }

  // Download through the authenticated client so storage RLS re-checks the
  // object path against this user's workspace memberships.
  const { data: blob, error: downloadError } = await supabase.storage
    .from(TEACHERS_MATERIALS_BUCKET)
    .download(material.storage_path);
  if (downloadError || !blob) {
    console.error(
      "TutorMonkey Teachers: material download failed",
      material.id,
      downloadError?.message,
    );
    return json(
      {
        error:
          "The stored file couldn't be read — it may have been removed. Try uploading it again.",
      },
      502,
    );
  }

  // Validation passed: only now persist the job and the processing status.
  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      material_id: material.id,
      stage: "extract",
      status: "running",
      attempts: 1,
    })
    .select("id")
    .single();
  if (jobError || !job) {
    console.error(
      "TutorMonkey Teachers: extract job insert failed",
      material.id,
      jobError?.message,
    );
    return json({ error: "Couldn't start extraction — please try again." }, 500);
  }

  const { error: markError } = await supabase
    .from("materials")
    .update({ status: "processing" })
    .eq("id", material.id);
  if (markError) {
    // Roll the job back so the material isn't left half-started.
    await supabase
      .from("processing_jobs")
      .update({
        status: "failed",
        error: "Couldn't mark the material as processing.",
      })
      .eq("id", job.id);
    console.error(
      "TutorMonkey Teachers: marking material processing failed",
      material.id,
      markError.message,
    );
    return json({ error: "Couldn't start extraction — please try again." }, 500);
  }

  const buffer = new Uint8Array(await blob.arrayBuffer());

  let result;
  try {
    result = await extractTextFromBuffer(material.original_filename, buffer);
  } catch (error) {
    if (!(error instanceof UnsupportedFormatError)) {
      console.error(
        "TutorMonkey Teachers: extraction failed",
        material.id,
        error,
      );
    }
    const message =
      error instanceof UnsupportedFormatError
        ? error.message
        : "Extraction hit an unexpected error — this file may be damaged.";
    await recordExtractionFailure(supabase, material, job.id, message);
    return json(
      { error: message },
      error instanceof UnsupportedFormatError ? 422 : 500,
    );
  }

  // Success: record provenance + status, then close the job. The extracted
  // text lives in provenance.extraction.text so the next pipeline stages can
  // read it without a schema change; status only becomes "ready" after text
  // was actually produced.
  const now = new Date().toISOString();
  const baseProvenance: Record<string, unknown> = {
    ...(material.provenance ?? {}),
  };
  delete baseProvenance.last_error;
  baseProvenance.extraction = {
    text: result.text,
    char_count: result.charCount,
    word_count: result.wordCount,
    extractor: "tutormonkey-local-v1",
    extracted_at: now,
    job_id: job.id,
  };

  const { error: jobDoneError } = await supabase
    .from("processing_jobs")
    .update({ status: "succeeded", error: null })
    .eq("id", job.id);
  if (jobDoneError) {
    console.error(
      "TutorMonkey Teachers: extract job completion failed",
      material.id,
      jobDoneError.message,
    );
  }

  const { error: readyError } = await supabase
    .from("materials")
    .update({ status: "ready", provenance: baseProvenance })
    .eq("id", material.id);
  if (readyError) {
    console.error(
      "TutorMonkey Teachers: marking material ready failed",
      material.id,
      readyError.message,
    );
    return json(
      {
        error:
          "Text was extracted, but saving it to your workspace failed — please retry.",
      },
      500,
    );
  }

  return json(
    {
      status: "ready",
      charCount: result.charCount,
      wordCount: result.wordCount,
      preview: result.text.slice(0, 200),
    },
    200,
  );
}

/**
 * Best-effort failure bookkeeping: material → "failed" with the honest
 * message recorded in provenance.last_error (so the UI can show it), and the
 * job → "failed" with the same message. Never claims completion.
 */
async function recordExtractionFailure(
  supabase: SupabaseClient,
  material: MaterialRow,
  jobId: string,
  message: string,
): Promise<void> {
  const baseProvenance: Record<string, unknown> = {
    ...(material.provenance ?? {}),
  };
  baseProvenance.last_error = {
    stage: "extract",
    message,
    at: new Date().toISOString(),
  };

  await supabase
    .from("materials")
    .update({ status: "failed", provenance: baseProvenance })
    .eq("id", material.id);
  await supabase
    .from("processing_jobs")
    .update({ status: "failed", error: message })
    .eq("id", jobId);
}

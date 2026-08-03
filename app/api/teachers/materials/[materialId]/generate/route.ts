import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { WorksheetProviderError } from "@/lib/teachers/server/worksheetProviderCore";
import { generateWorksheetFromText } from "@/lib/teachers/server/worksheetProvider";
import type { Worksheet } from "@/lib/teachers/worksheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MaterialRow = {
  id: string;
  workspace_id: string;
  source_type: string;
  status: string;
  provenance: Record<string, unknown> | null;
};

type GenerateResponse = {
  worksheet: Worksheet;
  provider: string;
  model: string;
  sourceCharCount: number;
  truncatedSource: boolean;
  generatedAt: string;
};

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

/**
 * POST /api/teachers/materials/[materialId]/generate
 *
 * First worksheet-generation slice: takes a material whose text was already
 * extracted (materials.provenance.extraction.text), sends the bounded text to
 * the configured OpenCode-compatible provider, validates the returned
 * worksheet, and persists it.
 *
 * Flow (mirrors the extract route's discipline):
 *   1. SSR Supabase client resolves the session from cookies; no session → 401.
 *   2. The material row is SELECTed through RLS — a material id from another
 *      user's workspace resolves to nothing (404). This is the IDOR guard.
 *   3. Requirements: local_upload, status "ready", and non-empty
 *      provenance.extraction.text. Anything else is an honest 400/422.
 *   4. A running "generate" processing_job for the same material → 409.
 *   5. A processing_jobs row (stage "generate") is created, then the provider
 *      is called with a hard timeout. The material row is NOT flipped to
 *      "processing": that status is the extraction state machine's, and the
 *      worksheet step must not make a "ready" material look half-extracted.
 *   6. The provider only resolves with a worksheet that passed
 *      validateWorksheet — and only then is it persisted to
 *      materials.provenance.worksheet (existing JSONB column + existing
 *      member-update RLS policy; no migration needed). The job is marked
 *      succeeded only after persistence. On any failure the job is marked
 *      failed and provenance.worksheet.last_error records the honest message;
 *      the route never claims success before validation + persistence.
 *
 * Security: OPENCODE_API_KEY is read server-side only; nothing here (or in
 * the provider) ever logs the key or the full source text.
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
    return json(
      { error: "You need to sign in to generate worksheets." },
      401,
    );
  }

  const { materialId } = params;
  if (!UUID_RE.test(materialId)) {
    return json({ error: "Material not found." }, 404);
  }

  // RLS-scoped lookup: non-members get an empty result and an identical 404.
  const { data: material, error: materialError } = await supabase
    .from("materials")
    .select("id, workspace_id, source_type, status, provenance")
    .eq("id", materialId)
    .maybeSingle();

  if (materialError) {
    console.error(
      "TutorMonkey Teachers: generate material lookup failed",
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
          "Only locally uploaded materials can generate worksheets yet — Google Drive imports aren't supported.",
      },
      400,
    );
  }
  if (material.status !== "ready") {
    return json(
      {
        error:
          "This material isn't ready for worksheet generation yet — extract its text first.",
      },
      422,
    );
  }

  const extractionText = readExtractionText(material.provenance);
  if (!extractionText) {
    return json(
      {
        error:
          "This material has no extracted text to generate from — run extraction first.",
      },
      422,
    );
  }

  // Don't pile onto an in-flight generation for the same material.
  const { data: runningJobs } = await supabase
    .from("processing_jobs")
    .select("id")
    .eq("material_id", material.id)
    .eq("stage", "generate")
    .eq("status", "running")
    .limit(1);
  if (runningJobs && runningJobs.length > 0) {
    return json(
      {
        error:
          "Worksheet generation is already running for this material — give it a moment.",
      },
      409,
    );
  }

  // Validation passed: only now persist the job.
  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      material_id: material.id,
      stage: "generate",
      status: "running",
      attempts: 1,
    })
    .select("id")
    .single();
  if (jobError || !job) {
    console.error(
      "TutorMonkey Teachers: generate job insert failed",
      material.id,
      jobError?.message,
    );
    return json(
      { error: "Couldn't start worksheet generation — please try again." },
      500,
    );
  }

  let result;
  try {
    result = await generateWorksheetFromText({ sourceText: extractionText });
  } catch (error) {
    if (error instanceof WorksheetProviderError) {
      // Provider errors are teacher-safe messages; log the code + material
      // id only — never the key or the source text.
      console.error(
        "TutorMonkey Teachers: worksheet generation failed",
        material.id,
        error.code,
        error.status,
      );
      const status = providerErrorStatus(error.code);
      const message =
        status === 503
          ? error.message
          : providerFacingMessage(error.code, error.message);
      await recordGenerationFailure(supabase, material, job.id, message);
      return json({ error: message }, status);
    }
    console.error(
      "TutorMonkey Teachers: worksheet generation hit an unexpected error",
      material.id,
      error,
    );
    const message =
      "Worksheet generation hit an unexpected error — please try again.";
    await recordGenerationFailure(supabase, material, job.id, message);
    return json({ error: message }, 500);
  }

  // Provider resolved: the worksheet is already validated. Persist it into
  // the existing provenance JSONB, then close the job — success is only
  // claimed after both writes land.
  const now = new Date().toISOString();
  const baseProvenance: Record<string, unknown> = {
    ...(material.provenance ?? {}),
  };
  baseProvenance.worksheet = {
    worksheet: result.worksheet,
    provider: result.provider,
    model: result.model,
    generated_at: now,
    job_id: job.id,
    source_char_count: result.sourceCharCount,
    truncated_source: result.truncatedSource,
  };

  const { error: saveError } = await supabase
    .from("materials")
    .update({ provenance: baseProvenance })
    .eq("id", material.id);
  if (saveError) {
    console.error(
      "TutorMonkey Teachers: saving generated worksheet failed",
      material.id,
      saveError.message,
    );
    await supabase
      .from("processing_jobs")
      .update({
        status: "failed",
        error: "The worksheet was generated, but saving it to your workspace failed.",
      })
      .eq("id", job.id);
    return json(
      {
        error:
          "The worksheet was generated, but saving it to your workspace failed — please retry.",
      },
      500,
    );
  }

  const { error: jobDoneError } = await supabase
    .from("processing_jobs")
    .update({ status: "succeeded", error: null })
    .eq("id", job.id);
  if (jobDoneError) {
    console.error(
      "TutorMonkey Teachers: generate job completion failed",
      material.id,
      jobDoneError.message,
    );
    return json(
      {
        error:
          "The worksheet was saved, but its processing status could not be finalized — please retry.",
      },
      500,
    );
  }

  const response: GenerateResponse = {
    worksheet: result.worksheet,
    provider: result.provider,
    model: result.model,
    sourceCharCount: result.sourceCharCount,
    truncatedSource: result.truncatedSource,
    generatedAt: now,
  };
  return json(response as unknown as Record<string, unknown>, 200);
}

/** Extract provenance.extraction.text, or null when absent/blank. */
function readExtractionText(
  provenance: Record<string, unknown> | null,
): string | null {
  const extraction = provenance?.extraction;
  if (typeof extraction !== "object" || extraction === null) return null;
  const text = (extraction as Record<string, unknown>).text;
  if (typeof text !== "string" || text.trim() === "") return null;
  return text;
}

function providerErrorStatus(code: WorksheetProviderError["code"]): number {
  switch (code) {
    case "MISSING_CONFIGURATION":
    case "MISSING_API_KEY":
      return 503;
    case "TIMEOUT":
      return 504;
    case "RATE_LIMITED":
      return 429;
    case "INVALID_RESPONSE":
    case "UPSTREAM_ERROR":
    case "NETWORK_ERROR":
      return 502;
  }
}

/**
 * Teacher-facing copy per failure mode. MISSING_CONFIGURATION and
 * MISSING_API_KEY keep the developer instruction verbatim (they tell the
 * developer what to configure without exposing any value); everything else
 * is a retry-friendly generic.
 */
function providerFacingMessage(
  code: WorksheetProviderError["code"],
  providerMessage: string,
): string {
  if (code === "TIMEOUT") {
    return "Worksheet generation timed out — the material may be too long. Try again.";
  }
  if (code === "RATE_LIMITED") {
    return "Worksheet generation is busy right now — try again in a moment.";
  }
  if (code === "INVALID_RESPONSE") {
    return "The worksheet provider returned something we couldn't validate — try again.";
  }
  if (code === "MISSING_CONFIGURATION" || code === "MISSING_API_KEY") {
    return providerMessage;
  }
  return "Worksheet generation couldn't be completed — please try again.";
}

/**
 * Best-effort failure bookkeeping: provenance.worksheet.last_error records
 * the honest message (material status stays "ready" — extraction is still
 * fine), and the job is marked failed. Never claims completion.
 */
async function recordGenerationFailure(
  supabase: SupabaseClient,
  material: MaterialRow,
  jobId: string,
  message: string,
): Promise<void> {
  const baseProvenance: Record<string, unknown> = {
    ...(material.provenance ?? {}),
  };
  const existingBlock =
    typeof baseProvenance.worksheet === "object" &&
    baseProvenance.worksheet !== null
      ? (baseProvenance.worksheet as Record<string, unknown>)
      : {};
  baseProvenance.worksheet = {
    ...existingBlock,
    last_error: {
      stage: "generate",
      message,
      at: new Date().toISOString(),
    },
  };

  await supabase
    .from("materials")
    .update({ provenance: baseProvenance })
    .eq("id", material.id);
  await supabase
    .from("processing_jobs")
    .update({ status: "failed", error: message })
    .eq("id", jobId);
}

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { WorksheetProviderError } from "@/lib/teachers/server/worksheetProviderCore";
import { generateWorksheetFromText } from "@/lib/teachers/server/worksheetProvider";
import { isMissingTableError } from "@/lib/teachers/materialsComposer";
import {
  boundConfirmedMaterialIds,
  boundMaterialIds,
  boundTeacherPrompt,
} from "@/lib/teachers/generateRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GenerateRequestBody = {
  prompt?: unknown;
  materialIds?: unknown;
  confirmedMaterialIds?: unknown;
};

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

/**
 * POST /api/teachers/workspaces/[workspaceId]/generate
 *
 * Multi-source worksheet generation for the Materials composer: the teacher
 * picks up to 12 documents from explicit `@` mentions plus workspace-ranked
 * source discovery and queues generation after server-side validation.
 *
 * Guardrails, mirroring the per-material route's discipline:
 *   1. SSR session → 401; strict workspace UUID → 404.
 *   2. Input bounds are enforced BEFORE any provider call: prompt non-blank
 *      and bounded, materialIds strict UUIDs and 1..12, confirmedMaterialIds
 *      a bounded subset of materialIds.
 *   3. If generated_materials doesn't exist yet (migration 20260802020000
 *      not applied) the route answers 503 with a migration-pending message
 *      BEFORE calling the provider — a teacher is never billed for a
 *      generation that can't be saved.
 *   4. Source materials are SELECTed through RLS scoped to the workspace;
 *      a requested id from another workspace simply doesn't resolve. Every
 *      requested id must resolve (404 otherwise), be "ready" (422), and
 *      carry extracted text in provenance.extraction.text (422).
 *   5. A running "generate" job on any source material → 409, so two
 *      composer runs can't double-bill the same document at once.
 *   6. A processing_jobs row (stage "generate") is created best-effort for
 *      the first source document; job bookkeeping NEVER hides a real error
 *      — if the insert fails, generation proceeds without it, and a
 *      provider/persist failure is always surfaced regardless.
 *   7. The provider only resolves with a validated worksheet; only then is
 *      the canonical generated_materials row inserted. The job is marked
 *      succeeded only after that insert lands. If the job-finalize update
 *      itself fails, the material is already saved and the route still
 *      reports success — bookkeeping must not turn a real success into a
 *      client-visible failure (or a duplicate retry).
 *
 * Security: the provider key and the extracted source text never leave the
 * server. Responses carry the validated worksheet only; error messages are
 * static, teacher-safe strings.
 */
export async function POST(
  request: Request,
  { params }: { params: { workspaceId: string } },
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

  const { workspaceId } = params;
  if (!UUID_RE.test(workspaceId)) {
    return json({ error: "Workspace not found." }, 404);
  }

  const body = await readJsonBody(request);
  if (!body) {
    return json(
      { error: "Couldn't read the request body — please try again." },
      400,
    );
  }

  const prompt = boundTeacherPrompt(body.prompt);
  if (!prompt.ok) return json({ error: prompt.error }, 400);

  const materialIds = boundMaterialIds(body.materialIds);
  if (!materialIds.ok) return json({ error: materialIds.error }, 400);

  // Informational only (which sources the teacher explicitly confirmed vs.
  // auto-suggested): validated for shape, not used for generation.
  const confirmed = boundConfirmedMaterialIds(
    body.confirmedMaterialIds,
    materialIds.ids,
  );
  if (!confirmed.ok) return json({ error: confirmed.error }, 400);

  // Migration gate BEFORE the provider call: never bill for a generation
  // that can't be persisted.
  const { error: probeError } = await supabase
    .from("generated_materials")
    .select("id")
    .limit(1);
  if (probeError && isMissingTableError(probeError)) {
    return json(
      {
        error:
          "Worksheet generation isn't available yet — the Teachers database migration that adds generated materials hasn't been applied to this project.",
      },
      503,
    );
  }

  // RLS-scoped lookup: non-members resolve zero rows, so foreign ids 404.
  const { data: materials, error: materialsError } = await supabase
    .from("materials")
    .select(
      "id, workspace_id, original_filename, source_type, status, provenance",
    )
    .in("id", materialIds.ids)
    .eq("workspace_id", workspaceId);

  if (materialsError) {
    console.error(
      "TutorMonkey Teachers: workspace generate material lookup failed",
      workspaceId,
      materialsError.message,
    );
    return json({ error: "Couldn't look up the selected documents." }, 500);
  }

  // Require exact IDs: every requested material must resolve in THIS
  // workspace. Anything less means a stale/foreign selection.
  const found = new Set((materials ?? []).map((material) => material.id));
  const missing = materialIds.ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    return json(
      { error: "One or more of the selected documents couldn't be found." },
      404,
    );
  }

  const notReady = (materials ?? []).filter(
    (material) => material.status !== "ready",
  );
  if (notReady.length > 0) {
    return json(
      {
        error:
          "One or more of the selected documents isn't ready yet — extract its text first.",
      },
      422,
    );
  }

  const sources: { label: string; text: string }[] = [];
  for (const material of materials ?? []) {
    const text = readExtractionText(material.provenance);
    if (!text) {
      return json(
        {
          error:
            "One or more of the selected documents has no extracted text to generate from — run extraction first.",
        },
        422,
      );
    }
    sources.push({ label: material.original_filename, text });
  }

  // Don't pile onto an in-flight generation touching the same documents.
  const { data: runningJobs } = await supabase
    .from("processing_jobs")
    .select("id")
    .in("material_id", materialIds.ids)
    .eq("stage", "generate")
    .eq("status", "running")
    .limit(1);
  if (runningJobs && runningJobs.length > 0) {
    return json(
      {
        error:
          "Worksheet generation is already running for one of these documents — give it a moment.",
      },
      409,
    );
  }

  // A generation job is durable bookkeeping, not an optional side effect:
  // the server must have a job id before it can acknowledge the request.
  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      material_id: materialIds.ids[0],
      stage: "generate",
      status: "running",
      attempts: 1,
    })
    .select("id")
    .single();
  if (jobError || !job) {
    console.error(
      "TutorMonkey Teachers: workspace generate job insert failed",
      workspaceId,
      jobError?.message,
    );
    return json(
      { error: "Couldn't start worksheet generation — please try again." },
      500,
    );
  }

  // Acknowledge only after the durable job exists. The server continues this
  // task independently of the browser tab; the Materials view can poll the
  // job and generated_materials row after reconnecting.
  void completeGeneration({
    supabase,
    workspaceId,
    materialIds: materialIds.ids,
    prompt: prompt.prompt,
    sources,
    jobId: job.id,
  });
  return json({ jobId: job.id, status: "running" }, 202);
}

type CompleteGenerationOptions = {
  supabase: SupabaseClient;
  workspaceId: string;
  materialIds: string[];
  prompt: string;
  sources: { label: string; text: string }[];
  jobId: string;
};

async function completeGeneration({
  supabase,
  workspaceId,
  materialIds,
  prompt,
  sources,
  jobId,
}: CompleteGenerationOptions): Promise<void> {
  try {
    const result = await generateWorksheetFromText({
      sources,
      teacherPrompt: prompt,
    });
    const { data: generated, error: saveError } = await supabase
      .from("generated_materials")
      .insert({
        workspace_id: workspaceId,
        title: result.worksheet.title,
        material_type: "worksheet",
        content: result.worksheet,
        source_document_ids: materialIds,
        provider: result.provider,
        model: result.model,
        generation_job_id: jobId,
      })
      .select("id, created_at")
      .single();

    if (saveError || !generated) {
      const message = saveError && isMissingTableError(saveError)
        ? "Worksheet generation isn't available yet — the Teachers database migration hasn't been applied to this project."
        : "The worksheet was generated, but saving it to your workspace failed.";
      await markJobFailed(supabase, jobId, message);
      return;
    }

    const { error: jobDoneError } = await supabase
      .from("processing_jobs")
      .update({ status: "succeeded", error: null })
      .eq("id", jobId);
    if (jobDoneError) {
      console.error("TutorMonkey Teachers: generation job completion update failed", jobId, jobDoneError.message);
    }
  } catch (error) {
    const message = error instanceof WorksheetProviderError
      ? (providerErrorStatus(error.code) === 503 ? error.message : providerFacingMessage(error.code, error.message))
      : "Worksheet generation hit an unexpected error — please try again.";
    console.error("TutorMonkey Teachers: background worksheet generation failed", workspaceId, error instanceof WorksheetProviderError ? error.code : error);
    await markJobFailed(supabase, jobId, message);
  }
}

/** Parse the request body as JSON; null when unreadable or not an object. */
async function readJsonBody(request: Request): Promise<GenerateRequestBody | null> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as GenerateRequestBody;
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

/** Teacher-facing copy per failure mode (same mapping as the per-material route). */
function providerFacingMessage(
  code: WorksheetProviderError["code"],
  providerMessage: string,
): string {
  if (code === "TIMEOUT") {
    return "Worksheet generation timed out — the documents may be too long. Try again.";
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

/** Best-effort job failure bookkeeping; never throws into the caller. */
async function markJobFailed(
  supabase: SupabaseClient,
  jobId: string | null,
  message: string,
): Promise<void> {
  if (!jobId) return;
  await supabase
    .from("processing_jobs")
    .update({ status: "failed", error: message })
    .eq("id", jobId);
}

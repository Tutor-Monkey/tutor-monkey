import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

export async function GET(
  request: Request,
  { params }: { params: { workspaceId: string } },
) {
  const supabase = createClient();
  if (!supabase) return json({ error: "Server isn't configured for Supabase right now." }, 500);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user || !UUID_RE.test(params.workspaceId)) return json({ error: "Generation job not found." }, 404);

  const jobId = new URL(request.url).searchParams.get("jobId") ?? "";
  if (!UUID_RE.test(jobId)) return json({ error: "Generation job not found." }, 404);

  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .select("id, material_id, status, error, updated_at")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError || !job) return json({ error: "Generation job not found." }, 404);

  const { data: source } = await supabase
    .from("materials")
    .select("id")
    .eq("id", job.material_id)
    .eq("workspace_id", params.workspaceId)
    .maybeSingle();
  if (!source) return json({ error: "Generation job not found." }, 404);

  const { data: generated } = await supabase
    .from("generated_materials")
    .select("id, content, provider, model, created_at, generation_status, generation_error, title")
    .eq("generation_job_id", jobId)
    .eq("workspace_id", params.workspaceId)
    .maybeSingle();

  return json({
    jobId: job.id,
    status: generated?.generation_status ?? job.status,
    error: generated?.generation_error ?? job.error,
    updatedAt: job.updated_at,
    generated: generated
      ? {
          generatedMaterialId: generated.id,
          title: generated.title,
          status: generated.generation_status,
          error: generated.generation_error,
          worksheet: generated.content,
          provider: generated.provider,
          model: generated.model,
          generatedAt: generated.created_at,
        }
      : null,
  });
}

/**
 * TutorMonkey Teachers — client-side fetch helpers for the Materials
 * composer slice.
 *
 * This module is imported only by client components (MaterialsComposer,
 * MaterialsView) and talks to two routes:
 *
 *   - GET  /api/teachers/workspaces/[workspaceId]/suggestions?q=&limit=
 *   - POST /api/teachers/workspaces/[workspaceId]/generate
 *
 * It never touches Supabase directly and never requests extracted text: the
 * suggestions route returns metadata only, and the generate route resolves
 * source text server-side. The only types that cross this boundary are
 * ComposerSourceDoc (metadata) and the validated Worksheet.
 *
 * Error strings are teacher-safe: they never echo the prompt, document text,
 * or any credential-like content. A 503 from the generate route is the
 * migration-pending signal (generated_materials doesn't exist yet) and is
 * surfaced as such so the UI can render the honest "not applied yet" state.
 */

import type { ComposerSourceDoc } from "./materialsComposer";
import { validateWorksheet } from "./worksheet";
import type { Worksheet } from "./worksheet";

// ---------------------------------------------------------------------------
// Suggestions (GET .../suggestions)
// ---------------------------------------------------------------------------

/** The route's success body: metadata-only candidate documents. */
export type WorkspaceSuggestionsResponse = {
  candidates: ComposerSourceDoc[];
};

export type WorkspaceSuggestionsResult =
  | { ok: true; candidates: ComposerSourceDoc[] }
  | { ok: false; error: string };

function isComposerSourceDoc(value: unknown): value is ComposerSourceDoc {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.filename === "string"
  );
}

function suggestionsErrorForStatus(status: number, bodyError: string | null): string {
  if (status === 401) {
    return "You need to sign in to see this workspace's documents.";
  }
  if (status === 404) {
    return "This workspace's documents couldn't be found — pick a workspace from the sidebar and try again.";
  }
  return (
    bodyError ?? "Couldn't load this workspace's documents — please refresh."
  );
}

/**
 * Fetch suggestion candidates (metadata only) for a workspace. `query` is
 * the mention query or the full prompt; `limit` is clamped by the server.
 * Pass an AbortController signal to cancel an in-flight keystroke request.
 */
export async function fetchWorkspaceSuggestions(
  workspaceId: string,
  query: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<WorkspaceSuggestionsResult> {
  try {
    const url = `/api/teachers/workspaces/${encodeURIComponent(
      workspaceId,
    )}/suggestions?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(
      String(limit),
    )}`;
    const response = await fetch(url, { signal });
    const body = (await response.json().catch(() => null)) as
      | { candidates?: unknown; error?: unknown }
      | null;

    if (!response.ok) {
      const bodyError =
        typeof body?.error === "string" && body.error.trim() !== ""
          ? body.error
          : null;
      return {
        ok: false,
        error: suggestionsErrorForStatus(response.status, bodyError),
      };
    }

    const candidates = Array.isArray(body?.candidates)
      ? body.candidates.filter(isComposerSourceDoc)
      : [];
    return { ok: true, candidates };
  } catch {
    if (signal?.aborted) {
      // The caller superseded this request with a newer keystroke; the
      // result is intentionally discarded.
      return { ok: false, error: "" };
    }
    return {
      ok: false,
      error: "Couldn't reach the server — check your connection and try again.",
    };
  }
}

// ---------------------------------------------------------------------------
// Generate (POST .../generate)
// ---------------------------------------------------------------------------

/**
 * The canonical generated-material the composer receives after a successful
 * generation, mirroring the generate route's response. This is what
 * MaterialsView shows above the legacy list until generated_materials rows
 * are wired into the file browser.
 */
export type GeneratedComposerMaterial = {
  generatedMaterialId: string;
  worksheet: Worksheet;
  provider: string;
  model: string;
  sourceCharCount: number;
  truncatedSource: boolean;
  generatedAt: string;
};

export type WorkspaceGenerationOutcome =
  | { ok: true; material: GeneratedComposerMaterial }
  | { ok: false; error: string; status: number; migrationPending: boolean };

export type WorkspaceGenerationInput = {
  prompt: string;
  materialIds: string[];
  confirmedMaterialIds: string[];
};

const MIGRATION_PENDING_MESSAGE =
  "Worksheet generation isn't available yet — the Teachers database migration that adds generated materials hasn't been applied to this project.";

function generationErrorForStatus(
  status: number,
  bodyError: string | null,
): string {
  if (status === 401) return "You need to sign in to generate worksheets.";
  if (status === 404) {
    return "One or more of the selected documents couldn't be found — refresh and try again.";
  }
  if (status === 409) {
    return "Worksheet generation is already running for one of these documents — give it a moment.";
  }
  if (status === 422) {
    return "One or more of the selected documents isn't ready yet — extract its text first.";
  }
  if (status === 429) {
    return "Worksheet generation is busy right now — try again in a moment.";
  }
  if (status === 503) return MIGRATION_PENDING_MESSAGE;
  if (status === 502 || status === 504) {
    return "Worksheet generation couldn't be completed — please try again.";
  }
  return bodyError ?? "Worksheet generation failed — please try again.";
}

/**
  * POST the workspace generate route with explicit mentions plus workspace
 * source discovery. The route acknowledges once the server has created a
 * durable processing job, then this helper polls its status while the tab is
 * open; completed rows remain available after reconnecting.
 */
export async function requestWorkspaceGeneration(
  workspaceId: string,
  input: WorkspaceGenerationInput,
): Promise<WorkspaceGenerationOutcome> {
  try {
    const response = await fetch(
      `/api/teachers/workspaces/${encodeURIComponent(workspaceId)}/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    const body = (await response.json().catch(() => null)) as
      | { error?: unknown; jobId?: unknown; status?: unknown; worksheet?: unknown; generatedMaterialId?: unknown; provider?: unknown; model?: unknown; sourceCharCount?: unknown; truncatedSource?: unknown; generatedAt?: unknown }
      | null;

    if (!response.ok && response.status !== 202) {
      const bodyError = typeof body?.error === "string" && body.error.trim() !== "" ? body.error : null;
      return { ok: false, error: generationErrorForStatus(response.status, bodyError), status: response.status, migrationPending: response.status === 503 };
    }

    const jobId = typeof body?.jobId === "string" ? body.jobId : "";
    if (response.status !== 202 || jobId === "") {
      return { ok: false, error: "Generation started, but the server didn't return a job id — please try again.", status: 502, migrationPending: false };
    }

    return await pollWorkspaceGeneration(workspaceId, jobId);
  } catch {
    return { ok: false, error: "Couldn't reach the server — check your connection and try again.", status: 0, migrationPending: false };
  }
}

async function pollWorkspaceGeneration(
  workspaceId: string,
  jobId: string,
): Promise<WorkspaceGenerationOutcome> {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const response = await fetch(`/api/teachers/workspaces/${encodeURIComponent(workspaceId)}/generation-status?jobId=${encodeURIComponent(jobId)}`);
      const body = (await response.json().catch(() => null)) as {
        status?: unknown;
        error?: unknown;
        generated?: { generatedMaterialId?: unknown; worksheet?: unknown; provider?: unknown; model?: unknown; generatedAt?: unknown } | null;
      } | null;
      if (!response.ok) return { ok: false, error: "Couldn't check generation progress — refresh Materials to see the result.", status: response.status, migrationPending: false };
      if (body?.status === "failed") return { ok: false, error: typeof body.error === "string" ? body.error : "Worksheet generation failed — please try again.", status: 500, migrationPending: false };
      if (body?.status !== "succeeded" || !body.generated) continue;
      const validation = validateWorksheet(body.generated.worksheet);
      const generatedMaterialId = typeof body.generated.generatedMaterialId === "string" ? body.generated.generatedMaterialId : "";
      if (!validation.ok || generatedMaterialId === "") return { ok: false, error: "The generated worksheet couldn't be validated — please try again.", status: 502, migrationPending: false };
      return {
        ok: true,
        material: {
          generatedMaterialId,
          worksheet: validation.worksheet,
          provider: typeof body.generated.provider === "string" ? body.generated.provider : "unknown",
          model: typeof body.generated.model === "string" ? body.generated.model : "unknown",
          sourceCharCount: 0,
          truncatedSource: false,
          generatedAt: typeof body.generated.generatedAt === "string" ? body.generated.generatedAt : "",
        },
      };
    } catch {
      // A transient reconnect failure should not turn a server-side job into a
      // false failure. The Materials list will discover it after refresh.
      continue;
    }
  }
  return { ok: false, error: "Generation is still running in the background. Refresh Materials shortly to see the result.", status: 408, migrationPending: false };
}

/**
 * TutorMonkey Teachers — pure, client-safe validation for the workspace
 * generate route (POST /api/teachers/workspaces/[workspaceId]/generate).
 *
 * This module must stay dependency-free (no DOM, no Supabase, no server
 * modules) so Vitest can cover it as pure helpers, mirroring the
 * conventions in lib/teachers/materialsComposer.ts. It owns the input
 * bounds of the composer's generate request:
 *
 *   - the teacher prompt (non-blank, bounded),
 *   - the source document ids (strict UUIDs, 1..MAX_GENERATION_MATERIAL_IDS,
 *     deduplicated),
 *   - the optional confirmed id list (a strict subset of materialIds, also
 *     bounded).
 *
 * The route enforces these bounds BEFORE any provider call or row write;
 * nothing here reads env vars or touches the network. Error strings are
 * written to be safe to show to the teacher — they never echo the prompt
 * or any document text.
 */

/** Upper bound on the teacher prompt appended to a workspace generation. */
export const MAX_TEACHER_PROMPT_CHARS = 2_000;

/** Upper bound on how many documents one generation may draw from. */
export const MAX_GENERATION_MATERIAL_IDS = 12;

/** Strict UUID shape (same regex the per-material routes use). */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a canonical UUID string. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type BoundedTeacherPrompt =
  | { ok: true; prompt: string }
  | { ok: false; error: string };

/**
 * Validate the teacher prompt: must be a non-blank string, trimmed, and at
 * most MAX_TEACHER_PROMPT_CHARS long. The trimmed value is what the route
 * passes to the provider.
 */
export function boundTeacherPrompt(value: unknown): BoundedTeacherPrompt {
  if (typeof value !== "string") {
    return { ok: false, error: "prompt must be a string." };
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: false, error: "Add a prompt describing the worksheet you want." };
  }
  if (trimmed.length > MAX_TEACHER_PROMPT_CHARS) {
    return {
      ok: false,
      error: `Your prompt is too long (max ${MAX_TEACHER_PROMPT_CHARS} characters).`,
    };
  }
  return { ok: true, prompt: trimmed };
}

export type BoundedMaterialIds =
  | { ok: true; ids: string[] }
  | { ok: false; error: string };

/**
 * Validate the source document id list: an array of 1..MAX_GENERATION_MATERIAL_IDS
 * strict UUIDs. Duplicates are dropped silently (the set is what matters);
 * anything else is an honest 400 the UI can fix.
 */
export function boundMaterialIds(value: unknown): BoundedMaterialIds {
  if (!Array.isArray(value)) {
    return { ok: false, error: "materialIds must be an array of document ids." };
  }
  if (value.length < 1) {
    return {
      ok: false,
      error: "Select at least one document to generate from.",
    };
  }
  if (value.length > MAX_GENERATION_MATERIAL_IDS) {
    return {
      ok: false,
      error: `You can generate from up to ${MAX_GENERATION_MATERIAL_IDS} documents at once.`,
    };
  }
  const ids: string[] = [];
  for (const item of value) {
    if (!isUuid(item)) {
      return {
        ok: false,
        error: "materialIds must contain only valid document ids.",
      };
    }
    if (!ids.includes(item)) ids.push(item);
  }
  return { ok: true, ids };
}

export type BoundedConfirmedMaterialIds =
  | { ok: true; ids: string[] }
  | { ok: false; error: string };

/**
 * Validate the optional confirmedMaterialIds list. It is informational
 * (which sources the teacher explicitly confirmed vs. auto-suggested), so
 * the only requirements are shape: every entry is a strict UUID and a
 * member of materialIds, bounded to the same maximum. Absent/blank lists
 * are fine.
 */
export function boundConfirmedMaterialIds(
  value: unknown,
  materialIds: readonly string[],
): BoundedConfirmedMaterialIds {
  if (value === undefined || value === null) {
    return { ok: true, ids: [] };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: "confirmedMaterialIds must be an array of document ids.",
    };
  }
  if (value.length > MAX_GENERATION_MATERIAL_IDS) {
    return {
      ok: false,
      error: `You can confirm up to ${MAX_GENERATION_MATERIAL_IDS} documents at once.`,
    };
  }
  const ids: string[] = [];
  for (const item of value) {
    if (!isUuid(item)) {
      return {
        ok: false,
        error: "confirmedMaterialIds must contain only valid document ids.",
      };
    }
    if (!materialIds.includes(item)) {
      return {
        ok: false,
        error:
          "confirmedMaterialIds can only contain ids already listed in materialIds.",
      };
    }
    if (!ids.includes(item)) ids.push(item);
  }
  return { ok: true, ids };
}

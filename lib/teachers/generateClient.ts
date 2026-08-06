/**
 * TutorMonkey Teachers — shared client-side worksheet-generation request.
 *
 * Both file-browser views (Documents review modal, Materials review modal)
 * trigger generation with the exact same call, so the fetch + error mapping
 * lives here once. The server route
 * (app/api/teachers/materials/[materialId]/generate) is the only writer of
 * provenance.worksheet; this module only talks to that route with the
 * teacher's own session cookie. No API keys ever reach this code.
 */

import type { Worksheet } from "./worksheet";

export type GenerateWorksheetOutcome = {
  ok: boolean;
  error?: string;
  worksheet?: Worksheet;
  model?: string | null;
  truncatedSource?: boolean;
};

type GenerateResponseBody = {
  error?: string;
  worksheet?: Worksheet;
  model?: string;
  truncatedSource?: boolean;
};

/**
 * POST the generate route for a material and map the outcome for the UI.
 * The route only returns a worksheet after validating AND persisting it;
 * this helper trusts the route's contract and surfaces its error verbatim.
 */
export async function requestWorksheetGeneration(
  materialId: string,
): Promise<GenerateWorksheetOutcome> {
  try {
    const response = await fetch(
      `/api/teachers/materials/${materialId}/generate`,
      { method: "POST" },
    );
    const body = (await response.json().catch(() => null)) as
      | GenerateResponseBody
      | null;

    if (!response.ok) {
      return {
        ok: false,
        error: body?.error ?? "Worksheet generation failed — please try again.",
      };
    }
    return {
      ok: true,
      worksheet: body?.worksheet,
      model: body?.model ?? null,
      truncatedSource: body?.truncatedSource === true,
    };
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the server — check your connection and try again.",
    };
  }
}

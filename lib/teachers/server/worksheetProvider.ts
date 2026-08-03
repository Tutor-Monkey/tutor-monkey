/**
 * TutorMonkey Teachers — worksheet generation provider orchestration.
 *
 * Server-only module (imported by the generate route handler; never imported
 * from client components). Reads OPENCODE_BASE_URL, OPENCODE_MODEL and
 * OPENCODE_API_KEY from the server env, calls the OpenCode-compatible
 * OpenAI-style chat.completions endpoint with strict JSON output, bounds the
 * request with a hard timeout, and returns ONLY a worksheet that passed
 * validateWorksheet (lib/teachers/worksheet.ts).
 *
 * Security:
 *   - OPENCODE_API_KEY is read here, server-side, and never exposed to the
 *     browser. DEEPSEEK_API_KEY and coding-agent keys are never read — this
 *     runtime talks only to the configured OpenCode-compatible endpoint.
 *   - Missing/invalid configuration (base URL, model, key) fails with a
 *     clear WorksheetProviderError (MISSING_CONFIGURATION / MISSING_API_KEY)
 *     that the route maps to a 503. We never guess a base URL.
 *   - The full source material is only ever placed inside the request body.
 *     Nothing in this module logs the key, the payload, or the source text —
 *     error messages carry codes/status only.
 *   - `fetch` is injectable so tests exercise every failure mode with no
 *     network access.
 */

import {
  WORKSHEET_PROVIDER_NAME,
  WorksheetProviderError,
  buildChatCompletionsPayload,
  buildChatCompletionsUrl,
  buildWorksheetSystemPrompt,
  buildWorksheetUserPrompt,
  mapHttpError,
  parseChatCompletion,
  resolveProviderConfig,
  type ProviderEnv,
} from "./worksheetProviderCore";
import {
  MAX_GENERATION_SOURCE_CHARS,
  capSourceText,
  validateWorksheet,
  type Worksheet,
} from "../worksheet";

/** Hard cap on a single generation request, including the network call. */
export const DEFAULT_GENERATION_TIMEOUT_MS = 60_000;

export type GenerateWorksheetOptions = {
  /** Extracted text of the material (bounded internally to MAX_GENERATION_SOURCE_CHARS). */
  sourceText: string;
  /**
   * Env-shaped config source. Defaults to process.env; tests inject explicit
   * objects so no real secrets are involved.
   */
  env?: ProviderEnv;
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
};

export type GenerateWorksheetResult = {
  worksheet: Worksheet;
  provider: typeof WORKSHEET_PROVIDER_NAME;
  model: string;
  sourceCharCount: number;
  truncatedSource: boolean;
};

/**
 * Generate a validated worksheet from extracted source text.
 *
 * Never resolves with an unvalidated worksheet: the model's JSON is parsed,
 * run through validateWorksheet, and only the normalized result is returned.
 * Every failure path throws a typed WorksheetProviderError.
 */
export async function generateWorksheetFromText(
  options: GenerateWorksheetOptions,
): Promise<GenerateWorksheetResult> {
  const env: ProviderEnv =
    options.env ?? (process.env as Record<string, string | undefined>);
  const { baseUrl, model, apiKey } = resolveProviderConfig(env);

  const timeoutMs = options.timeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  // Bound the input up front: 120k chars keeps requests inside a standard
  // context window and the timeout honest. Truncation is flagged, never
  // silent.
  const { text: boundedText, truncated } = capSourceText(
    options.sourceText,
    MAX_GENERATION_SOURCE_CHARS,
  );

  const payload = buildChatCompletionsPayload({
    model,
    systemPrompt: buildWorksheetSystemPrompt(),
    userPrompt: buildWorksheetUserPrompt(boundedText),
  });

  const controller = new AbortController();
  const timer: ReturnType<typeof setTimeout> = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  let response: Response;
  try {
    response = await fetchImpl(buildChatCompletionsUrl(baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new WorksheetProviderError(
        "TIMEOUT",
        "Worksheet generation timed out — the material may be too long. Try again.",
      );
    }
    const detail =
      error instanceof Error ? error.message : "unknown network error";
    throw new WorksheetProviderError(
      "NETWORK_ERROR",
      `Couldn't reach the worksheet provider — ${detail}`,
    );
  } finally {
    clearTimeout(timer);
  }

  let rawBody: string;
  try {
    rawBody = await response.text();
  } catch {
    throw new WorksheetProviderError(
      "NETWORK_ERROR",
      "The worksheet provider connection dropped mid-response — try again.",
    );
  }

  if (!response.ok) {
    throw mapHttpError(response.status);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    throw new WorksheetProviderError(
      "INVALID_RESPONSE",
      "The worksheet provider returned malformed JSON — try again.",
    );
  }

  const completion = parseChatCompletion(parsedBody);

  let worksheetValue: unknown;
  try {
    worksheetValue = JSON.parse(completion.content);
  } catch {
    throw new WorksheetProviderError(
      "INVALID_RESPONSE",
      "The worksheet provider returned content that wasn't valid JSON — try again.",
    );
  }

  const validation = validateWorksheet(worksheetValue);
  if (!validation.ok) {
    // The validation message names the schema problem without echoing the
    // model's raw output or any source material.
    throw new WorksheetProviderError(
      "INVALID_RESPONSE",
      `The worksheet provider returned a worksheet that failed validation (${validation.error}) — try again.`,
    );
  }

  return {
    worksheet: validation.worksheet,
    provider: WORKSHEET_PROVIDER_NAME,
    model,
    sourceCharCount: Array.from(options.sourceText).length,
    truncatedSource: truncated,
  };
}

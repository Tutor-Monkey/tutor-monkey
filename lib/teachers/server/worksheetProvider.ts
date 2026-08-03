/**
 * TutorMonkey Teachers — worksheet generation provider orchestration.
 *
 * Server-only module (imported by the generate route handler; never imported
 * from client components). Reads DEEPSEEK_API_KEY from the server env, calls
 * the DeepSeek OpenAI-compatible chat.completions endpoint at the fixed base
 * URL https://api.deepseek.com with strict JSON output, bounds the request
 * with a hard timeout, and returns ONLY a worksheet that passed
 * validateWorksheet (lib/teachers/worksheet.ts).
 *
 * Security:
 *   - DEEPSEEK_API_KEY is read here, server-side, and never exposed to the
 *     browser. No other key (OpenAI, coding agents, etc.) is ever read.
 *   - Missing configuration (the API key) fails with a clear
 *     WorksheetProviderError (MISSING_API_KEY) that the route maps to a 503.
 *     The base URL is fixed to https://api.deepseek.com and the model
 *     defaults to deepseek-v4-flash (optional DEEPSEEK_MODEL override) — we
 *     never guess an endpoint.
 *   - The full source material is only ever placed inside the request body.
 *     Nothing in this module logs the key, the payload, or the source text —
 *     error messages carry codes/status only.
 *   - `fetch` is injectable so tests exercise every failure mode with no
 *     network access.
 */

import {
  WORKSHEET_PROVIDER_NAME,
  WorksheetProviderError,
  boundLabeledSources,
  buildChatCompletionsPayload,
  buildChatCompletionsUrl,
  buildLabeledWorksheetUserPrompt,
  buildWorksheetSystemPrompt,
  buildWorksheetUserPrompt,
  mapHttpError,
  parseChatCompletion,
  resolveProviderConfig,
  type LabeledSource,
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

/** One labeled source document fed to the provider (extracted text). */
export type GenerateWorksheetSource = LabeledSource;

export type GenerateWorksheetOptions = {
  /**
   * Extracted text of the material (bounded internally to
   * MAX_GENERATION_SOURCE_CHARS). Legacy single-source path — kept for the
   * per-material generate route and existing callers/tests.
   */
  sourceText?: string;
  /**
   * Multi-source path (workspace composer): labeled documents. When present
   * (non-empty) this wins over `sourceText`; the combined text is bounded
   * internally to MAX_GENERATION_SOURCE_CHARS with honest truncation.
   */
  sources?: readonly GenerateWorksheetSource[];
  /** Optional teacher instructions appended to the user prompt. */
  teacherPrompt?: string;
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
  // silent. Multi-source generations budget fairly across documents; the
  // legacy single-source path truncates the tail of the one text.
  let userPrompt: string;
  let truncated: boolean;
  let sourceCharCount: number;
  if (options.sources && options.sources.length > 0) {
    const bounded = boundLabeledSources(
      options.sources,
      MAX_GENERATION_SOURCE_CHARS,
    );
    truncated = bounded.truncated;
    sourceCharCount = bounded.totalCharCount;
    userPrompt = buildLabeledWorksheetUserPrompt({
      sources: bounded.sources,
      teacherPrompt: options.teacherPrompt,
    });
  } else {
    const rawSource = options.sourceText ?? "";
    const capped = capSourceText(rawSource, MAX_GENERATION_SOURCE_CHARS);
    truncated = capped.truncated;
    sourceCharCount = Array.from(rawSource).length;
    userPrompt = buildWorksheetUserPrompt(capped.text);
  }

  const payload = buildChatCompletionsPayload({
    model,
    systemPrompt: buildWorksheetSystemPrompt(),
    userPrompt,
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
    sourceCharCount,
    truncatedSource: truncated,
  };
}

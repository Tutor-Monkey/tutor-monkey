/**
 * TutorMonkey Teachers — worksheet provider core: pure payload building,
 * response parsing, provider-config resolution, and typed errors.
 *
 * Server-only module, but deliberately free of env access and network I/O so
 * Vitest can cover it as pure helpers. All configuration arrives through an
 * injected env-like object (resolveProviderConfig); the orchestration layer
 * (lib/teachers/server/worksheetProvider.ts) passes `process.env` and owns
 * the fetch call.
 *
 * The runtime talks to an OpenCode-compatible, OpenAI-style chat.completions
 * endpoint configured by exactly three server env vars:
 *   OPENCODE_BASE_URL — e.g. "https://opencode.example.com/v1" (required)
 *   OPENCODE_MODEL    — the model name that endpoint serves        (required)
 *   OPENCODE_API_KEY  — bearer key, read server-side only          (required)
 *
 * No default base URL or model is invented: if any of these is missing or
 * invalid, the provider fails with a clear WorksheetProviderError
 * (MISSING_CONFIGURATION / MISSING_API_KEY) that the route maps to a 503 —
 * we never guess an endpoint, and we never fall back to any other key
 * (DEEPSEEK_API_KEY and coding-agent keys are not used here at all).
 *
 * Security notes (kept true by the orchestration layer too):
 *   - The API key is read server-side only, never in browser code.
 *   - No log statement in this slice ever prints the key or the source
 *     material; error messages carry at most an HTTP status / error code,
 *     plus configuration guidance that names the env var without its value.
 */

/** Provider label persisted to provenance and returned to the UI. */
export const WORKSHEET_PROVIDER_NAME = "opencode";

/** Bounded completion budget for a worksheet (tokens). */
export const DEFAULT_MAX_TOKENS = 8_000;

export type WorksheetProviderErrorCode =
  | "MISSING_CONFIGURATION"
  | "MISSING_API_KEY"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "INVALID_RESPONSE"
  | "NETWORK_ERROR";

/**
 * Typed provider failure. `status` is only set for HTTP-level upstream
 * errors (used by the route to pick a response code). Messages are written
 * to be safe to show to the teacher: they never embed the API key, the
 * source material, or raw model output.
 */
export class WorksheetProviderError extends Error {
  readonly code: WorksheetProviderErrorCode;
  readonly status: number | null;

  constructor(
    code: WorksheetProviderErrorCode,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = "WorksheetProviderError";
    this.code = code;
    this.status = status;
  }
}

/** Minimal env-shaped object the provider reads (injectable in tests). */
export type ProviderEnv = Record<string, string | undefined>;

export type ResolvedProviderConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

/**
 * Resolve and validate the provider configuration from an env-like object.
 * Pure: the caller decides where the values come from (process.env in the
 * route, explicit objects in tests).
 *
 * Missing or invalid values throw a typed error with configuration guidance
 * (the env var name, never a value). We deliberately have NO default base
 * URL or model — guessing an endpoint is worse than failing loudly.
 */
export function resolveProviderConfig(env: ProviderEnv): ResolvedProviderConfig {
  const baseUrl = env.OPENCODE_BASE_URL;
  if (!baseUrl || baseUrl.trim() === "") {
    throw new WorksheetProviderError(
      "MISSING_CONFIGURATION",
      "Worksheet generation isn't configured yet — the developer needs to set OPENCODE_BASE_URL in the server environment (an OpenCode-compatible, OpenAI-style endpoint, e.g. https://opencode.example.com/v1).",
    );
  }
  const trimmedBaseUrl = baseUrl.trim();
  if (!isHttpUrl(trimmedBaseUrl)) {
    throw new WorksheetProviderError(
      "MISSING_CONFIGURATION",
      "Worksheet generation isn't configured yet — OPENCODE_BASE_URL must be a valid http(s) URL like https://opencode.example.com/v1.",
    );
  }

  const model = env.OPENCODE_MODEL;
  if (!model || model.trim() === "") {
    throw new WorksheetProviderError(
      "MISSING_CONFIGURATION",
      "Worksheet generation isn't configured yet — the developer needs to set OPENCODE_MODEL in the server environment (the model name the OPENCODE_BASE_URL endpoint serves).",
    );
  }

  const apiKey = env.OPENCODE_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new WorksheetProviderError(
      "MISSING_API_KEY",
      "Worksheet generation isn't configured yet — the developer needs to add OPENCODE_API_KEY to the server environment.",
    );
  }

  return { baseUrl: trimmedBaseUrl, model: model.trim(), apiKey };
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Join a configured base URL to the chat.completions path. Pure and fully
 * determined by its argument: an already-full endpoint is used as-is, a
 * bare origin/v1-style base gets "/chat/completions" appended.
 */
export function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.toLowerCase().endsWith("/chat/completions")) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

export type ChatRole = "system" | "user";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatCompletionsPayload = {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
  response_format: { type: "json_object" };
  stream: false;
};

/**
 * Build the exact OpenAI-style chat.completions request body for a worksheet
 * generation. Pure and fully determined by its arguments, so tests can pin
 * the shape.
 */
export function buildChatCompletionsPayload(input: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}): ChatCompletionsPayload {
  return {
    model: input.model,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt },
    ],
    temperature: input.temperature ?? 0.7,
    max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
    // Strict JSON output. OpenAI-compatible endpoints require the word
    // "json" to appear in the messages when this is set — the system prompt
    // below says "JSON".
    response_format: { type: "json_object" },
    stream: false,
  };
}

/**
 * The system prompt for worksheet generation. Asks for strict JSON matching
 * the schema validated by validateWorksheet (lib/teachers/worksheet.ts) —
 * keep the two in sync.
 */
export function buildWorksheetSystemPrompt(): string {
  return [
    "You are an expert classroom worksheet author. You will be given the extracted text of a teacher's classroom material and must produce a ready-to-print worksheet.",
    "",
    "Return ONLY a single valid JSON object — no markdown, no code fences, no commentary before or after. The JSON must match this schema exactly:",
    "",
    "{",
    '  "title": string,                // required, short and specific',
    '  "instructions": string,         // optional, student-facing directions',
    '  "questions": [                  // required, 1–30 questions',
    "    {",
    '      "id": string,               // required, unique, e.g. "q1"',
    '      "type": string,             // required: "multiple_choice" | "short_answer" | "true_false" | "fill_in_blank"',
    '      "prompt": string,           // required, the question text',
    '      "choices": string[],        // required only for "multiple_choice" (exactly 4 options)',
    '      "answer": string,           // required, the correct answer or expected response',
    '      "explanation": string,      // optional, one-sentence explanation',
    '      "points": number            // optional, default 1',
    "    }",
    "  ],",
    '  "answer_key": string            // optional, teacher-facing answer-key notes',
    "}",
    "",
    "Rules:",
    "- Every question must be answerable from the source material alone.",
    "- Mix question types where the material supports it.",
    "- Keep the worksheet classroom-appropriate in tone and difficulty.",
    "- The JSON must be valid: every required key present, no trailing commas, no text outside the object.",
  ].join("\n");
}

/**
 * The user prompt embedding the (already bounded) source text. The source
 * text is only ever placed inside this request payload — it is never logged.
 */
export function buildWorksheetUserPrompt(sourceText: string): string {
  return [
    "Create a worksheet from the following source material.",
    "",
    `SOURCE MATERIAL (${Array.from(sourceText).length} characters):`,
    '"""',
    sourceText,
    '"""',
    "",
    "Now produce the worksheet JSON object.",
  ].join("\n");
}

export type ParsedChatCompletion = {
  /** The raw JSON string the model produced in choices[0].message.content. */
  content: string;
  model: string | null;
  finishReason: string | null;
};

/**
 * Parse and shape-check a chat.completions success response (HTTP 200).
 * Throws WorksheetProviderError(INVALID_RESPONSE) on any structural drift —
 * the caller then rejects the whole generation rather than persisting
 * something unvalidated.
 */
export function parseChatCompletion(body: unknown): ParsedChatCompletion {
  if (typeof body !== "object" || body === null) {
    throw new WorksheetProviderError(
      "INVALID_RESPONSE",
      "The worksheet provider returned a response we couldn't read.",
    );
  }
  const record = body as Record<string, unknown>;

  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new WorksheetProviderError(
      "INVALID_RESPONSE",
      "The worksheet provider returned an empty completion.",
    );
  }

  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new WorksheetProviderError(
      "INVALID_RESPONSE",
      "The worksheet provider returned no usable content.",
    );
  }

  return {
    content,
    model: typeof record.model === "string" ? record.model : null,
    finishReason:
      typeof first?.finish_reason === "string" ? first.finish_reason : null,
  };
}

/**
 * Map a non-2xx upstream response to a typed error. Only the HTTP status is
 * surfaced — the upstream error body is deliberately not echoed (it is not
 * the source material, but it costs nothing to keep responses generic).
 */
export function mapHttpError(status: number): WorksheetProviderError {
  switch (status) {
    case 401:
      return new WorksheetProviderError(
        "UPSTREAM_ERROR",
        "The worksheet provider rejected the API key (401). Ask the developer to check OPENCODE_API_KEY.",
        status,
      );
    case 402:
      return new WorksheetProviderError(
        "UPSTREAM_ERROR",
        "The worksheet provider account needs a top-up (402).",
        status,
      );
    case 429:
      return new WorksheetProviderError(
        "RATE_LIMITED",
        "Worksheet generation is busy right now — try again in a moment.",
        status,
      );
    default:
      if (status >= 500) {
        return new WorksheetProviderError(
          "UPSTREAM_ERROR",
          `The worksheet provider had a problem (${status}) — try again shortly.`,
          status,
        );
      }
      return new WorksheetProviderError(
        "UPSTREAM_ERROR",
        `The worksheet provider rejected the request (${status}).`,
        status,
      );
  }
}

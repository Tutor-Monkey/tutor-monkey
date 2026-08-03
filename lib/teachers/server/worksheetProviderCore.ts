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
 * The runtime talks to the DeepSeek API — an OpenAI-compatible
 * chat.completions endpoint — at the fixed base URL https://api.deepseek.com,
 * authenticated with exactly one server env var:
 *   DEEPSEEK_API_KEY — bearer key, read server-side only (required)
 *
 * The model defaults to deepseek-v4-flash and may be overridden with the
 * optional DEEPSEEK_MODEL env var (trimmed; blank falls back to the default).
 * No other base URL or model is ever guessed: if the key is missing the
 * provider fails with a clear WorksheetProviderError (MISSING_API_KEY) that
 * the route maps to a 503 — we never fall back to any other key
 * (OPENAI_API_KEY, coding-agent keys, etc. are not used here at all).
 *
 * Security notes (kept true by the orchestration layer too):
 *   - The API key is read server-side only, never in browser code.
 *   - No log statement in this slice ever prints the key or the source
 *     material; error messages carry at most an HTTP status / error code,
 *     plus configuration guidance that names the env var without its value.
 */

/** Provider label persisted to provenance and returned to the UI. */
export const WORKSHEET_PROVIDER_NAME = "deepseek";

/** Fixed DeepSeek API base URL (official docs; OpenAI-compatible). */
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

/** Default worksheet model; DEEPSEEK_MODEL may override it. */
export const DEFAULT_MODEL = "deepseek-v4-flash";

/** Temporary test provider; enable with TEACHERS_WORKSHEET_PROVIDER=anthropic. */
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

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
 * The base URL is fixed (https://api.deepseek.com) and the model defaults to
 * deepseek-v4-flash, so the only required value is DEEPSEEK_API_KEY. Missing
 * or blank values throw a typed error with configuration guidance (the env
 * var name, never a value). The optional DEEPSEEK_MODEL override is trimmed
 * and falls back to the default when blank.
 */
export function resolveProviderConfig(env: ProviderEnv): ResolvedProviderConfig {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new WorksheetProviderError(
      "MISSING_API_KEY",
      "Worksheet generation isn't configured yet — the developer needs to add DEEPSEEK_API_KEY to the server environment.",
    );
  }

  const rawModel = env.DEEPSEEK_MODEL;
  const model =
    rawModel && rawModel.trim() !== "" ? rawModel.trim() : DEFAULT_MODEL;

  return { baseUrl: DEEPSEEK_BASE_URL, model, apiKey };
}

export function resolveAnthropicProviderConfig(env: ProviderEnv): ResolvedProviderConfig {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new WorksheetProviderError(
      "MISSING_API_KEY",
      "Temporary Anthropic testing isn't configured — add ANTHROPIC_API_KEY to the server environment.",
    );
  }
  const rawModel = env.ANTHROPIC_MODEL;
  const model = rawModel && rawModel.trim() !== "" ? rawModel.trim() : DEFAULT_ANTHROPIC_MODEL;
  return { baseUrl: ANTHROPIC_BASE_URL, model, apiKey };
}

/**
 * Join a base URL to the chat.completions path. Pure and fully
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

// ---------------------------------------------------------------------------
// Multi-source + teacher-prompt support (workspace composer slice)
// ---------------------------------------------------------------------------

/** One labeled source document embedded in the user prompt. */
export type LabeledSource = {
  /** Human-readable document label (filename); never extracted text. */
  label: string;
  /** The (bounded) extracted text of that document. */
  text: string;
};

/**
 * Bound a list of labeled sources to `maxChars` total characters.
 *
 * Fair per-source budgeting keeps one giant handout from starving every
 * other source: each source gets at most `maxChars / sourceCount` characters
 * from the tail, and once the budget is exhausted later sources are dropped
 * entirely. `truncated` is set whenever anything was cut, and
 * `totalCharCount` reports the ORIGINAL combined length so provenance can
 * stay honest about what was requested vs. what was sent. Pure.
 */
export function boundLabeledSources(
  sources: readonly LabeledSource[],
  maxChars: number,
): { sources: LabeledSource[]; truncated: boolean; totalCharCount: number } {
  const totalCharCount = sources.reduce(
    (sum, source) => sum + Array.from(source.text).length,
    0,
  );
  if (sources.length === 0 || totalCharCount <= maxChars) {
    return {
      sources: sources.map((source) => ({ ...source })),
      truncated: false,
      totalCharCount,
    };
  }

  const perSourceBudget = Math.floor(maxChars / sources.length);
  const bounded: LabeledSource[] = [];
  let remaining = maxChars;
  let truncated = false;

  for (const source of sources) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const budget = Math.min(perSourceBudget, remaining);
    const text = Array.from(source.text).slice(0, budget).join("");
    if (Array.from(source.text).length > budget) truncated = true;
    bounded.push({ label: source.label, text });
    remaining -= budget;
  }

  return { sources: bounded, truncated, totalCharCount };
}

/**
 * The user prompt for a multi-source generation with an optional teacher
 * prompt. Each source is embedded under its own label (a document filename —
 * never provenance), followed by the teacher's instructions when provided.
 * The texts must already be bounded (boundLabeledSources) — this builder
 * never truncates, it only assembles.
 */
export function buildLabeledWorksheetUserPrompt(input: {
  sources: readonly LabeledSource[];
  teacherPrompt?: string;
}): string {
  const blocks = input.sources.map((source, index) =>
    [
      `SOURCE ${index + 1} — ${source.label} (${Array.from(source.text).length} characters):`,
      '"""',
      source.text,
      '"""',
    ].join("\n"),
  );

  const parts = [
    "Create a worksheet from the following source material(s).",
    "",
    ...blocks,
  ];

  const teacherPrompt = input.teacherPrompt?.trim();
  if (teacherPrompt && teacherPrompt !== "") {
    parts.push("", "TEACHER INSTRUCTIONS:", teacherPrompt);
  }

  parts.push("", "Now produce the worksheet JSON object.");
  return parts.join("\n");
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

export function parseWorksheetJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new WorksheetProviderError(
        "INVALID_RESPONSE",
        "The worksheet provider returned content that wasn't valid JSON — try again.",
      );
    }
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      throw new WorksheetProviderError(
        "INVALID_RESPONSE",
        "The worksheet provider returned content that wasn't valid JSON — try again.",
      );
    }
  }
}

export function parseAnthropicCompletion(body: unknown): ParsedChatCompletion {
  if (typeof body !== "object" || body === null) {
    throw new WorksheetProviderError("INVALID_RESPONSE", "The worksheet provider returned a response we couldn't read.");
  }
  const record = body as Record<string, unknown>;
  const content = record.content;
  const text = Array.isArray(content)
    ? content
        .filter((block): block is Record<string, unknown> => typeof block === "object" && block !== null)
        .map((block) => (typeof block.text === "string" ? block.text : ""))
        .filter((value) => value.trim() !== "")
        .join("\n")
    : "";
  if (text.trim() === "") {
    throw new WorksheetProviderError("INVALID_RESPONSE", "The worksheet provider returned no usable content.");
  }
  return {
    content: text,
    model: typeof record.model === "string" ? record.model : null,
    finishReason: typeof record.stop_reason === "string" ? record.stop_reason : null,
  };
}

/**
 * Map a non-2xx upstream response to a typed error. Only the HTTP status is
 * surfaced — the upstream error body is deliberately not echoed (it is not
 * the source material, but it costs nothing to keep responses generic).
 */
export function mapHttpError(status: number, apiKeyEnv = "DEEPSEEK_API_KEY"): WorksheetProviderError {
  switch (status) {
    case 401:
      return new WorksheetProviderError(
        "UPSTREAM_ERROR",
        `The worksheet provider rejected the API key (401). Ask the developer to check ${apiKeyEnv}.`,
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

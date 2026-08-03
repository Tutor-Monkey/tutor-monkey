/**
 * TutorMonkey Teachers — worksheet schema + pure validation.
 *
 * Client-safe, dependency-free module shared by:
 *   - the server route (app/api/teachers/materials/[materialId]/generate)
 *   - the DeepSeek provider (lib/teachers/server/worksheetProvider.ts)
 *   - the review modal (components/teachers/MaterialDetailModal.tsx), which
 *     re-validates whatever the server returns before rendering it
 *
 * It must never import server-only modules or env vars: the route and the
 * client bundle both pull this file in, and the validator is covered by
 * Vitest as a pure helper module (same convention as
 * lib/teachers/materialDetail.ts).
 *
 * The worksheet is stored inside materials.provenance.worksheet (JSONB),
 * reusing the existing materials table + RLS rather than adding a migration.
 *
 * The provider it feeds (lib/teachers/server/worksheetProvider.ts) talks to
 * an OpenCode-compatible, OpenAI-style endpoint configured by OPENCODE_BASE_URL
 * and OPENCODE_MODEL; it never uses DEEPSEEK_API_KEY or any coding-agent key.
 */

/** A single worksheet question in the canonical stored shape. */
export type WorksheetQuestion = {
  id: string;
  type: "multiple_choice" | "short_answer" | "true_false" | "fill_in_blank";
  prompt: string;
  /** Required for multiple_choice; ignored (and stripped) for other types. */
  choices?: string[];
  answer: string;
  explanation?: string;
  points?: number;
};

/** Canonical worksheet shape persisted to provenance and returned to the UI. */
export type Worksheet = {
  title: string;
  instructions?: string;
  questions: WorksheetQuestion[];
  answer_key?: string;
};

export const WORKSHEET_QUESTION_TYPES = [
  "multiple_choice",
  "short_answer",
  "true_false",
  "fill_in_blank",
] as const;

/**
 * Upper bound on the extracted text sent to the provider. ~120k characters
 * (~30k tokens) keeps requests well inside a standard context window and the
 * generation timeout honest. Longer materials are truncated (with an honest
 * `truncatedSource` flag) rather than rejected, so big handouts still work.
 */
export const MAX_GENERATION_SOURCE_CHARS = 120_000;

// Sanity bounds on the model's output. `max_tokens` already bounds the raw
// response, but these keep a single runaway field from ever being persisted.
const MAX_TITLE_CHARS = 300;
const MAX_INSTRUCTIONS_CHARS = 4_000;
const MAX_PROMPT_CHARS = 4_000;
const MAX_ANSWER_CHARS = 4_000;
const MAX_EXPLANATION_CHARS = 2_000;
const MAX_CHOICE_CHARS = 1_000;
const MAX_ANSWER_KEY_CHARS = 8_000;
const MAX_QUESTIONS = 50;

export type WorksheetValidation =
  | { ok: true; worksheet: Worksheet }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function boundedString(
  value: unknown,
  maxChars: number,
): value is string {
  return typeof value === "string" && value.length <= maxChars;
}

/**
 * Validate (and normalize) an unknown value into a canonical Worksheet.
 *
 * The provider is asked for strict JSON, but models drift: this is the single
 * gate between "model said something" and "we persist/claim success". Extra
 * keys are dropped, optional fields are kept only when well-formed, and the
 * returned worksheet contains exactly the canonical fields. Never mutates the
 * input.
 */
export function validateWorksheet(input: unknown): WorksheetValidation {
  if (!isRecord(input)) {
    return { ok: false, error: "worksheet must be a JSON object" };
  }

  const { title } = input;
  if (!nonEmptyString(title)) {
    return { ok: false, error: "worksheet.title must be a non-empty string" };
  }
  if (!boundedString(title, MAX_TITLE_CHARS)) {
    return {
      ok: false,
      error: `worksheet.title is too long (max ${MAX_TITLE_CHARS} characters)`,
    };
  }

  const instructions =
    typeof input.instructions === "string" &&
    input.instructions.length <= MAX_INSTRUCTIONS_CHARS
      ? input.instructions
      : undefined;

  if (!Array.isArray(input.questions)) {
    return { ok: false, error: "worksheet.questions must be an array" };
  }
  if (input.questions.length < 1) {
    return { ok: false, error: "worksheet.questions must not be empty" };
  }
  if (input.questions.length > MAX_QUESTIONS) {
    return {
      ok: false,
      error: `worksheet has too many questions (max ${MAX_QUESTIONS})`,
    };
  }

  const questions: WorksheetQuestion[] = [];
  const seenIds = new Set<string>();
  for (let index = 0; index < input.questions.length; index++) {
    const rawQuestion = input.questions[index];
    const path = `worksheet.questions[${index}]`;
    if (!isRecord(rawQuestion)) {
      return { ok: false, error: `${path} must be a JSON object` };
    }

    const { id } = rawQuestion;
    if (!nonEmptyString(id) || !boundedString(id, 100)) {
      return { ok: false, error: `${path}.id must be a non-empty short string` };
    }
    if (seenIds.has(id)) {
      return { ok: false, error: `${path}.id must be unique (duplicate "${id}")` };
    }
    seenIds.add(id);

    const type = rawQuestion.type;
    if (
      typeof type !== "string" ||
      !(WORKSHEET_QUESTION_TYPES as readonly string[]).includes(type)
    ) {
      return {
        ok: false,
        error: `${path}.type must be one of ${WORKSHEET_QUESTION_TYPES.join(", ")}`,
      };
    }
    const questionType = type as WorksheetQuestion["type"];

    const { prompt } = rawQuestion;
    if (!nonEmptyString(prompt)) {
      return { ok: false, error: `${path}.prompt must be a non-empty string` };
    }
    if (!boundedString(prompt, MAX_PROMPT_CHARS)) {
      return {
        ok: false,
        error: `${path}.prompt is too long (max ${MAX_PROMPT_CHARS} characters)`,
      };
    }

    const { answer } = rawQuestion;
    if (!nonEmptyString(answer)) {
      return { ok: false, error: `${path}.answer must be a non-empty string` };
    }
    if (!boundedString(answer, MAX_ANSWER_CHARS)) {
      return {
        ok: false,
        error: `${path}.answer is too long (max ${MAX_ANSWER_CHARS} characters)`,
      };
    }

    // multiple_choice questions must come with 2–6 concrete options.
    let choices: string[] | undefined;
    if (questionType === "multiple_choice") {
      if (
        !Array.isArray(rawQuestion.choices) ||
        rawQuestion.choices.length < 2 ||
        rawQuestion.choices.length > 6
      ) {
        return {
          ok: false,
          error: `${path}.choices must be an array of 2–6 options for multiple_choice questions`,
        };
      }
      const cleanedChoices: string[] = [];
      for (const choice of rawQuestion.choices) {
        if (!nonEmptyString(choice) || !boundedString(choice, MAX_CHOICE_CHARS)) {
          return {
            ok: false,
            error: `${path}.choices must contain only non-empty short strings`,
          };
        }
        cleanedChoices.push(choice);
      }
      choices = cleanedChoices;
    }

    const explanation =
      typeof rawQuestion.explanation === "string" &&
      rawQuestion.explanation.length <= MAX_EXPLANATION_CHARS &&
      rawQuestion.explanation.trim() !== ""
        ? rawQuestion.explanation
        : undefined;

    let points: number | undefined;
    if (rawQuestion.points !== undefined) {
      if (
        typeof rawQuestion.points !== "number" ||
        !Number.isFinite(rawQuestion.points) ||
        rawQuestion.points < 0 ||
        rawQuestion.points > 100
      ) {
        return {
          ok: false,
          error: `${path}.points must be a number between 0 and 100`,
        };
      }
      points = rawQuestion.points;
    }

    questions.push({
      id,
      type: questionType,
      prompt,
      ...(choices ? { choices } : {}),
      answer,
      ...(explanation ? { explanation } : {}),
      ...(points !== undefined ? { points } : {}),
    });
  }

  const answerKey =
    typeof input.answer_key === "string" &&
    input.answer_key.length <= MAX_ANSWER_KEY_CHARS &&
    input.answer_key.trim() !== ""
      ? input.answer_key
      : undefined;

  return {
    ok: true,
    worksheet: {
      title,
      ...(instructions && instructions.trim() !== "" ? { instructions } : {}),
      questions,
      ...(answerKey ? { answer_key: answerKey } : {}),
    },
  };
}

/**
 * Bound source text to MAX_GENERATION_SOURCE_CHARS. Pure so tests can pin the
 * truncation behavior without any server state.
 */
export function capSourceText(
  text: string,
  maxChars: number = MAX_GENERATION_SOURCE_CHARS,
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxChars), truncated: true };
}

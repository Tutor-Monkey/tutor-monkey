import { describe, expect, it } from "vitest";
import {
  MAX_GENERATION_SOURCE_CHARS,
  capSourceText,
  validateWorksheet,
  type Worksheet,
} from "./worksheet";

const validWorksheet = {
  title: "Photosynthesis review",
  instructions: "Read each question and answer from the material.",
  questions: [
    {
      id: "q1",
      type: "multiple_choice",
      prompt: "Where does photosynthesis happen?",
      choices: ["Chloroplast", "Nucleus", "Ribosome", "Membrane"],
      answer: "Chloroplast",
      explanation: "Chloroplasts contain chlorophyll.",
      points: 2,
    },
    {
      id: "q2",
      type: "short_answer",
      prompt: "Name the gas plants release.",
      answer: "Oxygen",
    },
  ],
  answer_key: "q1: Chloroplast; q2: Oxygen.",
};

describe("validateWorksheet", () => {
  it("accepts a well-formed worksheet and normalizes it", () => {
    const result = validateWorksheet(validWorksheet);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.worksheet.title).toBe("Photosynthesis review");
    expect(result.worksheet.instructions).toBe(
      "Read each question and answer from the material.",
    );
    expect(result.worksheet.questions).toHaveLength(2);
    expect(result.worksheet.questions[0].choices).toEqual([
      "Chloroplast",
      "Nucleus",
      "Ribosome",
      "Membrane",
    ]);
    expect(result.worksheet.questions[1].choices).toBeUndefined();
    expect(result.worksheet.answer_key).toContain("q1");
  });

  it("rejects non-object input", () => {
    for (const input of [null, undefined, 42, "nope", [], true]) {
      const result = validateWorksheet(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/JSON object/);
    }
  });

  it("rejects a missing, blank, or too-long title", () => {
    expect(validateWorksheet({ ...validWorksheet, title: "" }).ok).toBe(false);
    expect(validateWorksheet({ ...validWorksheet, title: "   " }).ok).toBe(
      false,
    );
    expect(validateWorksheet({ ...validWorksheet, title: undefined }).ok).toBe(
      false,
    );
    expect(
      validateWorksheet({ ...validWorksheet, title: "x".repeat(301) }).ok,
    ).toBe(false);
  });

  it("rejects non-array, empty, or oversized question lists", () => {
    expect(
      validateWorksheet({ ...validWorksheet, questions: "nope" }).ok,
    ).toBe(false);
    expect(
      validateWorksheet({ ...validWorksheet, questions: [] }).ok,
    ).toBe(false);
    const fiftyOne = Array.from({ length: 51 }, (_, index) => ({
      id: `q${index}`,
      type: "short_answer",
      prompt: `Prompt ${index}`,
      answer: "Answer",
    }));
    expect(validateWorksheet({ ...validWorksheet, questions: fiftyOne }).ok).toBe(
      false,
    );
    const fifty = fiftyOne.slice(0, 50);
    expect(validateWorksheet({ ...validWorksheet, questions: fifty }).ok).toBe(
      true,
    );
  });

  it("rejects a malformed question", () => {
    expect(
      validateWorksheet({ ...validWorksheet, questions: [null] }).ok,
    ).toBe(false);
    expect(
      validateWorksheet({ ...validWorksheet, questions: ["q1"] }).ok,
    ).toBe(false);
  });

  it("requires a non-empty unique id per question", () => {
    expect(
      validateWorksheet({
        ...validWorksheet,
        questions: [{ ...validWorksheet.questions[0], id: "" }],
      }).ok,
    ).toBe(false);
    expect(
      validateWorksheet({
        ...validWorksheet,
        questions: [
          validWorksheet.questions[0],
          { ...validWorksheet.questions[1], id: "q1" },
        ],
      }).ok,
    ).toBe(false);
  });

  it("rejects an unknown question type", () => {
    expect(
      validateWorksheet({
        ...validWorksheet,
        questions: [{ ...validWorksheet.questions[0], type: "essay" }],
      }).ok,
    ).toBe(false);
  });

  it("rejects blank prompts and answers, and over-long ones", () => {
    expect(
      validateWorksheet({
        ...validWorksheet,
        questions: [{ ...validWorksheet.questions[1], prompt: "  " }],
      }).ok,
    ).toBe(false);
    expect(
      validateWorksheet({
        ...validWorksheet,
        questions: [{ ...validWorksheet.questions[1], answer: "" }],
      }).ok,
    ).toBe(false);
    expect(
      validateWorksheet({
        ...validWorksheet,
        questions: [{ ...validWorksheet.questions[1], prompt: "x".repeat(4001) }],
      }).ok,
    ).toBe(false);
    expect(
      validateWorksheet({
        ...validWorksheet,
        questions: [{ ...validWorksheet.questions[1], answer: "x".repeat(4001) }],
      }).ok,
    ).toBe(false);
  });

  it("requires 2–6 concrete choices for multiple_choice", () => {
    const withChoices = (choices: unknown) =>
      validateWorksheet({
        ...validWorksheet,
        questions: [{ ...validWorksheet.questions[0], choices }],
      });
    expect(withChoices(undefined).ok).toBe(false);
    expect(withChoices([]).ok).toBe(false);
    expect(withChoices(["only"]).ok).toBe(false);
    expect(withChoices(["a", "b", "c", "d", "e", "f", "g"]).ok).toBe(false);
    expect(withChoices(["a", "", "c", "d"]).ok).toBe(false);
    expect(withChoices([1, 2, 3, 4]).ok).toBe(false);
    expect(withChoices(["a", "b", "c", "d"]).ok).toBe(true);
  });

  it("ignores choices on non-multiple_choice questions", () => {
    const result = validateWorksheet({
      ...validWorksheet,
      questions: [
        { ...validWorksheet.questions[1], choices: ["a", "b", "c", "d"] },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.worksheet.questions[0].choices).toBeUndefined();
  });

  it("strips blank or over-long optional fields instead of failing", () => {
    const result = validateWorksheet({
      ...validWorksheet,
      instructions: "   ",
      questions: [
        { ...validWorksheet.questions[0], explanation: "  " },
        validWorksheet.questions[1],
      ],
      answer_key: "x".repeat(8001),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.worksheet.instructions).toBeUndefined();
    expect(result.worksheet.questions[0].explanation).toBeUndefined();
    expect(result.worksheet.answer_key).toBeUndefined();
  });

  it("rejects out-of-range points and accepts valid ones", () => {
    expect(
      validateWorksheet({
        ...validWorksheet,
        questions: [{ ...validWorksheet.questions[0], points: -1 }],
      }).ok,
    ).toBe(false);
    expect(
      validateWorksheet({
        ...validWorksheet,
        questions: [{ ...validWorksheet.questions[0], points: 101 }],
      }).ok,
    ).toBe(false);
    expect(
      validateWorksheet({
        ...validWorksheet,
        questions: [{ ...validWorksheet.questions[0], points: "2" }],
      }).ok,
    ).toBe(false);
    expect(
      validateWorksheet({
        ...validWorksheet,
        questions: [{ ...validWorksheet.questions[0], points: 0 }],
      }).ok,
    ).toBe(true);
  });

  it("drops extra keys and never mutates the input", () => {
    const input = {
      ...validWorksheet,
      extra: "ignored",
      questions: validWorksheet.questions.map((q) => ({
        ...q,
        hallucinated: true,
      })),
    };
    const snapshot = JSON.stringify(input);
    const result = validateWorksheet(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.worksheet).not.toHaveProperty("extra");
    expect(result.worksheet.questions[0]).not.toHaveProperty("hallucinated");
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("returns the exact canonical shape", () => {
    const result = validateWorksheet(validWorksheet);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const worksheet: Worksheet = result.worksheet;
    expect(Object.keys(worksheet).sort()).toEqual(
      ["answer_key", "instructions", "questions", "title"].sort(),
    );
    expect(Object.keys(worksheet.questions[0]).sort()).toEqual(
      ["answer", "choices", "explanation", "id", "points", "prompt", "type"].sort(),
    );
  });
});

describe("capSourceText", () => {
  it("leaves short text untouched and untruncated", () => {
    const result = capSourceText("hello");
    expect(result).toEqual({ text: "hello", truncated: false });
  });

  it("truncates long text at the cap and flags it", () => {
    const long = "x".repeat(MAX_GENERATION_SOURCE_CHARS + 10);
    const result = capSourceText(long);
    expect(result.truncated).toBe(true);
    expect(result.text).toHaveLength(MAX_GENERATION_SOURCE_CHARS);
  });

  it("honors an explicit cap", () => {
    const result = capSourceText("abcdef", 3);
    expect(result).toEqual({ text: "abc", truncated: true });
  });
});

import { describe, expect, it } from "vitest";
import {
  MAX_GENERATION_MATERIAL_IDS,
  MAX_TEACHER_PROMPT_CHARS,
  boundConfirmedMaterialIds,
  boundMaterialIds,
  boundTeacherPrompt,
  isUuid,
} from "./generateRequest";

const VALID_UUID = "5f8c1f2e-9b3a-4c7d-8e6f-1a2b3c4d5e6f";

describe("isUuid", () => {
  it("accepts canonical UUIDs", () => {
    expect(isUuid(VALID_UUID)).toBe(true);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
  });

  it("rejects non-strings, wrong shapes, and near-misses", () => {
    expect(isUuid(42)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(`${VALID_UUID}x`)).toBe(false);
    expect(isUuid(VALID_UUID.toUpperCase())).toBe(true); // case-insensitive
  });
});

describe("boundTeacherPrompt", () => {
  it("accepts a non-blank prompt and trims it", () => {
    expect(boundTeacherPrompt("  Make a quiz on enzymes  ")).toEqual({
      ok: true,
      prompt: "Make a quiz on enzymes",
    });
  });

  it("rejects non-strings", () => {
    expect(boundTeacherPrompt(42).ok).toBe(false);
    expect(boundTeacherPrompt(null).ok).toBe(false);
    expect(boundTeacherPrompt(undefined).ok).toBe(false);
  });

  it("rejects blank and whitespace-only prompts", () => {
    expect(boundTeacherPrompt("").ok).toBe(false);
    expect(boundTeacherPrompt("   ").ok).toBe(false);
  });

  it("rejects over-long prompts", () => {
    const tooLong = "a".repeat(MAX_TEACHER_PROMPT_CHARS + 1);
    const result = boundTeacherPrompt(tooLong);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("too long");
  });
});

describe("boundMaterialIds", () => {
  const ids = [
    VALID_UUID,
    "6f8c1f2e-9b3a-4c7d-8e6f-1a2b3c4d5e6f",
    "7f8c1f2e-9b3a-4c7d-8e6f-1a2b3c4d5e6f",
  ];

  it("accepts a list of UUIDs and dedupes", () => {
    expect(boundMaterialIds([ids[0], ids[1], ids[0]])).toEqual({
      ok: true,
      ids: [ids[0], ids[1]],
    });
  });

  it("rejects non-arrays and empty lists", () => {
    expect(boundMaterialIds("nope").ok).toBe(false);
    expect(boundMaterialIds(undefined).ok).toBe(false);
    expect(boundMaterialIds([]).ok).toBe(false);
  });

  it("rejects non-UUID members", () => {
    expect(boundMaterialIds([ids[0], "abc"]).ok).toBe(false);
  });

  it("rejects more than MAX_GENERATION_MATERIAL_IDS", () => {
    const many = Array.from(
      { length: MAX_GENERATION_MATERIAL_IDS + 1 },
      (_, index) => {
        const hex = index.toString(16).padStart(4, "0");
        return `00000000-0000-0000-0000-${hex}0000000000`;
      },
    );
    expect(many.length).toBe(MAX_GENERATION_MATERIAL_IDS + 1);
    const result = boundMaterialIds(many);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("up to");
  });
});

describe("boundConfirmedMaterialIds", () => {
  const materialIds = [VALID_UUID, "6f8c1f2e-9b3a-4c7d-8e6f-1a2b3c4d5e6f"];

  it("accepts absent/null/empty confirmed lists", () => {
    expect(boundConfirmedMaterialIds(undefined, materialIds)).toEqual({
      ok: true,
      ids: [],
    });
    expect(boundConfirmedMaterialIds(null, materialIds)).toEqual({
      ok: true,
      ids: [],
    });
    expect(boundConfirmedMaterialIds([], materialIds)).toEqual({
      ok: true,
      ids: [],
    });
  });

  it("accepts a strict subset of materialIds", () => {
    expect(boundConfirmedMaterialIds([materialIds[1]], materialIds)).toEqual({
      ok: true,
      ids: [materialIds[1]],
    });
  });

  it("rejects ids not present in materialIds", () => {
    const result = boundConfirmedMaterialIds(
      ["7f8c1f2e-9b3a-4c7d-8e6f-1a2b3c4d5e6f"],
      materialIds,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects non-UUID members", () => {
    expect(boundConfirmedMaterialIds(["nope"], materialIds).ok).toBe(false);
  });

  it("rejects non-arrays", () => {
    expect(boundConfirmedMaterialIds("all", materialIds).ok).toBe(false);
  });
});

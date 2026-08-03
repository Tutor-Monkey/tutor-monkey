import { describe, expect, it } from "vitest";
import {
  buildFolderSegmentChains,
  isMaterialStatus,
  isMissingColumnError,
  toComposerSourceDoc,
  type SuggestionRowLike,
} from "./workspaceSuggestions";

describe("isMissingColumnError", () => {
  it("detects PostgREST PGRST204 (column missing)", () => {
    expect(
      isMissingColumnError({
        code: "PGRST204",
        message:
          "Could not find the 'folder_id' column of 'materials' in the schema cache",
      }),
    ).toBe(true);
  });

  it("detects the underlying column wording", () => {
    expect(
      isMissingColumnError({
        code: "42P01",
        message: 'column materials.folder_id does not exist',
      }),
    ).toBe(true);
  });

  it("rejects null, missing-table codes, and other errors", () => {
    expect(isMissingColumnError(null)).toBe(false);
    expect(isMissingColumnError({ code: "PGRST205" })).toBe(false);
    expect(isMissingColumnError({ code: "PGRST301" })).toBe(false);
    expect(
      isMissingColumnError({ code: "42P01", message: "relation does not exist" }),
    ).toBe(false);
    expect(isMissingColumnError({ message: "network error" })).toBe(false);
  });
});

describe("isMaterialStatus", () => {
  it("accepts the four schema statuses", () => {
    for (const status of ["uploaded", "processing", "ready", "failed"]) {
      expect(isMaterialStatus(status)).toBe(true);
    }
  });

  it("rejects unknown statuses and non-strings", () => {
    expect(isMaterialStatus("deleted")).toBe(false);
    expect(isMaterialStatus("")).toBe(false);
    expect(isMaterialStatus(42)).toBe(false);
    expect(isMaterialStatus(null)).toBe(false);
  });
});

describe("buildFolderSegmentChains", () => {
  const folders = [
    { id: "a", name: "Unit 3", parent_id: null },
    { id: "b", name: "Enzymes", parent_id: "a" },
    { id: "c", name: "Lab Reports", parent_id: "b" },
  ];

  it("builds root-first chains for nested folders", () => {
    const chains = buildFolderSegmentChains(folders);
    expect(chains.get("a")).toEqual(["Unit 3"]);
    expect(chains.get("b")).toEqual(["Unit 3", "Enzymes"]);
    expect(chains.get("c")).toEqual(["Unit 3", "Enzymes", "Lab Reports"]);
  });

  it("returns an empty map for no folders", () => {
    expect(buildFolderSegmentChains([]).size).toBe(0);
  });

  it("handles a missing parent and a corrupt cycle without hanging", () => {
    const chains = buildFolderSegmentChains([
      { id: "orphan", name: "Orphan", parent_id: "ghost" },
      { id: "x", name: "X", parent_id: "y" },
      { id: "y", name: "Y", parent_id: "x" },
    ]);
    expect(chains.get("orphan")).toEqual(["Orphan"]);
    expect(chains.get("x")).toEqual([]); // cycle → depth cap
    expect(chains.get("y")).toEqual([]);
  });
});

describe("toComposerSourceDoc", () => {
  const row: SuggestionRowLike = {
    id: "mat-1",
    original_filename: "Enzymes Review.pdf",
    source_type: "local_upload",
    mime_type: "application/pdf",
    status: "ready",
    created_at: "2026-08-01T00:00:00.000Z",
    folder_id: "b",
  };

  it("projects metadata only (never provenance)", () => {
    const doc = toComposerSourceDoc(row, new Map([["b", ["Unit 3", "Enzymes"]]]));
    expect(doc).toEqual({
      id: "mat-1",
      filename: "Enzymes Review.pdf",
      sourceType: "local_upload",
      mimeType: "application/pdf",
      status: "ready",
      createdAt: "2026-08-01T00:00:00.000Z",
      folderSegments: ["Unit 3", "Enzymes"],
    });
  });

  it("defaults folderSegments to the workspace root when folder_id is absent", () => {
    const withoutFolder = { ...row };
    delete withoutFolder.folder_id;
    const doc = toComposerSourceDoc(withoutFolder, new Map());
    expect(doc.folderSegments).toEqual([]);
  });

  it("falls back to [] when the folder id has no chain", () => {
    const doc = toComposerSourceDoc(row, new Map());
    expect(doc.folderSegments).toEqual([]);
  });

  it("degrades unknown statuses to uploaded", () => {
    const doc = toComposerSourceDoc(
      { ...row, status: "archived" },
      new Map(),
    );
    expect(doc.status).toBe("uploaded");
  });
});

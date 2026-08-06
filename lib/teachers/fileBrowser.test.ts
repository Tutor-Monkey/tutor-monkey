import { describe, expect, it } from "vitest";
import {
  WORKSPACE_TABS,
  buildBreadcrumbItems,
  describeWorkspaceSelector,
  folderPathKey,
  groupFolderContents,
  isWorkspaceTab,
  joinFolderPath,
  normalizeFolderPath,
  parentFolderSegments,
  splitFolderPath,
  toDocumentFileEntry,
  toGeneratedMaterialEntry,
  workspaceInitials,
  workspaceTabLabel,
  type DocumentFileEntry,
  type WorkspaceSummary,
} from "./fileBrowser";

describe("workspace tabs", () => {
  it("exposes exactly Documents and Materials in that order", () => {
    expect(WORKSPACE_TABS.map((tab) => tab.id)).toEqual([
      "documents",
      "materials",
    ]);
    expect(WORKSPACE_TABS.map((tab) => tab.label)).toEqual([
      "Documents",
      "Materials",
    ]);
  });

  it("narrows unknown values with isWorkspaceTab", () => {
    expect(isWorkspaceTab("documents")).toBe(true);
    expect(isWorkspaceTab("materials")).toBe(true);
    expect(isWorkspaceTab("overview")).toBe(false);
    expect(isWorkspaceTab(null)).toBe(false);
    expect(isWorkspaceTab(undefined)).toBe(false);
    expect(isWorkspaceTab("")).toBe(false);
  });

  it("labels tabs exactly", () => {
    expect(workspaceTabLabel("documents")).toBe("Documents");
    expect(workspaceTabLabel("materials")).toBe("Materials");
  });
});

describe("splitFolderPath / joinFolderPath / parentFolderSegments", () => {
  it("splits a nested path and tolerates whitespace and trailing slashes", () => {
    expect(splitFolderPath("Unit 3 / Enzymes/")).toEqual([
      "Unit 3",
      "Enzymes",
    ]);
    expect(splitFolderPath("  Unit 3  /  Enzymes  ")).toEqual([
      "Unit 3",
      "Enzymes",
    ]);
  });

  it("treats empty and blank paths as the root folder", () => {
    expect(splitFolderPath("")).toEqual([]);
    expect(splitFolderPath("   ")).toEqual([]);
    expect(splitFolderPath("///")).toEqual([]);
  });

  it("round-trips segments through joinFolderPath", () => {
    expect(joinFolderPath(["Unit 3", "Enzymes"])).toBe("Unit 3/Enzymes");
    expect(joinFolderPath([])).toBe("");
  });

  it("drops the last segment for the parent folder", () => {
    expect(parentFolderSegments(["Unit 3", "Enzymes"])).toEqual(["Unit 3"]);
    expect(parentFolderSegments(["Unit 3"])).toEqual([]);
    expect(parentFolderSegments([])).toEqual([]);
  });

  it("keys the root as an empty string and deeper folders by path", () => {
    expect(folderPathKey([])).toBe("");
    expect(folderPathKey(["Unit 3", "Enzymes"])).toBe("Unit 3/Enzymes");
  });
});

describe("buildBreadcrumbItems", () => {
  it("always starts with the Documents root", () => {
    const items = buildBreadcrumbItems([]);
    expect(items).toEqual([
      { key: "documents-root", label: "Documents", depth: 0 },
    ]);
  });

  it("appends one clickable item per folder level", () => {
    expect(buildBreadcrumbItems(["Unit 3", "Enzymes"])).toEqual([
      { key: "documents-root", label: "Documents", depth: 0 },
      { key: "documents-1", label: "Unit 3", depth: 1 },
      { key: "documents-2", label: "Enzymes", depth: 2 },
    ]);
  });
});

describe("normalizeFolderPath", () => {
  it("accepts null, undefined and empty strings as root", () => {
    expect(normalizeFolderPath(null)).toEqual([]);
    expect(normalizeFolderPath(undefined)).toEqual([]);
    expect(normalizeFolderPath("")).toEqual([]);
  });

  it("splits a plain string path", () => {
    expect(normalizeFolderPath("Unit 3/Enzymes")).toEqual([
      "Unit 3",
      "Enzymes",
    ]);
  });

  it("parses a JSON array rendered as text (PostgREST projection)", () => {
    expect(normalizeFolderPath('["Unit 3","Enzymes"]')).toEqual([
      "Unit 3",
      "Enzymes",
    ]);
  });

  it("accepts an actual array of strings", () => {
    expect(normalizeFolderPath(["Unit 3", "Enzymes"])).toEqual([
      "Unit 3",
      "Enzymes",
    ]);
  });

  it("degrades unparseable text to root", () => {
    expect(normalizeFolderPath("[not json")).toEqual([]);
    expect(normalizeFolderPath(42)).toEqual([]);
  });
});

describe("toDocumentFileEntry", () => {
  it("maps a row to a file entry with normalized folder segments", () => {
    const entry = toDocumentFileEntry(
      {
        id: "m-1",
        source_type: "local_upload",
        original_filename: "chapter.pdf",
        byte_size: 1024,
        status: "ready",
        charCount: 1200,
        created_at: "2026-08-02T12:00:00.000Z",
        folder_path: '["Unit 3","Enzymes"]',
      },
      "AP Biology",
    );
    expect(entry).toMatchObject({
      id: "m-1",
      kind: "file",
      name: "chapter.pdf",
      sourceType: "local_upload",
      byteSize: 1024,
      status: "ready",
      charCount: 1200,
      workspaceTitle: "AP Biology",
      folderSegments: ["Unit 3", "Enzymes"],
    });
  });

  it("keeps files without a folder at the workspace root", () => {
    const entry = toDocumentFileEntry(
      {
        id: "m-2",
        source_type: "local_upload",
        original_filename: "notes.txt",
        byte_size: null,
        status: "uploaded",
        charCount: null,
        created_at: "2026-08-02T12:00:00.000Z",
      },
      "AP Biology",
    );
    expect(entry.folderSegments).toEqual([]);
    expect(entry.byteSize).toBeNull();
  });
});

describe("groupFolderContents", () => {
  const entry = (
    id: string,
    name: string,
    folder: string[],
    createdAt = "2026-08-02T12:00:00.000Z",
  ): DocumentFileEntry => ({
    id,
    kind: "file",
    name,
    sourceType: "local_upload",
    byteSize: null,
    status: "ready",
    charCount: null,
    createdAt,
    workspaceTitle: "AP Biology",
    folderSegments: folder,
  });

  it("shows immediate subfolders and root-level files at the root", () => {
    const contents = groupFolderContents(
      [
        entry("f1", "handout.pdf", ["Unit 3"]),
        entry("f2", "notes.txt", ["Unit 4"]),
        entry("f3", "deep.pdf", ["Unit 3", "Enzymes"]),
        entry("f4", "syllabus.pdf", []),
      ],
      [],
    );
    expect(contents.folders.map((folder) => folder.name)).toEqual([
      "Unit 3",
      "Unit 4",
    ]);
    expect(contents.folders[0]?.path).toEqual(["Unit 3"]);
    expect(contents.files.map((file) => file.name)).toEqual(["syllabus.pdf"]);
  });

  it("descends into a folder and hides siblings", () => {
    const contents = groupFolderContents(
      [
        entry("f1", "handout.pdf", ["Unit 3"]),
        entry("f3", "deep.pdf", ["Unit 3", "Enzymes"]),
        entry("f4", "syllabus.pdf", []),
      ],
      ["Unit 3"],
    );
    expect(contents.folders.map((folder) => folder.name)).toEqual([
      "Enzymes",
    ]);
    expect(contents.files.map((file) => file.name)).toEqual(["handout.pdf"]);
  });

  it("sorts files newest-first", () => {
    const contents = groupFolderContents(
      [
        entry("old", "old.pdf", [], "2026-08-01T12:00:00.000Z"),
        entry("new", "new.pdf", [], "2026-08-02T12:00:00.000Z"),
      ],
      [],
    );
    expect(contents.files.map((file) => file.id)).toEqual(["new", "old"]);
  });
});

describe("toGeneratedMaterialEntry", () => {
  it("maps a persisted worksheet block to a generated entry", () => {
    const entry = toGeneratedMaterialEntry({
      id: "m-1",
      original_filename: "chapter.pdf",
      worksheet: {
        worksheet: {
          title: "Enzymes Worksheet",
          questions: [{ id: "q1" }, { id: "q2" }],
        },
        model: "deepseek-v4-flash",
        generated_at: "2026-08-02T12:00:00.000Z",
        truncated_source: true,
      },
    });
    expect(entry?.kind).toBe("generated");
    if (entry?.kind === "generated") {
      expect(entry).toMatchObject({
        materialId: "m-1",
        title: "Enzymes Worksheet",
        sourceFilename: "chapter.pdf",
        questionCount: 2,
        model: "deepseek-v4-flash",
        generatedAt: "2026-08-02T12:00:00.000Z",
        truncatedSource: true,
      });
    }
  });

  it("maps a recorded generate failure (no worksheet) to a failed entry", () => {
    const entry = toGeneratedMaterialEntry({
      id: "m-2",
      original_filename: "chapter.pdf",
      worksheet: {
        last_error: {
          message: "Worksheet generation timed out — try again.",
        },
      },
    });
    expect(entry?.kind).toBe("failed");
    if (entry?.kind === "failed") {
      expect(entry.error).toMatch(/timed out/);
      expect(entry.materialId).toBe("m-2");
    }
  });

  it("returns null when there is no worksheet block", () => {
    expect(
      toGeneratedMaterialEntry({ id: "m-3", original_filename: "a.pdf" }),
    ).toBeNull();
    expect(
      toGeneratedMaterialEntry({
        id: "m-4",
        original_filename: "a.pdf",
        worksheet: null,
      }),
    ).toBeNull();
  });

  it("returns null for a block with neither worksheet nor error", () => {
    expect(
      toGeneratedMaterialEntry({
        id: "m-5",
        original_filename: "a.pdf",
        worksheet: { model: "deepseek-v4-flash" },
      }),
    ).toBeNull();
  });
});

describe("workspaceInitials", () => {
  it("uses the first two words for multi-word titles", () => {
    expect(workspaceInitials("AP Biology · Period 2")).toBe("AB");
    expect(workspaceInitials("Algebra II")).toBe("AI");
  });

  it("caps single-word titles at two characters", () => {
    expect(workspaceInitials("Chemistry")).toBe("CH");
    expect(workspaceInitials("C")).toBe("C");
  });

  it("falls back for blank titles", () => {
    expect(workspaceInitials("   ")).toBe("?");
  });
});

describe("describeWorkspaceSelector", () => {
  const workspaces: WorkspaceSummary[] = [
    {
      id: "w-1",
      title: "AP Biology",
      description: null,
      created_at: "2026-08-02T12:00:00.000Z",
    },
    {
      id: "w-2",
      title: "Chemistry",
      description: null,
      created_at: "2026-08-01T12:00:00.000Z",
    },
  ];

  it("reports loading first", () => {
    const state = describeWorkspaceSelector([], null, true, true);
    expect(state.phase).toBe("loading");
  });

  it("reports unavailable when the schema isn't applied", () => {
    const state = describeWorkspaceSelector([], null, false, false);
    expect(state.phase).toBe("unavailable");
    if (state.phase === "unavailable") {
      expect(state.caption).toMatch(/migration/);
    }
  });

  it("reports empty when there are no workspaces", () => {
    const state = describeWorkspaceSelector([], null, false, true);
    expect(state.phase).toBe("empty");
  });

  it("uses the explicit selection when it still exists", () => {
    const state = describeWorkspaceSelector(workspaces, "w-2", false, true);
    expect(state.phase).toBe("ready");
    if (state.phase === "ready") {
      expect(state.current.id).toBe("w-2");
      expect(state.label).toBe("Chemistry");
    }
  });

  it("falls back to the most recent workspace for a stale selection", () => {
    const state = describeWorkspaceSelector(workspaces, "w-gone", false, true);
    expect(state.phase).toBe("ready");
    if (state.phase === "ready") {
      expect(state.current.id).toBe("w-1");
    }
  });
});

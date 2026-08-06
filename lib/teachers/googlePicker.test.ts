import { describe, expect, it } from "vitest";
import {
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  describeGoogleDriveImportGate,
  driveDocsViewOptions,
  isGoogleDriveFolder,
  normalizeGoogleDrivePicks,
  readGooglePickerPublicConfig,
  toGoogleDrivePick,
  type GoogleDrivePick,
} from "./googlePicker";

describe("readGooglePickerPublicConfig", () => {
  it("returns null when either public env var is missing", () => {
    expect(readGooglePickerPublicConfig({})).toBeNull();
    expect(
      readGooglePickerPublicConfig({ apiKey: "key-123" }),
    ).toBeNull();
    expect(
      readGooglePickerPublicConfig({ cloudProjectNumber: "123456789" }),
    ).toBeNull();
  });

  it("returns null for blank or whitespace-only values", () => {
    expect(
      readGooglePickerPublicConfig({
        apiKey: "   ",
        cloudProjectNumber: "123456789",
      }),
    ).toBeNull();
    expect(
      readGooglePickerPublicConfig({ apiKey: "key-123", cloudProjectNumber: "" }),
    ).toBeNull();
  });

  it("reads both values when present and trims them", () => {
    expect(
      readGooglePickerPublicConfig({
        apiKey: "  key-123  ",
        cloudProjectNumber: "  987654321  ",
      }),
    ).toEqual({ apiKey: "key-123", cloudProjectNumber: "987654321" });
  });
});

describe("describeGoogleDriveImportGate", () => {
  const publicConfig = { apiKey: "key-123", cloudProjectNumber: "123" };

  it("is available only with both config and a provider token", () => {
    expect(
      describeGoogleDriveImportGate({ publicConfig, hasProviderToken: true }),
    ).toEqual({ available: true });
  });

  it("reports not-configured with Picker setup copy when config is absent", () => {
    const gate = describeGoogleDriveImportGate({
      publicConfig: null,
      hasProviderToken: true,
    });
    expect(gate.available).toBe(false);
    if (!gate.available) {
      expect(gate.reason).toBe("not-configured");
      expect(gate.caption).toMatch(/Google Picker API/);
      expect(gate.caption).toMatch(/browser-restricted API key/);
      expect(gate.caption).toMatch(/NEXT_PUBLIC_GOOGLE_PICKER_API_KEY/);
      expect(gate.caption).toMatch(/NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER/);
      expect(gate.caption).toMatch(/read-only|drive\.file/);
    }
  });

  it("reports no-provider-token with reauthorize copy when the token is absent", () => {
    const gate = describeGoogleDriveImportGate({
      publicConfig,
      hasProviderToken: false,
    });
    expect(gate.available).toBe(false);
    if (!gate.available) {
      expect(gate.reason).toBe("no-provider-token");
      expect(gate.caption).toMatch(/read-only|drive\.file/);
      expect(gate.caption).toMatch(/sign out and sign back in/i);
    }
  });

  it("explains the read-only Drive authorization requirement", () => {
    const notConfigured = describeGoogleDriveImportGate({
      publicConfig: null,
      hasProviderToken: true,
    });
    const noToken = describeGoogleDriveImportGate({
      publicConfig,
      hasProviderToken: false,
    });
    const captions = [notConfigured, noToken]
      .filter(
        (gate): gate is Extract<typeof gate, { available: false }> =>
          !gate.available,
      )
      .map((gate) => gate.caption);
    expect(captions.join(" ")).toMatch(/read-only|read access/i);
    expect(captions.join(" ")).toMatch(/explicitly selected|Picker folder/i);
  });
});

describe("isGoogleDriveFolder", () => {
  it("recognizes the Drive folder MIME type only", () => {
    expect(isGoogleDriveFolder(GOOGLE_DRIVE_FOLDER_MIME_TYPE)).toBe(true);
    expect(isGoogleDriveFolder("application/pdf")).toBe(false);
    expect(isGoogleDriveFolder("")).toBe(false);
  });
});

describe("toGoogleDrivePick / normalizeGoogleDrivePicks", () => {
  it("normalizes a file pick", () => {
    expect(
      toGoogleDrivePick({
        id: "file-1",
        name: "Unit 3 Notes.pdf",
        mimeType: "application/pdf",
      }),
    ).toEqual({
      id: "file-1",
      name: "Unit 3 Notes.pdf",
      mimeType: "application/pdf",
      kind: "file",
    });
  });

  it("normalizes a folder pick by MIME type", () => {
    expect(
      toGoogleDrivePick({
        id: "folder-1",
        name: "Enzymes",
        mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
      }),
    ).toEqual({
      id: "folder-1",
      name: "Enzymes",
      mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
      kind: "folder",
    });
  });

  it("drops entries without id, name or mimeType", () => {
    expect(toGoogleDrivePick(null)).toBeNull();
    expect(toGoogleDrivePick(undefined)).toBeNull();
    expect(toGoogleDrivePick("pdf")).toBeNull();
    expect(toGoogleDrivePick({ id: "x" })).toBeNull();
    expect(toGoogleDrivePick({ id: "x", name: "y" })).toBeNull();
    expect(toGoogleDrivePick({ id: "x", name: "y", mimeType: "" })).toBeNull();
  });

  it("normalizes the whole docs array and skips garbage", () => {
    const picks = normalizeGoogleDrivePicks([
      { id: "f1", name: "A.pdf", mimeType: "application/pdf" },
      { id: "d1", name: "Folder", mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE },
      null,
      { id: "f2" },
    ]);
    expect(picks.map((pick) => pick.id)).toEqual(["f1", "d1"]);
    expect(picks[1]?.kind).toBe("folder");
  });

  it("returns an empty array for non-array docs", () => {
    expect(normalizeGoogleDrivePicks(undefined)).toEqual([]);
    expect(normalizeGoogleDrivePicks({})).toEqual([]);
    expect(normalizeGoogleDrivePicks("docs")).toEqual([]);
  });

  it("preserves exact ids and metadata for typed callbacks", () => {
    const picks: GoogleDrivePick[] = normalizeGoogleDrivePicks([
      { id: "  abc123  ", name: "  Notes  ", mimeType: " text/plain " },
    ]);
    expect(picks[0]?.id).toBe("abc123");
    expect(picks[0]?.name).toBe("Notes");
    expect(picks[0]?.mimeType).toBe("text/plain");
  });
});

describe("driveDocsViewOptions", () => {
  it("always shows folders for navigation", () => {
    expect(driveDocsViewOptions("files").includeFolders).toBe(true);
    expect(driveDocsViewOptions("folders").includeFolders).toBe(true);
  });

  it("enables folder selection only in folders mode", () => {
    expect(driveDocsViewOptions("files").selectFolderEnabled).toBe(false);
    expect(driveDocsViewOptions("folders").selectFolderEnabled).toBe(true);
  });
});

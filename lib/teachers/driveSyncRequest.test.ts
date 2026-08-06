import { describe, expect, it } from "vitest";
import {
  MAX_DRIVE_ERROR_CHARS,
  MAX_DRIVE_FILE_ID_CHARS,
  boundDriveFileId,
  boundDriveSyncError,
  boundDriveSyncInput,
  isDriveSyncUpdateStatus,
} from "./driveSyncRequest";

describe("boundDriveFileId", () => {
  it("accepts a normal base64url-style Drive id", () => {
    expect(boundDriveFileId("1Ab_Cd-9xYz")).toEqual({
      ok: true,
      id: "1Ab_Cd-9xYz",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(boundDriveFileId("  1Ab_Cd  ")).toEqual({
      ok: true,
      id: "1Ab_Cd",
    });
  });

  it("rejects non-strings and blanks", () => {
    expect(boundDriveFileId(42).ok).toBe(false);
    expect(boundDriveFileId(null).ok).toBe(false);
    expect(boundDriveFileId("").ok).toBe(false);
    expect(boundDriveFileId("   ").ok).toBe(false);
  });

  it("rejects unsafe characters (path separators, control chars)", () => {
    expect(boundDriveFileId("../etc/passwd").ok).toBe(false);
    expect(boundDriveFileId("a/b").ok).toBe(false);
    expect(boundDriveFileId("a b").ok).toBe(false);
    expect(boundDriveFileId("a\u0000b").ok).toBe(false);
  });

  it("rejects over-long ids", () => {
    const result = boundDriveFileId("a".repeat(MAX_DRIVE_FILE_ID_CHARS + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("too long");
  });
});

describe("boundDriveSyncError", () => {
  it("accepts absent/blank errors as null", () => {
    expect(boundDriveSyncError(undefined)).toEqual({ ok: true, error: null });
    expect(boundDriveSyncError(null)).toEqual({ ok: true, error: null });
    expect(boundDriveSyncError("   ")).toEqual({ ok: true, error: null });
  });

  it("trims and bounds a real message", () => {
    expect(boundDriveSyncError("  quota exceeded  ")).toEqual({
      ok: true,
      error: "quota exceeded",
    });
  });

  it("rejects non-strings and over-long messages", () => {
    expect(boundDriveSyncError(42).ok).toBe(false);
    const result = boundDriveSyncError("x".repeat(MAX_DRIVE_ERROR_CHARS + 1));
    expect(result.ok).toBe(false);
  });
});

describe("isDriveSyncUpdateStatus", () => {
  it("accepts pending, synced, failed", () => {
    expect(isDriveSyncUpdateStatus("pending")).toBe(true);
    expect(isDriveSyncUpdateStatus("synced")).toBe(true);
    expect(isDriveSyncUpdateStatus("failed")).toBe(true);
  });

  it("rejects not_applicable and anything else", () => {
    expect(isDriveSyncUpdateStatus("not_applicable")).toBe(false);
    expect(isDriveSyncUpdateStatus("")).toBe(false);
    expect(isDriveSyncUpdateStatus(undefined)).toBe(false);
    expect(isDriveSyncUpdateStatus("SYNCED")).toBe(false);
  });
});

describe("boundDriveSyncInput", () => {
  it("accepts a full valid body", () => {
    expect(
      boundDriveSyncInput({
        driveFileId: "1Ab_Cd",
        status: "synced",
        error: null,
      }),
    ).toEqual({ ok: true, driveFileId: "1Ab_Cd", status: "synced", error: null });
  });

  it("accepts a failed body with a bounded error", () => {
    expect(
      boundDriveSyncInput({
        driveFileId: "1Ab_Cd",
        status: "failed",
        error: "  quota exceeded  ",
      }),
    ).toEqual({
      ok: true,
      driveFileId: "1Ab_Cd",
      status: "failed",
      error: "quota exceeded",
    });
  });

  it("rejects an unsafe file id", () => {
    expect(
      boundDriveSyncInput({ driveFileId: "../x", status: "pending" }).ok,
    ).toBe(false);
  });

  it("rejects an invalid status (including not_applicable)", () => {
    expect(
      boundDriveSyncInput({ driveFileId: "1Ab_Cd", status: "not_applicable" })
        .ok,
    ).toBe(false);
    expect(
      boundDriveSyncInput({ driveFileId: "1Ab_Cd", status: "banana" }).ok,
    ).toBe(false);
  });

  it("rejects an invalid error field", () => {
    expect(
      boundDriveSyncInput({ driveFileId: "1Ab_Cd", status: "failed", error: 7 })
        .ok,
    ).toBe(false);
  });
});

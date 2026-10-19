import { ORPCError } from "@orpc/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { uploadErrorLabel, UploadPutError } from "./upload-errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("uploadErrorLabel", () => {
  test("a missing storage adapter explains itself", () => {
    const error = new ORPCError("CONFLICT", {
      status: 409,
      data: { reason: "storage_not_configured" },
    });

    expect(uploadErrorLabel(error).message).toBe(
      "No storage adapter is wired up — set `storage:` in plumix.config.ts.",
    );
  });

  test("a save from a stale copy says the item changed elsewhere", () => {
    const error = new ORPCError("CONFLICT", {
      status: 409,
      data: { reason: "etag_mismatch", etag: "101" },
    });

    expect(uploadErrorLabel(error).message).toBe(
      "This item was changed elsewhere since you opened it, so your edit wasn't saved. Its latest version is shown now.",
    );
  });

  test("a PUT refused as too large says the file exceeds the cap", () => {
    expect(uploadErrorLabel(UploadPutError.rejected(413)).message).toBe(
      "File exceeds the configured maxUploadSize.",
    );
  });

  test("an unmapped failure shows the generic copy and logs the original", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new ORPCError("CONFLICT", { status: 409 });

    expect(uploadErrorLabel(error).message).toBe(
      "Something went wrong. Try again.",
    );
    expect(log).toHaveBeenCalledWith(error);
  });
});

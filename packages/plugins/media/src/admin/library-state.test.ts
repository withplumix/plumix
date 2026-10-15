import { describe, expect, test } from "vitest";

import { libraryUploadState } from "./library-state.js";

describe("libraryUploadState", () => {
  test("without a storage slot, the empty library explains that uploads need one", () => {
    expect(libraryUploadState(false).emptyState).toBe("storage-required");
  });

  test("without a storage slot, there is no upload button", () => {
    expect(libraryUploadState(false).offerUpload).toBe(false);
  });

  test("without a storage slot, a dropped file is not accepted", () => {
    expect(libraryUploadState(false).acceptDrops).toBe(false);
  });

  test("with a storage slot, it offers the upload button, the dropzone and drops", () => {
    expect(libraryUploadState(true)).toEqual({
      offerUpload: true,
      acceptDrops: true,
      emptyState: "dropzone",
    });
  });
});

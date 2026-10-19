import { describe, expect, test } from "vitest";

import { adoptEtag, copyEtag, libraryUploadState } from "./library-state.js";

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

describe("copyEtag", () => {
  test("with no save yet, the copy carries the listed etag", () => {
    expect(copyEtag("100", undefined)).toBe("100");
  });

  test("until the list refetches, the copy carries the etag the save returned", () => {
    expect(copyEtag("100", adoptEtag(undefined, "100", "101"))).toBe("101");
  });

  test("once the list shows a different etag, the copy carries the list's", () => {
    expect(copyEtag("105", adoptEtag(undefined, "100", "101"))).toBe("105");
  });

  test("a refetch from an earlier save of a chain still carries the latest save's etag", () => {
    const first = adoptEtag(undefined, "100", "101");
    const second = adoptEtag(first, "101", "102");

    expect(copyEtag("101", second)).toBe("102");
    expect(copyEtag("100", second)).toBe("102");
    expect(copyEtag("102", second)).toBe("102");
  });
});

import { describe, expect, test } from "vitest";

import {
  altNeedsSave,
  libraryUploadState,
  withSavedMedia,
} from "./library-state.js";

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

describe("withSavedMedia", () => {
  const page = (
    ...items: { id: number; alt: string | null; etag: string }[]
  ) => ({
    items,
    hasMore: false,
  });

  test("a saved item takes the answer's alt and etag on whichever page it is", () => {
    const data = {
      pageParams: [0, 1],
      pages: [
        page({ id: 1, alt: null, etag: "100" }),
        page({ id: 2, alt: "old", etag: "200" }),
      ],
    };

    const next = withSavedMedia(data, { id: 2, alt: "new", etag: "201" });

    expect(next.pages[1]?.items).toEqual([{ id: 2, alt: "new", etag: "201" }]);
  });

  test("the other items keep their alt and etag", () => {
    const data = {
      pageParams: [0],
      pages: [
        page(
          { id: 1, alt: "kept", etag: "100" },
          { id: 2, alt: "old", etag: "200" },
        ),
      ],
    };

    const next = withSavedMedia(data, { id: 2, alt: "new", etag: "201" });

    expect(next.pages[0]?.items[0]).toEqual({
      id: 1,
      alt: "kept",
      etag: "100",
    });
  });
});

describe("altNeedsSave", () => {
  test("an edited draft needs a save", () => {
    expect(altNeedsSave("new", "old", "old")).toBe(true);
  });

  test("a draft equal to what is shown needs none", () => {
    expect(altNeedsSave("same", "same", "other")).toBe(false);
  });

  test("a draft just saved needs none, before the list shows it", () => {
    expect(altNeedsSave("new", "old", "new")).toBe(false);
  });
});

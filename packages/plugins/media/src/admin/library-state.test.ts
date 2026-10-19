import { describe, expect, test } from "vitest";

import type { AdoptedEtag } from "./library-state.js";
import {
  adoptEtag,
  copyEtag,
  libraryUploadState,
  saveFromCopy,
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

describe("saveFromCopy", () => {
  const item = { id: 7, etag: "100" };

  test("sends the listed etag and hands back what the save returned", async () => {
    const sent: string[] = [];

    const saved = await saveFromCopy(
      new Map<number, AdoptedEtag>(),
      item,
      (ifMatch) => {
        sent.push(ifMatch);
        return Promise.resolve({ etag: "101", alt: "a" });
      },
    );

    expect(sent).toEqual(["100"]);
    expect(saved).toEqual({ etag: "101", alt: "a" });
  });

  test("a second save from the same copy sends the etag the first returned", async () => {
    const adopted = new Map<number, AdoptedEtag>();
    const sent: string[] = [];
    const answers = ["101", "102"];
    const save = (ifMatch: string) => {
      sent.push(ifMatch);
      return Promise.resolve({ etag: answers.shift() ?? "" });
    };

    await saveFromCopy(adopted, item, save);
    await saveFromCopy(adopted, item, save);

    expect(sent).toEqual(["100", "101"]);
  });

  test("a save that fails leaves the next one on the listed etag", async () => {
    const adopted = new Map<number, AdoptedEtag>();
    const sent: string[] = [];

    await expect(
      saveFromCopy(adopted, item, () => Promise.reject(new Error("conflict"))),
    ).rejects.toThrow("conflict");
    await saveFromCopy(adopted, item, (ifMatch) => {
      sent.push(ifMatch);
      return Promise.resolve({ etag: "101" });
    });

    expect(sent).toEqual(["100"]);
  });

  test("another item's saves don't change the etag sent", async () => {
    const adopted = new Map<number, AdoptedEtag>();
    const sent: string[] = [];
    await saveFromCopy(adopted, { id: 8, etag: "100" }, () =>
      Promise.resolve({ etag: "101" }),
    );

    await saveFromCopy(adopted, item, (ifMatch) => {
      sent.push(ifMatch);
      return Promise.resolve({ etag: "102" });
    });

    expect(sent).toEqual(["100"]);
  });
});

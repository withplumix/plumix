import { describe, expect, test } from "vitest";

import { describeObjectStorageContract } from "./conformance/object-storage.js";
import { fakeStorage } from "./storage-fake.js";

describe("fakeStorage", () => {
  describeObjectStorageContract({
    connect: fakeStorage,
    publicUrls: true,
    presign: true,
    upload: (bucket, request) => bucket.fetch(request),
  });
});

describe("assertStored", () => {
  test("passes for a stored key", async () => {
    const storage = fakeStorage();
    await storage.put("a.png", "a");

    await expect(storage.assertStored("a.png")).resolves.toBeUndefined();
  });

  test("fails listing what is stored", async () => {
    const storage = fakeStorage();
    await storage.put("b.png", "b");
    await storage.put("a.png", "a");

    await expect(storage.assertStored("c.png")).rejects.toThrow(
      'Expected "c.png" to be stored, but it is not.\n' +
        "Stored:\n  - a.png\n  - b.png",
    );
  });

  test("fails saying nothing is stored", async () => {
    await expect(fakeStorage().assertStored("a.png")).rejects.toThrow(
      'Expected "a.png" to be stored, but it is not.\nNothing is stored.',
    );
  });
});

describe("assertMissing", () => {
  test("passes for a key not stored", async () => {
    await expect(fakeStorage().assertMissing("a.png")).resolves.toBeUndefined();
  });

  test("fails listing what is stored", async () => {
    const storage = fakeStorage();
    await storage.put("a.png", "a");

    await expect(storage.assertMissing("a.png")).rejects.toThrow(
      'Expected "a.png" not to be stored, but it is.\nStored:\n  - a.png',
    );
  });
});

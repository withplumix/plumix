import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeObjectStorageContract } from "plumix/test/conformance";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { diskStorage } from "./disk-storage.js";

let base: string;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "plumix-bun-storage-"));
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describeObjectStorageContract({
  // A fresh directory per case, as the contract asks; it need not exist yet.
  connect: () =>
    diskStorage({ dir: mkdtempSync(join(base, "bucket-")) }).connect({}),
});

describe("diskStorage", () => {
  test("a key that escapes the directory is refused before the filesystem is touched", async () => {
    const dir = join(base, "untouched");
    const storage = diskStorage({ dir }).connect({});

    for (const key of ["../escape", "/etc/passwd", "a/../../escape", ""]) {
      await expect(storage.put(key, "x"), key).rejects.toMatchObject({
        code: "key_escapes_directory",
      });
    }
    expect(existsSync(dir)).toBe(false);
  });

  // A `BunFile` caches its stat, so a handle that has answered `exists()`
  // keeps answering it after the file is gone.
  test("an object read before it was deleted is gone afterwards", async () => {
    const storage = diskStorage({ dir: join(base, "deleted") }).connect({});
    await storage.put("k", "v");
    expect(await storage.head("k")).not.toBeNull();
    expect(await storage.get("k")).not.toBeNull();

    await storage.delete("k");

    expect(await storage.head("k")).toBeNull();
    expect(await storage.get("k")).toBeNull();
  });
});

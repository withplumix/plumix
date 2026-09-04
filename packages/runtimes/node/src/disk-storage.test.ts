import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeObjectStorageContract } from "plumix/test/conformance";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { diskStorage } from "./disk-storage.js";

let base: string;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "plumix-node-storage-"));
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

  test("keys are files under objects/, metadata beside them under meta/", async () => {
    const dir = join(base, "layout");
    const storage = diskStorage({ dir }).connect({});
    await storage.put("media/2026/cat.png", "bytes", {
      contentType: "image/png",
    });

    expect(readFileSync(join(dir, "objects/media/2026/cat.png"), "utf8")).toBe(
      "bytes",
    );
    expect(
      JSON.parse(
        readFileSync(join(dir, "meta/media/2026/cat.png.json"), "utf8"),
      ),
    ).toMatchObject({ size: 5, contentType: "image/png" });
  });

  test("list walks in key order and the cursor is the last key served", async () => {
    const storage = diskStorage({ dir: join(base, "listing") }).connect({});
    for (const key of ["c", "a/2", "a/1", "b"]) await storage.put(key, key);

    const first = await storage.list(undefined, { limit: 3 });
    expect(first.items.map((item) => item.key)).toEqual(["a/1", "a/2", "b"]);
    expect(first).toMatchObject({ truncated: true, cursor: "b" });

    const rest = await storage.list(undefined, {
      cursor: first.cursor,
      limit: 3,
    });
    expect(rest.items.map((item) => item.key)).toEqual(["c"]);
    expect(rest).toMatchObject({ truncated: false, cursor: undefined });
  });

  test("a ranged read at or past the end returns an empty window rather than throwing", async () => {
    const storage = diskStorage({ dir: join(base, "ranges") }).connect({});
    await storage.put("ten", "0123456789");
    await storage.put("empty", null);

    for (const [key, offset] of [
      ["ten", 10],
      ["ten", 12],
      ["empty", 0],
    ] as const) {
      const got = await storage.get(key, { range: { offset, length: 4 } });
      expect(
        new Uint8Array((await got?.arrayBuffer()) ?? new ArrayBuffer(1)),
        key,
      ).toHaveLength(0);
    }
  });

  test.skipIf(!existsSync("/dev/fd"))(
    "a body nobody reads holds no file descriptor",
    async () => {
      const storage = diskStorage({ dir: join(base, "fds") }).connect({});
      await storage.put("big", new Uint8Array(1024 * 1024));
      const before = readdirSync("/dev/fd").length;

      for (let i = 0; i < 50; i++) await storage.get("big");

      expect(readdirSync("/dev/fd").length).toBeLessThanOrEqual(before + 1);
    },
  );

  test("a key that resolves inside the tree is one key for both its bytes and its metadata", async () => {
    const dir = join(base, "aliases");
    const storage = diskStorage({ dir }).connect({});
    await storage.put("../objects/x", "v", { contentType: "text/plain" });

    expect((await storage.head("x"))?.contentType).toBe("text/plain");
    expect(existsSync(join(dir, "objects/x.json"))).toBe(false);
    expect((await storage.list()).items.map((item) => item.key)).toEqual(["x"]);
  });

  test("a put whose body fails leaves nothing behind", async () => {
    const dir = join(base, "failed");
    const storage = diskStorage({ dir }).connect({});
    const failing = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.error(new Error("client went away"));
      },
    });

    await expect(storage.put("half", failing)).rejects.toThrow(
      "client went away",
    );
    expect(await storage.get("half")).toBeNull();
    const files = readdirSync(dir, {
      recursive: true,
      withFileTypes: true,
    }).filter((entry) => entry.isFile());
    expect(files).toEqual([]);
  });
});

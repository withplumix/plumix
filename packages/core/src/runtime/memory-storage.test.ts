import { describe, expect, test } from "vitest";

import type { GetResult } from "./slots.js";
import { memoryStorage } from "./memory-storage.js";

function connect(
  config?: Parameters<typeof memoryStorage>[0],
): ReturnType<ReturnType<typeof memoryStorage>["connect"]> {
  return memoryStorage(config).connect({});
}

// Helper so every round-trip assertion narrows the nullable `get` result
// without a non-null assertion. Tests expect the object to exist; if the
// storage layer returns null we want a readable failure.
async function getOrThrow(
  s: ReturnType<typeof connect>,
  key: string,
): Promise<GetResult> {
  const got = await s.get(key);
  if (!got) throw new Error(`memoryStorage test fixture missing key "${key}"`);
  return got;
}

describe("memoryStorage put/get", () => {
  test("round-trips a string body via get().arrayBuffer()", async () => {
    const s = connect();
    await s.put("hello.txt", "world", { contentType: "text/plain" });
    const got = await getOrThrow(s, "hello.txt");
    expect(got.size).toBe(5);
    expect(got.contentType).toBe("text/plain");
    const bytes = new Uint8Array(await got.arrayBuffer());
    expect(new TextDecoder().decode(bytes)).toBe("world");
  });

  test("round-trips a Uint8Array body", async () => {
    const s = connect();
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    await s.put("binary", payload);
    const got = await getOrThrow(s, "binary");
    expect(got.size).toBe(5);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(payload);
  });

  test("round-trips a ReadableStream body", async () => {
    const s = connect();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1, 2]));
        c.enqueue(new Uint8Array([3, 4]));
        c.close();
      },
    });
    await s.put("chunks", stream);
    const got = await getOrThrow(s, "chunks");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
  });

  test("get on a missing key returns null", async () => {
    const s = connect();
    expect(await s.get("nope")).toBeNull();
  });

  test("put overwrites the previous value", async () => {
    const s = connect();
    await s.put("k", "first");
    await s.put("k", "second");
    const got = await getOrThrow(s, "k");
    expect(
      new TextDecoder().decode(new Uint8Array(await got.arrayBuffer())),
    ).toBe("second");
  });

  test("custom metadata round-trips on put/get", async () => {
    const s = connect();
    await s.put("k", "v", { customMetadata: { owner: "alice" } });
    const got = await getOrThrow(s, "k");
    expect(got.customMetadata).toEqual({ owner: "alice" });
  });

  test("etag is stable for the same bytes and changes after a write", async () => {
    const s = connect();
    await s.put("k", "abc");
    const first = (await getOrThrow(s, "k")).etag;
    await s.put("k", "abc");
    expect((await getOrThrow(s, "k")).etag).toBe(first);
    await s.put("k", "abcd");
    expect((await getOrThrow(s, "k")).etag).not.toBe(first);
  });
});

describe("memoryStorage delete", () => {
  test("delete removes the key", async () => {
    const s = connect();
    await s.put("k", "v");
    await s.delete("k");
    expect(await s.get("k")).toBeNull();
  });

  test("delete on a missing key is a no-op", async () => {
    const s = connect();
    await expect(s.delete("nope")).resolves.toBeUndefined();
  });
});

describe("memoryStorage list", () => {
  test("lists all keys sorted when no prefix is set", async () => {
    const s = connect();
    await s.put("c", "");
    await s.put("a", "");
    await s.put("b", "");
    const out = await s.list();
    expect(out.items.map((i) => i.key)).toEqual(["a", "b", "c"]);
  });

  test("filters by prefix", async () => {
    const s = connect();
    await s.put("media/1.jpg", "");
    await s.put("media/2.jpg", "");
    await s.put("docs/x.pdf", "");
    const out = await s.list("media/");
    expect(out.items.map((i) => i.key)).toEqual(["media/1.jpg", "media/2.jpg"]);
  });

  test("paginates via cursor + limit", async () => {
    const s = connect();
    for (let i = 0; i < 5; i++) await s.put(`k${i}`, "");
    const first = await s.list(undefined, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.truncated).toBe(true);
    expect(first.cursor).toBeDefined();
    const second = await s.list(undefined, {
      limit: 2,
      cursor: first.cursor,
    });
    expect(second.items.map((i) => i.key)).toEqual(["k2", "k3"]);
    const third = await s.list(undefined, { limit: 2, cursor: second.cursor });
    expect(third.items.map((i) => i.key)).toEqual(["k4"]);
    expect(third.truncated).toBe(false);
    expect(third.cursor).toBeUndefined();
  });
});

describe("memoryStorage url", () => {
  test("returns default `/_plumix/memory-storage/<key>` URL", async () => {
    const s = connect();
    expect(await s.url("a/b.jpg")).toBe("/_plumix/memory-storage/a%2Fb.jpg");
  });

  test("respects a custom publicUrlBase", async () => {
    const s = connect({ publicUrlBase: "https://dev.local/storage/" });
    expect(await s.url("x.jpg")).toBe("https://dev.local/storage/x.jpg");
  });
});

describe("memoryStorage presignPut", () => {
  test("returns a PUT descriptor with the requested content type", async () => {
    const s = connect();
    if (!s.presignPut)
      throw new Error("memory adapter must implement presignPut");
    const pre = await s.presignPut("upload/1", {
      contentType: "image/jpeg",
      expiresIn: 60,
    });
    expect(pre.method).toBe("PUT");
    expect(pre.headers).toEqual({ "content-type": "image/jpeg" });
    expect(pre.url).toBe("/_plumix/memory-storage/upload%2F1");
    expect(pre.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

describe("memoryStorage seed", () => {
  test("seeded entries are immediately readable", async () => {
    const s = memoryStorage({
      seed: { "fx.bin": new Uint8Array([9, 8, 7]) },
    }).connect({});
    const got = await getOrThrow(s, "fx.bin");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(
      new Uint8Array([9, 8, 7]),
    );
  });
});

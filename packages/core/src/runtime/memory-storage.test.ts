import { describe, expect, test } from "vitest";

import { describeObjectStorageContract } from "../test/conformance/object-storage.js";
import { memoryStorage } from "./memory-storage.js";

describeObjectStorageContract({
  connect: () => memoryStorage().connect({}),
  publicUrls: true,
  presign: true,
  upload: (bucket, request) => bucket.fetch(request),
});

describe("memoryStorage public URLs", () => {
  test("defaults to a `/_plumix/memory-storage/<key>` URL", async () => {
    const s = memoryStorage().connect({});
    expect(await s.url("a/b.jpg")).toBe("/_plumix/memory-storage/a%2Fb.jpg");
  });

  test("respects a custom publicUrlBase", async () => {
    const s = memoryStorage({
      publicUrlBase: "https://dev.local/storage/",
    }).connect({});
    expect(await s.url("x.jpg")).toBe("https://dev.local/storage/x.jpg");
  });

  test("presigns against the same base, with the key encoded whole", async () => {
    const s = memoryStorage().connect({});
    if (!s.presignPut) throw new Error("memoryStorage must presign");
    const pre = await s.presignPut("upload/1", {
      contentType: "image/jpeg",
      contentLength: 10,
    });
    expect(pre.url).toBe("/_plumix/memory-storage/upload%2F1");
    expect(pre.headers).toEqual({ "content-type": "image/jpeg" });
  });
});

describe("memoryStorage as an HTTP endpoint", () => {
  test("serves a stored object at its URL, with its content type", async () => {
    const s = memoryStorage().connect();
    await s.put("a/b.png", "png", { contentType: "image/png" });

    const response = await s.fetch(
      new Request("https://cms.example/_plumix/memory-storage/a%2Fb.png"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(await response.text()).toBe("png");
  });

  test.each([
    ["a key not stored", "/_plumix/memory-storage/missing"],
    ["a path outside its URL base", "/elsewhere/a.png"],
    ["its URL base alone", "/_plumix/memory-storage/"],
  ])("answers 404 for %s", async (_, path) => {
    const s = memoryStorage({
      seed: { "a.png": new Uint8Array([1]) },
    }).connect();

    const response = await s.fetch(new Request(`https://cms.example${path}`));

    expect(response.status).toBe(404);
  });
});

describe("memoryStorage list", () => {
  // The shared contract sorts before comparing, so this store's ordering
  // guarantee is asserted here or nowhere.
  test("returns keys in sorted order, not insertion order", async () => {
    const s = memoryStorage().connect({});
    for (const key of ["c", "a", "b"]) await s.put(key, key);
    expect((await s.list()).items.map((item) => item.key)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("fills a page to the limit exactly", async () => {
    const s = memoryStorage().connect({});
    for (let i = 0; i < 5; i++) await s.put(`k${String(i)}`, "");
    const first = await s.list(undefined, { limit: 2 });
    expect(first.items.map((item) => item.key)).toEqual(["k0", "k1"]);
    const second = await s.list(undefined, { limit: 2, cursor: first.cursor });
    expect(second.items.map((item) => item.key)).toEqual(["k2", "k3"]);
    const third = await s.list(undefined, { limit: 2, cursor: second.cursor });
    expect(third.items.map((item) => item.key)).toEqual(["k4"]);
    expect(third.truncated).toBe(false);
  });
});

describe("memoryStorage seeding", () => {
  test("seeded objects are immediately readable", async () => {
    const s = memoryStorage({
      seed: { "fx.bin": new Uint8Array([9, 8, 7]) },
    }).connect({});
    const got = await s.get("fx.bin");
    if (!got) throw new Error("seeded object should be readable");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(
      new Uint8Array([9, 8, 7]),
    );
  });

  test("seeded objects are listable alongside written ones", async () => {
    const s = memoryStorage({ seed: { "a.bin": new Uint8Array([1]) } }).connect(
      {},
    );
    await s.put("b.bin", "two");
    const out = await s.list();
    expect(out.items.map((i) => i.key)).toEqual(["a.bin", "b.bin"]);
  });
});

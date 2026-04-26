import { describe, expect, test } from "vitest";

import { r2 } from "./r2.js";

// Minimal in-memory fake of the CF R2 binding shape — enough surface for
// the adapter's method calls to exercise end-to-end. R2Bucket at runtime
// is richer (conditionals, HEAD, multipart) but those are out of the
// ObjectStorage contract today.
function fakeR2Binding(): {
  binding: {
    put: (k: string, b: unknown, o?: unknown) => Promise<unknown>;
    get: (k: string) => Promise<unknown>;
    head: (k: string) => Promise<unknown>;
    delete: (k: string) => Promise<void>;
    list: (o?: unknown) => Promise<unknown>;
  };
  store: Map<string, { bytes: Uint8Array; httpMetadata?: unknown }>;
} {
  const store = new Map<
    string,
    { bytes: Uint8Array; httpMetadata?: unknown }
  >();
  return {
    store,
    binding: {
      // eslint-disable-next-line @typescript-eslint/require-await
      async put(key, body, options) {
        const payload =
          typeof body === "string"
            ? new TextEncoder().encode(body)
            : body instanceof Uint8Array
              ? body.slice()
              : new Uint8Array(0);
        store.set(key, {
          bytes: payload,
          httpMetadata: (options as { httpMetadata?: unknown } | undefined)
            ?.httpMetadata,
        });
        return {};
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async get(key) {
        const entry = store.get(key);
        if (!entry) return null;
        return {
          body: new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(entry.bytes);
              c.close();
            },
          }),
          size: entry.bytes.byteLength,
          etag: "fake-etag",
          httpEtag: '"fake-etag"',
          httpMetadata: entry.httpMetadata,
          uploaded: new Date(0),
          arrayBuffer: () => {
            const ab = new ArrayBuffer(entry.bytes.byteLength);
            new Uint8Array(ab).set(entry.bytes);
            return Promise.resolve(ab);
          },
        };
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async head(key) {
        const entry = store.get(key);
        if (!entry) return null;
        return {
          size: entry.bytes.byteLength,
          etag: "fake-etag",
          httpEtag: '"fake-etag"',
          httpMetadata: entry.httpMetadata,
          uploaded: new Date(0),
        };
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async delete(key) {
        store.delete(key);
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async list(options) {
        const opts = (options ?? {}) as { prefix?: string; limit?: number };
        const objects = [...store.entries()]
          .filter(([k]) => !opts.prefix || k.startsWith(opts.prefix))
          .slice(0, opts.limit ?? 1000)
          .map(([key, entry]) => ({
            key,
            size: entry.bytes.byteLength,
            etag: "fake-etag",
            uploaded: new Date(0),
          }));
        return { objects, truncated: false };
      },
    },
  };
}

describe("r2 slot factory", () => {
  test("declares the binding name in requiredBindings", () => {
    const slot = r2({ binding: "MEDIA" });
    expect(slot.kind).toBe("r2");
    expect(slot.requiredBindings).toEqual(["MEDIA"]);
  });

  test("connect() throws when the env binding is missing", () => {
    const slot = r2({ binding: "MEDIA" });
    expect(() => slot.connect({})).toThrow(/binding "MEDIA" is missing/);
  });

  test("connect() throws when the env binding is not an R2-shaped object", () => {
    const slot = r2({ binding: "MEDIA" });
    expect(() => slot.connect({ MEDIA: "not-a-bucket" })).toThrow(
      /not an R2 bucket/,
    );
  });

  test("connect() throws when env itself is null", () => {
    const slot = r2({ binding: "MEDIA" });
    expect(() => slot.connect(null)).toThrow(/env is not an object/);
  });
});

describe("r2 put/get/delete", () => {
  test("forwards content-type + cache-control into R2's httpMetadata", async () => {
    const fake = fakeR2Binding();
    const store = r2({ binding: "MEDIA" }).connect({ MEDIA: fake.binding });
    await store.put("a.jpg", "hi", {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=60",
    });
    const entry = fake.store.get("a.jpg");
    expect(entry?.httpMetadata).toEqual({
      contentType: "image/jpeg",
      cacheControl: "public, max-age=60",
    });
  });

  test("get returns the quoted httpEtag when present (HTTP cache alignment)", async () => {
    const fake = fakeR2Binding();
    const store = r2({ binding: "MEDIA" }).connect({ MEDIA: fake.binding });
    await store.put("k", "v");
    const got = await store.get("k");
    expect(got?.etag).toBe('"fake-etag"');
  });

  test("get on missing key returns null", async () => {
    const fake = fakeR2Binding();
    const store = r2({ binding: "MEDIA" }).connect({ MEDIA: fake.binding });
    expect(await store.get("none")).toBeNull();
  });

  test("delete removes the key", async () => {
    const fake = fakeR2Binding();
    const store = r2({ binding: "MEDIA" }).connect({ MEDIA: fake.binding });
    await store.put("k", "v");
    await store.delete("k");
    expect(fake.store.has("k")).toBe(false);
  });
});

describe("r2 url", () => {
  test("throws when publicUrlBase is not configured", async () => {
    const fake = fakeR2Binding();
    const store = r2({ binding: "MEDIA" }).connect({ MEDIA: fake.binding });
    await expect(store.url("a.jpg")).rejects.toThrow(
      /no publicUrlBase configured/,
    );
  });

  test("returns the composed public URL when publicUrlBase is set", async () => {
    const fake = fakeR2Binding();
    const store = r2({
      binding: "MEDIA",
      publicUrlBase: "https://media.example.com",
    }).connect({ MEDIA: fake.binding });
    expect(await store.url("a/b.jpg")).toBe(
      "https://media.example.com/a/b.jpg",
    );
  });

  test("handles a trailing slash on publicUrlBase", async () => {
    const fake = fakeR2Binding();
    const store = r2({
      binding: "MEDIA",
      publicUrlBase: "https://cdn.example.com/",
    }).connect({ MEDIA: fake.binding });
    expect(await store.url("x.jpg")).toBe("https://cdn.example.com/x.jpg");
  });

  test("encodes each path segment independently so slashes survive", async () => {
    const fake = fakeR2Binding();
    const store = r2({
      binding: "MEDIA",
      publicUrlBase: "https://cdn.example.com",
    }).connect({ MEDIA: fake.binding });
    expect(await store.url("a path/b?.jpg")).toBe(
      "https://cdn.example.com/a%20path/b%3F.jpg",
    );
  });
});

describe("r2 list", () => {
  test("filters by prefix and projects the manifest-compatible shape", async () => {
    const fake = fakeR2Binding();
    const store = r2({ binding: "MEDIA" }).connect({ MEDIA: fake.binding });
    await store.put("media/1", "a");
    await store.put("media/2", "b");
    await store.put("docs/x", "c");
    const out = await store.list("media/");
    expect(out.items.map((i) => i.key).sort()).toEqual(["media/1", "media/2"]);
    expect(out.truncated).toBe(false);
  });
});

describe("r2 presignPut", () => {
  test("is undefined when s3 credentials are not configured", () => {
    const fake = fakeR2Binding();
    const store = r2({ binding: "MEDIA" }).connect({ MEDIA: fake.binding });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- absence check, not invocation
    const presign = store.presignPut;
    expect(presign).toBeUndefined();
  });

  test("returns a SigV4 presigned PUT URL when s3 credentials are configured", async () => {
    const fake = fakeR2Binding();
    const store = r2({
      binding: "MEDIA",
      s3: {
        bucket: "plumix-media",
        accountId: "abc123",
        accessKeyId: "AKIAFAKE",
        secretAccessKey: "secret",
      },
    }).connect({ MEDIA: fake.binding });
    if (!store.presignPut) throw new Error("r2 should expose presignPut");

    const result = await store.presignPut("uploads/cat.jpg", {
      contentType: "image/jpeg",
      expiresIn: 600,
    });

    expect(result.method).toBe("PUT");
    expect(result.url).toContain("https://abc123.r2.cloudflarestorage.com/");
    expect(result.url).toContain("/plumix-media/uploads/cat.jpg");
    expect(result.url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(result.url).toContain("X-Amz-Signature=");
    expect(result.url).toContain("X-Amz-Expires=600");
    expect(result.headers["content-type"]).toBe("image/jpeg");
    // `host` is set automatically by the browser; we must NOT include it
    // among the headers the browser is told to send back.
    expect(result.headers).not.toHaveProperty("host");
  });
});

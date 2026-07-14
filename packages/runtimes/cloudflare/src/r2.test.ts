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
  test("returns null when publicUrlBase is not configured", async () => {
    // Binding-only deploys (private bucket, no custom domain) get
    // `null` so the consumer can mint a worker-proxied URL keyed on
    // an entry id — keying on the storage key would let anyone with
    // the key fetch bytes regardless of publication status.
    const fake = fakeR2Binding();
    const store = r2({ binding: "MEDIA" }).connect({ MEDIA: fake.binding });
    expect(await store.url("a.jpg")).toBeNull();
    expect(await store.url("2026/04/uuid.png")).toBeNull();
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

  test("resolves an (env) => s3 credentials block from the connect env", async () => {
    const fake = fakeR2Binding();
    const store = r2({
      binding: "MEDIA",
      s3: (env) => ({
        bucket: "plumix-media",
        accountId: "abc123",
        accessKeyId: (env as { S3_KEY?: string }).S3_KEY ?? "",
        secretAccessKey: (env as { S3_SECRET?: string }).S3_SECRET ?? "",
      }),
    }).connect({
      MEDIA: fake.binding,
      S3_KEY: "AKIA-FROM-ENV",
      S3_SECRET: "secret-from-env",
    });
    if (!store.presignPut) throw new Error("r2 should expose presignPut");

    const result = await store.presignPut("uploads/cat.jpg", {
      contentType: "image/jpeg",
      expiresIn: 600,
    });

    // The signing credential came from the resolver, fed the request env.
    expect(result.url).toContain("AKIA-FROM-ENV");
  });
});

describe("r2 conventional env credentials", () => {
  // With no `s3` block, `r2` reads S3 credentials from the deploy's request
  // env by convention — account-global keys plus a binding-derived bucket
  // (`<BINDING>_BUCKET`). This is what lets a config stay `r2({ binding })`
  // while presigned uploads still work once the secrets are attached.
  const conventionalEnv = {
    CF_ACCOUNT_ID: "acct-from-env",
    R2_ACCESS_KEY_ID: "AKIA-CONVENTIONAL",
    R2_SECRET_ACCESS_KEY: "secret-conventional",
    MEDIA_BUCKET: "media-from-env",
  };

  test("mints presigned PUTs from conventional env keys when s3 is omitted", async () => {
    const fake = fakeR2Binding();
    const store = r2({ binding: "MEDIA" }).connect({
      MEDIA: fake.binding,
      ...conventionalEnv,
    });
    if (!store.presignPut) throw new Error("r2 should expose presignPut");

    const result = await store.presignPut("uploads/cat.jpg", {
      contentType: "image/jpeg",
      expiresIn: 600,
    });

    expect(result.url).toContain(
      "https://acct-from-env.r2.cloudflarestorage.com/",
    );
    expect(result.url).toContain("/media-from-env/uploads/cat.jpg");
    expect(result.url).toContain("AKIA-CONVENTIONAL");
  });

  test("leaves presignPut undefined when conventional creds are incomplete", () => {
    const fake = fakeR2Binding();
    const { MEDIA_BUCKET: _omitted, ...partial } = conventionalEnv;
    const store = r2({ binding: "MEDIA" }).connect({
      MEDIA: fake.binding,
      ...partial,
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- absence check, not invocation
    expect(store.presignPut).toBeUndefined();
  });

  test("derives the bucket env key from the binding name", async () => {
    const fake = fakeR2Binding();
    const store = r2({ binding: "ASSETS" }).connect({
      ASSETS: fake.binding,
      CF_ACCOUNT_ID: "acct-from-env",
      R2_ACCESS_KEY_ID: "AKIA-CONVENTIONAL",
      R2_SECRET_ACCESS_KEY: "secret-conventional",
      ASSETS_BUCKET: "assets-bucket",
    });
    if (!store.presignPut) throw new Error("r2 should expose presignPut");
    const result = await store.presignPut("x.jpg", {
      contentType: "image/jpeg",
    });
    expect(result.url).toContain("/assets-bucket/x.jpg");
  });

  test("an explicit s3 block wins over conventional env keys", async () => {
    const fake = fakeR2Binding();
    const store = r2({
      binding: "MEDIA",
      s3: {
        bucket: "explicit-bucket",
        accountId: "explicit-acct",
        accessKeyId: "AKIA-EXPLICIT",
        secretAccessKey: "secret-explicit",
      },
    }).connect({ MEDIA: fake.binding, ...conventionalEnv });
    if (!store.presignPut) throw new Error("r2 should expose presignPut");
    const result = await store.presignPut("x.jpg", {
      contentType: "image/jpeg",
    });
    expect(result.url).toContain(
      "https://explicit-acct.r2.cloudflarestorage.com/",
    );
    expect(result.url).toContain("/explicit-bucket/x.jpg");
  });

  test("reads publicUrlBase from <BINDING>_PUBLIC_URL_BASE when omitted", async () => {
    const fake = fakeR2Binding();
    const store = r2({ binding: "MEDIA" }).connect({
      MEDIA: fake.binding,
      MEDIA_PUBLIC_URL_BASE: "https://cdn.example.com",
    });
    expect(await store.url("a/b.jpg")).toBe("https://cdn.example.com/a/b.jpg");
  });

  test("an explicit publicUrlBase wins over the conventional env key", async () => {
    const fake = fakeR2Binding();
    const store = r2({
      binding: "MEDIA",
      publicUrlBase: "https://explicit.example.com",
    }).connect({
      MEDIA: fake.binding,
      MEDIA_PUBLIC_URL_BASE: "https://env.example.com",
    });
    expect(await store.url("a.jpg")).toBe("https://explicit.example.com/a.jpg");
  });
});

import type { ConnectedObjectStorage, PlumixEnv } from "plumix";
import { describeObjectStorageContract } from "plumix/test/conformance";
import { describe, expect, test } from "vitest";

import type { R2Config } from "./r2.js";
import { r2 } from "./r2.js";

interface FakeEntry {
  readonly bytes: Uint8Array;
  readonly httpMetadata?: { contentType?: string; cacheControl?: string };
  readonly customMetadata?: Record<string, string>;
  readonly uploaded: Date;
}

interface FakeBinding {
  put(key: string, body: unknown, options?: unknown): Promise<unknown>;
  get(key: string, options?: unknown): Promise<unknown>;
  head(key: string): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(options?: unknown): Promise<unknown>;
}

// In-memory stand-in for the CF R2 binding: content-derived etags, ranged
// reads, custom metadata and a numeric-offset cursor — the behaviours the
// adapter maps onto the `storage:` port. R2 at runtime is richer
// (conditionals, multipart), and none of that is in the port today.
function fakeR2Binding(): {
  binding: FakeBinding;
  store: Map<string, FakeEntry>;
} {
  const store = new Map<string, FakeEntry>();

  const asObject = (key: string, entry: FakeEntry, bytes: Uint8Array) => ({
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    key,
    // The object's size, not the slice's — what R2 reports on a ranged read.
    size: entry.bytes.byteLength,
    ...etagPair(entry.bytes),
    httpMetadata: entry.httpMetadata,
    customMetadata: entry.customMetadata,
    uploaded: entry.uploaded,
    arrayBuffer: () => {
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return Promise.resolve(buffer);
    },
  });

  return {
    store,
    binding: {
      async put(key, body, options) {
        const opts = options as
          | {
              httpMetadata?: { contentType?: string; cacheControl?: string };
              customMetadata?: Record<string, string>;
            }
          | undefined;
        store.set(key, {
          bytes: await toBytes(body),
          httpMetadata: opts?.httpMetadata,
          customMetadata: opts?.customMetadata,
          uploaded: new Date(0),
        });
        return {};
      },
      get(key, options) {
        const entry = store.get(key);
        if (!entry) return Promise.resolve(null);
        const { range } = (options ?? {}) as {
          range?: { offset: number; length: number };
        };
        const bytes = range
          ? entry.bytes.subarray(range.offset, range.offset + range.length)
          : entry.bytes;
        return Promise.resolve(asObject(key, entry, bytes));
      },
      head(key) {
        const entry = store.get(key);
        if (!entry) return Promise.resolve(null);
        return Promise.resolve({
          key,
          size: entry.bytes.byteLength,
          ...etagPair(entry.bytes),
          httpMetadata: entry.httpMetadata,
          customMetadata: entry.customMetadata,
          uploaded: entry.uploaded,
        });
      },
      delete(key) {
        store.delete(key);
        return Promise.resolve();
      },
      list(options) {
        const opts = (options ?? {}) as {
          prefix?: string;
          limit?: number;
          cursor?: string;
        };
        const keys = [...store.keys()]
          .filter((key) => !opts.prefix || key.startsWith(opts.prefix))
          .sort();
        const start = opts.cursor ? Number(opts.cursor) : 0;
        const page = keys.slice(start, start + (opts.limit ?? 1000));
        const next = start + page.length;
        const truncated = next < keys.length;
        return Promise.resolve({
          objects: page.map((key) => {
            const entry = store.get(key);
            return {
              key,
              size: entry?.bytes.byteLength ?? 0,
              etag: etagFor(entry?.bytes ?? new Uint8Array(0)),
              uploaded: entry?.uploaded ?? new Date(0),
            };
          }),
          cursor: truncated ? String(next) : undefined,
          truncated,
        });
      },
    },
  };
}

// Every `ObjectBody` the port advertises — R2's binding takes them all, so a
// fake that took fewer would let a contract case pass for the wrong reason.
async function toBytes(body: unknown): Promise<Uint8Array> {
  if (body === null) return new Uint8Array(0);
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body.slice();
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(
      body.buffer,
      body.byteOffset,
      body.byteLength,
    ).slice();
  }
  if (body instanceof ArrayBuffer) return new Uint8Array(body.slice(0));
  if (body instanceof Blob || body instanceof ReadableStream) {
    return new Uint8Array(await new Response(body).arrayBuffer());
  }
  throw new Error("the r2 fake was handed a body the port does not allow");
}

// R2 carries the etag twice: bare for listings and manifests, quoted for the
// HTTP `If-None-Match` echo. Minting both here keeps that convention in one
// place, the way the binding does.
function etagPair(bytes: Uint8Array): { etag: string; httpEtag: string } {
  const etag = etagFor(bytes);
  return { etag, httpEtag: `"${etag}"` };
}

// R2 returns the object's MD5; a content hash is what matters here — the same
// bytes must produce the same etag and different bytes a different one.
function etagFor(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `${bytes.byteLength.toString(16)}-${(hash >>> 0).toString(16)}`;
}

// Most tests want a bucket bound and nothing else; only the listing-shape test
// reaches for the map behind it.
function connectR2(
  config: Partial<R2Config> = {},
  env: Record<string, unknown> = {},
): ConnectedObjectStorage {
  return r2({ binding: "MEDIA", ...config }).connect({
    MEDIA: fakeR2Binding().binding,
    ...env,
  });
}

const S3_CREDENTIALS = {
  bucket: "plumix-media",
  accountId: "abc123",
  accessKeyId: "AKIAFAKE",
  secretAccessKey: "secret",
};

describeObjectStorageContract({
  connect: () =>
    r2({
      binding: "MEDIA",
      publicUrlBase: "https://media.example.com",
      s3: S3_CREDENTIALS,
    }).connect({ MEDIA: fakeR2Binding().binding }),
  publicUrls: true,
  presign: true,
});

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

  // Safety: the port types `env` as `PlumixEnv`, but the guard exists for a
  // malformed caller that hands in no bag at all.
  test("connect() throws when env itself is null", () => {
    const slot = r2({ binding: "MEDIA" });
    expect(() => slot.connect(null as unknown as PlumixEnv)).toThrow(
      /env is not an object/,
    );
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
    const store = connectR2();
    await store.put("k", "v");
    const got = await store.get("k");
    expect(got?.etag).toMatch(/^".+"$/);
  });
});

describe("r2 url", () => {
  test("returns null when publicUrlBase is not configured", async () => {
    // Binding-only deploys (private bucket, no custom domain) get
    // `null` so the consumer can mint a worker-proxied URL keyed on
    // an entry id — keying on the storage key would let anyone with
    // the key fetch bytes regardless of publication status.
    const store = connectR2();
    expect(await store.url("2026/04/uuid.png")).toBeNull();
  });

  test("returns the composed public URL when publicUrlBase is set", async () => {
    const store = connectR2({
      publicUrlBase: "https://media.example.com",
    });
    expect(await store.url("a/b.jpg")).toBe(
      "https://media.example.com/a/b.jpg",
    );
  });

  test("handles a trailing slash on publicUrlBase", async () => {
    const store = connectR2({
      publicUrlBase: "https://cdn.example.com/",
    });
    expect(await store.url("x.jpg")).toBe("https://cdn.example.com/x.jpg");
  });

  test("encodes each path segment independently so slashes survive", async () => {
    const store = connectR2({
      publicUrlBase: "https://cdn.example.com",
    });
    expect(await store.url("a path/b?.jpg")).toBe(
      "https://cdn.example.com/a%20path/b%3F.jpg",
    );
  });
});

describe("r2 list", () => {
  test("projects the binding's etag and upload time onto the listing", async () => {
    const store = connectR2();
    await store.put("media/1", "a");
    const [item] = (await store.list("media/")).items;
    // Unquoted here: the listing feeds manifests, not `If-None-Match`.
    expect(item?.etag).toBe(etagFor(new TextEncoder().encode("a")));
    expect(item?.uploaded).toEqual(new Date(0));
  });
});

describe("r2 presignPut", () => {
  test("is undefined when s3 credentials are not configured", () => {
    const store = connectR2();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- absence check, not invocation
    const presign = store.presignPut;
    expect(presign).toBeUndefined();
  });

  test("returns a SigV4 presigned PUT URL when s3 credentials are configured", async () => {
    const store = connectR2({
      s3: S3_CREDENTIALS,
    });
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
    const store = connectR2(
      {
        s3: (env) => ({
          bucket: "plumix-media",
          accountId: "abc123",
          accessKeyId: (env as { S3_KEY?: string }).S3_KEY ?? "",
          secretAccessKey: (env as { S3_SECRET?: string }).S3_SECRET ?? "",
        }),
      },
      { S3_KEY: "AKIA-FROM-ENV", S3_SECRET: "secret-from-env" },
    );
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
    const store = connectR2({}, conventionalEnv);
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
    const { MEDIA_BUCKET: _omitted, ...partial } = conventionalEnv;
    const store = connectR2({}, partial);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- absence check, not invocation
    expect(store.presignPut).toBeUndefined();
  });

  test("derives the bucket env key from the binding name", async () => {
    const store = r2({ binding: "ASSETS" }).connect({
      ASSETS: fakeR2Binding().binding,
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
    const store = connectR2(
      {
        s3: {
          bucket: "explicit-bucket",
          accountId: "explicit-acct",
          accessKeyId: "AKIA-EXPLICIT",
          secretAccessKey: "secret-explicit",
        },
      },
      conventionalEnv,
    );
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
    const store = connectR2(
      {},
      { MEDIA_PUBLIC_URL_BASE: "https://cdn.example.com" },
    );
    expect(await store.url("a/b.jpg")).toBe("https://cdn.example.com/a/b.jpg");
  });

  test("an explicit publicUrlBase wins over the conventional env key", async () => {
    const store = connectR2(
      { publicUrlBase: "https://explicit.example.com" },
      { MEDIA_PUBLIC_URL_BASE: "https://env.example.com" },
    );
    expect(await store.url("a.jpg")).toBe("https://explicit.example.com/a.jpg");
  });
});

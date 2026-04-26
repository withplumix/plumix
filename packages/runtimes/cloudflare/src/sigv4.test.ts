// Focused unit tests for the SigV4 query-string signer. Integration with
// the real R2 binding is covered by `r2.test.ts`; these tests pin the
// algorithm itself so silent regressions don't slip through.

import { describe, expect, test } from "vitest";

import { presignPutUrl } from "./sigv4.js";

const FIXED_NOW = new Date(Date.UTC(2026, 3, 26, 11, 22, 33));
const TEST_CREDENTIALS = {
  accessKeyId: "AKIATESTKEY",
  secretAccessKey: "test-secret",
};

const BASE_PARAMS = {
  endpoint: "https://abc.r2.cloudflarestorage.com",
  bucket: "bucket-a",
  contentType: "image/jpeg",
  contentLength: 4096,
  expiresIn: 60,
  credentials: TEST_CREDENTIALS,
  now: FIXED_NOW,
} as const;

describe("presignPutUrl", () => {
  test("signature is deterministic for fixed inputs", async () => {
    const a = await presignPutUrl({ ...BASE_PARAMS, key: "uploads/cat.jpg" });
    const b = await presignPutUrl({ ...BASE_PARAMS, key: "uploads/cat.jpg" });
    expect(a.url).toBe(b.url);
  });

  test("signature changes when key changes (otherwise replay attack)", async () => {
    const a = await presignPutUrl({ ...BASE_PARAMS, key: "uploads/cat.jpg" });
    const b = await presignPutUrl({ ...BASE_PARAMS, key: "uploads/dog.jpg" });
    expect(a.url).not.toBe(b.url);
  });

  test("signature changes when contentLength changes — closes the size-replay attack", async () => {
    // A leaked presigned URL must not let the holder upload more
    // bytes than the draft expected. Signing Content-Length binds it.
    const a = await presignPutUrl({
      ...BASE_PARAMS,
      key: "k",
      contentLength: 100,
    });
    const b = await presignPutUrl({
      ...BASE_PARAMS,
      key: "k",
      contentLength: 100_000,
    });
    expect(a.url).not.toBe(b.url);
  });

  test("contentType is returned in browser headers but does NOT change the signature", async () => {
    // Browsers append `; charset=…` to text mimes after we've signed
    // the bare type — that broke uploads with opaque
    // `SignatureDoesNotMatch` errors. Mime correctness is enforced
    // by the magic-byte sniff in `media.confirm` instead.
    const a = await presignPutUrl({
      ...BASE_PARAMS,
      key: "k",
      contentType: "image/jpeg",
    });
    const b = await presignPutUrl({
      ...BASE_PARAMS,
      key: "k",
      contentType: "image/png",
    });
    expect(a.url).toBe(b.url);
    expect(a.headers["content-type"]).toBe("image/jpeg");
    expect(b.headers["content-type"]).toBe("image/png");
  });

  test("X-Amz-SignedHeaders is content-length;host; browser headers omit host", async () => {
    const result = await presignPutUrl({ ...BASE_PARAMS, key: "k" });
    // `;` URL-encodes to `%3B`.
    expect(result.url).toContain("X-Amz-SignedHeaders=content-length%3Bhost");
    // browsers refuse to set `host`; we sign it via the URL but the
    // returned header bag must omit it.
    expect(result.headers).not.toHaveProperty("host");
  });

  test("expiresIn out of range throws", async () => {
    const base = { ...BASE_PARAMS, key: "k" };
    await expect(presignPutUrl({ ...base, expiresIn: 0 })).rejects.toThrow(
      /expiresIn must be in/,
    );
    await expect(
      presignPutUrl({ ...base, expiresIn: 604_801 }),
    ).rejects.toThrow(/expiresIn must be in/);
    await expect(
      presignPutUrl({ ...base, expiresIn: Number.NaN }),
    ).rejects.toThrow(/expiresIn must be in/);
  });

  test("special characters in object key are encoded segment-by-segment", async () => {
    const result = await presignPutUrl({
      ...BASE_PARAMS,
      key: "uploads/some path/with spaces & symbols.jpg",
    });
    // `/` is preserved as a literal separator; everything else encoded.
    expect(result.url).toContain(
      "/bucket-a/uploads/some%20path/with%20spaces%20%26%20symbols.jpg?",
    );
  });
});

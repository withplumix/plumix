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

describe("presignPutUrl", () => {
  test("signature is deterministic for fixed inputs", async () => {
    const a = await presignPutUrl({
      endpoint: "https://abc.r2.cloudflarestorage.com",
      bucket: "bucket-a",
      key: "uploads/cat.jpg",
      contentType: "image/jpeg",
      expiresIn: 600,
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    });
    const b = await presignPutUrl({
      endpoint: "https://abc.r2.cloudflarestorage.com",
      bucket: "bucket-a",
      key: "uploads/cat.jpg",
      contentType: "image/jpeg",
      expiresIn: 600,
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    });
    expect(a.url).toBe(b.url);
  });

  test("signature changes when key changes (otherwise replay attack)", async () => {
    const base = {
      endpoint: "https://abc.r2.cloudflarestorage.com",
      bucket: "bucket-a",
      contentType: "image/jpeg",
      expiresIn: 600,
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    };
    const a = await presignPutUrl({ ...base, key: "uploads/cat.jpg" });
    const b = await presignPutUrl({ ...base, key: "uploads/dog.jpg" });
    expect(a.url).not.toBe(b.url);
  });

  test("signature changes when contentType changes", async () => {
    const base = {
      endpoint: "https://abc.r2.cloudflarestorage.com",
      bucket: "bucket-a",
      key: "k",
      expiresIn: 600,
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    };
    const a = await presignPutUrl({ ...base, contentType: "image/jpeg" });
    const b = await presignPutUrl({ ...base, contentType: "image/png" });
    expect(a.url).not.toBe(b.url);
  });

  test("signed Content-Length is included in browser headers", async () => {
    const result = await presignPutUrl({
      endpoint: "https://abc.r2.cloudflarestorage.com",
      bucket: "bucket-a",
      key: "k",
      contentType: "image/jpeg",
      contentLength: 4096,
      expiresIn: 600,
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    });
    expect(result.headers["content-length"]).toBe("4096");
  });

  test("X-Amz-SignedHeaders includes content-type but not host in browser headers", async () => {
    const result = await presignPutUrl({
      endpoint: "https://abc.r2.cloudflarestorage.com",
      bucket: "bucket-a",
      key: "k",
      contentType: "image/jpeg",
      expiresIn: 600,
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    });
    expect(result.url).toContain("X-Amz-SignedHeaders=content-type%3Bhost");
    // browsers refuse to set `host`; we sign it via the URL but the
    // returned header bag must omit it.
    expect(result.headers).not.toHaveProperty("host");
  });

  test("expiresIn out of range throws", async () => {
    const base = {
      endpoint: "https://abc.r2.cloudflarestorage.com",
      bucket: "bucket-a",
      key: "k",
      contentType: "image/jpeg",
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    };
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
      endpoint: "https://abc.r2.cloudflarestorage.com",
      bucket: "bucket-a",
      key: "uploads/some path/with spaces & symbols.jpg",
      contentType: "image/jpeg",
      expiresIn: 600,
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    });
    // `/` is preserved as a literal separator; everything else encoded.
    expect(result.url).toContain(
      "/bucket-a/uploads/some%20path/with%20spaces%20%26%20symbols.jpg?",
    );
  });
});

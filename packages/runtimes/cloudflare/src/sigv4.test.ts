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

  test("contentType is returned in browser headers but does NOT change the signature", async () => {
    // Regression: signing Content-Type made browser uploads to R2 fail
    // intermittently — browsers append `; charset=…` to text mimes after
    // we've signed the bare type, producing `SignatureDoesNotMatch`. We
    // only sign `host` now; Content-Type is still echoed back to the
    // browser so R2 stores the correct mime, but it's outside the
    // signature.
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
    expect(a.url).toBe(b.url);
    expect(a.headers["content-type"]).toBe("image/jpeg");
    expect(b.headers["content-type"]).toBe("image/png");
  });

  test("X-Amz-SignedHeaders is host-only; browser headers omit host", async () => {
    const result = await presignPutUrl({
      endpoint: "https://abc.r2.cloudflarestorage.com",
      bucket: "bucket-a",
      key: "k",
      contentType: "image/jpeg",
      expiresIn: 600,
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    });
    expect(result.url).toContain("X-Amz-SignedHeaders=host");
    expect(result.url).not.toContain("content-type%3Bhost");
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

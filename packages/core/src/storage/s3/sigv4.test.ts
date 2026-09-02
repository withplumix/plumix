// Focused unit tests for the SigV4 signer in both forms. The `s3()` slot and
// the Cloudflare `r2()` slot cover their integrations; these pin the algorithm
// itself, with the fake's verifier standing in for the server that recomputes
// every signature from the request it actually receives.

import { describe, expect, test } from "vitest";

import { verifySigV4 } from "./fake-s3.js";
import { presignPutUrl, signRequest } from "./sigv4.js";

const FIXED_NOW = new Date(Date.UTC(2026, 3, 26, 11, 22, 33));
const TEST_CREDENTIALS = {
  accessKeyId: "AKIATESTKEY",
  secretAccessKey: "test-secret",
  region: "auto",
};

const VERIFIER = {
  credentials: TEST_CREDENTIALS,
  region: "auto",
  now: FIXED_NOW,
};

const BASE_PARAMS = {
  endpoint: "https://abc.r2.cloudflarestorage.com",
  bucket: "bucket-a",
  contentType: "image/jpeg",
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

  test("signature changes when contentType changes (mime is part of the signature)", async () => {
    // The browser MUST send `Content-Type: <signed value>` exactly,
    // or R2 returns SignatureDoesNotMatch. Matches AWS SDK default.
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
    expect(a.url).not.toBe(b.url);
    expect(a.headers["content-type"]).toBe("image/jpeg");
    expect(b.headers["content-type"]).toBe("image/png");
  });

  test("X-Amz-SignedHeaders is content-type;host (matches AWS SDK + Cloudflare docs)", async () => {
    const result = await presignPutUrl({ ...BASE_PARAMS, key: "k" });
    // `;` URL-encodes to `%3B`.
    expect(result.url).toContain("X-Amz-SignedHeaders=content-type%3Bhost");
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

describe("presignPutUrl against a server recomputing the signature", () => {
  test("the URL verifies as the PUT the browser sends, key with a space included", async () => {
    const presigned = await presignPutUrl({
      ...BASE_PARAMS,
      key: "uploads/some path/cat.jpg",
    });
    const request = new Request(presigned.url, {
      method: "PUT",
      headers: presigned.headers,
    });
    expect(await verifySigV4(request, VERIFIER)).toEqual({ ok: true });
  });

  test("a different content type than the one signed is rejected", async () => {
    const presigned = await presignPutUrl({ ...BASE_PARAMS, key: "k" });
    const request = new Request(presigned.url, {
      method: "PUT",
      headers: { "content-type": "image/png" },
    });
    expect(await verifySigV4(request, VERIFIER)).toMatchObject({ ok: false });
  });

  test("a session token rides along in the query and is covered by the signature", async () => {
    const credentials = {
      ...TEST_CREDENTIALS,
      sessionToken: "session/token+1",
    };
    const presigned = await presignPutUrl({
      ...BASE_PARAMS,
      key: "k",
      credentials,
    });
    expect(presigned.url).toContain("X-Amz-Security-Token=session%2Ftoken%2B1");
    const request = new Request(presigned.url, {
      method: "PUT",
      headers: presigned.headers,
    });
    expect(await verifySigV4(request, { ...VERIFIER, credentials })).toEqual({
      ok: true,
    });
  });
});

// AWS's published SigV4 examples for S3 (Examples: Signature Calculations in
// AWS Signature Version 4, Authorization header) — an oracle this repo did not
// write, so the signer and the verifier cannot agree on a misreading of the
// spec and both pass.
describe("signRequest against AWS's published example signatures", () => {
  const credentials = {
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
  };
  const now = new Date(Date.UTC(2013, 4, 24, 0, 0, 0));

  test("GET with a Range header", async () => {
    const headers = await signRequest({
      method: "GET",
      url: "https://examplebucket.s3.amazonaws.com/test.txt",
      headers: { range: "bytes=0-9" },
      payloadHash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      credentials,
      now,
    });
    expect(headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  test("PUT of a key with a reserved character, sent raw or encoded", async () => {
    const expected =
      "Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd";
    for (const url of [
      "https://examplebucket.s3.amazonaws.com/test$file.text",
      "https://examplebucket.s3.amazonaws.com/test%24file.text",
    ]) {
      const headers = await signRequest({
        method: "PUT",
        url,
        headers: {
          date: "Fri, 24 May 2013 00:00:00 GMT",
          "x-amz-storage-class": "REDUCED_REDUNDANCY",
        },
        payloadHash:
          "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072",
        credentials,
        now,
      });
      expect(headers.authorization).toContain(expected);
    }
  });
});

describe("signRequest", () => {
  const url =
    "https://abc.r2.cloudflarestorage.com/bucket-a/uploads/some%20path/cat.jpg";

  test("signs the date, payload hash and caller headers, and leaves host to fetch", async () => {
    const headers = await signRequest({
      method: "PUT",
      url,
      headers: { "Content-Type": "image/jpeg" },
      payloadHash: "UNSIGNED-PAYLOAD",
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    });
    expect(headers["x-amz-date"]).toBe("20260426T112233Z");
    expect(headers["x-amz-content-sha256"]).toBe("UNSIGNED-PAYLOAD");
    expect(headers["content-type"]).toBe("image/jpeg");
    expect(headers).not.toHaveProperty("host");
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIATESTKEY\/20260426\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  test("a server recomputing from the received request accepts it, key with a space included", async () => {
    const headers = await signRequest({
      method: "PUT",
      url,
      headers: { "content-type": "image/jpeg", "x-amz-meta-owner": "alice" },
      payloadHash: "UNSIGNED-PAYLOAD",
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    });
    const request = new Request(url, { method: "PUT", headers });
    expect(await verifySigV4(request, VERIFIER)).toEqual({ ok: true });
  });

  test("the query string is part of the signature", async () => {
    const listUrl =
      "https://abc.r2.cloudflarestorage.com/bucket-a?list-type=2&prefix=some%20path%2F&max-keys=2";
    const headers = await signRequest({
      method: "GET",
      url: listUrl,
      payloadHash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    });
    expect(
      await verifySigV4(new Request(listUrl, { headers }), VERIFIER),
    ).toEqual({
      ok: true,
    });
    const retargeted = listUrl.replace("max-keys=2", "max-keys=1000");
    expect(
      await verifySigV4(new Request(retargeted, { headers }), VERIFIER),
    ).toMatchObject({ ok: false });
  });

  test("a signature for one key does not open another", async () => {
    const headers = await signRequest({
      method: "DELETE",
      url,
      payloadHash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    });
    const other = url.replace("cat.jpg", "dog.jpg");
    expect(
      await verifySigV4(
        new Request(other, { method: "DELETE", headers }),
        VERIFIER,
      ),
    ).toMatchObject({ ok: false });
  });

  test("a header value with doubled inner spaces signs as AWS canonicalises it", async () => {
    const headers = await signRequest({
      method: "PUT",
      url,
      headers: { "cache-control": "public,  max-age=60" },
      payloadHash: "UNSIGNED-PAYLOAD",
      credentials: TEST_CREDENTIALS,
      now: FIXED_NOW,
    });
    expect(headers["cache-control"]).toBe("public,  max-age=60");
    expect(
      await verifySigV4(new Request(url, { method: "PUT", headers }), VERIFIER),
    ).toEqual({ ok: true });
  });

  test("a key with a dot segment is refused rather than signed for a normalised path", async () => {
    await expect(
      presignPutUrl({ ...BASE_PARAMS, key: "uploads/../other/cat.jpg" }),
    ).rejects.toThrow(/"\." or "\.\." segment/);
  });

  test("an endpoint with a path prefix keeps it in the presigned URL and its signature", async () => {
    const presigned = await presignPutUrl({
      ...BASE_PARAMS,
      endpoint: "https://storage.example.com/s3/",
      key: "k",
    });
    expect(presigned.url).toMatch(
      /^https:\/\/storage\.example\.com\/s3\/bucket-a\/k\?/,
    );
    const request = new Request(presigned.url, {
      method: "PUT",
      headers: presigned.headers,
    });
    expect(await verifySigV4(request, VERIFIER)).toEqual({ ok: true });
  });

  test("the verifier rejects a presigned URL past its expiry", async () => {
    const presigned = await presignPutUrl({ ...BASE_PARAMS, key: "k" });
    const request = new Request(presigned.url, {
      method: "PUT",
      headers: presigned.headers,
    });
    const later = new Date(FIXED_NOW.getTime() + 61_000);
    expect(await verifySigV4(request, { ...VERIFIER, now: later })).toEqual({
      ok: false,
      reason: "the presigned URL has expired",
    });
  });

  test("a session token is sent as x-amz-security-token and signed", async () => {
    const credentials = { ...TEST_CREDENTIALS, sessionToken: "tok" };
    const headers = await signRequest({
      method: "HEAD",
      url,
      payloadHash: "UNSIGNED-PAYLOAD",
      credentials,
      now: FIXED_NOW,
    });
    expect(headers["x-amz-security-token"]).toBe("tok");
    expect(headers.authorization).toContain("x-amz-security-token");
    expect(
      await verifySigV4(new Request(url, { method: "HEAD", headers }), {
        ...VERIFIER,
        credentials,
      }),
    ).toEqual({ ok: true });
  });
});

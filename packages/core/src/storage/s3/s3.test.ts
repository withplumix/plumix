import { describe, expect, test } from "vitest";

import { describeObjectStorageContract } from "../../test/conformance/object-storage.js";
import { S3Error } from "./errors.js";
import { fakeS3 } from "./fake-s3.js";
import { s3 } from "./s3.js";

const CREDENTIALS = {
  accessKeyId: "AKIATESTKEY",
  secretAccessKey: "test-secret",
};

const BUCKET = {
  bucket: "plumix-media",
  region: "us-east-1",
  endpoint: "https://s3.us-east-1.amazonaws.com",
};

// One bucket per call: the contract wants every case to start empty.
function bind(overrides: { publicUrlBase?: string } = {}) {
  const fake = fakeS3({ ...BUCKET, credentials: CREDENTIALS });
  const storage = s3({
    ...BUCKET,
    credentials: CREDENTIALS,
    fetch: fake.fetch,
    ...overrides,
  }).connect({});
  return { fake, storage };
}

describeObjectStorageContract({
  connect: () => bind({ publicUrlBase: "https://cdn.example.com" }).storage,
  publicUrls: true,
  presign: true,
});

describe("s3 slot factory", () => {
  test("identifies as 's3', needs no runtime binding, and exposes its config", () => {
    const slot = s3({ ...BUCKET, credentials: CREDENTIALS });
    expect(slot.kind).toBe("s3");
    expect(slot.requiredBindings).toBeUndefined();
    expect(slot.config.bucket).toBe("plumix-media");
  });

  test("reads credentials given as an (env) => resolver from the connect env", async () => {
    const fake = fakeS3({
      ...BUCKET,
      credentials: { accessKeyId: "AKIA-FROM-ENV", secretAccessKey: "s" },
    });
    const storage = s3({
      ...BUCKET,
      credentials: (env) => ({
        accessKeyId: (env as { S3_KEY: string }).S3_KEY,
        secretAccessKey: (env as { S3_SECRET: string }).S3_SECRET,
      }),
      fetch: fake.fetch,
    }).connect({ S3_KEY: "AKIA-FROM-ENV", S3_SECRET: "s" });
    await storage.put("k", "v");
    expect(fake.store.has("k")).toBe(true);
  });

  test("does not call the resolver until connect()", () => {
    let called = false;
    s3({
      ...BUCKET,
      credentials: () => {
        called = true;
        return CREDENTIALS;
      },
    });
    expect(called).toBe(false);
  });
});

describe("s3 requests", () => {
  test("addresses objects path-style beneath the endpoint, one segment at a time", async () => {
    const { fake, storage } = bind();
    await storage.put("some path/a&b.jpg", "x", { contentType: "image/jpeg" });
    const request = fake.requests.at(-1);
    expect(request?.method).toBe("PUT");
    expect(request?.url).toBe(
      "https://s3.us-east-1.amazonaws.com/plumix-media/some%20path/a%26b.jpg",
    );
    expect(fake.store.get("some path/a&b.jpg")?.contentType).toBe("image/jpeg");
  });

  test("signs the real payload hash, so a body the bucket did not sign for is refused", async () => {
    const { fake, storage } = bind();
    await storage.put("k", "signed");
    const request = fake.requests.at(-1);
    expect(request?.headers.get("x-amz-content-sha256")).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(request?.headers.get("x-amz-content-sha256")).not.toBe(
      "UNSIGNED-PAYLOAD",
    );
  });

  test("forwards cache-control and custom metadata as S3 headers", async () => {
    const { fake, storage } = bind();
    await storage.put("k", "v", {
      cacheControl: "public, max-age=60",
      customMetadata: { owner: "alice" },
    });
    expect(fake.store.get("k")?.cacheControl).toBe("public, max-age=60");
    expect(fake.store.get("k")?.metadata).toEqual({ owner: "alice" });
  });

  test("a ranged get asks for the byte window with a Range header", async () => {
    const { fake, storage } = bind();
    await storage.put("k", "0123456789");
    await storage.get("k", { range: { offset: 2, length: 3 } });
    expect(fake.requests.at(-1)?.headers.get("range")).toBe("bytes=2-4");
  });

  test("list decodes XML entities in keys and resumes from the continuation token", async () => {
    const { storage } = bind();
    await storage.put("a&b<c>", "1");
    await storage.put("plain", "2");
    const first = await storage.list(undefined, { limit: 1 });
    expect(first.items.map((item) => item.key)).toEqual(["a&b<c>"]);
    expect(first.truncated).toBe(true);
    const second = await storage.list(undefined, {
      limit: 1,
      cursor: first.cursor,
    });
    expect(second.items.map((item) => item.key)).toEqual(["plain"]);
    expect(second.truncated).toBe(false);
  });

  test("a presigned PUT lands in the bucket when a browser follows it", async () => {
    const { fake, storage } = bind();
    if (!storage.presignPut) throw new Error("s3 should expose presignPut");
    const presigned = await storage.presignPut("uploads/cat photo.jpg", {
      contentType: "image/jpeg",
    });
    const response = await fake.fetch(presigned.url, {
      method: presigned.method,
      headers: presigned.headers,
      body: "jpeg bytes",
    });
    expect(response.status).toBe(200);
    expect(await storage.head("uploads/cat photo.jpg")).toMatchObject({
      size: 10,
      contentType: "image/jpeg",
    });
  });

  test("a key with a dot segment is refused before any request is sent", async () => {
    const { fake, storage } = bind();
    await expect(storage.put("a/../b", "v")).rejects.toThrow(
      /"\." or "\.\." segment/,
    );
    expect(fake.requests).toHaveLength(0);
  });

  test("a missing bucket is an error, not an empty bucket", async () => {
    const fake = fakeS3({ ...BUCKET, credentials: CREDENTIALS });
    const storage = s3({
      ...BUCKET,
      bucket: "other-bucket",
      credentials: CREDENTIALS,
      fetch: fake.fetch,
    }).connect({});
    await expect(storage.get("k")).rejects.toMatchObject({
      status: 404,
      s3Code: "NoSuchBucket",
    });
  });

  test("a rejected request surfaces the S3 error code", async () => {
    const fake = fakeS3({
      ...BUCKET,
      credentials: { ...CREDENTIALS, secretAccessKey: "other" },
    });
    const storage = s3({
      ...BUCKET,
      credentials: CREDENTIALS,
      fetch: fake.fetch,
    }).connect({});
    const failure = await storage.put("k", "v").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(S3Error);
    expect(failure).toMatchObject({
      code: "request_failed",
      method: "PUT",
      key: "k",
      status: 403,
      s3Code: "SignatureDoesNotMatch",
    });
  });
});

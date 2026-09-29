import type { Server } from "bun";
import type { FakeS3 } from "plumix/test/conformance";
import { describeObjectStorageContract, fakeS3 } from "plumix/test/conformance";
import { afterAll, describe, expect, test } from "vitest";

import { bunS3 } from "./bun-s3.js";

const CREDENTIALS = {
  accessKeyId: "AKIATESTKEY",
  secretAccessKey: "test-secret",
};

const BUCKET = { bucket: "plumix-media", region: "us-east-1" };

const servers: Server<undefined>[] = [];

afterAll(async () => {
  await Promise.all(servers.map((server) => server.stop(true)));
});

// `S3Client` sends its requests from inside Bun rather than through the global
// `fetch`, so the fake bucket answers on a real listener: every request, from
// Bun's client and from core's signer alike, crosses the same boundary.
function serve(fake: FakeS3): string {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => fake.fetch(request),
  });
  servers.push(server);
  return server.url.origin;
}

// One bucket per call: the contract wants every case to start empty.
function bind() {
  const fake = fakeS3({ ...BUCKET, credentials: CREDENTIALS });
  const storage = bunS3({
    ...BUCKET,
    endpoint: serve(fake),
    credentials: CREDENTIALS,
  }).connect({});
  return { fake, storage };
}

describeObjectStorageContract({
  connect: () => bind().storage,
  presign: true,
});

describe("bunS3", () => {
  // Bun's own presign signs only `host`, so a browser could send any type.
  test("a presigned PUT is signed for its content type, and refused with another", async () => {
    const { fake, storage } = bind();
    if (!storage.presignPut) throw new Error("bunS3 should expose presignPut");
    const presigned = await storage.presignPut("uploads/cat.jpg", {
      contentType: "image/jpeg",
    });
    const send = (contentType: string) =>
      fetch(presigned.url, {
        method: presigned.method,
        headers: { ...presigned.headers, "content-type": contentType },
        body: "jpeg bytes",
      });

    expect((await send("text/html")).status).toBe(403);
    expect(fake.store.has("uploads/cat.jpg")).toBe(false);
    expect((await send("image/jpeg")).status).toBe(200);
    expect(await storage.head("uploads/cat.jpg")).toMatchObject({
      size: 10,
      contentType: "image/jpeg",
    });
  });

  test("reads credentials given as an (env) => resolver from the connect env, for Bun's client and core's signer alike", async () => {
    const fake = fakeS3({ ...BUCKET, credentials: CREDENTIALS });
    const storage = bunS3({
      ...BUCKET,
      endpoint: serve(fake),
      credentials: (env) => ({
        accessKeyId: (env as { S3_KEY: string }).S3_KEY,
        secretAccessKey: (env as { S3_SECRET: string }).S3_SECRET,
      }),
    }).connect({
      S3_KEY: CREDENTIALS.accessKeyId,
      S3_SECRET: CREDENTIALS.secretAccessKey,
    });

    await storage.put("k", "v");
    const got = await storage.get("k");
    expect(await new Response(got?.body).text()).toBe("v");
    expect((await storage.list()).items.map((item) => item.key)).toEqual(["k"]);
  });
});

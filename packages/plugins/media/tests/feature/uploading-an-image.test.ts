import { memoryStorage } from "plumix/runtime";
import { testSite } from "plumix/test";
import { describe, expect, test } from "vitest";

import { media } from "../../src/index.js";

/** A PNG signature, which confirm sniffs against the claimed type. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const site = await testSite({
  plugins: [media()],
  config: { storage: memoryStorage() },
});

describe("uploading an image", () => {
  test("stores the bytes the browser sends to the upload URL", async () => {
    const author = site.actingAs("author");
    const upload = await author.rpc.media.createUploadUrl({
      filename: "photo.png",
      contentType: "image/png",
      size: PNG.byteLength,
    });

    // Resolved against the site's origin, as the browser on it resolves it.
    const sent = await site.storage.fetch(
      new Request(new URL(upload.uploadUrl, "https://cms.example"), {
        method: upload.method,
        headers: upload.headers,
        body: PNG,
      }),
    );
    const confirmed = await author.rpc.media.confirm({ id: upload.mediaId });

    expect(sent.ok).toBe(true);
    await site.storage.assertStored(confirmed.storageKey);
    (await site.visit(confirmed.url))
      .assertOk()
      .assertHeader("content-type", "image/png");
  });
});

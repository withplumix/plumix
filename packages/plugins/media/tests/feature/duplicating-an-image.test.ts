import { memoryStorage } from "plumix/runtime";
import { testSite } from "plumix/test";
import { describe, test } from "vitest";

import { media } from "../../src/index.js";

/** A PNG signature, which confirm sniffs against the claimed type. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const site = await testSite({
  plugins: [media()],
  config: { storage: memoryStorage() },
});

describe("duplicating an image", () => {
  test("gives the copy no file of its own, so deleting the copy keeps the original's", async () => {
    const editor = site.actingAs("editor");
    const upload = await editor.rpc.media.createUploadUrl({
      filename: "original.png",
      contentType: "image/png",
      size: PNG.byteLength,
    });
    await site.visit(upload.uploadUrl, {
      method: upload.method,
      headers: upload.headers,
      body: PNG,
    });
    const original = await editor.rpc.media.confirm({ id: upload.mediaId });
    const author = site.actingAs("author");
    const copy = await author.rpc.entry.duplicate({ id: original.id });

    await author.rpc.media.delete({ id: copy.id });

    await site.storage.assertStored(original.storageKey);
  });
});

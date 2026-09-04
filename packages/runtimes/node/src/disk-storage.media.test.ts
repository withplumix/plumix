import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDispatcherHarness, plumixRequest } from "plumix/test";
import { afterEach, beforeEach, expect, test } from "vitest";

import { media } from "@plumix/plugin-media";

import { diskStorage } from "./disk-storage.js";

// PNG signature: what the plugin's magic-byte sniff accepts for image/png.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-node-media-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("an upload through the media plugin lands as a file and is served back with its type", async () => {
  const storage = diskStorage({ dir }).connect({});
  const h = await createDispatcherHarness({ plugins: [media()], storage });
  const user = await h.seedUser("contributor");
  const rpc = async (procedure: string, input: Record<string, unknown>) => {
    const request = await h.authenticateRequest(
      plumixRequest(`/_plumix/rpc/${procedure}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      }),
      user.id,
    );
    const response = await h.dispatch(request);
    expect(response.status, procedure).toBe(200);
    return ((await response.json()) as { json: Record<string, unknown> }).json;
  };

  // No presignPut on disk, so the plugin hands out its own upload route.
  const created = await rpc("media/createUploadUrl", {
    filename: "cat.png",
    contentType: "image/png",
    size: PNG.byteLength,
  });
  expect(created.uploadUrl).toMatch(/^\/_plumix\/media\/upload\/\d+$/);

  const uploaded = await h.dispatch(
    await h.authenticateRequest(
      plumixRequest(String(created.uploadUrl), {
        method: "PUT",
        headers: {
          "content-type": "image/png",
          "content-length": String(PNG.byteLength),
        },
        body: PNG,
      }),
      user.id,
    ),
  );
  expect(uploaded.status).toBe(204);
  expect(existsSync(join(dir, "objects", String(created.storageKey)))).toBe(
    true,
  );

  await rpc("media/confirm", { id: created.mediaId });

  const served = await h.dispatch(
    plumixRequest(`/_plumix/media/serve/${String(created.mediaId)}`),
  );
  expect(served.status).toBe(200);
  expect(served.headers.get("content-type")).toBe("image/png");
  expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);

  const etag = served.headers.get("etag");
  expect(etag).toBeTruthy();
  const revalidated = await h.dispatch(
    plumixRequest(`/_plumix/media/serve/${String(created.mediaId)}`, {
      headers: { "if-none-match": String(etag) },
    }),
  );
  expect(revalidated.status).toBe(304);
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDispatcherHarness, plumixRequest } from "plumix/test";
import sharp from "sharp";
import { afterEach, beforeEach, expect, test } from "vitest";

import { media } from "@plumix/plugin-media";

import { diskStorage } from "./disk-storage.js";
import { createImageLayer } from "./http/images.js";
import { listen } from "./http/test-support.js";
import { images } from "./images.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-node-images-media-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("a disk-stored upload is transformed through the media route, gated exactly as that route gates it", async () => {
  const storage = diskStorage({ dir: join(dir, "media") }).connect({});
  const h = await createDispatcherHarness({ plugins: [media()], storage });
  const user = await h.seedUser("contributor");
  const png = await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#3c3" },
  })
    .png()
    .toBuffer();
  const rpc = async (procedure: string, input: Record<string, unknown>) => {
    const response = await h.dispatch(
      await h.authenticateRequest(
        plumixRequest(`/_plumix/rpc/${procedure}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ json: input }),
        }),
        user.id,
      ),
    );
    expect(response.status, procedure).toBe(200);
    return ((await response.json()) as { json: Record<string, unknown> }).json;
  };
  const created = await rpc("media/createUploadUrl", {
    filename: "field.png",
    contentType: "image/png",
    size: png.byteLength,
  });
  await h.dispatch(
    await h.authenticateRequest(
      plumixRequest(String(created.uploadUrl), {
        method: "PUT",
        headers: {
          "content-type": "image/png",
          "content-length": String(png.byteLength),
        },
        body: new Uint8Array(png),
      }),
      user.id,
    ),
  );

  // The layer reaches the site the way the entry wires it: the handler's own
  // fetch, anonymously.
  const layer = createImageLayer(images({ cacheDir: join(dir, "cache") }), {
    fetch: (request) => h.dispatch(request),
  });
  const { origin } = await listen((req, res) =>
    layer.serve(req, res, () => res.writeHead(404).end()),
  );
  const source = `/_plumix/media/serve/${String(created.mediaId)}`;
  const variant = `${origin}/_plumix/image?src=${encodeURIComponent(source)}&w=320`;

  // Unconfirmed, the upload is a draft the serve route hides; so does the
  // transform, with the route's own status.
  expect((await fetch(variant)).status).toBe(404);

  await rpc("media/confirm", { id: created.mediaId });
  const transformed = await fetch(variant, {
    headers: { accept: "image/webp,*/*" },
  });
  expect(transformed.status).toBe(200);
  expect(transformed.headers.get("content-type")).toBe("image/webp");
  const meta = await sharp(
    Buffer.from(await transformed.arrayBuffer()),
  ).metadata();
  expect([meta.format, meta.width, meta.height]).toEqual(["webp", 320, 213]);
});

import { memoryStorage } from "plumix";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { CardNode } from "./renderer.js";
import { og } from "./index.js";
import { takumi } from "./takumi.js";

// The only tests that load the real wasm: two proving the engine encodes each
// format it offers, one proving the configuration a fresh install gets reaches
// it. Everything else renders through the fake in `test/fake-renderer.ts` —
// exercising the engine harder than this tests upstream rather than us.
describe("the bundled engine", () => {
  test("turns a node tree into raster bytes", async () => {
    const renderer = takumi();
    const render = (children: CardNode[]): Promise<Uint8Array> =>
      renderer.render(
        { type: "container", className: "card", children },
        {
          width: 1200,
          height: 630,
          stylesheets: [
            ":root { --ink: #ffffff }",
            ".card { width: 1200px; height: 630px; background-color: #0b1220 }",
            ".title { color: var(--ink); font-size: 76px }",
          ],
          fonts: [],
          fetch: () => Promise.reject(new Error("the engine must not fetch")),
        },
      );

    const titled = await render([
      { type: "text", className: "title", text: "Hello World" },
    ]);
    const empty = await render([]);

    expect(renderer.contentType).toBe("image/png");
    // The PNG signature — the bytes are an encoded raster, not a string.
    expect([...titled.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    // The failure this engine was chosen over is a valid-but-blank image, and a
    // signature check passes on one. The title has to reach the pixels.
    expect(titled).not.toEqual(empty);
  });

  test("encodes JPEG instead when a photo-heavy card asks for it", async () => {
    const renderer = takumi({ format: "jpeg" });

    const bytes = await renderer.render(
      {
        type: "container",
        className: "card",
        children: [{ type: "text", className: "title", text: "Hello World" }],
      },
      {
        width: 1200,
        height: 630,
        stylesheets: [".card { width: 1200px; height: 630px }"],
        fonts: [],
        fetch: () => Promise.reject(new Error("the engine must not fetch")),
      },
    );

    expect(renderer.contentType).toBe("image/jpeg");
    // SOI marker: the bytes are JPEG, not the PNG the same call defaults to.
    expect([...bytes.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });

  test("is what a plugin with no renderer configured serves through", async () => {
    const harness = await createDispatcherHarness({
      plugins: [
        definePlugin("test_blog", {
          setup: (ctx) => {
            ctx.registerEntryType("post", { label: "Posts", isPublic: true });
          },
        }),
        og(),
      ],
      storage: memoryStorage().connect({}),
    });
    const author = await harness.factory.user.create({});
    const entry = await harness.factory.entry.create({
      type: "post",
      title: "Hello World",
      status: "published",
      authorId: author.id,
    });

    const response = await harness.fetch(
      `/_plumix/og/entry/${String(entry.id)}.png`,
    );

    expect(response.assertStatus(200).headers.get("content-type")).toBe(
      "image/png",
    );
    // The signature's ASCII tag survives the harness's text decode, which is
    // all this needs: that the engine rasterized rather than emitting the SVG
    // a card would be advertised with nowhere.
    expect(await response.text()).toContain("PNG");
  });
});

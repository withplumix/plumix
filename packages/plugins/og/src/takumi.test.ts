import type { ThemeTokens } from "plumix/blocks";
import { memoryStorage } from "plumix";
import { emitThemeTokenCss } from "plumix/blocks";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { CardImage, CardNode, CardRenderInput } from "./renderer.js";
import { og } from "./index.js";
import { svgOnly, takumi } from "./takumi.js";
import { createHarness, fetchCard, seedEntry } from "./test/harness.js";

// The only tests that load the real wasm. Everything else renders through the
// fake in `test/fake-renderer.ts` — exercising the engine harder than this
// tests upstream rather than us.
// The engine must never reach the network: a card is rendered from what the
// request already resolved, which is what keeps the storage key complete.
const input = (
  stylesheets: string[],
  images: CardImage[] = [],
): CardRenderInput => ({
  width: 1200,
  height: 630,
  stylesheets,
  fonts: [],
  images,
  fetch: () => Promise.reject(new Error("the engine must not fetch")),
});

// A 1x1 red PNG. The engine decodes it itself; what matters here is that the
// bytes reach it under the `src` the node names, with nothing fetched.
const RED_PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4o6YGAAMKASng8MlTAAAAAElFTkSuQmCC",
  ),
  (character) => character.charCodeAt(0),
);

describe("the bundled engine", () => {
  test("turns a node tree into raster bytes", async () => {
    const renderer = takumi();
    const render = (children: CardNode[]): Promise<Uint8Array> =>
      renderer.render(
        { type: "container", className: "card", children },
        input([
          ":root { --ink: #ffffff }",
          ".card { width: 1200px; height: 630px; background-color: #0b1220 }",
          ".title { color: var(--ink); font-size: 76px }",
        ]),
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
      input([".card { width: 1200px; height: 630px }"]),
    );

    expect(renderer.contentType).toBe("image/jpeg");
    // SOI marker: the bytes are JPEG, not the PNG the same call defaults to.
    expect([...bytes.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });

  test("resolves a theme's tokens to what the card meant", async () => {
    const renderer = takumi();
    const render = (stylesheets: string[]): Promise<Uint8Array> =>
      renderer.render(
        {
          type: "container",
          className: "card",
          children: [{ type: "text", className: "title", text: "Hello World" }],
        },
        input([
          ".card { width: 1200px; height: 630px; background-color: #0b1220 }",
          ".title { color: #f8fafc; font-size: 76px }",
          ...stylesheets,
        ]),
      );

    // The whole route a theme's design takes to a card: the sheet the plugin
    // compiles from the theme's own tokens, and a card written against the
    // names it emits.
    const themed = await render([
      emitThemeTokenCss({ spacing: { gutter: { value: "36px" } } }),
      ".card { padding: calc(var(--plumix-spacing-gutter) * 2) }",
    ]);

    // Identical pixels to the value written out by hand — the reference was
    // resolved and the arithmetic done, not dropped.
    expect(themed).toEqual(await render([".card { padding: 72px }"]));
    // And the padding is load-bearing, so equality above is not two cards that
    // both ignored it.
    expect(themed).not.toEqual(await render([".card { padding: 36px }"]));
  });

  test("paints an image out of the bytes it was handed", async () => {
    const renderer = takumi();
    const render = (
      child: CardNode,
      images: CardImage[] = [],
    ): Promise<Uint8Array> =>
      renderer.render(
        { type: "container", className: "card", children: [child] },
        input([".card { width: 1200px; height: 630px }"], images),
      );

    const painted = await render(
      { type: "image", src: "hero.png", width: 1200, height: 630 },
      [{ src: "hero.png", data: RED_PIXEL }],
    );
    // The other half of the contract: the engine decodes a `data:` URI itself,
    // which is what lets the plugin pass one through without resolving it.
    const inline = await render({
      type: "image",
      src: `data:image/png;base64,${btoa(String.fromCharCode(...RED_PIXEL))}`,
      width: 1200,
      height: 630,
    });
    const blank = await render({ type: "container" });

    expect(painted).not.toEqual(blank);
    expect(inline).toEqual(painted);
  });

  test("paints the bundled card in the theme's own palette", async () => {
    // Every fill the served card carries, in paint order: the ground, then the
    // headline, then the site line beneath it. `renderSvg` emits glyphs as
    // `<use>` references, so the colours are the only part of a card this can
    // read — and they are the whole of what a palette decides. Nothing else in
    // the document is written as a hex triplet.
    const fillsOf = async (tokens?: ThemeTokens): Promise<string[]> => {
      const harness = await createHarness({ renderer: svgOnly(), tokens });
      const id = await seedEntry(harness);
      const svg = await (await fetchCard(harness, id)).assertStatus(200).text();
      return svg.match(/#[0-9a-f]{6}/g) ?? [];
    };

    expect(
      await fillsOf({
        color: {
          background: { value: "#fbfaf8" },
          foreground: { value: "#1b1a17" },
          "muted-foreground": { value: "#6f6b63" },
        },
      }),
    ).toEqual(["#fbfaf8", "#1b1a17", "#6f6b63"]);
    // A theme that named none of them leaves the card the three it ships with.
    expect(await fillsOf()).toEqual(["#0b1220", "#f8fafc", "#94a3b8"]);
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

    const response = await fetchCard(harness, entry.id, { extension: "png" });

    expect(response.assertStatus(200).headers.get("content-type")).toBe(
      "image/png",
    );
    // The signature's ASCII tag survives the harness's text decode, which is
    // all this needs: that the engine rasterized rather than emitting the SVG
    // a card would be advertised with nowhere.
    expect(await response.text()).toContain("PNG");
  });
});

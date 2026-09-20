import { describe, expect, test } from "vitest";

import type { CardNode, CardRenderInput } from "./renderer.js";
import { remote } from "./remote.js";

const node: CardNode = {
  type: "container",
  className: "plumix-og-card",
  children: [{ type: "text", text: "Hello World" }],
};

function inputWith(
  fetch: CardRenderInput["fetch"],
  images: CardRenderInput["images"] = [],
): CardRenderInput {
  return {
    width: 1200,
    height: 630,
    stylesheets: [".plumix-og-card { color: red }"],
    fonts: [],
    images,
    fetch,
  };
}

describe("the remote renderer", () => {
  test("posts the card as JSON and serves back what the endpoint answered", async () => {
    const posted: { url: string; body: string } = { url: "", body: "" };
    const renderer = remote({ url: "https://cards.example/render" });

    const bytes = await renderer.render(
      node,
      inputWith((url, init) => {
        posted.url = new Request(url, init).url;
        posted.body = typeof init?.body === "string" ? init.body : "";
        return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
      }),
    );

    expect(posted.url).toBe("https://cards.example/render");
    expect(JSON.parse(posted.body)).toEqual({
      node,
      width: 1200,
      height: 630,
      stylesheets: [".plumix-og-card { color: red }"],
      images: [],
    });
    expect(renderer.contentType).toBe("image/png");
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  test("carries an image's bytes, so the endpoint has nothing to fetch either", async () => {
    let posted = "";
    const renderer = remote({ url: "https://cards.example/render" });

    await renderer.render(
      { type: "image", src: "https://cdn.example/hero.png" },
      inputWith(
        (_url, init) => {
          posted = typeof init?.body === "string" ? init.body : "";
          return Promise.resolve(new Response(new Uint8Array([1])));
        },
        [
          {
            src: "https://cdn.example/hero.png",
            data: new Uint8Array([0, 1, 254, 255]),
          },
        ],
      ),
    );

    // JSON has no bytes, so they travel base64 — keyed by the same `src` the
    // node names, which is how the endpoint pairs them up.
    const payload: unknown = JSON.parse(posted);
    expect(payload).toMatchObject({
      images: [{ src: "https://cdn.example/hero.png", data: "AAH+/w==" }],
    });
  });

  test("declares that it reads no fonts, so none are ever loaded for it", () => {
    expect(remote({ url: "https://cards.example/render" }).fonts).toBe(false);
  });

  test("declares the formats its endpoint parses when told to take fonts", () => {
    const renderer = remote({
      url: "https://cards.example/render",
      fonts: { formats: ["woff2"] },
    });

    expect(renderer.fonts).toEqual({ formats: ["woff2"] });
  });

  test("reads nothing when its endpoint declares no format", () => {
    // The other spelling of `false`, so the declaration and the payload key
    // below cannot answer the same question differently.
    expect(
      remote({ url: "https://cards.example/render", fonts: { formats: [] } })
        .fonts,
    ).toBe(false);
  });

  test("posts the faces as base64, so the endpoint fetches no font URL", async () => {
    let posted = "";
    const renderer = remote({
      url: "https://cards.example/render",
      fonts: { formats: ["woff2"] },
    });

    await renderer.render(node, {
      ...inputWith((_url, init) => {
        posted = typeof init?.body === "string" ? init.body : "";
        return Promise.resolve(new Response(new Uint8Array([1])));
      }),
      fonts: [new Uint8Array([0, 1, 254, 255])],
    });

    const payload: unknown = JSON.parse(posted);
    expect(payload).toMatchObject({ fonts: ["AAH+/w=="] });
  });

  test("posts no font key at all to an endpoint that never asked", async () => {
    let posted = "";
    const renderer = remote({ url: "https://cards.example/render" });

    await renderer.render(
      node,
      inputWith((_url, init) => {
        posted = typeof init?.body === "string" ? init.body : "";
        return Promise.resolve(new Response(new Uint8Array([1])));
      }),
    );

    expect(Object.keys(JSON.parse(posted) as object)).not.toContain("fonts");
  });

  test("posts an empty font list to an endpoint that asked and got none", async () => {
    let posted = "";
    const renderer = remote({
      url: "https://cards.example/render",
      fonts: { formats: ["woff2"] },
    });

    await renderer.render(
      node,
      inputWith((_url, init) => {
        posted = typeof init?.body === "string" ? init.body : "";
        return Promise.resolve(new Response(new Uint8Array([1])));
      }),
    );

    // Distinct from the key being absent: this endpoint asked for the site's
    // faces and the site configured none, which is its cue to use its own.
    expect(JSON.parse(posted)).toMatchObject({ fonts: [] });
  });

  test("throws when the endpoint refuses", async () => {
    const renderer = remote({ url: "https://cards.example/render" });

    await expect(
      renderer.render(
        node,
        inputWith(() => Promise.resolve(new Response(null, { status: 502 }))),
      ),
    ).rejects.toThrow("502");
  });
});

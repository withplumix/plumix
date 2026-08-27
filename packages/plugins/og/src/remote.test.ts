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

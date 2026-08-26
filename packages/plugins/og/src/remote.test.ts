import { describe, expect, test } from "vitest";

import type { CardNode, CardRenderInput } from "./renderer.js";
import { remote } from "./remote.js";

const node: CardNode = {
  type: "container",
  className: "plumix-og-card",
  children: [{ type: "text", text: "Hello World" }],
};

function inputWith(fetch: CardRenderInput["fetch"]): CardRenderInput {
  return {
    width: 1200,
    height: 630,
    stylesheets: [".plumix-og-card { color: red }"],
    fonts: [],
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
    });
    expect(renderer.contentType).toBe("image/png");
    expect([...bytes]).toEqual([1, 2, 3]);
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

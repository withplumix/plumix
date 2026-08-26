import { describe, expect, it, vi } from "vitest";

import type { RenderedAssetArgs } from "./rendered-asset.js";
import { memoryStorage } from "../runtime/memory-storage.js";
import { serveRenderedAsset } from "./rendered-asset.js";

const KEY = "og/e7f3a1.png";
const KEY_ETAG = '"og%2Fe7f3a1.png"';
const PNG = "image/png";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const GET = (headers?: HeadersInit) =>
  new Request("https://site.test/_plumix/og/card.png", { headers });

const etagOf = (response: Response): string =>
  response.headers.get("etag") ?? "";

const serve = (overrides: Partial<RenderedAssetArgs> = {}): Promise<Response> =>
  serveRenderedAsset({
    request: GET(),
    key: KEY,
    contentType: PNG,
    render: () => Promise.resolve(bytes("card")),
    ...overrides,
  });

describe("serveRenderedAsset", () => {
  it("renders once, persists, and serves the bytes on a miss", async () => {
    const storage = memoryStorage().connect({});
    const render = vi.fn(() => Promise.resolve(bytes("card")));

    const response = await serve({ storage, render });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(PNG);
    expect(response.headers.get("content-length")).toBe("4");
    expect(await response.text()).toBe("card");
    expect(render).toHaveBeenCalledOnce();
    expect(await storage.head(KEY)).not.toBeNull();
  });

  it("serves a second request for the same key from storage without re-rendering", async () => {
    const storage = memoryStorage().connect({});
    const render = vi.fn(() => Promise.resolve(bytes("card")));

    await serve({ storage, render });
    const second = await serve({ storage, render });

    expect(render).toHaveBeenCalledOnce();
    expect(second.status).toBe(200);
    expect(second.headers.get("content-type")).toBe(PNG);
    expect(second.headers.get("content-length")).toBe("4");
    expect(await second.text()).toBe("card");
  });

  it("answers a matching If-None-Match with 304 when the asset is stored", async () => {
    const storage = memoryStorage().connect({});
    const render = vi.fn(() => Promise.resolve(bytes("card")));
    const first = await serve({ storage, render });

    const revalidated = await serve({
      request: GET({ "if-none-match": etagOf(first) }),
      storage,
      render,
    });

    expect(revalidated.status).toBe(304);
    expect(revalidated.headers.get("etag")).toBe(etagOf(first));
    // A 304 refreshes what the client already holds, so it carries the same
    // freshness the 200 did.
    expect(revalidated.headers.get("cache-control")).toBe(
      first.headers.get("cache-control"),
    );
    // A 304 describes no representation, so it carries none of its headers.
    expect(revalidated.headers.get("content-type")).toBeNull();
    expect(revalidated.headers.get("content-length")).toBeNull();
    expect(await revalidated.text()).toBe("");
    expect(render).toHaveBeenCalledOnce();
  });

  it("answers a matching If-None-Match with 304 when nothing is stored", async () => {
    const render = vi.fn(() => Promise.resolve(bytes("card")));
    const served = await serve({ render });

    const revalidated = await serve({
      request: GET({ "if-none-match": etagOf(served) }),
      render,
    });

    expect(revalidated.status).toBe(304);
    expect(await revalidated.text()).toBe("");
    expect(render).toHaveBeenCalledOnce();
  });

  // An entry past the first keeps the separator's optional whitespace, so the
  // `W/` prefix is only there to strip once the tag has been trimmed. Each
  // case below pins a different half of that: the weak forms catch stripping
  // before the trim, the strong one catches trimming only as part of the
  // strip, and the pair of positions catches scanning less than the whole list.
  it.each([
    ["strong, past the first entry", `"superseded", ${KEY_ETAG}`],
    ["weak, past the first entry", `"superseded", W/${KEY_ETAG}`],
    ["weak, ahead of a later entry", `W/${KEY_ETAG}, "superseded"`],
    ["weak, packed without a space", `"superseded",W/${KEY_ETAG}`],
  ])("finds its ETag in a list: %s", async (_form, ifNoneMatch) => {
    const revalidated = await serve({
      request: GET({ "if-none-match": ifNoneMatch }),
    });

    expect(revalidated.status).toBe(304);
  });

  // An entity-tag is a narrow grammar — no quote, and the header it travels in
  // is comma-separated — but a key is whatever the caller folded into it.
  it("mints an ETag that revalidates for a key needing escaping", async () => {
    for (const key of ["og/a,b.png", 'og/a"b.png', "og/ünï.png"]) {
      const served = await serve({ key });
      const etag = etagOf(served);

      const revalidated = await serve({
        key,
        request: GET({ "if-none-match": etag }),
      });

      expect(etag).toMatch(/^"[\x21\x23-\x7e]*"$/);
      expect(revalidated.status).toBe(304);
    }
  });

  // `*` asks whether the resource has any current representation, which the
  // render path cannot answer — so it is deliberately not a match.
  it("serves the bytes for an If-None-Match of `*`", async () => {
    const response = await serve({ request: GET({ "if-none-match": "*" }) });

    expect(response.status).toBe(200);
  });

  it("serves the bytes when the client holds a different key's ETag", async () => {
    const stale = await serve({ key: "og/superseded.png" });

    const response = await serve({
      request: GET({ "if-none-match": etagOf(stale) }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("card");
  });

  it("serves the bytes when its ETag is absent from the client's list", async () => {
    const response = await serve({
      request: GET({
        "if-none-match": '"og%2Fsuperseded.png", W/"og%2Funrelated.png"',
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("card");
  });

  it("stores and serves a payload of no bytes", async () => {
    const storage = memoryStorage().connect({});
    const render = vi.fn(() => Promise.resolve(new Uint8Array(0)));

    await serve({ storage, render });
    const second = await serve({ storage, render });

    expect(render).toHaveBeenCalledOnce();
    expect(second.status).toBe(200);
    expect(second.headers.get("content-length")).toBe("0");
  });

  it("renders and serves each time when no storage slot is configured", async () => {
    const render = vi.fn(() => Promise.resolve(bytes("card")));

    const first = await serve({ render });
    const second = await serve({ render });

    expect(render).toHaveBeenCalledTimes(2);
    for (const response of [first, second]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("etag")).toBe(first.headers.get("etag"));
      expect(await response.text()).toBe("card");
    }
  });

  // The trap this primitive exists to close: mint the ETag on the render path
  // and read the storage backend's own on the hit path, and the two never
  // agree — so revalidation silently never returns 304. R2 hands back an MD5,
  // the in-memory backend computes its own; only the key is common to both.
  it("derives the ETag from the key, not from the storage backend", async () => {
    const storage = memoryStorage().connect({});

    const rendered = await serve({ storage });
    const fromStorage = await serve({ storage });

    expect(etagOf(rendered)).toBe(KEY_ETAG);
    expect(etagOf(fromStorage)).toBe(KEY_ETAG);
    expect((await storage.head(KEY))?.etag).not.toBe(KEY_ETAG);
  });

  it("serves immutable bytes with nosniff, and lets the caller set freshness", async () => {
    const defaulted = await serve();
    const custom = await serve({
      cacheControl: "public, max-age=60, must-revalidate",
    });

    expect(defaulted.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(defaulted.headers.get("x-content-type-options")).toBe("nosniff");
    expect(custom.headers.get("cache-control")).toBe(
      "public, max-age=60, must-revalidate",
    );
  });
});

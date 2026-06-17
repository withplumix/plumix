import { describe, expect, it, vi } from "vitest";

import type { ConnectedCache } from "../runtime/slots.js";
import { readThrough } from "./read-through.js";

// `defer` swallows the promise here so tests can drive the store-write path
// without a real waitUntil queue.
const immediateDefer = (p: Promise<unknown>): void => {
  void p;
};

const GET = (url = "https://site.test/hello") => new Request(url);

describe("readThrough", () => {
  it("renders and stores on a cache miss for a cacheable request", async () => {
    const match = vi.fn(() => Promise.resolve(undefined));
    const put = vi.fn(() => Promise.resolve());
    const cache: ConnectedCache = { match, put };
    const fresh = new Response("body", { status: 200 });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThrough({
      request: GET(),
      intentKind: "single",
      cache,
      defer: immediateDefer,
      render,
    });

    expect(result).toBe(fresh);
    expect(render).toHaveBeenCalledOnce();
    expect(match).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
  });

  it("returns the cached response without rendering on a hit", async () => {
    const cached = new Response("cached", { status: 200 });
    const match = vi.fn(() => Promise.resolve(cached));
    const put = vi.fn(() => Promise.resolve());
    const cache: ConnectedCache = { match, put };
    const render = vi.fn(() => Promise.resolve(new Response("fresh")));

    const result = await readThrough({
      request: GET(),
      intentKind: "front-page",
      cache,
      defer: immediateDefer,
      render,
    });

    expect(result).toBe(cached);
    expect(render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("bypasses the cache entirely for a privileged request", async () => {
    const match = vi.fn(() => Promise.resolve(undefined));
    const put = vi.fn(() => Promise.resolve());
    const cache: ConnectedCache = { match, put };
    const fresh = new Response("live", { status: 200 });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThrough({
      request: new Request("https://site.test/hello", {
        headers: { cookie: "plumix_session=abc" },
      }),
      intentKind: "single",
      cache,
      defer: immediateDefer,
      render,
    });

    expect(result).toBe(fresh);
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("renders live without touching the cache for an unmatched route", async () => {
    const match = vi.fn(() => Promise.resolve(undefined));
    const put = vi.fn(() => Promise.resolve());
    const cache: ConnectedCache = { match, put };
    const render = vi.fn(() =>
      Promise.resolve(new Response("404", { status: 404 })),
    );

    await readThrough({
      request: GET(),
      intentKind: null,
      cache,
      defer: immediateDefer,
      render,
    });

    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("does not store a non-200 render", async () => {
    const match = vi.fn(() => Promise.resolve(undefined));
    const put = vi.fn(() => Promise.resolve());
    const cache: ConnectedCache = { match, put };
    const render = vi.fn(() =>
      Promise.resolve(new Response("nope", { status: 404 })),
    );

    await readThrough({
      request: GET(),
      intentKind: "single",
      cache,
      defer: immediateDefer,
      render,
    });

    expect(match).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  });
});

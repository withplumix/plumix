import { describe, expect, it, vi } from "vitest";

import type { ConnectedCache } from "../runtime/slots.js";
import { NOOP_TELEMETRY } from "../context/telemetry.js";
import { readThrough } from "./read-through.js";

// `defer` swallows the promise here so tests can drive the store-write path
// without a real waitUntil queue.
const immediateDefer = (p: Promise<unknown>): void => {
  void p;
};

const GET = (url = "https://site.test/hello") => new Request(url);
const noTags = () => [];

function spies(
  match: ConnectedCache["match"] = () => Promise.resolve(undefined),
) {
  const matchFn = vi.fn(match);
  const put = vi.fn<ConnectedCache["put"]>(() => Promise.resolve());
  const purgeTags = vi.fn(() => Promise.resolve());
  const cache: ConnectedCache = { match: matchFn, put, purgeTags };
  return { cache, match: matchFn, put };
}

describe("readThrough", () => {
  it("renders and stores the tagged response on a cache miss", async () => {
    const { cache, match, put } = spies();
    const fresh = new Response("body", { status: 200 });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThrough({
      request: GET(),
      intentKind: "single",
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: () => ["e:7"],
    });

    expect(result).toBe(fresh);
    expect(render).toHaveBeenCalledOnce();
    expect(match).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]?.[2]).toEqual(["e:7"]);
  });

  it("returns the cached response without rendering on a hit", async () => {
    const cached = new Response("cached", { status: 200 });
    const { cache, put } = spies(() => Promise.resolve(cached));
    const render = vi.fn(() => Promise.resolve(new Response("fresh")));

    const result = await readThrough({
      request: GET(),
      intentKind: "front-page",
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(result).toBe(cached);
    expect(render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("bypasses the cache entirely for a privileged request", async () => {
    const { cache, match, put } = spies();
    const fresh = new Response("live", { status: 200 });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThrough({
      request: new Request("https://site.test/hello", {
        headers: { cookie: "plumix_session=abc" },
      }),
      intentKind: "single",
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(result).toBe(fresh);
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("renders live without touching the cache for an unmatched route", async () => {
    const { cache, match, put } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("404", { status: 404 })),
    );

    await readThrough({
      request: GET(),
      intentKind: null,
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("does not store a non-200 render", async () => {
    const { cache, match, put } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("nope", { status: 404 })),
    );

    await readThrough({
      request: GET(),
      intentKind: "single",
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(match).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  });
});

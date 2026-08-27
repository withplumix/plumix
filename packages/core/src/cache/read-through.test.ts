import { describe, expect, it, vi } from "vitest";

import type { ConnectedCache } from "../runtime/slots.js";
import { NOOP_TELEMETRY } from "../context/telemetry.js";
import { SEGMENT_KEY_PARAM } from "./decision.js";
import { readThrough, readThroughRoute } from "./read-through.js";

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
      segment: "anonymous",
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
      segment: "anonymous",
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

  it("bypasses the cache entirely for a private segment", async () => {
    const { cache, match, put } = spies();
    const fresh = new Response("live", { status: 200 });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThrough({
      request: GET(),
      segment: "private",
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

  it("keys a non-anonymous segment under a distinct entry and shares it across cookies", async () => {
    const { cache, match, put } = spies();
    const fresh = new Response("members", { status: 200 });
    const render = vi.fn(() => Promise.resolve(fresh));

    await readThrough({
      request: new Request("https://site.test/members", {
        headers: { cookie: "plumix_session=alice" },
      }),
      segment: "authenticated",
      intentKind: "single",
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    // The stored/looked-up key folds the segment into the URL and carries no
    // per-visitor cookie — so a second subscriber (different cookie) collides
    // on the same entry.
    const matchKey = match.mock.calls[0]?.[0];
    const putKey = put.mock.calls[0]?.[0];
    if (!matchKey || !putKey) throw new Error("expected a keyed cache request");
    expect(new URL(matchKey.url).searchParams.get(SEGMENT_KEY_PARAM)).toBe(
      "authenticated",
    );
    expect(matchKey.headers.has("cookie")).toBe(false);
    expect(putKey.url).toBe(matchKey.url);
  });

  it("renders live without touching the cache for an unmatched route", async () => {
    const { cache, match, put } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("404", { status: 404 })),
    );

    await readThrough({
      request: GET(),
      segment: "anonymous",
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

  it("stores a custom archive that opted into caching", async () => {
    const { cache, match, put } = spies();
    const fresh = new Response("listing", { status: 200 });
    const render = vi.fn(() => Promise.resolve(fresh));

    await readThrough({
      request: GET(),
      segment: "anonymous",
      intentKind: "custom",
      customArchiveCacheable: true,
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: () => ["t:school"],
    });

    expect(match).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]?.[2]).toEqual(["t:school"]);
  });

  it("bypasses a custom archive that did not opt into caching", async () => {
    const { cache, match, put } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("listing", { status: 200 })),
    );

    await readThrough({
      request: GET(),
      segment: "anonymous",
      intentKind: "custom",
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(render).toHaveBeenCalledOnce();
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
      segment: "anonymous",
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

describe("readThroughRoute", () => {
  it("renders and stores an opted-in plugin route on a miss", async () => {
    const { cache, match, put } = spies();
    const fresh = new Response("card", { status: 200 });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThroughRoute({
      request: GET("https://site.test/_plumix/og/card/abc.png"),
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(result).toBe(fresh);
    expect(match).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
    // Core can't name a raw route's content dependencies, so a handler that
    // declared none stores untagged — unreachable by any purge.
    expect(put.mock.calls[0]?.[2]).toEqual([]);
  });

  it("stores under the tags the handler declared while it ran", async () => {
    const { cache, put } = spies();
    const declared: string[] = [];
    const render = vi.fn(() => {
      declared.push("e:7", "t:post");
      return Promise.resolve(new Response("card", { status: 200 }));
    });

    await readThroughRoute({
      request: GET("https://site.test/_plumix/og/card/abc.png"),
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      // Read after the handler returns, which is the only moment it knows
      // which entry it resolved.
      tags: () => declared,
    });

    expect(put.mock.calls[0]?.[2]).toEqual(["e:7", "t:post"]);
  });

  it("returns the stored response without running the handler on a hit", async () => {
    const cached = new Response("stored card", { status: 200 });
    const { cache, put } = spies(() => Promise.resolve(cached));
    const render = vi.fn(() => Promise.resolve(new Response("fresh")));

    const result = await readThroughRoute({
      request: GET("https://site.test/_plumix/og/card/abc.png"),
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

  it("looks up and stores under one key, the visitor's cookie dropped", async () => {
    const { cache, match, put } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("card", { status: 200 })),
    );

    await readThroughRoute({
      // A cookie that isn't a session — this visitor is not privileged, so the
      // render is storable, and the entry it fills is the one everyone reads.
      request: new Request("https://site.test/_plumix/og/card/abc.png", {
        headers: { cookie: "plumix_locale=fr" },
      }),
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    const matchKey = match.mock.calls[0]?.[0];
    const putKey = put.mock.calls[0]?.[0];
    if (!matchKey || !putKey) throw new Error("expected a keyed cache request");
    expect(matchKey.url).toBe("https://site.test/_plumix/og/card/abc.png");
    expect(matchKey.headers.has("cookie")).toBe(false);
    expect(putKey.url).toBe(matchKey.url);
  });

  it("bypasses the cache for a write method", async () => {
    const { cache, match, put } = spies();
    const fresh = new Response("done", { status: 200 });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThroughRoute({
      request: new Request("https://site.test/_plumix/og/card/abc.png", {
        method: "POST",
      }),
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

  it("does not store a response the handler declared unshareable", async () => {
    const { cache, match, put } = spies();
    // The route opted in, but this particular response is one visitor's: the
    // handler says so, and the provider would otherwise rewrite the directive
    // to the page TTL and share it.
    const fresh = new Response("personalized card", {
      status: 200,
      headers: { "cache-control": "private, no-store" },
    });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThroughRoute({
      request: GET("https://site.test/_plumix/og/card/abc.png"),
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(result).toBe(fresh);
    expect(match).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  });

  it("looks a HEAD up but never stores one (the Cache API is GET-only)", async () => {
    const { cache, match, put } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("card", { status: 200 })),
    );

    await readThroughRoute({
      request: new Request("https://site.test/_plumix/og/card/abc.png", {
        method: "HEAD",
      }),
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(match).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the request was privileged",
      new Request("https://site.test/_plumix/og/card/abc.png", {
        headers: { authorization: "Bearer token" },
      }),
      new Response("card", { status: 200 }),
    ],
    [
      "the response sets a cookie",
      GET("https://site.test/_plumix/og/card/abc.png"),
      new Response("card", {
        status: 200,
        headers: { "set-cookie": "csrf=abc" },
      }),
    ],
  ])("serves but does not store when %s", async (_case, request, fresh) => {
    const { cache, match, put } = spies();
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThroughRoute({
      request,
      cache,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(result).toBe(fresh);
    expect(match).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  });
});

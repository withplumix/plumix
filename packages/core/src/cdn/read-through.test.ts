import { describe, expect, it, vi } from "vitest";

import type { TelemetryCollector } from "../context/telemetry.js";
import type { CdnStore, ConnectedCdn } from "../runtime/slots.js";
import { createTelemetryCollector } from "../context/collector.js";
import { NOOP_TELEMETRY } from "../context/telemetry.js";
import { responseAllowsSharedStorage, SEGMENT_KEY_PARAM } from "./decision.js";
import { readThrough, readThroughRoute } from "./read-through.js";

// `defer` swallows the promise here so tests can drive the store-write path
// without a real waitUntil queue.
const immediateDefer = (p: Promise<unknown>): void => {
  void p;
};

const GET = (
  url = "https://site.test/hello",
  headers?: Record<string, string>,
) => new Request(url, { headers });
const noTags = () => [];

// The marker a conforming `decorate` leaves on the visitor's copy, so a test
// can tell it from the render it came out of. It honours narrow-never-widen
// like a real provider: a fake that decorated unconditionally would share the
// code's assumption and could never fail.
const DECORATED = "x-decorated";

function spies(
  options: {
    readonly match?: CdnStore["match"];
    readonly storeless?: boolean;
  } = {},
) {
  const match = vi.fn<CdnStore["match"]>(
    options.match ?? (() => Promise.resolve(undefined)),
  );
  const put = vi.fn<CdnStore["put"]>(() => Promise.resolve());
  const decorate = vi.fn<ConnectedCdn["decorate"]>((response, tags) => {
    if (!responseAllowsSharedStorage(response)) return response;
    const headers = new Headers(response.headers);
    headers.set(DECORATED, tags.join(",") || "none");
    return new Response(response.body, { status: response.status, headers });
  });
  const cdn: ConnectedCdn = {
    decorate,
    ...(options.storeless === true ? {} : { store: { match, put } }),
  };
  return { cdn, match, put, decorate };
}

function cdnFacts(telemetry: TelemetryCollector): unknown[] {
  return telemetry.get("cdn").map((record) => record.data);
}

describe("readThrough", () => {
  it("renders, stores and decorates the tagged response on a cdn miss", async () => {
    const { cdn, match, put, decorate } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("body", { status: 200 })),
    );

    const result = await readThrough({
      request: GET(),
      segment: "anonymous",
      intentKind: "single",
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: () => ["e:7"],
    });

    // The visitor's copy carries the freshness and tags the CDN reads — the
    // page leaves the origin cacheable, whether or not a store also holds it.
    expect(result.headers.get(DECORATED)).toBe("e:7");
    expect(await result.text()).toBe("body");
    expect(decorate.mock.calls[0]?.[1]).toEqual(["e:7"]);
    expect(render).toHaveBeenCalledOnce();
    expect(match).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]?.[2]).toEqual(["e:7"]);
  });

  it("returns the stored response undecorated on a hit", async () => {
    const cached = new Response("cached", { status: 200 });
    const { cdn, put, decorate } = spies({
      match: () => Promise.resolve(cached),
    });
    const render = vi.fn(() => Promise.resolve(new Response("fresh")));

    const result = await readThrough({
      request: GET(),
      segment: "anonymous",
      intentKind: "front-page",
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    // The stored copy was decorated on the way in; decorating it again would
    // stamp the site TTL over the freshness it was stored with.
    expect(result).toBe(cached);
    expect(decorate).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("decorates without storing when the provider has no origin store", async () => {
    const { cdn, decorate } = spies({ storeless: true });
    const render = vi.fn(() =>
      Promise.resolve(new Response("body", { status: 200 })),
    );

    const result = await readThrough({
      request: GET(),
      segment: "anonymous",
      intentKind: "single",
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: () => ["e:7"],
    });

    expect(result.headers.get(DECORATED)).toBe("e:7");
    expect(decorate).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("bypasses the cdn entirely for a private segment", async () => {
    const { cdn, match, put, decorate } = spies();
    const fresh = new Response("live", { status: 200 });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThrough({
      request: GET(),
      segment: "private",
      intentKind: "single",
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(result).toBe(fresh);
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
  });

  it("keys a non-anonymous segment under a distinct entry and shares it across cookies", async () => {
    const { cdn, match, put } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("members", { status: 200 })),
    );

    await readThrough({
      request: new Request("https://site.test/members", {
        headers: { cookie: "plumix_session=alice" },
      }),
      segment: "authenticated",
      intentKind: "single",
      cdn,
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
    if (!matchKey || !putKey) throw new Error("expected a keyed cdn request");
    expect(new URL(matchKey.url).searchParams.get(SEGMENT_KEY_PARAM)).toBe(
      "authenticated",
    );
    expect(matchKey.headers.has("cookie")).toBe(false);
    expect(putKey.url).toBe(matchKey.url);
  });

  it("bypasses a non-anonymous segment on a provider that cannot separate them", async () => {
    const { cdn, decorate } = spies({ storeless: true });
    const fresh = new Response("members", { status: 200 });
    const render = vi.fn(() => Promise.resolve(fresh));
    const telemetry = createTelemetryCollector();

    // Storeless and without `segmentVary`, the provider hands every visitor one
    // shared copy — so this render must not be decorated into it.
    const result = await readThrough({
      request: GET("https://site.test/members"),
      segment: "authenticated",
      intentKind: "single",
      cdn,
      defer: immediateDefer,
      telemetry,
      render,
      tags: noTags,
    });

    expect(result).toBe(fresh);
    expect(decorate).not.toHaveBeenCalled();
    expect(cdnFacts(telemetry)).toEqual([
      {
        decision: "bypass",
        reason: "segment-unsupported",
        segment: "authenticated",
        originStore: false,
      },
    ]);
  });

  it("does not bypass a storeless provider that declares it can key by segment", async () => {
    const { cdn } = spies({ storeless: true });
    const render = vi.fn(() =>
      Promise.resolve(new Response("members", { status: 200 })),
    );
    const telemetry = createTelemetryCollector();

    // The bypass is named for the capability, not for the store: a vendor that
    // varies on a named cookie satisfies it by a different route. Core does not
    // call `segmentVary` — the dispatcher stamps every non-anonymous render
    // `private, no-store`, so a conforming `decorate` refuses it anyway.
    await readThrough({
      request: GET("https://site.test/members"),
      segment: "authenticated",
      intentKind: "single",
      cdn: { ...cdn, segmentVary: (response) => response },
      defer: immediateDefer,
      telemetry,
      render,
      tags: noTags,
    });

    expect(cdnFacts(telemetry)).toEqual([
      {
        decision: "miss",
        stored: false,
        segment: "authenticated",
        originStore: false,
      },
    ]);
  });

  it("renders live without touching the cdn for an unmatched route", async () => {
    const { cdn, match, put, decorate } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("404", { status: 404 })),
    );

    await readThrough({
      request: GET(),
      segment: "anonymous",
      intentKind: null,
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
  });

  it("stores a custom archive that opted into caching", async () => {
    const { cdn, match, put } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("listing", { status: 200 })),
    );

    await readThrough({
      request: GET(),
      segment: "anonymous",
      intentKind: "custom",
      customArchiveCacheable: true,
      cdn,
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
    const { cdn, match, put, decorate } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("listing", { status: 200 })),
    );

    await readThrough({
      request: GET(),
      segment: "anonymous",
      intentKind: "custom",
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(render).toHaveBeenCalledOnce();
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
  });

  it("stores a page render that sets a cookie but does not decorate it", async () => {
    const { cdn, put, decorate } = spies();
    const fresh = new Response("body", {
      status: 200,
      headers: { "set-cookie": "plumix_locale=fr" },
    });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThrough({
      request: GET(),
      segment: "anonymous",
      intentKind: "single",
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: () => ["t:post"],
    });

    // The store strips the cookie from a copy nobody else holds, so it keeps
    // storing. This copy is the visitor's own and cannot be stripped, so it
    // leaves without inviting a shared cache to hold it.
    expect(put).toHaveBeenCalledOnce();
    expect(decorate).not.toHaveBeenCalled();
    expect(result).toBe(fresh);
  });

  it("neither stores nor decorates a non-200 render", async () => {
    const { cdn, match, put, decorate } = spies();
    const fresh = new Response("nope", { status: 404 });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThrough({
      request: GET(),
      segment: "anonymous",
      intentKind: "single",
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(result).toBe(fresh);
    expect(match).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
  });

  it("records a miss against an origin store as stored", async () => {
    const telemetry = createTelemetryCollector();

    await readThrough({
      request: GET(),
      segment: "anonymous",
      intentKind: "single",
      cdn: spies().cdn,
      defer: immediateDefer,
      telemetry,
      render: () => Promise.resolve(new Response("body")),
      tags: noTags,
    });

    expect(cdnFacts(telemetry)).toEqual([
      {
        segment: "anonymous",
        decision: "miss",
        stored: true,
        originStore: true,
      },
    ]);
  });

  it("records a storeless miss as a regime rather than a failure", async () => {
    const telemetry = createTelemetryCollector();

    await readThrough({
      request: GET(),
      segment: "anonymous",
      intentKind: "single",
      cdn: spies({ storeless: true }).cdn,
      defer: immediateDefer,
      telemetry,
      render: () => Promise.resolve(new Response("body")),
      tags: noTags,
    });

    // Nothing ever hits at the origin here, so `stored: false` is permanent and
    // correct — `originStore` is what tells the two apart.
    expect(cdnFacts(telemetry)).toEqual([
      {
        segment: "anonymous",
        decision: "miss",
        stored: false,
        originStore: false,
      },
    ]);
  });
});

describe("readThroughRoute", () => {
  it("renders, stores and decorates an opted-in plugin route on a miss", async () => {
    const { cdn, match, put, decorate } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("card", { status: 200 })),
    );

    const result = await readThroughRoute({
      request: GET("https://site.test/_plumix/og/card/abc.png"),
      hasSession: false,
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(await result.text()).toBe("card");
    expect(decorate).toHaveBeenCalledOnce();
    expect(match).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
    // Core can't name a raw route's content dependencies, so a handler that
    // declared none stores untagged — unreachable by any purge.
    expect(put.mock.calls[0]?.[2]).toEqual([]);
  });

  it("stores under the tags the handler declared while it ran", async () => {
    const { cdn, put } = spies();
    const declared: string[] = [];
    const render = vi.fn(() => {
      declared.push("e:7", "t:post");
      return Promise.resolve(new Response("card", { status: 200 }));
    });

    await readThroughRoute({
      request: GET("https://site.test/_plumix/og/card/abc.png"),
      hasSession: false,
      cdn,
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
    const { cdn, put } = spies({ match: () => Promise.resolve(cached) });
    const render = vi.fn(() => Promise.resolve(new Response("fresh")));

    const result = await readThroughRoute({
      request: GET("https://site.test/_plumix/og/card/abc.png"),
      hasSession: false,
      cdn,
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
    const { cdn, match, put } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("card", { status: 200 })),
    );

    await readThroughRoute({
      // A cookie that isn't a session — this visitor is not privileged, so the
      // render is storable, and the entry it fills is the one everyone reads.
      request: new Request("https://site.test/_plumix/og/card/abc.png", {
        headers: { cookie: "plumix_locale=fr" },
      }),
      hasSession: false,
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    const matchKey = match.mock.calls[0]?.[0];
    const putKey = put.mock.calls[0]?.[0];
    if (!matchKey || !putKey) throw new Error("expected a keyed cdn request");
    expect(matchKey.url).toBe("https://site.test/_plumix/og/card/abc.png");
    expect(matchKey.headers.has("cookie")).toBe(false);
    expect(putKey.url).toBe(matchKey.url);
  });

  it("bypasses the cdn for a write method", async () => {
    const { cdn, match, put, decorate } = spies();
    const fresh = new Response("done", { status: 200 });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThroughRoute({
      request: new Request("https://site.test/_plumix/og/card/abc.png", {
        method: "POST",
      }),
      hasSession: false,
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(result).toBe(fresh);
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
  });

  it("neither stores nor decorates a response the handler declared unshareable", async () => {
    const { cdn, match, put, decorate } = spies();
    // The route opted in, but this particular response is one visitor's: the
    // handler says so, and decorating it would announce it as shared.
    const fresh = new Response("personalized card", {
      status: 200,
      headers: { "cache-control": "private, no-store" },
    });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThroughRoute({
      request: GET("https://site.test/_plumix/og/card/abc.png"),
      hasSession: false,
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(result).toBe(fresh);
    expect(match).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
  });

  it("decorates a HEAD but never stores one (the Cache API is GET-only)", async () => {
    const { cdn, match, put, decorate } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("card", { status: 200 })),
    );

    await readThroughRoute({
      request: new Request("https://site.test/_plumix/og/card/abc.png", {
        method: "HEAD",
      }),
      hasSession: false,
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
    });

    expect(match).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
    expect(decorate).toHaveBeenCalledOnce();
  });

  it.each([
    {
      case: "the request carries a bearer credential",
      request: GET("https://site.test/_plumix/og/card/abc.png", {
        authorization: "Bearer token",
      }),
      hasSession: false,
      fresh: new Response("card", { status: 200 }),
    },
    {
      case: "the authenticator reports a session",
      request: GET("https://site.test/_plumix/og/card/abc.png"),
      hasSession: true,
      fresh: new Response("card", { status: 200 }),
    },
    {
      case: "the response sets a cookie",
      request: GET("https://site.test/_plumix/og/card/abc.png"),
      hasSession: false,
      fresh: new Response("card", {
        status: 200,
        headers: { "set-cookie": "csrf=abc" },
      }),
    },
  ])(
    "serves but neither stores nor decorates when $case",
    async ({ request, hasSession, fresh }) => {
      const { cdn, match, put, decorate } = spies();
      const render = vi.fn(() => Promise.resolve(fresh));

      const result = await readThroughRoute({
        request,
        hasSession,
        cdn,
        defer: immediateDefer,
        telemetry: NOOP_TELEMETRY,
        render,
        tags: noTags,
      });

      expect(result).toBe(fresh);
      expect(match).toHaveBeenCalledOnce();
      expect(put).not.toHaveBeenCalled();
      expect(decorate).not.toHaveBeenCalled();
    },
  );
});

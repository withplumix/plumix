import { describe, expect, it, vi } from "vitest";

import type { TelemetryCollector } from "../context/telemetry.js";
import type { CdnStore, ConnectedCdn } from "../runtime/contract/slots.js";
import type {
  RequestFacts,
  RouteRequestFacts,
  SharingDecision,
} from "./sharing-verdict.js";
import { createTelemetryCollector } from "../context/collector.js";
import { NOOP_TELEMETRY } from "../context/telemetry.js";
import { responseAllowsSharedStorage, SEGMENT_KEY_PARAM } from "./decision.js";
import {
  cdnCanKeySegments,
  readThrough,
  readThroughRoute,
} from "./read-through.js";
import {
  routeSharingBeforeRender,
  sharingBeforeRender,
} from "./sharing-verdict.js";
import { isUniversalCopy, UNIVERSAL_COPY_HEADER } from "./universal-copy.js";

/**
 * `defer` swallows the promise here so tests can drive the store-write path
 * without a real waitUntil queue.
 */
const immediateDefer = (p: Promise<unknown>): void => {
  void p;
};

const GET = (
  url = "https://site.test/hello",
  headers?: Record<string, string>,
) => new Request(url, { headers });
const noTags = () => [];

/**
 * Set only by a conforming, narrow-never-widen `decorate`: a fake that
 * decorated unconditionally would share the code's assumption and never fail.
 */
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

/** An unprivileged request with no policy, asked of `cdn` as the dispatcher asks it. */
function decide(
  cdn: ConnectedCdn,
  facts: Pick<RequestFacts, "request" | "page"> & Partial<RequestFacts>,
): SharingDecision {
  return sharingBeforeRender({
    privileged: false,
    ephemeralGrant: false,
    authorization: false,
    principalIsPersonal: false,
    accessSegment: null,
    canKeySegments: cdnCanKeySegments(cdn),
    ...facts,
  });
}

/** An unprivileged request to a raw route, as the dispatcher asks it. */
function decideRoute(request: Request, facts: Partial<RouteRequestFacts> = {}) {
  return routeSharingBeforeRender({
    request,
    privileged: false,
    ephemeralGrant: false,
    route: "raw",
    ...facts,
  });
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
      decision: decide(cdn, {
        request: GET(),
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: () => ["e:7"],
      personal: () => false,
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
      decision: decide(cdn, {
        request: GET(),
        page: { kind: "content", intent: "frontPage" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
      personal: () => false,
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
      decision: decide(cdn, {
        request: GET(),
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: () => ["e:7"],
      personal: () => false,
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
      decision: decide(cdn, {
        request: GET(),
        accessSegment: "private",
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
      personal: () => false,
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
      decision: decide(cdn, {
        request: new Request("https://site.test/members", {
          headers: { cookie: "plumix_session=alice" },
        }),
        accessSegment: "authenticated",
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
      personal: () => false,
    });

    // The stored/looked-up key folds the segment into the URL and carries no
    // per-visitor cookie — so a second member (different cookie) collides
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
      decision: decide(cdn, {
        request: GET("https://site.test/members"),
        accessSegment: "authenticated",
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry,
      render,
      tags: noTags,
      personal: () => false,
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
    const varying = { ...cdn, segmentVary: (response: Response) => response };

    await readThrough({
      decision: decide(varying, {
        request: GET("https://site.test/members"),
        accessSegment: "authenticated",
        page: { kind: "content", intent: "entry" },
      }),
      cdn: varying,
      defer: immediateDefer,
      telemetry,
      render,
      tags: noTags,
      personal: () => false,
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

  it("neither stores nor decorates a personal render, and the record says so", async () => {
    const { cdn, match, put, decorate } = spies();
    const fresh = new Response("members", { status: 200 });
    const render = vi.fn(() => Promise.resolve(fresh));
    const telemetry = createTelemetryCollector();

    const result = await readThrough({
      decision: decide(cdn, {
        request: GET("https://site.test/members"),
        accessSegment: "authenticated",
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry,
      render,
      tags: () => ["e:7"],
      personal: () => true,
    });

    // The lookup still ran: a stored copy of the segment is served on a hit,
    // and the personal render does not evict it.
    expect(match).toHaveBeenCalledOnce();
    expect(result).toBe(fresh);
    expect(put).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
    expect(cdnFacts(telemetry)).toEqual([
      {
        decision: "miss",
        stored: false,
        segment: "authenticated",
        originStore: true,
        personal: true,
      },
    ]);
  });

  it("renders live without touching the cdn for an unmatched route", async () => {
    const { cdn, match, put, decorate } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("404", { status: 404 })),
    );

    await readThrough({
      decision: decide(cdn, {
        request: GET(),
        page: { kind: "content", intent: null },
      }),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
      personal: () => false,
    });

    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
  });

  it("stores an archive type that opted into caching", async () => {
    const { cdn, match, put } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("listing", { status: 200 })),
    );

    await readThrough({
      decision: decide(cdn, {
        request: GET(),
        page: {
          kind: "content",
          intent: "archiveType",
          registeredCacheable: true,
        },
      }),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: () => ["t:school"],
      personal: () => false,
    });

    expect(match).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]?.[2]).toEqual(["t:school"]);
  });

  it("bypasses an archive type that did not opt into caching", async () => {
    const { cdn, match, put, decorate } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("listing", { status: 200 })),
    );

    await readThrough({
      decision: decide(cdn, {
        request: GET(),
        page: { kind: "content", intent: "archiveType" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
      personal: () => false,
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
      decision: decide(cdn, {
        request: GET(),
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: () => ["t:post"],
      personal: () => false,
    });

    // The stored copy has its cookie stripped; the visitor's own copy cannot
    // be, so it must not invite a shared cache to hold it.
    expect(put).toHaveBeenCalledOnce();
    expect(decorate).not.toHaveBeenCalled();
    expect(result).toBe(fresh);
  });

  it("neither stores nor decorates a non-200 render", async () => {
    const { cdn, match, put, decorate } = spies();
    const fresh = new Response("nope", { status: 404 });
    const render = vi.fn(() => Promise.resolve(fresh));

    const result = await readThrough({
      decision: decide(cdn, {
        request: GET(),
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
      personal: () => false,
    });

    expect(result).toBe(fresh);
    expect(match).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
  });

  it("stores a shared segment's render without decorating it", async () => {
    const { cdn, put, decorate } = spies();
    const fresh = new Response("members", { status: 200 });

    const result = await readThrough({
      decision: decide(cdn, {
        request: GET("https://site.test/members"),
        accessSegment: "authenticated",
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render: () => Promise.resolve(fresh),
      tags: () => ["e:7"],
      personal: () => false,
    });

    expect(put).toHaveBeenCalledOnce();
    expect(decorate).not.toHaveBeenCalled();
    expect(result).toBe(fresh);
  });

  it("records a hit with its segment", async () => {
    const telemetry = createTelemetryCollector();
    const { cdn } = spies({
      match: () => Promise.resolve(new Response("cached", { status: 200 })),
    });

    await readThrough({
      decision: decide(cdn, {
        request: GET("https://site.test/members"),
        accessSegment: "authenticated",
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry,
      render: () => Promise.resolve(new Response("fresh")),
      tags: noTags,
      personal: () => false,
    });

    expect(cdnFacts(telemetry)).toEqual([
      { segment: "authenticated", decision: "hit", originStore: true },
    ]);
  });

  it("records a miss against an origin store as stored", async () => {
    const telemetry = createTelemetryCollector();
    const { cdn } = spies();

    await readThrough({
      decision: decide(cdn, {
        request: GET(),
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry,
      render: () => Promise.resolve(new Response("body")),
      tags: noTags,
      personal: () => false,
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
    const { cdn } = spies({ storeless: true });

    await readThrough({
      decision: decide(cdn, {
        request: GET(),
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry,
      render: () => Promise.resolve(new Response("body")),
      tags: noTags,
      personal: () => false,
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

describe("readThrough for a session on a page with no policy", () => {
  const ENTRY = { kind: "content", intent: "entry" } as const;

  function sessionDecision(cdn: ConnectedCdn): SharingDecision {
    return decide(cdn, {
      request: GET("https://site.test/hello", {
        cookie: "plumix_session=alice",
      }),
      privileged: true,
      page: ENTRY,
    });
  }

  function stored(body: string, headers: Record<string, string> = {}) {
    return new Response(body, { status: 200, headers });
  }

  it("serves the universal copy without a render", async () => {
    const universal = stored("shared", { [UNIVERSAL_COPY_HEADER]: "1" });
    const { cdn, match, put } = spies({
      match: () => Promise.resolve(universal),
    });
    const render = vi.fn(() => Promise.resolve(new Response("live")));

    const result = await readThrough({
      decision: sessionDecision(cdn),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render,
      tags: noTags,
      personal: () => false,
    });

    expect(result).toBe(universal);
    expect(render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(match.mock.calls[0]?.[0].headers.has("cookie")).toBe(false);
  });

  it("renders live over a stored copy that is not universal", async () => {
    const { cdn, put, decorate } = spies({
      match: () => Promise.resolve(stored("teaser")),
    });
    const fresh = new Response("member body", { status: 200 });

    const result = await readThrough({
      decision: sessionDecision(cdn),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render: () => Promise.resolve(fresh),
      tags: noTags,
      personal: () => false,
    });

    expect(result).toBe(fresh);
    expect(put).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
  });

  it("renders live on a miss and never stores the render", async () => {
    const { cdn, put, decorate } = spies();
    const fresh = new Response("member body", { status: 200 });
    const telemetry = createTelemetryCollector();

    const result = await readThrough({
      decision: sessionDecision(cdn),
      cdn,
      defer: immediateDefer,
      telemetry,
      render: () => Promise.resolve(fresh),
      tags: () => ["e:7"],
      personal: () => false,
    });

    expect(result).toBe(fresh);
    expect(put).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
    expect(cdnFacts(telemetry)).toEqual([
      {
        segment: "private",
        universalRead: true,
        decision: "miss",
        stored: false,
        originStore: true,
      },
    ]);
  });
});

describe("the copy an anonymous render stores", () => {
  async function storedCopy(accessSegment: RequestFacts["accessSegment"]) {
    const { cdn, put } = spies();
    await readThrough({
      decision: decide(cdn, {
        request: GET(),
        accessSegment,
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render: () => Promise.resolve(new Response("page", { status: 200 })),
      tags: noTags,
      personal: () => false,
    });
    const copy = put.mock.calls[0]?.[1];
    if (copy === undefined) throw new Error("expected a stored copy");
    return copy;
  }

  it("is marked universal on a page with no policy", async () => {
    expect(isUniversalCopy(await storedCopy(null))).toBe(true);
  });

  it("is not marked universal on a policied page", async () => {
    expect(isUniversalCopy(await storedCopy("anonymous"))).toBe(false);
  });

  it("leaves the response the visitor gets unmarked", async () => {
    const { cdn } = spies();

    const result = await readThrough({
      decision: decide(cdn, {
        request: GET(),
        page: { kind: "content", intent: "entry" },
      }),
      cdn,
      defer: immediateDefer,
      telemetry: NOOP_TELEMETRY,
      render: () => Promise.resolve(new Response("page", { status: 200 })),
      tags: noTags,
      personal: () => false,
    });

    expect(isUniversalCopy(result)).toBe(false);
  });
});

describe("readThroughRoute", () => {
  it("renders, stores and decorates an opted-in plugin route on a miss", async () => {
    const { cdn, match, put, decorate } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("card", { status: 200 })),
    );

    const result = await readThroughRoute({
      decision: decideRoute(GET("https://site.test/_plumix/og/card/abc.png")),
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
      decision: decideRoute(GET("https://site.test/_plumix/og/card/abc.png")),
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
      decision: decideRoute(GET("https://site.test/_plumix/og/card/abc.png")),
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
      decision: decideRoute(
        new Request("https://site.test/_plumix/og/card/abc.png", {
          headers: { cookie: "plumix_locale=fr" },
        }),
      ),
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
      decision: decideRoute(
        new Request("https://site.test/_plumix/og/card/abc.png", {
          method: "POST",
        }),
      ),
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
      decision: decideRoute(GET("https://site.test/_plumix/og/card/abc.png")),
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

  it("records a route miss with no segment and no personal flag", async () => {
    const telemetry = createTelemetryCollector();

    await readThroughRoute({
      decision: decideRoute(GET("https://site.test/_plumix/og/card/abc.png")),
      cdn: spies().cdn,
      defer: immediateDefer,
      telemetry,
      render: () => Promise.resolve(new Response("card", { status: 200 })),
      tags: noTags,
    });

    expect(cdnFacts(telemetry)).toEqual([
      { decision: "miss", stored: true, originStore: true },
    ]);
  });

  it("decorates a HEAD but never stores one (the Cache API is GET-only)", async () => {
    const { cdn, match, put, decorate } = spies();
    const render = vi.fn(() =>
      Promise.resolve(new Response("card", { status: 200 })),
    );

    await readThroughRoute({
      decision: decideRoute(
        new Request("https://site.test/_plumix/og/card/abc.png", {
          method: "HEAD",
        }),
      ),
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
      case: "the response sets a cookie",
      decision: decideRoute(GET("https://site.test/_plumix/og/card/abc.png")),
      fresh: new Response("card", {
        status: 200,
        headers: { "set-cookie": "csrf=abc" },
      }),
    },
  ])(
    "serves but neither stores nor decorates when $case",
    async ({ decision, fresh }) => {
      const { cdn, match, put, decorate } = spies();
      const render = vi.fn(() => Promise.resolve(fresh));

      const result = await readThroughRoute({
        decision,
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

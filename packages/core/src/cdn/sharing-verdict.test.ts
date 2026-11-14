import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Segment } from "../access/contract/access.js";
import type {
  CdnBypassReason,
  PageKind,
  RequestFacts,
  RouteRenderFacts,
  RouteRequestFacts,
  RouteSharingDecision,
  SharingDecision,
} from "./sharing-verdict.js";
import {
  routeSharingAfterRender,
  routeSharingBeforeRender,
  sharingAfterRender,
  sharingBeforeRender,
} from "./sharing-verdict.js";

beforeEach(() => {
  vi.stubEnv("PLUMIX_BUILD_ID", "b1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** An anonymous GET to an entry permalink, on a CDN that keys segments. */
function facts(overrides: Partial<RequestFacts> = {}): RequestFacts {
  return {
    request: new Request("https://site.test/post"),
    privileged: false,
    ephemeralGrant: false,
    authorization: false,
    principalIsPersonal: false,
    accessSegment: null,
    page: { kind: "content", intent: "entry" },
    canKeySegments: true,
    forwarded: false,
    ...overrides,
  };
}

/** The decision as plain data: the segment and the bypass reason or key URL. */
function outcome(decision: SharingDecision) {
  switch (decision.kind) {
    case "bypass":
      return { segment: decision.segment, bypass: decision.reason };
    case "read-through":
      return { segment: decision.segment, key: decision.key.url };
    case "read-universal":
      return { segment: decision.segment, universal: decision.key.url };
  }
}

const PLAIN_KEY = "https://site.test/post?__plumix_build=b1";

describe("sharingBeforeRender", () => {
  it.each([
    {
      name: "an unpolicied page to an unprivileged request is anonymous",
      facts: facts(),
      expected: { segment: "anonymous", key: PLAIN_KEY },
    },
    {
      name: "an unpolicied page to a session reads the universal copy",
      facts: facts({ privileged: true }),
      expected: { segment: "private", universal: PLAIN_KEY },
    },
    {
      name: "an unpolicied page to an Authorization header is private",
      facts: facts({ privileged: true, authorization: true }),
      expected: { segment: "private", bypass: "private" },
    },
    {
      name: "an unpolicied page to a session with an ephemeral grant is private",
      facts: facts({ privileged: true, ephemeralGrant: true }),
      expected: { segment: "private", bypass: "private" },
    },
    {
      name: "an unpolicied page to a principal personal from the start is private",
      facts: facts({ privileged: true, principalIsPersonal: true }),
      expected: { segment: "private", bypass: "private" },
    },
    {
      name: "an unpolicied search to a session is private",
      facts: facts({
        privileged: true,
        page: { kind: "content", intent: "search" },
      }),
      expected: { segment: "private", bypass: "private" },
    },
    {
      name: "an unpolicied page to a session's POST bypasses the method",
      facts: facts({
        privileged: true,
        request: new Request("https://site.test/post", { method: "POST" }),
      }),
      expected: { segment: "private", bypass: "method" },
    },
    {
      name: "an unpolicied page with an ephemeral grant is private",
      facts: facts({ ephemeralGrant: true }),
      expected: { segment: "private", bypass: "private" },
    },
    {
      name: "an anonymous grant to an unprivileged request stays anonymous",
      facts: facts({ accessSegment: "anonymous" }),
      expected: { segment: "anonymous", key: PLAIN_KEY },
    },
    {
      name: "an anonymous grant to a privileged request is private",
      facts: facts({ accessSegment: "anonymous", privileged: true }),
      expected: { segment: "private", bypass: "private" },
    },
    {
      name: "an anonymous grant with an ephemeral grant and no session is private",
      facts: facts({ accessSegment: "anonymous", ephemeralGrant: true }),
      expected: { segment: "private", bypass: "private" },
    },
    {
      name: "a shared segment to a privileged request keeps its segment",
      facts: facts({ accessSegment: "authenticated", privileged: true }),
      expected: {
        segment: "authenticated",
        key: "https://site.test/post?__plumix_segment=authenticated&__plumix_build=b1",
      },
    },
    {
      name: "a capability segment is keyed by its capability",
      facts: facts({
        accessSegment: "capability:briefing:read",
        privileged: true,
      }),
      expected: {
        segment: "capability:briefing:read",
        key: "https://site.test/post?__plumix_segment=capability%3Abriefing%3Aread&__plumix_build=b1",
      },
    },
    {
      name: "a shared segment with an ephemeral grant is private",
      facts: facts({
        accessSegment: "authenticated",
        privileged: true,
        ephemeralGrant: true,
      }),
      expected: { segment: "private", bypass: "private" },
    },
    {
      name: "a private grant is private",
      facts: facts({ accessSegment: "private", privileged: true }),
      expected: { segment: "private", bypass: "private" },
    },

    {
      name: "a write method bypasses",
      facts: facts({
        request: new Request("https://site.test/post", { method: "POST" }),
      }),
      expected: { segment: "anonymous", bypass: "method" },
    },
    {
      name: "a HEAD is read through",
      facts: facts({
        request: new Request("https://site.test/post", { method: "HEAD" }),
      }),
      expected: { segment: "anonymous", key: PLAIN_KEY },
    },
    {
      name: "a page no public route matched bypasses before its method is asked",
      facts: facts({
        request: new Request("https://site.test/post", { method: "POST" }),
        page: { kind: "content", intent: null },
      }),
      expected: { segment: "anonymous", bypass: "no-route" },
    },
    {
      name: "an entry-type archive is read through",
      facts: facts({ page: { kind: "content", intent: "entryType" } }),
      expected: { segment: "anonymous", key: PLAIN_KEY },
    },
    {
      name: "a term archive is read through",
      facts: facts({ page: { kind: "content", intent: "term" } }),
      expected: { segment: "anonymous", key: PLAIN_KEY },
    },
    {
      name: "the front page is read through",
      facts: facts({ page: { kind: "content", intent: "frontPage" } }),
      expected: { segment: "anonymous", key: PLAIN_KEY },
    },
    {
      name: "a search page bypasses",
      facts: facts({ page: { kind: "content", intent: "search" } }),
      expected: { segment: "anonymous", bypass: "intent" },
    },
    {
      name: "an archive type that did not opt in bypasses",
      facts: facts({ page: { kind: "content", intent: "archiveType" } }),
      expected: { segment: "anonymous", bypass: "intent" },
    },
    {
      name: "an archive type that opted out bypasses",
      facts: facts({
        page: {
          kind: "content",
          intent: "archiveType",
          registeredCacheable: false,
        },
      }),
      expected: { segment: "anonymous", bypass: "intent" },
    },
    {
      name: "an archive type that opted in is read through",
      facts: facts({
        page: {
          kind: "content",
          intent: "archiveType",
          registeredCacheable: true,
        },
      }),
      expected: { segment: "anonymous", key: PLAIN_KEY },
    },
    {
      name: "a view that did not opt in bypasses",
      facts: facts({ page: { kind: "content", intent: "view" } }),
      expected: { segment: "anonymous", bypass: "intent" },
    },
    {
      name: "a view that opted in is read through",
      facts: facts({
        page: { kind: "content", intent: "view", registeredCacheable: true },
      }),
      expected: { segment: "anonymous", key: PLAIN_KEY },
    },
    {
      name: "an opted-in archive type still bypasses a private segment",
      facts: facts({
        accessSegment: "private",
        page: {
          kind: "content",
          intent: "archiveType",
          registeredCacheable: true,
        },
      }),
      expected: { segment: "private", bypass: "private" },
    },
    {
      name: "an opted-in archive type with no policy reads the universal copy",
      facts: facts({
        privileged: true,
        page: {
          kind: "content",
          intent: "archiveType",
          registeredCacheable: true,
        },
      }),
      expected: { segment: "private", universal: PLAIN_KEY },
    },
    {
      name: "an archive type not opted in is private to a session",
      facts: facts({
        privileged: true,
        page: { kind: "content", intent: "archiveType" },
      }),
      expected: { segment: "private", bypass: "private" },
    },
    {
      name: "an opted-in archive type still bypasses a write method",
      facts: facts({
        request: new Request("https://site.test/post", { method: "POST" }),
        page: {
          kind: "content",
          intent: "archiveType",
          registeredCacheable: true,
        },
      }),
      expected: { segment: "anonymous", bypass: "method" },
    },
    {
      name: "a policied plugin route never reaches the CDN",
      facts: facts({
        accessSegment: "anonymous",
        page: { kind: "policied-route" },
      }),
      expected: { segment: "anonymous", bypass: "intent" },
    },
    {
      name: "a policied plugin route with an ephemeral grant is private",
      facts: facts({
        accessSegment: "anonymous",
        ephemeralGrant: true,
        page: { kind: "policied-route" },
      }),
      expected: { segment: "private", bypass: "private" },
    },

    {
      name: "a shared segment bypasses a CDN that cannot key segments",
      facts: facts({ accessSegment: "authenticated", canKeySegments: false }),
      expected: { segment: "authenticated", bypass: "segment-unsupported" },
    },
    {
      name: "the anonymous segment is read through on a CDN that cannot key segments",
      facts: facts({ canKeySegments: false }),
      expected: { segment: "anonymous", key: PLAIN_KEY },
    },
    {
      name: "a private segment reports private on a CDN that cannot key segments",
      facts: facts({ accessSegment: "private", canKeySegments: false }),
      expected: { segment: "private", bypass: "private" },
    },
  ])("$name", ({ facts: request, expected }) => {
    expect(outcome(sharingBeforeRender(request))).toEqual(expected);
  });

  it("drops the visitor's cookie from the key", () => {
    const decision = sharingBeforeRender(
      facts({
        request: new Request("https://site.test/post", {
          headers: { cookie: "plumix_session=abc" },
        }),
        accessSegment: "authenticated",
      }),
    );

    expect(decision).toMatchObject({ kind: "read-through" });
    const { key } = decision as Extract<
      SharingDecision,
      { kind: "read-through" }
    >;
    expect(key.headers.has("cookie")).toBe(false);
  });

  it("reads through for the front cache that forwarded the request", () => {
    expect(sharingBeforeRender(facts({ forwarded: true }))).toMatchObject({
      kind: "read-through",
      forwarded: true,
    });
  });
});

const ENTRY: PageKind = { kind: "content", intent: "entry" };

function readThrough(
  segment: Segment,
  universal = false,
  forwarded = false,
): SharingDecision {
  return {
    kind: "read-through",
    segment,
    page: ENTRY,
    key: new Request("https://site.test/post"),
    universal,
    forwarded,
  };
}

const READ_UNIVERSAL: SharingDecision = {
  kind: "read-universal",
  segment: "private",
  page: ENTRY,
  key: new Request("https://site.test/post"),
};

function bypass(
  segment: Segment,
  reason: CdnBypassReason,
  page: PageKind = ENTRY,
): SharingDecision {
  return { kind: "bypass", segment, page, reason };
}

describe("sharingAfterRender", () => {
  it.each([
    {
      name: "an anonymous 200 is stored, decorated and leaves as a page",
      decision: readThrough("anonymous"),
      render: { status: 200, personal: false, setsCookie: false },
      expected: {
        store: true,
        decorate: true,
        universal: false,
        clientCopy: "page",
      },
    },
    {
      name: "a 200 the front cache forwarded is stored, decorated and leaves for it",
      decision: readThrough("anonymous", true, true),
      render: { status: 200, personal: false, setsCookie: false },
      expected: {
        store: true,
        decorate: true,
        universal: true,
        clientCopy: "front-cache",
      },
    },
    {
      name: "a 200 the front cache forwarded that sets a cookie is stored but not decorated",
      decision: readThrough("anonymous", true, true),
      render: { status: 200, personal: false, setsCookie: true },
      expected: {
        store: true,
        decorate: false,
        universal: true,
        clientCopy: "front-cache",
      },
    },
    {
      name: "an anonymous 404 is neither stored nor decorated",
      decision: readThrough("anonymous"),
      render: { status: 404, personal: false, setsCookie: false },
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "page",
      },
    },
    {
      name: "an anonymous redirect is neither stored nor decorated",
      decision: readThrough("anonymous"),
      render: { status: 301, personal: false, setsCookie: false },
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "page",
      },
    },
    {
      name: "an anonymous 500 is neither stored nor decorated",
      decision: readThrough("anonymous"),
      render: { status: 500, personal: false, setsCookie: false },
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "page",
      },
    },
    {
      name: "a personal anonymous 200 is neither stored nor decorated",
      decision: readThrough("anonymous"),
      render: { status: 200, personal: true, setsCookie: false },
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "page",
      },
    },
    {
      name: "an anonymous 200 that sets a cookie is stored but not decorated",
      decision: readThrough("anonymous"),
      render: { status: 200, personal: false, setsCookie: true },
      expected: {
        store: true,
        decorate: false,
        universal: false,
        clientCopy: "page",
      },
    },
    {
      name: "a shared segment's 200 is stored but leaves private",
      decision: readThrough("authenticated"),
      render: { status: 200, personal: false, setsCookie: false },
      expected: {
        store: true,
        decorate: false,
        universal: false,
        clientCopy: "private",
      },
    },
    {
      name: "a shared segment's personal 200 is not stored and leaves private",
      decision: readThrough("authenticated"),
      render: { status: 200, personal: true, setsCookie: false },
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "private",
      },
    },
    {
      name: "a shared segment's 404 is not stored and leaves private",
      decision: readThrough("capability:briefing:read"),
      render: { status: 404, personal: false, setsCookie: false },
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "private",
      },
    },
    {
      name: "a private bypass leaves private",
      decision: bypass("private", "private"),
      render: { status: 200, personal: false, setsCookie: false },
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "private",
      },
    },
    {
      name: "an anonymous bypass is not stored and leaves as a page",
      decision: bypass("anonymous", "intent"),
      render: { status: 200, personal: false, setsCookie: false },
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "page",
      },
    },
    {
      name: "a shared segment the CDN cannot key leaves private",
      decision: bypass("authenticated", "segment-unsupported"),
      render: { status: 200, personal: false, setsCookie: false },
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "private",
      },
    },
    {
      name: "a policied plugin route's anonymous response leaves as rendered",
      decision: bypass("anonymous", "intent", { kind: "policied-route" }),
      render: { status: 200, personal: false, setsCookie: false },
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "as-rendered",
      },
    },
    {
      name: "a policied plugin route's private response leaves private",
      decision: bypass("private", "private", { kind: "policied-route" }),
      render: { status: 200, personal: false, setsCookie: false },
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "private",
      },
    },
    {
      name: "an anonymous hit leaves as a page",
      decision: readThrough("anonymous"),
      render: undefined,
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "page",
      },
    },
    {
      name: "a shared segment's hit leaves private",
      decision: readThrough("authenticated"),
      render: undefined,
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "private",
      },
    },
    {
      name: "an unpolicied anonymous 200 is stored as the universal copy",
      decision: readThrough("anonymous", true),
      render: { status: 200, personal: false, setsCookie: false },
      expected: {
        store: true,
        decorate: true,
        universal: true,
        clientCopy: "page",
      },
    },
    {
      name: "an unpolicied anonymous 404 is not stored as the universal copy",
      decision: readThrough("anonymous", true),
      render: { status: 404, personal: false, setsCookie: false },
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "page",
      },
    },
    {
      name: "a session's render of the universal page is never stored",
      decision: READ_UNIVERSAL,
      render: { status: 200, personal: false, setsCookie: false },
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "universal-reader",
      },
    },
  ])("$name", ({ decision, render, expected }) => {
    expect(sharingAfterRender(decision, render)).toEqual(expected);
  });
});

const CARD = "https://site.test/_plumix/og/card.png?v=2";

/** An anonymous GET to a public plugin route. */
function routeFacts(overrides: Partial<RouteRequestFacts> = {}) {
  return {
    request: new Request(CARD, { headers: { cookie: "plumix_locale=fr" } }),
    privileged: false,
    ephemeralGrant: false,
    route: "public",
    ...overrides,
  } satisfies RouteRequestFacts;
}

function routeOutcome(decision: RouteSharingDecision) {
  return decision.kind === "bypass"
    ? { bypass: decision.reason }
    : { key: decision.key.url, shareable: decision.shareable };
}

describe("routeSharingBeforeRender", () => {
  it.each([
    {
      name: "an unprivileged GET is read through under the route's own URL",
      facts: routeFacts(),
      expected: { key: `${CARD}&__plumix_build=b1`, shareable: true },
    },
    {
      name: "a HEAD is read through",
      facts: routeFacts({ request: new Request(CARD, { method: "HEAD" }) }),
      expected: { key: `${CARD}&__plumix_build=b1`, shareable: true },
    },
    {
      name: "a write method bypasses",
      facts: routeFacts({ request: new Request(CARD, { method: "POST" }) }),
      expected: { bypass: "method" },
    },
    {
      name: "a privileged request to a public route renders privately",
      facts: routeFacts({ privileged: true }),
      expected: { bypass: "private" },
    },
    {
      name: "an ephemeral grant to a public route renders privately",
      facts: routeFacts({ ephemeralGrant: true }),
      expected: { bypass: "private" },
    },
    {
      name: "a privileged write to a public route renders privately",
      facts: routeFacts({
        privileged: true,
        request: new Request(CARD, { method: "POST" }),
      }),
      expected: { bypass: "private" },
    },
    {
      name: "a privileged request to a raw route reads the shared copy but never fills it",
      facts: routeFacts({ route: "raw", privileged: true }),
      expected: { key: `${CARD}&__plumix_build=b1`, shareable: false },
    },
    {
      name: "an ephemeral grant to a raw route reads the shared copy but never fills it",
      facts: routeFacts({ route: "raw", ephemeralGrant: true }),
      expected: { key: `${CARD}&__plumix_build=b1`, shareable: false },
    },
    {
      name: "a privileged write to a raw route bypasses on its method",
      facts: routeFacts({
        route: "raw",
        privileged: true,
        request: new Request(CARD, { method: "POST" }),
      }),
      expected: { bypass: "method" },
    },
  ])("$name", ({ facts: given, expected }) => {
    expect(routeOutcome(routeSharingBeforeRender(given))).toEqual(expected);
  });

  it("drops the visitor's cookie from the key", () => {
    const decision = routeSharingBeforeRender(routeFacts());

    expect(decision).toMatchObject({ kind: "read-through" });
    const { key } = decision as Extract<
      RouteSharingDecision,
      { kind: "read-through" }
    >;
    expect(key.headers.has("cookie")).toBe(false);
  });
});

function routeReadThrough(shareable = true): RouteSharingDecision {
  return { kind: "read-through", key: new Request(CARD), shareable };
}

/** A 200 that sets no cookie and declares no cache-control. */
function routeRender(overrides: Partial<RouteRenderFacts> = {}) {
  return {
    status: 200,
    setsCookie: false,
    cacheControl: null,
    ...overrides,
  } satisfies RouteRenderFacts;
}

describe("routeSharingAfterRender", () => {
  it.each([
    {
      name: "a 200 is stored and decorated",
      decision: routeReadThrough(),
      render: routeRender(),
      expected: {
        store: true,
        decorate: true,
        universal: false,
        clientCopy: "as-rendered",
      },
    },
    {
      name: "a 200 declaring public freshness is stored and decorated",
      decision: routeReadThrough(),
      render: routeRender({ cacheControl: "public, max-age=60" }),
      expected: {
        store: true,
        decorate: true,
        universal: false,
        clientCopy: "as-rendered",
      },
    },
    {
      name: "a privileged request's 200 is neither stored nor decorated",
      decision: routeReadThrough(false),
      render: routeRender(),
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "as-rendered",
      },
    },
    {
      name: "a 404 is neither stored nor decorated",
      decision: routeReadThrough(),
      render: routeRender({ status: 404 }),
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "as-rendered",
      },
    },
    {
      name: "a redirect is neither stored nor decorated",
      decision: routeReadThrough(),
      render: routeRender({ status: 302 }),
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "as-rendered",
      },
    },
    {
      name: "a 200 that sets a cookie is neither stored nor decorated",
      decision: routeReadThrough(),
      render: routeRender({ setsCookie: true }),
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "as-rendered",
      },
    },
    {
      name: "a 200 the handler declared private is neither stored nor decorated",
      decision: routeReadThrough(),
      render: routeRender({ cacheControl: "private" }),
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "as-rendered",
      },
    },
    {
      name: "a 200 the handler declared no-store is neither stored nor decorated",
      decision: routeReadThrough(),
      render: routeRender({ cacheControl: "public, No-Store" }),
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "as-rendered",
      },
    },
    {
      name: "a 200 private to its cookie is neither stored nor decorated",
      decision: routeReadThrough(),
      render: routeRender({ cacheControl: 'private="set-cookie"' }),
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "as-rendered",
      },
    },
    {
      name: "a write-method bypass leaves as rendered",
      decision: { kind: "bypass", reason: "method" },
      render: routeRender(),
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "as-rendered",
      },
    },
    {
      name: "a private bypass leaves private",
      decision: { kind: "bypass", reason: "private" },
      render: routeRender(),
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "private",
      },
    },
    {
      name: "a hit leaves as rendered",
      decision: routeReadThrough(),
      render: undefined,
      expected: {
        store: false,
        decorate: false,
        universal: false,
        clientCopy: "as-rendered",
      },
    },
  ] satisfies {
    name: string;
    decision: RouteSharingDecision;
    render: RouteRenderFacts | undefined;
    expected: unknown;
  }[])("$name", ({ decision, render, expected }) => {
    expect(routeSharingAfterRender(decision, render)).toEqual(expected);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Segment } from "../access/contract/access.js";
import type {
  CdnBypassReason,
  PageKind,
  RequestFacts,
  SharingDecision,
} from "./sharing-verdict.js";
import { sharingAfterRender, sharingBeforeRender } from "./sharing-verdict.js";

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
    accessSegment: null,
    page: { kind: "content", intent: "entry" },
    canKeySegments: true,
    ...overrides,
  };
}

/** The decision as plain data: the segment and the bypass reason or key URL. */
function outcome(decision: SharingDecision) {
  return decision.kind === "bypass"
    ? { segment: decision.segment, bypass: decision.reason }
    : { segment: decision.segment, key: decision.key.url };
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
      name: "an unpolicied page to a privileged request is private",
      facts: facts({ privileged: true }),
      expected: { segment: "private", bypass: "private" },
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
        privileged: true,
        page: {
          kind: "content",
          intent: "archiveType",
          registeredCacheable: true,
        },
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
});

const ENTRY: PageKind = { kind: "content", intent: "entry" };

function readThrough(segment: Segment): SharingDecision {
  return {
    kind: "read-through",
    segment,
    page: ENTRY,
    key: new Request("https://site.test/post"),
  };
}

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
      render: { status: 200, personal: false },
      expected: { store: true, decorate: true, clientCopy: "page" },
    },
    {
      name: "an anonymous 404 is neither stored nor decorated",
      decision: readThrough("anonymous"),
      render: { status: 404, personal: false },
      expected: { store: false, decorate: false, clientCopy: "page" },
    },
    {
      name: "an anonymous redirect is neither stored nor decorated",
      decision: readThrough("anonymous"),
      render: { status: 301, personal: false },
      expected: { store: false, decorate: false, clientCopy: "page" },
    },
    {
      name: "an anonymous 500 is neither stored nor decorated",
      decision: readThrough("anonymous"),
      render: { status: 500, personal: false },
      expected: { store: false, decorate: false, clientCopy: "page" },
    },
    {
      name: "a personal anonymous 200 is neither stored nor decorated",
      decision: readThrough("anonymous"),
      render: { status: 200, personal: true },
      expected: { store: false, decorate: false, clientCopy: "page" },
    },
    {
      name: "a shared segment's 200 is stored but leaves private",
      decision: readThrough("authenticated"),
      render: { status: 200, personal: false },
      expected: { store: true, decorate: false, clientCopy: "private" },
    },
    {
      name: "a shared segment's personal 200 is not stored and leaves private",
      decision: readThrough("authenticated"),
      render: { status: 200, personal: true },
      expected: { store: false, decorate: false, clientCopy: "private" },
    },
    {
      name: "a shared segment's 404 is not stored and leaves private",
      decision: readThrough("capability:briefing:read"),
      render: { status: 404, personal: false },
      expected: { store: false, decorate: false, clientCopy: "private" },
    },
    {
      name: "a private bypass leaves private",
      decision: bypass("private", "private"),
      render: { status: 200, personal: false },
      expected: { store: false, decorate: false, clientCopy: "private" },
    },
    {
      name: "an anonymous bypass is not stored and leaves as a page",
      decision: bypass("anonymous", "intent"),
      render: { status: 200, personal: false },
      expected: { store: false, decorate: false, clientCopy: "page" },
    },
    {
      name: "a shared segment the CDN cannot key leaves private",
      decision: bypass("authenticated", "segment-unsupported"),
      render: { status: 200, personal: false },
      expected: { store: false, decorate: false, clientCopy: "private" },
    },
    {
      name: "a policied plugin route's anonymous response leaves as rendered",
      decision: bypass("anonymous", "intent", { kind: "policied-route" }),
      render: { status: 200, personal: false },
      expected: { store: false, decorate: false, clientCopy: "as-rendered" },
    },
    {
      name: "a policied plugin route's private response leaves private",
      decision: bypass("private", "private", { kind: "policied-route" }),
      render: { status: 200, personal: false },
      expected: { store: false, decorate: false, clientCopy: "private" },
    },
    {
      name: "an anonymous hit leaves as a page",
      decision: readThrough("anonymous"),
      render: undefined,
      expected: { store: false, decorate: false, clientCopy: "page" },
    },
    {
      name: "a shared segment's hit leaves private",
      decision: readThrough("authenticated"),
      render: undefined,
      expected: { store: false, decorate: false, clientCopy: "private" },
    },
  ])("$name", ({ decision, render, expected }) => {
    expect(sharingAfterRender(decision, render)).toEqual(expected);
  });
});

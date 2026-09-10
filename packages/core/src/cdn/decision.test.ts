import { describe, expect, it } from "vitest";

import {
  cdnBypassReason,
  requestCarriesEphemeralGrant,
  requestIsPrivileged,
  responseAllowsSharedStorage,
  responseIsShareable,
  routeCdnKey,
  SEGMENT_KEY_PARAM,
  segmentCdnKey,
} from "./decision.js";

// Every case below is about an axis other than the provider's segment
// capability, so they run against one that can key by segment; the cases that
// exercise absence pass `canKeySegments: false` themselves.
type BypassArgs = Parameters<typeof cdnBypassReason>[0];
const bypassReason = (
  req: Omit<BypassArgs, "canKeySegments"> &
    Partial<Pick<BypassArgs, "canKeySegments">>,
): ReturnType<typeof cdnBypassReason> =>
  cdnBypassReason({ canKeySegments: true, ...req });

describe("cdnBypassReason", () => {
  it("caches an anonymous GET to a public entry permalink", () => {
    expect(
      bypassReason({
        method: "GET",
        segment: "anonymous",
        intentKind: "single",
      }),
    ).toBe(null);
  });

  it("caches anonymous GETs to archive, taxonomy, and front-page intents", () => {
    for (const intentKind of ["archive", "taxonomy", "front-page"] as const) {
      expect(
        bypassReason({ method: "GET", segment: "anonymous", intentKind }),
      ).toBe(null);
    }
  });

  it("caches a non-anonymous shared segment (keyed separately)", () => {
    for (const segment of [
      "authenticated",
      "role:editor",
      "members",
    ] as const) {
      expect(
        bypassReason({ method: "GET", segment, intentKind: "single" }),
      ).toBe(null);
    }
  });

  it("bypasses a private segment", () => {
    expect(
      bypassReason({
        method: "GET",
        segment: "private",
        intentKind: "single",
      }),
    ).toBe("private");
  });

  it("bypasses search pages", () => {
    expect(
      bypassReason({
        method: "GET",
        segment: "anonymous",
        intentKind: "search",
      }),
    ).toBe("intent");
  });

  it("bypasses a custom archive that has not opted into caching", () => {
    expect(
      bypassReason({
        method: "GET",
        segment: "anonymous",
        intentKind: "custom",
      }),
    ).toBe("intent");
    expect(
      bypassReason({
        method: "GET",
        segment: "anonymous",
        intentKind: "custom",
        customArchiveCacheable: false,
      }),
    ).toBe("intent");
  });

  it("caches a custom archive that opted in via cacheable: true", () => {
    expect(
      bypassReason({
        method: "GET",
        segment: "anonymous",
        intentKind: "custom",
        customArchiveCacheable: true,
      }),
    ).toBe(null);
  });

  it("still bypasses an opted-in custom archive for a private segment", () => {
    expect(
      bypassReason({
        method: "GET",
        segment: "private",
        intentKind: "custom",
        customArchiveCacheable: true,
      }),
    ).toBe("private");
  });

  it("still bypasses an opted-in custom archive on a non-GET/HEAD method", () => {
    expect(
      bypassReason({
        method: "POST",
        segment: "anonymous",
        intentKind: "custom",
        customArchiveCacheable: true,
      }),
    ).toBe("method");
  });

  it("bypasses a non-anonymous segment on a provider that cannot key by segment", () => {
    for (const segment of ["authenticated", "role:editor", "members"]) {
      expect(
        bypassReason({
          method: "GET",
          segment,
          intentKind: "single",
          canKeySegments: false,
        }),
      ).toBe("segment-unsupported");
    }
  });

  it("still caches the anonymous segment on a provider that cannot key by segment", () => {
    expect(
      bypassReason({
        method: "GET",
        segment: "anonymous",
        intentKind: "single",
        canKeySegments: false,
      }),
    ).toBe(null);
  });

  it("reports a private segment as private, not as unsupported", () => {
    expect(
      bypassReason({
        method: "GET",
        segment: "private",
        intentKind: "single",
        canKeySegments: false,
      }),
    ).toBe("private");
  });

  it("bypasses non-GET/HEAD methods", () => {
    expect(
      bypassReason({
        method: "POST",
        segment: "anonymous",
        intentKind: "single",
      }),
    ).toBe("method");
  });
});

describe("segmentCdnKey", () => {
  const at = (req: Request) => new URL(req.url);

  it("keys the anonymous segment under the plain URL", () => {
    const key = segmentCdnKey(
      new Request("https://site.test/post"),
      "anonymous",
    );
    expect(at(key).searchParams.has(SEGMENT_KEY_PARAM)).toBe(false);
    expect(key.url).toBe("https://site.test/post");
  });

  it("folds a non-anonymous segment into the key URL", () => {
    const key = segmentCdnKey(
      new Request("https://site.test/post"),
      "authenticated",
    );
    expect(at(key).searchParams.get(SEGMENT_KEY_PARAM)).toBe("authenticated");
  });

  it("gives distinct segments distinct keys, and same-segment requests one key", () => {
    const a = segmentCdnKey(
      new Request("https://site.test/x"),
      "authenticated",
    );
    const b = segmentCdnKey(new Request("https://site.test/x"), "role:editor");
    const c = segmentCdnKey(
      new Request("https://site.test/x"),
      "authenticated",
    );
    expect(a.url).not.toBe(b.url);
    expect(a.url).toBe(c.url);
  });

  it("strips the session cookie so same-segment cookies collapse to one key", () => {
    const key = segmentCdnKey(
      new Request("https://site.test/post", {
        headers: { cookie: "plumix_session=abc" },
      }),
      "authenticated",
    );
    expect(key.headers.has("cookie")).toBe(false);
  });

  it("drops a client-supplied marker before applying the server segment", () => {
    // An anonymous request crafted to carry the authenticated marker must not
    // land on (or poison) the authenticated variant's entry.
    const anon = segmentCdnKey(
      new Request(`https://site.test/post?${SEGMENT_KEY_PARAM}=authenticated`),
      "anonymous",
    );
    expect(at(anon).searchParams.has(SEGMENT_KEY_PARAM)).toBe(false);

    const authed = segmentCdnKey(
      new Request(`https://site.test/post?${SEGMENT_KEY_PARAM}=spoofed`),
      "authenticated",
    );
    expect(at(authed).searchParams.get(SEGMENT_KEY_PARAM)).toBe(
      "authenticated",
    );
  });
});

describe("requestIsPrivileged", () => {
  it("treats a plain anonymous GET as not privileged", () => {
    expect(
      requestIsPrivileged(new Request("https://site.test/post"), false),
    ).toBe(false);
  });

  it("treats a request the authenticator calls signed in as privileged", () => {
    expect(
      requestIsPrivileged(new Request("https://site.test/post"), true),
    ).toBe(true);
  });

  it("treats a session cookie the authenticator disowns as not privileged", () => {
    expect(
      requestIsPrivileged(
        new Request("https://site.test/post", {
          headers: { cookie: "plumix_session=abc" },
        }),
        false,
      ),
    ).toBe(false);
  });

  it("treats a request with an Authorization header as privileged", () => {
    expect(
      requestIsPrivileged(
        new Request("https://site.test/post", {
          headers: { authorization: "Bearer pl_pat_x" },
        }),
        false,
      ),
    ).toBe(true);
  });

  it("treats a ?preview= draft-grant request as privileged", () => {
    expect(
      requestIsPrivileged(
        new Request("https://site.test/post?preview=tok"),
        false,
      ),
    ).toBe(true);
  });
});

describe("requestCarriesEphemeralGrant", () => {
  it("flags a ?preview= draft link and a ?plumix.edit editor session", () => {
    expect(
      requestCarriesEphemeralGrant(
        new Request("https://site.test/post?preview=tok"),
      ),
    ).toBe(true);
    expect(
      requestCarriesEphemeralGrant(
        new Request("https://site.test/post?plumix.edit"),
      ),
    ).toBe(true);
  });

  it("does not flag a plain request or a bare session cookie", () => {
    // A durable audience membership (the session cookie) is NOT ephemeral — a
    // policied route caches it under its segment; only per-request grants opt out.
    expect(
      requestCarriesEphemeralGrant(new Request("https://site.test/post")),
    ).toBe(false);
    expect(
      requestCarriesEphemeralGrant(
        new Request("https://site.test/post", {
          headers: { cookie: "plumix_session=abc" },
        }),
      ),
    ).toBe(false);
  });
});

describe("responseIsShareable", () => {
  it("shares a 200", () => {
    expect(responseIsShareable(200)).toBe(true);
  });

  it("does not share a redirect or an error", () => {
    expect(responseIsShareable(301)).toBe(false);
    expect(responseIsShareable(404)).toBe(false);
    expect(responseIsShareable(500)).toBe(false);
  });
});

describe("routeCdnKey", () => {
  it("keys off the whole URL with the visitor's cookie dropped", () => {
    const key = routeCdnKey(
      new Request("https://site.test/_plumix/og/card/abc.png?w=1200", {
        headers: { cookie: "plumix_session=alice" },
      }),
    );

    expect(key.url).toBe("https://site.test/_plumix/og/card/abc.png?w=1200");
    expect(key.headers.has("cookie")).toBe(false);
  });
});

describe("responseAllowsSharedStorage", () => {
  const withCacheControl = (value: string) =>
    new Response("body", { headers: { "cache-control": value } });

  it("allows a response that declared nothing", () => {
    expect(responseAllowsSharedStorage(new Response("body"))).toBe(true);
  });

  it("allows freshness a shared cache can act on", () => {
    expect(
      responseAllowsSharedStorage(
        withCacheControl("public, max-age=31536000, immutable"),
      ),
    ).toBe(true);
  });

  it("refuses private and no-store", () => {
    expect(responseAllowsSharedStorage(withCacheControl("private"))).toBe(
      false,
    );
    expect(
      responseAllowsSharedStorage(withCacheControl("no-store, max-age=0")),
    ).toBe(false);
  });

  it("refuses a no-share directive that names the fields it covers", () => {
    // `private="set-cookie"` is still `private` — the argument names which
    // headers it covers, so a whole-token comparison would miss it.
    expect(
      responseAllowsSharedStorage(
        withCacheControl('private="set-cookie", max-age=60'),
      ),
    ).toBe(false);
  });
});

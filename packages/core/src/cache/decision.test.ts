import { describe, expect, it } from "vitest";

import {
  cacheBypassReason,
  requestIsPrivileged,
  responseIsStorable,
  SEGMENT_KEY_PARAM,
  segmentCacheKey,
} from "./decision.js";

describe("cacheBypassReason", () => {
  it("caches an anonymous GET to a public entry permalink", () => {
    expect(
      cacheBypassReason({
        method: "GET",
        segment: "anonymous",
        intentKind: "single",
      }),
    ).toBe(null);
  });

  it("caches anonymous GETs to archive, taxonomy, and front-page intents", () => {
    for (const intentKind of ["archive", "taxonomy", "front-page"] as const) {
      expect(
        cacheBypassReason({ method: "GET", segment: "anonymous", intentKind }),
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
        cacheBypassReason({ method: "GET", segment, intentKind: "single" }),
      ).toBe(null);
    }
  });

  it("bypasses a private segment", () => {
    expect(
      cacheBypassReason({
        method: "GET",
        segment: "private",
        intentKind: "single",
      }),
    ).toBe("private");
  });

  it("bypasses search pages", () => {
    expect(
      cacheBypassReason({
        method: "GET",
        segment: "anonymous",
        intentKind: "search",
      }),
    ).toBe("intent");
  });

  it("bypasses a custom archive that has not opted into caching", () => {
    expect(
      cacheBypassReason({
        method: "GET",
        segment: "anonymous",
        intentKind: "custom",
      }),
    ).toBe("intent");
    expect(
      cacheBypassReason({
        method: "GET",
        segment: "anonymous",
        intentKind: "custom",
        customArchiveCacheable: false,
      }),
    ).toBe("intent");
  });

  it("caches a custom archive that opted in via cacheable: true", () => {
    expect(
      cacheBypassReason({
        method: "GET",
        segment: "anonymous",
        intentKind: "custom",
        customArchiveCacheable: true,
      }),
    ).toBe(null);
  });

  it("still bypasses an opted-in custom archive for a private segment", () => {
    expect(
      cacheBypassReason({
        method: "GET",
        segment: "private",
        intentKind: "custom",
        customArchiveCacheable: true,
      }),
    ).toBe("private");
  });

  it("still bypasses an opted-in custom archive on a non-GET/HEAD method", () => {
    expect(
      cacheBypassReason({
        method: "POST",
        segment: "anonymous",
        intentKind: "custom",
        customArchiveCacheable: true,
      }),
    ).toBe("method");
  });

  it("bypasses non-GET/HEAD methods", () => {
    expect(
      cacheBypassReason({
        method: "POST",
        segment: "anonymous",
        intentKind: "single",
      }),
    ).toBe("method");
  });
});

describe("segmentCacheKey", () => {
  const at = (req: Request) => new URL(req.url);

  it("keys the anonymous segment under the plain URL", () => {
    const key = segmentCacheKey(
      new Request("https://site.test/post"),
      "anonymous",
    );
    expect(at(key).searchParams.has(SEGMENT_KEY_PARAM)).toBe(false);
    expect(key.url).toBe("https://site.test/post");
  });

  it("folds a non-anonymous segment into the key URL", () => {
    const key = segmentCacheKey(
      new Request("https://site.test/post"),
      "authenticated",
    );
    expect(at(key).searchParams.get(SEGMENT_KEY_PARAM)).toBe("authenticated");
  });

  it("gives distinct segments distinct keys, and same-segment requests one key", () => {
    const a = segmentCacheKey(
      new Request("https://site.test/x"),
      "authenticated",
    );
    const b = segmentCacheKey(
      new Request("https://site.test/x"),
      "role:editor",
    );
    const c = segmentCacheKey(
      new Request("https://site.test/x"),
      "authenticated",
    );
    expect(a.url).not.toBe(b.url);
    expect(a.url).toBe(c.url);
  });

  it("strips the session cookie so same-segment cookies collapse to one key", () => {
    const key = segmentCacheKey(
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
    const anon = segmentCacheKey(
      new Request(`https://site.test/post?${SEGMENT_KEY_PARAM}=authenticated`),
      "anonymous",
    );
    expect(at(anon).searchParams.has(SEGMENT_KEY_PARAM)).toBe(false);

    const authed = segmentCacheKey(
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
    expect(requestIsPrivileged(new Request("https://site.test/post"))).toBe(
      false,
    );
  });

  it("treats a session-cookie request as privileged", () => {
    expect(
      requestIsPrivileged(
        new Request("https://site.test/post", {
          headers: { cookie: "plumix_session=abc" },
        }),
      ),
    ).toBe(true);
  });

  it("treats a request with an Authorization header as privileged", () => {
    expect(
      requestIsPrivileged(
        new Request("https://site.test/post", {
          headers: { authorization: "Bearer pl_pat_x" },
        }),
      ),
    ).toBe(true);
  });

  it("treats a ?preview= draft-grant request as privileged", () => {
    expect(
      requestIsPrivileged(new Request("https://site.test/post?preview=tok")),
    ).toBe(true);
  });
});

describe("responseIsStorable", () => {
  it("stores a 200 GET response", () => {
    expect(responseIsStorable("GET", 200)).toBe(true);
  });

  it("does not store non-200 responses", () => {
    expect(responseIsStorable("GET", 404)).toBe(false);
    expect(responseIsStorable("GET", 500)).toBe(false);
    expect(responseIsStorable("GET", 301)).toBe(false);
  });

  it("does not store HEAD responses (the Cache API only persists GET)", () => {
    expect(responseIsStorable("HEAD", 200)).toBe(false);
  });
});

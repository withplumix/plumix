import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BUILD_KEY_PARAM,
  requestCarriesEphemeralGrant,
  requestIsPrivileged,
  responseAllowsSharedStorage,
  routeCdnKey,
  SEGMENT_KEY_PARAM,
  segmentCdnKey,
} from "./decision.js";

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
    const b = segmentCdnKey(
      new Request("https://site.test/x"),
      "capability:user:list",
    );
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
    // policied route caches it under its segment; only per-request grants opt
    // out.
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

describe("the build axis of a CDN key", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const keyFunctions = [
    {
      name: "segmentCdnKey, anonymous",
      key: (request: Request) => segmentCdnKey(request, "anonymous"),
    },
    {
      name: "segmentCdnKey, authenticated",
      key: (request: Request) => segmentCdnKey(request, "authenticated"),
    },
    { name: "routeCdnKey", key: routeCdnKey },
  ];

  it.each(keyFunctions)(
    "$name folds the build that renders the page into the key",
    ({ key }) => {
      vi.stubEnv("PLUMIX_BUILD_ID", "a");

      const keyed = key(new Request("https://site.test/post"));

      expect(new URL(keyed.url).searchParams.get(BUILD_KEY_PARAM)).toBe("a");
    },
  );

  it.each(keyFunctions)(
    "$name replaces a client-sent build so a crafted query can't reach another build's entry",
    ({ key }) => {
      vi.stubEnv("PLUMIX_BUILD_ID", "a");

      const keyed = key(new Request("https://site.test/post?__plumix_build=b"));

      expect(new URL(keyed.url).searchParams.getAll(BUILD_KEY_PARAM)).toEqual([
        "a",
      ]);
    },
  );

  it.each(keyFunctions)(
    "$name drops a client-sent build when no build id is defined",
    ({ key }) => {
      vi.stubEnv("PLUMIX_BUILD_ID", "");

      const keyed = key(new Request("https://site.test/post?__plumix_build=b"));

      expect(new URL(keyed.url).searchParams.has(BUILD_KEY_PARAM)).toBe(false);
    },
  );
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

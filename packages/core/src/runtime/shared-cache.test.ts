import { describe, expect, test } from "vitest";

import type { RequestAuthenticator } from "../context/authenticator.js";
import { defaultAuthenticator } from "../auth/authenticator.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { mayServeFromSharedCache } from "./shared-cache.js";

/** Signed in through a header, as a reverse-proxy SSO login carries it. */
const headerSession: RequestAuthenticator = {
  authenticate: () => Promise.resolve(null),
  hasSession: (request) => request.headers.has("x-sso-user"),
};

function site(
  options: {
    readonly basePath?: string;
    readonly authenticator?: RequestAuthenticator;
  } = {},
) {
  return {
    authenticator: options.authenticator ?? defaultAuthenticator(),
    config: { basePath: options.basePath ?? "" },
  };
}

function get(path: string, init: RequestInit = {}): Request {
  return new Request(`https://site.example${path}`, init);
}

describe("mayServeFromSharedCache", () => {
  test("serves a plain anonymous GET from the shared cache", () => {
    expect(mayServeFromSharedCache(site(), get("/recipes/soup"))).toBe(true);
  });

  test("serves an anonymous HEAD from the shared cache", () => {
    expect(
      mayServeFromSharedCache(site(), get("/recipes/soup", { method: "HEAD" })),
    ).toBe(true);
  });

  test("keeps a cookie that is not a session's off the decision", () => {
    const request = get("/", { headers: { cookie: "_ga=GA1.1.1" } });

    expect(mayServeFromSharedCache(site(), request)).toBe(true);
  });

  test("runs a POST live", () => {
    expect(
      mayServeFromSharedCache(site(), get("/recipes/soup", { method: "POST" })),
    ).toBe(false);
  });

  test("runs a request carrying a session cookie live", () => {
    const request = get("/", {
      headers: { cookie: `_ga=1; ${SESSION_COOKIE_NAME}=token` },
    });

    expect(mayServeFromSharedCache(site(), request)).toBe(false);
  });

  test("asks the site's authenticator, so a header session runs live", () => {
    const request = get("/", { headers: { "x-sso-user": "ada" } });

    expect(
      mayServeFromSharedCache(site({ authenticator: headerSession }), request),
    ).toBe(false);
  });

  test("serves a visitor the site's authenticator finds no session on", () => {
    expect(
      mayServeFromSharedCache(site({ authenticator: headerSession }), get("/")),
    ).toBe(true);
  });

  test("runs a request carrying an Authorization header live", () => {
    const request = get("/", { headers: { authorization: "Bearer pat" } });

    expect(mayServeFromSharedCache(site(), request)).toBe(false);
  });

  test.each(["/?preview=token", "/?plumix.edit", "/soup?a=1&plumix.edit=1"])(
    "runs %s live, since it carries a per-request grant",
    (path) => {
      expect(mayServeFromSharedCache(site(), get(path))).toBe(false);
    },
  );

  test.each(["/_plumix/admin/", "/_plumix/rpc/entry/list", "/_plumix"])(
    "runs %s live, since core answers it",
    (path) => {
      expect(mayServeFromSharedCache(site(), get(path))).toBe(false);
    },
  );

  test("serves a page whose path only starts like core's prefix", () => {
    expect(mayServeFromSharedCache(site(), get("/_plumixed"))).toBe(true);
  });

  describe("under a base path", () => {
    const docs = site({ basePath: "/docs" });

    test.each(["/docs/_plumix/auth/callback", "/docs/_plumix"])(
      "runs %s live",
      (path) => {
        expect(mayServeFromSharedCache(docs, get(path))).toBe(false);
      },
    );

    test("serves a page under the base from the shared cache", () => {
      expect(mayServeFromSharedCache(docs, get("/docs/intro"))).toBe(true);
    });
  });
});

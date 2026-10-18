import { describe, expect, test } from "vitest";

import { defineAuthMethod } from "../plugin/auth-method.js";
import {
  declareAuthMethods,
  matchAuthMethodRoute,
} from "./declared-methods.js";

const methods = declareAuthMethods({
  core: [
    defineAuthMethod({
      name: "acme",
      label: "Acme",
      routes: {
        start: { method: "POST", handler: () => new Response(null) },
      },
    }),
  ],
  plugins: [],
});

describe("matchAuthMethodRoute", () => {
  test("matches a declared route under /_plumix/auth/", () => {
    const match = matchAuthMethodRoute(
      methods,
      "/_plumix/auth/acme/start",
      "POST",
    );

    expect(match).toMatchObject({ kind: "route", route: { method: "POST" } });
  });

  test("matches nothing outside /_plumix/auth/, even at the prefix's length", () => {
    // `/site/archive/` is as long as `/_plumix/auth/`, so only the prefix
    // check keeps `acme/start` from being read off its tail.
    const match = matchAuthMethodRoute(
      methods,
      "/site/archive/acme/start",
      "POST",
    );

    expect(match).toBeNull();
  });

  test("matches nothing for a declared route with an extra segment", () => {
    const match = matchAuthMethodRoute(
      methods,
      "/_plumix/auth/acme/start/extra",
      "POST",
    );

    expect(match).toBeNull();
  });
});

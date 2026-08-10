import { describe, expect, test } from "vitest";

import {
  assembleRedirects,
  compileRedirects,
  matchRedirect,
} from "./redirects.js";

const at = (pathname: string) => new URL(pathname, "https://example.test");

describe("matchRedirect", () => {
  test("an exact `from` path redirects to `to` with the given status", () => {
    const compiled = compileRedirects([
      { from: "/old/guide", to: "/guides/start", status: 308 },
    ]);
    expect(matchRedirect(at("/old/guide"), compiled)).toEqual({
      kind: "redirect",
      location: "/guides/start",
      status: 308,
    });
  });

  test("a path that matches no rule resolves to null", () => {
    const compiled = compileRedirects([
      { from: "/old/guide", to: "/guides/start", status: 308 },
    ]);
    expect(matchRedirect(at("/something-else"), compiled)).toBeNull();
  });

  test("named `:param` captures interpolate into `to`, defaulting to 301", () => {
    const compiled = compileRedirects([
      { from: "/team/:slug", to: "/about/:slug" },
    ]);
    expect(matchRedirect(at("/team/ada"), compiled)).toEqual({
      kind: "redirect",
      location: "/about/ada",
      status: 301,
    });
  });

  test("a wildcard `from` with `gone` resolves to 410", () => {
    const compiled = compileRedirects([{ from: "/legacy/*", gone: true }]);
    expect(matchRedirect(at("/legacy/deep/path"), compiled)).toEqual({
      kind: "gone",
    });
  });

  test("a RegExp `from` interpolates $1 backreferences into `to`", () => {
    const compiled = compileRedirects([
      { from: /^\/products\/(\d+)$/, to: "/shop/$1", status: 301 },
    ]);
    expect(matchRedirect(at("/products/123"), compiled)).toEqual({
      kind: "redirect",
      location: "/shop/123",
      status: 301,
    });
    expect(matchRedirect(at("/products/abc"), compiled)).toBeNull();
  });

  test("a RegExp `from` interpolates $<name> named backreferences", () => {
    const compiled = compileRedirects([
      { from: /^\/u\/(?<user>[^/]+)\/posts$/, to: "/authors/$<user>" },
    ]);
    expect(matchRedirect(at("/u/ada/posts"), compiled)).toEqual({
      kind: "redirect",
      location: "/authors/ada",
      status: 301,
    });
  });

  test("a RegExp `to` keeps `$$` literal even before a digit or name", () => {
    const compiled = compileRedirects([
      { from: /^\/p\/(\d+)$/, to: "/price/$$1-and-$1" },
    ]);
    // `$$1` is a literal `$1`; the trailing `$1` is the capture.
    expect(matchRedirect(at("/p/42"), compiled)).toMatchObject({
      location: "/price/$1-and-42",
    });
  });

  test("a captured value containing `$1` is not re-interpreted as a backref", () => {
    const compiled = compileRedirects([
      { from: /^\/x\/(?<a>.+)$/, to: "/y/$<a>" },
    ]);
    expect(matchRedirect(at("/x/$1"), compiled)).toMatchObject({
      location: "/y/$1",
    });
  });

  test("a dynamic `match` rule resolves from its returned target", () => {
    const compiled = compileRedirects([
      {
        match: (url) => {
          const slug = /^\/schools\/(.+)$/.exec(url.pathname)?.[1];
          if (slug === "moved") return { to: "/schools/new", status: 301 };
          if (slug === "closed") return { gone: true };
          return null;
        },
      },
    ]);
    expect(matchRedirect(at("/schools/moved"), compiled)).toEqual({
      kind: "redirect",
      location: "/schools/new",
      status: 301,
    });
    expect(matchRedirect(at("/schools/closed"), compiled)).toEqual({
      kind: "gone",
    });
    expect(matchRedirect(at("/schools/open"), compiled)).toBeNull();
  });

  test("the request query is carried onto the target by default", () => {
    const compiled = compileRedirects([{ from: "/a", to: "/b" }]);
    expect(matchRedirect(at("/a?ref=x&y=2"), compiled)).toMatchObject({
      location: "/b?ref=x&y=2",
    });
  });

  test("`preserveQuery: false` redirects to exactly `to`", () => {
    const compiled = compileRedirects([
      { from: "/a", to: "/b", preserveQuery: false },
    ]);
    expect(matchRedirect(at("/a?ref=x"), compiled)).toMatchObject({
      location: "/b",
    });
  });

  test("a target with its own query is not double-appended", () => {
    const compiled = compileRedirects([{ from: "/a", to: "/b?keep=1" }]);
    expect(matchRedirect(at("/a?ref=x"), compiled)).toMatchObject({
      location: "/b?keep=1",
    });
  });

  test("the query is not appended after a target fragment", () => {
    const compiled = compileRedirects([{ from: "/a", to: "/b#top" }]);
    expect(matchRedirect(at("/a?ref=x"), compiled)).toMatchObject({
      location: "/b#top",
    });
  });

  test("a lower `priority` rule wins even when listed later", () => {
    const compiled = compileRedirects([
      { from: "/x", to: "/loses", priority: 30 },
      { from: "/x", to: "/wins", priority: 10 },
    ]);
    expect(matchRedirect(at("/x"), compiled)).toEqual({
      kind: "redirect",
      location: "/wins",
      status: 301,
    });
  });

  test("equal-priority rules resolve in list order", () => {
    const compiled = compileRedirects([
      { from: "/y", to: "/first" },
      { from: "/y", to: "/second" },
    ]);
    expect(matchRedirect(at("/y"), compiled)).toMatchObject({
      location: "/first",
    });
  });
});

describe("assembleRedirects", () => {
  test("config outranks plugin outranks theme for the same path", () => {
    const compiled = assembleRedirects({
      config: [{ from: "/dup", to: "/from-config" }],
      plugin: [{ from: "/dup", to: "/from-plugin" }],
      theme: [{ from: "/dup", to: "/from-theme" }],
    });
    expect(matchRedirect(at("/dup"), compiled)).toMatchObject({
      location: "/from-config",
    });
  });

  test("an explicit `priority` overrides the source default", () => {
    const compiled = assembleRedirects({
      config: [{ from: "/dup", to: "/from-config" }],
      theme: [{ from: "/dup", to: "/from-theme", priority: 1 }],
    });
    expect(matchRedirect(at("/dup"), compiled)).toMatchObject({
      location: "/from-theme",
    });
  });

  test("omitted sources contribute nothing", () => {
    const compiled = assembleRedirects({
      plugin: [{ from: "/only", to: "/here" }],
    });
    expect(matchRedirect(at("/only"), compiled)).toMatchObject({
      location: "/here",
    });
  });
});

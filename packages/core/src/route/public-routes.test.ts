import { describe, expect, test } from "vitest";

import type { RegisteredPublicRoute } from "../plugin/registry.js";
import { compilePublicRoutes, matchPublicRoute } from "./public-routes.js";

function route(path: string, pluginId = "feeds"): RegisteredPublicRoute {
  return { pluginId, path, handler: () => new Response("ok") };
}

describe("compilePublicRoutes", () => {
  test("rejects the same path registered by two plugins, naming both", () => {
    expect(() =>
      compilePublicRoutes([route("/feed", "feeds"), route("/feed", "seo")]),
    ).toThrow(
      /Plugin "seo" registers public route "\/feed" already registered by "feeds"/,
    );
  });

  test("rejects a path inside the platform prefix, naming core", () => {
    expect(() => compilePublicRoutes([route("/_plumix/feed")])).toThrow(
      /Plugin "feeds" registers public route "\/_plumix\/feed" inside the \/_plumix\/ prefix, which core owns/,
    );
  });
  test("rejects a pattern URLPattern cannot parse, naming the plugin", () => {
    expect(() => compilePublicRoutes([route("/feed{")])).toThrow(
      /Plugin "feeds" public route "\/feed\{" is not a valid URLPattern pathname/,
    );
  });
});

describe("matchPublicRoute", () => {
  test("returns null when nothing owns the path", () => {
    const table = compilePublicRoutes([route("/feed")]);
    expect(matchPublicRoute(table, "/about")).toBeNull();
  });

  test("matches an exact path", () => {
    const table = compilePublicRoutes([route("/robots.txt")]);
    expect(matchPublicRoute(table, "/robots.txt")?.route.path).toBe(
      "/robots.txt",
    );
  });

  test("matches a URL pattern and exposes its parameters", () => {
    const table = compilePublicRoutes([route("/sitemap-:scope-:page.xml")]);
    expect(matchPublicRoute(table, "/sitemap-post-2.xml")?.params).toEqual({
      scope: "post",
      page: "2",
    });
  });

  test("a non-ASCII literal matches the percent-encoded request path", () => {
    const table = compilePublicRoutes([route("/café")]);
    expect(matchPublicRoute(table, "/caf%C3%A9")?.route.path).toBe("/café");
  });

  test("an exact path wins over a pattern that also matches it", () => {
    const table = compilePublicRoutes([
      route("/:type/feed", "feeds"),
      route("/post/feed", "seo"),
    ]);
    expect(matchPublicRoute(table, "/post/feed")?.route.pluginId).toBe("seo");
  });

  test("patterns are tried in registration order", () => {
    const table = compilePublicRoutes([
      route("/:type/feed", "feeds"),
      route("/:anything/feed", "seo"),
    ]);
    expect(matchPublicRoute(table, "/post/feed")?.route.pluginId).toBe("feeds");
  });
});

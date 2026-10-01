import { describe, expect, test } from "vitest";

import type { RegisteredPublicRoute } from "../../plugin/registry.js";
import { compilePublicRoutes } from "../public-routes.js";
import { matchPublicRoute } from "./public-route-table.js";

function route(path: string, pluginId = "feeds"): RegisteredPublicRoute {
  return { pluginId, path, handler: () => new Response("ok") };
}

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

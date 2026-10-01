import { describe, expect, test } from "vitest";

import type { RegisteredPublicRoute } from "../plugin/registry.js";
import { createPluginRegistry } from "../plugin/registry.js";
import { compilePublicRoutes, publicRouteAt } from "./public-routes.js";

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

describe("publicRouteAt", () => {
  test("answers from the registry's routes as the dispatcher's table does", () => {
    const plugins = createPluginRegistry();
    plugins.publicRoutes.push(
      route("/:section/feed", "feeds"),
      route("/about/feed", "seo"),
    );
    expect(publicRouteAt(plugins, "/about/feed")?.route.pluginId).toBe("seo");
    expect(publicRouteAt(plugins, "/news/feed")?.route.pluginId).toBe("feeds");
    expect(publicRouteAt(plugins, "/news")).toBeNull();
  });
});

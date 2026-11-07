import { assert, describe, expect, test } from "vitest";

import type { PublicRouteOutcome } from "./index.js";
import { definePlugin } from "../plugin/define.js";
import { buildApp } from "../runtime/app.js";
import { testSite } from "../test/site.js";
import { routePublicRequest } from "./index.js";

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const feeds = definePlugin("feeds", {
  setup: (ctx) => {
    ctx.registerPublicRoute({
      path: "/feed",
      handler: () => new Response("owned", { status: 200 }),
    });
  },
});

const site = await testSite({
  plugins: [blog, feeds],
  config: {
    redirects: [
      { from: "/feed", to: "/elsewhere", status: 301 },
      { from: "/old.png", to: "/new.png" },
      { from: "/post/moved", to: "/post/kept", status: 301 },
    ],
  },
});

/** The routing the site dispatches through, built from its own config. */
const app = await buildApp(site.context.config);

function route(path: string, method = "GET"): PublicRouteOutcome {
  const { origin, config } = site.context;
  const request = new Request(`${origin}${path}`, { method });
  return routePublicRequest(
    app,
    { request, origin, config },
    new URL(request.url),
  );
}

describe("routePublicRequest — stage order", () => {
  test("a public route answers ahead of a redirect for the same path", () => {
    const outcome = route("/feed");

    assert(outcome.kind === "public-route");
    expect(outcome.route.route.path).toBe("/feed");
  });

  test("a redirect on an asset-shaped path answers ahead of the asset 404", () => {
    const outcome = route("/old.png");

    assert(outcome.kind === "response");
    expect(outcome.response.status).toBe(301);
    expect(outcome.response.headers.get("location")).toBe("/new.png");
  });

  test("an asset-shaped path with no redirect 404s before content routing", () => {
    const outcome = route("/missing.png");

    assert(outcome.kind === "response");
    expect(outcome.response.status).toBe(404);
    expect(outcome.response.headers.get("cache-control")).toBe(
      "public, max-age=300",
    );
  });

  test("a redirect answers ahead of a content route at the same path", () => {
    const outcome = route("/post/moved");

    assert(outcome.kind === "response");
    expect(outcome.response.headers.get("location")).toBe("/post/kept");
  });

  test("a non-canonical URL 301s ahead of the content route it would match", () => {
    const outcome = route("/post/hello/?ref=x");

    assert(outcome.kind === "response");
    expect(outcome.response.status).toBe(301);
    expect(outcome.response.headers.get("location")).toBe(
      "https://cms.example/post/hello?ref=x",
    );
  });

  test("a canonical content URL reaches the route map", () => {
    const outcome = route("/post/hello");

    assert(outcome.kind === "content");
    expect(outcome.match).toEqual({
      pattern: "/post/:slug",
      params: { slug: "hello" },
      intent: { kind: "entry", entryType: "post" },
      isPermalinkRoute: true,
    });
    expect(outcome.intent).toEqual({ kind: "entry", entryType: "post" });
  });

  test("a method other than GET or HEAD is refused before any stage runs", () => {
    const outcome = route("/feed", "POST");

    assert(outcome.kind === "response");
    expect(outcome.response.status).toBe(405);
    expect(outcome.response.headers.get("allow")).toBe("GET, HEAD");
  });
});

describe("routePublicRequest — unmatched content", () => {
  test("an unmatched root is the front page", () => {
    const outcome = route("/");

    assert(outcome.kind === "content");
    expect(outcome.match).toBeNull();
    expect(outcome.intent).toEqual({ kind: "frontPage" });
  });

  test("any other unmatched path has no intent", () => {
    const outcome = route("/nowhere/at-all");

    assert(outcome.kind === "content");
    expect(outcome.intent).toBeNull();
  });
});

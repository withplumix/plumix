import { describe, expect, test } from "vitest";

import type { DispatcherHarness } from "../test/dispatcher.js";
import type { PublicRouteOutcome } from "./index.js";
import { definePlugin } from "../plugin/define.js";
import { createTestContext } from "../test/context.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { routePublicRequest } from "./index.js";

const blog = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts", isPublic: true });
});

function owner(path: string) {
  return definePlugin("feeds", (ctx) => {
    ctx.registerPublicRoute({
      path,
      handler: () => new Response("owned", { status: 200 }),
    });
  });
}

function route(
  harness: DispatcherHarness,
  path: string,
  method = "GET",
): PublicRouteOutcome {
  const request = new Request(`https://cms.example${path}`, { method });
  const ctx = createTestContext({ db: harness.db, request });
  return routePublicRequest(harness.app, ctx, new URL(request.url));
}

describe("routePublicRequest — stage order", () => {
  test("a public route answers ahead of a redirect for the same path", async () => {
    const harness = await createDispatcherHarness({
      plugins: [owner("/feed")],
      redirects: [{ from: "/feed", to: "/elsewhere", status: 301 }],
    });
    const outcome = route(harness, "/feed");
    expect(outcome.kind).toBe("public-route");
    if (outcome.kind !== "public-route") return;
    expect(outcome.route.route.path).toBe("/feed");
  });

  test("a redirect on an asset-shaped path answers ahead of the asset 404", async () => {
    const harness = await createDispatcherHarness({
      redirects: [{ from: "/old.png", to: "/new.png" }],
    });
    const outcome = route(harness, "/old.png");
    expect(outcome.kind).toBe("response");
    if (outcome.kind !== "response") return;
    expect(outcome.response.status).toBe(301);
    expect(outcome.response.headers.get("location")).toBe("/new.png");
  });

  test("an asset-shaped path with no redirect 404s before content routing", async () => {
    const harness = await createDispatcherHarness();
    const outcome = route(harness, "/missing.png");
    expect(outcome.kind).toBe("response");
    if (outcome.kind !== "response") return;
    expect(outcome.response.status).toBe(404);
    expect(outcome.response.headers.get("cache-control")).toBe(
      "public, max-age=300",
    );
  });

  test("a redirect answers ahead of a content route at the same path", async () => {
    const harness = await createDispatcherHarness({
      plugins: [blog],
      redirects: [{ from: "/post/moved", to: "/post/kept", status: 301 }],
    });
    const outcome = route(harness, "/post/moved");
    expect(outcome.kind).toBe("response");
    if (outcome.kind !== "response") return;
    expect(outcome.response.headers.get("location")).toBe("/post/kept");
  });

  test("a non-canonical URL 301s ahead of the content route it would match", async () => {
    const harness = await createDispatcherHarness({ plugins: [blog] });
    const outcome = route(harness, "/post/hello/?ref=x");
    expect(outcome.kind).toBe("response");
    if (outcome.kind !== "response") return;
    expect(outcome.response.status).toBe(301);
    expect(outcome.response.headers.get("location")).toBe(
      "https://cms.example/post/hello?ref=x",
    );
  });

  test("a canonical content URL reaches the route map", async () => {
    const harness = await createDispatcherHarness({ plugins: [blog] });
    const outcome = route(harness, "/post/hello");
    expect(outcome.kind).toBe("content");
    if (outcome.kind !== "content") return;
    expect(outcome.match).toEqual({
      pattern: "/post/:slug",
      params: { slug: "hello" },
      intent: { kind: "single", entryType: "post" },
    });
    expect(outcome.intent).toEqual({ kind: "single", entryType: "post" });
  });

  test("a method other than GET or HEAD is refused before any stage runs", async () => {
    const harness = await createDispatcherHarness({
      plugins: [owner("/feed")],
    });
    const outcome = route(harness, "/feed", "POST");
    expect(outcome.kind).toBe("response");
    if (outcome.kind !== "response") return;
    expect(outcome.response.status).toBe(405);
    expect(outcome.response.headers.get("allow")).toBe("GET, HEAD");
  });
});

describe("routePublicRequest — unmatched content", () => {
  test("an unmatched root is the front page, and renders as one", async () => {
    const harness = await createDispatcherHarness();
    const request = new Request("https://cms.example/");
    const ctx = createTestContext({
      db: harness.db,
      request,
      hooks: harness.app.hooks,
      plugins: harness.app.plugins,
    });
    const outcome = routePublicRequest(harness.app, ctx, new URL(request.url));
    expect(outcome.kind).toBe("content");
    if (outcome.kind !== "content") return;
    expect(outcome.match).toBeNull();
    expect(outcome.intent).toEqual({ kind: "front-page" });

    const response = await outcome.render(ctx);
    expect(response.status).toBe(200);
    expect(ctx.resolvedRoute).toEqual({
      pattern: "/",
      params: {},
      intent: { kind: "front-page" },
    });
  });

  test("any other unmatched path has no intent and renders a 404", async () => {
    const harness = await createDispatcherHarness();
    const request = new Request("https://cms.example/nowhere/at-all");
    const ctx = createTestContext({ db: harness.db, request });
    const outcome = routePublicRequest(harness.app, ctx, new URL(request.url));
    expect(outcome.kind).toBe("content");
    if (outcome.kind !== "content") return;
    expect(outcome.intent).toBeNull();

    const response = await outcome.render(ctx);
    expect(response.status).toBe(404);
    expect(ctx.resolvedRoute).toBeNull();
  });
});

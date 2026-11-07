import { beforeEach, describe, expect, test } from "vitest";

import type { AppContext } from "../../src/context/app-context.js";
import { render } from "../../src/events-and-filters/render.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

/**
 * What a render-time consumer reads off the context: the route the request
 * matched, as the pattern it was declared with, the params it captured and
 * what the route is.
 */
const seenByRender: (AppContext["resolvedRoute"] | undefined)[] = [];
const routeObserver = definePlugin("route-observer", {
  setup: (ctx) => {
    ctx.filters.add(render.document, (manifest, _input, appCtx) => {
      seenByRender.push(appCtx.resolvedRoute);
      return manifest;
    });
  },
});

const events = definePlugin("events", {
  setup: (ctx) => {
    ctx.registerArchiveType("event-series", {
      routes: ["/events/:series"],
      resolve: () => ({
        data: { kind: "archiveType", name: "event-series" },
        title: "Series",
      }),
    });
  },
});

const shopPlugin = definePlugin("shop", {
  setup: (ctx) => {
    ctx.registerEntryType("product", {
      label: "Products",
      isPublic: true,
      hasArchive: true,
      rewrite: { slug: "shop" },
    });
  },
});

let seenByRoute: AppContext["resolvedRoute"] | undefined;
const probe = definePlugin("probe", {
  setup: (ctx) => {
    ctx.registerRoute({
      method: "GET",
      path: "/probe",
      auth: "public",
      handler: (_request, appCtx) => {
        seenByRoute = appCtx.resolvedRoute;
        return new Response("ok");
      },
    });
  },
});

const site = await testSite({
  plugins: [events, shopPlugin, probe, routeObserver],
});

beforeEach(() => {
  seenByRender.length = 0;
  seenByRoute = undefined;
});

describe("the route a public page matched", () => {
  test("a plugin archive's page carries its matched pattern, params and intent", async () => {
    const page = await site.visit("/events/summer");

    page.assertOk();
    expect(seenByRender).toEqual([
      {
        pattern: "/events/:series",
        params: { series: "summer" },
        intent: { kind: "archiveType", name: "event-series" },
      },
    ]);
  });

  test.each([
    [
      "/shop",
      {
        pattern: "/shop",
        params: {},
        intent: { kind: "entryType", entryType: "product" },
      },
    ],
    [
      "/shop/mug",
      {
        pattern: "/shop/:slug",
        params: { slug: "mug" },
        intent: { kind: "entry", entryType: "product" },
      },
    ],
    ["/", { pattern: "/", params: {}, intent: { kind: "frontPage" } }],
  ])(
    "every other kind of public page carries the route it matched: %s",
    async (path, route) => {
      await site.factory.published.create({
        type: "product",
        slug: "mug",
        title: "Mug",
      });

      const page = await site.visit(path);

      page.assertOk();
      expect(seenByRender).toEqual([route]);
    },
  );

  test("a path outside the content router has none", async () => {
    const page = await site.visit("/_plumix/probe/probe");

    page.assertOk();
    expect(seenByRoute).toBeNull();
  });
});

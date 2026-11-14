import { beforeEach, describe, expect, test } from "vitest";

import type { AccessPolicy } from "../../src/access/policy.js";
import type { AppContext } from "../../src/context/app-context.js";
import {
  authenticatedPolicy,
  capabilityPolicy,
  challenge,
  definePolicy,
  grant,
} from "../../src/access/policy.js";
import { entryPurgeTags } from "../../src/cdn/contract/tags.js";
import { tagCdnEntry } from "../../src/cdn/route-tags.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

/**
 * A plugin that owns paths at the site root, the way `@plumix/plugin-feeds`
 * owns `/feed` and `@plumix/plugin-seo` owns `/robots.txt` and the sitemap.
 */
function owner(paths: readonly string[], body = "owned", pluginId = "feeds") {
  return definePlugin(pluginId, {
    setup: (ctx) => {
      for (const path of paths) {
        ctx.registerPublicRoute({
          path,
          handler: () => new Response(body, { status: 200 }),
        });
      }
    },
  });
}

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({
  plugins: [
    blog,
    owner([
      "/feed",
      "/robots.txt",
      "/sitemap.xml",
      "/sitemap-post-1.xml",
      "/post/hello",
      "/ads.txt",
    ]),
  ],
  config: {
    redirects: [{ from: "/feed", to: "/elsewhere", status: 301 }],
  },
});

describe("public route dispatch", () => {
  test("a registered root path is served by its plugin", async () => {
    const page = await site.visit("/feed");

    page.assertOk().assertSee("owned");
  });

  test.each([
    ["robots", "/robots.txt"],
    ["the sitemap index", "/sitemap.xml"],
    ["a sub-sitemap", "/sitemap-post-1.xml"],
  ])("shadows core's own %s branch", async (_name, path) => {
    const page = await site.visit(path);

    page.assertSee("owned");
  });

  test("matches ahead of the redirect table", async () => {
    const page = await site.visit("/feed");

    page.assertOk();
  });

  test("matches ahead of a published entry at the same path", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "hello",
      title: "hello",
    });

    const page = await site.visit("/post/hello");

    page.assertSee("owned");
  });

  test("a content-plausible extension routes", async () => {
    const page = await site.visit("/ads.txt");

    page.assertOk();
  });

  test("an asset extension still 404s early", async () => {
    const page = await site.visit("/logo.png");

    page.assertNotFound().assertHeader("cache-control", "public, max-age=300");
  });

  test("only GET and HEAD reach a public route", async () => {
    const page = await site.visit("/feed", { method: "POST" });

    page.assertStatus(405);
  });
});

const patterned = await testSite({
  plugins: [
    definePlugin("seo", {
      setup: (ctx) => {
        ctx.registerPublicRoute({
          path: "/sitemap-:scope-:page.xml",
          handler: (_request, _ctx, params) =>
            new Response(`${params.scope}/${params.page}`, { status: 200 }),
        });
      },
    }),
  ],
});

describe("a public route with a URL pattern", () => {
  test("matches and hands its parameters to the handler", async () => {
    const page = await patterned.visit("/sitemap-post-2.xml");

    page.assertSee("post/2");
  });
});

const lateSite = await testSite({
  plugins: [
    definePlugin("feeds", {
      setup: () => undefined,
      // By `afterSetup` every entry type and taxonomy is known, so a plugin can
      // claim concrete paths instead of matching per request.
      afterSetup: (ctx) => {
        ctx.registerPublicRoute({
          path: "/feed",
          handler: () => new Response("owned", { status: 200 }),
        });
      },
    }),
  ],
});

describe("a public route registered from afterSetup", () => {
  test("is served", async () => {
    const page = await lateSite.visit("/feed");

    page.assertSee("owned");
  });
});

const clash = testSite({
  plugins: [owner(["/feed"]), owner(["/feed"], "shadowed", "seo")],
});
// Handled here so the boot's rejection waits for the test that awaits it.
clash.catch(() => undefined);

describe("one path claimed by two plugins", () => {
  test("throws at boot", async () => {
    await expect(clash).rejects.toThrow(
      /Plugin "seo" registers public route "\/feed" already registered by "feeds"/,
    );
  });
});

const bare = await testSite({});

describe("a site with no registered public route", () => {
  test("serves its front page as before", async () => {
    const page = await bare.visit("/");

    page.assertOk();
  });

  test("404s an unknown path as before", async () => {
    const page = await bare.visit("/nothing-here");

    page.assertNotFound();
  });
});

/**
 * What the sitemap will be: one document for every visitor, tagged with the
 * content it listed so a publish retires that scope and nothing else.
 */
const sitemap = definePlugin("seo", {
  setup: (ctx) => {
    ctx.registerPublicRoute({
      path: "/sitemap.xml",
      cacheable: true,
      handler: (_request, appCtx) => {
        tagCdnEntry(appCtx, entryPurgeTags("post", 7));
        return new Response("<urlset/>", { status: 200 });
      },
    });
  },
});

const cached = await testSite({ plugins: [sitemap, owner(["/feed"])] });

/** A response the cdn already holds for `path`, as an earlier visit left it. */
async function storeCached(path: string): Promise<void> {
  await cached.cdn.store.put(
    new Request(`https://cms.example${path}`),
    new Response("CACHED", { status: 200 }),
    [],
  );
}

describe("public route dispatch — CDN", () => {
  test("an opted-in route stores its response under the tags it declared", async () => {
    const page = await cached.visit("/sitemap.xml");

    page.assertOk().assertHeader("cache-tag", "t:post,e:7");
    cached.cdn.assertStored("/sitemap.xml");
  });

  test("a subsequent request is served from the stored entry", async () => {
    await storeCached("/sitemap.xml");

    const page = await cached.visit("/sitemap.xml");

    page.assertSee("CACHED");
  });

  test("a signed-in request does not read the stored entry", async () => {
    await storeCached("/sitemap.xml");

    const page = await cached.actingAs("member").visit("/sitemap.xml");

    page.assertSee("<urlset/>").assertDontSee("CACHED");
  });

  test("a signed-in request does not fill the stored entry", async () => {
    await cached.actingAs("member").visit("/sitemap.xml");

    cached.cdn.assertNotStored("/sitemap.xml");
  });

  test("an editor-grant request renders live and forbids downstream caches from storing it", async () => {
    await storeCached("/sitemap.xml?plumix.edit");

    const page = await cached.visit("/sitemap.xml?plumix.edit");

    page
      .assertSee("<urlset/>")
      .assertDontSee("CACHED")
      .assertHeader("cache-control", "private, no-store");
  });

  test("a route that did not opt in never reads the CDN", async () => {
    await storeCached("/feed");

    const page = await cached.visit("/feed");

    page.assertSee("owned").assertDontSee("CACHED");
  });

  test("a route that did not opt in never fills the CDN", async () => {
    await cached.visit("/feed");

    cached.cdn.assertNotStored("/feed");
  });
});

/** The paths whose handler ran in this test. */
const reached: string[] = [];
beforeEach(() => {
  reached.length = 0;
});

/**
 * A route that echoes who core let through, so a test reads the handler's
 * view of the request off the response.
 */
function policied(
  path: string,
  access: AccessPolicy,
  options: { readonly cacheable?: boolean } = {},
) {
  return {
    path,
    access,
    ...options,
    handler: (_request: Request, ctx: AppContext) => {
      reached.push(path);
      return Response.json({
        userId: ctx.user?.id ?? null,
        segment: ctx.access?.segment ?? null,
      });
    },
  };
}

const gated = await testSite({
  plugins: [
    definePlugin("feeds", {
      setup: (ctx) => {
        ctx.registerPublicRoute(policied("/members", authenticatedPolicy));
        ctx.registerPublicRoute(
          policied("/staff", capabilityPolicy("user:list")),
        );
        ctx.registerPublicRoute(
          policied("/staff-cached", capabilityPolicy("user:list"), {
            cacheable: true,
          }),
        );
        ctx.registerPublicRoute(
          policied(
            "/anyone",
            definePolicy({ resolve: () => grant("anonymous") }),
          ),
        );
        ctx.registerPublicRoute(
          policied(
            "/teaser",
            definePolicy({
              resolve: () => challenge("subscribe", { soft: true }),
            }),
          ),
        );
        ctx.registerPublicRoute({
          path: "/teaser-gone",
          access: definePolicy({
            resolve: () => challenge("subscribe", { soft: true }),
          }),
          handler: () => new Response("gone", { status: 404 }),
        });
        ctx.registerPublicRoute({
          path: "/open",
          handler: (_request, appCtx) =>
            Response.json({ userId: appCtx.user?.id ?? null }),
        });
      },
    }),
  ],
});

describe("public route dispatch — access policy", () => {
  test("an anonymous reader who fails a redirect gate is sent to sign-in", async () => {
    const page = await gated.visit("/members");

    page
      .assertStatus(302)
      .assertRedirect("/_plumix/admin/login?redirectTo=%2Fmembers")
      .assertHeader("cache-control", "private, no-store");
    expect(reached).toEqual([]);
  });

  test("a reader who fails a hard challenge gets the challenge response", async () => {
    const page = await gated.actingAs("member").visit("/staff");

    page.assertForbidden().assertHeader("x-plumix-challenge", "forbidden");
    expect(reached).toEqual([]);
  });

  test("a reader who passes the gate reaches the handler as themselves", async () => {
    const editor = await gated.factory.user.create({ role: "editor" });

    const page = await gated.actingAs(editor).visit("/staff");

    page.assertOk().assertJson({
      userId: editor.id,
      segment: "capability:user:list",
    });
  });

  test("a policied route never reads the CDN even when it opted in", async () => {
    await gated.cdn.store.put(
      new Request("https://cms.example/staff-cached"),
      new Response("CACHED", { status: 200 }),
      [],
    );

    const page = await gated.actingAs("editor").visit("/staff-cached");

    page.assertOk().assertDontSee("CACHED");
    expect(reached).toEqual(["/staff-cached"]);
  });

  test("a policied route never fills the CDN even when it opted in", async () => {
    await gated.actingAs("editor").visit("/staff-cached");

    gated.cdn.assertNotStored("/staff-cached");
  });

  test("a reader-specific response forbids downstream caches from storing it", async () => {
    const page = await gated.actingAs("editor").visit("/staff");

    page
      .assertHeader("cache-control", "private, no-store")
      .assertHeader("vary", "cookie");
  });

  test("an anonymous-segment response keeps the handler's cache headers", async () => {
    const page = await gated.visit("/anyone");

    page.assertOk().assertHeaderMissing("cache-control");
  });

  test("an anonymous grant to a signed-in reader forbids downstream caches from storing it", async () => {
    const page = await gated.actingAs("member").visit("/anyone");

    page.assertOk().assertHeader("cache-control", "private, no-store");
  });

  test("a soft challenge runs the handler and signals the challenge", async () => {
    const page = await gated.visit("/teaser");

    page.assertOk().assertHeader("x-plumix-challenge", "subscribe");
  });

  test("a soft challenge on a 404 carries no challenge signal", async () => {
    const page = await gated.visit("/teaser-gone");

    page.assertNotFound().assertHeaderMissing("x-plumix-challenge");
  });

  test("a route with no policy sees a signed-in reader as themselves", async () => {
    const admin = await gated.factory.user.create({ role: "admin" });

    const page = await gated.actingAs(admin).visit("/open");

    page
      .assertJson({ userId: admin.id })
      .assertHeader("cache-control", "private, no-store")
      .assertHeader("vary", "cookie");
  });
});

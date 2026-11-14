import type { PluginSetupContext } from "plumix/plugin";
import { definePlugin } from "plumix/plugin";
import { testSite } from "plumix/test";
import { describe, test } from "vitest";

import { seo } from "../../src/index.js";

function changeRouteFor(ctx: PluginSetupContext): void {
  ctx.registerRoute({
    method: "POST",
    path: "/change",
    auth: "public",
    handler: (request, appCtx) => {
      appCtx.cache.changed(new URL(request.url).searchParams.get("key") ?? "");
      return new Response(null, { status: 204 });
    },
  });
}

const venuesPlugin = definePlugin("venues", {
  setup: (ctx) => {
    ctx.registerSitemap("venues", {
      count: (appCtx) => {
        appCtx.cache.reads("count");
        return 1;
      },
      urls: (appCtx) => {
        appCtx.cache.reads("listed");
        return [{ loc: `${appCtx.origin}/venues/hall` }];
      },
      lastmod: (appCtx) => {
        appCtx.cache.reads("dated");
        return undefined;
      },
    });
    changeRouteFor(ctx);
  },
});

const bystanderPlugin = definePlugin("bystander", {
  setup: (ctx) => {
    changeRouteFor(ctx);
  },
});

const site = await testSite({
  plugins: [venuesPlugin, bystanderPlugin, seo()],
});

async function change(plugin: string, key: string): Promise<void> {
  (
    await site.visit(`/_plumix/${plugin}/change?key=${key}`, {
      method: "POST",
    })
  ).assertStatus(204);
}

describe("a contributed sitemap source reading its plugin's own data", () => {
  test("is no longer stored after its plugin changes what it read", async () => {
    (await site.visit("/sitemap-venues-1.xml")).assertOk();
    site.cdn.assertStored("/sitemap-venues-1.xml");

    await change("venues", "listed");

    site.cdn.assertNotStored("/sitemap-venues-1.xml");
  });

  test("stays stored after another plugin changes the same key", async () => {
    (await site.visit("/sitemap-venues-1.xml")).assertOk();

    await change("bystander", "listed");

    site.cdn.assertStored("/sitemap-venues-1.xml");
  });

  test.each(["count", "dated"])(
    "retires the index after its plugin changes the %s it read",
    async (key) => {
      (await site.visit("/sitemap.xml")).assertOk();
      site.cdn.assertStored("/sitemap.xml");

      await change("venues", key);

      site.cdn.assertNotStored("/sitemap.xml");
    },
  );
});

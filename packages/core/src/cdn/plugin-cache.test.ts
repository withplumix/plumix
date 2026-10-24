import * as v from "valibot";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app-context.js";
import type { CdnFake } from "../test/cdn-fake.js";
import type { DispatcherHarness } from "../test/dispatcher.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { entry } from "../route/render/template-builders.js";
import { base } from "../rpc/base.js";
import { defineTemplate } from "../template.js";
import { fakeCdn } from "../test/cdn-fake.js";
import { createTestContext } from "../test/context.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { createTestDb } from "../test/harness.js";
import { defineTheme } from "../theme.js";

/**
 * A plugin with a cacheable page per key that reads its data under that key
 * (or the whole namespace at `/all`), and a POST that reports a change.
 */
function keyedPlugin(id: string, listensForFired = false) {
  return definePlugin(id, (ctx) => {
    ctx.registerRoute({
      method: "GET",
      path: "/page/*",
      auth: "public",
      cacheable: true,
      handler: (request, appCtx) => {
        const key = new URL(request.url).pathname.split("/").at(-1) ?? "";
        appCtx.cache.reads(key);
        return new Response(key);
      },
    });
    ctx.registerRoute({
      method: "GET",
      path: "/all",
      auth: "public",
      cacheable: true,
      handler: (_request, appCtx) => {
        appCtx.cache.reads();
        return new Response("all");
      },
    });
    ctx.registerRoute({
      method: "POST",
      path: "/change",
      auth: "public",
      handler: (request, appCtx) => {
        const key = new URL(request.url).searchParams.get("key") ?? undefined;
        appCtx.cache.changed(key);
        return new Response(null, { status: 204 });
      },
    });
    if (listensForFired) {
      ctx.addAction("cache-probe:fired", (_value, appCtx) => {
        appCtx.cache.changed("x");
      });
    }
    ctx.registerRoute({
      method: "POST",
      path: "/fire",
      auth: "public",
      handler: async (_request, appCtx) => {
        await appCtx.hooks.doAction("cache-probe:fired", 1, appCtx);
        return new Response(null, { status: 204 });
      },
    });
    ctx.registerRoute({
      method: "GET",
      path: "/memo",
      auth: "public",
      handler: async (_request, appCtx) => {
        let loads = 0;
        const read = () =>
          appCtx.memo("alpha:x", () => Promise.resolve(++loads), ["p:alpha:x"]);
        await read();
        appCtx.cache.changed("x");
        return new Response(String(await read()));
      },
    });
  });
}

declare module "../hooks/types.js" {
  interface ActionRegistry {
    "cache-probe:fired": (value: number, ctx: AppContext) => void;
  }
}

declare module "../blocks/deps.js" {
  interface TemplateDepRegistry {
    "cache-probe": { slug: string; result: true };
  }
}

/** Reads its data under the slug from a template dep, and changes it over RPC. */
const probe = definePlugin("probe", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  ctx.registerTemplateDep("cache-probe", {
    keyedBy: "slug",
    load: ({ slugs }, appCtx) => {
      slugs.forEach((slug) => {
        appCtx.cache.reads(slug);
      });
      return Promise.resolve({});
    },
  });
  ctx.registerRoute({
    method: "POST",
    path: "/change",
    auth: "public",
    handler: (_request, appCtx) => {
      appCtx.cache.changed("x");
      return new Response(null, { status: 204 });
    },
  });
  ctx.registerRpcRouter({
    change: base
      .input(v.object({ key: v.string() }))
      .handler(({ input, context }) => {
        context.cache.changed(input.key);
        return null;
      }),
  });
});

const probeTheme = defineTheme({
  templates: [
    entry(defineTemplate({ "cache-probe": ["x"], render: () => "post" })),
  ],
});

interface Site {
  readonly h: DispatcherHarness;
  readonly cdn: CdnFake;
}

async function site(): Promise<Site> {
  const cdn = fakeCdn();
  const h = await createDispatcherHarness({
    cdn,
    config: {
      plugins: [
        keyedPlugin("alpha"),
        keyedPlugin("beta"),
        keyedPlugin("gamma", true),
      ],
    },
  });
  return { h, cdn };
}

async function probeSite() {
  const cdn = fakeCdn();
  const h = await createDispatcherHarness({
    cdn,
    config: { plugins: [probe, keyedPlugin("beta")], theme: probeTheme },
  });
  const author = await h.seedUser("admin");
  await h.factory.entry.create({
    type: "post",
    slug: "hello",
    status: "published",
    authorId: author.id,
    publishedAt: new Date(),
  });
  return { h, cdn, author };
}

async function render(s: Site, path: string): Promise<void> {
  (await s.h.fetch(path)).assertStatus(200);
  await s.h.drainDeferred();
  s.cdn.assertStored(path);
}

async function change(s: Site, plugin: string, key?: string): Promise<void> {
  const query = key === undefined ? "" : `?key=${key}`;
  const response = await s.h.fetch(`/_plumix/${plugin}/change${query}`, {
    method: "POST",
  });
  response.assertStatus(204);
  await s.h.drainDeferred();
}

describe("ctx.cache", () => {
  test("a change under a key purges only the calling plugin's readers of that key", async () => {
    const s = await site();
    await render(s, "/_plumix/alpha/page/x");
    await render(s, "/_plumix/beta/page/x");

    await change(s, "alpha", "x");

    s.cdn.assertNotStored("/_plumix/alpha/page/x");
    s.cdn.assertStored("/_plumix/beta/page/x");
  });

  test("a change with no key purges every response the plugin declared under any key", async () => {
    const s = await site();
    await render(s, "/_plumix/alpha/page/x");
    await render(s, "/_plumix/alpha/page/y");
    await render(s, "/_plumix/alpha/all");
    await render(s, "/_plumix/beta/page/x");

    await change(s, "alpha");

    s.cdn.assertNotStored("/_plumix/alpha/page/x");
    s.cdn.assertNotStored("/_plumix/alpha/page/y");
    s.cdn.assertNotStored("/_plumix/alpha/all");
    s.cdn.assertStored("/_plumix/beta/page/x");
  });

  test("a change under a key purges the plugin's readers of its whole namespace and keeps other keys", async () => {
    const s = await site();
    await render(s, "/_plumix/alpha/all");
    await render(s, "/_plumix/alpha/page/y");
    await render(s, "/_plumix/beta/all");

    await change(s, "alpha", "x");

    s.cdn.assertNotStored("/_plumix/alpha/all");
    s.cdn.assertStored("/_plumix/alpha/page/y");
    s.cdn.assertStored("/_plumix/beta/all");
  });

  test("a change drops what the request memo holds under that key at once", async () => {
    const s = await site();

    const response = await s.h.fetch("/_plumix/alpha/memo");

    expect(await response.text()).toBe("2");
  });

  test("throws outside a plugin's code, where there is no namespace", async () => {
    const ctx = createTestContext({ db: await createTestDb() });

    expect(() => {
      ctx.cache.reads("x");
    }).toThrow(/outside a plugin's code/);
  });

  test("a template dep names the plugin's own namespace", async () => {
    const { h, cdn } = await probeSite();
    await render({ h, cdn }, "/post/hello");
    await render({ h, cdn }, "/_plumix/beta/page/x");

    const response = await h.fetch("/_plumix/probe/change", { method: "POST" });
    response.assertStatus(204);
    await h.drainDeferred();

    cdn.assertNotStored("/post/hello");
    cdn.assertStored("/_plumix/beta/page/x");
  });

  test("a plugin RPC procedure names the plugin's own namespace", async () => {
    const { h, cdn, author } = await probeSite();
    await render({ h, cdn }, "/post/hello");
    await render({ h, cdn }, "/_plumix/beta/page/x");

    const response = await h.fetch("/_plumix/rpc/probe/change", {
      method: "POST",
      json: { json: { key: "x" } },
      as: author,
    });
    response.assertStatus(200);
    await h.drainDeferred();

    cdn.assertNotStored("/post/hello");
    cdn.assertStored("/_plumix/beta/page/x");
  });

  test("a plugin's action handler names that plugin's namespace, not the caller's", async () => {
    const s = await site();
    await render(s, "/_plumix/alpha/page/x");
    await render(s, "/_plumix/gamma/page/x");

    (await s.h.fetch("/_plumix/alpha/fire", { method: "POST" })).assertStatus(
      204,
    );
    await s.h.drainDeferred();

    s.cdn.assertNotStored("/_plumix/gamma/page/x");
    s.cdn.assertStored("/_plumix/alpha/page/x");
  });
});

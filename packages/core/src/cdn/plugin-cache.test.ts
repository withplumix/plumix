import * as v from "valibot";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app-context.js";
import type { Term } from "../db/schema/terms.js";
import type { CdnFake } from "../test/cdn-fake.js";
import type { DispatcherHarness } from "../test/dispatcher.js";
import { pluginStore } from "../context/stores.js";
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
import { pluginReadTags } from "./contract/tags.js";

/**
 * A plugin with a cacheable page per key that reads its data under that key
 * (or the whole namespace at `/all`), and a POST that reports a change.
 */
function keyedPlugin(id: string) {
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
      handler: async (request, appCtx: AppContext) => {
        const { key } = (await request.json()) as { key?: string };
        appCtx.cache.changed(key);
        return new Response(null, { status: 204 });
      },
    });
  });
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
    config: { plugins: [keyedPlugin("alpha"), keyedPlugin("beta")] },
  });
  return { h, cdn };
}

async function render(s: Site, path: string): Promise<void> {
  (await s.h.fetch(path)).assertStatus(200);
  await s.h.drainDeferred();
  s.cdn.assertStored(path);
}

async function change(s: Site, plugin: string, key?: string): Promise<void> {
  const response = await s.h.fetch(`/_plumix/${plugin}/change`, {
    method: "POST",
    json: key === undefined ? {} : { key },
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
    const ctx = createTestContext({ db: await createTestDb() });
    let loads = 0;
    const read = () =>
      ctx.memo(
        "alpha:x",
        () => Promise.resolve(++loads),
        pluginReadTags("alpha", "x"),
      );
    await read();

    pluginStore.run("alpha", () => {
      ctx.cache.changed("x");
    });

    expect(await read()).toBe(2);
  });

  test("throws outside a plugin's code, where there is no namespace", async () => {
    const ctx = createTestContext({ db: await createTestDb() });

    expect(() => {
      ctx.cache.reads("x");
    }).toThrow(/outside a plugin's code/);
  });

  test("a template dep and a plugin RPC procedure name the plugin's own namespace", async () => {
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
    const s = { h, cdn };
    await render(s, "/post/hello");
    await render(s, "/_plumix/beta/page/x");

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

  test("a plugin's action handler names the plugin's own namespace", async () => {
    const hooks = new HookRegistry();
    const ctx = createTestContext({ db: await createTestDb(), hooks });
    hooks.addAction(
      "term:created",
      (_term, appCtx) => {
        appCtx.cache.changed("x");
      },
      { plugin: "alpha" },
    );
    let loads = 0;
    const read = () =>
      ctx.memo(
        "alpha:x",
        () => Promise.resolve(++loads),
        pluginReadTags("alpha", "x"),
      );
    await read();

    await hooks.doAction("term:created", {} as Term, ctx);

    expect(await read()).toBe(2);
  });
});

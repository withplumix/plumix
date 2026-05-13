import { describe, expect, test } from "vitest";

import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { installPlugins } from "../plugin/register.js";
import { compileRouteMap } from "./compile.js";

async function buildRegistry(plugins: ReturnType<typeof definePlugin>[]) {
  const hooks = new HookRegistry();
  const registry = createPluginRegistry();
  await installPlugins({ hooks, plugins, registry });
  return registry;
}

describe("compileRouteMap", () => {
  test("auto-generates /{taxonomy}/:term from a registered term taxonomy", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerTermTaxonomy("category", { label: "Categories" });
      }),
    ]);
    const map = compileRouteMap(registry);
    expect(map).toHaveLength(1);
    expect(map[0]?.rawPattern).toBe("/category/:term");
    expect(map[0]?.intent).toEqual({ kind: "taxonomy", taxonomy: "category" });
    expect(map[0]?.priority).toBe(50);
  });

  test("honors taxonomy rewrite.slug on the term-archive pattern", async () => {
    const registry = await buildRegistry([
      definePlugin("regions", (ctx) => {
        ctx.registerTermTaxonomy("region", {
          label: "Regions",
          rewrite: { slug: "r" },
        });
      }),
    ]);
    const map = compileRouteMap(registry);
    expect(map.map((r) => r.rawPattern)).toEqual(["/r/:term"]);
    expect(map[0]?.intent).toEqual({ kind: "taxonomy", taxonomy: "region" });
  });

  test("taxonomy isPublic defaults to true — omitting it still generates a route", async () => {
    const registry = await buildRegistry([
      definePlugin("default", (ctx) => {
        ctx.registerTermTaxonomy("topic", { label: "Topics" });
      }),
    ]);
    expect(compileRouteMap(registry).map((r) => r.rawPattern)).toEqual([
      "/topic/:term",
    ]);
  });

  test("skips taxonomies with isPublic:false", async () => {
    const registry = await buildRegistry([
      definePlugin("internal", (ctx) => {
        ctx.registerTermTaxonomy("workflow_state", {
          label: "Workflow",
          isPublic: false,
        });
      }),
    ]);
    expect(compileRouteMap(registry)).toHaveLength(0);
  });

  test("taxonomy rule beats colliding entry-type single on slug match (WP-faithful)", async () => {
    const registry = await buildRegistry([
      definePlugin("shop", (ctx) => {
        ctx.registerEntryType("category-page", {
          label: "Category Pages",
          isPublic: true,
          rewrite: { slug: "category" },
        });
        ctx.registerTermTaxonomy("category", { label: "Categories" });
      }),
    ]);
    const map = compileRouteMap(registry);
    const patterns = map.map((r) => r.rawPattern);
    const termIdx = patterns.indexOf("/category/:term");
    const singleIdx = patterns.indexOf("/category/:slug");
    expect(termIdx).toBeGreaterThanOrEqual(0);
    expect(singleIdx).toBeGreaterThanOrEqual(0);
    expect(termIdx).toBeLessThan(singleIdx);
  });

  test("auto-generates /{type}/:slug from a registered post type", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      }),
    ]);
    const map = compileRouteMap(registry);
    expect(map).toHaveLength(1);
    expect(map[0]?.rawPattern).toBe("/post/:slug");
    expect(map[0]?.intent).toEqual({ kind: "single", entryType: "post" });
    expect(map[0]?.priority).toBe(50);
  });

  test("honors rewrite.slug for both single and archive patterns", async () => {
    const registry = await buildRegistry([
      definePlugin("shop", (ctx) => {
        ctx.registerEntryType("product", {
          label: "Products",
          isPublic: true,
          hasArchive: true,
          rewrite: { slug: "shop" },
        });
      }),
    ]);
    const map = compileRouteMap(registry);
    const patterns = map.map((r) => r.rawPattern);
    expect(patterns).toEqual(["/shop", "/shop/:slug"]);
    expect(map[0]?.intent).toEqual({ kind: "archive", entryType: "product" });
    expect(map[1]?.intent).toEqual({ kind: "single", entryType: "product" });
  });

  test("hasArchive: string overrides the auto archive slug", async () => {
    const registry = await buildRegistry([
      definePlugin("catalog", (ctx) => {
        ctx.registerEntryType("product", {
          label: "Products",
          isPublic: true,
          hasArchive: "store",
          rewrite: { slug: "p" },
        });
      }),
    ]);
    const map = compileRouteMap(registry);
    expect(map.map((r) => r.rawPattern)).toEqual(["/store", "/p/:slug"]);
  });

  test("skips private post types entirely", async () => {
    const registry = await buildRegistry([
      definePlugin("internal", (ctx) => {
        ctx.registerEntryType("nav_menu_item", {
          label: "Menu items",
          isPublic: false,
        });
      }),
    ]);
    expect(compileRouteMap(registry)).toHaveLength(0);
  });

  test("registerRewriteRule lands ahead of auto rules via default priority", async () => {
    const registry = await buildRegistry([
      definePlugin("docs", (ctx) => {
        ctx.registerEntryType("doc", {
          label: "Docs",
          isPublic: true,
          rewrite: { slug: "docs" },
        });
        ctx.registerRewriteRule("/docs/:category/:slug", {
          kind: "single",
          entryType: "doc",
        });
      }),
    ]);
    const map = compileRouteMap(registry);
    expect(map[0]?.rawPattern).toBe("/docs/:category/:slug");
    expect(map[0]?.priority).toBe(10);
    expect(map[1]?.rawPattern).toBe("/docs/:slug");
  });

  test("duplicate explicit pattern within one plugin throws at compile", async () => {
    const registry = await buildRegistry([
      definePlugin("a", (ctx) => {
        ctx.registerRewriteRule("/cart", { kind: "single", entryType: "x" });
        ctx.registerRewriteRule("/cart", { kind: "single", entryType: "x" });
      }),
    ]);
    expect(() => compileRouteMap(registry)).toThrow(
      /registered twice.*"a".*"a"/,
    );
  });

  test("pattern collision between auto and explicit rules throws at compile, naming both owners", async () => {
    const registry = await buildRegistry([
      definePlugin("conflict", (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
        ctx.registerRewriteRule("/post/:slug", {
          kind: "single",
          entryType: "post",
        });
      }),
    ]);
    expect(() => compileRouteMap(registry)).toThrow(
      /registered twice.*"conflict".*"conflict"/,
    );
  });

  test("cross-plugin collisions name both plugin ids", async () => {
    const registry = await buildRegistry([
      definePlugin("plugin-a", (ctx) => {
        ctx.registerRewriteRule("/x", { kind: "single", entryType: "a" });
      }),
      definePlugin("plugin-b", (ctx) => {
        ctx.registerRewriteRule("/x", { kind: "single", entryType: "b" });
      }),
    ]);
    expect(() => compileRouteMap(registry)).toThrow(/"plugin-a".*"plugin-b"/);
  });

  test("stable sort preserves registration order on equal priorities", async () => {
    const registry = await buildRegistry([
      definePlugin("a", (ctx) => {
        ctx.registerRewriteRule("/a", { kind: "single", entryType: "x" });
        ctx.registerRewriteRule("/b", { kind: "single", entryType: "x" });
      }),
    ]);
    const map = compileRouteMap(registry);
    expect(map.map((r) => r.rawPattern)).toEqual(["/a", "/b"]);
  });

  test("isPublic defaults to true — omitting it still generates routes", async () => {
    const registry = await buildRegistry([
      definePlugin("default", (ctx) => {
        ctx.registerEntryType("article", { label: "Articles" });
      }),
    ]);
    expect(compileRouteMap(registry).map((r) => r.rawPattern)).toEqual([
      "/article/:slug",
    ]);
  });

  test("cross-plugin priority: explicit plugin rule beats another plugin's auto rule", async () => {
    const registry = await buildRegistry([
      definePlugin("core-blog", (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      }),
      definePlugin("overrider", (ctx) => {
        ctx.registerRewriteRule(
          "/post/featured",
          { kind: "archive", entryType: "post" },
          { priority: 5 },
        );
      }),
    ]);
    const map = compileRouteMap(registry);
    expect(map[0]?.rawPattern).toBe("/post/featured");
    expect(map[0]?.priority).toBe(5);
  });

  test("hasArchive: string rejects multi-segment or non-kebab input", async () => {
    const bad = await buildRegistry([
      definePlugin("x", (ctx) => {
        ctx.registerEntryType("product", {
          label: "Products",
          isPublic: true,
          hasArchive: "foo/bar",
        });
      }),
    ]);
    expect(() => compileRouteMap(bad)).toThrow(/invalid hasArchive/);

    const dots = await buildRegistry([
      definePlugin("y", (ctx) => {
        ctx.registerEntryType("product", {
          label: "Products",
          isPublic: true,
          hasArchive: "../admin",
        });
      }),
    ]);
    expect(() => compileRouteMap(dots)).toThrow(/invalid hasArchive/);
  });
});

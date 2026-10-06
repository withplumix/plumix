import { describe, expect, test } from "vitest";

import type { FrameworkRoutes } from "./contract/framework-routes.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { installPlugins } from "../runtime/install-plugins.js";
import {
  compileRouteMap,
  FRAMEWORK_AUTHOR_PAGINATED_PATTERN,
  FRAMEWORK_AUTHOR_PATTERN,
  FRAMEWORK_DATE_DAY_PAGINATED_PATTERN,
  FRAMEWORK_DATE_DAY_PATTERN,
  FRAMEWORK_DATE_MONTH_PAGINATED_PATTERN,
  FRAMEWORK_DATE_MONTH_PATTERN,
  FRAMEWORK_DATE_YEAR_PAGINATED_PATTERN,
  FRAMEWORK_DATE_YEAR_PATTERN,
  FRAMEWORK_PAGINATION_SUFFIX,
  FRAMEWORK_SEARCH_BARE_PATTERN,
  FRAMEWORK_SEARCH_PAGINATED_PATTERN,
  FRAMEWORK_SEARCH_QUERY_PATTERN,
} from "./compile.js";
import { matchRoute } from "./match.js";

const FRAMEWORK_PATTERNS = new Set<string>([
  FRAMEWORK_PAGINATION_SUFFIX,
  FRAMEWORK_SEARCH_PAGINATED_PATTERN,
  FRAMEWORK_SEARCH_QUERY_PATTERN,
  FRAMEWORK_SEARCH_BARE_PATTERN,
  FRAMEWORK_AUTHOR_PAGINATED_PATTERN,
  FRAMEWORK_AUTHOR_PATTERN,
  FRAMEWORK_DATE_DAY_PAGINATED_PATTERN,
  FRAMEWORK_DATE_DAY_PATTERN,
  FRAMEWORK_DATE_MONTH_PAGINATED_PATTERN,
  FRAMEWORK_DATE_MONTH_PATTERN,
  FRAMEWORK_DATE_YEAR_PAGINATED_PATTERN,
  FRAMEWORK_DATE_YEAR_PATTERN,
]);

async function buildRegistry(
  plugins: ReturnType<typeof definePlugin>[],
  frameworkRoutes?: FrameworkRoutes,
) {
  const hooks = new HookRegistry();
  const registry = createPluginRegistry(frameworkRoutes);
  await installPlugins({ hooks, plugins, registry });
  return registry;
}

function pluginRoutes(registry: ReturnType<typeof createPluginRegistry>) {
  return compileRouteMap(registry).filter(
    (rule) => !FRAMEWORK_PATTERNS.has(rule.rawPattern),
  );
}

describe("compileRouteMap", () => {
  test("a plugin archive's later pages match its paginated route whatever order it declared them in", async () => {
    // A multi-segment capture would otherwise swallow `/page/2` as part of the
    // listing's own path, and the page would claim to be a first page.
    const registry = await buildRegistry([
      definePlugin("docs", (ctx) => {
        ctx.registerArchiveType("doc-section", {
          routes: [
            "/docs/:path+",
            `/docs/:path+${FRAMEWORK_PAGINATION_SUFFIX}`,
          ],
          resolve: () => null,
        });
      }),
    ]);
    const match = matchRoute(
      new URL("https://cms.example/docs/a/page/2"),
      compileRouteMap(registry),
    );
    expect(match?.pattern).toBe(`/docs/:path+${FRAMEWORK_PAGINATION_SUFFIX}`);
    expect(match?.params).toEqual({ path: "a", page: "2" });
  });

  test("every paginated rule core compiles ends in the one pagination suffix", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerEntryType("product", {
          label: "Products",
          isPublic: true,
          hasArchive: true,
          rewrite: { slug: "shop" },
        });
        ctx.registerTermTaxonomy("category", { label: "Categories" });
        ctx.registerTermTaxonomy("region", {
          label: "Regions",
          isHierarchical: true,
        });
      }),
    ]);
    const paginated = compileRouteMap(registry)
      .map((rule) => rule.rawPattern)
      .filter((pattern) => pattern.includes("/page/"));
    expect(paginated.length).toBeGreaterThan(0);
    for (const pattern of paginated) {
      expect(pattern.endsWith(FRAMEWORK_PAGINATION_SUFFIX)).toBe(true);
    }
  });

  test("auto-generates /{taxonomy}/:term from a registered term taxonomy", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerTermTaxonomy("category", { label: "Categories" });
      }),
    ]);
    const map = compileRouteMap(registry);
    const bare = map.find((r) => r.rawPattern === "/category/:term");
    expect(bare?.intent).toEqual({ kind: "term", taxonomy: "category" });
    expect(bare?.priority).toBe(50);
  });

  test("emits /<base>/:term/page/:page paginated rule alongside the bare term archive", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerTermTaxonomy("category", { label: "Categories" });
      }),
    ]);
    const map = compileRouteMap(registry);
    const patterns = map.map((r) => r.rawPattern);
    expect(patterns).toContain("/category/:term");
    expect(patterns).toContain("/category/:term/page/:page(\\d+)");
    const paginated = map.find(
      (r) => r.rawPattern === "/category/:term/page/:page(\\d+)",
    );
    expect(paginated?.intent).toEqual({
      kind: "term",
      taxonomy: "category",
    });
    expect(paginated?.priority).toBe(50);
  });

  test("hierarchical taxonomy emits /<base>/:path+ and /<base>/:path+/page/:page", async () => {
    const registry = await buildRegistry([
      definePlugin("geo", (ctx) => {
        ctx.registerTermTaxonomy("region", {
          label: "Regions",
          isHierarchical: true,
        });
      }),
    ]);
    const map = compileRouteMap(registry);
    const patterns = map.map((r) => r.rawPattern);
    expect(patterns).toContain("/region/:path+");
    expect(patterns).toContain("/region/:path+/page/:page(\\d+)");
    expect(patterns).not.toContain("/region/:term");
    expect(patterns).not.toContain("/region/:term/page/:page(\\d+)");
  });

  test("taxonomy with rewrite.isHierarchical:false keeps flat :term even when isHierarchical:true", async () => {
    const registry = await buildRegistry([
      definePlugin("geo", (ctx) => {
        ctx.registerTermTaxonomy("region", {
          label: "Regions",
          isHierarchical: true,
          rewrite: { isHierarchical: false },
        });
      }),
    ]);
    const map = compileRouteMap(registry);
    const patterns = map.map((r) => r.rawPattern);
    expect(patterns).toContain("/region/:term");
    expect(patterns).toContain("/region/:term/page/:page(\\d+)");
    expect(patterns).not.toContain("/region/:path+");
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
    const map = pluginRoutes(registry);
    expect(map.map((r) => r.rawPattern)).toEqual([
      "/r/:term/page/:page(\\d+)",
      "/r/:term",
    ]);
    const bare = map.find((r) => r.rawPattern === "/r/:term");
    expect(bare?.intent).toEqual({ kind: "term", taxonomy: "region" });
  });

  test("taxonomy isPublic defaults to true — omitting it still generates a route", async () => {
    const registry = await buildRegistry([
      definePlugin("default", (ctx) => {
        ctx.registerTermTaxonomy("topic", { label: "Topics" });
      }),
    ]);
    expect(pluginRoutes(registry).map((r) => r.rawPattern)).toEqual([
      "/topic/:term/page/:page(\\d+)",
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
    expect(pluginRoutes(registry)).toHaveLength(0);
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

  test("hierarchical entry type emits /<base>/:path+ instead of /<base>/:slug", async () => {
    const registry = await buildRegistry([
      definePlugin("pages", (ctx) => {
        ctx.registerEntryType("page", {
          label: "Pages",
          isPublic: true,
          isHierarchical: true,
        });
      }),
    ]);
    const map = compileRouteMap(registry);
    const patterns = map.map((r) => r.rawPattern);
    expect(patterns).toContain("/page/:path+");
    expect(patterns).not.toContain("/page/:slug");
    const single = map.find((r) => r.rawPattern === "/page/:path+");
    expect(single?.intent).toEqual({ kind: "entry", entryType: "page" });
  });

  test("entry type with rewrite.isHierarchical:false keeps flat :slug even when data is hierarchical", async () => {
    const registry = await buildRegistry([
      definePlugin("docs", (ctx) => {
        ctx.registerEntryType("doc", {
          label: "Docs",
          isPublic: true,
          isHierarchical: true,
          rewrite: { isHierarchical: false },
        });
      }),
    ]);
    const map = compileRouteMap(registry);
    const patterns = map.map((r) => r.rawPattern);
    expect(patterns).toContain("/doc/:slug");
    expect(patterns).not.toContain("/doc/:path+");
  });

  test("auto-generates /{type}/:slug from a registered post type", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      }),
    ]);
    const map = pluginRoutes(registry);
    expect(map).toHaveLength(1);
    expect(map[0]?.rawPattern).toBe("/post/:slug");
    expect(map[0]?.intent).toEqual({ kind: "entry", entryType: "post" });
    expect(map[0]?.priority).toBe(50);
  });

  test("emits /<archive>/page/:page paginated rule alongside the bare archive", async () => {
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
    expect(patterns).toContain("/shop");
    expect(patterns).toContain("/shop/page/:page(\\d+)");
    const paginated = map.find(
      (r) => r.rawPattern === "/shop/page/:page(\\d+)",
    );
    expect(paginated?.intent).toEqual({
      kind: "entryType",
      entryType: "product",
    });
    expect(paginated?.priority).toBe(50);
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
    const map = pluginRoutes(registry);
    const patterns = map.map((r) => r.rawPattern);
    expect(patterns).toEqual([
      "/shop/page/:page(\\d+)",
      "/shop",
      "/shop/:slug",
    ]);
    expect(map[0]?.intent).toEqual({ kind: "entryType", entryType: "product" });
    expect(map[1]?.intent).toEqual({ kind: "entryType", entryType: "product" });
    expect(map[2]?.intent).toEqual({ kind: "entry", entryType: "product" });
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
    expect(pluginRoutes(registry).map((r) => r.rawPattern)).toEqual([
      "/store/page/:page(\\d+)",
      "/store",
      "/p/:slug",
    ]);
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
    expect(pluginRoutes(registry)).toHaveLength(0);
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
          kind: "entry",
          entryType: "doc",
        });
      }),
    ]);
    const map = pluginRoutes(registry);
    expect(map[0]?.rawPattern).toBe("/docs/:category/:slug");
    expect(map[0]?.priority).toBe(10);
    expect(map[1]?.rawPattern).toBe("/docs/:slug");
  });

  test("duplicate explicit pattern within one plugin throws at compile", async () => {
    const registry = await buildRegistry([
      definePlugin("a", (ctx) => {
        ctx.registerRewriteRule("/cart", { kind: "entry", entryType: "x" });
        ctx.registerRewriteRule("/cart", { kind: "entry", entryType: "x" });
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
          kind: "entry",
          entryType: "post",
        });
      }),
    ]);
    expect(() => compileRouteMap(registry)).toThrow(
      /registered twice.*"conflict".*"conflict"/,
    );
  });

  test("a plugin claiming a framework pattern below its priority shadows it", async () => {
    const registry = await buildRegistry([
      definePlugin("search", (ctx) => {
        ctx.registerArchiveType("search", {
          routes: [FRAMEWORK_SEARCH_QUERY_PATTERN],
          priority: 1,
          resolve: () => null,
        });
      }),
    ]);
    const map = compileRouteMap(registry);
    const matching = map.filter(
      (rule) => rule.rawPattern === FRAMEWORK_SEARCH_QUERY_PATTERN,
    );
    // Core's rule stays compiled — it is what answers once the plugin is
    // uninstalled — but the plugin's sorts ahead of it, so it wins the match.
    expect(matching).toHaveLength(2);
    expect(matching[0]?.intent).toEqual({
      kind: "archiveType",
      name: "search",
    });
    expect(matching[1]?.intent).toEqual({ kind: "search" });
  });

  test("a plugin claiming a framework pattern it cannot win still throws", async () => {
    const registry = await buildRegistry([
      definePlugin("careless", (ctx) => {
        ctx.registerRewriteRule(FRAMEWORK_SEARCH_QUERY_PATTERN, {
          kind: "entry",
          entryType: "x",
        });
      }),
    ]);
    // Default priority 10 loses to the framework's 5, so the rule would never
    // match — silently. That is the collision the guard exists to name.
    expect(() => compileRouteMap(registry)).toThrow(
      /registered twice.*core.*"careless"/,
    );
  });

  test("cross-plugin collisions name both plugin ids", async () => {
    const registry = await buildRegistry([
      definePlugin("plugin-a", (ctx) => {
        ctx.registerRewriteRule("/x", { kind: "entry", entryType: "a" });
      }),
      definePlugin("plugin-b", (ctx) => {
        ctx.registerRewriteRule("/x", { kind: "entry", entryType: "b" });
      }),
    ]);
    expect(() => compileRouteMap(registry)).toThrow(/"plugin-a".*"plugin-b"/);
  });

  test("stable sort preserves registration order on equal priorities", async () => {
    const registry = await buildRegistry([
      definePlugin("a", (ctx) => {
        ctx.registerRewriteRule("/a", { kind: "entry", entryType: "x" });
        ctx.registerRewriteRule("/b", { kind: "entry", entryType: "x" });
      }),
    ]);
    expect(pluginRoutes(registry).map((r) => r.rawPattern)).toEqual([
      "/a",
      "/b",
    ]);
  });

  test("isPublic defaults to true — omitting it still generates routes", async () => {
    const registry = await buildRegistry([
      definePlugin("default", (ctx) => {
        ctx.registerEntryType("article", { label: "Articles" });
      }),
    ]);
    expect(pluginRoutes(registry).map((r) => r.rawPattern)).toEqual([
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
          { kind: "entryType", entryType: "post" },
          { priority: 5 },
        );
      }),
    ]);
    const map = pluginRoutes(registry);
    expect(map[0]?.rawPattern).toBe("/post/featured");
    expect(map[0]?.priority).toBe(5);
  });

  test("framework registers /page/:page(\\d+) ahead of plugin rules", async () => {
    const registry = await buildRegistry([]);
    const map = compileRouteMap(registry);
    expect(map[0]?.rawPattern).toBe(FRAMEWORK_PAGINATION_SUFFIX);
    expect(map[0]?.intent).toEqual({ kind: "frontPage" });
    expect(map[0]?.priority).toBeLessThan(10);
  });

  test("framework registers /search routes that emit kind: 'search'", async () => {
    const registry = await buildRegistry([]);
    const map = compileRouteMap(registry);
    const patterns = map.map((r) => r.rawPattern);
    expect(patterns).toContain(FRAMEWORK_SEARCH_BARE_PATTERN);
    expect(patterns).toContain(FRAMEWORK_SEARCH_QUERY_PATTERN);
    expect(patterns).toContain(FRAMEWORK_SEARCH_PAGINATED_PATTERN);
    expect(patterns.indexOf(FRAMEWORK_SEARCH_PAGINATED_PATTERN)).toBeLessThan(
      patterns.indexOf(FRAMEWORK_SEARCH_QUERY_PATTERN),
    );
    const search = map.find(
      (r) => r.rawPattern === FRAMEWORK_SEARCH_BARE_PATTERN,
    );
    expect(search?.intent).toEqual({ kind: "search" });
    expect(search?.priority).toBeLessThan(10);
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

  test("entry-type rewrite.slug rejects URL-pattern syntax and multi-segment input", async () => {
    const greedy = await buildRegistry([
      definePlugin("greedy", (ctx) => {
        ctx.registerEntryType("product", {
          label: "Products",
          isPublic: true,
          rewrite: { slug: "*" },
        });
      }),
    ]);
    // Precise here, loose below: the message has to name the type and the slug.
    expect(() => compileRouteMap(greedy)).toThrow(
      /Entry type "product" has invalid rewrite\.slug "\*"/,
    );

    const nested = await buildRegistry([
      definePlugin("nested", (ctx) => {
        ctx.registerEntryType("post", {
          label: "Posts",
          isPublic: true,
          rewrite: { slug: "insights/category" },
        });
      }),
    ]);
    expect(() => compileRouteMap(nested)).toThrow(/invalid rewrite\.slug/);
  });

  test("taxonomy rewrite.slug gets the same check, and empty is rejected there too", async () => {
    const greedy = await buildRegistry([
      definePlugin("greedy", (ctx) => {
        ctx.registerTermTaxonomy("topic", {
          label: "Topics",
          rewrite: { slug: ":evil" },
        });
      }),
    ]);
    expect(() => compileRouteMap(greedy)).toThrow(
      /Term taxonomy "topic" has invalid rewrite\.slug/,
    );

    // No root branch for a taxonomy: `""` would compile to `//:term`.
    const rooted = await buildRegistry([
      definePlugin("rooted", (ctx) => {
        ctx.registerTermTaxonomy("topic", {
          label: "Topics",
          rewrite: { slug: "" },
        });
      }),
    ]);
    expect(() => compileRouteMap(rooted)).toThrow(/invalid rewrite\.slug/);
  });

  test.each(["search", "authors"])(
    "a taxonomy slugged %s, whose term URLs a framework route would serve, fails to compile",
    async (slug) => {
      const registry = await buildRegistry([
        definePlugin("blog", (ctx) => {
          ctx.registerTermTaxonomy("topic", {
            label: "Topics",
            rewrite: { slug },
          });
        }),
      ]);
      expect(() => compileRouteMap(registry)).toThrow(
        new RegExp(
          `Term taxonomy "topic" has rewrite\\.slug "${slug}" .*framework route`,
        ),
      );
    },
  );

  test("an entry type slugged search loses its single and archive URLs to search, so it fails to compile", async () => {
    const registry = await buildRegistry([
      definePlugin("shop", (ctx) => {
        ctx.registerEntryType("product", {
          label: "Products",
          isPublic: true,
          rewrite: { slug: "search" },
        });
      }),
    ]);
    expect(() => compileRouteMap(registry)).toThrow(
      /Entry type "product" has rewrite\.slug "search" .*framework route/,
    );
  });

  test("a hasArchive slugged search is reported against hasArchive", async () => {
    const registry = await buildRegistry([
      definePlugin("shop", (ctx) => {
        ctx.registerEntryType("product", {
          label: "Products",
          isPublic: true,
          hasArchive: "search",
        });
      }),
    ]);
    expect(() => compileRouteMap(registry)).toThrow(
      /Entry type "product" has hasArchive "search" .*"\/search"/,
    );
  });

  test("the framework's documented overlaps still compile: hierarchical /page and the root", async () => {
    const registry = await buildRegistry([
      definePlugin("pages", (ctx) => {
        ctx.registerEntryType("page", {
          label: "Pages",
          isPublic: true,
          isHierarchical: true,
        });
        ctx.registerEntryType("landing", {
          label: "Landings",
          isPublic: true,
          rewrite: { slug: "" },
        });
      }),
    ]);
    expect(pluginRoutes(registry).map((r) => r.rawPattern)).toEqual([
      "/page/:path+",
      "/:slug",
    ]);
  });

  test("empty entry-type rewrite.slug still claims the site root", async () => {
    const registry = await buildRegistry([
      definePlugin("pages", (ctx) => {
        ctx.registerEntryType("page", {
          label: "Pages",
          isPublic: true,
          rewrite: { slug: "" },
        });
      }),
    ]);
    expect(pluginRoutes(registry).map((r) => r.rawPattern)).toEqual(["/:slug"]);
  });
});

describe("compileRouteMap — framework routes a site turns off", () => {
  const ALL_ON = { author: true, date: true, search: true } as const;

  function frameworkRules(registry: ReturnType<typeof createPluginRegistry>) {
    return compileRouteMap(registry)
      .filter((rule) => FRAMEWORK_PATTERNS.has(rule.rawPattern))
      .map((rule) => rule.rawPattern);
  }

  test("with every family on, core compiles its rules in the documented order", async () => {
    expect(frameworkRules(await buildRegistry([]))).toEqual([
      "/page/:page(\\d+)",
      "/search/:query/page/:page(\\d+)",
      "/search/:query",
      "/search",
      "/authors/:slug/page/:page(\\d+)",
      "/authors/:slug",
      "/:year(\\d{4})/:month(\\d{2})/:day(\\d{2})/page/:page(\\d+)",
      "/:year(\\d{4})/:month(\\d{2})/:day(\\d{2})",
      "/:year(\\d{4})/:month(\\d{2})/page/:page(\\d+)",
      "/:year(\\d{4})/:month(\\d{2})",
      "/:year(\\d{4})/page/:page(\\d+)",
      "/:year(\\d{4})",
    ]);
  });

  test("with no routes key, the whole map keeps every rule, intent and priority in today's order", async () => {
    const registry = await buildRegistry([
      definePlugin("site", (ctx) => {
        ctx.registerEntryType("post", {
          label: "Posts",
          isPublic: true,
          hasArchive: true,
        });
        ctx.registerEntryType("page", {
          label: "Pages",
          isPublic: true,
          rewrite: { slug: "" },
        });
        ctx.registerTermTaxonomy("topic", { label: "Topics" });
        ctx.registerRewriteRule("/kitchen/:slug", {
          kind: "entry",
          entryType: "post",
        });
        ctx.registerArchiveType("talks", {
          routes: ["/talks/:track"],
          entries: (q) => q,
          title: "Talks",
        });
      }),
    ]);
    expect(
      compileRouteMap(registry).map((rule) => [
        rule.rawPattern,
        rule.intent,
        rule.priority,
      ]),
    ).toEqual([
      ["/page/:page(\\d+)", { kind: "frontPage" }, 5],
      ["/search/:query/page/:page(\\d+)", { kind: "search" }, 5],
      ["/search/:query", { kind: "search" }, 5],
      ["/search", { kind: "search" }, 5],
      ["/authors/:slug/page/:page(\\d+)", { kind: "author" }, 5],
      ["/authors/:slug", { kind: "author" }, 5],
      [
        "/:year(\\d{4})/:month(\\d{2})/:day(\\d{2})/page/:page(\\d+)",
        { kind: "date" },
        5,
      ],
      ["/:year(\\d{4})/:month(\\d{2})/:day(\\d{2})", { kind: "date" }, 5],
      ["/:year(\\d{4})/:month(\\d{2})/page/:page(\\d+)", { kind: "date" }, 5],
      ["/:year(\\d{4})/:month(\\d{2})", { kind: "date" }, 5],
      ["/:year(\\d{4})/page/:page(\\d+)", { kind: "date" }, 5],
      ["/:year(\\d{4})", { kind: "date" }, 5],
      ["/kitchen/:slug", { kind: "entry", entryType: "post" }, 10],
      [
        "/talks/:track/page/:page(\\d+)",
        { kind: "archiveType", name: "talks" },
        10,
      ],
      ["/talks/:track", { kind: "archiveType", name: "talks" }, 10],
      [
        "/topic/:term/page/:page(\\d+)",
        { kind: "term", taxonomy: "topic" },
        50,
      ],
      ["/topic/:term", { kind: "term", taxonomy: "topic" }, 50],
      ["/post/page/:page(\\d+)", { kind: "entryType", entryType: "post" }, 50],
      ["/post", { kind: "entryType", entryType: "post" }, 50],
      ["/post/:slug", { kind: "entry", entryType: "post" }, 50],
      ["/:slug", { kind: "entry", entryType: "page" }, 60],
    ]);
  });

  test("date off compiles none of the six date rules, so a root entry slugged 2026 resolves", async () => {
    const registry = await buildRegistry(
      [
        definePlugin("pages", (ctx) => {
          ctx.registerEntryType("page", {
            label: "Pages",
            isPublic: true,
            rewrite: { slug: "" },
          });
        }),
      ],
      { ...ALL_ON, date: false },
    );
    expect(frameworkRules(registry)).toEqual([
      "/page/:page(\\d+)",
      "/search/:query/page/:page(\\d+)",
      "/search/:query",
      "/search",
      "/authors/:slug/page/:page(\\d+)",
      "/authors/:slug",
    ]);
    const match = matchRoute(
      new URL("https://cms.example/2026"),
      compileRouteMap(registry),
    );
    expect(match?.intent).toEqual({ kind: "entry", entryType: "page" });
    expect(match?.params).toEqual({ slug: "2026" });
  });
});

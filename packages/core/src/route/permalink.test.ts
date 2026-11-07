import { describe, expect, test } from "vitest";

import { eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { definePlugin } from "../plugin/define.js";
import { testSite } from "../test/site.js";
import { compileRouteMap } from "./compile.js";
import { matchRoute } from "./match.js";
import {
  buildEntryPermalink,
  buildEntryPermalinks,
  buildEntryPermalinkSync,
  buildTermArchiveUrl,
  buildTermArchiveUrls,
  buildTermArchiveUrlSync,
} from "./permalink.js";

const content = definePlugin("content", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      isHierarchical: true,
    });
    ctx.registerEntryType("doc", {
      label: "Docs",
      isPublic: true,
      isHierarchical: true,
      rewrite: { slug: "docs", isHierarchical: false },
    });
    ctx.registerEntryType("product", {
      label: "Products",
      isPublic: true,
      rewrite: { slug: "store" },
    });
    ctx.registerEntryType("hidden", { label: "Hidden", isPublic: false });
    ctx.registerTermTaxonomy("tag", { label: "Tags", isPublic: true });
    ctx.registerTermTaxonomy("category", {
      label: "Categories",
      isPublic: true,
      isHierarchical: true,
    });
    ctx.registerTermTaxonomy("menu", { label: "Menus", isPublic: false });
  },
});

const site = await testSite({ plugins: [content] });
const underDirectory = await testSite({
  plugins: [content],
  config: { basePath: "/custom-directory" },
});
const underSite = await testSite({
  plugins: [content],
  config: { basePath: "/site" },
});

const flatPages = await testSite({
  plugins: [
    definePlugin("pages", {
      setup: (ctx) => {
        ctx.registerEntryType("page", {
          label: "Pages",
          isPublic: true,
          isHierarchical: true,
          rewrite: { slug: "page", isHierarchical: false },
        });
      },
    }),
  ],
});

const insightCategories = await testSite({
  plugins: [
    definePlugin("insights", {
      setup: (ctx) => {
        ctx.registerTermTaxonomy("category", {
          label: "Categories",
          isPublic: true,
          isHierarchical: true,
          rewrite: { slug: "insights/category" },
        });
      },
    }),
  ],
});

const topicCategories = await testSite({
  plugins: [
    definePlugin("blog", {
      setup: (ctx) => {
        ctx.registerTermTaxonomy("category", {
          label: "Categories",
          isPublic: true,
          rewrite: { slug: "topic" },
        });
      },
    }),
  ],
});

const flatCategoriesUnderBlog = await testSite({
  plugins: [
    definePlugin("blog", {
      setup: (ctx) => {
        ctx.registerTermTaxonomy("category", { label: "Categories" });
      },
    }),
  ],
  config: { basePath: "/blog" },
});

const everything = await testSite({
  plugins: [
    definePlugin("site", {
      setup: (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
        ctx.registerEntryType("product", {
          label: "Products",
          isPublic: true,
          hasArchive: true,
          rewrite: { slug: "shop" },
        });
        ctx.registerEntryType("doc", {
          label: "Docs",
          isPublic: true,
          isHierarchical: true,
          rewrite: { slug: "page" },
        });
        ctx.registerEntryType("guide", {
          label: "Guides",
          isPublic: true,
          isHierarchical: true,
          rewrite: { isHierarchical: false },
        });
        ctx.registerEntryType("page", {
          label: "Pages",
          isPublic: true,
          isHierarchical: true,
          rewrite: { slug: "" },
        });
        ctx.registerTermTaxonomy("tag", { label: "Tags" });
        ctx.registerTermTaxonomy("region", {
          label: "Regions",
          isHierarchical: true,
          rewrite: { slug: "where" },
        });
        ctx.registerTermTaxonomy("topic", {
          label: "Topics",
          isHierarchical: true,
          rewrite: { isHierarchical: false },
        });
        ctx.registerEntryType("course", {
          label: "Courses",
          isPublic: true,
          hasArchive: true,
          rewrite: { slug: "learn/courses" },
        });
        ctx.registerEntryType("lesson", {
          label: "Lessons",
          isPublic: true,
          isHierarchical: true,
          rewrite: { slug: "learn/lessons" },
        });
        ctx.registerTermTaxonomy("category", {
          label: "Categories",
          rewrite: { slug: "insights/category" },
        });
        ctx.registerTermTaxonomy("section", {
          label: "Sections",
          isHierarchical: true,
          rewrite: { slug: "insights/section" },
        });
      },
    }),
  ],
});

describe("buildEntryPermalink", () => {
  test("non-hierarchical type: pure substitution, no DB hit", async () => {
    const ctx = site.context;

    const url = await buildEntryPermalink(ctx, {
      type: "post",
      slug: "hello-world",
    });
    expect(url).toBe("/post/hello-world");
  });

  test("prepends the configured basePath so links resolve under the subdirectory", async () => {
    const ctx = underDirectory.context;

    expect(
      await buildEntryPermalink(ctx, { type: "post", slug: "hello-world" }),
    ).toBe("/custom-directory/post/hello-world");
  });

  test("honors rewrite.slug as the base segment", async () => {
    const ctx = site.context;

    expect(
      await buildEntryPermalink(ctx, { type: "product", slug: "widget" }),
    ).toBe("/store/widget");
  });

  test("returns null for isPublic: false types", async () => {
    const ctx = site.context;

    expect(
      await buildEntryPermalink(ctx, { type: "hidden", slug: "x" }),
    ).toBeNull();
  });

  test("returns null for unregistered types", async () => {
    const ctx = site.context;

    expect(
      await buildEntryPermalink(ctx, { type: "ghost", slug: "x" }),
    ).toBeNull();
  });

  test("non-hierarchical type ignores parentId for URL shape", async () => {
    const ctx = site.context;

    expect(
      await buildEntryPermalink(ctx, {
        type: "post",
        slug: "child",
        parentId: 7,
      }),
    ).toBe("/post/child");
  });

  test("hierarchical type with no parentId: just baseSlug + slug", async () => {
    const ctx = site.context;

    expect(
      await buildEntryPermalink(ctx, {
        type: "page",
        slug: "about",
        parentId: null,
      }),
    ).toBe("/page/about");
  });

  test("hierarchical type with parents: walks ancestor chain via CTE", async () => {
    const author = await site.factory.admin.create({
      email: "perm@example.test",
    });

    const root = await site.factory.entry.create({
      type: "page",
      slug: "about",
      title: "About",
      authorId: author.id,
      parentId: null,
      status: "published",
    });
    const mid = await site.factory.entry.create({
      type: "page",
      slug: "team",
      title: "Team",
      authorId: author.id,
      parentId: root.id,
      status: "published",
    });
    const leaf = await site.factory.entry.create({
      type: "page",
      slug: "leadership",
      title: "Leadership",
      authorId: author.id,
      parentId: mid.id,
      status: "published",
    });

    const ctx = site.context;
    expect(
      await buildEntryPermalink(ctx, {
        type: leaf.type,
        slug: leaf.slug,
        parentId: leaf.parentId,
      }),
    ).toBe("/page/about/team/leadership");
  });

  test("ancestorSlugs option skips DB lookup", async () => {
    const ctx = site.context;

    // parentId 9999 doesn't exist in DB — would fail if CTE was hit.
    expect(
      await buildEntryPermalink(
        ctx,
        { type: "page", slug: "leaf", parentId: 9999 },
        { ancestorSlugs: ["root", "mid"] },
      ),
    ).toBe("/page/root/mid/leaf");
  });

  test("rewrite.isHierarchical: false flattens the URL even for hierarchical types", async () => {
    const ctx = flatPages.context;

    expect(
      await buildEntryPermalink(
        ctx,
        { type: "page", slug: "leaf", parentId: 7 },
        { ancestorSlugs: ["root"] },
      ),
    ).toBe("/page/leaf");
  });

  test("strips leading and trailing slashes from supplied segments", async () => {
    // A site refuses a slashed `rewrite.slug` at boot, so only the entry's
    // own slug can carry them.
    const ctx = site.context;

    expect(
      await buildEntryPermalink(ctx, { type: "post", slug: "/hello/" }),
    ).toBe("/post/hello");
  });

  test("splits internal slashes in segments rather than embedding them", async () => {
    const ctx = site.context;

    // A slug stored with an embedded `/` (or traversal markers) gets
    // normalized into separate segments, not embedded literally.
    expect(await buildEntryPermalink(ctx, { type: "post", slug: "a/b" })).toBe(
      "/post/a/b",
    );
    expect(await buildEntryPermalink(ctx, { type: "post", slug: "./.." })).toBe(
      "/post",
    );
  });
});

describe("buildEntryPermalinkSync", () => {
  test("non-hierarchical type returns the substituted URL", () => {
    const ctx = site.context;

    expect(buildEntryPermalinkSync(ctx, { type: "post", slug: "hi" })).toBe(
      "/post/hi",
    );
  });

  test("hierarchical type with parentId=null returns the top-level URL", () => {
    const ctx = site.context;

    expect(
      buildEntryPermalinkSync(ctx, {
        type: "page",
        slug: "about",
        parentId: null,
      }),
    ).toBe("/page/about");
  });

  test("hierarchical with rewrite.isHierarchical:false flattens regardless of parentId", () => {
    const ctx = flatPages.context;

    expect(
      buildEntryPermalinkSync(ctx, {
        type: "page",
        slug: "leaf",
        parentId: 7,
      }),
    ).toBe("/page/leaf");
  });

  test("hierarchical with a non-null parentId returns null (defers to async ancestor walk)", () => {
    const ctx = site.context;

    expect(
      buildEntryPermalinkSync(ctx, {
        type: "page",
        slug: "leaf",
        parentId: 7,
      }),
    ).toBeNull();
  });

  test("returns null for isPublic:false types", () => {
    const ctx = site.context;

    expect(
      buildEntryPermalinkSync(ctx, { type: "hidden", slug: "x" }),
    ).toBeNull();
  });

  test("returns null for unregistered types", () => {
    const ctx = site.context;

    expect(
      buildEntryPermalinkSync(ctx, { type: "ghost", slug: "x" }),
    ).toBeNull();
  });
});

describe("buildTermArchiveUrl", () => {
  test("flat taxonomy: pure substitution", async () => {
    const ctx = site.context;

    expect(
      await buildTermArchiveUrl(ctx, { taxonomy: "tag", slug: "javascript" }),
    ).toBe("/tag/javascript");
  });

  test("returns null for isPublic: false taxonomies", async () => {
    const ctx = site.context;

    expect(
      await buildTermArchiveUrl(ctx, { taxonomy: "menu", slug: "primary" }),
    ).toBeNull();
  });

  test("returns null for unregistered taxonomies", async () => {
    const ctx = site.context;

    expect(
      await buildTermArchiveUrl(ctx, { taxonomy: "ghost", slug: "x" }),
    ).toBeNull();
  });

  test("hierarchical taxonomy with parents: walks term chain", async () => {
    const root = await site.factory.term.create({
      taxonomy: "category",
      slug: "news",
      name: "News",
    });
    const leaf = await site.factory.term.create({
      taxonomy: "category",
      slug: "local",
      name: "Local",
      parentId: root.id,
    });

    const ctx = site.context;
    expect(
      await buildTermArchiveUrl(ctx, {
        taxonomy: leaf.taxonomy,
        slug: leaf.slug,
        parentId: leaf.parentId,
      }),
    ).toBe("/category/news/local");
  });

  test("hierarchical taxonomy under a multi-segment base nests the chain after the whole base", async () => {
    const parent = await insightCategories.factory.term.create({
      taxonomy: "category",
      slug: "policy",
      name: "Policy",
    });
    const child = await insightCategories.factory.term.create({
      taxonomy: "category",
      slug: "housing",
      name: "Housing",
      parentId: parent.id,
    });

    const url = await buildTermArchiveUrl(insightCategories.context, {
      taxonomy: child.taxonomy,
      slug: child.slug,
      parentId: child.parentId,
    });
    expect(url).toBe("/insights/category/policy/housing");
    expect(
      matchRoute(
        new URL(url ?? "", "https://cms.example"),
        compileRouteMap(insightCategories.context.plugins),
      )?.intent,
    ).toEqual({ kind: "term", taxonomy: "category" });
  });

  test("honors taxonomy rewrite.slug override", async () => {
    const ctx = topicCategories.context;

    expect(
      await buildTermArchiveUrl(ctx, { taxonomy: "category", slug: "news" }),
    ).toBe("/topic/news");
  });
});

describe("buildEntryPermalinks", () => {
  test("builds each row's URL at its own index, whatever its shape", async () => {
    const author = await underSite.factory.admin.create();
    const page = (slug: string, parentId: number | null) =>
      underSite.factory.entry.create({
        type: "page",
        slug,
        title: slug,
        authorId: author.id,
        parentId,
        status: "published",
      });
    const root = await page("about", null);
    const team = await page("team", root.id);
    const careers = await page("careers", root.id);
    const leadership = await page("leadership", team.id);

    const rows = [
      { type: "post", slug: "hello", parentId: 7 },
      { type: "page", slug: leadership.slug, parentId: leadership.parentId },
      { type: "hidden", slug: "secret", parentId: root.id },
      { type: "page", slug: careers.slug, parentId: careers.parentId },
      { type: "ghost", slug: "x" },
      { type: "page", slug: root.slug, parentId: null },
      { type: "page", slug: "orphan", parentId: 9999 },
      { type: "doc", slug: "intro", parentId: root.id },
      { type: "page", slug: team.slug, parentId: team.parentId },
    ];

    const ctx = underSite.context;
    const expected = [
      "/site/post/hello",
      "/site/page/about/team/leadership",
      null,
      "/site/page/about/careers",
      null,
      "/site/page/about",
      "/site/page/orphan",
      "/site/docs/intro",
      "/site/page/about/team",
    ];
    expect(await buildEntryPermalinks(ctx, rows)).toEqual(expected);
    expect(
      await Promise.all(rows.map((row) => buildEntryPermalink(ctx, row))),
    ).toEqual(expected);
  });

  test("resolves more parents than one statement may bind", async () => {
    const author = await site.factory.admin.create();
    const parents = [];
    for (let i = 0; i < 150; i++) {
      parents.push(
        await site.factory.entry.create({
          type: "page",
          slug: `parent-${String(i)}`,
          title: "Parent",
          authorId: author.id,
          parentId: null,
          status: "published",
        }),
      );
    }

    const urls = await buildEntryPermalinks(
      site.context,
      parents.map((parent) => ({
        type: "page",
        slug: "child",
        parentId: parent.id,
      })),
    );

    expect(urls).toEqual(parents.map((parent) => `/page/${parent.slug}/child`));
  });

  test("a parent cycle yields a truncated URL rather than an error", async () => {
    const author = await site.factory.admin.create();
    const a = await site.factory.entry.create({
      type: "page",
      slug: "a",
      title: "A",
      authorId: author.id,
      parentId: null,
      status: "published",
    });
    const b = await site.factory.entry.create({
      type: "page",
      slug: "b",
      title: "B",
      authorId: author.id,
      parentId: a.id,
      status: "published",
    });
    // A cycle needs a row pointing at one created after it, which no single
    // factory create can seed.
    await site.context.db
      .update(entries)
      .set({ parentId: b.id })
      .where(eq(entries.id, a.id));

    const [url] = await buildEntryPermalinks(site.context, [
      { type: "page", slug: "leaf", parentId: a.id },
    ]);

    // The walk stops at the depth cap: 51 ancestors, plus base and leaf.
    expect(url?.split("/").filter(Boolean)).toHaveLength(53);
  });
});

describe("buildTermArchiveUrls", () => {
  test("builds each row's URL at its own index, whatever its shape", async () => {
    const news = await site.factory.term.create({
      taxonomy: "category",
      slug: "news",
      name: "News",
    });
    const local = await site.factory.term.create({
      taxonomy: "category",
      slug: "local",
      name: "Local",
      parentId: news.id,
    });

    const rows = [
      { taxonomy: "category", slug: "city", parentId: local.id },
      { taxonomy: "tag", slug: "js", parentId: news.id },
      { taxonomy: "menu", slug: "main", parentId: null },
      { taxonomy: "category", slug: "world", parentId: news.id },
      { taxonomy: "ghost", slug: "x" },
      { taxonomy: "category", slug: "news", parentId: null },
    ];

    const ctx = site.context;
    const expected = [
      "/category/news/local/city",
      "/tag/js",
      null,
      "/category/news/world",
      null,
      "/category/news",
    ];
    expect(await buildTermArchiveUrls(ctx, rows)).toEqual(expected);
    expect(
      await Promise.all(rows.map((row) => buildTermArchiveUrl(ctx, row))),
    ).toEqual(expected);
  });
});

describe("buildTermArchiveUrlSync", () => {
  test("flat taxonomy: basePath-correct url without a DB hit", () => {
    const ctx = flatCategoriesUnderBlog.context;
    expect(
      buildTermArchiveUrlSync(ctx, {
        taxonomy: "category",
        slug: "news",
        parentId: null,
      }),
    ).toBe("/blog/category/news");
  });

  test("returns null for a nested term that needs an ancestor walk", () => {
    const ctx = site.context;
    expect(
      buildTermArchiveUrlSync(ctx, {
        taxonomy: "category",
        slug: "child",
        parentId: 5,
      }),
    ).toBeNull();
  });

  test("returns null for a private or unknown taxonomy", () => {
    const ctx = site.context;
    expect(
      buildTermArchiveUrlSync(ctx, {
        taxonomy: "menu",
        slug: "main",
        parentId: null,
      }),
    ).toBeNull();
    expect(
      buildTermArchiveUrlSync(ctx, {
        taxonomy: "nope",
        slug: "x",
        parentId: null,
      }),
    ).toBeNull();
  });
});

describe("every built permalink routes back to its own intent", () => {
  // Content slugs aren't checked at compile, so the samples stay clear of the
  // URL space the framework reserves: date-shaped and `search`/`authors`.
  const SLUGS = ["hello-world", "page", "a1"];
  const ANCESTOR_CHAINS: readonly (readonly string[])[] = [
    [],
    ["parent"],
    ["grand", "parent"],
  ];

  test("for flat and hierarchical, prefixed, multi-segment and root-mounted registrations", async () => {
    const ctx = everything.context;
    const rules = compileRouteMap(ctx.plugins);
    const resolve = (path: string | null) =>
      path === null
        ? null
        : matchRoute(new URL(path, "https://cms.example"), rules)?.intent;

    let checked = 0;
    for (const slug of SLUGS) {
      for (const ancestorSlugs of ANCESTOR_CHAINS) {
        const parentId = ancestorSlugs.length === 0 ? null : 1;
        for (const type of ctx.plugins.entryTypes.keys()) {
          const url = await buildEntryPermalink(
            ctx,
            { type, slug, parentId },
            { ancestorSlugs },
          );
          expect(resolve(url), `${type} ${String(url)}`).toEqual({
            kind: "entry",
            entryType: type,
          });
          checked++;
        }
        for (const taxonomy of ctx.plugins.termTaxonomies.keys()) {
          const url = await buildTermArchiveUrl(
            ctx,
            { taxonomy, slug, parentId },
            { ancestorSlugs },
          );
          expect(resolve(url), `${taxonomy} ${String(url)}`).toEqual({
            kind: "term",
            taxonomy,
          });
          checked++;
        }
      }
    }
    expect(checked).toBe(SLUGS.length * ANCESTOR_CHAINS.length * 12);
  });
});

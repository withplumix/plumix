import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { installPlugins } from "../plugin/register.js";
import { adminUser, createTestDb, factoriesFor } from "../test/index.js";
import { buildEntryPermalink, buildTermArchiveUrl } from "./permalink.js";

async function buildRegistry(
  plugins: ReturnType<typeof definePlugin>[],
): Promise<PluginRegistry> {
  const hooks = new HookRegistry();
  const registry = createPluginRegistry();
  await installPlugins({ hooks, plugins, registry });
  return registry;
}

function ctxFor(
  db: Awaited<ReturnType<typeof createTestDb>>,
  registry: PluginRegistry,
): AppContext {
  return { db, plugins: registry } as unknown as AppContext;
}

describe("buildEntryPermalink", () => {
  test("non-hierarchical type: pure substitution, no DB hit", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      }),
    ]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

    const url = await buildEntryPermalink(ctx, {
      type: "post",
      slug: "hello-world",
    });
    expect(url).toBe("/post/hello-world");
  });

  test("honors rewrite.slug as the base segment", async () => {
    const registry = await buildRegistry([
      definePlugin("shop", (ctx) => {
        ctx.registerEntryType("product", {
          label: "Products",
          isPublic: true,
          rewrite: { slug: "store" },
        });
      }),
    ]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

    expect(
      await buildEntryPermalink(ctx, { type: "product", slug: "widget" }),
    ).toBe("/store/widget");
  });

  test("returns null for isPublic: false types", async () => {
    const registry = await buildRegistry([
      definePlugin("internal", (ctx) => {
        ctx.registerEntryType("hidden", { label: "Hidden", isPublic: false });
      }),
    ]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

    expect(
      await buildEntryPermalink(ctx, { type: "hidden", slug: "x" }),
    ).toBeNull();
  });

  test("returns null for unregistered types", async () => {
    const registry = await buildRegistry([]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

    expect(
      await buildEntryPermalink(ctx, { type: "ghost", slug: "x" }),
    ).toBeNull();
  });

  test("non-hierarchical type ignores parentId for URL shape", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      }),
    ]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

    expect(
      await buildEntryPermalink(ctx, {
        type: "post",
        slug: "child",
        parentId: 7,
      }),
    ).toBe("/post/child");
  });

  test("hierarchical type with no parentId: just baseSlug + slug", async () => {
    const registry = await buildRegistry([
      definePlugin("pages", (ctx) => {
        ctx.registerEntryType("page", {
          label: "Pages",
          isPublic: true,
          isHierarchical: true,
        });
      }),
    ]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

    expect(
      await buildEntryPermalink(ctx, {
        type: "page",
        slug: "about",
        parentId: null,
      }),
    ).toBe("/page/about");
  });

  test("hierarchical type with parents: walks ancestor chain via CTE", async () => {
    const registry = await buildRegistry([
      definePlugin("pages", (ctx) => {
        ctx.registerEntryType("page", {
          label: "Pages",
          isPublic: true,
          isHierarchical: true,
        });
      }),
    ]);
    const db = await createTestDb();
    const factories = factoriesFor(db);
    const author = await adminUser
      .transient({ db })
      .create({ email: "perm@example.test" });

    const root = await factories.entry.create({
      type: "page",
      slug: "about",
      title: "About",
      authorId: author.id,
      parentId: null,
      status: "published",
    });
    const mid = await factories.entry.create({
      type: "page",
      slug: "team",
      title: "Team",
      authorId: author.id,
      parentId: root.id,
      status: "published",
    });
    const leaf = await factories.entry.create({
      type: "page",
      slug: "leadership",
      title: "Leadership",
      authorId: author.id,
      parentId: mid.id,
      status: "published",
    });

    const ctx = ctxFor(db, registry);
    expect(
      await buildEntryPermalink(ctx, {
        type: leaf.type,
        slug: leaf.slug,
        parentId: leaf.parentId,
      }),
    ).toBe("/page/about/team/leadership");
  });

  test("ancestorSlugs option skips DB lookup", async () => {
    const registry = await buildRegistry([
      definePlugin("pages", (ctx) => {
        ctx.registerEntryType("page", {
          label: "Pages",
          isPublic: true,
          isHierarchical: true,
        });
      }),
    ]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

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
    const registry = await buildRegistry([
      definePlugin("pages", (ctx) => {
        ctx.registerEntryType("page", {
          label: "Pages",
          isPublic: true,
          isHierarchical: true,
          rewrite: { slug: "page", isHierarchical: false },
        });
      }),
    ]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

    expect(
      await buildEntryPermalink(
        ctx,
        { type: "page", slug: "leaf", parentId: 7 },
        { ancestorSlugs: ["root"] },
      ),
    ).toBe("/page/leaf");
  });

  test("strips leading and trailing slashes from supplied segments", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerEntryType("post", {
          label: "Posts",
          isPublic: true,
          rewrite: { slug: "/blog/" },
        });
      }),
    ]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

    expect(
      await buildEntryPermalink(ctx, { type: "post", slug: "/hello/" }),
    ).toBe("/blog/hello");
  });

  test("splits internal slashes in segments rather than embedding them", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      }),
    ]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

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

describe("buildTermArchiveUrl", () => {
  test("flat taxonomy: pure substitution", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerTermTaxonomy("tag", {
          label: "Tags",
          isPublic: true,
        });
      }),
    ]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

    expect(
      await buildTermArchiveUrl(ctx, { taxonomy: "tag", slug: "javascript" }),
    ).toBe("/tag/javascript");
  });

  test("returns null for isPublic: false taxonomies", async () => {
    const registry = await buildRegistry([
      definePlugin("menu", (ctx) => {
        ctx.registerTermTaxonomy("menu", { label: "Menus", isPublic: false });
      }),
    ]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

    expect(
      await buildTermArchiveUrl(ctx, { taxonomy: "menu", slug: "primary" }),
    ).toBeNull();
  });

  test("returns null for unregistered taxonomies", async () => {
    const registry = await buildRegistry([]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

    expect(
      await buildTermArchiveUrl(ctx, { taxonomy: "ghost", slug: "x" }),
    ).toBeNull();
  });

  test("hierarchical taxonomy with parents: walks term chain", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerTermTaxonomy("category", {
          label: "Categories",
          isPublic: true,
          isHierarchical: true,
          rewrite: { slug: "category", isHierarchical: true },
        });
      }),
    ]);
    const db = await createTestDb();
    const factories = factoriesFor(db);

    const root = await factories.term.create({
      taxonomy: "category",
      slug: "news",
      name: "News",
    });
    const leaf = await factories.term.create({
      taxonomy: "category",
      slug: "local",
      name: "Local",
      parentId: root.id,
    });

    const ctx = ctxFor(db, registry);
    expect(
      await buildTermArchiveUrl(ctx, {
        taxonomy: leaf.taxonomy,
        slug: leaf.slug,
        parentId: leaf.parentId,
      }),
    ).toBe("/category/news/local");
  });

  test("honors taxonomy rewrite.slug override", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerTermTaxonomy("category", {
          label: "Categories",
          isPublic: true,
          rewrite: { slug: "topic" },
        });
      }),
    ]);
    const db = await createTestDb();
    const ctx = ctxFor(db, registry);

    expect(
      await buildTermArchiveUrl(ctx, { taxonomy: "category", slug: "news" }),
    ).toBe("/topic/news");
  });
});

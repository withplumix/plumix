import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import type { AppContext, PluginRegistry } from "@plumix/core";
import {
  createPluginRegistry,
  definePlugin,
  entries as entriesTable,
  HookRegistry,
  installPlugins,
  registerCoreLookupAdapters,
} from "@plumix/core";
import {
  adminUser,
  createTestDb,
  entryFactory,
  entryTermFactory,
  factoriesFor,
} from "@plumix/core/test";

import type { MenuItemMeta } from "./types.js";
import { getMenuByName } from "./getMenuByName.js";

async function buildRegistry(
  plugins: ReturnType<typeof definePlugin>[],
): Promise<PluginRegistry> {
  const hooks = new HookRegistry();
  const registry = createPluginRegistry();
  // Mirror runtime/app.ts: core adapters seed the registry before plugins
  // install so the menu resolver can dispatch to `entry`/`term` adapters.
  registerCoreLookupAdapters(registry);
  await installPlugins({ hooks, plugins, registry });
  return registry;
}

function ctxFor(
  db: Awaited<ReturnType<typeof createTestDb>>,
  registry: PluginRegistry,
): AppContext {
  return {
    db,
    plugins: registry,
    request: new Request("https://test.example/"),
    resolvedEntity: null,
  } as unknown as AppContext;
}

interface SeedItemInput {
  readonly title: string;
  readonly meta: MenuItemMeta;
  readonly sortOrder?: number;
  readonly parentId?: number | null;
  readonly status?: "draft" | "published" | "scheduled" | "trash";
}

// A registry that registers `menu` taxonomy plus a public `post` entry type
// and `category` term taxonomy — the latter two so the entry/term lookup
// adapters report results within scope. Built once per test for isolation.
async function defaultRegistry(): Promise<PluginRegistry> {
  return buildRegistry([
    definePlugin("menu-test-host", (ctx) => {
      ctx.registerEntryType("menu_item", {
        label: "Menu items",
        isHierarchical: true,
        isPublic: false,
        termTaxonomies: ["menu"],
      });
      ctx.registerTermTaxonomy("menu", {
        label: "Menus",
        isPublic: false,
        entryTypes: ["menu_item"],
      });
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerTermTaxonomy("category", {
        label: "Categories",
        isPublic: true,
      });
    }),
  ]);
}

describe("getMenuByName", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let factories: ReturnType<typeof factoriesFor>;
  let ctx: AppContext;
  let authorId: number;

  beforeEach(async () => {
    db = await createTestDb();
    factories = factoriesFor(db);
    const registry = await defaultRegistry();
    ctx = ctxFor(db, registry);
    const author = await adminUser
      .transient({ db })
      .create({ email: "menu-author@example.test" });
    authorId = author.id;
  });

  async function seedMenu(slug: string, name = slug): Promise<number> {
    const term = await factories.term.create({ taxonomy: "menu", slug, name });
    return term.id;
  }

  async function seedItems(
    termId: number,
    items: readonly SeedItemInput[],
  ): Promise<number[]> {
    const ids: number[] = [];
    for (const [index, input] of items.entries()) {
      const entry = await entryFactory.transient({ db }).create({
        type: "menu_item",
        title: input.title,
        slug: `menu-item-${termId}-${index}-${Date.now()}-${Math.random()}`,
        status: input.status ?? "published",
        authorId,
        parentId: input.parentId ?? null,
        sortOrder: input.sortOrder ?? index,
        meta: input.meta as unknown as Record<string, unknown>,
      });
      await entryTermFactory
        .transient({ db })
        .create({ entryId: entry.id, termId, sortOrder: index });
      ids.push(entry.id);
    }
    return ids;
  }

  test("returns null when no term matches the slug", async () => {
    const result = await getMenuByName(ctx, "nonexistent");
    expect(result).toBeNull();
  });

  test("returns null when the term exists under a different taxonomy", async () => {
    await factories.term.create({ taxonomy: "category", slug: "main" });
    const result = await getMenuByName(ctx, "main");
    expect(result).toBeNull();
  });

  test("resolves a flat menu of custom-URL items", async () => {
    const termId = await seedMenu("primary", "Primary navigation");
    await seedItems(termId, [
      { title: "Home", meta: { kind: "custom", url: "/" } },
      { title: "About", meta: { kind: "custom", url: "/about" } },
    ]);

    const menu = await getMenuByName(ctx, "primary");
    expect(menu?.name).toBe("Primary navigation");
    expect(menu?.slug).toBe("primary");
    expect(menu?.items).toHaveLength(2);
    expect(menu?.items[0]).toMatchObject({
      label: "Home",
      href: "/",
      source: { kind: "custom" },
    });
    expect(menu?.items[0]?.children).toEqual([]);
    expect(menu?.items[1]?.label).toBe("About");
  });

  test("nests children under their parent in the resolved tree", async () => {
    const termId = await seedMenu("nested");
    const [rootId] = await seedItems(termId, [
      {
        title: "Docs",
        meta: { kind: "custom", url: "/docs" },
      },
    ]);
    await seedItems(termId, [
      {
        title: "Getting started",
        meta: { kind: "custom", url: "/docs/start" },
        parentId: rootId,
        sortOrder: 0,
      },
      {
        title: "API",
        meta: { kind: "custom", url: "/docs/api" },
        parentId: rootId,
        sortOrder: 1,
      },
    ]);

    const menu = await getMenuByName(ctx, "nested");
    expect(menu?.items).toHaveLength(1);
    const root = menu?.items[0];
    expect(root?.label).toBe("Docs");
    expect(root?.children.map((c) => c.label)).toEqual([
      "Getting started",
      "API",
    ]);
  });

  test("siblings ordered by sortOrder ascending", async () => {
    const termId = await seedMenu("ordered");
    await seedItems(termId, [
      { title: "Third", meta: { kind: "custom", url: "/c" }, sortOrder: 30 },
      { title: "First", meta: { kind: "custom", url: "/a" }, sortOrder: 10 },
      { title: "Second", meta: { kind: "custom", url: "/b" }, sortOrder: 20 },
    ]);

    const menu = await getMenuByName(ctx, "ordered");
    expect(menu?.items.map((i) => i.label)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  test("preserves display attrs (target, rel, cssClasses) when present", async () => {
    const termId = await seedMenu("display");
    await seedItems(termId, [
      {
        title: "Twitter",
        meta: {
          kind: "custom",
          url: "https://twitter.com/plumix",
          target: "_blank",
          rel: "noopener",
          cssClasses: ["external", "social"],
        },
      },
    ]);

    const menu = await getMenuByName(ctx, "display");
    expect(menu?.items[0]).toMatchObject({
      href: "https://twitter.com/plumix",
      target: "_blank",
      rel: "noopener",
      cssClasses: ["external", "social"],
    });
  });

  test("drops items whose URL fails sanitization", async () => {
    const termId = await seedMenu("xss");
    await seedItems(termId, [
      {
        title: "Safe",
        meta: { kind: "custom", url: "/safe" },
      },
      {
        title: "Hostile",
        meta: { kind: "custom", url: "javascript:alert(1)" },
      },
    ]);

    const menu = await getMenuByName(ctx, "xss");
    expect(menu?.items.map((i) => i.label)).toEqual(["Safe"]);
  });

  test("drops items whose meta is missing or unparseable, plus their descendants", async () => {
    const termId = await seedMenu("broken");
    const [parentId] = await seedItems(termId, [
      {
        title: "Bad parent",
        meta: { kind: "custom" } as unknown as MenuItemMeta,
      },
    ]);
    await seedItems(termId, [
      {
        title: "Orphan child",
        meta: { kind: "custom", url: "/c" },
        parentId,
      },
    ]);
    await seedItems(termId, [
      { title: "Healthy", meta: { kind: "custom", url: "/h" } },
    ]);

    const menu = await getMenuByName(ctx, "broken");
    expect(menu?.items.map((i) => i.label)).toEqual(["Healthy"]);
  });

  test("resolves kind='entry' items via the entry lookup adapter", async () => {
    const post = await factories.entry.create({
      type: "post",
      slug: "hello-world",
      title: "Hello, world",
      status: "published",
      authorId,
    });
    const termId = await seedMenu("entry-kind");
    await seedItems(termId, [
      { title: "Stored title", meta: { kind: "entry", entryId: post.id } },
    ]);

    const menu = await getMenuByName(ctx, "entry-kind");
    expect(menu?.items[0]).toMatchObject({
      label: "Hello, world",
      href: "/post/hello-world",
      source: { kind: "entry", id: post.id },
    });
  });

  test("renaming the linked entry propagates to the menu output without re-saving", async () => {
    const post = await factories.entry.create({
      type: "post",
      slug: "first",
      title: "First name",
      status: "published",
      authorId,
    });
    const termId = await seedMenu("rename");
    await seedItems(termId, [
      { title: "snapshot", meta: { kind: "entry", entryId: post.id } },
    ]);

    const before = await getMenuByName(ctx, "rename");
    expect(before?.items[0]?.label).toBe("First name");

    // Rename the source entry — no menu save in between.
    await db
      .update(entriesTable)
      .set({ title: "New name", slug: "second" })
      .where(eq(entriesTable.id, post.id));

    const after = await getMenuByName(ctx, "rename");
    expect(after?.items[0]?.label).toBe("New name");
    expect(after?.items[0]?.href).toBe("/post/second");
  });

  test("resolves kind='term' items via the term lookup adapter", async () => {
    const category = await factories.term.create({
      taxonomy: "category",
      slug: "news",
      name: "News",
    });
    const termId = await seedMenu("term-kind");
    await seedItems(termId, [
      { title: "ignored", meta: { kind: "term", termId: category.id } },
    ]);

    const menu = await getMenuByName(ctx, "term-kind");
    expect(menu?.items[0]).toMatchObject({
      label: "News",
      href: "/category/news",
      source: { kind: "term", id: category.id },
    });
  });

  test("drops entry items whose linked entry is deleted (broken ref)", async () => {
    const termId = await seedMenu("broken-entry");
    await seedItems(termId, [
      { title: "Healthy", meta: { kind: "custom", url: "/h" } },
      { title: "Dangling", meta: { kind: "entry", entryId: 999_999 } },
    ]);

    const menu = await getMenuByName(ctx, "broken-entry");
    expect(menu?.items.map((i) => i.label)).toEqual(["Healthy"]);
  });

  test("drops entry items in trash status (excluded by adapter scope)", async () => {
    const post = await factories.entry.create({
      type: "post",
      slug: "trashed-post",
      title: "Trashed",
      status: "trash",
      authorId,
    });
    const termId = await seedMenu("trashed");
    await seedItems(termId, [
      { title: "ignored", meta: { kind: "entry", entryId: post.id } },
    ]);

    const menu = await getMenuByName(ctx, "trashed");
    expect(menu?.items).toHaveLength(0);
  });

  test("drops entry items in draft / scheduled status (public-nav published-only filter)", async () => {
    const draft = await factories.entry.create({
      type: "post",
      slug: "draft-post",
      title: "Draft",
      status: "draft",
      authorId,
    });
    const scheduled = await factories.entry.create({
      type: "post",
      slug: "scheduled-post",
      title: "Scheduled",
      status: "scheduled",
      authorId,
    });
    const termId = await seedMenu("unpublished");
    await seedItems(termId, [
      { title: "Draft", meta: { kind: "entry", entryId: draft.id } },
      { title: "Scheduled", meta: { kind: "entry", entryId: scheduled.id } },
    ]);

    const menu = await getMenuByName(ctx, "unpublished");
    expect(menu?.items).toHaveLength(0);
  });

  describe("isCurrent / isAncestor", () => {
    function ctxAtUrl(url: string, resolved: unknown): AppContext {
      return {
        db,
        plugins: ctx.plugins,
        request: new Request(url),
        resolvedEntity: resolved,
      } as unknown as AppContext;
    }

    test("entry-kind item is current when resolvedEntity matches its id", async () => {
      const post = await factories.entry.create({
        type: "post",
        slug: "active",
        title: "Active",
        status: "published",
        authorId,
      });
      const termId = await seedMenu("active");
      await seedItems(termId, [
        { title: "Other", meta: { kind: "custom", url: "/other" } },
        { title: "Linked", meta: { kind: "entry", entryId: post.id } },
      ]);

      const localCtx = ctxAtUrl("https://test.example/post/active", {
        kind: "entry",
        id: post.id,
      });
      const menu = await getMenuByName(localCtx, "active");
      const items = menu?.items ?? [];
      // Entry-kind items render the linked entry's title — "Linked" is
      // the menu item's stored title; "Active" is the post's live title.
      expect(items.find((i) => i.label === "Active")?.isCurrent).toBe(true);
      expect(items.find((i) => i.label === "Other")?.isCurrent).toBe(false);
    });

    test("custom-URL item is current when its href matches the request pathname", async () => {
      const termId = await seedMenu("paths");
      await seedItems(termId, [
        { title: "Home", meta: { kind: "custom", url: "/" } },
        { title: "About", meta: { kind: "custom", url: "/about" } },
      ]);

      const localCtx = ctxAtUrl("https://test.example/about", null);
      const items = (await getMenuByName(localCtx, "paths"))?.items ?? [];
      expect(items.find((i) => i.label === "About")?.isCurrent).toBe(true);
      expect(items.find((i) => i.label === "Home")?.isCurrent).toBe(false);
    });

    test("isAncestor is true on a parent whose descendant is current", async () => {
      const termId = await seedMenu("nested-current");
      const [rootId] = await seedItems(termId, [
        { title: "Docs", meta: { kind: "custom", url: "/docs" } },
      ]);
      await seedItems(termId, [
        {
          title: "API",
          meta: { kind: "custom", url: "/docs/api" },
          parentId: rootId,
        },
      ]);

      const localCtx = ctxAtUrl("https://test.example/docs/api", null);
      const items = (await getMenuByName(localCtx, "nested-current"))?.items;
      const docs = items?.[0];
      expect(docs?.label).toBe("Docs");
      expect(docs?.isCurrent).toBe(false);
      expect(docs?.isAncestor).toBe(true);
      expect(docs?.children[0]?.label).toBe("API");
      expect(docs?.children[0]?.isCurrent).toBe(true);
      expect(docs?.children[0]?.isAncestor).toBe(false);
    });

    test("isCurrent and isAncestor are both false when nothing in the menu matches", async () => {
      const termId = await seedMenu("none-current");
      await seedItems(termId, [
        { title: "Home", meta: { kind: "custom", url: "/" } },
      ]);

      const localCtx = ctxAtUrl("https://test.example/elsewhere", null);
      const items = (await getMenuByName(localCtx, "none-current"))?.items;
      expect(items?.[0]?.isCurrent).toBe(false);
      expect(items?.[0]?.isAncestor).toBe(false);
    });
  });

  test("drops entry items linked to isPublic: false types", async () => {
    // Register a private type via a one-off registry; menu_item itself is
    // private so we link to one of those by id.
    const privateRegistry = await buildRegistry([
      definePlugin("private-host", (ctx) => {
        ctx.registerEntryType("menu_item", {
          label: "Menu items",
          isHierarchical: true,
          isPublic: false,
          termTaxonomies: ["menu"],
        });
        ctx.registerTermTaxonomy("menu", {
          label: "Menus",
          isPublic: false,
          entryTypes: ["menu_item"],
        });
      }),
    ]);
    const localCtx = ctxFor(db, privateRegistry);

    // Seed a menu_item entry (private type) directly and then link to it.
    const privateEntry = await factories.entry.create({
      type: "menu_item",
      slug: "x",
      title: "private-target",
      status: "published",
      authorId,
      meta: { kind: "custom", url: "/x" } as unknown as Record<string, unknown>,
    });
    const termId = await seedMenu("private-link");
    await seedItems(termId, [
      { title: "ignored", meta: { kind: "entry", entryId: privateEntry.id } },
    ]);

    const menu = await getMenuByName(localCtx, "private-link");
    expect(menu?.items).toHaveLength(0);
  });

  test("mixed-kind menu: custom + entry + term resolve together in one render", async () => {
    const post = await factories.entry.create({
      type: "post",
      slug: "p",
      title: "Post",
      status: "published",
      authorId,
    });
    const tag = await factories.term.create({
      taxonomy: "category",
      slug: "t",
      name: "Tag",
    });
    const termId = await seedMenu("mixed");
    await seedItems(termId, [
      { title: "Custom", meta: { kind: "custom", url: "/c" } },
      { title: "ignored", meta: { kind: "entry", entryId: post.id } },
      { title: "ignored", meta: { kind: "term", termId: tag.id } },
    ]);

    const menu = await getMenuByName(ctx, "mixed");
    expect(menu?.items.map((i) => i.label)).toEqual(["Custom", "Post", "Tag"]);
    expect(menu?.items.map((i) => i.href)).toEqual([
      "/c",
      "/post/p",
      "/category/t",
    ]);
  });

  test("ignores entries of other types linked to the same term", async () => {
    const termId = await seedMenu("filtered");
    await seedItems(termId, [
      { title: "Real", meta: { kind: "custom", url: "/real" } },
    ]);
    // A non-menu_item entry that happens to share the term — should be
    // excluded by the type='menu_item' filter.
    const intruder = await entryFactory.transient({ db }).create({
      type: "post",
      title: "Intruder",
      slug: `intruder-${Date.now()}`,
      status: "published",
      authorId,
    });
    await entryTermFactory
      .transient({ db })
      .create({ entryId: intruder.id, termId });

    const menu = await getMenuByName(ctx, "filtered");
    expect(menu?.items.map((i) => i.label)).toEqual(["Real"]);
  });

  test("returns an empty items array for a menu with no items", async () => {
    await seedMenu("empty");
    const menu = await getMenuByName(ctx, "empty");
    expect(menu?.items).toEqual([]);
  });

  test("excludes non-published menu items (draft, trash, scheduled)", async () => {
    const termId = await seedMenu("status");
    await seedItems(termId, [
      {
        title: "Published",
        meta: { kind: "custom", url: "/p" },
        status: "published",
      },
      {
        title: "Draft",
        meta: { kind: "custom", url: "/d" },
        status: "draft",
      },
      {
        title: "Trashed",
        meta: { kind: "custom", url: "/t" },
        status: "trash",
      },
      {
        title: "Scheduled",
        meta: { kind: "custom", url: "/s" },
        status: "scheduled",
      },
    ]);

    const menu = await getMenuByName(ctx, "status");
    expect(menu?.items.map((i) => i.label)).toEqual(["Published"]);
  });
});

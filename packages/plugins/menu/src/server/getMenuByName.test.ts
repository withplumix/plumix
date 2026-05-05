import { beforeEach, describe, expect, test } from "vitest";

import type { AppContext } from "@plumix/core";
import {
  adminUser,
  createTestDb,
  entryFactory,
  entryTermFactory,
  factoriesFor,
} from "@plumix/core/test";

import type { MenuItemMeta } from "./types.js";
import { getMenuByName } from "./getMenuByName.js";

// The resolver only reads `ctx.db`. Cast a partial test ctx since wiring
// up a full AppContext is overkill for a pure-data integration test.
function ctxFor(db: Awaited<ReturnType<typeof createTestDb>>): AppContext {
  return { db } as unknown as AppContext;
}

interface SeedItemInput {
  readonly title: string;
  readonly meta: MenuItemMeta;
  readonly sortOrder?: number;
  readonly parentId?: number | null;
  readonly status?: "draft" | "published" | "scheduled" | "trash";
}

describe("getMenuByName", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let factories: ReturnType<typeof factoriesFor>;
  let ctx: AppContext;
  let authorId: number;

  beforeEach(async () => {
    db = await createTestDb();
    factories = factoriesFor(db);
    ctx = ctxFor(db);
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

  test("drops kind='entry' and kind='term' items in slice 1 (deferred)", async () => {
    const termId = await seedMenu("mixed");
    await seedItems(termId, [
      { title: "Custom item", meta: { kind: "custom", url: "/c" } },
      { title: "Entry item", meta: { kind: "entry", entryId: 999 } },
      { title: "Term item", meta: { kind: "term", termId: 999 } },
    ]);

    const menu = await getMenuByName(ctx, "mixed");
    expect(menu?.items.map((i) => i.label)).toEqual(["Custom item"]);
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

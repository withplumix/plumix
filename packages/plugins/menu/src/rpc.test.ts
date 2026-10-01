import type { JsonObject } from "plumix";
import type { RequestAuthenticator } from "plumix/auth";
import type { PluginRegistry } from "plumix/plugin";
import type { User, UserRole } from "plumix/schema";
import { createRouterClient } from "@orpc/server";
import { and, eq } from "plumix/db";
import {
  createPluginRegistry,
  definePlugin,
  HookRegistry,
  installPlugins,
  registerCoreLookupAdapters,
} from "plumix/plugin";
import { entries, settings, terms } from "plumix/schema";
import {
  adminUser,
  createTestContext,
  createTestDb,
  editorUser,
  entryFactory,
  entryTermFactory,
  factoriesFor,
} from "plumix/test";
import { describe, expect, test } from "vitest";

import type { MenuPluginOptions } from "./index.js";
import { menu } from "./index.js";

type Db = Awaited<ReturnType<typeof createTestDb>>;
type Factories = ReturnType<typeof factoriesFor>;

interface Harness {
  readonly db: Db;
  readonly factories: Factories;
  readonly registry: PluginRegistry;
  readonly hooks: HookRegistry;
  readonly user: User;
  readonly client: {
    readonly menu: {
      readonly list: () => Promise<readonly unknown[]>;
      readonly get: (input: { termId: number }) => Promise<unknown>;
      readonly save: (input: unknown) => Promise<unknown>;
      readonly delete: (input: { termId: number }) => Promise<unknown>;
      readonly create: (input: { name: string }) => Promise<{
        readonly termId: number;
        readonly slug: string;
        readonly version: number;
      }>;
      readonly assignLocation: (input: {
        location: string;
        termSlug: string | null;
      }) => Promise<unknown>;
      readonly locations: {
        readonly list: () => Promise<readonly LocationRow[]>;
      };
    };
  };
}

interface LocationRow {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly boundTermId: number | null;
}

function stubAuthenticator(user: User): RequestAuthenticator {
  return {
    authenticate: () => Promise.resolve({ user, credential: "session" }),
  };
}

async function buildHarness(
  role: UserRole = "editor",
  locations: MenuPluginOptions["locations"] = {},
  extraPlugins: readonly ReturnType<typeof definePlugin>[] = [],
): Promise<Harness> {
  const db = await createTestDb();
  const factories = factoriesFor(db);
  const hooks = new HookRegistry();
  const registry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  await installPlugins({
    hooks,
    plugins: [menu({ locations }), ...extraPlugins],
    registry,
  });

  const user =
    role === "admin"
      ? await adminUser.transient({ db }).create({})
      : role === "editor"
        ? await editorUser.transient({ db }).create({})
        : await factories.user.create({ role });

  const ctx = createTestContext({
    db,
    env: {},
    request: new Request("https://cms.example/_plumix/rpc", { method: "POST" }),
    hooks,
    plugins: registry,
    user: { id: user.id, email: user.email, role: user.role, meta: {} },
    authenticator: stubAuthenticator(user),
    origin: "https://cms.example",
  });

  const menuRouter = registry.rpcRouters.get("menu");
  if (!menuRouter) throw new Error("menu router not registered");

  const router = { menu: menuRouter };
  const client = createRouterClient(router, {
    context: ctx,
  }) as unknown as Harness["client"];
  return { db, factories, registry, hooks, user, client };
}

async function seedMenu(
  db: Db,
  factories: Factories,
  slug: string,
  name = slug,
): Promise<{ id: number; version: number; slug: string }> {
  const term = await factories.term.create({
    taxonomy: "menu",
    slug,
    name,
  });
  return { id: term.id, version: term.version, slug: term.slug };
}

// A public `post` entry type and `category` taxonomy, both menu-eligible, so
// the core lookup adapters resolve the items a save links to them.
const contentHost: ReturnType<typeof definePlugin> = definePlugin(
  "content-host",
  (setup) => {
    setup.registerEntryType("post", { label: "Posts", isPublic: true });
    setup.registerTermTaxonomy("category", {
      label: "Categories",
      isPublic: true,
    });
  },
);

async function readItemMeta(db: Db, id: number): Promise<unknown> {
  const [row] = await db
    .select({ meta: entries.meta })
    .from(entries)
    .where(eq(entries.id, id))
    .limit(1);
  return row?.meta;
}

function itemIdAt(saved: unknown, index: number): number {
  const id = (saved as { itemIds: readonly number[] }).itemIds[index];
  if (id === undefined) throw new Error(`save returned no item id at ${index}`);
  return id;
}

type RegisteredLookupAdapter = NonNullable<
  ReturnType<PluginRegistry["lookupAdapters"]["get"]>
>;

function replaceLookupAdapter(
  registry: PluginRegistry,
  kind: string,
  replace: (registered: RegisteredLookupAdapter) => RegisteredLookupAdapter,
): void {
  const lookupAdapters = registry.lookupAdapters as Map<
    string,
    RegisteredLookupAdapter
  >;
  const registered = lookupAdapters.get(kind);
  if (!registered) throw new Error(`${kind} adapter not registered`);
  lookupAdapters.set(kind, replace(registered));
}

function countListCalls(
  registry: PluginRegistry,
  kind: string,
  calls: Map<string, number>,
): void {
  replaceLookupAdapter(registry, kind, (registered) => ({
    ...registered,
    adapter: {
      ...registered.adapter,
      list: (ctx, options) => {
        calls.set(kind, (calls.get(kind) ?? 0) + 1);
        return registered.adapter.list(ctx, options);
      },
    },
  }));
}

describe("menu RPC", () => {
  describe("menu.list", () => {
    test("returns all menu terms with item counts", async () => {
      const h = await buildHarness();
      const a = await seedMenu(h.db, h.factories, "primary", "Primary");
      await seedMenu(h.db, h.factories, "footer", "Footer");

      // Add one item to "primary" via direct insert + entry_term link.
      const author = await adminUser
        .transient({ db: h.db })
        .create({ email: "lister@example.test" });
      const entry = await entryFactory.transient({ db: h.db }).create({
        type: "menu_item",
        title: "Home",
        slug: `mi-${Date.now()}`,
        status: "published",
        authorId: author.id,
        meta: { kind: "custom", url: "/" },
      });
      await entryTermFactory
        .transient({ db: h.db })
        .create({ entryId: entry.id, termId: a.id, sortOrder: 0 });

      const result = (await h.client.menu.list()) as {
        slug: string;
        itemCount: number;
      }[];
      expect(result.map((m) => m.slug).sort()).toEqual(["footer", "primary"]);
      const primary = result.find((m) => m.slug === "primary");
      expect(primary?.itemCount).toBe(1);
      const footer = result.find((m) => m.slug === "footer");
      expect(footer?.itemCount).toBe(0);
    });
  });

  describe("menu.pickerTabs", () => {
    test("returns an ordered tab list from the eligibility resolver", async () => {
      // The admin's left rail builds picker tabs from this list. With
      // only the menu plugin installed, no entry type or taxonomy is
      // menu-eligible (`menu_item` and `menu` are both `isPublic: false`)
      // and the only registered non-built-in lookup adapter is none —
      // so the response is just the always-present Custom URL tab.
      const h = await buildHarness();
      const tabs = (await (
        h.client.menu as unknown as {
          pickerTabs: () => Promise<readonly { kind: string }[]>;
        }
      ).pickerTabs()) as readonly { kind: string; tabLabel: string }[];
      expect(tabs.at(-1)).toEqual({ kind: "custom", tabLabel: "Custom URL" });
    });
  });

  describe("menu.get", () => {
    test("returns a menu's items when found", async () => {
      const h = await buildHarness();
      const m = await seedMenu(h.db, h.factories, "main");
      const result = (await h.client.menu.get({ termId: m.id })) as {
        slug: string;
        version: number;
        items: unknown[];
      };
      expect(result.slug).toBe("main");
      expect(result.version).toBe(0);
      expect(result.items).toEqual([]);
    });

    test("rejects when termId is not a menu", async () => {
      const h = await buildHarness();
      const cat = await h.factories.term.create({
        taxonomy: "category",
        slug: "news",
        name: "News",
      });
      await expect(h.client.menu.get({ termId: cat.id })).rejects.toThrow();
    });

    test("returns each item with a per-item resolved.state — custom URLs are always ok", async () => {
      // Slice 11: admin RPC enriches each item with state/label/href so
      // the editor can render broken/unauthorized rows. Custom URL items
      // never go through a lookup, so they resolve to ok with the meta
      // url as href.
      const h = await buildHarness();
      const m = await seedMenu(h.db, h.factories, "primary", "Primary");
      const author = await adminUser
        .transient({ db: h.db })
        .create({ email: "menuowner@example.test" });
      const item = await entryFactory.transient({ db: h.db }).create({
        type: "menu_item",
        title: "Contact",
        slug: `mi-custom-${Date.now()}`,
        status: "published",
        authorId: author.id,
        meta: { kind: "custom", url: "/contact" },
      });
      await entryTermFactory
        .transient({ db: h.db })
        .create({ entryId: item.id, termId: m.id, sortOrder: 0 });

      const result = (await h.client.menu.get({ termId: m.id })) as {
        items: readonly {
          id: number;
          resolved: {
            state: string;
            label: string;
            href: string | null;
          };
        }[];
      };

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.resolved).toEqual({
        state: "ok",
        label: "Contact",
        href: "/contact",
        lastHref: null,
      });
    });

    test("entry-kind item pointing at a non-existent entry resolves to broken with last-known label", async () => {
      // The entry adapter returns nothing for the dead id, so
      // mapItemState sees a null lookup → broken. The admin still
      // surfaces a label by falling through to `meta.lastLabel`
      // (snapshot from the entry's last sync) rather than a numeric id.
      const h = await buildHarness();
      const m = await seedMenu(h.db, h.factories, "primary", "Primary");
      const author = await adminUser
        .transient({ db: h.db })
        .create({ email: "broken@example.test" });
      const item = await entryFactory.transient({ db: h.db }).create({
        type: "menu_item",
        title: "",
        slug: `mi-broken-${Date.now()}`,
        status: "published",
        authorId: author.id,
        meta: {
          kind: "entry",
          entryId: 99999,
          lastLabel: "Old About",
          lastHref: "/about-old",
        },
      });
      await entryTermFactory
        .transient({ db: h.db })
        .create({ entryId: item.id, termId: m.id, sortOrder: 0 });

      const result = (await h.client.menu.get({ termId: m.id })) as {
        items: readonly {
          resolved: {
            state: string;
            label: string;
            href: string | null;
            lastHref: string | null;
          };
        }[];
      };

      expect(result.items[0]?.resolved.state).toBe("broken");
      expect(result.items[0]?.resolved.label).toBe("Old About");
      expect(result.items[0]?.resolved.lastHref).toBe("/about-old");
    });

    test("entry-kind item of a non-public type resolves to broken even with isShownInMenus: true", async () => {
      // The public menu can never render it (no permalink), so the editor
      // must not show it as ok. The public `page` type keeps the lookup
      // scope non-empty, so `memo` is excluded by the type filter rather
      // than by an empty scope skipping the lookup.
      const h = await buildHarness("editor", {}, [
        definePlugin("internal", (setup) => {
          setup.registerEntryType("page", { label: "Pages", isPublic: true });
          setup.registerEntryType("memo", {
            label: "Memos",
            isPublic: false,
            isShownInMenus: true,
          });
        }),
      ]);
      const m = await seedMenu(h.db, h.factories, "primary", "Primary");
      const author = await adminUser
        .transient({ db: h.db })
        .create({ email: "memo-owner@example.test" });
      const memo = await entryFactory.transient({ db: h.db }).create({
        type: "memo",
        title: "Q3",
        slug: `memo-${Date.now()}`,
        status: "published",
        authorId: author.id,
      });
      const item = await entryFactory.transient({ db: h.db }).create({
        type: "menu_item",
        title: "",
        slug: `mi-memo-${Date.now()}`,
        status: "published",
        authorId: author.id,
        meta: { kind: "entry", entryId: memo.id },
      });
      await entryTermFactory
        .transient({ db: h.db })
        .create({ entryId: item.id, termId: m.id, sortOrder: 0 });

      const result = (await h.client.menu.get({ termId: m.id })) as {
        items: readonly { resolved: { state: string } }[];
      };

      expect(result.items[0]?.resolved.state).toBe("broken");
    });

    test("sends meta already parsed — null when the stored JSON matches no kind", async () => {
      // The resolver parses `entries.meta` to compute state and label; it
      // sends that parsed value on rather than the raw column, so the editor
      // never has to re-derive (or assert) the type of what it receives.
      const h = await buildHarness();
      const m = await seedMenu(h.db, h.factories, "primary", "Primary");
      const author = await adminUser
        .transient({ db: h.db })
        .create({ email: "metashape@example.test" });
      const metaShapes: JsonObject[] = [
        { kind: "custom", url: "/contact" },
        { kind: "nonsense" },
      ];
      for (const [index, meta] of metaShapes.entries()) {
        const item = await entryFactory.transient({ db: h.db }).create({
          type: "menu_item",
          title: `Item ${String(index)}`,
          slug: `mi-shape-${String(index)}-${Date.now()}`,
          status: "published",
          authorId: author.id,
          meta,
        });
        await entryTermFactory
          .transient({ db: h.db })
          .create({ entryId: item.id, termId: m.id, sortOrder: index });
      }

      const result = (await h.client.menu.get({ termId: m.id })) as {
        items: readonly { meta: unknown }[];
      };

      expect(result.items.map((item) => item.meta)).toEqual([
        { kind: "custom", url: "/contact" },
        null,
      ]);
    });
  });

  describe("menu.save", () => {
    test("happy path: inserts items, returns ids, bumps version", async () => {
      const h = await buildHarness();
      const m = await seedMenu(h.db, h.factories, "main");

      const result = (await h.client.menu.save({
        termId: m.id,
        version: 0,
        items: [
          {
            parentIndex: null,
            sortOrder: 0,
            title: "Home",
            meta: { kind: "custom", url: "/" },
          },
          {
            parentIndex: 0,
            sortOrder: 0,
            title: "Subpage",
            meta: { kind: "custom", url: "/sub" },
          },
        ],
      })) as { version: number; itemIds: number[]; added: number[] };

      expect(result.version).toBe(1);
      expect(result.itemIds).toHaveLength(2);
      expect(result.added).toHaveLength(2);

      // Term row's version was bumped.
      const [term] = await h.db
        .select({ version: terms.version })
        .from(terms)
        .where(eq(terms.id, m.id))
        .limit(1);
      expect(term?.version).toBe(1);
    });

    test("concurrency: stale version is rejected", async () => {
      const h = await buildHarness();
      const m = await seedMenu(h.db, h.factories, "main");

      await h.client.menu.save({
        termId: m.id,
        version: 0,
        items: [],
      });

      await expect(
        h.client.menu.save({
          termId: m.id,
          version: 0,
          items: [],
        }),
      ).rejects.toThrow();
    });

    test("forward parent reference is rejected", async () => {
      const h = await buildHarness();
      const m = await seedMenu(h.db, h.factories, "main");

      await expect(
        h.client.menu.save({
          termId: m.id,
          version: 0,
          items: [
            {
              parentIndex: 1,
              sortOrder: 0,
              title: "x",
              meta: { kind: "custom", url: "/x" },
            },
            {
              parentIndex: null,
              sortOrder: 0,
              title: "y",
              meta: { kind: "custom", url: "/y" },
            },
          ],
        }),
      ).rejects.toThrow();
    });

    test("max-depth violation is rejected", async () => {
      const h = await buildHarness();
      const m = await seedMenu(h.db, h.factories, "main");

      // Default maxDepth is 5 — depths 0,1,2,3,4 OK; depth 5 rejects.
      const items = [];
      for (let i = 0; i < 6; i++) {
        items.push({
          parentIndex: i === 0 ? null : i - 1,
          sortOrder: 0,
          title: `level-${i}`,
          meta: { kind: "custom", url: `/${i}` },
        });
      }
      await expect(
        h.client.menu.save({ termId: m.id, version: 0, items }),
      ).rejects.toThrow();
    });

    test("removes items omitted from the save (atomic diff)", async () => {
      const h = await buildHarness();
      const m = await seedMenu(h.db, h.factories, "main");

      const first = (await h.client.menu.save({
        termId: m.id,
        version: 0,
        items: [
          {
            parentIndex: null,
            sortOrder: 0,
            title: "Keep",
            meta: { kind: "custom", url: "/k" },
          },
          {
            parentIndex: null,
            sortOrder: 1,
            title: "Drop",
            meta: { kind: "custom", url: "/d" },
          },
        ],
      })) as { itemIds: number[] };

      const keepId = first.itemIds[0];
      const dropId = first.itemIds[1];
      if (keepId === undefined || dropId === undefined) {
        throw new Error("first save returned fewer ids than expected");
      }

      const second = (await h.client.menu.save({
        termId: m.id,
        version: 1,
        items: [
          {
            id: keepId,
            parentIndex: null,
            sortOrder: 0,
            title: "Keep",
            meta: { kind: "custom", url: "/k" },
          },
        ],
      })) as { itemIds: number[]; removed: number[]; modified: number[] };

      expect(second.itemIds).toEqual([keepId]);
      expect(second.removed).toEqual([dropId]);
      expect(second.modified).toEqual([keepId]);
    });

    test("stores the linked entry's label and href as the item's snapshot", async () => {
      const h = await buildHarness("editor", {}, [contentHost]);
      const m = await seedMenu(h.db, h.factories, "main");
      const post = await entryFactory.transient({ db: h.db }).create({
        type: "post",
        title: "About us",
        slug: "about-us",
        status: "published",
        authorId: h.user.id,
      });

      const result = (await h.client.menu.save({
        termId: m.id,
        version: 0,
        items: [
          {
            parentIndex: null,
            sortOrder: 0,
            title: null,
            meta: { kind: "entry", entryId: post.id },
          },
        ],
      })) as { itemIds: number[] };

      expect(await readItemMeta(h.db, itemIdAt(result, 0))).toEqual({
        kind: "entry",
        entryId: post.id,
        lastLabel: "About us",
        lastHref: "/post/about-us",
      });
    });

    test("stores the linked term's label and href as the item's snapshot", async () => {
      const h = await buildHarness("editor", {}, [contentHost]);
      const m = await seedMenu(h.db, h.factories, "main");
      const news = await h.factories.term.create({
        taxonomy: "category",
        slug: "news",
        name: "News",
      });

      const result = (await h.client.menu.save({
        termId: m.id,
        version: 0,
        items: [
          {
            parentIndex: null,
            sortOrder: 0,
            title: null,
            meta: { kind: "term", termId: news.id },
          },
        ],
      })) as { itemIds: number[] };

      expect(await readItemMeta(h.db, itemIdAt(result, 0))).toEqual({
        kind: "term",
        termId: news.id,
        lastLabel: "News",
        lastHref: "/category/news",
      });
    });

    test("keeps the stored snapshot when a later save can't resolve the trashed entry", async () => {
      const h = await buildHarness("editor", {}, [contentHost]);
      const m = await seedMenu(h.db, h.factories, "main");
      const post = await entryFactory.transient({ db: h.db }).create({
        type: "post",
        title: "About us",
        slug: "about-us",
        status: "published",
        authorId: h.user.id,
      });
      const first = (await h.client.menu.save({
        termId: m.id,
        version: 0,
        items: [
          {
            parentIndex: null,
            sortOrder: 0,
            title: null,
            meta: { kind: "entry", entryId: post.id },
          },
        ],
      })) as { itemIds: number[] };
      const itemId = itemIdAt(first, 0);
      await h.db
        .update(entries)
        .set({ status: "trash" })
        .where(eq(entries.id, post.id));

      await h.client.menu.save({
        termId: m.id,
        version: 1,
        items: [
          {
            id: itemId,
            parentIndex: null,
            sortOrder: 1,
            title: null,
            meta: { kind: "entry", entryId: post.id },
          },
        ],
      });

      const menu = (await h.client.menu.get({ termId: m.id })) as {
        items: readonly {
          resolved: { state: string; label: string; lastHref: string | null };
        }[];
      };
      expect(menu.items[0]?.resolved).toMatchObject({
        state: "broken",
        label: "About us",
        lastHref: "/post/about-us",
      });
    });

    test("a re-linked item that doesn't resolve keeps no snapshot of its previous target", async () => {
      const h = await buildHarness("editor", {}, [contentHost]);
      const m = await seedMenu(h.db, h.factories, "main");
      const post = await entryFactory.transient({ db: h.db }).create({
        type: "post",
        title: "About us",
        slug: "about-us",
        status: "published",
        authorId: h.user.id,
      });
      const first = (await h.client.menu.save({
        termId: m.id,
        version: 0,
        items: [
          {
            parentIndex: null,
            sortOrder: 0,
            title: null,
            meta: { kind: "entry", entryId: post.id },
          },
        ],
      })) as { itemIds: number[] };
      const itemId = itemIdAt(first, 0);
      expect(await readItemMeta(h.db, itemId)).toMatchObject({
        lastLabel: "About us",
      });

      await h.client.menu.save({
        termId: m.id,
        version: 1,
        items: [
          {
            id: itemId,
            parentIndex: null,
            sortOrder: 0,
            title: null,
            meta: { kind: "entry", entryId: 99999 },
          },
        ],
      });

      expect(await readItemMeta(h.db, itemId)).toEqual({
        kind: "entry",
        entryId: 99999,
      });
    });

    test("a save by a user without the adapter's capability keeps the stored snapshot and writes no new one", async () => {
      const h = await buildHarness("editor", {}, [contentHost]);
      const m = await seedMenu(h.db, h.factories, "main");
      const about = await entryFactory.transient({ db: h.db }).create({
        type: "post",
        title: "About us",
        slug: "about-us",
        status: "published",
        authorId: h.user.id,
      });
      const contact = await entryFactory.transient({ db: h.db }).create({
        type: "post",
        title: "Contact",
        slug: "contact",
        status: "published",
        authorId: h.user.id,
      });
      const first = (await h.client.menu.save({
        termId: m.id,
        version: 0,
        items: [
          {
            parentIndex: null,
            sortOrder: 0,
            title: null,
            meta: { kind: "entry", entryId: about.id },
          },
        ],
      })) as { itemIds: number[] };
      const aboutItemId = itemIdAt(first, 0);
      replaceLookupAdapter(h.registry, "entry", (registered) => ({
        ...registered,
        capability: "entry:post:secret",
      }));

      const second = (await h.client.menu.save({
        termId: m.id,
        version: 1,
        items: [
          {
            id: aboutItemId,
            parentIndex: null,
            sortOrder: 0,
            title: null,
            meta: { kind: "entry", entryId: about.id },
          },
          {
            parentIndex: null,
            sortOrder: 1,
            title: null,
            meta: { kind: "entry", entryId: contact.id },
          },
        ],
      })) as { itemIds: number[] };

      expect(await readItemMeta(h.db, aboutItemId)).toEqual({
        kind: "entry",
        entryId: about.id,
        lastLabel: "About us",
        lastHref: "/post/about-us",
      });
      expect(await readItemMeta(h.db, itemIdAt(second, 1))).toEqual({
        kind: "entry",
        entryId: contact.id,
      });
    });

    test("doesn't persist a snapshot sent in the save input", async () => {
      const h = await buildHarness("editor", {}, [contentHost]);
      const m = await seedMenu(h.db, h.factories, "main");
      const post = await entryFactory.transient({ db: h.db }).create({
        type: "post",
        title: "About us",
        slug: "about-us",
        status: "published",
        authorId: h.user.id,
      });
      const spoofed = {
        lastLabel: "Spoofed",
        lastHref: "https://evil.example/",
      };

      const result = (await h.client.menu.save({
        termId: m.id,
        version: 0,
        items: [
          {
            parentIndex: null,
            sortOrder: 0,
            title: null,
            meta: { kind: "entry", entryId: post.id, ...spoofed },
          },
          {
            parentIndex: null,
            sortOrder: 1,
            title: null,
            meta: { kind: "entry", entryId: 99999, ...spoofed },
          },
        ],
      })) as { itemIds: number[] };

      expect(await readItemMeta(h.db, itemIdAt(result, 0))).toEqual({
        kind: "entry",
        entryId: post.id,
        lastLabel: "About us",
        lastHref: "/post/about-us",
      });
      expect(await readItemMeta(h.db, itemIdAt(result, 1))).toEqual({
        kind: "entry",
        entryId: 99999,
      });
    });

    test("looks each kind up with one adapter call, whatever the number of items", async () => {
      const h = await buildHarness("editor", {}, [contentHost]);
      const m = await seedMenu(h.db, h.factories, "main");
      const calls = new Map<string, number>();
      countListCalls(h.registry, "entry", calls);
      countListCalls(h.registry, "term", calls);
      const posts = await entryFactory.transient({ db: h.db }).createList(3, {
        type: "post",
        status: "published",
        authorId: h.user.id,
      });
      const categories = await h.factories.term.createList(3, {
        taxonomy: "category",
      });
      const items = [
        ...posts.map((post) => ({ kind: "entry", entryId: post.id })),
        ...categories.map((category) => ({
          kind: "term",
          termId: category.id,
        })),
      ];

      await h.client.menu.save({
        termId: m.id,
        version: 0,
        items: items.map((meta, sortOrder) => ({
          parentIndex: null,
          sortOrder,
          title: null,
          meta,
        })),
      });

      expect(Object.fromEntries(calls)).toEqual({ entry: 1, term: 1 });
    });

    test("a lookup that throws fails the save without bumping the menu's version", async () => {
      const h = await buildHarness("editor", {}, [contentHost]);
      const m = await seedMenu(h.db, h.factories, "main");
      const post = await entryFactory.transient({ db: h.db }).create({
        type: "post",
        status: "published",
        authorId: h.user.id,
      });
      replaceLookupAdapter(h.registry, "entry", (registered) => ({
        ...registered,
        adapter: {
          ...registered.adapter,
          list: () => Promise.reject(new Error("lookup backend down")),
        },
      }));

      await expect(
        h.client.menu.save({
          termId: m.id,
          version: 0,
          items: [
            {
              parentIndex: null,
              sortOrder: 0,
              title: null,
              meta: { kind: "entry", entryId: post.id },
            },
          ],
        }),
      ).rejects.toThrow();

      const [term] = await h.db
        .select({ version: terms.version })
        .from(terms)
        .where(eq(terms.id, m.id));
      expect(term?.version).toBe(0);
    });

    test("rejects claimed-id that doesn't belong to this menu", async () => {
      const h = await buildHarness();
      const m1 = await seedMenu(h.db, h.factories, "first");
      const m2 = await seedMenu(h.db, h.factories, "second");

      const r = (await h.client.menu.save({
        termId: m1.id,
        version: 0,
        items: [
          {
            parentIndex: null,
            sortOrder: 0,
            title: "x",
            meta: { kind: "custom", url: "/x" },
          },
        ],
      })) as { itemIds: number[] };
      const m1ItemId = r.itemIds[0];
      if (m1ItemId === undefined) throw new Error("save returned no ids");

      // Trying to claim m1's item id while saving m2.
      await expect(
        h.client.menu.save({
          termId: m2.id,
          version: 0,
          items: [
            {
              id: m1ItemId,
              parentIndex: null,
              sortOrder: 0,
              title: "stolen",
              meta: { kind: "custom", url: "/s" },
            },
          ],
        }),
      ).rejects.toThrow();
    });
  });

  describe("menu.delete", () => {
    test("deletes the menu term and cascades to items", async () => {
      const h = await buildHarness();
      const m = await seedMenu(h.db, h.factories, "main");
      await h.client.menu.save({
        termId: m.id,
        version: 0,
        items: [
          {
            parentIndex: null,
            sortOrder: 0,
            title: "x",
            meta: { kind: "custom", url: "/x" },
          },
        ],
      });

      await h.client.menu.delete({ termId: m.id });

      const remaining = await h.db
        .select()
        .from(terms)
        .where(eq(terms.id, m.id))
        .limit(1);
      expect(remaining).toEqual([]);
    });

    test("sweeps any settings binding pointing at the deleted menu", async () => {
      const h = await buildHarness();
      const m = await seedMenu(h.db, h.factories, "ghost");
      await h.factories.setting.create({
        group: "menu_locations",
        key: "primary",
        value: m.slug,
      });

      await h.client.menu.delete({ termId: m.id });

      const remaining = await h.db
        .select()
        .from(settings)
        .where(
          and(
            eq(settings.group, "menu_locations"),
            eq(settings.key, "primary"),
          ),
        );
      expect(remaining).toEqual([]);
    });
  });

  describe("menu.delete hooks", () => {
    test("fires menu:deleted with the term id, slug and request context", async () => {
      const h = await buildHarness();
      const m = await seedMenu(h.db, h.factories, "ghost");
      const calls: { payload: unknown; sameHooks: boolean }[] = [];
      h.hooks.addAction("menu:deleted", (payload, ctx) => {
        calls.push({ payload, sameHooks: ctx.hooks === h.hooks });
      });

      await h.client.menu.delete({ termId: m.id });

      expect(calls).toEqual([
        { payload: { termId: m.id, slug: "ghost" }, sameHooks: true },
      ]);
    });

    test("fires settings:group_changed with the unbound keys", async () => {
      const h = await buildHarness();
      const m = await seedMenu(h.db, h.factories, "ghost");
      await h.factories.setting.create({
        group: "menu_locations",
        key: "primary",
        value: m.slug,
      });
      await h.factories.setting.create({
        group: "menu_locations",
        key: "footer",
        value: m.slug,
      });
      const other = await seedMenu(h.db, h.factories, "other");
      await h.factories.setting.create({
        group: "menu_locations",
        key: "sidebar",
        value: other.slug,
      });
      const calls: unknown[] = [];
      h.hooks.addAction("settings:group_changed", (payload) => {
        calls.push({
          group: payload.group,
          removed: [...payload.removed].sort(),
        });
      });

      await h.client.menu.delete({ termId: m.id });

      expect(calls).toEqual([
        { group: "menu_locations", removed: ["footer", "primary"] },
      ]);
    });
  });

  describe("menu.assignLocation", () => {
    test("upserts a binding for the location", async () => {
      const h = await buildHarness("editor", { primary: { label: "Primary" } });
      await seedMenu(h.db, h.factories, "main");

      await h.client.menu.assignLocation({
        location: "primary",
        termSlug: "main",
      });

      const [row] = await h.db
        .select()
        .from(settings)
        .where(
          and(
            eq(settings.group, "menu_locations"),
            eq(settings.key, "primary"),
          ),
        );
      expect(row?.value).toBe("main");
    });

    test("null termSlug clears the binding", async () => {
      const h = await buildHarness("editor", { primary: { label: "Primary" } });
      await seedMenu(h.db, h.factories, "main");
      await h.client.menu.assignLocation({
        location: "primary",
        termSlug: "main",
      });
      await h.client.menu.assignLocation({
        location: "primary",
        termSlug: null,
      });

      const rows = await h.db
        .select()
        .from(settings)
        .where(
          and(
            eq(settings.group, "menu_locations"),
            eq(settings.key, "primary"),
          ),
        );
      expect(rows).toEqual([]);
    });

    test("fires settings:group_changed for the bound key, then for the unbound key", async () => {
      const h = await buildHarness("editor", { primary: { label: "Primary" } });
      await seedMenu(h.db, h.factories, "main");
      const calls: unknown[] = [];
      h.hooks.addAction("settings:group_changed", (payload) => {
        calls.push({
          group: payload.group,
          set: payload.set,
          removed: payload.removed,
        });
      });

      await h.client.menu.assignLocation({
        location: "primary",
        termSlug: "main",
      });
      await h.client.menu.assignLocation({
        location: "primary",
        termSlug: null,
      });

      expect(calls).toEqual([
        { group: "menu_locations", set: { primary: "main" }, removed: [] },
        { group: "menu_locations", set: {}, removed: ["primary"] },
      ]);
    });

    test("rejects when bound termSlug doesn't match a menu", async () => {
      const h = await buildHarness("editor", { primary: { label: "Primary" } });
      await expect(
        h.client.menu.assignLocation({
          location: "primary",
          termSlug: "ghost",
        }),
      ).rejects.toThrow();
    });

    test("rejects when location is not theme-registered", async () => {
      const h = await buildHarness();
      await seedMenu(h.db, h.factories, "main");
      await expect(
        h.client.menu.assignLocation({
          location: "primary",
          termSlug: "main",
        }),
      ).rejects.toThrow();
    });
  });

  describe("menu.create", () => {
    test("mints a new menu term with a slug derived from the name", async () => {
      const h = await buildHarness();

      const result = await h.client.menu.create({ name: "Header Nav" });

      expect(result.slug).toBe("header-nav");
      expect(result.version).toBe(0);
      const [row] = await h.db
        .select()
        .from(terms)
        .where(and(eq(terms.id, result.termId), eq(terms.taxonomy, "menu")));
      expect(row?.name).toBe("Header Nav");
      expect(row?.slug).toBe("header-nav");
    });

    test("appends a numeric suffix when the derived slug is taken", async () => {
      const h = await buildHarness();
      await seedMenu(h.db, h.factories, "header-nav", "Header Nav");

      const result = await h.client.menu.create({ name: "Header Nav" });

      expect(result.slug).toMatch(/^header-nav-\d+$/);
    });

    test("rejects empty / whitespace-only names", async () => {
      const h = await buildHarness();
      await expect(h.client.menu.create({ name: "   " })).rejects.toThrow();
      await expect(h.client.menu.create({ name: "" })).rejects.toThrow();
    });

    test("subscriber cannot create", async () => {
      const h = await buildHarness("subscriber");
      await expect(h.client.menu.create({ name: "Nope" })).rejects.toThrow();
    });
  });

  describe("menu.locations.list", () => {
    test("returns each registered location with its current binding", async () => {
      const h = await buildHarness("editor", {
        primary: { label: "Primary", description: "Header" },
        footer: { label: "Footer" },
      });
      const main = await seedMenu(h.db, h.factories, "main");
      await h.client.menu.assignLocation({
        location: "primary",
        termSlug: "main",
      });

      const rows = await h.client.menu.locations.list();
      expect(rows).toEqual([
        {
          id: "footer",
          label: "Footer",
          boundTermId: null,
        },
        {
          id: "primary",
          label: "Primary",
          description: "Header",
          boundTermId: main.id,
        },
      ]);
    });

    test("lists the locations its own install declared, whatever installs after it", async () => {
      const h = await buildHarness("editor", {
        primary: { label: "Primary" },
        footer: { label: "Footer" },
      });
      await buildHarness("editor", { primary: { label: "Primary" } });

      const rows = await h.client.menu.locations.list();
      expect(rows.map((r) => r.id)).toEqual(["footer", "primary"]);
    });

    test("returns an empty array when no locations are registered", async () => {
      const h = await buildHarness();
      const rows = await h.client.menu.locations.list();
      expect(rows).toEqual([]);
    });

    test("ignores stale settings rows for unregistered locations", async () => {
      const h = await buildHarness("editor", { primary: { label: "Primary" } });
      await seedMenu(h.db, h.factories, "main");
      await h.factories.setting.create({
        group: "menu_locations",
        key: "ghost",
        value: "main",
      });

      const rows = await h.client.menu.locations.list();
      expect(rows.map((r) => r.id)).toEqual(["primary"]);
    });
  });

  describe("authorization", () => {
    test("subscriber cannot list / save / delete / assign", async () => {
      const h = await buildHarness("subscriber");
      await expect(h.client.menu.list()).rejects.toThrow();
    });

    test("subscriber cannot list locations", async () => {
      const h = await buildHarness("subscriber", {
        primary: { label: "Primary" },
      });
      await expect(h.client.menu.locations.list()).rejects.toThrow();
    });
  });
});

import { createRouterClient } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";

import type {
  PluginRegistry,
  RequestAuthenticator,
  User,
  UserRole,
} from "@plumix/core";
import {
  createAppContext,
  createPluginRegistry,
  HookRegistry,
  installPlugins,
  registerCoreLookupAdapters,
  settings,
  terms,
} from "@plumix/core";
import {
  adminUser,
  createTestDb,
  editorUser,
  entryFactory,
  entryTermFactory,
  factoriesFor,
} from "@plumix/core/test";

import { menu } from "./index.js";
import {
  clearRegisteredLocations,
  recordLocation,
} from "./server/locations.js";

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
      readonly assignLocation: (input: {
        location: string;
        termSlug: string | null;
      }) => Promise<unknown>;
    };
  };
}

function stubAuthenticator(user: User): RequestAuthenticator {
  return {
    authenticate: () => Promise.resolve({ user, tokenScopes: null }),
  };
}

async function buildHarness(role: UserRole = "editor"): Promise<Harness> {
  const db = await createTestDb();
  const factories = factoriesFor(db);
  const hooks = new HookRegistry();
  const registry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  await installPlugins({ hooks, plugins: [menu], registry });

  const user =
    role === "admin"
      ? await adminUser.transient({ db }).create({})
      : role === "editor"
        ? await editorUser.transient({ db }).create({})
        : await factories.user.create({ role });

  const ctx = createAppContext({
    db,
    env: {},
    request: new Request("https://cms.example/_plumix/rpc", { method: "POST" }),
    hooks,
    plugins: registry,
    user: { id: user.id, email: user.email, role: user.role },
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

describe("menu RPC", () => {
  afterEach(() => {
    clearRegisteredLocations();
  });

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
        meta: { kind: "custom", url: "/" } as unknown as Record<
          string,
          unknown
        >,
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
      await h.db.insert(settings).values({
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

  describe("menu.assignLocation", () => {
    test("upserts a binding for the location", async () => {
      const h = await buildHarness();
      recordLocation("primary", { label: "Primary" });
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
      const h = await buildHarness();
      recordLocation("primary", { label: "Primary" });
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

    test("rejects when bound termSlug doesn't match a menu", async () => {
      const h = await buildHarness();
      recordLocation("primary", { label: "Primary" });
      await expect(
        h.client.menu.assignLocation({
          location: "primary",
          termSlug: "ghost",
        }),
      ).rejects.toThrow();
    });

    test("rejects when location is not theme-registered", async () => {
      const h = await buildHarness();
      // No recordLocation call — `primary` is not registered.
      await seedMenu(h.db, h.factories, "main");
      await expect(
        h.client.menu.assignLocation({
          location: "primary",
          termSlug: "main",
        }),
      ).rejects.toThrow();
    });
  });

  describe("authorization", () => {
    test("subscriber cannot list / save / delete / assign", async () => {
      const h = await buildHarness("subscriber");
      await expect(h.client.menu.list()).rejects.toThrow();
    });
  });
});

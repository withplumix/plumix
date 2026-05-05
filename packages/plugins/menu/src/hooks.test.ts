import { createRouterClient } from "@orpc/server";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type {
  AppContext,
  PluginRegistry,
  RequestAuthenticator,
  User,
} from "@plumix/core";
import {
  createAppContext,
  createPluginRegistry,
  HookRegistry,
  installPlugins,
  registerCoreLookupAdapters,
  settings,
} from "@plumix/core";
import {
  adminUser,
  createTestDb,
  entryFactory,
  entryTermFactory,
  factoriesFor,
} from "@plumix/core/test";

import type { ResolvedMenuItem } from "./server/types.js";
import { menu } from "./index.js";
import { getMenuByName } from "./server/getMenuByName.js";
import { getMenuForLocation } from "./server/getMenuForLocation.js";
import {
  clearRegisteredLocations,
  recordLocation,
} from "./server/locations.js";

type Db = Awaited<ReturnType<typeof createTestDb>>;
type Factories = ReturnType<typeof factoriesFor>;

interface Bundle {
  readonly db: Db;
  readonly factories: Factories;
  readonly registry: PluginRegistry;
  readonly hooks: HookRegistry;
  readonly ctx: AppContext;
  readonly user: User;
}

function stubAuthenticator(user: User): RequestAuthenticator {
  return {
    authenticate: () => Promise.resolve({ user, tokenScopes: null }),
  };
}

async function setup(): Promise<Bundle> {
  const db = await createTestDb();
  const factories = factoriesFor(db);
  const hooks = new HookRegistry();
  const registry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  await installPlugins({ hooks, plugins: [menu], registry });
  const user = await adminUser
    .transient({ db })
    .create({ email: "hooks@example.test" });
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
  return { db, factories, registry, hooks, ctx, user };
}

async function seedMenuTerm(b: Bundle, slug: string): Promise<number> {
  const term = await b.factories.term.create({
    taxonomy: "menu",
    slug,
    name: slug,
  });
  return term.id;
}

interface SaveClient {
  readonly save: (input: unknown) => Promise<{
    readonly itemIds: readonly number[];
    readonly version: number;
  }>;
}

function saveClientFor(b: Bundle): SaveClient {
  const menuRouter = b.registry.rpcRouters.get("menu");
  if (!menuRouter) throw new Error("menu router not registered");
  const client = createRouterClient(
    { menu: menuRouter },
    { context: b.ctx },
  ) as unknown as { readonly menu: SaveClient };
  return client.menu;
}

async function seedItem(
  b: Bundle,
  termId: number,
  title: string,
  url: string,
): Promise<number> {
  const entry = await entryFactory.transient({ db: b.db }).create({
    type: "menu_item",
    title,
    slug: `mi-${termId}-${title}-${Date.now()}-${Math.random()}`,
    status: "published",
    authorId: b.user.id,
    sortOrder: 0,
    meta: { kind: "custom", url } as unknown as Record<string, unknown>,
  });
  await entryTermFactory
    .transient({ db: b.db })
    .create({ entryId: entry.id, termId, sortOrder: 0 });
  return entry.id;
}

describe("menu hook surface", () => {
  let b: Bundle;

  beforeEach(async () => {
    b = await setup();
  });

  afterEach(() => {
    clearRegisteredLocations();
  });

  describe("menu:item filter", () => {
    test("fires per resolved item with the resolved shape", async () => {
      const termId = await seedMenuTerm(b, "primary");
      await seedItem(b, termId, "Home", "/");
      await seedItem(b, termId, "About", "/about");

      const seen: ResolvedMenuItem[] = [];
      b.hooks.addFilter("menu:item", (item) => {
        seen.push(item);
        return item;
      });

      await getMenuByName(b.ctx, "primary");
      expect(seen.map((item) => item.label).sort()).toEqual(["About", "Home"]);
    });

    test("transforms each item — mutations land in render output", async () => {
      const termId = await seedMenuTerm(b, "primary");
      await seedItem(b, termId, "Home", "/");

      b.hooks.addFilter("menu:item", (item) => ({
        ...item,
        cssClasses: [...item.cssClasses, "decorated"],
      }));

      const result = await getMenuByName(b.ctx, "primary");
      expect(result?.items[0]?.cssClasses).toContain("decorated");
    });

    test("subscribers see already-resolved children", async () => {
      const termId = await seedMenuTerm(b, "primary");
      const parent = await entryFactory.transient({ db: b.db }).create({
        type: "menu_item",
        title: "Parent",
        slug: `mi-p-${Date.now()}`,
        status: "published",
        authorId: b.user.id,
        sortOrder: 0,
        meta: { kind: "custom", url: "/p" } as unknown as Record<
          string,
          unknown
        >,
      });
      await entryTermFactory
        .transient({ db: b.db })
        .create({ entryId: parent.id, termId, sortOrder: 0 });
      const child = await entryFactory.transient({ db: b.db }).create({
        type: "menu_item",
        title: "Child",
        slug: `mi-c-${Date.now()}`,
        status: "published",
        authorId: b.user.id,
        parentId: parent.id,
        sortOrder: 0,
        meta: { kind: "custom", url: "/p/c" } as unknown as Record<
          string,
          unknown
        >,
      });
      await entryTermFactory
        .transient({ db: b.db })
        .create({ entryId: child.id, termId, sortOrder: 0 });

      b.hooks.addFilter("menu:item", (item) => ({
        ...item,
        cssClasses: [...item.cssClasses, `seen-${item.children.length}`],
      }));

      const result = await getMenuByName(b.ctx, "primary");
      // Parent is filtered AFTER children — sees one child.
      expect(result?.items[0]?.cssClasses).toContain("seen-1");
      // Child is filtered first — sees zero children.
      expect(result?.items[0]?.children[0]?.cssClasses).toContain("seen-0");
    });
  });

  describe("menu:tree filter", () => {
    test("fires once after assembly with location and termId", async () => {
      const termId = await seedMenuTerm(b, "primary");
      await seedItem(b, termId, "Home", "/");

      const calls: { termId: number; location: string | null; len: number }[] =
        [];
      b.hooks.addFilter("menu:tree", (items, ctx) => {
        calls.push({
          termId: ctx.termId,
          location: ctx.location,
          len: items.length,
        });
        return items;
      });

      await getMenuByName(b.ctx, "primary");
      expect(calls).toEqual([{ termId, location: null, len: 1 }]);
    });

    test("transforms full tree — pruning lands in render output", async () => {
      const termId = await seedMenuTerm(b, "primary");
      await seedItem(b, termId, "Public", "/");
      await seedItem(b, termId, "Hidden", "/secret");

      b.hooks.addFilter("menu:tree", (items) =>
        items.filter((item) => item.label !== "Hidden"),
      );

      const result = await getMenuByName(b.ctx, "primary");
      expect(result?.items.map((item) => item.label)).toEqual(["Public"]);
    });

    test("location is populated when called via getMenuForLocation", async () => {
      recordLocation("primary", { label: "Primary" });
      const termId = await seedMenuTerm(b, "primary");
      await seedItem(b, termId, "Home", "/");
      await b.db.insert(settings).values({
        group: "menu_locations",
        key: "primary",
        value: "primary",
      });

      const seen: { location: string | null; termId: number }[] = [];
      b.hooks.addFilter("menu:tree", (items, ctx) => {
        seen.push({ location: ctx.location, termId: ctx.termId });
        return items;
      });

      await getMenuForLocation(b.ctx, "primary");
      expect(seen).toEqual([{ location: "primary", termId }]);
    });
  });

  describe("menu:saved action", () => {
    test("fires after save with addedIds / removedIds / modifiedIds", async () => {
      const termId = await seedMenuTerm(b, "primary");

      const calls: {
        termId: number;
        addedIds: readonly number[];
        removedIds: readonly number[];
        modifiedIds: readonly number[];
      }[] = [];
      b.hooks.addAction("menu:saved", (payload) => {
        calls.push({
          termId: payload.termId,
          addedIds: payload.addedIds,
          removedIds: payload.removedIds,
          modifiedIds: payload.modifiedIds,
        });
      });

      const result = await saveClientFor(b).save({
        termId,
        version: 0,
        items: [
          {
            parentIndex: null,
            sortOrder: 0,
            title: "Home",
            meta: { kind: "custom", url: "/" },
          },
        ],
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]?.termId).toBe(termId);
      expect(calls[0]?.addedIds).toEqual(result.itemIds);
      expect(calls[0]?.removedIds).toEqual([]);
      expect(calls[0]?.modifiedIds).toEqual([]);
    });

    test("subscriber failure does not abort the commit", async () => {
      const termId = await seedMenuTerm(b, "primary");

      b.hooks.addAction("menu:saved", () => {
        throw new Error("subscriber blew up");
      });

      const result = await saveClientFor(b).save({
        termId,
        version: 0,
        items: [],
      });
      expect(result.version).toBe(1);
    });
  });
});

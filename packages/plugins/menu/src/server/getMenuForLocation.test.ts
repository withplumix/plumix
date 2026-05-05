import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { AppContext, PluginRegistry, ThemeDescriptor } from "@plumix/core";
import {
  auth,
  buildApp,
  createPluginRegistry,
  defineTheme,
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

import { menu } from "../index.js";
import { getMenuForLocation } from "./getMenuForLocation.js";
import { clearRegisteredLocations } from "./locations.js";

function testAuth() {
  return auth({
    passkey: {
      rpName: "Test",
      rpId: "localhost",
      origin: "http://localhost",
    },
  });
}

async function buildTestRegistry(): Promise<PluginRegistry> {
  const hooks = new HookRegistry();
  const registry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  await installPlugins({ hooks, plugins: [menu], registry });
  return registry;
}

function ctxFor(
  db: Awaited<ReturnType<typeof createTestDb>>,
  registry: PluginRegistry,
): AppContext {
  return { db, plugins: registry } as unknown as AppContext;
}

describe("getMenuForLocation", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let factories: ReturnType<typeof factoriesFor>;
  let ctx: AppContext;
  let authorId: number;

  beforeEach(async () => {
    db = await createTestDb();
    factories = factoriesFor(db);
    const registry = await buildTestRegistry();
    ctx = ctxFor(db, registry);
    const author = await adminUser
      .transient({ db })
      .create({ email: "menu-loc-author@example.test" });
    authorId = author.id;
  });

  afterEach(() => {
    clearRegisteredLocations();
  });

  async function seedMenuWithItem(
    slug: string,
    itemTitle: string,
    url: string,
  ): Promise<void> {
    const term = await factories.term.create({
      taxonomy: "menu",
      slug,
      name: slug,
    });
    const entry = await entryFactory.transient({ db }).create({
      type: "menu_item",
      title: itemTitle,
      slug: `mi-${slug}-${Date.now()}`,
      status: "published",
      authorId,
      meta: { kind: "custom", url } as unknown as Record<string, unknown>,
    });
    await entryTermFactory
      .transient({ db })
      .create({ entryId: entry.id, termId: term.id, sortOrder: 0 });
  }

  async function bind(location: string, termSlug: string): Promise<void> {
    await db.insert(settings).values({
      group: "menu_locations",
      key: location,
      value: termSlug,
    });
  }

  test("returns null when no settings row binds the location", async () => {
    expect(await getMenuForLocation(ctx, "primary")).toBeNull();
  });

  test("dereferences the binding and returns the resolved menu", async () => {
    await seedMenuWithItem("main", "Home", "/");
    await bind("primary", "main");

    const resolved = await getMenuForLocation(ctx, "primary");
    expect(resolved?.slug).toBe("main");
    expect(resolved?.items.map((i) => i.label)).toEqual(["Home"]);
  });

  test("returns null when the bound term slug doesn't exist", async () => {
    await bind("primary", "ghost");
    expect(await getMenuForLocation(ctx, "primary")).toBeNull();
  });

  test.each([
    ["null", null],
    ["empty string", ""],
    ["number", 42],
    ["array", ["main"]],
    ["object", { slug: "main" }],
  ])(
    "returns null when the binding value shape is invalid: %s",
    async (name, value) => {
      void name;
      await db.insert(settings).values({
        group: "menu_locations",
        key: "primary",
        value,
      });
      expect(await getMenuForLocation(ctx, "primary")).toBeNull();
    },
  );

  test("memoizes within one request — second call returns the same instance", async () => {
    await seedMenuWithItem("main", "Home", "/");
    await bind("primary", "main");

    const first = await getMenuForLocation(ctx, "primary");
    const second = await getMenuForLocation(ctx, "primary");
    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  test("a fresh ctx does not share the cache", async () => {
    await seedMenuWithItem("main", "Home", "/");
    await bind("primary", "main");

    const a = await getMenuForLocation(ctx, "primary");
    const otherCtx = ctxFor(db, ctx.plugins);
    const b = await getMenuForLocation(otherCtx, "primary");
    expect(a).not.toBe(b);
    expect(a?.slug).toBe(b?.slug);
  });
});

describe("defineTheme + registerMenuLocation integration via buildApp", () => {
  afterEach(() => {
    clearRegisteredLocations();
  });

  test("theme setup runs after plugin install and registers locations", async () => {
    const blogTheme: ThemeDescriptor = defineTheme({
      id: "blog",
      setup: (themeCtx) => {
        themeCtx.registerMenuLocation("primary", {
          label: "Primary navigation",
        });
        themeCtx.registerMenuLocation("footer", { label: "Footer" });
      },
    });

    const stubAdapter = {
      name: "test",
      buildFetchHandler: () => () => new Response("stub"),
    };
    const stubDatabase = {
      kind: "test",
      connect: () => ({ db: {} }),
    };

    await buildApp({
      runtime: stubAdapter,
      database: stubDatabase,
      auth: testAuth(),
      plugins: [menu],
      themes: [blogTheme],
    });

    const { getRegisteredLocations } = await import("./locations.js");
    const registered = getRegisteredLocations();
    expect(registered.size).toBe(2);
    expect(registered.get("primary")?.label).toBe("Primary navigation");
    expect(registered.get("footer")?.label).toBe("Footer");
  });

  test("multiple themes' setup callbacks invoke in declared order", async () => {
    const order: string[] = [];
    const stubAdapter = {
      name: "test",
      buildFetchHandler: () => () => new Response("stub"),
    };
    const stubDatabase = {
      kind: "test",
      connect: () => ({ db: {} }),
    };

    await buildApp({
      runtime: stubAdapter,
      database: stubDatabase,
      auth: testAuth(),
      plugins: [menu],
      themes: [
        defineTheme({
          id: "first",
          setup: (themeCtx) => {
            order.push("first");
            themeCtx.registerMenuLocation("a", { label: "A" });
          },
        }),
        defineTheme({
          id: "second",
          setup: (themeCtx) => {
            order.push("second");
            themeCtx.registerMenuLocation("b", { label: "B" });
          },
        }),
      ],
    });

    expect(order).toEqual(["first", "second"]);
  });

  test("rejects duplicate theme ids in config.themes", async () => {
    const stubAdapter = {
      name: "test",
      buildFetchHandler: () => () => new Response("stub"),
    };
    const stubDatabase = {
      kind: "test",
      connect: () => ({ db: {} }),
    };

    await expect(
      buildApp({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: testAuth(),
        plugins: [menu],
        themes: [
          defineTheme({ id: "blog", setup: () => undefined }),
          defineTheme({ id: "blog", setup: () => undefined }),
        ],
      }),
    ).rejects.toThrow(/Theme id "blog" appears more than once/);
  });
});

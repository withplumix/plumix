import type { AppContext, PluginRegistry } from "plumix/plugin";
import { eq } from "drizzle-orm";
import {
  createPluginRegistry,
  entries,
  HookRegistry,
  installPlugins,
  registerCoreLookupAdapters,
  settings,
} from "plumix/plugin";
import {
  adminUser,
  createRequestMemo,
  createTestDb,
  entryFactory,
  entryTermFactory,
  factoriesFor,
} from "plumix/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { menu } from "../index.js";
import { getMenuByName } from "./getMenuByName.js";
import {
  getMenuForLocation,
  getMenusForLocations,
} from "./getMenuForLocation.js";
import { clearRegisteredLocations } from "./locations.js";

interface TestRegistryBundle {
  readonly registry: PluginRegistry;
  readonly hooks: HookRegistry;
}

async function buildTestRegistry(): Promise<TestRegistryBundle> {
  const hooks = new HookRegistry();
  const registry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  await installPlugins({ hooks, plugins: [menu()], registry });
  return { registry, hooks };
}

function ctxFor(
  db: Awaited<ReturnType<typeof createTestDb>>,
  bundle: TestRegistryBundle,
): AppContext {
  return {
    db,
    plugins: bundle.registry,
    hooks: bundle.hooks,
    request: new Request("https://test.example/"),
    resolvedEntity: null,
    memo: createRequestMemo(),
  } as unknown as AppContext;
}

describe("getMenuForLocation", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let factories: ReturnType<typeof factoriesFor>;
  let ctx: AppContext;
  let bundle: TestRegistryBundle;
  let authorId: number;

  beforeEach(async () => {
    db = await createTestDb();
    factories = factoriesFor(db);
    bundle = await buildTestRegistry();
    ctx = ctxFor(db, bundle);
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
    await factories.setting.create({
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
      // Raw insert: settingFactory's `value ?? ""` default would coerce the
      // deliberately-malformed shapes here (notably null) into "".
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

  test("the template dep's direct getMenuByName reuses the location resolve's cluster", async () => {
    await seedMenuWithItem("main", "Home", "/");
    await bind("primary", "main");

    const viaLocation = await getMenuForLocation(ctx, "primary");
    expect(viaLocation?.items.map((i) => i.label)).toEqual(["Home"]);

    // Wipe the backing rows: the `menus` template dep resolves the same
    // menu by slug in the same request and must not re-run the cluster.
    await db.delete(entries).where(eq(entries.type, "menu_item"));

    const viaName = await getMenuByName(ctx, "main");
    expect(viaName?.items.map((i) => i.label)).toEqual(["Home"]);
  });

  describe("getMenusForLocations", () => {
    test("query count stays flat as the location count grows", async () => {
      const locations = ["primary", "footer", "sidebar"];
      for (const location of locations) {
        await seedMenuWithItem(`menu-${location}`, "Home", `/${location}`);
        await bind(location, `menu-${location}`);
      }

      const select = vi.spyOn(db, "select");
      await getMenusForLocations(ctxFor(db, bundle), ["primary"]);
      const singleCount = select.mock.calls.length;
      select.mockClear();

      await getMenusForLocations(ctxFor(db, bundle), locations);
      expect(select.mock.calls.length).toBe(singleCount);
      select.mockRestore();
    });

    test("resolves multiple locations in one call, null for unbound", async () => {
      await seedMenuWithItem("main", "Home", "/");
      await seedMenuWithItem("legal", "Privacy", "/privacy");
      await bind("primary", "main");
      await bind("footer", "legal");

      const result = await getMenusForLocations(ctx, [
        "primary",
        "footer",
        "unbound",
      ]);
      expect(result.primary?.slug).toBe("main");
      expect(result.primary?.items.map((i) => i.label)).toEqual(["Home"]);
      expect(result.footer?.items.map((i) => i.label)).toEqual(["Privacy"]);
      expect(result.unbound).toBeNull();
    });

    test("two locations bound to the same menu each see their own location in menu:tree", async () => {
      await seedMenuWithItem("shared", "Home", "/");
      await bind("primary", "shared");
      await bind("footer", "shared");

      const seen: (string | null)[] = [];
      bundle.hooks.addFilter("menu:tree", (items, { location }) => {
        seen.push(location);
        return items;
      });

      const result = await getMenusForLocations(ctx, ["primary", "footer"]);
      expect(result.primary?.slug).toBe("shared");
      expect(result.footer?.slug).toBe("shared");
      expect(seen.sort()).toEqual(["footer", "primary"]);
    });

    test("getMenuForLocation shares the batch's memo entry", async () => {
      await seedMenuWithItem("main", "Home", "/");
      await bind("primary", "main");

      const batch = await getMenusForLocations(ctx, ["primary"]);
      const single = await getMenuForLocation(ctx, "primary");
      expect(single).not.toBeNull();
      expect(single).toBe(batch.primary);
    });
  });

  test("a fresh ctx does not share the cache", async () => {
    await seedMenuWithItem("main", "Home", "/");
    await bind("primary", "main");

    const a = await getMenuForLocation(ctx, "primary");
    const otherCtx = ctxFor(db, bundle);
    const b = await getMenuForLocation(otherCtx, "primary");
    expect(a).not.toBe(b);
    expect(a?.slug).toBe(b?.slug);
  });
});

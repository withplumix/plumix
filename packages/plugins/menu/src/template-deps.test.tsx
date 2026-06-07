import type { AppContext, PluginRegistry } from "plumix/plugin";
import {
  createPluginRegistry,
  definePlugin,
  HookRegistry,
  installPlugins,
  registerCoreLookupAdapters,
} from "plumix/plugin";
import {
  adminUser,
  createDispatcherHarness,
  createTestDb,
  entryFactory,
  entryTermFactory,
  factoriesFor,
} from "plumix/test";
import { defineTemplate, defineTheme } from "plumix/theme";
import { beforeEach, describe, expect, test } from "vitest";

import type { MenuItemMeta, ResolvedMenu } from "./server/types.js";
import { menu } from "./index.js";

type MenuLoader = NonNullable<
  ReturnType<PluginRegistry["templateDeps"]["get"]>
>["load"];

interface TestBundle {
  readonly db: Awaited<ReturnType<typeof createTestDb>>;
  readonly factories: ReturnType<typeof factoriesFor>;
  readonly ctx: AppContext;
  readonly load: MenuLoader;
  readonly authorId: number;
}

async function bundle(): Promise<TestBundle> {
  const hooks = new HookRegistry();
  const registry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  await installPlugins({
    hooks,
    plugins: [
      definePlugin("menu-host", (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      }),
      menu(),
    ],
    registry,
  });
  const db = await createTestDb();
  const factories = factoriesFor(db);
  const author = await adminUser
    .transient({ db })
    .create({ email: "menu-loader@example.test" });
  const ctx = {
    db,
    plugins: registry,
    hooks,
    request: new Request("https://test.example/"),
    resolvedEntity: null,
  } as unknown as AppContext;
  const dep = registry.templateDeps.get("menus");
  if (!dep) throw new Error("menus template dep not registered");
  return { db, factories, ctx, load: dep.load, authorId: author.id };
}

async function seedMenuItem(
  b: TestBundle,
  termId: number,
  title: string,
  meta: MenuItemMeta,
  index = 0,
): Promise<number> {
  const entry = await entryFactory.transient({ db: b.db }).create({
    type: "menu_item",
    title,
    slug: `menu-item-${termId}-${index}-${Date.now()}-${Math.random()}`,
    status: "published",
    authorId: b.authorId,
    parentId: null,
    sortOrder: index,
    meta: meta as unknown as Record<string, unknown>,
  });
  await entryTermFactory
    .transient({ db: b.db })
    .create({ entryId: entry.id, termId, sortOrder: index });
  return entry.id;
}

describe("@plumix/plugin-menu — menus template dep loader", () => {
  let b: TestBundle;
  beforeEach(async () => {
    b = await bundle();
  });

  test("resolves a single declared slug via getMenuByName", async () => {
    const term = await b.factories.term.create({
      taxonomy: "menu",
      slug: "primary",
      name: "Primary nav",
    });
    await seedMenuItem(b, term.id, "Home", { kind: "custom", url: "/" });

    const result = await b.load(["primary"], b.ctx);
    const primary = result.primary as ResolvedMenu | null;
    expect(primary?.name).toBe("Primary nav");
    expect(primary?.items.map((i) => i.label)).toEqual(["Home"]);
  });

  test("batches multiple declared slugs in one loader call", async () => {
    const primary = await b.factories.term.create({
      taxonomy: "menu",
      slug: "primary",
      name: "Primary",
    });
    const footer = await b.factories.term.create({
      taxonomy: "menu",
      slug: "footer",
      name: "Footer",
    });
    await seedMenuItem(b, primary.id, "Home", { kind: "custom", url: "/" }, 0);
    await seedMenuItem(
      b,
      footer.id,
      "Privacy",
      { kind: "custom", url: "/privacy" },
      0,
    );

    const result = await b.load(["primary", "footer"], b.ctx);
    expect((result.primary as ResolvedMenu | null)?.name).toBe("Primary");
    expect((result.footer as ResolvedMenu | null)?.name).toBe("Footer");
  });

  test("returns null for a slug with no matching menu term", async () => {
    const result = await b.load(["nope"], b.ctx);
    expect(result.nope).toBeNull();
  });
});

describe("@plumix/plugin-menu — end-to-end SSR", () => {
  test("a template declaring `menus` renders the loaded menu", async () => {
    const blogPlugin = definePlugin("blog", (ctx) => {
      ctx.registerEntryType("post", {
        label: "Posts",
        isPublic: true,
        hasArchive: true,
      });
    });
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: defineTemplate({
          menus: ["primary"],
          render: (args) => {
            const primary = args.menus?.primary;
            return (
              <nav>
                {primary?.items.map((item) => (
                  <a key={item.id} href={item.href} data-testid="menu-link">
                    {item.label}
                  </a>
                )) ?? null}
              </nav>
            );
          },
        }),
      },
    });
    const h = await createDispatcherHarness({
      plugins: [blogPlugin, menu()],
      theme,
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "menu-flow",
      title: "Menu Flow",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    const term = await h.factory.term.create({
      taxonomy: "menu",
      slug: "primary",
      name: "Primary nav",
    });
    const menuItem = await h.factory.entry.create({
      type: "menu_item",
      slug: "menu-item-home",
      title: "Home",
      status: "published",
      authorId: author.id,
      meta: { kind: "custom", url: "/" } as unknown as Record<string, unknown>,
    });
    await h.factory.entryTerm.create({
      entryId: menuItem.id,
      termId: term.id,
      sortOrder: 0,
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/menu-flow"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('href="/"');
    expect(body).toContain("Home");
  });
});

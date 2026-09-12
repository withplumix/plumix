import type { AppContext, PluginRegistry } from "plumix/plugin";
import { entry, fallback } from "plumix";
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
  createRequestMemo,
  createTestDb,
  entryFactory,
  entryTermFactory,
  factoriesFor,
  plumixRequest,
} from "plumix/test";
import { defineTemplate, defineTheme } from "plumix/theme";
import { beforeEach, describe, expect, test, vi } from "vitest";

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
    memo: createRequestMemo(),
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
    meta,
  });
  await entryTermFactory
    .transient({ db: b.db })
    .create({ entryId: entry.id, termId, sortOrder: index });
  return entry.id;
}

async function assign(
  b: TestBundle,
  location: string,
  termSlug: string,
): Promise<void> {
  await b.factories.setting.create({
    group: "menu_locations",
    key: location,
    value: termSlug,
  });
}

describe("@plumix/plugin-menu — menus template dep loader", () => {
  let b: TestBundle;
  beforeEach(async () => {
    b = await bundle();
  });

  test("resolves a declared location through its assignment", async () => {
    const term = await b.factories.term.create({
      taxonomy: "menu",
      slug: "main-nav",
      name: "Primary nav",
    });
    await seedMenuItem(b, term.id, "Home", { kind: "custom", url: "/" });
    await assign(b, "primary", "main-nav");

    const result = await b.load(["primary"], b.ctx);
    const primary = result.primary as ResolvedMenu | null;
    expect(primary?.name).toBe("Primary nav");
    expect(primary?.items.map((i) => i.label)).toEqual(["Home"]);
  });

  test("batches multiple declared locations in one loader call", async () => {
    const main = await b.factories.term.create({
      taxonomy: "menu",
      slug: "main-nav",
      name: "Primary",
    });
    const legal = await b.factories.term.create({
      taxonomy: "menu",
      slug: "legal",
      name: "Footer",
    });
    await seedMenuItem(b, main.id, "Home", { kind: "custom", url: "/" }, 0);
    await seedMenuItem(
      b,
      legal.id,
      "Privacy",
      { kind: "custom", url: "/privacy" },
      0,
    );
    await assign(b, "primary", "main-nav");
    await assign(b, "footer", "legal");

    const result = await b.load(["primary", "footer"], b.ctx);
    expect((result.primary as ResolvedMenu | null)?.name).toBe("Primary");
    expect((result.footer as ResolvedMenu | null)?.name).toBe("Footer");
  });

  test("returns null for a location with no assignment", async () => {
    await b.factories.term.create({
      taxonomy: "menu",
      slug: "primary",
      name: "Primary",
    });

    const result = await b.load(["primary"], b.ctx);
    expect(result.primary).toBeNull();
  });

  test("query count stays flat as declared locations grow", async () => {
    for (const [index, location] of ["primary", "footer", "aside"].entries()) {
      const term = await b.factories.term.create({
        taxonomy: "menu",
        slug: `${location}-menu`,
        name: location,
      });
      await seedMenuItem(
        b,
        term.id,
        "Home",
        { kind: "custom", url: "/" },
        index,
      );
      await assign(b, location, `${location}-menu`);
    }

    const select = vi.spyOn(b.ctx.db, "select");
    await b.load(["primary"], b.ctx);
    const singleCount = select.mock.calls.length;
    select.mockClear();

    await b.load(["primary", "footer", "aside"], b.ctx);
    expect(select.mock.calls.length).toBe(singleCount);
    select.mockRestore();
  });
});

describe("@plumix/plugin-menu — end-to-end SSR", () => {
  test("a menu assigned to a location renders where a template declares that location", async () => {
    const blogPlugin = definePlugin("blog", (ctx) => {
      ctx.registerEntryType("post", {
        label: "Posts",
        isPublic: true,
        hasArchive: true,
      });
    });
    const theme = defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
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
        ),
      ],
    });
    const h = await createDispatcherHarness({
      plugins: [
        blogPlugin,
        menu({ locations: { primary: { label: "Primary" } } }),
      ],
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
      slug: "main-nav",
      name: "Primary nav",
    });
    const menuItem = await h.factory.entry.create({
      type: "menu_item",
      slug: "menu-item-home",
      title: "Home",
      status: "published",
      authorId: author.id,
      meta: { kind: "custom", url: "/main-nav" },
    });
    await h.factory.entryTerm.create({
      entryId: menuItem.id,
      termId: term.id,
      sortOrder: 0,
    });

    const assigned = await h.dispatch(
      await h.authenticateRequest(
        plumixRequest("/_plumix/rpc/menu/assignLocation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            json: { location: "primary", termSlug: "main-nav" },
          }),
        }),
        author.id,
      ),
    );
    expect(assigned.status).toBe(200);

    const response = await h.dispatch(
      new Request("https://cms.example/post/menu-flow"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('href="/main-nav"');
    expect(body).toContain("Home");
  });
});

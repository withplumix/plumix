import type { AnyPluginDescriptor, ConnectedCdn } from "plumix";
import type { DispatcherHarness } from "plumix/test";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness, plumixRequest } from "plumix/test";
import { defineTemplate, defineTheme, entry } from "plumix/theme";
import { describe, expect, test, vi } from "vitest";

import type { MenuItemMeta } from "./server/types.js";
import { menu } from "./index.js";
import { getMenuByName } from "./server/getMenuByName.js";

function cdnStub() {
  const put = vi.fn<NonNullable<ConnectedCdn["store"]>["put"]>(() =>
    Promise.resolve(),
  );
  const purgeTags = vi.fn<NonNullable<ConnectedCdn["purgeTags"]>>(() =>
    Promise.resolve(),
  );
  const cdn: ConnectedCdn = {
    decorate: (response) => response,
    store: { match: () => Promise.resolve(undefined), put },
    purgeTags,
  };
  return { cdn, put, purgeTags };
}

const blog = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts", isPublic: true });
});

// A permalink template rendering the `primary` location.
const theme = defineTheme({
  templates: [
    entry(
      defineTemplate({
        menus: ["primary"],
        render: (args) => (
          <nav>
            {args.menus?.primary?.items.map((item) => (
              <a key={item.id} href={item.href}>
                {item.label}
              </a>
            )) ?? null}
          </nav>
        ),
      }),
    ),
  ],
});

interface Site {
  readonly h: DispatcherHarness;
  readonly put: ReturnType<typeof cdnStub>["put"];
  readonly purgeTags: ReturnType<typeof cdnStub>["purgeTags"];
  readonly authorId: number;
}

async function site(extra: readonly AnyPluginDescriptor[] = []): Promise<Site> {
  const { cdn, put, purgeTags } = cdnStub();
  const h = await createDispatcherHarness({
    cdn,
    config: {
      plugins: [
        blog,
        menu({ locations: { primary: { label: "Primary" } } }),
        ...extra,
      ],
      theme,
    },
  });
  const author = await h.seedUser("admin");
  await h.factory.entry.create({
    type: "post",
    slug: "hello",
    title: "Hello",
    status: "published",
    authorId: author.id,
    publishedAt: new Date(),
  });
  return { h, put, purgeTags, authorId: author.id };
}

async function seedMenu(
  s: Site,
  slug: string,
  items: readonly MenuItemMeta[] = [{ kind: "custom", url: "/" }],
): Promise<number> {
  const term = await s.h.factory.term.create({
    taxonomy: "menu",
    slug,
    name: slug,
  });
  for (const [index, meta] of items.entries()) {
    const item = await s.h.factory.entry.create({
      type: "menu_item",
      slug: `${slug}-item-${String(index)}`,
      title: `Item ${String(index)}`,
      status: "published",
      authorId: s.authorId,
      sortOrder: index,
      meta,
    });
    await s.h.factory.entryTerm.create({
      entryId: item.id,
      termId: term.id,
      sortOrder: index,
    });
  }
  return term.id;
}

async function bind(s: Site, location: string, slug: string): Promise<void> {
  await s.h.factory.setting.create({
    group: "menu_locations",
    key: location,
    value: slug,
  });
}

async function rpc(s: Site, path: string, input: unknown): Promise<void> {
  const response = await s.h.dispatch(
    await s.h.authenticateRequest(
      plumixRequest(`/_plumix/rpc/menu/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      }),
      s.authorId,
    ),
  );
  expect(response.status).toBe(200);
  await s.h.drainDeferred();
}

function purged(s: Site): readonly string[] {
  return s.purgeTags.mock.calls.flatMap(([tags]) => [...tags]);
}

async function storedTags(s: Site): Promise<readonly string[]> {
  await s.h.dispatch(new Request("https://cms.example/post/hello"));
  await s.h.drainDeferred();
  return s.put.mock.calls[0]?.[2] ?? [];
}

describe("@plumix/plugin-menu — CDN tags", () => {
  test("a page rendering a location is stored under its menu's tag", async () => {
    const s = await site();
    const termId = await seedMenu(s, "main-nav");
    await bind(s, "primary", "main-nav");

    expect(await storedTags(s)).toContain(`menu:${String(termId)}`);
  });

  test("saving a menu purges its tag", async () => {
    const s = await site();
    const termId = await seedMenu(s, "main-nav", []);

    await rpc(s, "save", { termId, version: 0, items: [] });

    expect(purged(s)).toContain(`menu:${String(termId)}`);
  });

  test("a cacheable route resolving a menu by name is stored under its tag", async () => {
    const navRoute = definePlugin("nav", (ctx) => {
      ctx.registerRoute({
        method: "GET",
        path: "/nav",
        auth: "public",
        cacheable: true,
        handler: async (_request, appCtx) => {
          const nav = await getMenuByName(appCtx, "main-nav");
          return new Response(JSON.stringify(nav), { status: 200 });
        },
      });
    });
    const s = await site([navRoute]);
    const termId = await seedMenu(s, "main-nav");

    await s.h.dispatch(plumixRequest("/_plumix/nav/nav", { method: "GET" }));
    await s.h.drainDeferred();

    expect(s.put.mock.calls[0]?.[2]).toContain(`menu:${String(termId)}`);
  });

  test("deleting a menu purges its tag", async () => {
    const s = await site();
    const termId = await seedMenu(s, "main-nav");

    await rpc(s, "delete", { termId });

    expect(purged(s)).toContain(`menu:${String(termId)}`);
    expect(purged(s)).not.toContain("s:menu_locations");
  });

  test("deleting a bound menu purges the locations it unbound", async () => {
    const s = await site();
    const termId = await seedMenu(s, "main-nav");
    await bind(s, "primary", "main-nav");

    await rpc(s, "delete", { termId });

    expect(purged(s)).toEqual(
      expect.arrayContaining([`menu:${String(termId)}`, "s:menu_locations"]),
    );
  });

  test("binding a location purges the locations tag", async () => {
    const s = await site();
    await seedMenu(s, "main-nav");

    await rpc(s, "assignLocation", {
      location: "primary",
      termSlug: "main-nav",
    });

    expect(purged(s)).toContain("s:menu_locations");
  });

  test("unbinding a location purges the locations tag", async () => {
    const s = await site();
    await seedMenu(s, "main-nav");
    await bind(s, "primary", "main-nav");

    await rpc(s, "assignLocation", { location: "primary", termSlug: null });

    expect(purged(s)).toContain("s:menu_locations");
  });

  test("a page rendering a bound location is stored under the locations tag", async () => {
    const s = await site();
    await seedMenu(s, "main-nav");
    await bind(s, "primary", "main-nav");

    expect(await storedTags(s)).toContain("s:menu_locations");
  });

  // Binding a menu there later has to reach the page that printed nothing.
  test("a page rendering an empty location is stored under the locations tag", async () => {
    const s = await site();

    expect(await storedTags(s)).toContain("s:menu_locations");
  });

  test("a page whose menu links an entry is stored under that entry's tag", async () => {
    const s = await site();
    const linked = await s.h.factory.entry.create({
      type: "post",
      slug: "about",
      title: "About",
      status: "published",
      authorId: s.authorId,
      publishedAt: new Date(),
    });
    await seedMenu(s, "main-nav", [{ kind: "entry", entryId: linked.id }]);
    await bind(s, "primary", "main-nav");

    expect(await storedTags(s)).toContain(`e:${String(linked.id)}`);
  });
});

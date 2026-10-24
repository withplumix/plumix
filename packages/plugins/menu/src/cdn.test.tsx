import type { AnyPluginDescriptor } from "plumix";
import type { CdnFake, DispatcherHarness } from "plumix/test";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness, fakeCdn, plumixRequest } from "plumix/test";
import { defineTemplate, defineTheme, entry } from "plumix/theme";
import { describe, expect, test } from "vitest";

import type { MenuItemMeta } from "./server/types.js";
import { menu } from "./index.js";
import { getMenuByName } from "./server/getMenuByName.js";

const blog = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  ctx.registerEntryType("page", { label: "Pages", isPublic: true });
});

/** A permalink template rendering the `primary` location. */
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
  readonly cdn: CdnFake;
  readonly authorId: number;
}

async function site(extra: readonly AnyPluginDescriptor[] = []): Promise<Site> {
  const cdn = fakeCdn();
  const h = await createDispatcherHarness({
    cdn,
    config: {
      plugins: [
        blog,
        menu({
          locations: {
            primary: { label: "Primary" },
            footer: { label: "Footer" },
          },
        }),
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
  return { h, cdn, authorId: author.id };
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
      plumixRequest(`/_plumix/rpc/${path}`, {
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

const PAGE = "/post/hello";

/** Render a public GET so the read-through stores it, and check it did. */
async function render(s: Site, path: string = PAGE): Promise<void> {
  await s.h.dispatch(plumixRequest(path, { method: "GET" }));
  await s.h.drainDeferred();
  s.cdn.assertStored(path);
}

/** A cacheable route resolving the `main-nav` menu by name, not location. */
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
const NAV = "/_plumix/nav/nav";

describe("@plumix/plugin-menu — CDN invalidation", () => {
  test("saving a menu purges a page rendering it at a location", async () => {
    const s = await site();
    const termId = await seedMenu(s, "main-nav", []);
    await bind(s, "primary", "main-nav");
    await render(s);

    await rpc(s, "menu/save", { termId, ifMatch: "0", items: [] });

    s.cdn.assertNotStored(PAGE);
  });

  test("saving a menu purges a cacheable route that resolved it by name", async () => {
    const s = await site([navRoute]);
    const termId = await seedMenu(s, "main-nav", []);
    await render(s, NAV);

    await rpc(s, "menu/save", { termId, ifMatch: "0", items: [] });

    s.cdn.assertNotStored(NAV);
  });

  test("deleting an unbound menu purges what rendered it and no location", async () => {
    const s = await site([navRoute]);
    const termId = await seedMenu(s, "main-nav");
    await render(s, NAV);
    await render(s);

    await rpc(s, "menu/delete", { termId });

    s.cdn.assertNotStored(NAV);
    s.cdn.assertStored(PAGE);
  });

  // The page renders only the empty `primary`, so only the location change can
  // reach it.
  test("deleting a bound menu purges a page rendering the locations it unbound", async () => {
    const s = await site();
    const termId = await seedMenu(s, "main-nav");
    await bind(s, "footer", "main-nav");
    await render(s);

    await rpc(s, "menu/delete", { termId });

    s.cdn.assertNotStored(PAGE);
  });

  // Binding a menu there later has to reach the page that printed nothing.
  test("binding a location purges a page rendering it empty", async () => {
    const s = await site();
    await seedMenu(s, "main-nav");
    await render(s);

    await rpc(s, "menu/assignLocation", {
      location: "primary",
      termSlug: "main-nav",
    });

    s.cdn.assertNotStored(PAGE);
  });

  test("unbinding a location purges a page rendering it", async () => {
    const s = await site();
    await seedMenu(s, "main-nav");
    await bind(s, "primary", "main-nav");
    await render(s);

    await rpc(s, "menu/assignLocation", {
      location: "primary",
      termSlug: null,
    });

    s.cdn.assertNotStored(PAGE);
  });

  test("binding another location purges a page rendering a bound one", async () => {
    const s = await site();
    await seedMenu(s, "main-nav");
    await bind(s, "primary", "main-nav");
    await render(s);

    await rpc(s, "menu/assignLocation", {
      location: "footer",
      termSlug: "main-nav",
    });

    s.cdn.assertNotStored(PAGE);
  });

  test("trashing an entry a menu links purges the page rendering the menu", async () => {
    const s = await site();
    // A page, not a post: trashing a post would purge every post page anyway.
    const linked = await s.h.factory.entry.create({
      type: "page",
      slug: "about",
      title: "About",
      status: "published",
      authorId: s.authorId,
      publishedAt: new Date(),
    });
    await seedMenu(s, "main-nav", [{ kind: "entry", entryId: linked.id }]);
    await bind(s, "primary", "main-nav");
    await render(s);

    await rpc(s, "entry/trash", { id: linked.id });

    s.cdn.assertNotStored(PAGE);
  });
});

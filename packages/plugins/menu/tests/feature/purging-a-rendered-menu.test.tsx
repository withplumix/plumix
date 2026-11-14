import { etagOf } from "plumix/db";
import { definePlugin, term } from "plumix/plugin";
import { testSite } from "plumix/test";
import { defineTemplate, defineTheme, entry } from "plumix/theme";
import { describe, test } from "vitest";

import type { MenuItemMeta } from "../../src/server/types.js";
import { menu } from "../../src/index.js";

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerEntryType("page", { label: "Pages", isPublic: true });
    ctx.registerTermTaxonomy("category", {
      label: "Categories",
      isPublic: true,
      entryTypes: ["post"],
    });
  },
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

const site = await testSite({
  plugins: [blog, menu({ locations: { primary: { label: "Primary" } } })],
  config: { theme },
});

/** A menu bound to `primary`, holding one item per `items`. */
async function primaryMenu(items: readonly MenuItemMeta[]): Promise<number> {
  const editor = await site.factory.editor.create();
  const term = await site.factory.term.create({
    taxonomy: "menu",
    slug: "main-nav",
    name: "Main",
  });
  for (const [index, meta] of items.entries()) {
    const item = await site.factory.published.create({
      type: "menu_item",
      authorId: editor.id,
      sortOrder: index,
      meta,
    });
    await site.factory.entryTerm.create({
      entryId: item.id,
      termId: term.id,
      sortOrder: index,
    });
  }
  await site.factory.setting.create({
    group: "menu_locations",
    key: "primary",
    value: "main-nav",
  });
  return term.id;
}

/** A post page rendering the `primary` menu, stored by the cdn. */
async function renderedPage(): Promise<string> {
  await site.factory.published.create({ type: "post", slug: "hello" });
  const path = "/post/hello";
  await site.visit(path);
  site.cdn.assertStored(path);
  return path;
}

describe("purging a page that renders a menu", () => {
  test("renaming a term a menu item links purges the page", async () => {
    const news = await site.factory.term.create({
      taxonomy: "category",
      slug: "news",
      name: "News",
    });
    await primaryMenu([{ kind: "term", termId: news.id }]);
    const path = await renderedPage();

    await site.actingAs("editor").rpc.term.update({
      id: news.id,
      name: "Latest",
      ifMatch: etagOf(news.version),
    });

    site.cdn.assertNotStored(path);
  });

  test("changing the title of an entry a menu item links purges the page", async () => {
    const about = await site.factory.published.create({
      type: "page",
      title: "About",
    });
    await primaryMenu([{ kind: "entry", entryId: about.id }]);
    const path = await renderedPage();

    await site.actingAs("editor").rpc.entry.update({
      id: about.id,
      title: "About us",
      ifMatch: etagOf(about.updatedAt),
    });

    site.cdn.assertNotStored(path);
  });

  // The nav left the draft out, so publishing it has to reach the page.
  test("publishing a draft a menu item links purges the page", async () => {
    const about = await site.factory.draft.create({ type: "page" });
    await primaryMenu([{ kind: "entry", entryId: about.id }]);
    const path = await renderedPage();

    await site.actingAs("editor").rpc.entry.update({
      id: about.id,
      status: "published",
      ifMatch: etagOf(about.updatedAt),
    });

    site.cdn.assertNotStored(path);
  });

  test("saving the menu purges the page", async () => {
    const termId = await primaryMenu([{ kind: "custom", url: "/" }]);
    const path = await renderedPage();

    await site.actingAs("editor").rpc.menu.save({
      termId,
      ifMatch: "0",
      items: [],
    });

    site.cdn.assertNotStored(path);
  });

  test("renaming an item of the menu purges the page", async () => {
    const termId = await primaryMenu([{ kind: "custom", url: "/" }]);
    const path = await renderedPage();
    const editor = site.actingAs("editor");
    const { etag, items } = await editor.rpc.menu.get({ termId });

    await editor.rpc.menu.save({
      termId,
      ifMatch: etag,
      items: items.map((item) => ({
        id: item.id,
        parentIndex: null,
        sortOrder: item.sortOrder,
        title: "Start",
        meta: { kind: "custom" as const, url: "/" },
      })),
    });

    site.cdn.assertNotStored(path);
  });

  test("a save that changes nothing leaves the page stored", async () => {
    const termId = await primaryMenu([{ kind: "custom", url: "/" }]);
    const path = await renderedPage();
    const editor = site.actingAs("editor");
    const { etag, items } = await editor.rpc.menu.get({ termId });

    await editor.rpc.menu.save({
      termId,
      ifMatch: etag,
      items: items.map((item) => ({
        id: item.id,
        parentIndex: null,
        sortOrder: item.sortOrder,
        title: item.title,
        meta: { kind: "custom" as const, url: "/" },
      })),
    });

    site.cdn.assertStored(path);
  });

  test("deleting the menu purges the page", async () => {
    const termId = await primaryMenu([{ kind: "custom", url: "/" }]);
    const path = await renderedPage();

    await site.actingAs("editor").rpc.menu.delete({ termId });

    site.cdn.assertNotStored(path);
  });
});

describe("creating a menu", () => {
  test("announces the menu as a new term", async () => {
    const { termId } = await site
      .actingAs("editor")
      .rpc.menu.create({ name: "Footer" });

    site.events.assertEmitted(term.created, {
      term: { id: termId, taxonomy: "menu" },
    });
  });
});

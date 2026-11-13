import { afterEach, assert, describe, expect, test, vi } from "vitest";

import type {
  BlockLoaderRecord,
  BlockViewProps,
} from "../../src/blocks/index.js";
import { defineBlock } from "../../src/blocks/index.js";
import { BlockRenderer } from "../../src/blocks/renderer/index.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  entry,
  entryType,
  fallback,
} from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

declare module "../../src/blocks/deps.js" {
  interface TemplateDepRegistry {
    "block-menus": { location: string; result: string };
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

const ks2Block = defineBlock({
  name: "eduscope/ks2",
  view: () =>
    Promise.resolve({
      default: ({ deps }) => {
        const title = deps.settings.school_ks2?.title;
        return <h2>{typeof title === "string" ? title : "no copy"}</h2>;
      },
      deps: { settings: ["school_ks2"] },
    }),
});

const schoolPlugin = definePlugin("school", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
    ctx.registerBlock(ks2Block);
  },
});

const composedPlugin = definePlugin("composed", {
  setup: (ctx) => {
    ctx.registerBlock(
      defineBlock({
        name: "eduscope/composed",
        view: () =>
          Promise.resolve({
            default: ({ deps }) => {
              const title = deps.settings.school_ks2?.title;
              return <h3>{typeof title === "string" ? title : "no copy"}</h3>;
            },
            deps: {
              settings: (prev: readonly string[]) => [...prev, "school_ks2"],
            },
          }),
      }),
    );
  },
});

const loadMenus = vi.fn(({ locations }: { locations: readonly string[] }) =>
  Promise.resolve(Object.fromEntries(locations.map((l) => [l, `menu:${l}`]))),
);
const menuPlugin = definePlugin("menus", {
  setup: (ctx) => {
    ctx.registerTemplateDep("block-menus", {
      keyedBy: "location",
      load: loadMenus,
    });
    ctx.registerBlock(
      defineBlock({
        name: "acme/nav",
        view: () =>
          Promise.resolve({
            default: ({
              attrs,
              deps,
            }: BlockViewProps<
              { readonly location?: string },
              BlockLoaderRecord,
              { "block-menus": readonly string[] }
            >) => <nav>{deps["block-menus"][attrs.location ?? "primary"]}</nav>,
            deps: (attrs: { readonly location?: string }) => ({
              "block-menus": [attrs.location ?? "primary"],
            }),
          }),
      }),
    );
  },
});

/** A theme with no dep declarations of its own: the block brings its own. */
const plainTheme = defineTheme({
  templates: [
    entry(({ data }) =>
      data.entry.contentBlocks ? (
        <BlockRenderer content={data.entry.contentBlocks} />
      ) : null,
    ),
    fallback(() => null),
  ],
});

const site = await testSite({
  plugins: [schoolPlugin, composedPlugin, menuPlugin],
  config: { theme: plainTheme },
});

describe("a block that declares its deps", () => {
  test("renders its settings group under a template that declares nothing", async () => {
    await site.factory.setting.create({
      group: "school_ks2",
      key: "title",
      value: "Key Stage 2",
    });
    await site.factory.published.create({
      type: "post",
      slug: "school",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "a", name: "eduscope/ks2" }],
      },
    });

    const page = await site.visit("/post/school");

    page.assertOk().assertSee("<h2>Key Stage 2</h2>");
  });

  test("a kind declared in the template's `(prev) => next` form starts from no keys", async () => {
    await site.factory.setting.create({
      group: "school_ks2",
      key: "title",
      value: "Key Stage 2",
    });
    await site.factory.published.create({
      type: "post",
      slug: "school",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "a", name: "eduscope/composed" }],
      },
    });

    const page = await site.visit("/post/school");

    page.assertSee("<h3>Key Stage 2</h3>");
  });

  test("twenty instances on one page load the settings dep once", async () => {
    const settingsDep = site.context.plugins.templateDeps.get("settings");
    assert(settingsDep, "core registers the settings dep");
    const load = vi.spyOn(settingsDep, "load");
    await site.factory.published.create({
      type: "post",
      slug: "school",
      content: {
        version: "plumix.v2",
        blocks: Array.from({ length: 20 }, (_, i) => ({
          id: `b${String(i)}`,
          name: "eduscope/ks2",
        })),
      },
    });

    await site.visit("/post/school");

    expect(load).toHaveBeenCalledOnce();
    expect(load.mock.calls[0]?.[0]).toEqual(["school_ks2"]);
  });

  test("a declaration from attributes loads every instance's keys in one call", async () => {
    loadMenus.mockClear();
    await site.factory.published.create({
      type: "post",
      slug: "school",
      content: {
        version: "plumix.v2",
        blocks: [
          { id: "a", name: "acme/nav", attrs: { location: "header" } },
          { id: "b", name: "acme/nav", attrs: { location: "footer" } },
        ],
      },
    });

    const page = await site.visit("/post/school");

    page
      .assertSee("<nav>menu:header</nav>")
      .assertSee("<nav>menu:footer</nav>");
    expect(loadMenus).toHaveBeenCalledOnce();
    expect(loadMenus.mock.calls[0]?.[0]).toEqual({
      locations: ["header", "footer"],
    });
  });

  test("saving a group a block reads purges the stored page that renders it", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "school",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "a", name: "eduscope/ks2" }],
      },
    });
    await site.visit("/post/school");

    await site.actingAs("admin").rpc.settings.upsert({
      group: "school_ks2",
      values: { title: "KS2" },
      ifMatch: "0",
    });

    site.cdn.assertPurged("s:school_ks2");
    // Gone from the store, so the page was stored under the group's tag.
    site.cdn.assertNotStored("/post/school");
  });

  test("the editor canvas render carries the block's deps to the canvas", async () => {
    await site.factory.setting.create({
      group: "school_ks2",
      key: "title",
      value: "Key Stage 2",
    });
    await site.factory.published.create({
      type: "post",
      slug: "school",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "a", name: "eduscope/ks2" }],
      },
    });

    const page = await site.actingAs("admin").visit("/post/school?plumix.edit");

    // The render-env embed the canvas reads, its deps ending there.
    page.assertSee(
      '"deps":{"settings":{"school_ks2":{"title":"Key Stage 2"}}},"htmlAllowlist"',
    );
  });
});

const archiveTheme = defineTheme({
  templates: [
    entryType(({ data }) => (
      <main>
        {data.entries.map((listed) => (
          <BlockRenderer key={listed.id} content={listed.contentBlocks} />
        ))}
      </main>
    )),
    fallback(() => null),
  ],
});

const archiveSite = await testSite({
  plugins: [schoolPlugin],
  config: { theme: archiveTheme },
});

describe("an archive of entries whose blocks declare deps", () => {
  test("loads its listed entries' block deps once for the page", async () => {
    const settingsDep =
      archiveSite.context.plugins.templateDeps.get("settings");
    assert(settingsDep, "core registers the settings dep");
    const load = vi.spyOn(settingsDep, "load");
    await archiveSite.factory.setting.create({
      group: "school_ks2",
      key: "title",
      value: "Key Stage 2",
    });
    await archiveSite.factory.published.create({
      type: "post",
      slug: "first",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "a", name: "eduscope/ks2" }],
      },
    });
    await archiveSite.factory.published.create({
      type: "post",
      slug: "second",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "b", name: "eduscope/ks2" }],
      },
    });

    const page = await archiveSite.visit("/post");

    page.assertSeeInOrder(["<h2>Key Stage 2</h2>", "<h2>Key Stage 2</h2>"]);
    expect(load).toHaveBeenCalledOnce();
  });
});

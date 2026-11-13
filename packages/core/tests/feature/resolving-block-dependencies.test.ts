import { beforeEach, describe, expect, test } from "vitest";

import { defineBlock } from "../../src/blocks/block-registry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { pageNotFound } from "../../src/route/contract/page-outcome.js";
import { testSite } from "../../src/test/site.js";

declare module "../../src/blocks/deps.js" {
  interface TemplateDepRegistry {
    menus: { location: string; result: string };
    shares: { slug: string; result: string };
  }
}

/** The locations each `menus` load was asked for, in order. */
const menuLoads: (readonly string[])[] = [];

beforeEach(() => {
  menuLoads.length = 0;
});

const navigation = definePlugin("test", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerTemplateDep("menus", {
      keyedBy: "location",
      load: ({ locations }) => {
        menuLoads.push(locations);
        return Promise.resolve(
          Object.fromEntries(locations.map((l) => [l, `menu:${l}`])),
        );
      },
    });
    ctx.registerTemplateDep("shares", {
      keyedBy: "slug",
      load: () => Promise.reject(pageNotFound()),
    });
    ctx.registerBlock(
      defineBlock({
        name: "test/nav",
        view: () =>
          Promise.resolve({
            default: () => null,
            deps: (attrs: { readonly location?: unknown }) => ({
              menus: [String(attrs.location)],
            }),
          }),
      }),
    );
    ctx.registerBlock(
      defineBlock({
        name: "test/share",
        view: () =>
          Promise.resolve({
            default: () => null,
            deps: () => ({ shares: ["spent"] }),
          }),
      }),
    );
  },
});

const site = await testSite({ plugins: [navigation] });

const navs = (...locations: string[]) => ({
  version: "plumix.v2" as const,
  blocks: locations.map((location, i) => ({
    id: `nav${String(i)}`,
    name: "test/nav",
    attrs: { location },
  })),
});

describe("resolving block dependencies", () => {
  test("loads what the sent tree's blocks declare, from their current attrs, in one load", async () => {
    const editor = await site.factory.editor.create();
    const draft = await site.factory.draft.create({
      authorId: editor.id,
      content: navs("header"),
    });

    const result = await site.actingAs(editor).rpc.entry.resolveBlockDeps({
      id: draft.id,
      content: navs("header", "footer"),
    });

    expect(result.deps).toEqual({
      menus: { header: "menu:header", footer: "menu:footer" },
    });
    expect(menuLoads).toHaveLength(1);
  });

  test("reads a dep that ends the request as null, so the canvas stays editable", async () => {
    const editor = await site.factory.editor.create();
    const draft = await site.factory.draft.create({
      authorId: editor.id,
      content: navs("header"),
    });

    const result = await site.actingAs(editor).rpc.entry.resolveBlockDeps({
      id: draft.id,
      content: {
        version: "plumix.v2",
        blocks: [
          { id: "s", name: "test/share" },
          { id: "n", name: "test/nav", attrs: { location: "header" } },
        ],
      },
    });

    expect(result.deps).toEqual({
      shares: { spent: null },
      menus: { header: "menu:header" },
    });
  });

  test("is not found for an entry the caller cannot read", async () => {
    const other = await site.factory.user.create();
    const draft = await site.factory.draft.create({
      authorId: other.id,
      content: navs("header"),
    });

    const resolve = site.actingAs("author").rpc.entry.resolveBlockDeps({
      id: draft.id,
      content: navs("header"),
    });

    await expect(resolve).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

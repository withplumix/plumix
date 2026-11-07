import { createElement } from "react";
import { beforeEach, describe, expect, test } from "vitest";

import type { BlockLoaderArgs } from "../../src/blocks/index.js";
import type { JsonObject } from "../../src/json.js";
import type { TestSite } from "../../src/test/site.js";
import { createPreviewToken } from "../../src/auth/preview-token.js";
import { defineBlock } from "../../src/blocks/index.js";
import { definePlugin } from "../../src/plugin/define.js";
import { upsertAutosave } from "../../src/revisions/repository.js";
import { fallback } from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

const TIPTAP_BODY = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }],
};

/**
 * A page served at a dynamic path: the rule names the entry by slug, and
 * whatever `:id` captured is left for the page's block loaders to read.
 */
const comparePlugin = definePlugin("compare", {
  setup: (ctx) => {
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      isHierarchical: true,
      rewrite: { slug: "" },
    });
    ctx.registerRewriteRule("/compare/:id", {
      kind: "entry",
      entryType: "page",
      slug: "shared-comparison",
    });
  },
});

const loaderSaw: unknown[] = [];
const routeProbe = definePlugin("route-probe", {
  setup: (ctx) => {
    ctx.registerBlock(
      defineBlock({
        name: "acme/route-probe",
        loaders: {
          params: ({ ctx: appCtx }: BlockLoaderArgs) => {
            loaderSaw.push(appCtx);
            return Promise.resolve(null);
          },
        },
        render: () => null,
      }),
    );
  },
});

const site = await testSite({ plugins: [comparePlugin, routeProbe] });

beforeEach(() => {
  loaderSaw.length = 0;
});

function createPage(
  on: TestSite,
  {
    slug,
    title,
    status = "published",
    content = TIPTAP_BODY,
    parentId = null,
  }: {
    slug: string;
    title: string;
    status?: "published" | "draft";
    content?: JsonObject;
    parentId?: number | null;
  },
) {
  return on.factory.entry.create({
    type: "page",
    slug,
    title,
    status,
    content,
    parentId,
  });
}

/** The page the rule names, by an admin who may preview and edit it. */
async function seedComparison(
  options: { status?: "published" | "draft"; content?: JsonObject } = {},
) {
  const author = await site.factory.user.create({ role: "admin" });
  const page = await site.factory.entry.create({
    type: "page",
    slug: "shared-comparison",
    title: "Shared Comparison",
    status: options.status ?? "published",
    content: options.content ?? TIPTAP_BODY,
    authorId: author.id,
  });
  return { author, page };
}

describe("a rewrite rule naming a fixed entry", () => {
  test("serves the named entry at whatever path the rule captured", async () => {
    await seedComparison();

    const page = await site.visit("/compare/abc");

    page
      .assertOk()
      .assertSee("<h1>Shared Comparison</h1>")
      .assertSee("<p>Body.</p>");
  });

  test("a block loader on the entry reads the params the rule captured", async () => {
    await seedComparison({
      content: {
        version: "plumix.v2",
        blocks: [{ id: "n", name: "acme/route-probe", attrs: {} }],
      },
    });

    const page = await site.visit("/compare/abc");

    page.assertOk();
    expect(loaderSaw).toMatchObject([
      { resolvedRoute: { params: { id: "abc" } } },
    ]);
  });

  test("a draft 404s at the rule's path", async () => {
    await seedComparison({ status: "draft" });

    const page = await site.visit("/compare/abc");

    page
      .assertNotFound()
      .assertHeader("x-plumix-hint", "public-post-not-found");
  });

  test("a preview token grants the draft at the rule's path", async () => {
    const { author, page: entry } = await seedComparison({ status: "draft" });
    const token = await createPreviewToken(site.context.db, {
      entryId: entry.id,
      userId: author.id,
    });

    const page = await site.visit(`/compare/abc?preview=${token}`);

    page.assertOk().assertSee("<h1>Shared Comparison</h1>");
  });

  test("a preview token overlays its author's autosave at the rule's path", async () => {
    const { author, page: entry } = await seedComparison();
    await upsertAutosave(site.context.db, {
      entry,
      authorId: author.id,
      patch: {
        title: "Shared Comparison",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Draft body." }],
            },
          ],
        },
        excerpt: null,
        meta: {},
        metaDeletes: [],
      },
    });
    const token = await createPreviewToken(site.context.db, {
      entryId: entry.id,
      userId: author.id,
    });

    const page = await site.visit(`/compare/abc?preview=${token}`);

    page.assertOk().assertSee("Draft body.");
  });

  test("the page at the rule's path is stored under the entry's cdn tags", async () => {
    const { author, page: entry } = await seedComparison();

    const page = await site.visit("/compare/abc");

    site.cdn.assertStored("/compare/abc");
    page.assertHeader(
      "cache-tag",
      `t:page,e:${String(entry.id)},u:${String(author.id)},s:site`,
    );
  });

  test("the rule's path is served as it is, never redirected to the entry's permalink", async () => {
    await seedComparison();

    const page = await site.visit("/compare/abc?ref=feed");

    page.assertOk().assertHeaderMissing("location");
  });

  test("an editor gets edit mode at the rule's path", async () => {
    const { author } = await seedComparison();

    const page = await site.actingAs(author).visit("/compare/abc?plumix.edit");

    page
      .assertOk()
      .assertSee('<html lang="en" dir="ltr" data-plumix-mode="edit">');
  });

  test("a fixed slug names a nested entry without checking its ancestors", async () => {
    const parent = await createPage(site, { slug: "parent", title: "Parent" });
    await createPage(site, {
      slug: "shared-comparison",
      title: "Nested Comparison",
      parentId: parent.id,
    });

    const page = await site.visit("/compare/abc");

    page.assertOk().assertSee("<h1>Nested Comparison</h1>");
  });

  test("a preview token minted for another entry does not grant the named draft", async () => {
    const { author } = await seedComparison({ status: "draft" });
    const other = await createPage(site, {
      slug: "other-draft",
      title: "Other Draft",
      status: "draft",
    });
    const token = await createPreviewToken(site.context.db, {
      entryId: other.id,
      userId: author.id,
    });

    const page = await site.visit(`/compare/abc?preview=${token}`);

    page
      .assertNotFound()
      .assertHeader("x-plumix-hint", "public-post-not-found");
  });

  test("a fixed slug naming no entry is not found", async () => {
    const page = await site.visit("/compare/abc");

    page
      .assertNotFound()
      .assertHeader("x-plumix-hint", "public-post-not-found");
  });

  test("the entry's own permalink still serves it", async () => {
    await seedComparison();

    const page = await site.visit("/shared-comparison");

    page.assertOk().assertSee("<h1>Shared Comparison</h1>");
  });
});

const urlTheme = defineTheme({
  templates: [
    fallback(({ data }) =>
      "entry" in data
        ? createElement("h1", null, `url:${data.entry.url ?? "none"}`)
        : null,
    ),
  ],
});

const urlSite = await testSite({
  plugins: [comparePlugin],
  config: { theme: urlTheme },
});

describe("a fixed entry's url at a rewrite path", () => {
  test("the entry's url at the rule's path is still its permalink", async () => {
    await createPage(urlSite, {
      slug: "shared-comparison",
      title: "Shared Comparison",
    });

    const page = await urlSite.visit("/compare/abc");

    page.assertOk().assertSee("<h1>url:/shared-comparison</h1>");
  });
});

const capturing = definePlugin("compare-capturing", {
  setup: (ctx) => {
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      isHierarchical: true,
      rewrite: { slug: "" },
    });
    ctx.registerRewriteRule("/compare/:slug", {
      kind: "entry",
      entryType: "page",
      slug: "shared-comparison",
    });
    ctx.registerRewriteRule("/versus/:path*", {
      kind: "entry",
      entryType: "page",
      slug: "shared-comparison",
    });
  },
});

const capturingSite = await testSite({ plugins: [capturing] });

describe("a fixed slug beside a captured one", () => {
  test.each(["/compare/other", "/versus/other", "/versus/a/b"])(
    "a fixed slug wins over a captured slug or path param at %s",
    async (path) => {
      await createPage(capturingSite, {
        slug: "shared-comparison",
        title: "Shared Comparison",
      });
      await createPage(capturingSite, { slug: "other", title: "Other" });

      const page = await capturingSite.visit(path);

      page.assertOk().assertSee("<h1>Shared Comparison</h1>");
    },
  );
});

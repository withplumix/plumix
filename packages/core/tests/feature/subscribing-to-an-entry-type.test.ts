import { ORPCError } from "@orpc/server";
import { describe, expect, test } from "vitest";

import { entry } from "../../src/hooks/entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const published: string[] = [];

function publishedFor(slug: string): string[] {
  return published.filter((name) => name.endsWith(`:${slug}`)).sort();
}

const shop = definePlugin("shop", {
  setup: (ctx) => {
    // Subscribed first, so only the scoped-first rule puts it second.
    ctx.filters.add(entry.beforeSave, (row) => ({
      ...row,
      title: `${row.title} (every entry)`,
    }));
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    const product = ctx.registerEntryType("product", {
      label: "Products",
      isPublic: true,
    });
    ctx.events.on(product.published, ({ entry }) => {
      published.push(`product:${entry.slug}`);
    });
    ctx.events.on(entry.published, ({ entry }) => {
      published.push(`entry:${entry.slug}`);
    });
    ctx.filters.add(product.beforeSave, (row) => {
      if (row.slug === "recalled") {
        throw new ORPCError("CONFLICT", {
          message: "This product is recalled",
        });
      }
      return { ...row, title: `${row.title} (product)` };
    });
  },
});

/** A plugin that never saw the handle addresses the type by name. */
const catalog = definePlugin("catalog", {
  setup: (ctx) => {
    ctx.events.on(entry.for("product").published, ({ entry }) => {
      published.push(`catalog:${entry.slug}`);
    });
  },
});

const site = await testSite({ plugins: [shop, catalog] });

describe("a product entry", () => {
  test("publishing it runs its type's handler and every entry's handler, each once", async () => {
    await site.actingAs("editor").rpc.entry.create({
      type: "product",
      title: "Lamp",
      slug: "lamp",
      status: "published",
    });

    expect(publishedFor("lamp")).toEqual([
      "catalog:lamp",
      "entry:lamp",
      "product:lamp",
    ]);
  });

  test("a handler scoped by name runs where the registration's handle runs", async () => {
    await site.actingAs("editor").rpc.entry.create({
      type: "product",
      title: "Vase",
      slug: "vase",
      status: "published",
    });

    expect(publishedFor("vase")).toEqual([
      "catalog:vase",
      "entry:vase",
      "product:vase",
    ]);
  });
});

describe("an entry of another type", () => {
  test("publishing it runs only the handlers for every entry", async () => {
    await site.actingAs("editor").rpc.entry.create({
      type: "post",
      title: "News",
      slug: "news",
      status: "published",
    });

    expect(publishedFor("news")).toEqual(["entry:news"]);
  });
});

describe("saving a product entry", () => {
  test("runs the product's before-save handler before every entry's", async () => {
    const created = await site.actingAs("editor").rpc.entry.create({
      type: "product",
      title: "Desk",
      slug: "desk",
    });

    expect(created.title).toBe("Desk (product) (every entry)");
  });

  test("is refused with the error a before-save handler throws", async () => {
    const editor = site.actingAs("editor");

    const save = editor.rpc.entry.create({
      type: "product",
      title: "Chair",
      slug: "recalled",
    });

    await expect(save).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This product is recalled",
    });
    const rows = await editor.rpc.entry.list({ type: "product" });
    expect(rows.map((row) => row.slug)).not.toContain("recalled");
  });
});

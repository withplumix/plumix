import { describe, expect, test } from "vitest";

import { definePlugin } from "../plugin/define.js";
import {
  group,
  number,
  repeater,
  text,
  toggle,
} from "../plugin/fields/index.js";
import { createTracedContext } from "../test/traced-context.js";
import { eq, settleMeta } from "./public.js";
import { entries } from "./schema/index.js";

const plugin = definePlugin("test-settle-meta", (ctx) => {
  ctx.registerEntryMetaBox("entry-box", {
    label: "Entry",
    entryTypes: ["post"],
    fields: [
      toggle("featured"),
      text("subtitle"),
      number("rating"),
      repeater("links").fields([toggle("external"), number("order")]),
      group("seo").fields([
        toggle("noindex"),
        group("card").fields([number("width")]),
      ]),
    ],
  });
  ctx.registerTermTaxonomy("topic", { label: "Topics", entryTypes: ["post"] });
  ctx.registerTermMetaBox("term-box", {
    label: "Term",
    termTaxonomies: ["topic"],
    fields: [number("weight")],
  });
  ctx.registerUserMetaBox("user-box", {
    label: "User",
    fields: [toggle("newsletter")],
  });
  ctx.registerSettingsGroup("reading", {
    label: "Reading",
    fields: [number("perPage")],
  });
});

describe("settleMeta", () => {
  test("a bag written through drizzle reads back as its declared types", async () => {
    const { harness, ctx } = await createTracedContext({ plugins: [plugin] });
    const author = await harness.factory.user.create();
    const post = await harness.factory.entry.create({
      authorId: author.id,
      type: "post",
    });

    await ctx.db
      .update(entries)
      .set({
        meta: settleMeta(
          ctx,
          { entryType: "post" },
          { featured: 1, subtitle: 42, rating: "7" },
        ),
      })
      .where(eq(entries.id, post.id));

    const row = await ctx.db.query.entries.findFirst({
      where: eq(entries.id, post.id),
    });
    expect(row?.meta).toEqual({ featured: true, subtitle: "42", rating: 7 });
  });

  test("settles term and user meta and a settings group", async () => {
    const { ctx } = await createTracedContext({ plugins: [plugin] });

    expect(settleMeta(ctx, { taxonomy: "topic" }, { weight: "3" })).toEqual({
      weight: 3,
    });
    expect(settleMeta(ctx, "user", { newsletter: "true" })).toEqual({
      newsletter: true,
    });
    expect(
      settleMeta(ctx, { settingsGroup: "reading" }, { perPage: "10" }),
    ).toEqual({ perPage: 10 });
  });

  test("leaves a value no declared type accepts, and a key no field owns", async () => {
    const { ctx } = await createTracedContext({ plugins: [plugin] });

    expect(
      settleMeta(ctx, { entryType: "post" }, { rating: "nope", ghost: 1 }),
    ).toEqual({ rating: "nope", ghost: 1 });
  });

  test("settles repeater rows and groups at every level", async () => {
    const { ctx } = await createTracedContext({ plugins: [plugin] });

    expect(
      settleMeta(
        ctx,
        { entryType: "post" },
        {
          links: [{ external: 1, order: "2" }],
          seo: { noindex: "true", card: { width: "1200" } },
        },
      ),
    ).toEqual({
      links: [{ external: true, order: 2 }],
      seo: { noindex: true, card: { width: 1200 } },
    });
  });

  test("an entity with no registered fields passes the bag through", async () => {
    const { ctx } = await createTracedContext({ plugins: [plugin] });

    expect(settleMeta(ctx, { entryType: "page" }, { featured: 1 })).toEqual({
      featured: 1,
    });
  });
});

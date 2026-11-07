import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { definePlugin } from "../../src/plugin/define.js";
import { NAMED_TEMPLATE_META_KEY } from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
  },
});

const site = await testSite({ plugins: [posts] });

describe("updating an entry's named template", () => {
  test("stores the choice under the reserved template meta key", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      template: "landing",
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.meta[NAMED_TEMPLATE_META_KEY]).toBe("landing");
  });

  test("to null clears a stored choice", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });
    const rpc = site.actingAs(author).rpc;
    const chosen = await rpc.entry.update({
      id: own.id,
      template: "landing",
      ifMatch: etagOf(own.updatedAt),
    });

    const cleared = await rpc.entry.update({
      id: own.id,
      template: null,
      ifMatch: chosen.etag,
    });

    expect(cleared.meta[NAMED_TEMPLATE_META_KEY]).toBeUndefined();
  });

  test("left out keeps a stored choice", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });
    const rpc = site.actingAs(author).rpc;
    const chosen = await rpc.entry.update({
      id: own.id,
      template: "landing",
      ifMatch: etagOf(own.updatedAt),
    });

    const renamed = await rpc.entry.update({
      id: own.id,
      title: "renamed",
      ifMatch: chosen.etag,
    });

    expect(renamed.meta[NAMED_TEMPLATE_META_KEY]).toBe("landing");
  });

  test("can't be smuggled in through the meta bag under its reserved key", async () => {
    // No meta box registers the reserved key, so only `template` writes it.
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      meta: { [NAMED_TEMPLATE_META_KEY]: "landing" },
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered" },
    });
  });
});

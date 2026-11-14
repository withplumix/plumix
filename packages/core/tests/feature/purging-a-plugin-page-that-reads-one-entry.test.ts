import { describe, test } from "vitest";

import type { AppContext } from "../../src/context/app-context.js";
import type { Entry } from "../../src/db/schema/entries.js";
import { loadAuthoredEntry } from "../../src/entries/authored.js";
import { readEntryType } from "../../src/entries/read-service.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

/** Each public helper that loads a plugin one entry by id, by its path segment. */
const READS: Readonly<
  Record<string, (ctx: AppContext, id: number) => Promise<unknown>>
> = {
  type: readEntryType,
  authored: loadAuthoredEntry,
};

const reader = definePlugin("reader", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    for (const [helper, read] of Object.entries(READS)) {
      ctx.registerPublicRoute({
        path: `/read/${helper}/:id`,
        cacheable: true,
        handler: async (_request, appCtx, params) => {
          await read(appCtx, Number(params.id));
          return new Response(params.id);
        },
      });
    }
    ctx.registerRoute({
      method: "POST",
      path: "/retitle",
      auth: "authenticated",
      handler: async (request, appCtx) => {
        const query = new URL(request.url).searchParams;
        await appCtx.entries.update({
          id: Number(query.get("id")),
          title: "Retitled",
          ifMatch: new Date(query.get("ifMatch") ?? ""),
        });
        return new Response(null, { status: 204 });
      },
    });
  },
});

const site = await testSite({ plugins: [reader] });

async function retitle(entry: Entry): Promise<void> {
  const query = new URLSearchParams({
    id: String(entry.id),
    ifMatch: entry.updatedAt.toISOString(),
  });
  const path = `/_plumix/reader/retitle?${query.toString()}`;
  (await site.actingAs("admin").visit(path, { method: "POST" })).assertStatus(
    204,
  );
}

describe.each(Object.keys(READS))(
  "a plugin page that reads one entry through %s",
  (helper) => {
    test("is purged when that entry is updated", async () => {
      const post = await site.factory.published.create({ type: "post" });
      const path = `/read/${helper}/${String(post.id)}`;
      await site.visit(path);
      site.cdn.assertStored(path);

      await retitle(post);

      site.cdn.assertNotStored(path);
    });

    test("is kept when another entry of its type is updated", async () => {
      const post = await site.factory.published.create({ type: "post" });
      const other = await site.factory.published.create({ type: "post" });
      const path = `/read/${helper}/${String(post.id)}`;
      await site.visit(path);
      site.cdn.assertStored(path);

      await retitle(other);

      site.cdn.assertStored(path);
    });

    test("declares nothing for a missing entry", async () => {
      (await site.visit(`/read/${helper}/404404`)).assertHeaderMissing(
        "cache-tag",
      );
    });
  },
);

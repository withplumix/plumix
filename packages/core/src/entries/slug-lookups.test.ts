import { describe, expect, test } from "vitest";

import { eq } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { definePlugin } from "../plugin/define.js";
import { createTracedContext } from "../test/traced-context.js";
import { findAuthorBySlug, findTermBySlug } from "./slug-lookups.js";

// Both lookups memoize misses too, so a write in the same request must drop
// what it made stale.
describe("slug lookups after a write in the same request", () => {
  // A miss has no id to be tagged by, so both lookups carry the public types'
  // tags every user and term write announces — a site needs a public type.
  const blog = definePlugin("test-blog", (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerTermTaxonomy("category", {
      label: "Categories",
      entryTypes: ["post"],
    });
  });

  test("an author slug reads the user who holds it after a re-slug", async () => {
    const { harness, ctx, run } = await createTracedContext({
      config: { plugins: [blog] },
    });
    const user = await harness.factory.user.create({ slug: "ada" });

    const [oldBefore, newBefore, oldAfter, newAfter] = await run(async () => {
      const lookups = [
        await findAuthorBySlug(ctx, "ada"),
        await findAuthorBySlug(ctx, "grace"),
      ];
      const renamed = { ...user, slug: "grace" };
      await ctx.db
        .update(users)
        .set({ slug: "grace" })
        .where(eq(users.id, user.id));
      await ctx.hooks.doAction("user:updated", renamed, user, ctx);
      return [
        ...lookups,
        await findAuthorBySlug(ctx, "ada"),
        await findAuthorBySlug(ctx, "grace"),
      ];
    });

    expect(oldBefore?.id).toBe(user.id);
    expect(newBefore).toBeNull();
    expect(oldAfter).toBeNull();
    expect(newAfter?.id).toBe(user.id);
  });

  test("a term created after a lookup missed it is found", async () => {
    const { harness, ctx, run } = await createTracedContext({
      config: { plugins: [blog] },
    });

    const [before, after] = await run(async () => {
      const missed = await findTermBySlug(ctx, "category", "news");
      const term = await harness.factory.category.create({ slug: "news" });
      await ctx.hooks.doAction("term:created", term, ctx);
      return [missed, await findTermBySlug(ctx, "category", "news")];
    });

    expect(before).toBeNull();
    expect(after?.slug).toBe("news");
  });
});

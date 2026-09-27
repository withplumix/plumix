import { describe, expect, test } from "vitest";

import { and, eq } from "./db/index.js";
import { settings } from "./db/schema/settings.js";
import { settingsLoader } from "./template-deps-core.js";
import { createTracedContext } from "./test/traced-context.js";

describe("settingsLoader request memoization", () => {
  test("repeated reads of the same group run one query per request", async () => {
    const { harness, ctx, run, dbQueryCount } = await createTracedContext();
    await harness.factory.setting.create({
      group: "site",
      key: "title",
      value: "Plumix Demo",
    });
    await harness.factory.setting.create({
      group: "site",
      key: "tagline",
      value: "hello",
    });

    const [first, second] = await run(async () => [
      await settingsLoader(["site"], ctx),
      await settingsLoader(["site"], ctx),
    ]);

    expect(first).toEqual({
      site: { title: "Plumix Demo", tagline: "hello" },
    });
    expect(second).toEqual(first);
    expect(dbQueryCount()).toBe(1);
  });

  test("a later call only queries the groups not yet memoized", async () => {
    const { harness, ctx, run, dbQueryCount } = await createTracedContext();
    await harness.factory.setting.create({
      group: "site",
      key: "title",
      value: "Plumix Demo",
    });
    await harness.factory.setting.create({
      group: "author-info",
      key: "name",
      value: "Ada",
    });

    const [mixed, subset] = await run(async () => {
      await settingsLoader(["site"], ctx);
      return [
        await settingsLoader(["site", "author-info"], ctx),
        await settingsLoader(["author-info"], ctx),
      ];
    });

    expect(mixed).toEqual({
      site: { title: "Plumix Demo" },
      "author-info": { name: "Ada" },
    });
    expect(subset).toEqual({ "author-info": { name: "Ada" } });
    // ["site"] → one query; ["site", "author-info"] → the miss triggers
    // one batch (it re-reads both groups, but "site" keeps its memoized
    // bag); ["author-info"] → memo hit, no query.
    expect(dbQueryCount()).toBe(2);
  });

  test("groups with no rows stay absent from the result and are memoized", async () => {
    const { ctx, run, dbQueryCount } = await createTracedContext();

    const [first, second] = await run(async () => [
      await settingsLoader(["missing"], ctx),
      await settingsLoader(["missing"], ctx),
    ]);

    expect(first).toEqual({});
    expect(second).toEqual({});
    expect(dbQueryCount()).toBe(1);
  });

  test("a read after a write to the group in the same request sees the write", async () => {
    const { harness, ctx, run } = await createTracedContext();
    await harness.factory.setting.create({
      group: "site",
      key: "title",
      value: "Before",
    });

    const [before, after] = await run(async () => {
      const first = await settingsLoader(["site", "social"], ctx);
      await ctx.db
        .update(settings)
        .set({ value: "After" })
        .where(and(eq(settings.group, "site"), eq(settings.key, "title")));
      await ctx.db
        .insert(settings)
        .values({ group: "social", key: "handle", value: "@plumix" });
      await ctx.hooks.doAction(
        "settings:group_changed",
        { group: "site", set: { title: "After" }, removed: [] },
        ctx,
      );
      await ctx.hooks.doAction(
        "settings:group_changed",
        { group: "social", set: { handle: "@plumix" }, removed: [] },
        ctx,
      );
      return [first, await settingsLoader(["site", "social"], ctx)];
    });

    expect(before).toEqual({ site: { title: "Before" } });
    expect(after).toEqual({
      site: { title: "After" },
      social: { handle: "@plumix" },
    });
  });
});

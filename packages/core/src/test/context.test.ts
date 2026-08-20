import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";

import { HookRegistry } from "../hooks/registry.js";
import { createTestContext } from "./context.js";
import { applyTestSchema, createTestDb } from "./harness.js";

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "test:context": (value: string) => string;
  }
}

describe("createTestContext", () => {
  test("fills the collaborators a service function reads through", async () => {
    const db = await createTestDb();
    const ctx = createTestContext({ db });
    let loads = 0;
    const load = () => Promise.resolve(++loads);

    expect(ctx.db).toBe(db);
    expect(ctx.user).toBeNull();
    expect(ctx.auth.can("entry:read")).toBe(false);
    expect(await ctx.hooks.applyFilter("test:context", "unchanged")).toBe(
      "unchanged",
    );
    // The real read-through memo, not a pass-through stand-in.
    expect(await ctx.memo("k", load)).toBe(1);
    expect(await ctx.memo("k", load)).toBe(1);
  });

  test("carries a plugin db whose tables the core schema never declared", async () => {
    const widgets = sqliteTable("widgets", {
      id: integer("id").primaryKey(),
      name: text("name").notNull(),
    });
    const db = await createTestDb();
    await applyTestSchema(db, { widgets });
    const ctx = createTestContext({ db });

    await ctx.db.insert(widgets).values({ id: 1, name: "sprocket" });

    expect(await ctx.db.select().from(widgets)).toHaveLength(1);
  });

  test("overrides win over the defaults", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("test:context", (value) => value.toUpperCase());

    const ctx = createTestContext({
      db: await createTestDb(),
      hooks,
      basePath: "/cms",
      request: new Request("https://example.test/hello"),
    });

    expect(ctx.basePath).toBe("/cms");
    expect(ctx.request.url).toBe("https://example.test/hello");
    expect(await ctx.hooks.applyFilter("test:context", "hi")).toBe("HI");
  });
});

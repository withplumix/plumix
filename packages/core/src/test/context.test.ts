import { fileURLToPath } from "node:url";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";

import { defineFilter } from "../events-and-filters/define.js";
import { HandlerRegistry } from "../events-and-filters/registry.js";
import { createTestContext } from "./context.js";
import { applyTestSchema, createTestDb } from "./harness.js";

const label = defineFilter<string>("test:context", { sync: true });

describe("createTestContext", () => {
  test("fills the collaborators a service function reads through", async () => {
    const db = await createTestDb();
    const ctx = createTestContext({ db });
    let loads = 0;
    const load = () => Promise.resolve(++loads);

    expect(ctx.db).toBe(db);
    expect(ctx.user).toBeNull();
    expect(ctx.auth.can("entry:read")).toBe(false);
    expect(ctx.filters.apply(label, "unchanged")).toBe("unchanged");
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
    await applyTestSchema(
      db,
      fileURLToPath(new URL("fixtures/widgets/migrations", import.meta.url)),
    );
    const ctx = createTestContext({ db });

    await ctx.db.insert(widgets).values({ id: 1, name: "sprocket" });

    expect(await ctx.db.select().from(widgets)).toHaveLength(1);
  });

  test("overrides win over the defaults", async () => {
    const handlers = new HandlerRegistry();
    handlers.add(label, (value) => value.toUpperCase());

    const ctx = createTestContext({
      db: await createTestDb(),
      handlers,
      request: new Request("https://example.test/hello"),
      config: { basePath: "/cms" },
    });

    expect(ctx.config.basePath).toBe("/cms");
    expect(ctx.request.url).toBe("https://example.test/hello");
    expect(ctx.filters.apply(label, "hi")).toBe("HI");
  });
});

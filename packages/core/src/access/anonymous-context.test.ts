import { describe, expect, test } from "vitest";

import { asc } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { publicEntryRows } from "../entries/visibility.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { installPlugins } from "../runtime/install-plugins.js";
import { createTestContext } from "../test/context.js";
import { factoriesFor } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { anonymousContext } from "./anonymous-context.js";
import { ACCESS_POLICY_META_KEY } from "./contract/meta-key.js";
import { anonymousPolicy, authenticatedPolicy } from "./policy.js";

const pagesWithAccess = definePlugin("pages-with-access", (ctx) => {
  ctx.registerEntryType("page", {
    label: "Pages",
    isPublic: true,
    access: {
      default: anonymousPolicy,
      policies: [
        { key: "members", label: "Members", policy: authenticatedPolicy },
      ],
    },
  });
});

async function editorContext() {
  const db = await createTestDb();
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [pagesWithAccess],
  });
  const factory = factoriesFor(db);
  const editor = await factory.user.create({ role: "editor" });
  for (const [slug, meta] of [
    ["public-page", {}],
    ["members-page", { [ACCESS_POLICY_META_KEY]: "members" }],
  ] as const) {
    await factory.entry.create({
      type: "page",
      status: "published",
      publishedAt: new Date(),
      authorId: editor.id,
      slug,
      meta,
    });
  }
  return createTestContext({ db, plugins: registry, user: editor });
}

describe("anonymousContext", () => {
  test("publicEntryRows asked through it leaves out members entries whoever is signed in", async () => {
    const ctx = await editorContext();

    const clause = await publicEntryRows(anonymousContext(ctx));
    const rows =
      clause === null
        ? []
        : await ctx.db
            .select({ slug: entries.slug })
            .from(entries)
            .where(clause)
            .orderBy(asc(entries.id));

    expect(rows.map((row) => row.slug)).toEqual(["public-page"]);
  });

  test("carries no principal and holds no capability", async () => {
    const ctx = await editorContext();

    const anonymous = anonymousContext(ctx);

    expect(anonymous.user).toBeNull();
    expect(anonymous.tokenScopes).toBeNull();
    expect(anonymous.auth.can("entry:page:read")).toBe(false);
    expect(anonymous.db).toBe(ctx.db);
    expect(anonymous.plugins).toBe(ctx.plugins);
  });

  test("keeps its memo entries apart from the request's", async () => {
    const ctx = await editorContext();
    await ctx.memo("test:who", () => Promise.resolve("editor"));

    const seen = await anonymousContext(ctx).memo("test:who", () =>
      Promise.resolve("anonymous"),
    );

    expect(seen).toBe("anonymous");
  });
});

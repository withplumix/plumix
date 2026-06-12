import type { AppContext } from "plumix/plugin";
import { describe, expect, test } from "vitest";

import type { CommentsTestDb } from "./test/db.js";
import { resolveConfig } from "./config.js";
import { comments } from "./index.js";
import { createCommentsThreadLoader } from "./server/template-dep.js";
import { createCommentsTestDb, seedPublishedPost } from "./test/db.js";
import { commentFactory } from "./test/factories.js";

function ctxWith(
  db: CommentsTestDb,
  resolvedEntity: { kind: "entry"; id: number } | null,
): AppContext {
  return {
    db,
    resolvedEntity,
    plugins: { entryTypes: new Map() },
  } as unknown as AppContext;
}

async function seedApprovedPost(db: CommentsTestDb) {
  const entry = await seedPublishedPost(db);
  await commentFactory
    .transient({ db })
    .create({ entryId: entry.id, status: "approved", bodyMd: "hello" });
  return entry;
}

describe("comments() plugin", () => {
  test("descriptor exposes id, schema, and schemaModule", () => {
    const plugin = comments();
    expect(plugin.id).toBe("comments");
    expect(plugin.schemaModule).toBe("@plumix/plugin-comments/schema");
    expect(plugin.schema).toBeDefined();
  });

  test("setup registers the moderation surface", () => {
    const kinds: string[] = [];
    const routes: string[] = [];
    const capabilities: string[] = [];
    const adminPaths: string[] = [];
    let rpcRouter = false;
    const ctx = {
      registerTemplateDep: (kind: string) => kinds.push(kind),
      registerRoute: (opts: { path: string }) => routes.push(opts.path),
      registerCapability: (name: string) => capabilities.push(name),
      registerRpcRouter: () => {
        rpcRouter = true;
      },
      registerAdminPage: (opts: { path: string }) => adminPaths.push(opts.path),
    } as unknown as Parameters<ReturnType<typeof comments>["setup"]>[0];
    void comments().setup(ctx, undefined);
    expect(kinds).toContain("comments");
    expect(routes).toContain("/submit");
    expect(capabilities).toContain("comment:moderate");
    expect(adminPaths).toContain("/comments");
    expect(rpcRouter).toBe(true);
  });
});

describe("createCommentsThreadLoader", () => {
  test("loads the current entry's approved thread when enabled", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedApprovedPost(db);
    const load = createCommentsThreadLoader(
      resolveConfig({ entryTypes: ["post"] }),
    );

    const result = await load(
      ["current"],
      ctxWith(db, { kind: "entry", id: entry.id }),
    );

    expect(result.current?.count).toBe(1);
    expect(result.current?.comments[0]?.bodyHtml).toContain("hello");
  });

  test("yields nothing for a comment-disabled entry type", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedApprovedPost(db);
    const load = createCommentsThreadLoader(resolveConfig({}));

    const result = await load(
      ["current"],
      ctxWith(db, { kind: "entry", id: entry.id }),
    );

    expect(result.current).toBeUndefined();
  });

  test("yields nothing when there is no resolved entry", async () => {
    const db = await createCommentsTestDb();
    await seedApprovedPost(db);
    const load = createCommentsThreadLoader(
      resolveConfig({ entryTypes: ["post"] }),
    );

    const result = await load(["current"], ctxWith(db, null));

    expect(result.current).toBeUndefined();
  });
});

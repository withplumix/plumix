import type { AppContext } from "plumix/plugin";
import { HookRegistry, installPlugins } from "plumix/plugin";
import { createTestContext } from "plumix/test";
import { describe, expect, test, vi } from "vitest";

import type { CommentsTestDb } from "./test/db.js";
import type { CommentsConfig } from "./types.js";
import { resolveConfig } from "./config.js";
import { comments } from "./index.js";
import { createCommentsThreadLoader } from "./server/template-dep.js";
import { createCommentsTestDb, seedPublishedPost } from "./test/db.js";
import { commentFactory } from "./test/factories.js";

function ctxWith(
  db: CommentsTestDb,
  resolvedEntity: AppContext["resolvedEntity"],
): AppContext {
  return { ...createTestContext({ db }), resolvedEntity };
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

  interface CapturedSetup {
    readonly kinds: string[];
    readonly routes: string[];
    readonly restResources: string[];
    readonly capabilities: string[];
    readonly adminPaths: string[];
    readonly actions: string[];
    rpcRouter: boolean;
  }

  function captureSetup(config: CommentsConfig): CapturedSetup {
    const captured: CapturedSetup = {
      kinds: [],
      routes: [],
      restResources: [],
      capabilities: [],
      adminPaths: [],
      actions: [],
      rpcRouter: false,
    };
    const ctx = {
      registerTemplateDep: (kind: string) => captured.kinds.push(kind),
      registerRoute: (opts: { path: string }) =>
        captured.routes.push(opts.path),
      registerRestResource: (opts: { path: string }) =>
        captured.restResources.push(opts.path),
      registerCapability: (name: string) => captured.capabilities.push(name),
      registerRpcRouter: () => {
        captured.rpcRouter = true;
      },
      registerAdminPage: (opts: { path: string }) =>
        captured.adminPaths.push(opts.path),
      addAction: (name: string) => captured.actions.push(name),
    } as unknown as Parameters<ReturnType<typeof comments>["setup"]>[0];
    void comments(config).setup(ctx, undefined);
    return captured;
  }

  test("setup registers the moderation surface", () => {
    const s = captureSetup({});
    expect(s.kinds).toContain("comments");
    expect(s.routes).toContain("/submit");
    expect(s.restResources).toContain("/{collection}/{entry}/comments");
    expect(s.capabilities).toContain("comment:moderate");
    expect(s.adminPaths).toContain("/comments");
    expect(s.rpcRouter).toBe(true);
  });

  // The CDN purge listens always; the moderator email only with an address.
  test("adds a comment:created listener for notifyEmail only when it is set", () => {
    const created = (options: CommentsConfig) =>
      captureSetup(options).actions.filter((name) => name === "comment:created")
        .length;
    expect(created({})).toBe(1);
    expect(created({ notifyEmail: "mod@example.test" })).toBe(2);
  });
});

describe("moderator notification", () => {
  test("a comment held for review is mailed to the moderator", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const comment = await commentFactory
      .transient({ db })
      .create({ entryId: entry.id, status: "pending" });
    const hooks = new HookRegistry();
    const plugin = comments({ notifyEmail: "mod@example.test" });
    await installPlugins({ hooks, plugins: [plugin] });
    const send = vi.fn(() => Promise.resolve());
    // The config declares the plugin's mails, as a site's does.
    const ctx = createTestContext({
      db,
      hooks,
      config: { mailer: { send }, plugins: [plugin] },
    });

    await hooks.doAction("comment:created", comment, ctx);

    expect(send).toHaveBeenCalledOnce();
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
      { slugs: ["current"] },
      ctxWith(db, { kind: "entry", id: entry.id, preview: false }),
    );

    expect(result.current?.count).toBe(1);
    expect(result.current?.comments[0]?.bodyHtml).toContain("hello");
  });

  test("yields nothing for a comment-disabled entry type", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedApprovedPost(db);
    const load = createCommentsThreadLoader(resolveConfig({}));

    const result = await load(
      { slugs: ["current"] },
      ctxWith(db, { kind: "entry", id: entry.id, preview: false }),
    );

    expect(result.current).toBeUndefined();
  });

  test("yields nothing when there is no resolved entry", async () => {
    const db = await createCommentsTestDb();
    await seedApprovedPost(db);
    const load = createCommentsThreadLoader(
      resolveConfig({ entryTypes: ["post"] }),
    );

    const result = await load({ slugs: ["current"] }, ctxWith(db, null));

    expect(result.current).toBeUndefined();
  });
});

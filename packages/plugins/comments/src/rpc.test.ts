import type { RequestAuthenticator, User, UserRole } from "plumix/plugin";
import { createRouterClient } from "@orpc/server";
import {
  createAppContext,
  createPluginRegistry,
  HookRegistry,
  installPlugins,
} from "plumix/plugin";
import { editorUser, factoriesFor } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { ModerationCommentDTO } from "./rpc.js";
import type { CommentStatus } from "./types.js";
import { comments } from "./index.js";
import { createCommentsTestDb, seedPublishedPost } from "./test/db.js";
import { commentFactory } from "./test/factories.js";

interface Client {
  readonly comments: {
    readonly list: (input: {
      status: CommentStatus;
      limit?: number;
      offset?: number;
    }) => Promise<ModerationCommentDTO[]>;
    readonly counts: () => Promise<Record<CommentStatus, number>>;
    readonly approve: (input: { id: number }) => Promise<{ status: string }>;
    readonly spam: (input: { id: number }) => Promise<{ status: string }>;
    readonly trash: (input: { id: number }) => Promise<{ status: string }>;
    readonly restore: (input: { id: number }) => Promise<{ status: string }>;
    readonly purge: (input: { id: number }) => Promise<{ result: string }>;
  };
}

function stubAuthenticator(user: User): RequestAuthenticator {
  return { authenticate: () => Promise.resolve({ user, tokenScopes: null }) };
}

async function buildHarness(role: UserRole = "editor") {
  const db = await createCommentsTestDb();
  const hooks = new HookRegistry();
  const registry = createPluginRegistry();
  await installPlugins({ hooks, plugins: [comments()], registry });

  const user =
    role === "editor"
      ? await editorUser.transient({ db }).create({})
      : await factoriesFor(db).user.create({ role });

  const ctx = createAppContext({
    db,
    env: {},
    request: new Request("https://cms.example/_plumix/rpc", { method: "POST" }),
    hooks,
    plugins: registry,
    user: { id: user.id, email: user.email, role: user.role, meta: {} },
    authenticator: stubAuthenticator(user),
    origin: "https://cms.example",
  });

  const router = registry.rpcRouters.get("comments");
  if (!router) throw new Error("comments router not registered");
  const client = createRouterClient(
    { comments: router },
    { context: ctx },
  ) as unknown as Client;
  return { db, hooks, user, client };
}

describe("comments moderation RPC", () => {
  test("list returns one status tab, newest-first", async () => {
    const h = await buildHarness();
    const entry = await seedPublishedPost(h.db);
    const seed = commentFactory.transient({ db: h.db });
    await seed.create({ entryId: entry.id, status: "pending", bodyMd: "p1" });
    await seed.create({ entryId: entry.id, status: "approved", bodyMd: "a1" });

    const rows = await h.client.comments.list({ status: "pending" });
    expect(rows.map((r) => r.bodyMd)).toEqual(["p1"]);
    expect(typeof rows[0]?.createdAt).toBe("string");
  });

  test("counts returns a tally per status", async () => {
    const h = await buildHarness();
    const entry = await seedPublishedPost(h.db);
    const seed = commentFactory.transient({ db: h.db });
    await seed.create({ entryId: entry.id, status: "pending" });
    await seed.create({ entryId: entry.id, status: "pending" });

    expect((await h.client.comments.counts()).pending).toBe(2);
  });

  test("approve transitions the comment and fires comment:approved", async () => {
    const h = await buildHarness();
    const entry = await seedPublishedPost(h.db);
    const c = await commentFactory
      .transient({ db: h.db })
      .create({ entryId: entry.id, status: "pending" });
    let fired = 0;
    h.hooks.addAction("comment:approved", () => {
      fired += 1;
    });

    const res = await h.client.comments.approve({ id: c.id });
    expect(res.status).toBe("approved");
    expect(fired).toBe(1);
    expect((await h.client.comments.counts()).approved).toBe(1);
  });

  test("spam and trash fire their actions", async () => {
    const h = await buildHarness();
    const entry = await seedPublishedPost(h.db);
    const seed = commentFactory.transient({ db: h.db });
    const a = await seed.create({ entryId: entry.id, status: "pending" });
    const b = await seed.create({ entryId: entry.id, status: "pending" });
    let spam = 0;
    let trashed = 0;
    h.hooks.addAction("comment:spam", () => {
      spam += 1;
    });
    h.hooks.addAction("comment:trashed", () => {
      trashed += 1;
    });

    await h.client.comments.spam({ id: a.id });
    await h.client.comments.trash({ id: b.id });
    expect([spam, trashed]).toEqual([1, 1]);
  });

  test("restore returns a comment to the approved queue", async () => {
    const h = await buildHarness();
    const entry = await seedPublishedPost(h.db);
    const c = await commentFactory
      .transient({ db: h.db })
      .create({ entryId: entry.id, status: "trash" });

    const res = await h.client.comments.restore({ id: c.id });
    expect(res.status).toBe("approved");
  });

  test("purge deletes a leaf comment", async () => {
    const h = await buildHarness();
    const entry = await seedPublishedPost(h.db);
    const c = await commentFactory
      .transient({ db: h.db })
      .create({ entryId: entry.id, status: "spam" });

    expect((await h.client.comments.purge({ id: c.id })).result).toBe(
      "deleted",
    );
  });

  test("a non-moderator is forbidden from every procedure", async () => {
    const h = await buildHarness("subscriber");
    // list/counts return the PII-bearing payload; the capability gate is
    // the only thing protecting it, so assert the read + a mutation deny.
    await expect(h.client.comments.counts()).rejects.toThrow();
    await expect(
      h.client.comments.list({ status: "pending" }),
    ).rejects.toThrow();
    await expect(h.client.comments.purge({ id: 1 })).rejects.toThrow();
  });
});

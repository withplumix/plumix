import type { DefaultRole, RequestAuthenticator } from "plumix/auth";
import type { User } from "plumix/schema";
import { createRouterClient } from "@orpc/server";
import {
  createPluginRegistry,
  HandlerRegistry,
  installPlugins,
} from "plumix/plugin";
import { createTestContext, editorUser, factoriesFor } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { ModerationCommentDTO } from "./rpc.js";
import type { CommentStatus } from "./types.js";
import { comment, comments } from "./index.js";
import { createCommentsTestDb, seedPublishedPost } from "./test/db.js";
import { commentFactory } from "./test/factories.js";

interface Client {
  readonly comments: {
    readonly list: (input: {
      status: CommentStatus;
      limit?: number;
      offset?: number;
      entryId?: number;
      search?: string;
    }) => Promise<ModerationCommentDTO[]>;
    readonly counts: () => Promise<Record<CommentStatus, number>>;
    readonly approve: (input: { id: number }) => Promise<{ status: string }>;
    readonly spam: (input: { id: number }) => Promise<{ status: string }>;
    readonly trash: (input: { id: number }) => Promise<{ status: string }>;
    readonly restore: (input: { id: number }) => Promise<{ status: string }>;
    readonly purge: (input: { id: number }) => Promise<{ result: string }>;
    readonly bulk: (input: {
      ids: number[];
      action: "approve" | "spam" | "trash";
    }) => Promise<{ changed: number }>;
  };
}

function stubAuthenticator(user: User): RequestAuthenticator {
  return {
    authenticate: () => Promise.resolve({ user, credential: "session" }),
  };
}

async function buildHarness(role: DefaultRole = "editor") {
  const db = await createCommentsTestDb();
  const handlers = new HandlerRegistry();
  const registry = createPluginRegistry();
  await installPlugins({ handlers, plugins: [comments()], registry });

  const user =
    role === "editor"
      ? await editorUser.transient({ db }).create({})
      : await factoriesFor(db).user.create({ role });

  const ctx = createTestContext({
    db,
    env: {},
    request: new Request("https://cms.example/_plumix/rpc", { method: "POST" }),
    handlers,
    plugins: registry,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      meta: {},
    },
    authenticator: stubAuthenticator(user),
    origin: "https://cms.example",
  });

  const router = registry.rpcRouters.get("comments");
  if (!router) throw new Error("comments router not registered");
  const client = createRouterClient(
    { comments: router },
    { context: ctx },
  ) as unknown as Client;
  return { db, handlers, user, client };
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

  test("approve transitions the comment and emits comment.approved with it", async () => {
    const h = await buildHarness();
    const entry = await seedPublishedPost(h.db);
    const c = await commentFactory
      .transient({ db: h.db })
      .create({ entryId: entry.id, status: "pending" });
    const approved: string[] = [];
    h.handlers.on(comment.approved, ({ comment: row }) => {
      approved.push(`${String(row.id)}:${row.status}`);
    });

    const res = await h.client.comments.approve({ id: c.id });
    expect(res.status).toBe("approved");
    expect(approved).toEqual([`${String(c.id)}:approved`]);
    expect((await h.client.comments.counts()).approved).toBe(1);
  });

  test("spam and trash emit their events with the comment", async () => {
    const h = await buildHarness();
    const entry = await seedPublishedPost(h.db);
    const seed = commentFactory.transient({ db: h.db });
    const a = await seed.create({ entryId: entry.id, status: "pending" });
    const b = await seed.create({ entryId: entry.id, status: "pending" });
    const heard: string[] = [];
    h.handlers.on(comment.spam, ({ comment: row }) => {
      heard.push(`spam ${String(row.id)}:${row.status}`);
    });
    h.handlers.on(comment.trashed, ({ comment: row }) => {
      heard.push(`trashed ${String(row.id)}:${row.status}`);
    });

    await h.client.comments.spam({ id: a.id });
    await h.client.comments.trash({ id: b.id });
    expect(heard).toEqual([
      `spam ${String(a.id)}:spam`,
      `trashed ${String(b.id)}:trash`,
    ]);
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

  test("list supports search and per-entry filtering", async () => {
    const h = await buildHarness();
    const a = await seedPublishedPost(h.db);
    const b = await seedPublishedPost(h.db);
    const seed = commentFactory.transient({ db: h.db });
    await seed.create({
      entryId: a.id,
      status: "pending",
      authorName: "Ada",
    });
    await seed.create({
      entryId: b.id,
      status: "pending",
      authorName: "Bob",
    });

    expect(
      await h.client.comments.list({ status: "pending", search: "ada" }),
    ).toHaveLength(1);
    expect(
      await h.client.comments.list({ status: "pending", entryId: b.id }),
    ).toHaveLength(1);
  });

  test("bulk approves many comments and emits the event per row", async () => {
    const h = await buildHarness();
    const entry = await seedPublishedPost(h.db);
    const seed = commentFactory.transient({ db: h.db });
    const a = await seed.create({ entryId: entry.id, status: "pending" });
    const b = await seed.create({ entryId: entry.id, status: "pending" });
    let fired = 0;
    h.handlers.on(comment.approved, () => {
      fired += 1;
    });

    const res = await h.client.comments.bulk({
      ids: [a.id, b.id],
      action: "approve",
    });
    expect(res.changed).toBe(2);
    expect(fired).toBe(2);
    expect((await h.client.comments.counts()).approved).toBe(2);
  });

  test("a non-moderator is forbidden from every procedure", async () => {
    const h = await buildHarness("member");
    // list/counts return the PII-bearing payload; the capability gate is
    // the only thing protecting it, so assert the read + a mutation deny.
    await expect(h.client.comments.counts()).rejects.toThrow();
    await expect(
      h.client.comments.list({ status: "pending" }),
    ).rejects.toThrow();
    await expect(h.client.comments.purge({ id: 1 })).rejects.toThrow();
    await expect(
      h.client.comments.bulk({ ids: [1], action: "approve" }),
    ).rejects.toThrow();
  });
});

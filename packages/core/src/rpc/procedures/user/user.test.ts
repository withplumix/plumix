import { describe, expect, test } from "vitest";

import { eq } from "../../../db/index.js";
import { posts } from "../../../db/schema/posts.js";
import { sessions } from "../../../db/schema/sessions.js";
import { users } from "../../../db/schema/users.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("user.list", () => {
  test("editor+ can list users; others get FORBIDDEN", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.user.create({ email: "a@example.test" });
    const rows = await h.client.user.list({});
    expect(rows.length).toBeGreaterThanOrEqual(2); // the authed editor + the created user
  });

  test("subscriber cannot list users", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    await expect(h.client.user.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:list" },
    });
  });

  test("role filter narrows results", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.factory.editor.create({ email: "e@example.test" });
    await h.factory.subscriber.create({ email: "s@example.test" });
    const editors = await h.client.user.list({ role: "editor" });
    expect(editors.every((u) => u.role === "editor")).toBe(true);
    expect(editors.some((u) => u.email === "e@example.test")).toBe(true);
  });

  test("search filters by email substring", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.factory.user.create({ email: "alice@example.test" });
    await h.factory.user.create({ email: "bob@example.test" });
    const matched = await h.client.user.list({ search: "alice" });
    expect(matched.map((u) => u.email)).toEqual(["alice@example.test"]);
  });
});

describe("user.get", () => {
  test("self-lookup always allowed (no user:list needed)", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const got = await h.client.user.get({ id: h.user.id });
    expect(got.id).toBe(h.user.id);
  });

  test("subscriber looking up another user is FORBIDDEN", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const other = await h.factory.user.create({ email: "other@example.test" });
    await expect(h.client.user.get({ id: other.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("editor can look up any user", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const other = await h.factory.subscriber.create();
    const got = await h.client.user.get({ id: other.id });
    expect(got.id).toBe(other.id);
  });

  test("404 when the target id does not exist", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(h.client.user.get({ id: 999999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("user.invite", () => {
  test("admin can invite; returns user row + opaque invite token", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const { user, inviteToken } = await h.client.user.invite({
      email: "new@example.test",
      role: "author",
    });
    expect(user.email).toBe("new@example.test");
    expect(user.role).toBe("author");
    expect(typeof inviteToken).toBe("string");
    expect(inviteToken.length).toBeGreaterThan(20);
  });

  test("editor cannot invite (user:create is admin-only)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(
      h.client.user.invite({ email: "x@example.test" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:create" },
    });
  });

  test("duplicate email → CONFLICT", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.factory.user.create({ email: "dup@example.test" });
    await expect(
      h.client.user.invite({ email: "dup@example.test" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "email_taken" },
    });
  });
});

describe("user.update", () => {
  test("subscriber can edit own profile (name)", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const updated = await h.client.user.update({
      id: h.user.id,
      name: "Renamed",
    });
    expect(updated.name).toBe("Renamed");
  });

  test("subscriber cannot change own role", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    await expect(
      h.client.user.update({ id: h.user.id, role: "admin" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:promote" },
    });
  });

  test("subscriber cannot edit another user", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const other = await h.factory.user.create({ email: "o@example.test" });
    await expect(
      h.client.user.update({ id: other.id, name: "hi" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:edit" },
    });
  });

  test("admin can promote another user", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.editor.create();
    const updated = await h.client.user.update({
      id: target.id,
      role: "admin",
    });
    expect(updated.role).toBe("admin");
  });

  test("promoting demotes existing sessions for the target", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.editor.create();
    // Seed a session so we can verify invalidation happens.
    await h.context.db.insert(sessions).values({
      id: "seed-session-id",
      userId: target.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await h.client.user.update({ id: target.id, role: "author" });

    const remaining = await h.context.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, target.id));
    expect(remaining).toEqual([]);
  });

  test("cannot demote the last active admin", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.user.update({ id: h.user.id, role: "editor" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "last_admin" },
    });
  });

  test("demoting an admin works when another active admin exists", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.factory.admin.create({ email: "other-admin@example.test" });
    const updated = await h.client.user.update({
      id: h.user.id,
      role: "editor",
    });
    expect(updated.role).toBe("editor");
  });

  test("duplicate email on update → CONFLICT", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const a = await h.factory.user.create({ email: "a@example.test" });
    await h.factory.user.create({ email: "b@example.test" });
    await expect(
      h.client.user.update({ id: a.id, email: "b@example.test" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "email_taken" },
    });
  });
});

describe("user.disable", () => {
  test("admin can disable a user; sessions get invalidated", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.editor.create();
    await h.context.db.insert(sessions).values({
      id: "disable-target-session",
      userId: target.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const updated = await h.client.user.disable({ id: target.id });
    expect(updated.disabledAt).toBeInstanceOf(Date);

    const remaining = await h.context.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, target.id));
    expect(remaining).toEqual([]);
  });

  test("cannot disable the last active admin", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.user.disable({ id: h.user.id }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "last_admin" },
    });
  });

  test("disabling an already-disabled user is idempotent", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.editor.create();
    const first = await h.client.user.disable({ id: target.id });
    const second = await h.client.user.disable({ id: target.id });
    expect(second.disabledAt).toEqual(first.disabledAt);
  });
});

describe("user.delete", () => {
  test("admin can delete a user with no authored posts", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.subscriber.create();
    const deleted = await h.client.user.delete({ id: target.id });
    expect(deleted.id).toBe(target.id);

    const after = await h.context.db.query.users.findFirst({
      where: eq(users.id, target.id),
    });
    expect(after).toBeUndefined();
  });

  test("refuses to delete a user with posts when no reassign target given", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const author = await h.factory.author.create();
    await h.factory.post.create({ authorId: author.id });
    await expect(h.client.user.delete({ id: author.id })).rejects.toMatchObject(
      {
        code: "CONFLICT",
        data: { reason: "has_posts" },
      },
    );
  });

  test("reassigns posts when reassignPostsTo is provided", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const author = await h.factory.author.create();
    const heir = await h.factory.author.create();
    const post = await h.factory.post.create({ authorId: author.id });

    await h.client.user.delete({ id: author.id, reassignPostsTo: heir.id });

    const moved = await h.context.db.query.posts.findFirst({
      where: eq(posts.id, post.id),
    });
    expect(moved?.authorId).toBe(heir.id);
  });

  test("cannot delete the last active admin", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(h.client.user.delete({ id: h.user.id })).rejects.toMatchObject(
      {
        code: "CONFLICT",
        data: { reason: "last_admin" },
      },
    );
  });

  test("editor cannot delete users", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const target = await h.factory.subscriber.create();
    await expect(h.client.user.delete({ id: target.id })).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
        data: { capability: "user:delete" },
      },
    );
  });
});

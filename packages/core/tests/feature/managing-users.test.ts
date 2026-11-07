import { describe, expect, test } from "vitest";

import { eq, sql } from "../../src/db/index.js";
import { entries } from "../../src/db/schema/entries.js";
import { sessions } from "../../src/db/schema/sessions.js";
import { users } from "../../src/db/schema/users.js";
import { user } from "../../src/rpc/procedures/user/subject.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

describe("listing users", () => {
  test("an editor lists every user", async () => {
    const editor = await site.factory.editor.create();
    await site.factory.user.create({ email: "a@example.test" });

    const rows = await site.actingAs(editor).rpc.user.list({});

    expect(rows).toHaveLength(2);
  });

  test("a member is refused", async () => {
    const list = site.actingAs("member").rpc.user.list({});

    await expect(list).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:list" },
    });
  });

  test("a role filter lists only users of that role", async () => {
    await site.factory.editor.create({ email: "e@example.test" });
    await site.factory.member.create({ email: "s@example.test" });

    const editors = await site
      .actingAs("admin")
      .rpc.user.list({ role: "editor" });

    expect(editors.map((row) => [row.email, row.role])).toEqual([
      ["e@example.test", "editor"],
    ]);
  });

  test("a search lists the users whose email holds it", async () => {
    await site.factory.user.create({ email: "alice@example.test" });
    await site.factory.user.create({ email: "bob@example.test" });

    const matched = await site
      .actingAs("admin")
      .rpc.user.list({ search: "alice" });

    expect(matched.map((row) => row.email)).toEqual(["alice@example.test"]);
  });
});

describe("reading a user", () => {
  test("a member reads their own profile without user:list", async () => {
    const member = await site.factory.member.create();

    const got = await site.actingAs(member).rpc.user.get({ id: member.id });

    expect(got.id).toBe(member.id);
  });

  test("a member reading another user is refused", async () => {
    const other = await site.factory.user.create({
      email: "other@example.test",
    });

    const get = site.actingAs("member").rpc.user.get({ id: other.id });

    await expect(get).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("an editor reads any user", async () => {
    const other = await site.factory.member.create();

    const got = await site.actingAs("editor").rpc.user.get({ id: other.id });

    expect(got.id).toBe(other.id);
  });

  test("a user that doesn't exist is not found", async () => {
    const get = site.actingAs("admin").rpc.user.get({ id: 999999 });

    await expect(get).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("inviting a user", () => {
  test("an admin's invite returns the user and an opaque invite token", async () => {
    const { user: invited, inviteToken } = await site
      .actingAs("admin")
      .rpc.user.invite({ email: "new@example.test", role: "author" });

    expect(invited).toMatchObject({
      email: "new@example.test",
      role: "author",
    });
    expect(inviteToken).toEqual(expect.any(String));
    expect(inviteToken.length).toBeGreaterThan(20);
  });

  test("an invite naming no role invites a member, on the user and its token", async () => {
    const { user: invited } = await site
      .actingAs("admin")
      .rpc.user.invite({ email: "new@example.test" });

    expect(invited.role).toBe("member");
    expect(
      await site.context.db.all(
        sql`SELECT role FROM auth_tokens WHERE type = 'invite' AND email = 'new@example.test'`,
      ),
    ).toEqual([{ role: "member" }]);
  });

  test("an editor is refused, since user:create is admin-only", async () => {
    const invite = site
      .actingAs("editor")
      .rpc.user.invite({ email: "x@example.test" });

    await expect(invite).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:create" },
    });
  });

  test("an email another user has is a conflict", async () => {
    await site.factory.user.create({ email: "dup@example.test" });

    const invite = site
      .actingAs("admin")
      .rpc.user.invite({ email: "dup@example.test" });

    await expect(invite).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "email_taken" },
    });
  });

  test("the author slug is derived from the invited name", async () => {
    const { user: invited } = await site
      .actingAs("admin")
      .rpc.user.invite({ email: "jane@example.test", name: "Jane Doe" });

    expect(invited.slug).toBe("jane-doe");
  });

  test("concurrent invites with the same name get distinct slugs", async () => {
    const admin = site.actingAs("admin");

    const [a, b] = await Promise.all([
      admin.rpc.user.invite({ email: "a@example.test", name: "Jane" }),
      admin.rpc.user.invite({ email: "b@example.test", name: "Jane" }),
    ]);

    // The slug-race retry (or the dedup read) must hand each a distinct slug —
    // and a slug collision must never be misreported as an email conflict.
    expect(a.user.slug).not.toBe(b.user.slug);
  });

  test("emits user.invited with the token and who invited, for a plugin to mail", async () => {
    const admin = await site.factory.admin.create();

    const { user: invited, inviteToken } = await site
      .actingAs(admin)
      .rpc.user.invite({ email: "plugin@example.test", role: "member" });

    expect(site.events.emitted(user.invited)).toMatchObject([
      {
        user: { id: invited.id },
        inviteToken,
        invitedBy: admin.id,
      },
    ]);
    expect(site.events.emitted(user.invited)[0]?.expiresAt).toBeInstanceOf(
      Date,
    );
  });
});

describe("disabling a user", () => {
  test("an admin disables a user and ends their sessions", async () => {
    const target = await site.factory.editor.create();
    await site.factory.session.create({
      id: "disable-target-session",
      userId: target.id,
    });

    const updated = await site
      .actingAs("admin")
      .rpc.user.disable({ id: target.id });

    expect(updated.disabledAt).toBeInstanceOf(Date);
    expect(
      await site.context.db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, target.id)),
    ).toEqual([]);
  });

  test("the last active admin can't be disabled", async () => {
    const admin = await site.factory.admin.create();

    const disable = site.actingAs(admin).rpc.user.disable({ id: admin.id });

    await expect(disable).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "last_admin" },
    });
  });

  test("disabling a disabled user again leaves it as it was", async () => {
    const admin = site.actingAs("admin");
    const target = await site.factory.editor.create();
    const first = await admin.rpc.user.disable({ id: target.id });

    const second = await admin.rpc.user.disable({ id: target.id });

    expect(second.disabledAt).toEqual(first.disabledAt);
  });

  test("emits user.statusChanged with enabled false", async () => {
    const target = await site.factory.member.create();

    await site.actingAs("admin").rpc.user.disable({ id: target.id });

    expect(site.events.emitted(user.statusChanged)).toMatchObject([
      { enabled: false },
    ]);
  });
});

describe("enabling a user", () => {
  test("an admin re-enables a disabled user", async () => {
    const admin = site.actingAs("admin");
    const target = await site.factory.member.create();
    await admin.rpc.user.disable({ id: target.id });

    const enabled = await admin.rpc.user.enable({ id: target.id });

    expect(enabled.disabledAt).toBeNull();
  });

  test("enabling an active user leaves it active", async () => {
    const target = await site.factory.member.create();

    const result = await site
      .actingAs("admin")
      .rpc.user.enable({ id: target.id });

    expect(result.disabledAt).toBeNull();
  });

  test("an editor is refused, since user:edit is admin-only here", async () => {
    const target = await site.factory.member.create();

    const enable = site.actingAs("editor").rpc.user.enable({ id: target.id });

    await expect(enable).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:edit" },
    });
  });

  test("emits user.statusChanged with enabled true", async () => {
    const target = await site.factory.member.create({
      disabledAt: new Date("2026-01-01T00:00:00Z"),
    });

    await site.actingAs("admin").rpc.user.enable({ id: target.id });

    expect(site.events.emitted(user.statusChanged)).toMatchObject([
      { enabled: true },
    ]);
  });

  test("enabling an active user emits no user.statusChanged", async () => {
    const target = await site.factory.member.create();

    await site.actingAs("admin").rpc.user.enable({ id: target.id });

    site.events.assertNotEmitted(user.statusChanged);
  });
});

describe("deleting a user", () => {
  test("an admin deletes a user who authored no entries", async () => {
    const target = await site.factory.member.create();

    const deleted = await site
      .actingAs("admin")
      .rpc.user.delete({ id: target.id });

    expect(deleted.id).toBe(target.id);
    expect(
      await site.context.db.query.users.findFirst({
        where: eq(users.id, target.id),
      }),
    ).toBeUndefined();
  });

  test("a user with entries and no one to reassign them to is kept", async () => {
    const author = await site.factory.author.create();
    await site.factory.entry.create({ authorId: author.id });

    const remove = site.actingAs("admin").rpc.user.delete({ id: author.id });

    await expect(remove).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "has_entries" },
    });
  });

  test("reassigns the user's entries to reassignTo", async () => {
    const author = await site.factory.author.create();
    const heir = await site.factory.author.create();
    const post = await site.factory.entry.create({ authorId: author.id });

    await site
      .actingAs("admin")
      .rpc.user.delete({ id: author.id, reassignTo: heir.id });

    const moved = await site.context.db.query.entries.findFirst({
      where: eq(entries.id, post.id),
    });
    expect(moved?.authorId).toBe(heir.id);
  });

  test("the last active admin can't be deleted", async () => {
    const admin = await site.factory.admin.create();

    const remove = site.actingAs(admin).rpc.user.delete({ id: admin.id });

    await expect(remove).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "last_admin" },
    });
  });

  test("an editor is refused", async () => {
    const target = await site.factory.member.create();

    const remove = site.actingAs("editor").rpc.user.delete({ id: target.id });

    await expect(remove).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:delete" },
    });
  });

  test("emits user.deleted with reassignedTo null when the user had no entries", async () => {
    const target = await site.factory.member.create();

    await site.actingAs("admin").rpc.user.delete({ id: target.id });

    expect(site.events.emitted(user.deleted)).toMatchObject([
      { reassignedTo: null },
    ]);
  });

  test("emits user.deleted with the heir's id when entries were reassigned", async () => {
    const author = await site.factory.author.create();
    const heir = await site.factory.author.create();
    await site.factory.draft.create({ authorId: author.id, slug: "orphan" });

    await site
      .actingAs("admin")
      .rpc.user.delete({ id: author.id, reassignTo: heir.id });

    expect(site.events.emitted(user.deleted)).toMatchObject([
      { reassignedTo: heir.id },
    ]);
  });
});

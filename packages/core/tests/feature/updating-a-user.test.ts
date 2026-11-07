import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { eq } from "../../src/db/index.js";
import { sessions } from "../../src/db/schema/sessions.js";
import { user } from "../../src/rpc/procedures/user/subject.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

describe("a member updating their own profile", () => {
  test("renames themselves", async () => {
    const member = await site.factory.member.create();

    const updated = await site.actingAs(member).rpc.user.update({
      id: member.id,
      ifMatch: etagOf(member.updatedAt),
      name: "Renamed",
    });

    expect(updated.name).toBe("Renamed");
  });

  test("can't change their own role", async () => {
    const member = await site.factory.member.create();

    const update = site.actingAs(member).rpc.user.update({
      id: member.id,
      ifMatch: etagOf(member.updatedAt),
      role: "admin",
    });

    await expect(update).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:promote" },
    });
  });

  test("can't edit another user", async () => {
    const other = await site.factory.user.create({ email: "o@example.test" });

    const update = site.actingAs("member").rpc.user.update({
      id: other.id,
      ifMatch: etagOf(other.updatedAt),
      name: "hi",
    });

    await expect(update).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:edit" },
    });
  });

  test("changes their own author slug", async () => {
    const member = await site.factory.member.create();

    const updated = await site.actingAs(member).rpc.user.update({
      id: member.id,
      ifMatch: etagOf(member.updatedAt),
      slug: "renamed-author",
    });

    expect(updated.slug).toBe("renamed-author");
  });

  test("re-saving their own slug unchanged is no conflict", async () => {
    const member = await site.factory.member.create({ slug: "my-slug" });

    const updated = await site.actingAs(member).rpc.user.update({
      id: member.id,
      ifMatch: etagOf(member.updatedAt),
      slug: "my-slug",
    });

    expect(updated.slug).toBe("my-slug");
  });

  test("a slug that isn't URL-safe kebab-case is refused", async () => {
    const member = await site.factory.member.create();

    const update = site.actingAs(member).rpc.user.update({
      id: member.id,
      ifMatch: etagOf(member.updatedAt),
      slug: "Not A Slug",
    });

    await expect(update).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // `email` is deliberately absent from `user.update`: a silent change would
  // let a hijacked session redirect a user's recovery address.
});

describe("an admin updating a user", () => {
  test("promotes another user", async () => {
    const target = await site.factory.editor.create();

    const updated = await site.actingAs("admin").rpc.user.update({
      id: target.id,
      ifMatch: etagOf(target.updatedAt),
      role: "admin",
    });

    expect(updated.role).toBe("admin");
  });

  test("changing a user's role ends their sessions", async () => {
    const target = await site.factory.editor.create();
    await site.factory.session.create({
      id: "seed-session-id",
      userId: target.id,
    });

    await site.actingAs("admin").rpc.user.update({
      id: target.id,
      ifMatch: etagOf(target.updatedAt),
      role: "author",
    });

    expect(
      await site.context.db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, target.id)),
    ).toEqual([]);
  });

  test("can't demote the last active admin", async () => {
    const admin = await site.factory.admin.create();

    const update = site.actingAs(admin).rpc.user.update({
      id: admin.id,
      ifMatch: etagOf(admin.updatedAt),
      role: "editor",
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "last_admin" },
    });
  });

  test("demotes themselves while another active admin remains", async () => {
    const admin = await site.factory.admin.create();
    await site.factory.admin.create({ email: "other-admin@example.test" });

    const updated = await site.actingAs(admin).rpc.user.update({
      id: admin.id,
      ifMatch: etagOf(admin.updatedAt),
      role: "editor",
    });

    expect(updated.role).toBe("editor");
  });

  test("changes another user's slug", async () => {
    const target = await site.factory.user.create({ email: "t@example.test" });

    const updated = await site.actingAs("admin").rpc.user.update({
      id: target.id,
      ifMatch: etagOf(target.updatedAt),
      slug: "new-slug",
    });

    expect(updated.slug).toBe("new-slug");
  });

  test("taking another user's slug is a conflict, not a silent dedup", async () => {
    const admin = await site.factory.admin.create();
    await site.factory.user.create({
      email: "other@example.test",
      slug: "taken",
    });

    const update = site.actingAs(admin).rpc.user.update({
      id: admin.id,
      ifMatch: etagOf(admin.updatedAt),
      slug: "taken",
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
  });

  test("emits user.updated with the user before the update", async () => {
    const target = await site.factory.member.create({ name: "Before" });

    await site.actingAs("admin").rpc.user.update({
      id: target.id,
      ifMatch: etagOf(target.updatedAt),
      name: "After",
    });

    expect(site.events.emitted(user.updated)).toMatchObject([
      { user: { name: "After" }, previous: { name: "Before" } },
    ]);
  });
});

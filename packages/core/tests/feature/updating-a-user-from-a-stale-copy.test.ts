import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { eq } from "../../src/db/index.js";
import { users } from "../../src/db/schema/users.js";
import { definePlugin } from "../../src/plugin/define.js";
import { number, text } from "../../src/plugin/fields/index.js";
import { testSite } from "../../src/test/site.js";

/** A plugin's own write, run by `interrupted`'s validator mid-save. */
const midSaveWrites: (() => Promise<void>)[] = [];

const profiles = definePlugin("profiles", {
  setup: (ctx) => {
    ctx.registerUserMetaBox("profile", {
      label: "Profile",
      fields: [
        text("bio"),
        number("age"),
        // Validated after the save read the user, so a write here lands
        // between that read and the save's own write.
        text("interrupted").validate(async (): Promise<true> => {
          await midSaveWrites.shift()?.();
          return true;
        }),
      ],
    });
  },
});

const site = await testSite({ plugins: [profiles] });

async function storedUser(id: number) {
  return site.context.db.query.users.findFirst({ where: eq(users.id, id) });
}

describe("saving a user from a copy (ifMatch)", () => {
  test("a save from a stale copy is refused and leaves the row and meta as they were", async () => {
    const target = await site.factory.editor.create({
      name: "Theirs",
      meta: { bio: "theirs" },
      updatedAt: new Date("2026-10-18T12:00:05Z"),
    });

    const update = site.actingAs("admin").rpc.user.update({
      id: target.id,
      name: "Mine",
      meta: { bio: "mine" },
      ifMatch: etagOf(new Date("2026-10-18T12:00:00Z")),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: {
        reason: "etag_mismatch",
        etag: "1792324805",
        updatedAt: new Date("2026-10-18T12:00:05Z"),
      },
    });
    expect(await storedUser(target.id)).toMatchObject({
      name: "Theirs",
      meta: { bio: "theirs" },
      updatedAt: new Date("2026-10-18T12:00:05Z"),
    });
  });

  test("a write that lands mid-save, after the save read the user, makes the save conflict", async () => {
    const target = await site.factory.editor.create({ name: "Before" });
    midSaveWrites.push(async () => {
      await site.context.db
        .update(users)
        .set({ name: "Theirs" })
        .where(eq(users.id, target.id));
    });

    const update = site.actingAs("admin").rpc.user.update({
      id: target.id,
      name: "Mine",
      meta: { interrupted: "mine" },
      ifMatch: etagOf(target.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch" },
    });
    expect(await storedUser(target.id)).toMatchObject({
      name: "Theirs",
      meta: {},
    });
  });

  test("two saves in the same second leave different etags, and the first one's is refused", async () => {
    const admin = site.actingAs("admin");
    const target = await site.factory.editor.create({
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });
    const first = await admin.rpc.user.update({
      id: target.id,
      name: "First",
      ifMatch: etagOf(target.updatedAt),
    });
    const second = await admin.rpc.user.update({
      id: target.id,
      name: "Second",
      ifMatch: first.etag,
    });

    const update = admin.rpc.user.update({
      id: target.id,
      name: "From the first copy",
      ifMatch: first.etag,
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: second.etag },
    });
    expect([first.etag, second.etag]).toEqual(["4102444801", "4102444802"]);
  });

  test("of saves racing from one copy, exactly one lands", async () => {
    const admin = site.actingAs("admin");
    const target = await site.factory.editor.create();
    const ifMatch = etagOf(target.updatedAt);

    const outcomes = await Promise.allSettled([
      admin.rpc.user.update({ id: target.id, name: "a", ifMatch }),
      admin.rpc.user.update({ id: target.id, name: "b", ifMatch }),
      admin.rpc.user.update({ id: target.id, name: "c", ifMatch }),
      admin.rpc.user.update({ id: target.id, name: "d", ifMatch }),
      admin.rpc.user.update({ id: target.id, name: "e", ifMatch }),
      admin.rpc.user.update({ id: target.id, name: "f", ifMatch }),
      admin.rpc.user.update({ id: target.id, name: "g", ifMatch }),
      admin.rpc.user.update({ id: target.id, name: "h", ifMatch }),
    ]);

    const conflict = {
      status: "rejected",
      reason: { code: "CONFLICT", data: { reason: "etag_mismatch" } },
    };
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toMatchObject([
      conflict,
      conflict,
      conflict,
      conflict,
      conflict,
      conflict,
      conflict,
    ]);
  });

  test("a save without ifMatch is refused with where to find the etag", async () => {
    const member = await site.factory.member.create();

    const update = site
      .actingAs(member)
      // @ts-expect-error -- the caller left out its copy's token
      .rpc.user.update({ id: member.id, name: "No token" });

    await expect(update).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: {
        issues: [
          { message: "Send the user's `etag` from `user.get` as `ifMatch`" },
        ],
      },
    });
  });

  test("a caller who may not edit the user is refused even with a stale copy, so a conflict reveals nothing", async () => {
    const other = await site.factory.editor.create();

    const update = site.actingAs("member").rpc.user.update({
      id: other.id,
      name: "x",
      ifMatch: etagOf(new Date("2020-01-01T00:00:00Z")),
    });

    await expect(update).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:edit" },
    });
  });

  test("demoting the last active admin from a current copy is still refused", async () => {
    const admin = await site.factory.admin.create({
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });

    const update = site.actingAs(admin).rpc.user.update({
      id: admin.id,
      role: "editor",
      ifMatch: "4102444800",
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "last_admin" },
    });
    expect(await storedUser(admin.id)).toMatchObject({
      role: "admin",
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });
  });
});

describe("the user's token outside a save from a copy", () => {
  test("a meta settle on user.get leaves the token, so a save from that read lands", async () => {
    const admin = site.actingAs("admin");
    const target = await site.factory.editor.create({
      // Unsettled: a string where the field stores a number.
      meta: { age: "30" },
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const opened = await admin.rpc.user.get({ id: target.id });

    const saved = await admin.rpc.user.update({
      id: target.id,
      name: "Saved",
      ifMatch: opened.etag,
    });

    expect(opened).toMatchObject({ meta: { age: 30 }, etag: "1767225600" });
    expect(saved.name).toBe("Saved");
  });

  test("disable moves the token, so a copy taken before it conflicts", async () => {
    const admin = site.actingAs("admin");
    const target = await site.factory.editor.create({
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });
    const beforeDisable = await admin.rpc.user.get({ id: target.id });
    const disabled = await admin.rpc.user.disable({ id: target.id });

    const update = admin.rpc.user.update({
      id: target.id,
      name: "From before disable",
      ifMatch: beforeDisable.etag,
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: "4102444801" },
    });
    expect([beforeDisable.etag, disabled.etag]).toEqual([
      "4102444800",
      "4102444801",
    ]);
  });

  test("enable moves the token, so a copy taken before it conflicts", async () => {
    const admin = site.actingAs("admin");
    const target = await site.factory.editor.create({
      disabledAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });
    const beforeEnable = await admin.rpc.user.get({ id: target.id });
    const enabled = await admin.rpc.user.enable({ id: target.id });

    const update = admin.rpc.user.update({
      id: target.id,
      name: "From before enable",
      ifMatch: beforeEnable.etag,
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: "4102444801" },
    });
    expect([beforeEnable.etag, enabled.etag]).toEqual([
      "4102444800",
      "4102444801",
    ]);
  });
});

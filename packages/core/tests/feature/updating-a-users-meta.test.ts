import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { eq } from "../../src/db/index.js";
import { users } from "../../src/db/schema/users.js";
import { definePlugin } from "../../src/plugin/define.js";
import { text } from "../../src/plugin/fields/index.js";
import { user } from "../../src/rpc/procedures/user/subject.js";
import { testSite } from "../../src/test/site.js";

const profiles = definePlugin("profiles", {
  setup: (ctx) => {
    ctx.registerUserMetaBox("profile", {
      label: "Profile",
      fields: [
        { key: "bio", label: "Bio", type: "string", inputType: "textarea" },
        {
          key: "newsletter",
          label: "Newsletter",
          type: "boolean",
          inputType: "checkbox",
        },
        { key: "age", label: "Age", type: "number", inputType: "number" },
        text("pronouns").default("they/them"),
        { key: "layout", label: "Layout", type: "string", inputType: "text" },
        {
          key: "video_url",
          label: "Video",
          type: "string",
          inputType: "text",
          required: true,
          visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
        },
      ],
    });
  },
});

const site = await testSite({ plugins: [profiles] });

async function storedUser(id: number) {
  return site.context.db.query.users.findFirst({ where: eq(users.id, id) });
}

describe("a user's meta: conditional fields", () => {
  // Users share the meta pipeline, so an edit that switches a required field
  // visible has to supply it here too.
  test("an update that switches a required field visible without it is refused", async () => {
    const admin = await site.factory.admin.create({
      meta: { layout: "standard" },
    });

    const update = site.actingAs(admin).rpc.user.update({
      id: admin.id,
      ifMatch: etagOf(admin.updatedAt),
      meta: { layout: "video" },
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });
});

describe("a user's meta, saved through user.update", () => {
  test("registered keys persist and read back through user.get", async () => {
    const admin = await site.factory.admin.create();
    const acting = site.actingAs(admin);
    const updated = await acting.rpc.user.update({
      id: admin.id,
      ifMatch: etagOf(admin.updatedAt),
      meta: { bio: "Hi there", newsletter: true },
    });

    const reloaded = await acting.rpc.user.get({ id: admin.id });

    expect(updated.meta).toEqual({ bio: "Hi there", newsletter: true });
    expect(reloaded.meta).toEqual({ bio: "Hi there", newsletter: true });
  });

  test("a key no meta box registers is a conflict", async () => {
    const admin = await site.factory.admin.create();

    const update = site.actingAs(admin).rpc.user.update({
      id: admin.id,
      ifMatch: etagOf(admin.updatedAt),
      meta: { mystery: "x" },
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered", key: "mystery" },
    });
  });

  test("a patch changes only the keys it names", async () => {
    const admin = await site.factory.admin.create({
      meta: { bio: "hello", newsletter: false },
    });

    const updated = await site.actingAs(admin).rpc.user.update({
      id: admin.id,
      ifMatch: etagOf(admin.updatedAt),
      meta: { newsletter: true },
    });

    expect(updated.meta).toEqual({ bio: "hello", newsletter: true });
  });

  test("a null in a patch deletes the key, as term meta does", async () => {
    const admin = await site.factory.admin.create({
      meta: { bio: "hello", newsletter: true },
    });

    const updated = await site.actingAs(admin).rpc.user.update({
      id: admin.id,
      ifMatch: etagOf(admin.updatedAt),
      meta: { bio: null },
    });

    expect(updated.meta).toEqual({ newsletter: true });
  });

  test("emits user.metaChanged with the keys set", async () => {
    const admin = await site.factory.admin.create();

    await site.actingAs(admin).rpc.user.update({
      id: admin.id,
      ifMatch: etagOf(admin.updatedAt),
      meta: { bio: "hello" },
    });

    expect(site.events.emitted(user.metaChanged)).toMatchObject([
      { changes: { set: { bio: "hello" }, removed: [] } },
    ]);
  });

  test("emits user.metaChanged with the keys removed", async () => {
    const admin = await site.factory.admin.create({ meta: { bio: "hello" } });

    await site.actingAs(admin).rpc.user.update({
      id: admin.id,
      ifMatch: etagOf(admin.updatedAt),
      meta: { bio: null },
    });

    expect(site.events.emitted(user.metaChanged)).toMatchObject([
      { changes: { set: {}, removed: ["bio"] } },
    ]);
  });

  test("an empty meta patch emits no user.metaChanged", async () => {
    const admin = await site.factory.admin.create();

    await site.actingAs(admin).rpc.user.update({
      id: admin.id,
      ifMatch: etagOf(admin.updatedAt),
      meta: {},
    });

    site.events.assertNotEmitted(user.metaChanged);
  });
});

// The user half of #2440. A profile opened by its owner or an admin settles
// like an entry does, and — users carrying `updatedAt` as entries do — without
// reading as an edit.
describe("user.get on an unsettled row", () => {
  test("hands back the settled value, writes it, and leaves updatedAt alone", async () => {
    // Straight to the column, as `plumix/db` lets a plugin do.
    const admin = await site.factory.admin.create({
      meta: { age: "30", newsletter: "true" },
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const got = await site.actingAs(admin).rpc.user.get({ id: admin.id });

    expect(got.meta).toEqual({ age: 30, newsletter: true });
    expect(await storedUser(admin.id)).toMatchObject({
      meta: { age: 30, newsletter: true },
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });
});

describe("an invited user's starting meta", () => {
  test("holds the user fields' defaults", async () => {
    const { user: invited } = await site
      .actingAs("admin")
      .rpc.user.invite({ email: "new@example.com", role: "author" });

    expect((await storedUser(invited.id))?.meta).toEqual({
      pronouns: "they/them",
    });
  });
});

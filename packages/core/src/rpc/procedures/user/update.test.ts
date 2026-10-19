import { describe, expect, test } from "vitest";

import type { MutablePluginRegistry } from "../../../plugin/manifest.js";
import { etagOf } from "../../../db/concurrency.js";
import { acquireEditLease, readEditLease } from "../../../db/edit-lease.js";
import { eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { text } from "../../../plugin/fields/index.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";

function withAge(): MutablePluginRegistry {
  const plugins = createPluginRegistry();
  plugins.userMetaBoxes.set("profile", {
    id: "profile",
    label: "Profile",
    fields: [{ key: "age", label: "Age", type: "number", inputType: "number" }],
    registeredBy: "test",
  });
  return plugins;
}

function withBio(): MutablePluginRegistry {
  const plugins = createPluginRegistry();
  plugins.userMetaBoxes.set("profile", {
    id: "profile",
    label: "Profile",
    fields: [{ key: "bio", label: "Bio", type: "string", inputType: "text" }],
    registeredBy: "test",
  });
  return plugins;
}

describe("user.update concurrency token (ifMatch)", () => {
  test("a save from a stale copy is refused and leaves the row and meta as they were", async () => {
    const h = await createRpcHarness({ authAs: "admin", plugins: withBio() });
    const target = await h.factory.editor.create({
      name: "Theirs",
      meta: { bio: "theirs" },
      updatedAt: new Date("2026-10-18T12:00:05Z"),
    });

    await expect(
      h.client.user.update({
        id: target.id,
        name: "Mine",
        meta: { bio: "mine" },
        ifMatch: etagOf(new Date("2026-10-18T12:00:00Z")),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: {
        reason: "etag_mismatch",
        etag: "1792324805",
        updatedAt: new Date("2026-10-18T12:00:05Z"),
      },
    });
    expect(
      await h.db.query.users.findFirst({ where: eq(users.id, target.id) }),
    ).toMatchObject({
      name: "Theirs",
      meta: { bio: "theirs" },
      updatedAt: new Date("2026-10-18T12:00:05Z"),
    });
  });

  test("a write that lands mid-save, after the save read the user, makes the save conflict", async () => {
    const plugins = createPluginRegistry();
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const target = await h.factory.editor.create({ name: "Before" });
    // A plugin's own write, landing after the save read the user.
    plugins.userMetaBoxes.set("profile", {
      id: "profile",
      label: "Profile",
      fields: [
        text("bio")
          .validate(async (): Promise<true> => {
            await h.db
              .update(users)
              .set({ name: "Theirs" })
              .where(eq(users.id, target.id));
            return true;
          })
          .build(),
      ],
      registeredBy: "test",
    });

    await expect(
      h.client.user.update({
        id: target.id,
        name: "Mine",
        meta: { bio: "mine" },
        ifMatch: etagOf(target.updatedAt),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch" },
    });
    expect(
      await h.db.query.users.findFirst({ where: eq(users.id, target.id) }),
    ).toMatchObject({ name: "Theirs", meta: {} });
  });

  test("two saves in the same second leave different etags, and the first one's is refused", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.editor.create({
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });
    const first = await h.client.user.update({
      id: target.id,
      name: "First",
      ifMatch: etagOf(target.updatedAt),
    });
    const second = await h.client.user.update({
      id: target.id,
      name: "Second",
      ifMatch: first.etag,
    });

    await expect(
      h.client.user.update({
        id: target.id,
        name: "From the first copy",
        ifMatch: first.etag,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: second.etag },
    });
    expect([first.etag, second.etag]).toEqual(["4102444801", "4102444802"]);
  });

  test("of saves racing from one copy, exactly one lands", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.editor.create();
    const ifMatch = etagOf(target.updatedAt);

    const outcomes = await Promise.allSettled(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((name) =>
        h.client.user.update({ id: target.id, name, ifMatch }),
      ),
    );

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(
      outcomes
        .filter((o) => o.status === "rejected")
        .map((o): unknown => o.reason),
    ).toMatchObject(
      Array.from({ length: 7 }, () => ({
        code: "CONFLICT",
        data: { reason: "etag_mismatch" },
      })),
    );
  });

  test("a save without ifMatch is refused with where to find the etag", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });

    await expect(
      // @ts-expect-error -- the caller left out its copy's token
      h.client.user.update({ id: h.user.id, name: "No token" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: {
        issues: [
          { message: "Send the user's `etag` from `user.get` as `ifMatch`" },
        ],
      },
    });
  });

  test("an unauthorised caller with a stale copy still gets FORBIDDEN (no CONFLICT oracle)", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const other = await h.factory.editor.create();

    await expect(
      h.client.user.update({
        id: other.id,
        name: "x",
        ifMatch: etagOf(new Date("2020-01-01T00:00:00Z")),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:edit" },
    });
  });

  test("demoting the last active admin from a current copy is still refused", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const self = await h.client.user.get({ id: h.user.id });

    await expect(
      h.client.user.update({
        id: h.user.id,
        role: "editor",
        ifMatch: self.etag,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "last_admin" },
    });
    expect(await h.client.user.get({ id: h.user.id })).toMatchObject({
      role: "admin",
      etag: self.etag,
    });
  });
});

describe("the user's token outside a save from a copy", () => {
  test("a meta settle on user.get leaves the token, so a save from that read lands", async () => {
    const h = await createRpcHarness({ authAs: "admin", plugins: withAge() });
    const target = await h.factory.editor.create({
      // Unsettled: a string where the field stores a number.
      meta: { age: "30" },
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const opened = await h.client.user.get({ id: target.id });
    const saved = await h.client.user.update({
      id: target.id,
      name: "Saved",
      ifMatch: opened.etag,
    });

    expect(opened).toMatchObject({ meta: { age: 30 }, etag: "1767225600" });
    expect(saved.name).toBe("Saved");
  });

  test("disable and enable move the token, so a copy taken before each conflicts", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.editor.create({
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });
    const beforeDisable = await h.client.user.get({ id: target.id });

    const disabled = await h.client.user.disable({ id: target.id });
    const beforeEnable = await h.client.user.get({ id: target.id });
    const enabled = await h.client.user.enable({ id: target.id });

    expect([beforeDisable.etag, disabled.etag, enabled.etag]).toEqual([
      "4102444800",
      "4102444801",
      "4102444802",
    ]);
    await expect(
      h.client.user.update({
        id: target.id,
        name: "From before enable",
        ifMatch: beforeEnable.etag,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: "4102444802" },
    });
  });
});

describe("user.update under an edit lease", () => {
  test("another admin's save during a live lease is refused with who holds it", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const ada = await h.factory.admin.create({ name: "Ada" });
    const target = await h.factory.editor.create();
    const since = new Date();
    await acquireEditLease(
      h.db,
      { kind: "user", id: target.id },
      { userId: ada.id, surface: "admin" },
      since,
    );

    await expect(
      h.client.user.update({
        id: target.id,
        name: "Mine",
        ifMatch: etagOf(target.updatedAt),
      }),
    ).rejects.toMatchObject({
      code: "LOCKED",
      status: 423,
      data: { holder: { id: ada.id, name: "Ada" }, since },
    });
  });

  test("a save that passes takeOver lands and takes the lease over", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const ada = await h.factory.admin.create({ name: "Ada" });
    const target = await h.factory.editor.create();
    await acquireEditLease(
      h.db,
      { kind: "user", id: target.id },
      { userId: ada.id, surface: "admin" },
    );

    const saved = await h.client.user.update({
      id: target.id,
      name: "Mine",
      ifMatch: etagOf(target.updatedAt),
      takeOver: true,
    });

    expect(saved.name).toBe("Mine");
    expect(
      await readEditLease(h.db, { kind: "user", id: target.id }),
    ).toMatchObject({ holder: { id: h.user.id } });
  });

  test("a stale save names who holds the lease in its conflict", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const ada = await h.factory.admin.create({ name: "Ada" });
    const asAda = await h.actingAs(ada);
    const target = await h.factory.editor.create();
    await acquireEditLease(
      h.db,
      { kind: "user", id: target.id },
      { userId: ada.id, surface: "admin" },
    );

    await expect(
      asAda.client.user.update({
        id: target.id,
        name: "From a stale tab",
        ifMatch: etagOf(new Date("2020-01-01T00:00:00Z")),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", holder: { id: ada.id, name: "Ada" } },
    });
  });
});

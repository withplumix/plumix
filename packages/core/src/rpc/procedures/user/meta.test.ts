import { describe, expect, test } from "vitest";

import type {
  MetaBoxField,
  MutablePluginRegistry,
} from "../../../plugin/manifest.js";
import { eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";
import { loadUserMeta } from "./meta.js";

function registerUserFields(
  plugins: MutablePluginRegistry,
  fields: MetaBoxField[],
  id = "test-user-box",
): void {
  plugins.userMetaBoxes.set(id, {
    id,
    label: "Test",
    fields,
    registeredBy: "test",
  });
}

describe("user meta: conditional fields", () => {
  // Users share the meta pipeline, so an edit that switches a required field
  // visible has to supply it here too.
  test("an update that switches a required field visible without it is rejected", async () => {
    const plugins = createPluginRegistry();
    registerUserFields(plugins, [
      { key: "layout", label: "Layout", type: "string", inputType: "text" },
      {
        key: "video_url",
        label: "Video",
        type: "string",
        inputType: "text",
        required: true,
        visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
      },
    ]);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    await h.client.user.update({ id: h.user.id, meta: { layout: "standard" } });

    await expect(
      h.client.user.update({ id: h.user.id, meta: { layout: "video" } }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });
});

describe("user meta: registration + round-trip via user.update", () => {
  test("registered meta keys persist through user.update + user.get", async () => {
    const plugins = createPluginRegistry();
    registerUserFields(plugins, [
      { key: "bio", label: "Bio", type: "string", inputType: "textarea" },
      {
        key: "newsletter",
        label: "Newsletter",
        type: "boolean",
        inputType: "checkbox",
      },
    ]);
    const h = await createRpcHarness({ authAs: "admin", plugins });

    const updated = await h.client.user.update({
      id: h.user.id,
      meta: { bio: "Hi there", newsletter: true },
    });
    expect(updated.meta).toEqual({ bio: "Hi there", newsletter: true });

    const reloaded = await h.client.user.get({ id: h.user.id });
    expect(reloaded.meta).toEqual({ bio: "Hi there", newsletter: true });
  });

  test("unregistered meta key is rejected with CONFLICT", async () => {
    const plugins = createPluginRegistry();
    const h = await createRpcHarness({ authAs: "admin", plugins });

    await expect(
      h.client.user.update({
        id: h.user.id,
        meta: { mystery: "x" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered", key: "mystery" },
    });
  });

  test("user.update partial patch + null-delete semantics match term.meta", async () => {
    const plugins = createPluginRegistry();
    registerUserFields(plugins, [
      { key: "bio", label: "Bio", type: "string", inputType: "textarea" },
      {
        key: "newsletter",
        label: "Newsletter",
        type: "boolean",
        inputType: "checkbox",
      },
    ]);
    const h = await createRpcHarness({ authAs: "admin", plugins });

    await h.client.user.update({
      id: h.user.id,
      meta: { bio: "hello", newsletter: false },
    });

    // Partial patch: only `newsletter` is touched; `bio` survives.
    const afterFlip = await h.client.user.update({
      id: h.user.id,
      meta: { newsletter: true },
    });
    expect(afterFlip.meta).toEqual({ bio: "hello", newsletter: true });

    // Null deletes the key.
    const afterClear = await h.client.user.update({
      id: h.user.id,
      meta: { bio: null },
    });
    expect(afterClear.meta).toEqual({ newsletter: true });
  });

  test("user:meta_changed fires with the upsert + delete diff", async () => {
    const plugins = createPluginRegistry();
    registerUserFields(plugins, [
      { key: "bio", label: "Bio", type: "string", inputType: "textarea" },
    ]);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const spy = h.spyAction("user:meta_changed");

    await h.client.user.update({ id: h.user.id, meta: { bio: "hello" } });
    await h.client.user.update({ id: h.user.id, meta: { bio: null } });

    expect(spy.calls).toHaveLength(2);
    expect(spy.calls[0]?.args[1]).toEqual({
      set: { bio: "hello" },
      removed: [],
    });
    expect(spy.calls[1]?.args[1]).toEqual({ set: {}, removed: ["bio"] });
  });

  test("user.update with an empty meta patch does not fire user:meta_changed", async () => {
    const plugins = createPluginRegistry();
    registerUserFields(plugins, [
      { key: "bio", label: "Bio", type: "string", inputType: "textarea" },
    ]);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const spy = h.spyAction("user:meta_changed");

    await h.client.user.update({ id: h.user.id, meta: {} });

    expect(spy.calls).toHaveLength(0);
  });

  // The entry surface's twin: a boolean field reads as stored, handed back as
  // the string itself rather than resolved either way.
  test("a legacy string boolean reads back as the stored string", async () => {
    const plugins = createPluginRegistry();
    registerUserFields(plugins, [
      {
        key: "newsletter",
        label: "Newsletter",
        type: "boolean",
        inputType: "checkbox",
      },
    ]);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    // Seed as if a prior schema version stored the string "false"
    // directly — bypass sanitize by writing to the column ourselves.
    await h.context.db
      .update(users)
      .set({ meta: { newsletter: "false" } })
      .where(eq(users.id, h.user.id));

    expect(await loadUserMeta(h.context, { id: h.user.id })).toEqual({
      newsletter: "false",
    });
  });
});

// The user half of #2440. A profile opened by its owner or an admin settles
// like an entry does, and — users carrying `updatedAt` as entries do — without
// reading as an edit.
describe("user.get settles an unsettled row", () => {
  test("hands back the settled value, writes it, and leaves updatedAt alone", async () => {
    const plugins = createPluginRegistry();
    registerUserFields(plugins, [
      { key: "age", label: "Age", type: "number", inputType: "number" },
      {
        key: "newsletter",
        label: "Newsletter",
        type: "boolean",
        inputType: "checkbox",
      },
    ]);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const lastEdited = new Date("2026-01-01T00:00:00.000Z");
    // Straight to the column, as `plumix/db` lets a plugin do.
    await h.db
      .update(users)
      .set({ meta: { age: "30", newsletter: "true" }, updatedAt: lastEdited })
      .where(eq(users.id, h.user.id));

    const got = await h.client.user.get({ id: h.user.id });
    expect(got.meta).toEqual({ age: 30, newsletter: true });

    const stored = await h.db.query.users.findFirst({
      where: eq(users.id, h.user.id),
    });
    expect(stored?.meta).toEqual({ age: 30, newsletter: true });
    expect(stored?.updatedAt).toEqual(lastEdited);
  });
});

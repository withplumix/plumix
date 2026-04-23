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

  // Regression: `Boolean("false") === true` would silently flip rows
  // written via `type: "json"` before a plugin tightened the field to
  // `boolean`. `coerceOnRead` mirrors the write-side token set instead.
  test("coerceOnRead maps legacy string booleans to their real values", async () => {
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
      newsletter: false,
    });
  });
});

import { describe, expect, test } from "vitest";

import { and, eq } from "../../../db/index.js";
import { settings } from "../../../db/schema/settings.js";
import { HookRegistry } from "../../../hooks/registry.js";
import { definePlugin } from "../../../plugin/define.js";
import { number, select, text, url } from "../../../plugin/fields/index.js";
import { installPlugins } from "../../../runtime/install-plugins.js";
import { loadSettingsGroups } from "../../../seo/site-settings.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("settings.get", () => {
  test("admin reads an empty group as an empty bag", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const bag = await h.client.settings.get({ group: "general" });
    expect(bag).toEqual({});
  });

  test("admin reads saved keys back", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.factory.setting.create({
      group: "general",
      key: "site_title",
      value: "Example",
    });
    await h.factory.setting.create({
      group: "general",
      key: "tagline",
      value: "A site",
    });
    const bag = await h.client.settings.get({ group: "general" });
    expect(bag).toEqual({ site_title: "Example", tagline: "A site" });
  });

  test("group scoping: only the requested group is returned", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.factory.setting.create({
      group: "general",
      key: "site_title",
      value: "G",
    });
    await h.factory.setting.create({
      group: "reading",
      key: "per_page",
      value: "10",
    });
    expect(await h.client.settings.get({ group: "general" })).toEqual({
      site_title: "G",
    });
    expect(await h.client.settings.get({ group: "reading" })).toEqual({
      per_page: "10",
    });
  });

  test("non-admin is rejected with FORBIDDEN (settings:manage gate)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(
      h.client.settings.get({ group: "general" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "settings:manage" },
    });
  });
});

describe("settings.upsert", () => {
  test("writes new rows then reads them back", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const result = await h.client.settings.upsert({
      group: "general",
      values: { site_title: "Example", tagline: "A site" },
    });
    expect(result).toEqual({ site_title: "Example", tagline: "A site" });
  });

  test("partial patch: unmentioned keys survive", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.settings.upsert({
      group: "general",
      values: { site_title: "v1", tagline: "t1" },
    });
    const after = await h.client.settings.upsert({
      group: "general",
      values: { site_title: "v2" },
    });
    expect(after).toEqual({ site_title: "v2", tagline: "t1" });
  });

  test("null value deletes the key", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.settings.upsert({
      group: "general",
      values: { site_title: "v1", tagline: "t1" },
    });
    const after = await h.client.settings.upsert({
      group: "general",
      values: { tagline: null },
    });
    expect(after).toEqual({ site_title: "v1" });
  });

  test("group isolation: upsert on one group doesn't touch another", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.settings.upsert({
      group: "general",
      values: { site_title: "G" },
    });
    await h.client.settings.upsert({
      group: "reading",
      values: { per_page: 10 },
    });
    const general = await h.context.db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(eq(settings.group, "general"));
    const reading = await h.context.db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(eq(settings.group, "reading"));
    expect(general.map((r) => r.key)).toEqual(["site_title"]);
    expect(reading.map((r) => r.key)).toEqual(["per_page"]);
  });

  test("fires `settings:group_changed` with the upserts + removed keys", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.settings.upsert({
      group: "general",
      values: { site_title: "v1", tagline: "t1" },
    });
    const spy = h.spyAction("settings:group_changed");
    await h.client.settings.upsert({
      group: "general",
      values: { site_title: "v2", tagline: null },
    });
    spy.assertCalledOnce();
    const [changes] = spy.lastArgs ?? [];
    expect(changes).toEqual({
      group: "general",
      set: { site_title: "v2" },
      removed: ["tagline"],
    });
  });

  test("non-admin is rejected with FORBIDDEN", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(
      h.client.settings.upsert({
        group: "general",
        values: { site_title: "x" },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "settings:manage" },
    });
  });

  test("round-trips non-string JSON values (the column is `mode: json`)", async () => {
    // `value` is stored as JSON, not TEXT; stringifying anywhere would bring
    // booleans, numbers and objects back as strings.
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.settings.upsert({
      group: "general",
      values: {
        count: 42,
        enabled: true,
        config: { nested: { arr: [1, 2] } },
      },
    });
    const bag = await h.client.settings.get({ group: "general" });
    expect(bag).toEqual({
      count: 42,
      enabled: true,
      config: { nested: { arr: [1, 2] } },
    });
  });

  // Registration accepts `[a-zA-Z0-9_:-]+`, so the RPC schema must too, or a
  // key like `og:title` registers but can never be saved.
  test("accepts the same field keys that plugins can register", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const bag = await h.client.settings.upsert({
      group: "seo",
      values: {
        "og:title": "Hello",
        "meta-description": "A page",
        "2fa_enabled": "yes",
      },
    });
    expect(bag).toEqual({
      "og:title": "Hello",
      "meta-description": "A page",
      "2fa_enabled": "yes",
    });
  });

  test("empty values bag is a silent no-op and round-trips the stored bag", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.factory.setting.create({
      group: "general",
      key: "site_title",
      value: "Example",
    });
    const spy = h.spyAction("settings:group_changed");
    const bag = await h.client.settings.upsert({
      group: "general",
      values: {},
    });
    expect(bag).toEqual({ site_title: "Example" });
    // No writes, no action fired.
    expect(spy.calls).toHaveLength(0);
  });

  test("row-level isolation: upsert overwrites without duplicating the PK row", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.settings.upsert({
      group: "general",
      values: { site_title: "v1" },
    });
    await h.client.settings.upsert({
      group: "general",
      values: { site_title: "v2" },
    });
    const rows = await h.context.db
      .select()
      .from(settings)
      .where(
        and(eq(settings.group, "general"), eq(settings.key, "site_title")),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("v2");
  });
});

// Settings have no per-field validation pipeline, but condition-hidden
// fields still must not persist stale values the editor cannot see —
// mirroring the entry/term/user meta skip.
describe("settings.upsert (condition-hidden fields)", () => {
  async function harnessWithConditionalGroup(): Promise<
    Awaited<ReturnType<typeof createRpcHarness>>
  > {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      const layout = select("layout").options(["standard", "video"]);
      ctx.registerSettingsGroup("video", {
        label: "Video",
        fields: [layout, url("videoUrl").visibleWhen(layout.is("video"))],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    return createRpcHarness({ authAs: "admin", plugins: registry, hooks });
  }

  test("a hidden field's value is dropped from the write", async () => {
    const h = await harnessWithConditionalGroup();
    const bag = await h.client.settings.upsert({
      group: "video",
      values: { layout: "standard", videoUrl: "https://example.com/v.mp4" },
    });
    expect(bag).toEqual({ layout: "standard" });
  });

  test("a visible field's value persists", async () => {
    const h = await harnessWithConditionalGroup();
    const bag = await h.client.settings.upsert({
      group: "video",
      values: { layout: "video", videoUrl: "https://example.com/v.mp4" },
    });
    expect(bag).toEqual({
      layout: "video",
      videoUrl: "https://example.com/v.mp4",
    });
  });

  test("unregistered groups keep the laissez-faire write path", async () => {
    const h = await harnessWithConditionalGroup();
    const bag = await h.client.settings.upsert({
      group: "general",
      values: { anything: "goes" },
    });
    expect(bag).toEqual({ anything: "goes" });
  });
});

// Registered fields decode a value to their declared shape, whatever the
// caller's spelling, which is what lets `settings.value` name what it holds.
describe("settings.upsert (field pipeline)", () => {
  async function harnessWithTypedGroup(): Promise<
    Awaited<ReturnType<typeof createRpcHarness>>
  > {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("reading", {
        label: "Reading",
        fields: [
          number("per_page").min(1).max(50),
          text("blurb").maxLength(5),
          text("motto").required(),
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    return createRpcHarness({ authAs: "admin", plugins: registry, hooks });
  }

  test("a registered field stores the value in its declared shape", async () => {
    const h = await harnessWithTypedGroup();
    const bag = await h.client.settings.upsert({
      group: "reading",
      values: { per_page: "10" },
    });
    expect(bag).toEqual({ per_page: 10 });
    const [row] = await h.context.db
      .select({ value: settings.value })
      .from(settings)
      .where(and(eq(settings.group, "reading"), eq(settings.key, "per_page")));
    expect(row?.value).toBe(10);
  });

  test("a value the field cannot hold rejects the whole write", async () => {
    const h = await harnessWithTypedGroup();
    await expect(
      h.client.settings.upsert({
        group: "reading",
        values: { per_page: "not a number", blurb: "ok" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: {
        reason: "settings_invalid_value",
        errors: [{ path: "per_page" }],
      },
    });
    // Nothing partial lands — the sibling key is untouched too.
    expect(await h.client.settings.get({ group: "reading" })).toEqual({});
  });

  test("a declared constraint is enforced, not just the shape", async () => {
    const h = await harnessWithTypedGroup();
    await expect(
      h.client.settings.upsert({
        group: "reading",
        values: { blurb: "far too long" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "settings_invalid_value", errors: [{ path: "blurb" }] },
    });
  });

  test("clearing a required field is rejected, as it is for meta", async () => {
    const h = await harnessWithTypedGroup();
    await expect(
      h.client.settings.upsert({ group: "reading", values: { motto: null } }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "settings_invalid_value", errors: [{ path: "motto" }] },
    });
  });

  test("an unregistered key still stores whatever JSON it was sent", async () => {
    const h = await harnessWithTypedGroup();
    const bag = await h.client.settings.upsert({
      group: "reading",
      values: { orphan: { nested: [1, true, null] } },
    });
    expect(bag).toEqual({ orphan: { nested: [1, true, null] } });
  });

  test("a value with no JSON serialization is rejected", async () => {
    const h = await harnessWithTypedGroup();
    await expect(
      h.client.settings.upsert({
        group: "reading",
        values: { orphan: () => "nope" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "settings_invalid_value", key: "reading.orphan" },
    });
  });
});

// A group ending in `_internal` is server-only storage, like the visitor-IP
// salt; hiding it from a settings page never kept it out of the RPC.
describe("settings private groups", () => {
  test("get refuses a group the RPC does not serve", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.factory.setting.create({
      group: "forms_internal",
      key: "ip_salt",
      value: "8f14e45fceea167a5a36dedd4bea2543",
    });

    await expect(
      h.client.settings.get({ group: "forms_internal" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "settings_group_private" },
    });
  });

  test("upsert refuses to write one", async () => {
    const h = await createRpcHarness({ authAs: "admin" });

    await expect(
      h.client.settings.upsert({
        group: "comments_internal",
        values: { ip_salt: "0" },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "settings_group_private" },
    });
    expect(
      await h.db
        .select()
        .from(settings)
        .where(eq(settings.group, "comments_internal")),
    ).toEqual([]);
  });
});

// A group counts as created on its first save: before it, reads use its fields'
// starting values; after it, storage alone. The save leaves an unread marker
// row.
describe("settings groups: created on first save", () => {
  async function harnessWithDefaults(): Promise<
    Awaited<ReturnType<typeof createRpcHarness>>
  > {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("blog", {
        label: "Blog",
        fields: [
          text("tagline").default("Hello"),
          number("perPage").default(10),
          text("footer"),
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    return createRpcHarness({ authAs: "admin", plugins: registry, hooks });
  }

  async function storedRows(h: Awaited<ReturnType<typeof createRpcHarness>>) {
    const rows = await h.db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(eq(settings.group, "blog"));
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  test("a group never saved reads its fields' starting values", async () => {
    const h = await harnessWithDefaults();
    expect(await h.client.settings.get({ group: "blog" })).toEqual({
      tagline: "Hello",
      perPage: 10,
    });
  });

  test("the first save writes every field, filling unsent keys with their starting values", async () => {
    const h = await harnessWithDefaults();
    const bag = await h.client.settings.upsert({
      group: "blog",
      values: { tagline: "Mine" },
    });

    expect(bag).toEqual({ tagline: "Mine", perPage: 10 });
    expect(await storedRows(h)).toEqual({
      tagline: "Mine",
      perPage: 10,
      __plumix_created: true,
    });
  });

  test("a setting cleared in the first save stays cleared", async () => {
    const h = await harnessWithDefaults();
    await h.client.settings.upsert({
      group: "blog",
      values: { perPage: null },
    });

    expect(await storedRows(h)).toEqual({
      tagline: "Hello",
      __plumix_created: true,
    });
    expect(await h.client.settings.get({ group: "blog" })).toEqual({
      tagline: "Hello",
    });
  });

  test("after the first save a cleared setting stays cleared", async () => {
    const h = await harnessWithDefaults();
    await h.client.settings.upsert({ group: "blog", values: {} });
    await h.client.settings.upsert({
      group: "blog",
      values: { perPage: null },
    });

    expect(await h.client.settings.get({ group: "blog" })).toEqual({
      tagline: "Hello",
    });
  });

  test("the marker never reaches settings.get or its output filter", async () => {
    const h = await harnessWithDefaults();
    await h.client.settings.upsert({ group: "blog", values: {} });
    const spy = h.spyFilter("rpc:settings.get:output");

    const bag = await h.client.settings.get({ group: "blog" });

    expect(bag).not.toHaveProperty("__plumix_created");
    expect(spy.lastInput).not.toHaveProperty("__plumix_created");
  });

  test("the marker never reaches the server-side settings read", async () => {
    const h = await harnessWithDefaults();
    await h.client.settings.upsert({ group: "blog", values: {} });

    const groups = await loadSettingsGroups(h.context, ["blog"]);

    expect(groups.blog).toEqual({ tagline: "Hello", perPage: 10 });
  });

  // The group comes into existence on its first save; only the settings form
  // pre-fills its starting values before then.
  test("the server-side read of a group never saved answers nothing", async () => {
    const h = await harnessWithDefaults();

    const groups = await loadSettingsGroups(h.context, ["blog"]);

    expect(groups.blog).toBeUndefined();
  });

  test("the server-side read of a created group answers storage alone", async () => {
    const h = await harnessWithDefaults();
    await h.client.settings.upsert({ group: "blog", values: {} });
    await h.client.settings.upsert({
      group: "blog",
      values: { tagline: null, perPage: null },
    });

    const groups = await loadSettingsGroups(h.context, ["blog"]);

    expect(groups.blog).toEqual({});
  });

  // Only the marker makes a group created, so rows written without one still
  // read starting values under what is stored until the first save.
  test("a group with rows but no marker is not created until its first save", async () => {
    const h = await harnessWithDefaults();
    await h.factory.setting.create({
      group: "blog",
      key: "tagline",
      value: "Legacy",
    });

    expect(await h.client.settings.get({ group: "blog" })).toEqual({
      tagline: "Legacy",
      perPage: 10,
    });
    await h.client.settings.upsert({
      group: "blog",
      values: { footer: "(c)" },
    });
    expect(await storedRows(h)).toEqual({
      tagline: "Legacy",
      perPage: 10,
      footer: "(c)",
      __plumix_created: true,
    });
  });

  test("a save cannot clear or overwrite the marker", async () => {
    const h = await harnessWithDefaults();
    await h.client.settings.upsert({ group: "blog", values: {} });
    await h.client.settings.upsert({
      group: "blog",
      values: { __plumix_created: null, perPage: null },
    });
    expect((await storedRows(h)).__plumix_created).toBe(true);

    await h.client.settings.upsert({
      group: "blog",
      values: { __plumix_created: "x" },
    });
    expect((await storedRows(h)).__plumix_created).toBe(true);
  });

  // The marker is what keeps a group created once every setting in it has
  // been cleared.
  test("a group whose every setting was cleared stays created", async () => {
    const h = await harnessWithDefaults();
    await h.client.settings.upsert({ group: "blog", values: {} });
    await h.client.settings.upsert({
      group: "blog",
      values: { tagline: null, perPage: null },
    });

    expect(await h.client.settings.get({ group: "blog" })).toEqual({});
  });
});

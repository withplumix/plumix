import { afterEach, describe, expect, test, vi } from "vitest";

import { acquireEditLease, readEditLease } from "../../../db/edit-lease.js";
import { and, eq } from "../../../db/index.js";
import { settings } from "../../../db/schema/settings.js";
import { HookRegistry } from "../../../hooks/registry.js";
import { definePlugin } from "../../../plugin/define.js";
import { number, select, text, url } from "../../../plugin/fields/index.js";
import { installPlugins } from "../../../runtime/install-plugins.js";
import { loadSettingsGroups } from "../../../seo/site-settings.js";
import { adminUser } from "../../../test/factories.js";
import { createRpcHarness } from "../../../test/rpc.js";

type Harness = Awaited<ReturnType<typeof createRpcHarness>>;

/** Saves from the group as it stands, the way a settings card does. */
async function saveCurrent(
  h: Harness,
  input: { readonly group: string; readonly values: Record<string, unknown> },
) {
  const { etag } = await h.client.settings.get({ group: input.group });
  const saved = await h.client.settings.upsert({ ...input, ifMatch: etag });
  return saved.values;
}

describe("settings.get", () => {
  test("admin reads an empty group as an empty bag", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const { values: bag } = await h.client.settings.get({ group: "general" });
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
    const { values: bag } = await h.client.settings.get({ group: "general" });
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
    expect((await h.client.settings.get({ group: "general" })).values).toEqual({
      site_title: "G",
    });
    expect((await h.client.settings.get({ group: "reading" })).values).toEqual({
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
    const result = await saveCurrent(h, {
      group: "general",
      values: { site_title: "Example", tagline: "A site" },
    });
    expect(result).toEqual({ site_title: "Example", tagline: "A site" });
  });

  test("partial patch: unmentioned keys survive", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await saveCurrent(h, {
      group: "general",
      values: { site_title: "v1", tagline: "t1" },
    });
    const after = await saveCurrent(h, {
      group: "general",
      values: { site_title: "v2" },
    });
    expect(after).toEqual({ site_title: "v2", tagline: "t1" });
  });

  test("null value deletes the key", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await saveCurrent(h, {
      group: "general",
      values: { site_title: "v1", tagline: "t1" },
    });
    const after = await saveCurrent(h, {
      group: "general",
      values: { tagline: null },
    });
    expect(after).toEqual({ site_title: "v1" });
  });

  test("group isolation: upsert on one group doesn't touch another", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await saveCurrent(h, {
      group: "general",
      values: { site_title: "G" },
    });
    await saveCurrent(h, {
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
    expect(general.map((r) => r.key).sort()).toEqual([
      "__plumix_created",
      "site_title",
    ]);
    expect(reading.map((r) => r.key).sort()).toEqual([
      "__plumix_created",
      "per_page",
    ]);
  });

  test("fires `settings:group_changed` with the upserts + removed keys", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await saveCurrent(h, {
      group: "general",
      values: { site_title: "v1", tagline: "t1" },
    });
    const spy = h.spyAction("settings:group_changed");
    await saveCurrent(h, {
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
      saveCurrent(h, {
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
    await saveCurrent(h, {
      group: "general",
      values: {
        count: 42,
        enabled: true,
        config: { nested: { arr: [1, 2] } },
      },
    });
    const { values: bag } = await h.client.settings.get({ group: "general" });
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
    const bag = await saveCurrent(h, {
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
    const bag = await saveCurrent(h, {
      group: "general",
      values: {},
    });
    expect(bag).toEqual({ site_title: "Example" });
    // No writes, no action fired.
    expect(spy.calls).toHaveLength(0);
  });

  test("row-level isolation: upsert overwrites without duplicating the PK row", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await saveCurrent(h, {
      group: "general",
      values: { site_title: "v1" },
    });
    await saveCurrent(h, {
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
    const bag = await saveCurrent(h, {
      group: "video",
      values: { layout: "standard", videoUrl: "https://example.com/v.mp4" },
    });
    expect(bag).toEqual({ layout: "standard" });
  });

  test("a visible field's value persists", async () => {
    const h = await harnessWithConditionalGroup();
    const bag = await saveCurrent(h, {
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
    const bag = await saveCurrent(h, {
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
    const bag = await saveCurrent(h, {
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
      saveCurrent(h, {
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
    expect((await h.client.settings.get({ group: "reading" })).values).toEqual(
      {},
    );
  });

  test("a declared constraint is enforced, not just the shape", async () => {
    const h = await harnessWithTypedGroup();
    await expect(
      saveCurrent(h, {
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
      saveCurrent(h, { group: "reading", values: { motto: null } }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "settings_invalid_value", errors: [{ path: "motto" }] },
    });
  });

  test("an unregistered key still stores whatever JSON it was sent", async () => {
    const h = await harnessWithTypedGroup();
    const bag = await saveCurrent(h, {
      group: "reading",
      values: { orphan: { nested: [1, true, null] } },
    });
    expect(bag).toEqual({ orphan: { nested: [1, true, null] } });
  });

  test("a value with no JSON serialization is rejected", async () => {
    const h = await harnessWithTypedGroup();
    await expect(
      saveCurrent(h, {
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
        ifMatch: "0",
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
    expect((await h.client.settings.get({ group: "blog" })).values).toEqual({
      tagline: "Hello",
      perPage: 10,
    });
  });

  test("the first save writes every field, filling unsent keys with their starting values", async () => {
    const h = await harnessWithDefaults();
    const bag = await saveCurrent(h, {
      group: "blog",
      values: { tagline: "Mine" },
    });

    expect(bag).toEqual({ tagline: "Mine", perPage: 10 });
    expect(await storedRows(h)).toEqual({
      tagline: "Mine",
      perPage: 10,
      __plumix_created: 1,
    });
  });

  test("a setting cleared in the first save stays cleared", async () => {
    const h = await harnessWithDefaults();
    await saveCurrent(h, {
      group: "blog",
      values: { perPage: null },
    });

    expect(await storedRows(h)).toEqual({
      tagline: "Hello",
      __plumix_created: 1,
    });
    expect((await h.client.settings.get({ group: "blog" })).values).toEqual({
      tagline: "Hello",
    });
  });

  test("after the first save a cleared setting stays cleared", async () => {
    const h = await harnessWithDefaults();
    await saveCurrent(h, { group: "blog", values: {} });
    await saveCurrent(h, {
      group: "blog",
      values: { perPage: null },
    });

    expect((await h.client.settings.get({ group: "blog" })).values).toEqual({
      tagline: "Hello",
    });
  });

  test("the marker never reaches settings.get or its output filter", async () => {
    const h = await harnessWithDefaults();
    await saveCurrent(h, { group: "blog", values: {} });
    const spy = h.spyFilter("rpc:settings.get:output");

    const { values: bag } = await h.client.settings.get({ group: "blog" });

    expect(bag).not.toHaveProperty("__plumix_created");
    expect(spy.lastInput?.values).not.toHaveProperty("__plumix_created");
  });

  test("the marker never reaches the server-side settings read", async () => {
    const h = await harnessWithDefaults();
    await saveCurrent(h, { group: "blog", values: {} });

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
    await saveCurrent(h, { group: "blog", values: {} });
    await saveCurrent(h, {
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

    expect((await h.client.settings.get({ group: "blog" })).values).toEqual({
      tagline: "Legacy",
      perPage: 10,
    });
    await saveCurrent(h, {
      group: "blog",
      values: { footer: "(c)" },
    });
    expect(await storedRows(h)).toEqual({
      tagline: "Legacy",
      perPage: 10,
      footer: "(c)",
      __plumix_created: 1,
    });
  });

  test("a save cannot clear or overwrite the marker", async () => {
    const h = await harnessWithDefaults();
    await saveCurrent(h, { group: "blog", values: {} });
    await saveCurrent(h, {
      group: "blog",
      values: { __plumix_created: null, perPage: null },
    });
    expect((await storedRows(h)).__plumix_created).toBe(2);

    await saveCurrent(h, {
      group: "blog",
      values: { __plumix_created: "x" },
    });
    expect((await storedRows(h)).__plumix_created).toBe(3);
  });

  // The marker is what keeps a group created once every setting in it has
  // been cleared.
  test("a group whose every setting was cleared stays created", async () => {
    const h = await harnessWithDefaults();
    await saveCurrent(h, { group: "blog", values: {} });
    await saveCurrent(h, {
      group: "blog",
      values: { tagline: null, perPage: null },
    });

    expect((await h.client.settings.get({ group: "blog" })).values).toEqual({});
  });
});
describe("settings group concurrency", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a group never saved reads with etag 0", async () => {
    const h = await createRpcHarness({ authAs: "admin" });

    const copy = await h.client.settings.get({ group: "general" });

    expect(copy).toEqual({ etag: "0", values: {} });
  });

  test("a save without ifMatch is refused with where to find the etag", async () => {
    const h = await createRpcHarness({ authAs: "admin" });

    await expect(
      // @ts-expect-error -- the caller left out its copy's token
      h.client.settings.upsert({ group: "general", values: { tagline: "x" } }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: {
        issues: [
          {
            message:
              "Send the settings group's `etag` from `settings.get` as `ifMatch`",
          },
        ],
      },
    });
  });

  test("each save answers a later etag, chained from the last one's", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-19T12:00:00Z") });
    const h = await createRpcHarness({ authAs: "admin" });

    const first = await h.client.settings.upsert({
      group: "general",
      values: { tagline: "a" },
      ifMatch: "0",
    });
    const second = await h.client.settings.upsert({
      group: "general",
      values: { tagline: "b" },
      ifMatch: first.etag,
    });
    const third = await h.client.settings.upsert({
      group: "general",
      values: {},
      ifMatch: second.etag,
    });

    expect([first.etag, second.etag, third.etag]).toEqual(["1", "2", "3"]);
  });

  test("a save from a stale copy is refused and writes no key", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.settings.upsert({
      group: "general",
      values: { tagline: "theirs" },
      ifMatch: "0",
    });

    await expect(
      h.client.settings.upsert({
        group: "general",
        values: { tagline: "mine", site_title: "Mine" },
        ifMatch: "0",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: "1" },
    });
    expect(await h.client.settings.get({ group: "general" })).toEqual({
      etag: "1",
      values: { tagline: "theirs" },
    });
  });

  test("of two first saves racing, one lands and the other conflicts", async () => {
    const h = await createRpcHarness({ authAs: "admin" });

    const results = await Promise.allSettled([
      h.client.settings.upsert({
        group: "general",
        values: { tagline: "a" },
        ifMatch: "0",
      }),
      h.client.settings.upsert({
        group: "general",
        values: { tagline: "b" },
        ifMatch: "0",
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({
      reason: {
        code: "CONFLICT",
        data: { reason: "etag_mismatch", etag: "1" },
      },
    });
  });

  test("a group saved before its marker counted reads as etag 0 and saves from it", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.factory.setting.create({
      group: "general",
      key: "__plumix_created",
      value: true,
    });
    await h.factory.setting.create({
      group: "general",
      key: "tagline",
      value: "old",
    });
    const copy = await h.client.settings.get({ group: "general" });

    const saved = await h.client.settings.upsert({
      group: "general",
      values: { tagline: "new" },
      ifMatch: copy.etag,
    });

    expect([copy.etag, saved.etag]).toEqual(["0", "1"]);
    expect(saved.values).toEqual({ tagline: "new" });
  });

  test("another admin's save while one holds the group's lease is refused with who holds it", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const ada = await adminUser.transient({ db: h.db }).create({ name: "Ada" });
    const since = new Date();
    await acquireEditLease(
      h.db,
      { kind: "settings_group", id: "general" },
      { userId: ada.id, surface: "admin" },
      since,
    );

    await expect(
      h.client.settings.upsert({
        group: "general",
        values: { tagline: "mine" },
        ifMatch: "0",
      }),
    ).rejects.toMatchObject({
      code: "LOCKED",
      data: { holder: { id: ada.id, name: "Ada" }, since },
    });
    expect((await h.client.settings.get({ group: "general" })).values).toEqual(
      {},
    );
  });

  test("a save that takes over the group's lease lands and holds it", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const ada = await adminUser.transient({ db: h.db }).create({ name: "Ada" });
    await acquireEditLease(
      h.db,
      { kind: "settings_group", id: "general" },
      { userId: ada.id, surface: "admin" },
    );

    const saved = await h.client.settings.upsert({
      group: "general",
      values: { tagline: "mine" },
      ifMatch: "0",
      takeOver: true,
    });

    expect(saved.values).toEqual({ tagline: "mine" });
    expect(
      (await readEditLease(h.db, { kind: "settings_group", id: "general" }))
        ?.holder.id,
    ).toBe(h.user.id);
  });

  test("a stale save names who holds the group's lease in its conflict", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const ada = await adminUser.transient({ db: h.db }).create({ name: "Ada" });
    await h.client.settings.upsert({
      group: "general",
      values: { tagline: "first" },
      ifMatch: "0",
    });
    await acquireEditLease(
      h.db,
      { kind: "settings_group", id: "general" },
      { userId: ada.id, surface: "admin" },
    );

    await expect(
      h.client.settings.upsert({
        group: "general",
        values: { tagline: "mine" },
        ifMatch: "0",
        takeOver: true,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", holder: { id: h.user.id } },
    });
  });
});

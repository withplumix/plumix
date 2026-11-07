import { describe, expect, test } from "vitest";

import { and, eq } from "../../src/db/index.js";
import { settings } from "../../src/db/schema/settings.js";
import { settings as settingsEvents } from "../../src/hooks/settings.js";
import { definePlugin } from "../../src/plugin/define.js";
import { select, url } from "../../src/plugin/fields/index.js";
import { testSite } from "../../src/test/site.js";

const videoSettings = definePlugin("video", {
  setup: (ctx) => {
    const layout = select("layout").options(["standard", "video"]);
    ctx.registerSettingsGroup("video", {
      label: "Video",
      fields: [layout, url("videoUrl").visibleWhen(layout.is("video"))],
    });
  },
});

const site = await testSite({ plugins: [videoSettings] });

/** Saves from the group as it stands, the way a settings card does. */
async function saveCurrent(input: {
  readonly group: string;
  readonly values: Record<string, unknown>;
}) {
  const admin = site.actingAs("admin");
  const { etag } = await admin.rpc.settings.get({ group: input.group });
  const saved = await admin.rpc.settings.upsert({ ...input, ifMatch: etag });
  return saved.values;
}

describe("saving a settings group", () => {
  test("writes new keys and answers them back", async () => {
    const result = await saveCurrent({
      group: "general",
      values: { site_title: "Example", tagline: "A site" },
    });

    expect(result).toEqual({ site_title: "Example", tagline: "A site" });
  });

  test("keeps the keys it doesn't mention", async () => {
    await saveCurrent({
      group: "general",
      values: { site_title: "v1", tagline: "t1" },
    });

    const after = await saveCurrent({
      group: "general",
      values: { site_title: "v2" },
    });

    expect(after).toEqual({ site_title: "v2", tagline: "t1" });
  });

  test("deletes a key saved as null", async () => {
    await saveCurrent({
      group: "general",
      values: { site_title: "v1", tagline: "t1" },
    });

    const after = await saveCurrent({
      group: "general",
      values: { tagline: null },
    });

    expect(after).toEqual({ site_title: "v1" });
  });

  test("leaves every other group's rows alone", async () => {
    await saveCurrent({ group: "general", values: { site_title: "G" } });

    await saveCurrent({ group: "reading", values: { per_page: 10 } });

    const general = await site.context.db
      .select({ key: settings.key })
      .from(settings)
      .where(eq(settings.group, "general"));
    const reading = await site.context.db
      .select({ key: settings.key })
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

  test("announces the group's upserts and removed keys", async () => {
    await saveCurrent({
      group: "general",
      values: { site_title: "v1", tagline: "t1" },
    });

    await saveCurrent({
      group: "general",
      values: { site_title: "v2", tagline: null },
    });

    expect(site.events.emitted(settingsEvents.groupChanged)).toEqual([
      {
        group: "general",
        set: { site_title: "v1", tagline: "t1" },
        removed: [],
      },
      { group: "general", set: { site_title: "v2" }, removed: ["tagline"] },
    ]);
  });

  test("by a caller who can't manage settings is forbidden", async () => {
    await expect(
      site.actingAs("editor").rpc.settings.upsert({
        group: "general",
        values: { site_title: "x" },
        ifMatch: "0",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "settings:manage" },
    });
  });

  test("round-trips non-string JSON values (the column is `mode: json`)", async () => {
    // `value` is stored as JSON, not TEXT; stringifying anywhere would bring
    // booleans, numbers and objects back as strings.
    await saveCurrent({
      group: "general",
      values: { count: 42, enabled: true, config: { nested: { arr: [1, 2] } } },
    });

    const { values } = await site
      .actingAs("admin")
      .rpc.settings.get({ group: "general" });

    expect(values).toEqual({
      count: 42,
      enabled: true,
      config: { nested: { arr: [1, 2] } },
    });
  });

  // Registration accepts `[a-zA-Z0-9_:-]+`, so the RPC schema must too, or a
  // key like `og:title` registers but can never be saved.
  test("accepts the same field keys that plugins can register", async () => {
    const values = await saveCurrent({
      group: "seo",
      values: {
        "og:title": "Hello",
        "meta-description": "A page",
        "2fa_enabled": "yes",
      },
    });

    expect(values).toEqual({
      "og:title": "Hello",
      "meta-description": "A page",
      "2fa_enabled": "yes",
    });
  });

  test("an empty bag writes nothing and answers the stored bag", async () => {
    await site.factory.setting.create({
      group: "general",
      key: "site_title",
      value: "Example",
    });

    const values = await saveCurrent({ group: "general", values: {} });

    expect(values).toEqual({ site_title: "Example" });
    site.events.assertNotEmitted(settingsEvents.groupChanged);
  });

  test("overwrites a key without duplicating its row", async () => {
    await saveCurrent({ group: "general", values: { site_title: "v1" } });

    await saveCurrent({ group: "general", values: { site_title: "v2" } });

    const rows = await site.context.db
      .select()
      .from(settings)
      .where(
        and(eq(settings.group, "general"), eq(settings.key, "site_title")),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("v2");
  });

  // A group ending in `_internal` is server-only storage, like the visitor-IP
  // salt; hiding it from a settings page never kept it out of the RPC.
  test("to a private group is refused and writes nothing", async () => {
    await expect(
      site.actingAs("admin").rpc.settings.upsert({
        group: "comments_internal",
        values: { ip_salt: "0" },
        ifMatch: "0",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "settings_group_private" },
    });
    expect(
      await site.context.db
        .select()
        .from(settings)
        .where(eq(settings.group, "comments_internal")),
    ).toEqual([]);
  });
});

// Settings have no per-field validation pipeline, but condition-hidden
// fields still must not persist stale values the editor cannot see,
// mirroring the entry/term/user meta skip.
describe("saving a settings group with condition-hidden fields", () => {
  test("drops a hidden field's value from the write", async () => {
    const values = await saveCurrent({
      group: "video",
      values: { layout: "standard", videoUrl: "https://example.com/v.mp4" },
    });

    expect(values).toEqual({ layout: "standard" });
  });

  test("keeps a visible field's value", async () => {
    const values = await saveCurrent({
      group: "video",
      values: { layout: "video", videoUrl: "https://example.com/v.mp4" },
    });

    expect(values).toEqual({
      layout: "video",
      videoUrl: "https://example.com/v.mp4",
    });
  });

  test("of a group nobody registered writes whatever it was sent", async () => {
    const values = await saveCurrent({
      group: "general",
      values: { anything: "goes" },
    });

    expect(values).toEqual({ anything: "goes" });
  });
});

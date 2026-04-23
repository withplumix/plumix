import { describe, expect, test } from "vitest";

import { and, eq } from "../../../db/index.js";
import { settings } from "../../../db/schema/settings.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("settings.get", () => {
  test("admin reads an empty group as an empty bag", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const bag = await h.client.settings.get({ group: "general" });
    expect(bag).toEqual({});
  });

  test("admin reads saved keys back", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.context.db.insert(settings).values([
      { group: "general", key: "site_title", value: "Example" },
      { group: "general", key: "tagline", value: "A site" },
    ]);
    const bag = await h.client.settings.get({ group: "general" });
    expect(bag).toEqual({ site_title: "Example", tagline: "A site" });
  });

  test("group scoping: only the requested group is returned", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.context.db.insert(settings).values([
      { group: "general", key: "site_title", value: "G" },
      { group: "reading", key: "per_page", value: "10" },
    ]);
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
    // Locks in the contract that `value` is stored as JSON, not TEXT.
    // If someone ever drops `mode: "json"` or stringifies at the app
    // layer, booleans / numbers / objects would come back as strings
    // and this assertion would flip.
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

  // Regression: the registration-time field regex is permissive
  // (`[a-zA-Z0-9_:-]+`), matching the meta-box surface. Before #67 the
  // RPC input schema only accepted `[a-z][a-z0-9_]*`, so a plugin that
  // registered a field key like `og:title` would pass registration but
  // every save request would fail at the valibot schema — dead-code
  // field. This locks in that value keys accept the full meta regex.
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
    await h.context.db
      .insert(settings)
      .values([{ group: "general", key: "site_title", value: "Example" }]);
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
